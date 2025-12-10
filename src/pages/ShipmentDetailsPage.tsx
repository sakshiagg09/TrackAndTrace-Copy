// src/pages/ShipmentDetailsPage.tsx
import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import {
  Paper,
  Typography,
  Chip,
  Divider
} from "@mui/material";

import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import CancelIcon from "@mui/icons-material/Cancel";

import PageWrapper from "../components/layout/PageWrapper";
import ShipmentTrackingMap from "../components/ShipmentTrackingMap";
import EventsTable from "../components/EventsTable";
import type { JSX } from "@emotion/react/jsx-runtime";

/* ---------------- TYPES ---------------- */
interface UIFieldConfig {
  title: string;
  technicalName: string;
  visible: boolean;
}
interface ShipmentData {
  [key: string]: unknown;
}
interface ShipmentEvent {
  id: string;
  [key: string]: unknown;
}

/* ---------------- SQL API WRAPPERS ---------------- */
async function apiGet<T>(url: string): Promise<T | null> {
  const res = await fetch(url);
  if (!res.ok) return null;
  return res.json();
}

async function fetchFieldConfig(): Promise<UIFieldConfig[]> {
  return (await apiGet<UIFieldConfig[]>("/api/UIFieldConfig")) ?? [];
}
async function fetchShipment(container: string): Promise<ShipmentData | null> {
  return await apiGet<ShipmentData>(
    `/api/GetShipment?container=${encodeURIComponent(container)}`
  );
}
async function fetchShipmentEvents(container: string): Promise<ShipmentEvent[]> {
  return (
    (await apiGet<ShipmentEvent[]>(
      `/api/GetShipmentEvents?container=${encodeURIComponent(container)}`
    )) ?? []
  );
}

/* ---------------- EVENT FIELD DEF (STATIC) ---------------- */
const EVENT_FIELD_DEFS: UIFieldConfig[] = [
  { title: "Event Name", technicalName: "EventName", visible: true },
  { title: "Code", technicalName: "Code", visible: true },
  { title: "Location", technicalName: "Location", visible: true },
  { title: "Location Code", technicalName: "LocationCode", visible: true },
  { title: "Container No.", technicalName: "ContainerNumber", visible: true },
  { title: "Time", technicalName: "ActualTime", visible: true },
  { title: "Transport Mode", technicalName: "TransportMode", visible: true },
  { title: "Has Cargo", technicalName: "HasCargo", visible: true }
];

/* ===========================================================
   MAIN COMPONENT
=========================================================== */
export default function ShipmentDetailsPage(): JSX.Element {
  const { id } = useParams<{ id: string }>();

  const [data, setData] = useState<ShipmentData | null>(null);
  const [events, setEvents] = useState<ShipmentEvent[]>([]);
  const [fieldDefs, setFieldDefs] = useState<UIFieldConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingEvents, setLoadingEvents] = useState(true);
  const [cfgLoading, setCfgLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [visibleKeys, setVisibleKeys] = useState<string[]>([]);
  const [titleField, setTitleField] = useState<string | null>(null);

  /* ---------------- Adapt dialog missing state (fix) --------------- */
  
  /* ---------------- LOAD UI FIELD CONFIG ---------------- */
  useEffect(() => {
    async function loadCfg() {
      setCfgLoading(true);
      const cfg = await fetchFieldConfig();
      setFieldDefs(cfg);
      setCfgLoading(false);
    }
    loadCfg();
  }, []);

  /* ---------------- INIT VISIBLE + TITLE FIELDS ---------------- */
  useEffect(() => {
    if (!fieldDefs.length) return;
    const allowed = fieldDefs.filter((d) => d.visible).map((d) => d.technicalName);
    setVisibleKeys(allowed);
    setTitleField(allowed[0] ?? null);
  }, [fieldDefs]);

  /* ---------------- LOAD SHIPMENT DETAILS ---------------- */
  useEffect(() => {
    if (!id) return;
    async function load() {
      setLoading(true);
      const result = await fetchShipment(id!);
      if (!result) setError("Shipment not found");
      setData(result);
      setLoading(false);
    }
    load();
  }, [id]);

  /* ---------------- LOAD SHIPMENT EVENTS ---------------- */
  useEffect(() => {
    if (!id) return;
    async function loadEventsNow() {
      setLoadingEvents(true);
      const result = await fetchShipmentEvents(id!);
      setEvents(result);
      setLoadingEvents(false);
    }
    loadEventsNow();
  }, [id]);

  const visibleDefs = useMemo(() => {
    return fieldDefs.filter((d) => visibleKeys.includes(d.technicalName));
  }, [visibleKeys, fieldDefs]);

  const titleValue = String(data ? data[titleField ?? "ContainerNumber"] : id);

  function renderStatusChip(statusValue: unknown) {
    const status = String(statusValue ?? "");
    if (!status) return <Chip label="—" size="small" sx={{ fontSize: 12 }} />;
    const s = status.toLowerCase();
    if (s.includes("active") || s.includes("completed"))
      return <Chip icon={<CheckCircleIcon />} label={status} color="success" size="small" sx={{ fontSize: 12 }} />;
    if (s.includes("execution") || s.includes("progress"))
      return <Chip icon={<ErrorOutlineIcon />} label={status} color="warning" size="small" sx={{ fontSize: 12 }} />;
    if (s.includes("cancel"))
      return <Chip icon={<CancelIcon />} label={status} color="error" size="small" sx={{ fontSize: 12 }} />;
    return <Chip label={status} size="small" sx={{ fontSize: 12 }} />;
  }

  /* ===========================================================
     UI RENDERING
  =========================================================== */
  return (
    <PageWrapper>
      <div style={{ maxWidth: "80rem", margin: "0 auto", display: "flex", flexDirection: "column", gap: 20, fontSize: 12 }}>
        {cfgLoading && <p>Loading field configuration…</p>}
        {loading && <p>Loading shipment details…</p>}
        {error && <p style={{ color: "red" }}>{error}</p>}

        {!loading && !error && data && (
          <Paper elevation={2} style={{ padding: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <Typography style={{ fontWeight: 600, fontSize: 14, color: "#2563eb" }}>{titleValue}</Typography>
                {renderStatusChip(data.TrackingStatus)}
              </div>

            </div>

            <Divider sx={{ marginBottom: 12 }} />

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 12 }}>
              {visibleDefs.map((def) => (
                <div key={def.technicalName} style={{ border: "1px solid #e5e7eb", padding: 8, borderRadius: 6, background: "#f9fafb" }}>
                  <p style={{ margin: 0, fontWeight: 500, color: "#6b7280" }}>{def.title}</p>
                  <p style={{ margin: 0, color: "#111827" }}>
                    {String(data[def.technicalName] ?? "—")}
                  </p>
                </div>
              ))}
            </div>
          </Paper>
        )}

        {!loadingEvents && events.length > 0 && (
          <Paper elevation={2} style={{ padding: 12 }}>
            <Typography style={{ fontWeight: 600, marginBottom: 8 }}>Tracking Map</Typography>
            <div style={{ height: 500 }}>
              <ShipmentTrackingMap
                events={events.map((e) => ({ id: e.id, fields: e }))}
                height={500}
              />
            </div>
          </Paper>
        )}

        <EventsTable
          rows={events.map((e) => ({ id: e.id, fields: e }))}
          fieldDefs={EVENT_FIELD_DEFS}
          storageKey={String(id)}
        />
      </div>
    </PageWrapper>
  );
}
