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

/* =========================================================
   TYPES
========================================================= */

interface UIFieldConfig {
  title: string;
  technicalName: string;
  visibleInAdapt: boolean;
}

interface ShipmentData {
  [key: string]: unknown;
}

interface ShipmentEvent {
  id: string;
  [key: string]: unknown;
}

/* =========================================================
   API HELPERS
========================================================= */

async function apiGet<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`API failed: ${url}`);
  }
  return res.json();
}

async function fetchUIFieldConfig(): Promise<UIFieldConfig[]> {
  return apiGet("/api/ui-fields-config");
}

async function fetchTrackingData(container: string): Promise<ShipmentData | null> {
  const data = await apiGet<ShipmentData[]>(
    `/api/tracking-data?container=${encodeURIComponent(container)}`
  );
  return data?.[0] ?? null;
}

async function fetchShipmentEvents(container: string): Promise<ShipmentEvent[]> {
  return apiGet(
    `/api/shipment-events?container=${encodeURIComponent(container)}`
  );
}

/* =========================================================
   STATIC EVENT TABLE CONFIG
========================================================= */

const EVENT_FIELD_DEFS = [
  { title: "Event Name", technicalName: "EventName", visibleInAdapt: true },
  { title: "Code", technicalName: "Code", visibleInAdapt: true },
  { title: "Location", technicalName: "Location", visibleInAdapt: true },
  { title: "Location Code", technicalName: "LocationCode", visibleInAdapt: true },
  { title: "Actual Time", technicalName: "ActualTime", visibleInAdapt: true },
  { title: "Transport Mode", technicalName: "TransportMode", visibleInAdapt: true }
];

/* =========================================================
   MAIN COMPONENT
========================================================= */

export default function ShipmentDetailsPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [uiFields, setUiFields] = useState<UIFieldConfig[]>([]);
  const [shipment, setShipment] = useState<ShipmentData | null>(null);
  const [events, setEvents] = useState<ShipmentEvent[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /* ---------------- LOAD UI FIELD CONFIG ---------------- */
  useEffect(() => {
    fetchUIFieldConfig()
      .then(setUiFields)
      .catch(() => setUiFields([]));
  }, []);

  /* ---------------- LOAD SHIPMENT + EVENTS ---------------- */
  useEffect(() => {
    if (typeof id !== "string") return; // ✅ TYPE GUARD

    const loadAll = async () => {
      try {
        setLoading(true);

        const [shipmentData, eventData] = await Promise.all([
          fetchTrackingData(id),
          fetchShipmentEvents(id)
        ]);

        if (!shipmentData) {
          setError("Shipment not found");
          return;
        }

        setShipment(shipmentData);
        setEvents(eventData);
      } catch {
        setError("Failed to load shipment details");
      } finally {
        setLoading(false);
      }
    };

    loadAll();
  }, [id]);

  /* ---------------- DERIVED UI FIELDS ---------------- */
  const visibleFields = useMemo(
    () => uiFields.filter(f => f.visibleInAdapt),
    [uiFields]
  );

  /* ---------------- SAFE TITLE VALUE ---------------- */
  const titleValue = String(
    shipment?.ContainerNumber ??
    shipment?.containerNumber ??
    id ??
    ""
  );

  /* ---------------- STATUS CHIP ---------------- */
  function renderStatusChip(statusValue: unknown) {
    const status = String(statusValue ?? "");
    if (!status) return <Chip label="—" size="small" />;

    const s = status.toLowerCase();
    if (s.includes("active") || s.includes("completed")) {
      return <Chip icon={<CheckCircleIcon />} label={status} color="success" size="small" />;
    }
    if (s.includes("execution") || s.includes("progress")) {
      return <Chip icon={<ErrorOutlineIcon />} label={status} color="warning" size="small" />;
    }
    if (s.includes("cancel") || s.includes("fail")) {
      return <Chip icon={<CancelIcon />} label={status} color="error" size="small" />;
    }
    return <Chip label={status} size="small" />;
  }

  /* =========================================================
     RENDER
  ========================================================= */

  return (
    <PageWrapper>
      <div style={{ maxWidth: "82rem", margin: "0 auto", display: "flex", flexDirection: "column", gap: 20 }}>

        {loading && <p>Loading shipment details…</p>}
        {error && <p style={{ color: "red" }}>{error}</p>}

        {!loading && shipment && (
          <Paper elevation={2} style={{ padding: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <Typography style={{ fontWeight: 600, fontSize: 15, color: "#2563eb" }}>
                {titleValue}
              </Typography>
              {renderStatusChip(shipment.TrackingStatus)}
            </div>

            <Divider sx={{ my: 2 }} />

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                gap: 12
              }}
            >
              {visibleFields.map(f => (
                <div
                  key={f.technicalName}
                  style={{
                    border: "1px solid #e5e7eb",
                    padding: 8,
                    borderRadius: 6,
                    background: "#f9fafb"
                  }}
                >
                  <div style={{ fontSize: 11, color: "#6b7280" }}>
                    {f.title}
                  </div>
                  <div style={{ fontSize: 13, color: "#111827" }}>
                    {String(shipment[f.technicalName] ?? "—")}
                  </div>
                </div>
              ))}
            </div>
          </Paper>
        )}

        {events.length > 0 && (
          <Paper elevation={2} style={{ padding: 14 }}>
            <Typography style={{ fontWeight: 600, marginBottom: 8 }}>
              Tracking Map
            </Typography>
            <ShipmentTrackingMap
              events={events.map(e => ({ id: e.id, fields: e }))}
              height={520}
            />
          </Paper>
        )}

        <EventsTable
          rows={events.map(e => ({ id: e.id, fields: e }))}
          fieldDefs={EVENT_FIELD_DEFS}
          storageKey={String(id)}
          
        />

      </div>
    </PageWrapper>
  );
}

