import sql from "mssql";

export default async function (context, req) {
  const container = req.query?.container;

  if (!container) {
    context.res = {
      status: 400,
      body: "Missing container parameter. Use ?container=XXXX"
    };
    return;
  }

  try {
    // Use Azure AD authentication connection (from environment variables)
    const pool = await sql.connect({
      server: process.env.DB_SERVER,
      database: process.env.DB_NAME,
      authentication: { type: "azure-active-directory-default" },
      options: { encrypt: true, trustServerCertificate: false }
    });

    const result = await pool.request()
      .input("ContainerNumber", sql.NVarChar, container)
      .query(`
        SELECT *
        FROM ShipmentEvents
        WHERE ContainerNumber = @ContainerNumber
        ORDER BY ActualTime DESC
      `);

    context.res = {
      status: 200,
      jsonBody: result.recordset
    };

  } catch (err) {
    context.log("SQL Error:", err);
    context.res = {
      status: 500,
      jsonBody: { error: err.message }
    };
  }
}
