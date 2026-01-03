import express from "express";
import { getPool } from "../config/db.js";

const router = express.Router();

/**
 * GET /api/shipment-events
 */
router.get("/shipment-events", async (req, res) => {
  try {
    const pool = await getPool();

    const query = `
      SELECT *
      FROM dbo.Trackingdata 
    `;

    const result = await pool.request().query(query);

    res.status(200).json(result.recordset);

  } catch (err) {
    console.error("❌ shipment-events SQL error:", err); // IMPORTANT
    res.status(500).json({
      error: "Shipment-events failed",
      details: err.message
    });
  }
});

export default router;
