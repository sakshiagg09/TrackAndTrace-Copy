import "dotenv/config";
import express from "express";
import cors from "cors";
import { connectDB } from "./config/db.js";

// 🔹 Import route files (one per table)
import shipmentEventsRoutes from "./routes/shipmentEvents.js";
import trackingDataRoutes from "./routes/trackingdata.js";
import uiFieldConfigRoutes from "./routes/uiFieldsconfig.js";
import eventsRoutes from "./routes/eventsRoutes.js";
import Events from "./routes/Events.js";

// 🔹 NEW: POD & Delay routes
import podRoutes from "./routes/podRoutes.js";
import delayRoutes from "./routes/delayRoutes.js";

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

/* -------------------- API ROUTES -------------------- */
app.use("/api", shipmentEventsRoutes);
app.use("/api", trackingDataRoutes);
app.use("/api", uiFieldConfigRoutes);
app.use("/api", eventsRoutes);
app.use("/api", Events);
// 🔹 NEW ROUTES REGISTERED
app.use("/api", podRoutes);
app.use("/api", delayRoutes);
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
