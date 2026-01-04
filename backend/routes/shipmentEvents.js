// routes/shipmentEvents.js
import express from "express";
import { getPool } from "../config/db.js";

//const router = express.Router();

/**
 * GET /api/shipmentEvents
 */
router.get("/shipment-events", async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request().query(`
      SELECT * FROM dbo.FreightOrderDetails
    `);
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
// routes/tracking.routes.js
router.get("/tracking-data/:foId", async (req, res) => {
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
    res.status(500).json({ error: "Failed to fetch tracking header" });
  }
});

//export default router;
