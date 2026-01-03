import express from "express";
import sql from "mssql";
import { getPool } from "../config/db.js";

const router = express.Router();

/**
 * GET /api/events?foId=XXXX
 * Fetch all events for a Freight Order
 */
router.get("/events", async (req, res) => {
  const { foId } = req.query;

  if (!foId) {
    return res.status(400).json({ error: "Missing foId" });
  }

  try {
    const pool = await getPool();

    const result = await pool
      .request()
      .input("FoId", sql.NVarChar, foId)
      .query(`
        SELECT *
        FROM dbo.Events
        WHERE FoId = @FoId
        ORDER BY EventTime
      `);

    res.json(result.recordset);
  } catch (err) {
    console.error("❌ Events API error:", err);
    res.status(500).json({ error: "Failed to fetch events" });
  }
});

export default router;
