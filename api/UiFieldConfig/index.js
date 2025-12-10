// api/UiFieldConfig/index.js
import { requireUser } from "../_shared/auth.js";
import { getPool } from "../_shared/sql.js";

export default async function (context, req) {
  // Validate Teams user
  const user = await requireUser(context, req);
  if (!user) return;

  try {
    const pool = await getPool();
    const result = await pool.request()
      .query(`SELECT Title, TechnicalName, Visible FROM dbo.UIFieldConfig ORDER BY TechnicalName`);

    context.res = {
      status: 200,
      jsonBody: result.recordset
    };
  } catch (err) {
    context.log("SQL Error:", err);
    context.res = { status: 500, body: "Server error loading UIFieldConfig" };
  }
}
