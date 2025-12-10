//TrackAndTrace/api/ShipmentDetails/index.js
import { requireUser } from "../_shared/auth.js";
import { getPool } from "../_shared/sql.js";

export default async function (context, req) {
  const user = await requireUser(context, req);
  if (!user) return;

  const container = (req.query?.id || "").trim();
  if (!container) {
    context.res = { status: 400, body: "Missing ?id=ContainerNumber" };
    return;
  }

  try {
    const pool = await getPool();
    const result = await pool.request()
      .input("container", container)
      .query(`
        SELECT TOP 1 *
        FROM dbo.TrackingData
        WHERE ContainerNumber = @container
      `);

    context.res = {
      status: 200,
      jsonBody: result.recordset[0] || null
    };
  } catch (err) {
    context.log("SQL Error:", err);
    context.res = { status: 500, body: "Server error loading shipment details" };
  }
}
