require('dotenv').config();
const express = require('express');
const cors = require('cors');
//const {postEvent} = require('./Connection/ConnectWithTM');
const {getEvent, postEvent} = require('./controller/IntegrationWithTM');
const { connectDB, getPool, closeDB, sql } = require('./config/db');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'Server is running' });
});
//app.post("/api/postEvent", postEvent);
app.get("/api/getEvent/:fo_id", getEvent);
app.post("/api/postEvent", postEvent);
//app.use("/api/tm", tmRoutes);

// Test database
// app.get('/api/test-db', async (req, res) => {
//   try {
//     const pool = getPool();
//     const result = await pool.request().query('SELECT 1 as connected');
//     res.json({
//       success: true,
//       message: 'Database connected successfully',
//       data: result.recordset,
//     });
//   } catch (error) {
//     res.status(500).json({
//       success: false,
//       error: error.message,
//     });
//   }
// });

// Get all tables
// app.get('/api/tables', async (req, res) => {
//   try {
//     const pool = getPool();
//     const result = await pool.request().query(`
//       SELECT TABLE_NAME 
//       FROM INFORMATION_SCHEMA.TABLES 
//       WHERE TABLE_TYPE = 'BASE TABLE'
//     `);
//     res.json({
//       success: true,
//       data: result.recordset,
//     });
//   } catch (error) {
//     res.status(500).json({
//       success: false,
//       error: error.message,
//     });
//   }
// });

// Start server
const startServer = async () => {
  try {
    // await connectDB();
    app.listen(PORT, () => {
      console.log(`🚀 Server running on http://localhost:${PORT}`);
      console.log(`📊 Test DB: http://localhost:${PORT}/api/test-db`);
      console.log(`📋 Tables: http://localhost:${PORT}/api/tables`);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error.message);
    process.exit(1);
  }
};

// Graceful shutdown
// process.on('SIGINT', async () => {
//   console.log('\n🛑 Shutting down...');
//   await closeDB();
//   process.exit(0);
// });

startServer();