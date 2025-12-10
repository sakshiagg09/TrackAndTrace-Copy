require('dotenv').config();
const sql = require('mssql');

console.log('=== Environment Variables ===');
console.log('DB_SERVER:', process.env.DB_SERVER || 'NOT SET');
console.log('DB_NAME:', process.env.DB_NAME || 'NOT SET');
console.log('AZURE_AD_USER:', process.env.AZURE_AD_USER || 'NOT SET');
console.log('AZURE_AD_PASSWORD:', process.env.AZURE_AD_PASSWORD ? '****' : 'NOT SET');
console.log('AZURE_CLIENT_ID:', process.env.AZURE_CLIENT_ID || 'NOT SET');
console.log('=============================\n');

const config = {
  server: process.env.DB_SERVER,
  database: process.env.DB_NAME,
  port: 1433,
  authentication: {
    type: 'azure-active-directory-password',
    options: {
      userName: process.env.AZURE_AD_USER,
      password: process.env.AZURE_AD_PASSWORD,
      clientId: process.env.AZURE_CLIENT_ID,
    },
  },
  options: {
    encrypt: true,
    trustServerCertificate: false,
    connectTimeout: 30000,
  },
};

async function testConnection() {
  try {
    console.log('🔄 Testing connection...\n');
    const pool = await sql.connect(config);
    console.log('✅ Connected successfully!');

    const result = await pool.request().query('SELECT 1 as test');
    console.log('✅ Query result:', result.recordset);

    await pool.close();
    console.log('✅ Connection closed');
  } catch (error) {
    console.error('\n❌ Connection failed!');
    console.error('Error name:', error.name);
    console.error('Error message:', error.message);
    console.error('Error code:', error.code);
    
    if (error.originalError) {
      console.error('Original error:', error.originalError.message);
    }
    
    console.error('\nFull error object:');
    console.error(error);
  }
}

testConnection();