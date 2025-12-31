import express from "express";
import sql from "mssql";
import { getPool } from "../db.js";

const router = express.Router();

router.post("/api/pod", async (req, res) => {
  try {
    const { FoId, Discrepency, StopId, Items } = req.body;

    if (!FoId || !StopId) {
      return res.status(400).json({ error: "FoId and StopId required" });
    }

    const pool = await getPool();

    await pool.request()
      .input("FoId", sql.NVarChar, FoId)
      .input("StopId", sql.NVarChar, StopId)
      .input("Discrepency", sql.NVarChar, Discrepency ?? "")
      .input("Items", sql.NVarChar(sql.MAX), Items ?? "")
      .query(`
        INSERT INTO dbo.Events
        (FoId, StopId, Discrepency, Items)
        VALUES
        (@FoId, @StopId, @Discrepency, @Items)
      `);

    res.status(201).json({
      status: "SUCCESS",
      FoId,
      StopId
    });

  } catch (err) {
    console.error("POD insert failed", err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
