require('dotenv').config();
const sql = require('mssql');
const { InteractiveBrowserCredential } = require('@azure/identity');

let pool;
let cachedToken = null;
let tokenExpiry = null;

const getAccessToken = async () => {
  // Check if we have a valid cached token (with 5 min buffer)
  if (cachedToken && tokenExpiry && Date.now() < (tokenExpiry - 300000)) {
    console.log('   Using cached token');
    return cachedToken;
  }

  console.log('🔐 Opening browser for Azure AD login...');

  const credential = new InteractiveBrowserCredential({
    clientId: process.env.AZURE_CLIENT_ID,
    tenantId: process.env.AZURE_TENANT_ID,
  });

  const tokenResponse = await credential.getToken('https://database.windows.net/.default');
  
  cachedToken = tokenResponse.token;
  tokenExpiry = tokenResponse.expiresOnTimestamp;
  
  console.log('✅ Authentication successful');
  return cachedToken;
};

const connectDB = async () => {
  try {
    if (pool) {
      return pool;
    }

    // Validate environment variables
    if (!process.env.AZURE_TENANT_ID) {
      throw new Error('AZURE_TENANT_ID is not set in .env file');
    }

    console.log('🔄 Connecting to Azure SQL Database...');
    console.log('   Server:', process.env.DB_SERVER);
    console.log('   Database:', process.env.DB_NAME);

    const token = await getAccessToken();

    const config = {
      server: process.env.DB_SERVER,
      database: process.env.DB_NAME,
      port: 1433,
      authentication: {
        type: 'azure-active-directory-access-token',
        options: {
          token: token,
        },
      },
      options: {
        encrypt: true,
        trustServerCertificate: false,
        connectTimeout: 30000,
      },
    };

    pool = await sql.connect(config);
    console.log('✅ Connected to Azure SQL Database');
    return pool;
  } catch (error) {
    console.error('❌ Database connection failed:', error.message);
    throw error;
  }
};

const getPool = () => pool;

const closeDB = async () => {
  if (pool) {
    await pool.close();
    pool = null;
    console.log('Database connection closed');
  }
};

module.exports = { connectDB, getPool, closeDB, sql };