import express from "express";
import { getPool } from "../config/db.js";

const router = express.Router();

/**
 * GET /api/shipment-events
 */
router.get("/shipment-events", async (req, res) => {
  try {
    const pool = getPool();
    const result = await pool.request().query(`
      SELECT *
      FROM dbo.ShipmentEvents
      ORDER BY ActualTime DESC
    `);

    res.json(result.recordset);
  } catch (err) {
    console.error("ShipmentEvents error:", err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
