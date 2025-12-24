import sql from "mssql";
import dotenv from "dotenv";

dotenv.config();

const config = {
  server: process.env.DB_SERVER,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  options: {
    encrypt: true,
    trustServerCertificate: false
  }
};

let pool;

export async function getPool() {
  if (!pool) {
    pool = await sql.connect(config);
    console.log("✅ Azure SQL Connected");
  }
  return pool;
}

export { sql };
