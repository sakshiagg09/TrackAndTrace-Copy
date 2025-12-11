// src/pages/ShipmentsListPage.tsx
import React, { useEffect, useMemo, useState } from "react";
import PageWrapper from "../components/layout/PageWrapper";
import SearchBar from "../components/SearchBar";
import ShipmentsTable from "../components/ShipmentsTable";
import { fetchSimpleFieldConfig } from "../utils/simpleFieldConfig";
import { getAccessToken } from "../utils/graphClient";
import { CircularProgress, Box, Alert, Button, Stack } from "@mui/material";

interface GraphItem {
  id: string;
  fields: Record<string, unknown>;
}

interface UIFieldConfig {
  title: string;
  technicalName: string;
  visible: boolean;
}

const ShipmentsListPage: React.FC = () => {
  const [rows, setRows] = useState<GraphItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [cfgLoading, setCfgLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cfgError, setCfgError] = useState<string | null>(null);

  const [fieldDefs, setFieldDefs] = useState<UIFieldConfig[]>([]);
  const [filterMap, setFilterMap] = useState<Record<string, string>>({});

  /* ---------------- LOAD DATA ---------------- */
  useEffect(() => {
    async function loadAll() {
      setError(null);
      setCfgError(null);
      setLoading(true);
      setCfgLoading(true);

      /** 1) Load field configuration **/
      try {
        const cfg = await fetchSimpleFieldConfig();
        setFieldDefs(cfg ?? []);
      } catch (e: unknown) {
        console.error("[ShipmentsListPage] field config error", e);
        const msg = e instanceof Error ? e.message : String(e);
        setCfgError(msg);
        setFieldDefs([]);
      } finally {
        setCfgLoading(false);
      }

      /** 2) Load tracking data **/
      try {
        const token = await getAccessToken();
        const res = await fetch("/api/Shipments", {
          headers: { Authorization: `Bearer ${token}` }
        });

        if (!res.ok) throw new Error(`API Error ${res.status}`);

        const data = await res.json();
        setRows(data ?? []);
      } catch (e: unknown) {
        console.error("[ShipmentsListPage] data load error", e);
        const msg = e instanceof Error ? e.message : String(e);
        setError(msg);
      } finally {
        setLoading(false);
      }
    }

    loadAll();
  }, []);

  /* ---------------- FILTER LOGIC ---------------- */
  const filteredRows = useMemo(() => {
    if (!rows.length) return [];
    if (!fieldDefs || Object.keys(filterMap).length === 0) return rows;

    return rows.filter((r) => {
      for (const [technicalName, filterValue] of Object.entries(filterMap)) {
        if (!filterValue) continue;

        const cellVal = (r.fields?.[technicalName] ?? "")
          .toString()
          .toLowerCase();

        if (!cellVal.includes(filterValue.toLowerCase())) return false;
      }
      return true;
    });
  }, [rows, filterMap, fieldDefs]);

  /* ---------------- UPDATED EVENT HANDLER ---------------- */
  async function handleEvent(eventCode: string) {
    console.log("🔘 Button clicked:", eventCode);

    // Hardcoded for now — replace with dynamic values later
    const FoId = "6300003074";
    const StopId = "SP_1000";

    try {
      /* ============ DEPARTURE → GET FO DETAILS ============ */
      if (eventCode === "DEPARTURE") {
        console.log("📤 Calling GET /api/getEvent/:fo_id");

        const response = await fetch(`/api/getEvent/${FoId}`, {
          method: "GET"
        });

        // if response isn't JSON you'll see parse error here — check network tab
        const data = await response.json();
        console.log("📥 GET Response:", data);

        if (data.success) {
          alert("FO DETAILS RECEIVED ✓\n\n" + JSON.stringify(data.data, null, 2));
        } else {
          alert("FAILED TO FETCH FO DETAILS ✗\n" + JSON.stringify(data.error, null, 2));
        }

        return; // stop: do not post event
      }

      /* ============ ARRIVAL (and other) → POST EVENT ============ */
      // You asked Arrival to post Action="DEPT". If you want other mappings change here.
      const Action = eventCode === "ARRIVAL" ? "DEPT" : eventCode;

      const payload = {
        FoId,
        Action,
        StopId
      };

      console.log("📤 Calling POST /api/postEvent with:", payload);

      const response = await fetch(`/api/postEvent`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      const data = await response.json();
      console.log("📥 POST Response:", data);

      if (data.success) {
        alert(`EVENT POSTED SUCCESSFULLY ✓ (${Action})\n\n` + JSON.stringify(data.tm_response, null, 2));
      } else {
        alert("EVENT POST FAILED ✗\n" + JSON.stringify(data.error, null, 2));
      }

    } catch (err) {
      console.error("🔥 Frontend error:", err);
      alert(`Frontend error: ${err}`);
    }
  }

  /* ---------------- RENDER UI ---------------- */
  return (
    <PageWrapper>
      <div className="max-w-7xl mx-auto">
        {cfgLoading ? (
          <Box sx={{ p: 2, display: "flex", alignItems: "center", gap: 2 }}>
            <CircularProgress size={20} />
            <div>Loading filter configuration…</div>
          </Box>
        ) : cfgError ? (
          <Alert severity="warning" sx={{ mb: 2 }}>
            Could not load filter configuration: {cfgError}. Using defaults.
          </Alert>
        ) : null}

        <SearchBar fieldDefs={fieldDefs} onFilter={(map) => setFilterMap(map)} />

        <Stack direction="row" spacing={2} sx={{ mt: 2, mb: 2 }}>
          <Button variant="contained" onClick={() => handleEvent("DEPARTURE")}>Departure</Button>
          <Button variant="contained" color="secondary" onClick={() => handleEvent("ARRIVAL")}>Arrival</Button>
          <Button variant="contained" color="success" onClick={() => handleEvent("CHECKIN")}>Check-In</Button>
          <Button variant="contained" color="warning" onClick={() => handleEvent("CHECKOUT")}>Check-Out</Button>
        </Stack>

        {loading && (
          <Box sx={{ p: 3, display: "flex", alignItems: "center", gap: 2 }}>
            <CircularProgress size={20} /> <div>Loading Shipment Data…</div>
          </Box>
        )}

        {error && !loading && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}

        {!loading && !error && <ShipmentsTable rows={filteredRows} fieldDefs={fieldDefs} />}
      </div>
    </PageWrapper>
  );
};

export default ShipmentsListPage;
