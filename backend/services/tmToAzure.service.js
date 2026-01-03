import axios from "axios";
import sql from "mssql";
import { getPool } from "../config/db.js";
import { parseFinalInfo } from "./tmParser.service.js";

const SAP_BASE = process.env.SAP_BASE_URL;

export async function syncTMToAzure() {
  const pool = await getPool();

  // 1️⃣ Call SAP TM
  const sapRes = await axios.get(
    `${SAP_BASE}/SearchFOSet?$format=json`,
    {
      headers: {
        Authorization: `Basic ${process.env.SAP_BASIC}`,
        Accept: "application/json",
      },
    }
  );

  const fos = sapRes.data.d.results;

  // 2️⃣ Loop Freight Orders
  for (const fo of fos) {
    const events = parseFinalInfo(fo.FinalInfo);
    const lastEvent = events.at(-1);

    const status =
      lastEvent?.stopseqpos === "L" && lastEvent?.event === "ARRIVAL"
        ? "Delivered"
        : events.length
        ? "In Transit"
        : "Planned";

    // 3️⃣ Store TrackingData
    await pool.request()
      .input("FoId", sql.NVarChar, fo.FoId)
      .input("LicenseNumber", sql.NVarChar, fo.LicenseNumber || null)
      .input("Status", sql.NVarChar, status)
      .input("LastEvent", sql.NVarChar, lastEvent?.event || null)
      .input("LastEventCity", sql.NVarChar, lastEvent?.city1 || null)
      .query(`
        MERGE TrackingData T
        USING (SELECT @FoId FoId) S
        ON T.FoId = S.FoId
        WHEN MATCHED THEN
          UPDATE SET
            LicenseNumber = @LicenseNumber,
            Status = @Status,
            LastEvent = @LastEvent,
            LastEventCity = @LastEventCity,
            LastUpdated = GETDATE()
        WHEN NOT MATCHED THEN
          INSERT (FoId, LicenseNumber, Status, LastEvent, LastEventCity, LastUpdated)
          VALUES (@FoId, @LicenseNumber, @Status, @LastEvent, @LastEventCity, GETDATE());
      `);

    // 4️⃣ Store Events
    for (const e of events) {
      await pool.request()
        .input("FoId", sql.NVarChar, fo.FoId)
        .input("StopId", sql.NVarChar, e.stopid)
        .input("StopSeqPos", sql.Char, e.stopseqpos)
        .input("Event", sql.NVarChar, e.event)
        .input("LocationType", sql.NVarChar, e.typeLoc)
        .input("LocId", sql.NVarChar, e.locid)
        .input("LocationName", sql.NVarChar, e.name1)
        .input("Street", sql.NVarChar, e.street)
        .input("PostalCode", sql.NVarChar, e.postCode1)
        .input("City", sql.NVarChar, e.city1)
        .input("Region", sql.NVarChar, e.region)
        .input("Country", sql.NVarChar, e.country)
        .input("Latitude", sql.Decimal(18,10), e.latitude)
        .input("Longitude", sql.Decimal(18,10), e.longitude)
        .input("EventTime", sql.DateTime, new Date())
        .query(`
          MERGE Events E
          USING (SELECT @FoId FoId, @StopId StopId) S
          ON E.FoId = S.FoId AND E.StopId = S.StopId
          WHEN MATCHED THEN
            UPDATE SET
              StopSeqPos = @StopSeqPos,
              Event = @Event,
              LocationType = @LocationType,
              LocId = @LocId,
              LocationName = @LocationName,
              Street = @Street,
              PostalCode = @PostalCode,
              City = @City,
              Region = @Region,
              Country = @Country,
              Latitude = @Latitude,
              Longitude = @Longitude,
              EventTime = @EventTime
          WHEN NOT MATCHED THEN
            INSERT (
              FoId, StopId, StopSeqPos, Event, LocationType, LocId,
              LocationName, Street, PostalCode, City, Region, Country,
              Latitude, Longitude, EventTime
            )
            VALUES (
              @FoId, @StopId, @StopSeqPos, @Event, @LocationType, @LocId,
              @LocationName, @Street, @PostalCode, @City, @Region, @Country,
              @Latitude, @Longitude, @EventTime
            );
        `);
    }
  }

  return { success: true, count: fos.length };
}
