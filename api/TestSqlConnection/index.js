//  TrackAndTrace/api/TestSqlConnection/index.js
import { getPool } from "../_shared/sql.js";
import { requireUser } from "../_shared/auth.js";

export default async function (context, req) {
  // Validate SSO user
  const user = await requireUser(context, req);
  if (!user) return;

  try {
    const pool = await getPool();
    await pool.query("SELECT 1 AS test");
    context.res = {
      status: 200,
      jsonBody: { success: true, message: "SQL Connected Successfully 🎉" }
    };
  } catch (err) {
    context.log(err);
    context.res = {
      status: 500,
      jsonBody: { success: false, error: err.message }
    };
  }
}
