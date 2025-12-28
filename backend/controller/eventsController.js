import sql from "mssql";
import { getPool } from "../config/db.js";

export const receiveEvent = async (req, res) => {
  try {
    const {
      FoId,
      Action_Name,
      StopId,
      EventLog,
      EventLat
    } = req.body;

    // 🔒 Basic validation
    if (!FoId) {
      return res.status(400).json({
        error: "FoId required"
      });
    }

    const pool = await getPool();

    await pool.request()
      .input("FoId", sql.NVarChar, FoId)
      .input("Action_Name", sql.NVarChar, Action_Name)
      .input("StopId", sql.NVarChar, StopId) 
      .input("EventLog", sql.NVarChar, EventLog)
      .input("EventLat", sql.NVarChar, EventLat)

      .query(`
        INSERT INTO Events (
          FoId,
          Action_Name,
          StopId,
          EventLog,
          EventLat
        )
        VALUES (
          @FoId,
          @Action_Name,
          @StopId,
          @EventLog,
          @EventLat
        )
      `);

    res.status(201).json({
      status: "STORED",
      foId: FoId
    });

  } catch (err) {
    console.error("❌ Failed to store event:", err);
    res.status(500).json({
      error: "Failed to store event"
    });
  }
};
