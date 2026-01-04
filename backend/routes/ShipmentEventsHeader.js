// routes/trackingHeader.js
import express from "express";
import { getPool } from "../config/db.js";

const router = express.Router();

/**
 * GET /api/tracking-header/:foId
 * Returns header info for one FoId
 */
router.get("/shipment-tracking-data", async (req, res) => {
  const { foId } = req.params;

  try {
    const pool = await getPool();
    const result = await pool.request()
      .input("FoId", foId)
      .query(`
        SELECT *
        FROM dbo.FreightOrderDetails
        WHERE FoId = @FoId
      `);

    res.json(result.recordset[0] ?? null);
  } catch (err) {
    console.error("Tracking Header Error:", err);
    res.status(500).json({ error: "Failed to fetch tracking header" });
  }
});

export default router;
