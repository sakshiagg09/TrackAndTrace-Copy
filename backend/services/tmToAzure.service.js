import axios from "axios";
import sql from "mssql";
import { getPool } from "../config/db.js";
import { parseFinalInfo } from "./tmParser.service.js";

const SAP_BASE = process.env.SAP_BASE_URL;

function deriveStatus(events = []) {
  if (!events.length) return "Planned";
  const last = events[events.length - 1];
  if (last.stopseqpos === "L" && last.event === "ARRIVAL") return "Delivered";
  return "In Transit";
}

export async function syncTMToAzure() {
  const pool = await getPool();

  const res = await axios.get(
    `${SAP_BASE}/SearchFOSet?$format=json`,
    {
      headers: {
        Authorization: `Basic ${process.env.SAP_BASIC}`,
        Accept: "application/json"
      }
    }
  );

  const fos = res.data?.d?.results ?? [];
  let count = 0;

  for (const fo of fos) {
    const events = parseFinalInfo(fo.FinalInfo);
    if (!events.length) continue;

    const lastEvent = events[events.length - 1];
    const status = deriveStatus(events);

    await pool.request()
      .input("FoId", sql.NVarChar, fo.FoId)
      .input("StopId", sql.NVarChar, lastEvent.stopid)
      .input("StopSeqPos", sql.Char, lastEvent.stopseqpos)
      .input("Event", sql.NVarChar, lastEvent.event)
      .input("LocationType", sql.NVarChar, lastEvent.typeLoc)
      .input("LocId", sql.NVarChar, lastEvent.locid)
      .input("LocationName", sql.NVarChar, lastEvent.name1)
      .input("Street", sql.NVarChar, lastEvent.street)
      .input("PostalCode", sql.NVarChar, lastEvent.postCode1)
      .input("City", sql.NVarChar, lastEvent.city1)
      .input("Region", sql.NVarChar, lastEvent.region)
      .input("Country", sql.NVarChar, lastEvent.country)
      .input("Latitude", sql.Decimal(18, 10), lastEvent.latitude)
      .input("Longitude", sql.Decimal(18, 10), lastEvent.longitude)
      .input("EventTime", sql.DateTime, new Date())
      .input("LicenseNumber", sql.NVarChar, fo.LicenseNumber)
      .input("Status", sql.NVarChar, status)
      .input("LastEvent", sql.NVarChar, lastEvent.event)
      .input("LastEventCity", sql.NVarChar, lastEvent.city1)
      .query(`
        MERGE dbo.FreightOrderDetails T
        USING (SELECT @FoId FoId, @StopId StopId) S
        ON T.FoId = S.FoId AND T.StopId = S.StopId
        WHEN MATCHED THEN
          UPDATE SET
            StopSeqPos=@StopSeqPos,
            Event=@Event,
            LocationType=@LocationType,
            LocId=@LocId,
            LocationName=@LocationName,
            Street=@Street,
            PostalCode=@PostalCode,
            City=@City,
            Region=@Region,
            Country=@Country,
            Latitude=@Latitude,
            Longitude=@Longitude,
            EventTime=@EventTime,
            LicenseNumber=@LicenseNumber,
            Status=@Status,
            LastEvent=@LastEvent,
            LastEventCity=@LastEventCity,
            LastUpdated=GETDATE()
        WHEN NOT MATCHED THEN
          INSERT (
            FoId, StopId, StopSeqPos, Event, LocationType, LocId,
            LocationName, Street, PostalCode, City, Region, Country,
            Latitude, Longitude, EventTime, LicenseNumber,
            Status, LastEvent, LastEventCity, LastUpdated
          )
          VALUES (
            @FoId, @StopId, @StopSeqPos, @Event, @LocationType, @LocId,
            @LocationName, @Street, @PostalCode, @City, @Region, @Country,
            @Latitude, @Longitude, @EventTime, @LicenseNumber,
            @Status, @LastEvent, @LastEventCity, GETDATE()
          );
      `);

    count++;
  }

  return { success: true, count };
}
