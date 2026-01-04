import sql from "mssql";
import { getPool } from "../config/db.js";

function etaStringToDate(eta) {
  if (!eta) return null;

  const s = String(eta).trim();   // 🔑 force string + trim

  if (!/^\d{14}$/.test(s)) {
    console.error("❌ ETA format invalid:", s);
    return null;
  }

  const yyyy = Number(s.substring(0, 4));
  const MM   = Number(s.substring(4, 6)) - 1;
  const dd   = Number(s.substring(6, 8));
  const HH   = Number(s.substring(8, 10));
  const mm   = Number(s.substring(10, 12));
  const ss   = Number(s.substring(12, 14));

  const d = new Date(Date.UTC(yyyy, MM, dd, HH, mm, ss));

  if (isNaN(d.getTime())) {
    console.error("❌ ETA date invalid:", s);
    return null;
  }

  return d;
}

export async function saveSkyEvent(data) {
  const pool = await getPool();

  const etaDate = etaStringToDate(data.ETA);

  console.log("🕒 ETA RAW:", data.ETA);
  console.log("🕒 ETA PARSED:", etaDate);

  await pool.request()
    .input("FoId", sql.NVarChar, data.FoId)
    .input("StopId", sql.NVarChar, data.StopId ?? null)
    .input("Event", sql.NVarChar, data.Event ?? null)
    .input("Action", sql.NVarChar, data.Action ?? null)
    .input("EventCode", sql.NVarChar, data.EventCode ?? null)
    .input("EvtReasonCode", sql.NVarChar, data.EvtReasonCode ?? null)
    .input("Description", sql.NVarChar, data.Description ?? null)
    .input("ETA", sql.DateTime2, etaDate)   // ✅ JS Date
    .input("Discrepency", sql.NVarChar, data.Discrepency ?? null)
    .input("Items", sql.NVarChar(sql.MAX), data.Items ?? null)
    .query(`
      INSERT INTO Events
      (FoId, StopId, Event, Action, EventCode, EvtReasonCode, Description, ETA, Discrepency, Items)
      VALUES
      (@FoId, @StopId, @Event, @Action, @EventCode, @EvtReasonCode, @Description, @ETA, @Discrepency, @Items)
    `);
}
