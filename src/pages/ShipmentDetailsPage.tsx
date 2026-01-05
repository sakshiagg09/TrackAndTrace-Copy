import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import {
  Paper,
  Typography,
  Chip,
  Divider,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Checkbox,
  List,
  ListItem,
  ListItemIcon,
  ListItemText
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

const API_BASE = import.meta.env.VITE_API_BASE;
async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) throw new Error(`API failed: ${res.status} ${path}`);
  return res.json();
}
async function fetchUIFieldConfig(): Promise<UIFieldConfig[]> {
  return apiGet("/api/ui-fields-config");
}

/**
 * businessKey = ShipmentNo OR ContainerNumber
 */


/**
 * businessKey = ShipmentNo OR ContainerNumber
 */
/**
 * Fetch TrackingData + Latest Event (single object)
 */
async function fetchTrackingData(foId: string): Promise<ShipmentData | null> {
  return apiGet(
    `/api/shipment-tracking-data?foId=${encodeURIComponent(foId)}`
  );
}

async function fetchEvents(foId: string): Promise<ShipmentEvent[]> {
  return apiGet(
    `/api/events?foId=${encodeURIComponent(foId)}`
  );
}


/* =========================================================
   STATIC EVENT TABLE CONFIG
========================================================= */

/*const EVENT_FIELD_DEFS = [
  { title: "Freight Order ID", technicalName: "FoId", visibleInAdapt: true },
  { title: "Stop ID", technicalName: "StopId", visibleInAdapt: true },
  { title: "Action Name", technicalName: "Action_Name", visibleInAdapt: true },
  { title: "Longitude", technicalName: "EventLong", visibleInAdapt: true },
  { title: "Latitude", technicalName: "EventLat", visibleInAdapt: true }
];*/

/* =========================================================
   MAIN COMPONENT
========================================================= */

export default function ShipmentDetailsPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;

  const STORAGE_KEY = `shipment_details_fields:${id}`;

  const [uiFields, setUiFields] = useState<UIFieldConfig[]>([]);
  const [shipment, setShipment] = useState<ShipmentData | null>(null);
  const [events, setEvents] = useState<ShipmentEvent[]>([]);

  const [visibleKeys, setVisibleKeys] = useState<string[]>([]);
   /* ✅ PUT useMemo HERE */
  const eventVisibleFields = useMemo(() => {
    if (!events.length) return [];

    const sampleEvent = events[0];

    return uiFields.filter(
      f =>
        visibleKeys.includes(f.technicalName) &&
        sampleEvent[f.technicalName] !== undefined
    );
  }, [uiFields, visibleKeys, events]);
  const [adaptOpen, setAdaptOpen] = useState(false);

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
    if (typeof id !== "string") return;

    const loadAll = async () => {
      try {
        setLoading(true);

        
        const [shipmentData, eventData] = await Promise.all([
          fetchTrackingData(id),
          fetchEvents(id)
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

  /* ---------------- INIT VISIBLE FIELDS ---------------- */
  useEffect(() => {
    if (!uiFields.length) return;

    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          setVisibleKeys(parsed);
          return;
        }
      }
    } catch {
      /* ignore */
    }

    setVisibleKeys(
      uiFields.filter(f => f.visibleInAdapt).map(f => f.technicalName)
    );
  }, [uiFields, STORAGE_KEY]);

  /* ---------------- PERSIST FIELD SELECTION ---------------- */
  useEffect(() => {
    if (!visibleKeys.length) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(visibleKeys));
    } catch {
      /* ignore */
    }
  }, [visibleKeys, STORAGE_KEY]);

  /* ---------------- DERIVED UI FIELDS ---------------- */
  const visibleFields = useMemo(
    () => uiFields.filter(f => visibleKeys.includes(f.technicalName)),
    [uiFields, visibleKeys]
  );

  /* ---------------- SAFE TITLE VALUE ---------------- */
const titleValue = String(shipment?.FoId ?? id ?? "");


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
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                <Typography style={{ fontWeight: 600, fontSize: 15, color: "#2563eb" }}>
                  {titleValue}
                </Typography>
                {renderStatusChip(shipment.Status)}

              </div>

              <Button
                size="small"
                variant="outlined"
                onClick={() => setAdaptOpen(true)}
              >
                Adapt Columns
              </Button>
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
  fieldDefs={eventVisibleFields}
  storageKey={`events:${id}`}
/>


        {/* ================= ADAPT COLUMNS DIALOG ================= */}
        <Dialog open={adaptOpen} onClose={() => setAdaptOpen(false)} maxWidth="md" fullWidth>
          <DialogTitle>Adapt Columns</DialogTitle>
          <DialogContent dividers>
            <List dense>
              {uiFields.map(f => {
                const checked = visibleKeys.includes(f.technicalName);
                return (
                  <ListItem
                    key={f.technicalName}
                    button
                    onClick={() =>
                      setVisibleKeys(prev =>
                        prev.includes(f.technicalName)
                          ? prev.filter(k => k !== f.technicalName)
                          : [...prev, f.technicalName]
                      )
                    }
                  >
                    <ListItemIcon>
                      <Checkbox checked={checked} />
                    </ListItemIcon>
                    <ListItemText
                      primary={f.title}
                      secondary={f.technicalName}
                    />
                  </ListItem>
                );
              })}
            </List>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setAdaptOpen(false)}>Close</Button>
          </DialogActions>
        </Dialog>

      </div>
    </PageWrapper>
  );
}
