import express from "express";
import sql from "mssql";
import { getPool } from "../config/db.js";

const router = express.Router();

/**
 * GET /api/events?foId=XXXX
 * Fetch shipment-level events from Events table
 */
router.get("/", async (req, res) => {
  const { foId } = req.query;

  if (!foId) {
    return res.status(400).json({ error: "Missing foId parameter" });
  }

  try {
    const pool = await getPool(); // ✅ CORRECT

    const result = await pool
      .request()
      .input("FoId", sql.NVarChar, foId)
      .query(`
        SELECT *
        FROM dbo.Events
        WHERE FoId = @FoId
      `);

    res.status(200).json(result.recordset);

  } catch (err) {
    console.error("❌ Events API error:", err);
    res.status(500).json({
      error: "Failed to fetch events",
      details: err.message
    });
  }
});

export default router;
