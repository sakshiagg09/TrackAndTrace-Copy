import sql from "mssql";
import { getPool } from "../config/db.js";
import { postPODToTM } from "./IntegrationWithTM.js";

export async function receivePOD(req, res) {
  try {
    // ✅ PROPER DESTRUCTURING
    const {
      FoId,
      StopId,
      Discrepency,
      Items
    } = req.body;

    if (!FoId || !StopId) {
      return res.status(400).json({
        error: "FoId and StopId are mandatory"
      });
    }

    // 1️⃣ Store in SKY+ DB (optional)
    try {
      const pool = await getPool();
      await pool.request()
        .input("FoId", sql.NVarChar, FoId)
        .input("StopId", sql.NVarChar, StopId)
        .input("Discrepency", sql.NVarChar, Discrepency ?? "")
        .input("Items", sql.NVarChar(sql.MAX), Items ?? "")
        .query(`
          INSERT INTO dbo.Events
          (FoId, StopId, Discrepency, Items)
          VALUES
          (@FoId, @StopId, @Discrepency, @Items)
        `);
    } catch (dbErr) {
      console.warn("POD DB insert failed (continuing):", dbErr.message);
    }

    // 2️⃣ FORWARD TO TM ✅ (THIS WAS FAILING)
    const tmResponse = await postPODToTM({
      FoId,
      StopId,
      Discrepency,
      Items,
    });

    // 3️⃣ Return TM response back to SKY
    return res.status(200).json(tmResponse);

  } catch (err) {
    console.error("❌ POD ingestion failed", err?.message || err);
    return res.status(500).json({
      error: err?.message || "Failed to process POD"
    });
  }
}
