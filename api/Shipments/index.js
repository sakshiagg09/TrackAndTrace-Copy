//TrackAndTrace/api/Shipments/index.js
import { requireUser } from "../_shared/auth.js";
import { getPool } from "../_shared/sql.js";

export default async function (context, req) {
  // Validate Teams user
  const user = await requireUser(context, req);
  if (!user) return;

  // Read query param ?top=50 (optional)
  const top = Math.min(Number(req.query?.top || 500), 500);

  try {
    const pool = await getPool();
    const result = await pool.request()
      .input("top", top)
      .query(`
        SELECT TOP (@top) *
        FROM Shipments
        ORDER BY Modified DESC
      `);

    context.res = {
      status: 200,
      jsonBody: result.recordset
    };
  } catch (error) {
    context.log("SQL Error:", error);
    context.res = { status: 500, body: "Server error querying shipments" };
  }
}
