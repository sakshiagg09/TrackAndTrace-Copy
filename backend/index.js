import "dotenv/config";
import express from "express";
import cors from "cors";
import { connectDB } from "./config/db.js";
//import tmSyncRoutes from "./routes/tmSync.routes.js";
import "./jobs/tmSync.job.js";
import trackingRoutes from "./routes/trackingdata.js";
import skyRoutes from "./routes/sky.routes.js";

// 🔹 Import route files (one per table)
import shipmentEventsRoutes from "./routes/shipmentEvents.js";
import trackingDataRoutes from "./routes/trackingdata.js";
import uiFieldConfigRoutes from "./routes/ui-fields-config.js";
//import eventsRoutes from "./routes/eventsRoutes.js";
import Events from "./routes/Events.js";
import tmSyncRoutes from "./routes/tmSync.routes.js";


const app = express();
const PORT = process.env.PORT || 5000;
const router = express.Router();
// routes here
export default router;

app.use(cors());
app.use(express.json());

/* -------------------- API ROUTES -------------------- */

app.use("/api/shipment-events", shipmentEventsRoutes);

app.use("/api", trackingDataRoutes);
app.use("/api/ui-fields-config", uiFieldConfigRoutes);
app.use("/api", Events);
// 🔹 NEW ROUTES REGISTERED
app.use("/api", tmSyncRoutes);
//app.use("/api", tmSyncRoutes);
app.use("/api", trackingRoutes);

app.use("/api", skyRoutes);
/* -------------------- HEALTH CHECK -------------------- */
app.get("/api/health", (_req, res) => {
  res.json({ status: "Backend is running 🚀" });
});

/* -------------------- START SERVER -------------------- */
(async () => {
  try {
    await connectDB();
    app.listen(PORT, () => {
      console.log(`🚀 Backend running on http://localhost:${PORT}`);
      console.log(`📦 Shipment Events → /api/shipment-events`);
      console.log(`📍 Tracking Data   → /api/tracking-data`);
      console.log(`🧩 UI Field Config → /api/ui-fields-config`);
    });
  } catch (err) {
    console.error("❌ Failed to start backend:", err);
    process.exit(1);
  }
})();
