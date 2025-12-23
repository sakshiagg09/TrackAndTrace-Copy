import express from "express";
import { getPool } from "../config/db.js";

const router = express.Router();

/**
 * GET /api/tracking-data
 */
router.get("/tracking-data", async (req, res) => {
  try {
    const pool = getPool();
    const result = await pool.request().query(`
      SELECT *
      FROM dbo.TrackingData
    `);

    res.json(result.recordset);
  } catch (err) {
    console.error("TrackingData error:", err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
