import express from "express";
import { getPool } from "../config/db.js";

const router = express.Router();

router.get("/tracking-header/:foId", async (req, res) => {
  const { foId } = req.params;

  try {
    const pool = await getPool();

    const trackingRes = await pool
      .request()
      .input("FoId", foId)
      .query(`
        SELECT *
        FROM dbo.TrackingData
        WHERE FoId = @FoId
      `);

    const eventRes = await pool
      .request()
      .input("FoId", foId)
      .query(`
        SELECT TOP 1 *
        FROM dbo.Events
        WHERE FoId = @FoId
        ORDER BY EventTime DESC
      `);

    res.json({
      ...(trackingRes.recordset[0] || {}),
      ...(eventRes.recordset[0] || {})
    });
  } catch (err) {
    console.error("tracking-header error:", err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
