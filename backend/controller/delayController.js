import sql from "mssql";
import { getPool } from "../config/db.js";
import { postDelayToTM } from "./IntegrationWithTM.js";

/* ✅ helper: convert 20251231132400 → JS Date */
function parseETA(eta) {
  if (!eta || typeof eta !== "string" || eta.length !== 14) return null;

  const yyyy = Number(eta.substring(0, 4));
  const MM   = Number(eta.substring(4, 6)) - 1; // JS month is 0-based
  const dd   = Number(eta.substring(6, 8));
  const HH   = Number(eta.substring(8, 10));
  const mm   = Number(eta.substring(10, 12));
  const ss   = Number(eta.substring(12, 14));

  return new Date(yyyy, MM, dd, HH, mm, ss);
}

export async function receiveDelay(req, res) {
  try {
    const {
      FoId,
      StopId,
      ETA,
      Event,
      EventCode,
      EvtReasonCode,
      Description
    } = req.body;

    if (!FoId || !StopId) {
      return res.status(400).json({
        error: "FoId and StopId are mandatory"
      });
    }

    // ✅ CRITICAL FIX
    const etaDate = parseETA(ETA);

    if (ETA && !etaDate) {
      return res.status(400).json({
        error: "Invalid ETA format. Expected YYYYMMDDHHMMSS"
      });
    }

    // 1️⃣ Store in SKY+ DB
    try {
      const pool = await getPool();
      await pool.request()
        .input("FoId", sql.NVarChar, FoId)
        .input("StopId", sql.NVarChar, StopId)
        .input("ETA", sql.DateTime2, etaDate)   // ✅ FIXED
        .input("Event", sql.NVarChar, Event ?? "")
        .input("EventCode", sql.NVarChar, EventCode ?? "")
        .input("EvtReasonCode", sql.NVarChar, EvtReasonCode ?? "")
        .input("Description", sql.NVarChar, Description ?? "")
        .query(`
          INSERT INTO dbo.Events
          (
            FoId,
            StopId,
            ETA,
            Event,
            EventCode,
            EvtReasonCode,
            Description
          )
          VALUES
          (
            @FoId,
            @StopId,
            @ETA,
            @Event,
            @EventCode,
            @EvtReasonCode,
            @Description
          )
        `);
    } catch (dbErr) {
      console.warn("Delay DB insert failed (continuing):", dbErr.message);
    }

    // 2️⃣ Forward to TM (TM still gets ORIGINAL ETA string)
    const tmResponse = await postDelayToTM({
      FoId,
      StopId,
      ETA, // TM expects this format
      Event,
      EventCode,
      EvtReasonCode,
      Description,
    });

    // 3️⃣ Return TM response
    return res.status(200).json(tmResponse);

  } catch (err) {
    console.error("❌ Delay ingestion failed", err?.message || err);
    return res.status(500).json({
      error: err?.message || "Failed to process Delay event"
    });
  }
}
