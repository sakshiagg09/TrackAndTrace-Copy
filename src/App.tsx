// src/App.tsx
import React from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";

import "./App.css";
import ShipmentDetailsPage from "./pages/ShipmentDetailsPage";
import ShipmentsList from "../src/pages/ShipmentsListPage";
const API_BASE = import.meta.env.VITE_API_BASE;

function detectBaseName(): string {
  const p = window.location.pathname || "/";
  const indexToken = "/index.html";
  const idx = p.indexOf(indexToken);
  if (idx !== -1) {
    // return the full prefix (including index.html)
    return p.slice(0, idx + indexToken.length) || API_BASE || "/";
  }

  // Otherwise: if last segment looks like a filename (has .) strip it off and use directory
  const parts = p.split("/");
  const last = parts[parts.length - 1] || "";
  if (last.includes(".")) {
    parts.pop();
    return parts.join("/") || "/";
  }

  // Default: app hosted at a folder root or site root — use the pathname itself
  return p || "/";
}

const basename = detectBaseName();

const App: React.FC = () => {
  // eslint-disable-next-line no-console
  const path = window.location.pathname || "/api"; 
  console.log("App rendering — router basename:", basename, "location:", window.location.pathname);

  return (
    <Router basename={basename}>
      <Routes>
        <Route path="/" element={<ShipmentsList />} />
        <Route path="/shipment-tracking-data/:id" element={<ShipmentDetailsPage />} />
      </Routes>
    </Router>
  );
};

export default App;
