const { connectDB, sql } = require("../config/db");

const TABLE = process.env.EVENT_LOG_TABLE || "TmEventLog";

async function insertTmEvent({ FoId, Action, StopId, status, tmPayload }) {
  try {
    const pool = await connectDB();
    const request = pool.request();
    request.input("FoId", sql.VarChar, FoId ?? null);
    request.input("Action", sql.VarChar, Action ?? null);
    request.input("StopId", sql.VarChar, StopId ?? null);
    request.input("Status", sql.VarChar, status ?? null);
    request.input("Payload", sql.NVarChar(sql.MAX), tmPayload ? JSON.stringify(tmPayload) : null);

    await request.query(
      `INSERT INTO ${TABLE} (FoId, Action, StopId, Status, Payload, CreatedAt)
       VALUES (@FoId, @Action, @StopId, @Status, @Payload, SYSUTCDATETIME())`
    );
  } catch (err) {
    console.warn("[insertTmEvent] failed to log TM event:", err.message);
  }
}

module.exports = { insertTmEvent };
