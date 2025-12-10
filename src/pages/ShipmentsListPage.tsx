// src/pages/ShipmentsListPage.tsx
import React, { useEffect, useMemo, useState } from "react";
import PageWrapper from "../components/layout/PageWrapper";
import SearchBar from "../components/SearchBar";
import ShipmentsTable from "../components/ShipmentsTable";
import { fetchSimpleFieldConfig } from "../utils/simpleFieldConfig";
import { getAccessToken } from "../utils/graphClient";   
import { CircularProgress, Box, Alert } from "@mui/material";
interface GraphItem {
  id: string;
  fields: Record<string, unknown>;
}

const ShipmentsListPage: React.FC = () => {
  const [rows, setRows] = useState<GraphItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [cfgLoading, setCfgLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cfgError, setCfgError] = useState<string | null>(null);
interface UIFieldConfig {
  title: string;
  technicalName: string;
  visible: boolean;
}

const [fieldDefs, setFieldDefs] = useState<UIFieldConfig[]>([]);

  const [filterMap, setFilterMap] = useState<Record<string, string>>({});

  useEffect(() => {
    async function loadAll() {
      // reset UI states
      setError(null);
      setCfgError(null);
      setLoading(true);
      setCfgLoading(true);

      /** 1) Load field configuration (from SQL backend through API) **/
      try {
        const cfg = await fetchSimpleFieldConfig(); 
        setFieldDefs(cfg ?? []);
      } catch (e: unknown) {
        console.error("[ShipmentsListPage] field config error", e);
        const msg = e instanceof Error ? e.message : String(e);
        setCfgError(msg);
        setFieldDefs([]); // fallback UI defaults
      } finally {
        setCfgLoading(false);
      }
      

      /** 2) Load tracking data (from Azure Function + DB) **/
      try {
        const token = await getAccessToken(); // 👈 correct auth provider
        const res = await fetch("/api/Shipments", {
          headers: { Authorization: `Bearer ${token}` },
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

  /** 3) Filter rows based on UI field filter values **/
  const filteredRows = useMemo(() => {
    if (!rows.length) return [];
    if (!fieldDefs || Object.keys(filterMap).length === 0) return rows;

    return rows.filter((r) => {
      for (const [technicalName, filterValue] of Object.entries(filterMap)) {
        if (!filterValue) continue;
        const cellVal = (r.fields?.[technicalName] ?? "").toString().toLowerCase();
        if (!cellVal.includes(filterValue.toLowerCase())) return false;
      }
      return true;
    });
  }, [rows, filterMap, fieldDefs]);

  /** 4) Render UI **/
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

        {loading && (
          <Box sx={{ p: 3, display: "flex", alignItems: "center", gap: 2 }}>
            <CircularProgress size={20} />
            <div>Loading Shipment Data…</div>
          </Box>
        )}

        {error && !loading && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}

        {!loading && !error && (
          <ShipmentsTable rows={filteredRows} fieldDefs={fieldDefs} />
        )}
      </div>
    </PageWrapper>
  );
};

export default ShipmentsListPage;
