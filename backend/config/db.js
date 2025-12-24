import sql from "mssql";

let pool;

export async function connectDB() {
  if (pool) return pool;

  pool = await sql.connect({
    server: process.env.DB_SERVER,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    options: {
      encrypt: true,
      trustServerCertificate: false
    }
  });

  console.log("✅ Azure SQL connected");
  return pool;
}

export function getPool() {
  if (!pool) throw new Error("DB not connected");
  return pool;
}
