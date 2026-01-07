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

  /** REQUIRED for live tracking */
  foId: string;

  pollMs?: number;
  historyLimit?: number;
}

type LivePoint = {
  FoId: string;
  DriverId?: string;
  Latitude: number;
  Longitude: number;
  Timestamp: number;
  Speed?: number | null;
  Bearing?: number | null;
  Accuracy?: number | null;
};

const API_BASE = (import.meta as any).env?.VITE_API_BASE || "";
const MAP_ID = (import.meta as any).env?.VITE_GOOGLE_MAP_ID as string | undefined;

// ✅ IMPORTANT: keep this OUTSIDE component (fixes reload warning)
const LIBRARIES: ("marker")[] = ["marker"];

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
  try {
    return JSON.stringify(v);
  } catch {
    return fallback;
  }
}

function parseLatLng(fields: Record<string, any>) {
  // ✅ includes your Events payload fields
  const latRaw =
    fields?.Latitude ??
    fields?.latitude ??
    fields?.EventLat ??
    fields?.eventLat ??
    fields?.GeoLocation?.Latitude;

  const lonRaw =
    fields?.Longitude ??
    fields?.longitude ??
    fields?.EventLong ??
    fields?.eventLong ??
    fields?.GeoLocation?.Longitude;

  const lat = latRaw == null ? NaN : parseFloat(String(latRaw));
  const lng = lonRaw == null ? NaN : parseFloat(String(lonRaw));
  if (Number.isNaN(lat) || Number.isNaN(lng)) return null;
  return { lat, lng };
}

function escapeHtml(s: unknown) {
  if (s === null || s === undefined) return "";
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function buildInfoHtml(fields: Record<string, unknown>) {
  const action = asText((fields as any)?.Action ?? (fields as any)?.EventName ?? (fields as any)?.Code, "Event");
  const stopId = asText((fields as any)?.StopId ?? (fields as any)?.stopId, "—");
  const createdAt = asText((fields as any)?.CreatedAt ?? (fields as any)?.createdAt, "—");

  return `
    <div style="font-size:13px;max-width:260px">
      <div style="font-weight:700;margin-bottom:6px;">${escapeHtml(action)}</div>
      <div style="font-size:12px;color:#374151;margin-bottom:4px;">
        <strong>Stop ID:</strong> ${escapeHtml(stopId)}
      </div>
      <div style="font-size:12px;color:#374151;">
        <strong>Time:</strong> ${escapeHtml(createdAt)}
      </div>
    </div>
  `;
}

function makeMarkerContent(color: string, label: string) {
  return `
    <div style="display:flex;flex-direction:column;align-items:center;pointer-events:none;">
      <div style="min-width:28px;height:28px;border-radius:14px;background:${color};display:flex;align-items:center;justify-content:center;box-shadow:0 1px 4px rgba(0,0,0,0.25);padding:0 10px;">
        <div style="font-size:11px;color:white;font-weight:800;white-space:nowrap;">${escapeHtml(label)}</div>
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
          ? `<div style="margin-top:4px;background:white;border:1px solid rgba(0,0,0,0.1);border-radius:999px;padding:2px 8px;font-size:11px;font-weight:800;color:#111827;box-shadow:0 1px 4px rgba(0,0,0,0.08);">${escapeHtml(
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

  // ✅ Early env validation
  if (!apiKey) return <div style={{ padding: 12, color: "crimson" }}>Missing VITE_GOOGLE_MAPS_API_KEY</div>;
  if (!MAP_ID) return <div style={{ padding: 12, color: "crimson" }}>Missing VITE_GOOGLE_MAP_ID</div>;

  const { isLoaded, loadError } = useJsApiLoader({
    id: "google-map-script",
    googleMapsApiKey: apiKey,
    libraries: LIBRARIES,
  });

  console.log("[MAP] google loader", { isLoaded, loadError, MAP_ID });

  // ---- Build points from events ----
  const points = useMemo(() => {
    console.log("[MAP] building points from events. events length:", events?.length || 0);

    const out =
      (events ?? [])
        .map((e, idx) => {
          const coords = parseLatLng(e.fields as any);
          if (!coords) {
            console.log("[MAP] skip event (no coords)", idx, e?.id, e?.fields);
            return null;
          }
          return { ...coords, event: e };
        })
        .filter(Boolean) as { lat: number; lng: number; event: RawEvent }[];

    console.log("[MAP] points built:", out.length, out);
    return out;
  }, [events]);

  const mapRef = useRef<google.maps.Map | null>(null);

  // Markers refs
  const sdMarkersRef = useRef<any[]>([]);
  const sdFallbackMarkersRef = useRef<google.maps.Marker[]>([]);
  const truckMarkerRef = useRef<any | null>(null);
  const truckFallbackRef = useRef<google.maps.Marker | null>(null);

  const infoWindowRef = useRef<google.maps.InfoWindow | null>(null);
  const [, setSelectedId] = useState<string | null>(null);

  // Live tracking state
  const [liveLatest, setLiveLatest] = useState<LivePoint | null>(null);
  const [liveHistory, setLiveHistory] = useState<LivePoint[]>([]);

  // 1) Poll latest
  useEffect(() => {
    if (!foId) return;

    let alive = true;
    const tick = async () => {
      try {
        const j: any = await apiGetJson(`/api/tracking/latest?FoId=${encodeURIComponent(foId)}`);
        console.log("[MAP] latest raw:", j);

        const lat = toNum(j?.Latitude);
        const lng = toNum(j?.Longitude);
        const ts = toNum(j?.Timestamp);

        console.log("[MAP] latest parsed:", { lat, lng, ts });

        if (!alive) return;
        if (lat == null || lng == null || ts == null) return;

        setLiveLatest({
          FoId: String(j.FoId || foId),
          DriverId: j.DriverId ? String(j.DriverId) : undefined,
          Latitude: lat,
          Longitude: lng,
          Timestamp: ts,
          Speed: j.Speed == null ? null : toNum(j.Speed),
          Bearing: j.Bearing == null ? null : toNum(j.Bearing),
          Accuracy: j.Accuracy == null ? null : toNum(j.Accuracy),
        });
      } catch (e) {
        console.log("[MAP] latest fetch failed:", e);
      }
    };

    tick();
    const t = setInterval(tick, pollMs);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [foId, pollMs]);

  // 2) Poll history
  useEffect(() => {
    if (!foId) return;

    let alive = true;
    const tick = async () => {
      try {
        const arr: any[] = await apiGetJson(
          `/api/tracking/history?FoId=${encodeURIComponent(foId)}&limit=${encodeURIComponent(String(historyLimit))}`
        );

        console.log("[MAP] history raw length:", Array.isArray(arr) ? arr.length : "not array");

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
              Timestamp: ts,
              Speed: p?.Speed == null ? null : toNum(p.Speed),
              Bearing: p?.Bearing == null ? null : toNum(p.Bearing),
              Accuracy: p?.Accuracy == null ? null : toNum(p.Accuracy),
            };
          })
          .filter(Boolean) as LivePoint[];

        console.log("[MAP] history cleaned length:", cleaned.length);
        setLiveHistory(cleaned);
      } catch (e) {
        console.log("[MAP] history fetch failed:", e);
      }
    };

    tick();
    const t = setInterval(tick, Math.max(4000, pollMs * 2));
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [foId, pollMs, historyLimit]);

  // polylines
  const eventPath = useMemo(() => points.map((p) => ({ lat: p.lat, lng: p.lng })), [points]);
  const livePath = useMemo(() => (liveHistory || []).map((p) => ({ lat: p.Latitude, lng: p.Longitude })), [liveHistory]);

  console.log("[MAP] eventPath length:", eventPath.length, eventPath.slice(0, 3));
  console.log("[MAP] livePath length:", livePath.length, livePath.slice(0, 3));

  // Create / update S/D markers
  useEffect(() => {
    console.log("[MAP] marker effect", { isLoaded, hasMap: !!mapRef.current, points: points.length });

    if (!isLoaded || !mapRef.current) return;

    // clear old
    sdMarkersRef.current.forEach((m) => {
      try {
        (m as any).map = null;
      } catch {}
    });
    sdMarkersRef.current = [];

    sdFallbackMarkersRef.current.forEach((m) => {
      try {
        m.setMap(null);
      } catch {}
    });
    sdFallbackMarkersRef.current = [];

    if (points.length === 0) return;

    const markerPoints =
      points.length === 1
        ? [{ point: points[0], role: "start" as const }]
        : [
            { point: points[0], role: "start" as const },
            { point: points[points.length - 1], role: "end" as const },
          ];

    markerPoints.forEach(({ point: p, role }) => {
      const label = role === "start" ? "Source" : "Destination";
      const color = role === "start" ? pinColors.start : pinColors.end;
      const title = asText((p.event.fields as any)?.Action ?? (p.event.fields as any)?.EventName ?? (p.event.fields as any)?.Code, label);
      const pos = { lat: p.lat, lng: p.lng };

      console.log("[MAP] creating marker", { role, label, title, pos, eventId: p.event.id });

      // Try AdvancedMarkerElement first
      try {
        const wrapper = document.createElement("div");
        wrapper.innerHTML = makeMarkerContent(color, label);
        const contentEl = wrapper.firstElementChild as HTMLElement;

        const adv = new (google.maps as any).marker.AdvancedMarkerElement({
          position: pos,
          map: mapRef.current,
          content: contentEl,
          title,
        });

        (adv as any).__eventId = p.event.id;

        adv.addListener("click", () => {
          setSelectedId(p.event.id);
          onSelectEvent?.(p.event);
          if (!infoWindowRef.current) infoWindowRef.current = new google.maps.InfoWindow({ maxWidth: 320 });
          infoWindowRef.current.setContent(buildInfoHtml(p.event.fields));
          infoWindowRef.current.open({ anchor: adv, map: mapRef.current! });
        });

        sdMarkersRef.current.push(adv);
        return;
      } catch (e) {
        console.log("[MAP] AdvancedMarker failed, using fallback Marker:", e);
      }

      // Fallback normal Marker
      const mk = new google.maps.Marker({
        position: pos,
        map: mapRef.current!,
        title,
        label: label === "Source" ? "S" : "D",
      });

      mk.addListener("click", () => {
        setSelectedId(p.event.id);
        onSelectEvent?.(p.event);
        if (!infoWindowRef.current) infoWindowRef.current = new google.maps.InfoWindow({ maxWidth: 320 });
        infoWindowRef.current.setContent(buildInfoHtml(p.event.fields));
        infoWindowRef.current.open(mapRef.current!, mk);
      });

      sdFallbackMarkersRef.current.push(mk);
    });

    console.log("[MAP] markers created:", markerPoints.length);

    // Fit bounds
    try {
      const bounds = new google.maps.LatLngBounds();
      points.forEach((pt) => bounds.extend({ lat: pt.lat, lng: pt.lng }));
      mapRef.current.fitBounds(bounds, 80);
      console.log("[MAP] fitBounds done");
    } catch (e) {
      console.log("[MAP] fitBounds failed:", e);
    }
  }, [isLoaded, points, onSelectEvent]);

  // Truck marker
  useEffect(() => {
    console.log("[MAP] truck effect", { isLoaded, hasMap: !!mapRef.current, hasLatest: !!liveLatest });
    if (!isLoaded || !mapRef.current || !liveLatest) return;

    const pos = { lat: liveLatest.Latitude, lng: liveLatest.Longitude };

    // AdvancedMarker
    try {
      if (!truckMarkerRef.current) {
        const wrapper = document.createElement("div");
        wrapper.innerHTML = makeTruckMarkerHtml(liveLatest.Speed);
        const el = wrapper.firstElementChild as HTMLElement;

        truckMarkerRef.current = new (google.maps as any).marker.AdvancedMarkerElement({
          position: pos,
          map: mapRef.current,
          content: el,
          title: "Truck",
        });
      } else {
        (truckMarkerRef.current as any).position = pos;
      }

      mapRef.current.panTo(pos);
      return;
    } catch (e) {
      console.log("[MAP] Advanced truck marker failed, fallback:", e);
    }

    // Fallback marker
    if (!truckFallbackRef.current) {
      truckFallbackRef.current = new google.maps.Marker({
        position: pos,
        map: mapRef.current,
        title: "Truck",
      });
    } else {
      truckFallbackRef.current.setPosition(pos);
    }

    mapRef.current.panTo(pos);
  }, [isLoaded, liveLatest]);

  if (loadError) {
    return <div style={{ padding: 12, color: "crimson" }}>Google Maps failed to load: {String(loadError)}</div>;
  }

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
      {/* left panel */}
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
          <div style={{ fontSize: 14, fontWeight: 800, color: "#0f172a" }}>Shipment Journey</div>
          <div style={{ marginTop: 4, fontSize: 12, color: "#6b7280" }}>
            Live: {liveLatest ? new Date(liveLatest.Timestamp).toLocaleTimeString() : "waiting..."}
          </div>
          <div style={{ marginTop: 4, fontSize: 11, color: "#94a3b8" }}>
            events={events?.length || 0} • points={points.length} • mapId={MAP_ID ? "OK" : "MISSING"}
          </div>
        </div>

        <div style={{ overflowY: "auto", padding: 8 }}>
          {points.length === 0 && (
            <div style={{ padding: 12, color: "#6b7280" }}>
              No geo-coordinates found in events. Check logs: “[MAP] skip event (no coords)”.
            </div>
          )}

          {points.map((p, idx) => {
            const f: any = p.event.fields || {};
            const title = asText(f.Action ?? f.EventName ?? f.Code, "Event");
            const stopId = asText(f.StopId, "—");
            const timeRaw = asText(f.CreatedAt, "—");

            const isFirst = idx === 0;
            const isLast = idx === points.length - 1;
            const badge = isFirst ? "Source" : isLast ? "Destination" : `Point ${idx + 1}`;

            return (
              <div
                key={p.event.id}
                onClick={() => {
                  setSelectedId(p.event.id);
                  mapRef.current?.panTo({ lat: p.lat, lng: p.lng });
                  mapRef.current?.setZoom(12);
                }}
                style={{
                  background: "white",
                  border: "1px solid #eef2f7",
                  borderRadius: 6,
                  padding: 10,
                  marginBottom: 10,
                  cursor: "pointer",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start" }}>
                  <div style={{ fontWeight: 800, color: "#0f172a", fontSize: 13 }}>{title}</div>
                  <div
                    style={{
                      fontSize: 11,
                      color: "white",
                      background: isFirst ? pinColors.start : isLast ? pinColors.end : "#1f6feb",
                      padding: "2px 8px",
                      borderRadius: 4,
                      fontWeight: 700,
                    }}
                  >
                    {badge}
                  </div>
                </div>

                <div style={{ marginTop: 6, color: "#374151", fontSize: 13 }}>
                  <div style={{ marginBottom: 4 }}>
                    <strong>Stop:</strong> {stopId}
                  </div>
                  <div style={{ fontSize: 12, color: "#6b7280" }}>
                    <strong>Time:</strong> {timeRaw}
                  </div>
                  <div style={{ fontSize: 12, color: "#6b7280" }}>
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
          <div style={{ ...containerBaseStyle, height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
            Loading map…
          </div>
        ) : (
          <div style={{ ...containerBaseStyle, height: "100%" }}>
            <GoogleMap
              mapContainerStyle={{ width: "100%", height: "100%" }}
              center={points.length ? { lat: points[0].lat, lng: points[0].lng } : { lat: 20, lng: 0 }}
              zoom={points.length ? 10 : 3}
              options={{
                // ✅ THIS is what fixes Advanced Marker rendering
                mapId: MAP_ID,
                mapTypeId: "roadmap",
                streetViewControl: false,
                fullscreenControl: false,
                zoomControl: true,
                clickableIcons: false,
                mapTypeControl: false,
              }}
              onLoad={(map) => {
                console.log("[MAP] map loaded", map);
                mapRef.current = map;

                try {
                  const bounds = new google.maps.LatLngBounds();
                  if (points.length > 0) {
                    points.forEach((pt) => bounds.extend({ lat: pt.lat, lng: pt.lng }));
                    map.fitBounds(bounds, 80);
                  } else if (liveLatest) {
                    bounds.extend({ lat: liveLatest.Latitude, lng: liveLatest.Longitude });
                    map.fitBounds(bounds, 200);
                  }
                } catch (e) {
                  console.log("[MAP] onLoad fitBounds error:", e);
                }
              }}
              onUnmount={() => {
                mapRef.current = null;
              }}
            >
              {/* Live polyline */}
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

              {/* Event polyline */}
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
