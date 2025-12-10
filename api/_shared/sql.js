//TrackAndTrace/api/_shared/sql.js
import sql from "mssql";

let pool = null;

// Build AAD connection automatically (no username/password!)
export async function getPool() {
  if (pool) return pool;

  pool = await sql.connect({
    server: process.env.DB_SERVER,
    database: process.env.DB_NAME,
    options: {
      encrypt: true,
    },
    authentication: {
      type: "azure-active-directory-default"
    }
  });

  return pool;
}
