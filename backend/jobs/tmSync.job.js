import cron from "node-cron";
import { syncTMToAzure } from "../services/tmToAzure.service.js";

// Run every 10 minutes
cron.schedule("*/10 * * * *", async () => {
  try {
    console.log("⏳ TM Sync started");
    const result = await syncTMToAzure();
    console.log("✅ TM Sync completed:", result.count);
  } catch (err) {
    console.error("❌ TM Sync failed:", err.message);
  }
});
