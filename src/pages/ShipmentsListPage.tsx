import React, { useEffect, useMemo, useState } from "react";
import PageWrapper from "../components/layout/PageWrapper";
import SearchBar from "../components/SearchBar";
import ShipmentsTable from "../components/ShipmentsTable";
import { fetchSimpleFieldConfig } from "../utils/simpleFieldConfig";
import { getAccessToken } from "../utils/graphClient";
import { CircularProgress, Box, Alert, Button, Stack } from "@mui/material";

const ShipmentsListPage: React.FC = () => {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [fieldDefs, setFieldDefs] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [filterMap, setFilterMap] = useState<Record<string, string>>({});

  /* ---------------- LOAD DATA ---------------- */
  useEffect(() => {
    async function loadAll() {
      try {
        const cfg = await fetchSimpleFieldConfig();
        setFieldDefs(cfg ?? []);
      } catch {
        setFieldDefs([]);
      }

      try {
        const token = await getAccessToken();

        const res = await fetch("/api/Shipments", {
          headers: { Authorization: `Bearer ${token}` }
        });

        const data = await res.json();
        setRows(data ?? []);
      } catch (err: any) {
        setError(String(err));
      } finally {
        setLoading(false);
      }
    }

    loadAll();
  }, []);

  /* ---------------- FILTER LOGIC ---------------- */
  const filteredRows = useMemo(() => {
    return rows.filter((r) =>
      Object.entries(filterMap).every(([key, val]) => {
        if (!val) return true;
        const cell = (r.fields?.[key] ?? "").toString().toLowerCase();
        return cell.includes(val.toLowerCase());
      })
    );
  }, [rows, filterMap]);

  /* ---------------- EVENT HANDLER ---------------- */
  async function handleEvent(eventCode: string) {
    const FoId = "6300003096";
    const StopId = "1000000000";
   // const Location = "1000000000";

    /* --- NORMAL EVENTS --- */
    if (["DEPARTURE", "ARRIVAL", "DELAY"].includes(eventCode)) {
      const map: any = { DEPARTURE: "DEPT", ARRIVAL: "ARRV", DELAY: "DELAY" };
      const payload = { FoId, Action: map[eventCode], StopId };

      const res = await fetch("/api/postEvent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      const json = await res.json();
      alert(json.success ? `${eventCode} ✓` : JSON.stringify(json.error));
      return;
     // const payload2 = { FoId, Action: map[eventCode], StopId };
    //  console.log("Frontend payload:", payload2);
    }

    /* --- POD NO DISCREPANCY --- */
    if (eventCode === "POD_NODIS") {
      const payload = { FoId, StopId, Discrepency: "" };

      const res = await fetch("/api/postPOD", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      const json = await res.json();
      alert(json.success ? "POD No Discrepancy ✓" : JSON.stringify(json.error));
      return;
    }

    /* --- POD WITH DISCREPANCY --- */
    /* --- POD WITH DISCREPANCY --- */
/*if (eventCode === "POD_DIS") {
  const resItems = await fetch(`/api/getItems?FoId=${FoId}&Location=${Location}`);
  const itemsJson = await resItems.json();

  if (!itemsJson.success) {
    alert("Failed to fetch items");
    return;
  }

  // ✔ Use ItemId (SAP expects this)
  const items = itemsJson.items.map((it: any) => ({
    item_id: it.ItemId,              // ✔ FIXED
    stop_id: it.StopId,              // ✔ correct SAP stop ID
    ActQty: it.Quantity || "1",      // ✔ send actual quantity
    ActQtyUom: it.QuantityUom || "EA"
  }));

  const payload = {
    FoId,
    StopId,
    Discrepency: "X",
    Items: items        // ✔ DO NOT STRINGIFY
  };

  const res = await fetch("/api/postPOD", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  const json = await res.json();
  alert(json.success ? "POD Discrepancy ✓" : JSON.stringify(json.error));
} */

  /* ------------------ DELAY ------------------ */
    if (eventCode === "DELAY_ONLY") {
      const payload = {
        FoId,
        StopId,
        ETA: "20251208230000",
        RefEvent: "Arrival",
        EventCode: "Traffic Jam"
      };

      const res = await fetch("/api/postDelay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      const json = await res.json();
      alert(json.success ? "Delay Reported ✓" : JSON.stringify(json.error));
      return;
    }
  }

  /* ---------------- RENDER ---------------- */
  return (
    <PageWrapper>
      <div className="max-w-7xl mx-auto">
        <SearchBar fieldDefs={fieldDefs} onFilter={setFilterMap} />

        <Stack direction="row" spacing={2} sx={{ mt: 2, mb: 2 }}>
          <Button variant="contained" onClick={() => handleEvent("DEPARTURE")}>Departure</Button>
          <Button variant="contained" color="secondary" onClick={() => handleEvent("ARRIVAL")}>Arrival</Button>
          <Button variant="contained" color="warning" onClick={() => handleEvent("DELAY_ONLY")}>Delay</Button>
          <Button variant="contained" color="success" onClick={() => handleEvent("POD_NODIS")}>POD – No Discrepancy</Button>
          <Button variant="contained" color="error" onClick={() => handleEvent("POD_DIS")}>POD – Discrepancy</Button>
        </Stack>

        {loading && <CircularProgress />}
        {error && <Alert severity="error">{error}</Alert>}
        {!loading && <ShipmentsTable rows={filteredRows} fieldDefs={fieldDefs} />}
      </div>
    </PageWrapper>
  );
};

export default ShipmentsListPage;
