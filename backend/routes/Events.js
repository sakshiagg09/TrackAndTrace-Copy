import express from "express";
import sql from "mssql";
import { getPool } from "../config/db.js";

const router = express.Router();

/**
 * GET /api/events?key=XXXX
 * key = ShipmentNo OR ContainerNumber
 * Events.FoId stores exactly this value
 */
router.get("/events", async (req, res) => {
  const { key } = req.query;

  if (!key) {
    return res.status(400).json({ error: "Missing key" });
  }

  try {
    const pool = await getPool();

    // ✅ DIRECT MATCH ON FoId
    const result = await pool
      .request()
      .input("key", sql.NVarChar, key)
      .query(`
        SELECT *
        FROM dbo.Events
        WHERE FoId = @key
      `);

    res.json(result.recordset);
  } catch (err) {
    console.error("❌ Events API error:", err);
    res.status(500).json({ error: "Failed to fetch events" });
  }
});

export default router;
