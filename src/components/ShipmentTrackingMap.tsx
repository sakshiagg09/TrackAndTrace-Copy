import React, { useEffect, useMemo, useRef, useState } from "react";
import { GoogleMap, Polyline, useJsApiLoader } from "@react-google-maps/api";

type RawEvent = {
  id: string;
  fields: Record<string, unknown>;
};

interface ShipmentTrackingMapProps {
  events: RawEvent[];
  height?: number | string;
  onSelectEvent?: (ev: RawEvent) => void;

  /** ✅ REQUIRED for live tracking */
  foId: string;

  /** polling interval for latest (ms) */
  pollMs?: number;

  /** how many history points to draw for live polyline */
  historyLimit?: number;
}

type LivePoint = {
  FoId: string;
  DriverId?: string;
  Latitude: number;
  Longitude: number;
  Accuracy?: number | null;
  Timestamp: number;
  Speed?: number | null; // km/h
  Bearing?: number | null;
};

const API_BASE = (import.meta as any).env?.VITE_API_BASE || "";

const containerBaseStyle: React.CSSProperties = {
  width: "100%",
  height: "100%",
  borderRadius: 8,
  overflow: "hidden",
  border: "1px solid rgba(0,0,0,0.06)",
};

const leftPanelWidth = 380;

const pinColors = {
  start: "#23a455",
  mid: "#1f6feb",
  end: "#d64545",
  truck: "#111827",
};

function toNum(v: any) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Always convert unknown to a safe string so JSX never renders an object ({}) */
function asText(v: unknown, fallback = ""): string {
  if (v === null || v === undefined) return fallback;
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean" || typeof v === "bigint") return String(v);
  if (v instanceof Date) return v.toISOString();
  try {
    return JSON.stringify(v);
  } catch {
    return fallback;
  }
}

/** ✅ IMPORTANT: also support your DB payload keys Latitude/Longitude */
function parseLatLng(fields: Record<string, any>) {
  const latRaw =
    fields?.EventLat ??
    fields?.eventLat ??
    fields?.latitude ??
    fields?.Latitude ??
    fields?.geoLat ??
    fields?.GeoLocation?.Latitude;

  const lonRaw =
    fields?.EventLong ??
    fields?.eventLong ??
    fields?.longitude ??
    fields?.Longitude ??
    fields?.geoLon ??
    fields?.GeoLocation?.Longitude;

  const lat = latRaw == null ? NaN : parseFloat(String(latRaw));
  const lng = lonRaw == null ? NaN : parseFloat(String(lonRaw));

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

function escapeHtml(s: unknown) {
  if (s === null || s === undefined) return "";
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function buildListItemHtml(fields: Record<string, unknown>) {
  const action = asText((fields as any)?.Action ?? (fields as any)?.action, "Event");
  const stopId = asText((fields as any)?.StopId ?? (fields as any)?.stopId, "—");
  const createdAt = asText((fields as any)?.CreatedAt ?? (fields as any)?.createdAt, "");

  return `
    <div style="font-size:13px;max-width:260px">
      <div style="font-weight:600;margin-bottom:4px;">${escapeHtml(action)}</div>
      <div style="font-size:12px;color:#374151;margin-bottom:4px;">
        <strong>Stop ID:</strong> ${escapeHtml(stopId)}
      </div>
      ${
        createdAt
          ? `<div style="font-size:12px;color:#6b7280;"><strong>Time:</strong> ${escapeHtml(createdAt)}</div>`
          : ""
      }
    </div>
  `;
}

/** create small html pin (circle + optional label) */
function makeMarkerContent(color: string, label?: string) {
  const bg = color;
  const isLongLabel = !!label && label.length > 1;
  const minWidth = isLongLabel ? "auto" : "28px";
  const padding = isLongLabel ? "0 10px" : "0";
  const height = "28px";

  return `
    <div style="display:flex;flex-direction:column;align-items:center;pointer-events:none;">
      <div style="min-width:${minWidth};height:${height};border-radius:14px;background:${bg};display:flex;align-items:center;justify-content:center;box-shadow:0 1px 4px rgba(0,0,0,0.25);padding:${padding};">
        ${
          label
            ? `<div style="font-size:${isLongLabel ? "11px" : "12px"};color:white;font-weight:700;white-space:nowrap;">${escapeHtml(
                label
              )}</div>`
            : ""
        }
      </div>
      <div style="width:2px;height:10px;background:${bg};margin-top:2px;border-radius:1px;"></div>
    </div>
  `;
}

/** simple "truck" marker */
function makeTruckMarkerHtml(speedKmh?: number | null) {
  const sp = Number.isFinite(Number(speedKmh)) ? `${Math.round(Number(speedKmh))} km/h` : "";
  return `
    <div style="display:flex;flex-direction:column;align-items:center;pointer-events:none;">
      <div style="width:34px;height:34px;border-radius:999px;background:${pinColors.truck};display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,0.25);">
        <div style="font-size:18px;line-height:18px;color:white;">🚚</div>
      </div>
      ${
        sp
          ? `<div style="margin-top:4px;background:white;border:1px solid rgba(0,0,0,0.1);border-radius:999px;padding:2px 8px;font-size:11px;font-weight:700;color:#111827;box-shadow:0 1px 4px rgba(0,0,0,0.08);">${escapeHtml(
              sp
            )}</div>`
          : ""
      }
    </div>
  `;
}

async function apiGetJson<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) throw new Error(`API failed: ${res.status} ${path}`);
  return res.json();
}

export default function ShipmentTrackingMap({
  events,
  foId,
  height = 520,
  onSelectEvent,
  pollMs = 3000,
  historyLimit = 300,
}: ShipmentTrackingMapProps) {
  const apiKey = (import.meta as any).env?.VITE_GOOGLE_MAPS_API_KEY as string | undefined;
  if (!apiKey) {
    return <div style={{ padding: 12, color: "crimson" }}>Missing VITE_GOOGLE_MAPS_API_KEY in env.</div>;
  }

  const GOOGLE_MAP_LIBRARIES: ("marker")[] = ["marker"];

  const { isLoaded } = useJsApiLoader({
    id: "google-map-script",
    googleMapsApiKey: apiKey,
    libraries: GOOGLE_MAP_LIBRARIES,
  });

  // ---- Existing points from events ----
  const points = useMemo(() => {
    return (events ?? [])
      .map((e) => {
        const coords = parseLatLng(e.fields as any);
        if (!coords) return null;
        return { ...coords, event: e };
      })
      .filter((p): p is { lat: number; lng: number; event: RawEvent } => !!p);
  }, [events]);

  const mapRef = useRef<google.maps.Map | null>(null);

  // markers
  const sdMarkersRef = useRef<Array<google.maps.marker.AdvancedMarkerElement>>([]);
  const truckMarkerRef = useRef<google.maps.marker.AdvancedMarkerElement | null>(null);

  const infoWindowRef = useRef<google.maps.InfoWindow | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // ---- Live tracking state ----
  const [liveLatest, setLiveLatest] = useState<LivePoint | null>(null);
  const [liveHistory, setLiveHistory] = useState<LivePoint[]>([]);

  // 1) Poll latest point
  useEffect(() => {
    if (!foId) return;

    let alive = true;
    let t: any = null;

    const tick = async () => {
      try {
        const j: any = await apiGetJson(`/api/tracking/latest?FoId=${encodeURIComponent(foId)}`);
        if (!alive) return;

        const lat = toNum(j?.Latitude);
        const lng = toNum(j?.Longitude);
        const ts = toNum(j?.Timestamp);
        if (lat == null || lng == null || ts == null) return;

        setLiveLatest({
          FoId: String(j.FoId || foId),
          DriverId: j.DriverId ? String(j.DriverId) : undefined,
          Latitude: lat,
          Longitude: lng,
          Accuracy: j.Accuracy == null ? null : toNum(j.Accuracy),
          Timestamp: ts,
          Speed: j.Speed == null ? null : toNum(j.Speed),
          Bearing: j.Bearing == null ? null : toNum(j.Bearing),
        });
      } catch {
        // ignore
      }
    };

    tick();
    t = setInterval(tick, pollMs);

    return () => {
      alive = false;
      if (t) clearInterval(t);
    };
  }, [foId, pollMs]);

  // 2) Poll history for live polyline
  useEffect(() => {
    if (!foId) return;

    let alive = true;
    let t: any = null;

    const tick = async () => {
      try {
        const arr: any[] = await apiGetJson(
          `/api/tracking/history?FoId=${encodeURIComponent(foId)}&limit=${encodeURIComponent(String(historyLimit))}`
        );
        if (!alive) return;

        const cleaned: LivePoint[] = (Array.isArray(arr) ? arr : [])
          .map((p) => {
            const lat = toNum(p?.Latitude);
            const lng = toNum(p?.Longitude);
            const ts = toNum(p?.Timestamp);
            if (lat == null || lng == null || ts == null) return null;

            return {
              FoId: String(p?.FoId || foId),
              DriverId: p?.DriverId ? String(p.DriverId) : undefined,
              Latitude: lat,
              Longitude: lng,
              Accuracy: p?.Accuracy == null ? null : toNum(p.Accuracy),
              Timestamp: ts,
              Speed: p?.Speed == null ? null : toNum(p.Speed),
              Bearing: p?.Bearing == null ? null : toNum(p.Bearing),
            };
          })
          .filter(Boolean) as LivePoint[];

        setLiveHistory(cleaned);
      } catch {
        // ignore
      }
    };

    tick();
    t = setInterval(tick, Math.max(4000, pollMs * 2));

    return () => {
      alive = false;
      if (t) clearInterval(t);
    };
  }, [foId, pollMs, historyLimit]);

  // ✅ KEY FIX: whenever event points exist/change, fit bounds (not only onLoad)
  useEffect(() => {
    if (!isLoaded || !mapRef.current) return;
    if (!points || points.length === 0) return;

    try {
      const bounds = new google.maps.LatLngBounds();
      points.forEach((p) => bounds.extend({ lat: p.lat, lng: p.lng }));
      mapRef.current.fitBounds(bounds, 80);
    } catch {
      // ignore
    }
  }, [isLoaded, points]);

  // ---- Create / update Source & Destination markers (from events) ----
  useEffect(() => {
    if (!isLoaded || !mapRef.current) return;

    // clear previous S/D markers
    try {
      sdMarkersRef.current.forEach((m) => ((m as any).map = null));
    } catch {
      /* empty */
    }
    sdMarkersRef.current = [];

    if (!points || points.length === 0) return;

    const markerPoints =
      points.length === 1
        ? [{ point: points[0], role: "start" as const }]
        : [
            { point: points[0], role: "start" as const },
            { point: points[points.length - 1], role: "end" as const },
          ];

    markerPoints.forEach(({ point: p, role }) => {
      const color = role === "start" ? pinColors.start : pinColors.end;
      const label = role === "start" ? "Source" : "Destination";

      const wrapper = document.createElement("div");
      wrapper.innerHTML = makeMarkerContent(color, label);
      const contentEl = wrapper.firstElementChild as HTMLElement;

      const title = asText((p.event.fields as any)?.Action ?? (p.event.fields as any)?.EventName ?? "Event", label);

      const advancedMarker = new (google.maps as any).marker.AdvancedMarkerElement({
        position: { lat: p.lat, lng: p.lng },
        map: mapRef.current,
        content: contentEl,
        title,
      }) as google.maps.marker.AdvancedMarkerElement;

      (advancedMarker as any).__eventId = p.event.id;

      advancedMarker.addListener("click", () => {
        setSelectedId(p.event.id);
        onSelectEvent?.(p.event);

        if (!infoWindowRef.current) infoWindowRef.current = new google.maps.InfoWindow({ maxWidth: 320 });
        infoWindowRef.current.setContent(buildListItemHtml(p.event.fields));
        infoWindowRef.current.open({ anchor: advancedMarker as any, map: mapRef.current });

        const el = document.querySelector(`[data-event-id="${p.event.id}"]`) as HTMLElement | null;
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "center" });
          el.classList.add("ring-2", "ring-blue-400");
          setTimeout(() => el.classList.remove("ring-2", "ring-blue-400"), 1500);
        }
      });

      sdMarkersRef.current.push(advancedMarker);
    });

    return () => {
      try {
        sdMarkersRef.current.forEach((m) => ((m as any).map = null));
      } catch {
        /* empty */
      }
      sdMarkersRef.current = [];
    };
  }, [isLoaded, points, onSelectEvent]);

  // ---- Create / update TRUCK marker (liveLatest) ----
  useEffect(() => {
    if (!isLoaded || !mapRef.current) return;
    if (!liveLatest) return;

    const pos = { lat: liveLatest.Latitude, lng: liveLatest.Longitude };

    if (!truckMarkerRef.current) {
      const wrapper = document.createElement("div");
      wrapper.innerHTML = makeTruckMarkerHtml(liveLatest.Speed);
      const contentEl = wrapper.firstElementChild as HTMLElement;

      truckMarkerRef.current = new (google.maps as any).marker.AdvancedMarkerElement({
        position: pos,
        map: mapRef.current,
        content: contentEl,
        title: "Truck",
      }) as google.maps.marker.AdvancedMarkerElement;

      return;
    }

    try {
      (truckMarkerRef.current as any).position = pos;

      const wrapper = document.createElement("div");
      wrapper.innerHTML = makeTruckMarkerHtml(liveLatest.Speed);
      const contentEl = wrapper.firstElementChild as HTMLElement;
      (truckMarkerRef.current as any).content = contentEl;
    } catch {
      /* ignore */
    }

    // optional: pan with truck only if no event points
    try {
      if (!points || points.length === 0) mapRef.current.panTo(pos);
    } catch {
      /* ignore */
    }
  }, [isLoaded, liveLatest, points]);

  // ---- Keep selectedId focus behavior ----
  useEffect(() => {
    if (!isLoaded || !mapRef.current) return;
    if (!selectedId) return;

    const m = sdMarkersRef.current.find((mk) => (mk as any).__eventId === selectedId);
    if (!m) return;

    try {
      mapRef.current.panTo((m as any).position ?? (m as any).getPosition?.());
      if (!infoWindowRef.current) infoWindowRef.current = new google.maps.InfoWindow({ maxWidth: 320 });
      infoWindowRef.current.setContent(" ");
      infoWindowRef.current.open({ anchor: m as any, map: mapRef.current });
    } catch {
      /* empty */
    }
  }, [selectedId, isLoaded]);

  // ---- polylines ----
  const eventPath = useMemo(() => points.map((p) => ({ lat: p.lat, lng: p.lng })), [points]);
  const livePath = useMemo(() => (liveHistory || []).map((p) => ({ lat: p.Latitude, lng: p.Longitude })), [liveHistory]);

  return (
    <div
      style={{
        display: "flex",
        gap: 12,
        alignItems: "stretch",
        width: "100%",
        height: typeof height === "number" ? `${height}px` : height,
      }}
    >
      {/* left: events list */}
      <div
        style={{
          width: leftPanelWidth,
          background: "#ffffff",
          borderRadius: 8,
          boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div style={{ padding: "12px 14px", borderBottom: "1px solid #eee", background: "#f8fafc" }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#0f172a" }}>Shipment Journey</div>
          <div style={{ marginTop: 4, fontSize: 12, color: "#6b7280" }}>
            Live: {liveLatest ? new Date(liveLatest.Timestamp).toLocaleTimeString() : "waiting..."}
            {liveLatest?.Speed != null ? ` • ${Math.round(liveLatest.Speed)} km/h` : ""}
          </div>
        </div>

        <div style={{ overflowY: "auto", padding: 8 }}>
          {points.length === 0 && (
            <div style={{ padding: 12, color: "#6b7280" }}>No geo-coordinates available for events.</div>
          )}

          {points.map((p, idx) => {
            const ev = p.event;
            const f: Record<string, unknown> = ev.fields ?? {};
            const isSelected = selectedId === ev.id;

            let pointLabel = "";
            let pointColor = "";
            let showMarkerIndicator = false;

            if (idx === 0) {
              pointLabel = "Source";
              pointColor = pinColors.start;
              showMarkerIndicator = true;
            } else if (idx === points.length - 1) {
              pointLabel = "Destination";
              pointColor = pinColors.end;
              showMarkerIndicator = true;
            } else {
              pointLabel = `Transit Point ${idx}`;
              pointColor = pinColors.mid;
              showMarkerIndicator = false;
            }

            const title = asText((f as any).Action ?? (f as any).EventName ?? (f as any).Code, "Event");
            const stopId = asText((f as any).StopId ?? (f as any).stopId, "—");
            const timeRaw = (f as any).CreatedAt ?? (f as any).createdAt ?? null;

            return (
              <div
                key={ev.id}
                data-event-id={ev.id}
                onClick={() => {
                  setSelectedId(ev.id);
                  onSelectEvent?.(ev);

                  const m = sdMarkersRef.current.find((mk) => (mk as any).__eventId === ev.id);
                  if (m) {
                    google.maps.event.trigger(m as any, "click");
                  } else if (mapRef.current) {
                    mapRef.current.panTo({ lat: p.lat, lng: p.lng });
                    mapRef.current.setZoom(12);
                  }
                }}
                style={{
                  background: isSelected ? "#f0f9ff" : "white",
                  border: isSelected ? "1px solid rgba(59,130,246,0.25)" : "1px solid #eef2f7",
                  borderRadius: 6,
                  padding: 10,
                  marginBottom: 10,
                  cursor: "pointer",
                  transition: "all 0.2s ease",
                  position: "relative",
                }}
              >
                {showMarkerIndicator && (
                  <div
                    style={{
                      position: "absolute",
                      top: 8,
                      right: 8,
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      background: pointColor,
                      boxShadow: "0 0 0 2px rgba(255,255,255,0.8), 0 0 0 3px " + pointColor + "40",
                    }}
                    title="Shown on map"
                  />
                )}

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start" }}>
                  <div style={{ fontWeight: 700, color: "#0f172a", fontSize: 13 }}>{title}</div>
                  <div
                    style={{
                      fontSize: 11,
                      color: "white",
                      background: pointColor,
                      padding: "2px 8px",
                      borderRadius: 4,
                      fontWeight: 600,
                      opacity: showMarkerIndicator ? 1 : 0.7,
                    }}
                  >
                    {pointLabel}
                  </div>
                </div>

                <div style={{ marginTop: 6, color: "#374151", fontSize: 13 }}>
                  <div style={{ marginBottom: 6 }}>
                    <strong>Stop ID:</strong> <span style={{ color: "#334155" }}>{stopId}</span>
                  </div>
                  <div style={{ fontSize: 12, color: "#6b7280" }}>
                    <strong>Time:</strong> {asText(timeRaw, "—")}
                  </div>
                  {!showMarkerIndicator && (
                    <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 4, fontStyle: "italic" }}>
                      (Transit point - not shown on map)
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* right: map */}
      <div style={{ flex: 1, minHeight: 0 }}>
        {!isLoaded ? (
          <div
            style={{
              ...containerBaseStyle,
              height: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            Loading map…
          </div>
        ) : (
          <div style={{ ...containerBaseStyle, height: "100%" }}>
            <GoogleMap
              mapContainerStyle={{ width: "100%", height: "100%" }}
              center={points.length ? { lat: points[0].lat, lng: points[0].lng } : { lat: 20, lng: 0 }}
              zoom={3}
              options={{
                mapTypeId: "roadmap",
                streetViewControl: false,
                fullscreenControl: false,
                zoomControl: true,
                clickableIcons: false,
                mapTypeControl: false,
                styles: [
                  {
                    featureType: "poi",
                    elementType: "labels",
                    stylers: [{ visibility: "off" }],
                  },
                ],
              }}
              onLoad={(map) => {
                mapRef.current = map;
              }}
              onUnmount={() => {
                mapRef.current = null;

                try {
                  sdMarkersRef.current.forEach((m) => ((m as any).map = null));
                } catch {
                  /* empty */
                }
                sdMarkersRef.current = [];

                try {
                  if (truckMarkerRef.current) (truckMarkerRef.current as any).map = null;
                } catch {
                  /* empty */
                }
                truckMarkerRef.current = null;

                if (infoWindowRef.current) {
                  infoWindowRef.current.close();
                  infoWindowRef.current = null;
                }
              }}
            >
              {/* Live polyline (truck trail) */}
              {livePath.length >= 2 && (
                <Polyline
                  path={livePath}
                  options={{
                    strokeOpacity: 0.8,
                    strokeWeight: 4,
                    geodesic: true,
                    clickable: false,
                  }}
                />
              )}

              {/* Event polyline (journey) */}
              {eventPath.length >= 2 && (
                <Polyline
                  path={eventPath}
                  options={{
                    strokeOpacity: 0.35,
                    strokeWeight: 3,
                    geodesic: true,
                    clickable: false,
                  }}
                />
              )}
            </GoogleMap>
          </div>
        )}
      </div>
    </div>
  );
}
