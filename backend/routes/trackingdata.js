import express from "express";
import { getPool } from "../config/db.js";

const router = express.Router();

/**
 * GET /api/tracking-data?key=XXXX
 * Fetch tracking data by ShipmentNo OR ContainerNumber
 */
router.get("/tracking-data", async (req, res) => {
  const { key } = req.query;

  if (!key) {
    return res.status(400).json({ error: "Missing key" });
  }

  try {
    const pool = await getPool();
    const result = await pool
      .request()
      .input("key", key)
      .query(`
        SELECT *
        FROM dbo.TrackingData
        WHERE ShipmentNo = @key
           OR ContainerNumber = @key
      `);

    res.json(result.recordset);
  } catch (err) {
    console.error("TrackingData error:", err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
