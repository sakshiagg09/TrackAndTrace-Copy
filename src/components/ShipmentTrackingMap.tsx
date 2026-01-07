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
  foId: string;
  pollMs?: number;
  historyLimit?: number;
}

type LivePoint = {
  FoId: string;
  DriverId?: string;
  Latitude: number;
  Longitude: number;
  Accuracy?: number | null;
  Timestamp: number;
  Speed?: number | null;
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

/**
 * ✅ Debug-friendly lat/lng parsing:
 * - tries many keys
 * - logs what it found
 */
function parseLatLng(fields: Record<string, any>, debugId?: string) {
  const latRaw =
    fields?.Latitude ??
    fields?.latitude ??
    fields?.EventLat ??
    fields?.eventLat ??
    fields?.geoLat ??
    fields?.GeoLocation?.Latitude;

  const lonRaw =
    fields?.Longitude ??
    fields?.longitude ??
    fields?.EventLong ??
    fields?.eventLong ??
    fields?.geoLon ??
    fields?.GeoLocation?.Longitude;

  const lat = latRaw == null ? NaN : parseFloat(String(latRaw));
  const lng = lonRaw == null ? NaN : parseFloat(String(lonRaw));

  // 🔎 DEBUG
  console.debug("[MAP] parseLatLng", {
    debugId,
    latRaw,
    lonRaw,
    parsed: { lat, lng },
    finite: { lat: Number.isFinite(lat), lng: Number.isFinite(lng) },
    keys: Object.keys(fields || {}),
  });

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

function makeMarkerContent(color: string, label?: string) {
  return `
    <div style="display:flex;flex-direction:column;align-items:center;pointer-events:none;">
      <div style="height:28px;border-radius:14px;background:${color};display:flex;align-items:center;justify-content:center;box-shadow:0 1px 4px rgba(0,0,0,0.25);padding:0 10px;">
        ${
          label
            ? `<div style="font-size:11px;color:white;font-weight:700;white-space:nowrap;">${escapeHtml(label)}</div>`
            : ""
        }
      </div>
      <div style="width:2px;height:10px;background:${color};margin-top:2px;border-radius:1px;"></div>
    </div>
  `;
}

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
  const url = `${API_BASE}${path}`;
  console.log("[MAP] apiGetJson ->", url);
  const res = await fetch(url);
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    console.error("[MAP] API failed", res.status, path, txt);
    throw new Error(`API failed: ${res.status} ${path}`);
  }
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

  // ✅ Top-level debug
  useEffect(() => {
    console.groupCollapsed("[MAP] props");
    console.log("foId:", foId);
    console.log("events length:", events?.length);
    console.log("events sample:", (events || []).slice(0, 2));
    console.groupEnd();
  }, [foId, events]);

  if (!apiKey) {
    console.error("[MAP] Missing VITE_GOOGLE_MAPS_API_KEY");
    return <div style={{ padding: 12, color: "crimson" }}>Missing VITE_GOOGLE_MAPS_API_KEY in env.</div>;
  }

  const GOOGLE_MAP_LIBRARIES: ("marker")[] = ["marker"];

  const { isLoaded, loadError } = useJsApiLoader({
    id: "google-map-script",
    googleMapsApiKey: apiKey,
    libraries: GOOGLE_MAP_LIBRARIES,
  });

  useEffect(() => {
    console.log("[MAP] google loader", { isLoaded, loadError });
  }, [isLoaded, loadError]);

  // ---- points from events ----
  const points = useMemo(() => {
    console.groupCollapsed("[MAP] building points from events");
    const out =
      (events ?? [])
        .map((e) => {
          const coords = parseLatLng(e.fields as any, e.id);
          if (!coords) {
            console.warn("[MAP] event has NO coords -> filtered out", e.id, e.fields);
            return null;
          }
          return { ...coords, event: e };
        })
        .filter((p): p is { lat: number; lng: number; event: RawEvent } => !!p) || [];
    console.log("points length:", out.length);
    console.log("points sample:", out.slice(0, 3));
    console.groupEnd();
    return out;
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

        console.log("[MAP] latest raw:", j);

        const lat = toNum(j?.Latitude);
        const lng = toNum(j?.Longitude);
        const ts = toNum(j?.Timestamp);

        console.log("[MAP] latest parsed:", { lat, lng, ts });

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
      } catch (e) {
        console.warn("[MAP] latest poll failed:", e);
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

        console.log("[MAP] history raw length:", Array.isArray(arr) ? arr.length : "not array");

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

        console.log("[MAP] history cleaned length:", cleaned.length);
        setLiveHistory(cleaned);
      } catch (e) {
        console.warn("[MAP] history poll failed:", e);
      }
    };

    tick();
    t = setInterval(tick, Math.max(4000, pollMs * 2));

    return () => {
      alive = false;
      if (t) clearInterval(t);
    };
  }, [foId, pollMs, historyLimit]);

  // ✅ whenever points change, fit map
  useEffect(() => {
    console.log("[MAP] fitBounds effect", { isLoaded, hasMap: !!mapRef.current, points: points.length });
    if (!isLoaded || !mapRef.current) return;
    if (points.length === 0) return;

    try {
      const bounds = new google.maps.LatLngBounds();
      points.forEach((p) => bounds.extend({ lat: p.lat, lng: p.lng }));
      mapRef.current.fitBounds(bounds, 80);
      console.log("[MAP] fitBounds done");
    } catch (e) {
      console.warn("[MAP] fitBounds failed", e);
    }
  }, [isLoaded, points]);

  // ---- markers for first/last points ----
  useEffect(() => {
    console.log("[MAP] marker effect", { isLoaded, hasMap: !!mapRef.current, points: points.length });
    if (!isLoaded || !mapRef.current) return;

    // clear
    try {
      sdMarkersRef.current.forEach((m) => ((m as any).map = null));
    } catch {}
    sdMarkersRef.current = [];

    if (points.length === 0) return;

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

      const title = asText((p.event.fields as any)?.Action ?? "Event", label);

      console.log("[MAP] creating marker", { role, label, title, pos: { lat: p.lat, lng: p.lng }, eventId: p.event.id });

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
      });

      sdMarkersRef.current.push(advancedMarker);
    });

    console.log("[MAP] markers created:", sdMarkersRef.current.length);

    return () => {
      try {
        sdMarkersRef.current.forEach((m) => ((m as any).map = null));
      } catch {}
      sdMarkersRef.current = [];
    };
  }, [isLoaded, points, onSelectEvent]);

  // ---- truck marker ----
  useEffect(() => {
    console.log("[MAP] truck effect", { isLoaded, hasMap: !!mapRef.current, hasLatest: !!liveLatest });
    if (!isLoaded || !mapRef.current) return;
    if (!liveLatest) return;

    const pos = { lat: liveLatest.Latitude, lng: liveLatest.Longitude };

    if (!truckMarkerRef.current) {
      const wrapper = document.createElement("div");
      wrapper.innerHTML = makeTruckMarkerHtml(liveLatest.Speed);
      const contentEl = wrapper.firstElementChild as HTMLElement;

      console.log("[MAP] creating truck marker", pos);

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
      (truckMarkerRef.current as any).content = wrapper.firstElementChild as HTMLElement;
      console.log("[MAP] updated truck marker", pos);
    } catch (e) {
      console.warn("[MAP] update truck marker failed", e);
    }
  }, [isLoaded, liveLatest]);

  // ---- polylines ----
  const eventPath = useMemo(() => {
    const path = points.map((p) => ({ lat: p.lat, lng: p.lng }));
    console.log("[MAP] eventPath length:", path.length, path.slice(0, 3));
    return path;
  }, [points]);

  const livePath = useMemo(() => {
    const path = (liveHistory || []).map((p) => ({ lat: p.Latitude, lng: p.Longitude }));
    console.log("[MAP] livePath length:", path.length, path.slice(0, 3));
    return path;
  }, [liveHistory]);

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
      {/* left */}
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
            <div style={{ padding: 12, color: "#6b7280" }}>
              No geo-coordinates available for events.
              <div style={{ marginTop: 6, fontSize: 12 }}>
                Open Console → look for <b>[MAP] event has NO coords</b> logs.
              </div>
            </div>
          )}

          {points.map((p) => {
            const ev = p.event;
            const f: Record<string, unknown> = ev.fields ?? {};
            const isSelected = selectedId === ev.id;

            const title = asText((f as any).Action ?? "Event");
            const stopId = asText((f as any).StopId ?? "—");
            const timeRaw = (f as any).CreatedAt ?? null;

            return (
              <div
                key={ev.id}
                data-event-id={ev.id}
                onClick={() => setSelectedId(ev.id)}
                style={{
                  background: isSelected ? "#f0f9ff" : "white",
                  border: isSelected ? "1px solid rgba(59,130,246,0.25)" : "1px solid #eef2f7",
                  borderRadius: 6,
                  padding: 10,
                  marginBottom: 10,
                  cursor: "pointer",
                }}
              >
                <div style={{ fontWeight: 700, color: "#0f172a", fontSize: 13 }}>{title}</div>
                <div style={{ marginTop: 6, color: "#374151", fontSize: 13 }}>
                  <div style={{ marginBottom: 6 }}>
                    <strong>Stop ID:</strong> <span style={{ color: "#334155" }}>{stopId}</span>
                  </div>
                  <div style={{ fontSize: 12, color: "#6b7280" }}>
                    <strong>Time:</strong> {asText(timeRaw, "—")}
                  </div>
                  <div style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>
                    <strong>Lat/Lng:</strong> {p.lat}, {p.lng}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* map */}
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
              }}
              onLoad={(map) => {
                mapRef.current = map;
                console.log("[MAP] map loaded", map);
              }}
              onUnmount={() => {
                console.log("[MAP] map unmounted");
                mapRef.current = null;
              }}
            >
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
