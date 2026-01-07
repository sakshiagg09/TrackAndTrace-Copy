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
  Speed?: number | null; // km/h
  Bearing?: number | null;
};

// ✅ KEEP OUTSIDE COMPONENT (stable reference)
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

  if (Number.isNaN(lat) || Number.isNaN(lng)) return null;
  return { lat, lng };
}

function escapeHtml(s: unknown) {
  if (s === null || s === undefined) return "";
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function buildListItemHtml(fields: Record<string, unknown>) {
  const title = asText((fields as any)?.EventName ?? (fields as any)?.Code, "Event");
  const stopId = asText((fields as any)?.StopId ?? (fields as any)?.stopId, "—");

  return `
    <div style="font-size:13px;max-width:260px">
      <div style="font-weight:600;margin-bottom:4px;">${escapeHtml(title)}</div>
      <div style="font-size:12px;color:#374151;margin-bottom:4px;">
        <strong>Stop ID:</strong> ${escapeHtml(stopId)}
      </div>
    </div>
  `;
}

function makeMarkerContent(color: string, label?: string) {
  const isLongLabel = !!label && label.length > 1;
  const minWidth = isLongLabel ? "auto" : "28px";
  const padding = isLongLabel ? "0 10px" : "0";
  const height = "28px";

  return `
    <div style="display:flex;flex-direction:column;align-items:center;pointer-events:none;">
      <div style="min-width:${minWidth};height:${height};border-radius:14px;background:${color};
        display:flex;align-items:center;justify-content:center;box-shadow:0 1px 4px rgba(0,0,0,0.25);padding:${padding};">
        ${
          label
            ? `<div style="font-size:${isLongLabel ? "11px" : "12px"};color:white;font-weight:700;white-space:nowrap;">
                ${escapeHtml(label)}
               </div>`
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
      <div style="width:34px;height:34px;border-radius:999px;background:${pinColors.truck};
        display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,0.25);">
        <div style="font-size:18px;line-height:18px;color:white;">🚚</div>
      </div>
      ${
        sp
          ? `<div style="margin-top:4px;background:white;border:1px solid rgba(0,0,0,0.1);
              border-radius:999px;padding:2px 8px;font-size:11px;font-weight:700;color:#111827;
              box-shadow:0 1px 4px rgba(0,0,0,0.08);">${escapeHtml(sp)}</div>`
          : ""
      }
    </div>
  `;
}

function mask(s?: string) {
  if (!s) return "";
  if (s.length <= 8) return "***";
  return `${s.slice(0, 4)}…${s.slice(-4)}`;
}

export default function ShipmentTrackingMap({
  events,
  foId,
  height = 520,
  onSelectEvent,
  pollMs = 3000,
  historyLimit = 300,
}: ShipmentTrackingMapProps) {
  const API_BASE = (import.meta as any).env?.VITE_API_BASE || "";
  const MAP_ID = (import.meta as any).env?.VITE_GOOGLE_MAP_ID as string | undefined;
  const apiKey = (import.meta as any).env?.VITE_GOOGLE_MAPS_API_KEY as string | undefined;

  // ✅ LOG ENV ONCE
  const envLoggedRef = useRef(false);
  if (!envLoggedRef.current) {
    envLoggedRef.current = true;
    console.log("[MAP][ENV]", {
      MODE: (import.meta as any).env?.MODE,
      API_BASE,
      MAP_ID: MAP_ID ? mask(MAP_ID) : null,
      HAS_API_KEY: !!apiKey,
      NOTE:
        "If MAP_ID is null ONLY in production => env not injected at build-time (GitHub Actions / build pipeline).",
    });
  }

  // Hard fail (keeps issue obvious)
  if (!apiKey) return <div style={{ padding: 12, color: "crimson" }}>Missing VITE_GOOGLE_MAPS_API_KEY</div>;
  if (!MAP_ID) return <div style={{ padding: 12, color: "crimson" }}>Missing VITE_GOOGLE_MAP_ID</div>;

  const { isLoaded, loadError } = useJsApiLoader({
    id: "google-map-script",
    googleMapsApiKey: apiKey,
    libraries: LIBRARIES,
  });

  useEffect(() => {
    console.log("[MAP][LOADER]", { isLoaded, loadError: loadError ? String(loadError) : null });
  }, [isLoaded, loadError]);

  // ---- points from events ----
  const points = useMemo(() => {
    const out =
      (events ?? [])
        .map((e, idx) => {
          const coords = parseLatLng(e.fields as any);
          if (!coords) {
            console.log("[MAP][EVENT] skip (no coords)", { idx, id: e?.id, fields: e?.fields });
            return null;
          }
          return { ...coords, event: e };
        })
        .filter(Boolean) as { lat: number; lng: number; event: RawEvent }[];

    console.log("[MAP][EVENT] points built", { events: events?.length || 0, points: out.length });
    return out;
  }, [events]);

  const mapRef = useRef<google.maps.Map | null>(null);

  // markers refs
  const sdAdvMarkersRef = useRef<any[]>([]);
  const sdFallbackMarkersRef = useRef<google.maps.Marker[]>([]);
  const truckAdvRef = useRef<any | null>(null);
  const truckFallbackRef = useRef<google.maps.Marker | null>(null);

  const infoWindowRef = useRef<google.maps.InfoWindow | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // ---- Live tracking state ----
  const [liveLatest, setLiveLatest] = useState<LivePoint | null>(null);
  const [liveHistory, setLiveHistory] = useState<LivePoint[]>([]);

  async function apiGetJson<T>(path: string): Promise<T> {
    const url = `${API_BASE}${path}`;
    console.log("[MAP][API] GET", url);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`API failed: ${res.status} ${path}`);
    return res.json();
  }

  // 1) Poll latest
  useEffect(() => {
    if (!foId) return;

    let alive = true;

    const tick = async () => {
      try {
        const j: any = await apiGetJson(`/api/tracking/latest?FoId=${encodeURIComponent(foId)}`);
        const lat = toNum(j?.Latitude);
        const lng = toNum(j?.Longitude);
        const ts = toNum(j?.Timestamp);

        console.log("[MAP][LIVE] latest raw/parsed", { raw: j, lat, lng, ts });

        if (!alive) return;
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
        console.log("[MAP][LIVE] latest failed", e);
      }
    };

    tick();
    const t = setInterval(tick, pollMs);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [foId, pollMs, API_BASE]);

  // 2) Poll history
  useEffect(() => {
    if (!foId) return;

    let alive = true;

    const tick = async () => {
      try {
        const arr: any[] = await apiGetJson(
          `/api/tracking/history?FoId=${encodeURIComponent(foId)}&limit=${encodeURIComponent(String(historyLimit))}`
        );

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

        console.log("[MAP][LIVE] history", {
          rawLen: Array.isArray(arr) ? arr.length : -1,
          cleanedLen: cleaned.length,
        });

        if (!alive) return;
        setLiveHistory(cleaned);
      } catch (e) {
        console.log("[MAP][LIVE] history failed", e);
      }
    };

    tick();
    const t = setInterval(tick, Math.max(4000, pollMs * 2));
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [foId, pollMs, historyLimit, API_BASE]);

  // polylines
  const eventPath = useMemo(() => points.map((p) => ({ lat: p.lat, lng: p.lng })), [points]);
  const livePath = useMemo(() => (liveHistory || []).map((p) => ({ lat: p.Latitude, lng: p.Longitude })), [liveHistory]);

  // ---- S/D markers (events) ----
  useEffect(() => {
    if (!isLoaded || !mapRef.current) return;

    // clear old
    sdAdvMarkersRef.current.forEach((m) => {
      try {
        (m as any).map = null;
      } catch {}
    });
    sdAdvMarkersRef.current = [];

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
      const color = role === "start" ? pinColors.start : pinColors.end;
      const label = role === "start" ? "Source" : "Destination";
      const title = asText((p.event.fields as any)?.EventName ?? (p.event.fields as any)?.Code, label);
      const pos = { lat: p.lat, lng: p.lng };

      console.log("[MAP][MARKER] create", { role, label, title, pos, eventId: p.event.id });

      // try AdvancedMarkerElement
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
          infoWindowRef.current.setContent(buildListItemHtml(p.event.fields));
          infoWindowRef.current.open({ anchor: adv, map: mapRef.current! });
        });

        sdAdvMarkersRef.current.push(adv);
        return;
      } catch (e) {
        console.log("[MAP][MARKER] AdvancedMarker failed -> fallback Marker", e);
      }

      // fallback
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
        infoWindowRef.current.setContent(buildListItemHtml(p.event.fields));
        infoWindowRef.current.open(mapRef.current!, mk);
      });

      sdFallbackMarkersRef.current.push(mk);
    });

    // fit bounds
    try {
      const bounds = new google.maps.LatLngBounds();
      points.forEach((pt) => bounds.extend({ lat: pt.lat, lng: pt.lng }));
      mapRef.current.fitBounds(bounds, 80);
      console.log("[MAP][BOUNDS] fit to event points");
    } catch (e) {
      console.log("[MAP][BOUNDS] fitBounds failed", e);
    }
  }, [isLoaded, points, onSelectEvent]);

  // ---- Truck marker ----
  useEffect(() => {
    if (!isLoaded || !mapRef.current || !liveLatest) return;

    const pos = { lat: liveLatest.Latitude, lng: liveLatest.Longitude };
    console.log("[MAP][TRUCK] update", { pos, speed: liveLatest.Speed });

    try {
      if (!truckAdvRef.current) {
        const wrapper = document.createElement("div");
        wrapper.innerHTML = makeTruckMarkerHtml(liveLatest.Speed);
        const el = wrapper.firstElementChild as HTMLElement;

        truckAdvRef.current = new (google.maps as any).marker.AdvancedMarkerElement({
          position: pos,
          map: mapRef.current,
          content: el,
          title: "Truck",
        });
      } else {
        (truckAdvRef.current as any).position = pos;

        const wrapper = document.createElement("div");
        wrapper.innerHTML = makeTruckMarkerHtml(liveLatest.Speed);
        (truckAdvRef.current as any).content = wrapper.firstElementChild as HTMLElement;
      }
      return;
    } catch (e) {
      console.log("[MAP][TRUCK] AdvancedMarker failed -> fallback Marker", e);
    }

    if (!truckFallbackRef.current) {
      truckFallbackRef.current = new google.maps.Marker({
        position: pos,
        map: mapRef.current,
        title: "Truck",
      });
    } else {
      truckFallbackRef.current.setPosition(pos);
    }
  }, [isLoaded, liveLatest]);

  // selected focus
  useEffect(() => {
    if (!isLoaded || !mapRef.current || !selectedId) return;

    const adv = sdAdvMarkersRef.current.find((m) => (m as any).__eventId === selectedId);
    if (adv) {
      try {
        mapRef.current.panTo((adv as any).position);
        mapRef.current.setZoom(12);
      } catch {}
      return;
    }

    const fb = sdFallbackMarkersRef.current.find((m: any) => (m as any).__eventId === selectedId);
    if (fb) {
      try {
        mapRef.current.panTo(fb.getPosition()!);
        mapRef.current.setZoom(12);
      } catch {}
    }
  }, [selectedId, isLoaded]);

  if (loadError) {
    return <div style={{ padding: 12, color: "crimson" }}>Google Maps failed to load: {String(loadError)}</div>;
  }

  const debugBanner = `mapId=${MAP_ID ? "OK" : "MISSING"} | apiKey=${apiKey ? "OK" : "MISSING"} | points=${points.length} | live=${liveLatest ? "YES" : "NO"}`;

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
          <div style={{ fontSize: 14, fontWeight: 700, color: "#0f172a" }}>Shipment Journey</div>
          <div style={{ marginTop: 4, fontSize: 12, color: "#6b7280" }}>
            Live: {liveLatest ? new Date(liveLatest.Timestamp).toLocaleTimeString() : "waiting..."}
            {liveLatest?.Speed != null ? ` • ${Math.round(liveLatest.Speed)} km/h` : ""}
          </div>

          {/* ✅ debug banner visible in prod */}
          <div style={{ marginTop: 6, fontSize: 11, color: "#64748b" }}>{debugBanner}</div>
        </div>

        <div style={{ overflowY: "auto", padding: 8 }}>
          {points.length === 0 && <div style={{ padding: 12, color: "#6b7280" }}>No geo-coordinates available for events.</div>}

          {points.map((p, idx) => {
            const ev = p.event;
            const f: Record<string, unknown> = ev.fields ?? {};
            const isSelected = selectedId === ev.id;

            const isFirst = idx === 0;
            const isLast = idx === points.length - 1;

            const pointLabel = isFirst ? "Source" : isLast ? "Destination" : `Transit Point ${idx}`;
            const pointColor = isFirst ? pinColors.start : isLast ? pinColors.end : pinColors.mid;
            const showMarkerIndicator = isFirst || isLast;

            const title = asText((f as any).EventName ?? (f as any).Code, "Event");
            const stopId = asText((f as any).StopId ?? (f as any).stopId, "—");
            const timeRaw = (f as any).CreatedAt ?? (f as any).createdAt ?? null;

            return (
              <div
                key={ev.id}
                onClick={() => {
                  setSelectedId(ev.id);
                  onSelectEvent?.(ev);

                  // pan map
                  try {
                    mapRef.current?.panTo({ lat: p.lat, lng: p.lng });
                    mapRef.current?.setZoom(12);
                  } catch {}
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
                // ✅ CRITICAL
                mapId: MAP_ID,
                mapTypeId: "roadmap",
                streetViewControl: false,
                fullscreenControl: false,
                zoomControl: true,
                clickableIcons: false,
                mapTypeControl: false,
                styles: [{ featureType: "poi", elementType: "labels", stylers: [{ visibility: "off" }] }],
              }}
              onLoad={(map) => {
                console.log("[MAP] map loaded", { hasMapId: !!MAP_ID });
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
                  console.log("[MAP] onLoad fitBounds failed", e);
                }
              }}
              onUnmount={() => {
                mapRef.current = null;

                // cleanup markers
                sdAdvMarkersRef.current.forEach((m) => {
                  try {
                    (m as any).map = null;
                  } catch {}
                });
                sdAdvMarkersRef.current = [];

                sdFallbackMarkersRef.current.forEach((m) => {
                  try {
                    m.setMap(null);
                  } catch {}
                });
                sdFallbackMarkersRef.current = [];

                if (truckAdvRef.current) {
                  try {
                    (truckAdvRef.current as any).map = null;
                  } catch {}
                  truckAdvRef.current = null;
                }

                if (truckFallbackRef.current) {
                  try {
                    truckFallbackRef.current.setMap(null);
                  } catch {}
                  truckFallbackRef.current = null;
                }

                if (infoWindowRef.current) {
                  infoWindowRef.current.close();
                  infoWindowRef.current = null;
                }
              }}
            >
              {livePath.length >= 2 && (
                <Polyline path={livePath} options={{ strokeOpacity: 0.8, strokeWeight: 4, geodesic: true, clickable: false }} />
              )}

              {eventPath.length >= 2 && (
                <Polyline path={eventPath} options={{ strokeOpacity: 0.35, strokeWeight: 3, geodesic: true, clickable: false }} />
              )}
            </GoogleMap>
          </div>
        )}
      </div>
    </div>
  );
}
