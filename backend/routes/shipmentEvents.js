// routes/shipmentEvents.js
import express from "express";
import { getPool } from "../config/db.js";

const router = express.Router();

/**
 * GET /api/shipment-events
 * Returns all shipment rows
 */
router.get("/", async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request().query(`
      SELECT *
      FROM dbo.FreightOrderDetails
    `);

    res.json(result.recordset);
  } catch (err) {
    console.error("Shipment Events Error:", err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
