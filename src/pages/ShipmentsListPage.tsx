import React, { useEffect, useMemo, useState } from "react";
import PageWrapper from "../components/layout/PageWrapper";
import SearchBar from "../components/SearchBar";
import ShipmentsTable from "../components/ShipmentsTable";
import {
  CircularProgress,
  Box,
  Alert
} from "@mui/material";

/* ---------------- TYPES ---------------- */

interface GraphItem {
  id: string;
  fields: Record<string, unknown>;
}

interface UIFieldConfig {
  title: string;
  technicalName: string;
  visible: boolean;
  order?: number;
}

/* ---------------- COMPONENT ---------------- */
const API_BASE = import.meta.env.VITE_API_BASE;
console.log("API_BASE:", API_BASE);
const ShipmentsListPage: React.FC = () => {
  const [rows, setRows] = useState<GraphItem[]>([]);
  const [fieldDefs, setFieldDefs] = useState<UIFieldConfig[]>([]);

  const [loading, setLoading] = useState(true);
  const [cfgLoading, setCfgLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cfgError, setCfgError] = useState<string | null>(null);

  const [filterMap, setFilterMap] = useState<Record<string, string>>({});

  /* ---------------- LOAD DATA ---------------- */

  useEffect(() => {
    async function loadAll() {
      setLoading(true);
      setCfgLoading(true);
      setError(null);
      setCfgError(null);

      /* ---------- 1. LOAD UI FIELD CONFIG ---------- */
      try {
        const cfgRes = await 
          fetch(`${API_BASE}/api/ui-fields-config`
        );

        if (!cfgRes.ok) {
          throw new Error(`UI config error ${cfgRes.status}`);
        }

        const cfgData = await cfgRes.json();
        setFieldDefs(cfgData ?? []);
      } catch (e: unknown) {
        console.error("UIFieldConfig error", e);
        setCfgError(e instanceof Error ? e.message : String(e));
        setFieldDefs([]);
      } finally {
        setCfgLoading(false);
      }

      /* ---------- 2. LOAD SHIPMENT DATA ---------- */
      try {
        const dataRes = await fetch(`${API_BASE}/api/shipmentEvents`);

        if (!dataRes.ok) {
          throw new Error(`Shipment API error ${dataRes.status}`);
        }

interface ShipmentRow {
  FoId?: string | null;
  [key: string]: unknown;
}


const dbRows: ShipmentRow[] = await dataRes.json();

const mapped: GraphItem[] = dbRows
  .filter((row): row is ShipmentRow => Boolean(row.FoId))
  .map((row) => ({
    id: String(row.FoId),
    fields: row
  }));

setRows(mapped);

      } catch (e: unknown) {
        console.error("Shipment load error", e);
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    }

    loadAll();
  }, []);

  /* ---------------- FILTER LOGIC ---------------- */

  const filteredRows = useMemo(() => {
    if (!rows.length) return [];
    if (!Object.keys(filterMap).length) return rows;

    return rows.filter((r) =>
      Object.entries(filterMap).every(([key, value]) => {
        if (!value) return true;
        const cell = r.fields?.[key];
        return String(cell ?? "")
          .toLowerCase()
          .includes(value.toLowerCase());
      })
    );
  }, [rows, filterMap]);

  /* ---------------- RENDER ---------------- */

  return (
    <PageWrapper>
      <div className="max-w-7xl mx-auto">
        {cfgLoading && (
          <Box sx={{ p: 2, display: "flex", gap: 2 }}>
            <CircularProgress size={20} />
            <div>Loading column configuration…</div>
          </Box>
        )}

        {cfgError && (
          <Alert severity="warning" sx={{ mb: 2 }}>
            Failed to load column configuration: {cfgError}
          </Alert>
        )}

        <SearchBar
          fieldDefs={fieldDefs}
          onFilter={(map) => setFilterMap(map)}
        />

        {loading && (
          <Box sx={{ p: 3, display: "flex", gap: 2 }}>
            <CircularProgress size={20} />
            <div>Loading shipment data…</div>
          </Box>
        )}

        {error && !loading && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {error}
          </Alert>
        )}

        {!loading && !error && (
          <ShipmentsTable
            rows={filteredRows}
            fieldDefs={fieldDefs}
          />
        )}
      </div>
    </PageWrapper>
  );
};

export default ShipmentsListPage;
