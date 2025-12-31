import sql from "mssql";
import { getPool } from "../config/db.js";
import { postEventToTM } from "./IntegrationWithTM.js"; // ✅ call TM from here

function toStr(v) {
  if (v === null || v === undefined) return "";
  return String(v).trim();
}
function toNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export const receiveEvent = async (req, res) => {
  try {
    console.log("RAW req.body:", req.body);

    // ✅ Always keep same keys as your CAP eventsReporting entity
    const payload = {
      FoId: toStr(req.body?.FoId),
      Action: toStr(req.body?.Action),
      StopId: toStr(req.body?.StopId),

      EventTime: toStr(req.body?.EventTime),      // "" ok
      TimeZone: toStr(req.body?.TimeZone),        // "" ok
      EventLong: toNum(req.body?.EventLong),      // number
      EventLat: toNum(req.body?.EventLat),        // number

      reasonCode: toStr(req.body?.reasonCode),
      quantity: toStr(req.body?.quantity),        // keep as string (SAP often expects char/decimal text)
      signature: toStr(req.body?.signature),      // base64 or data-url or ""
      podImage: toStr(req.body?.podImage),        // base64 or ""
    };

    console.log("SANITIZED payload:", payload, {
      types: {
        FoId: typeof payload.FoId,
        Action: typeof payload.Action,
        StopId: typeof payload.StopId,
        EventLat: typeof payload.EventLat,
        EventLong: typeof payload.EventLong,
        quantity: typeof payload.quantity,
      },
    });

    // 🔒 Basic validation
    if (!payload.FoId || !payload.Action) {
      return res.status(400).json({ error: "FoId and Action required" });
    }

    // 1) Store in SKY+ DB (optional)
    try {
      const pool = await getPool();
      await pool
        .request()
        .input("FoId", sql.NVarChar, payload.FoId)
        .input("Action", sql.NVarChar, payload.Action)
        .input("StopId", sql.NVarChar, payload.StopId)
        .query(`
          INSERT INTO Events (FoId, Action, StopId)
          VALUES (@FoId, @Action, @StopId)
        `);
    } catch (dbErr) {
      console.warn("DB insert failed (continuing anyway):", dbErr?.message || dbErr);
    }

    // 2) Forward to TM and return TM response back to SKY
    const tmResponse = await postEventToTM(payload);

    return res.status(200).json(tmResponse);
  } catch (err) {
    console.error("❌ Failed in receiveEvent:", err?.response?.data || err?.message || err);
    return res.status(err?.response?.status || 500).json({
      error: err?.response?.data || err?.message || "Failed to forward event to TM",
    });
  }
};
