// src/components/ShipmentTrackingMap.tsx
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
}

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
};

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
      <div style="font-size:12px;color:#6b7280;">
  
      </div>
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
        ${label ? `<div style="font-size:${isLongLabel ? "11px" : "12px"};color:white;font-weight:700;white-space:nowrap;">${escapeHtml(label)}</div>` : ""}
      </div>
      <div style="width:2px;height:10px;background:${bg};margin-top:2px;border-radius:1px;"></div>
    </div>
  `;
}

export default function ShipmentTrackingMap({
  events,
  height = 520,
  onSelectEvent,
}: ShipmentTrackingMapProps) {
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;
  if (!apiKey) {
    return <div style={{ padding: 12, color: "crimson" }}>Missing VITE_GOOGLE_MAPS_API_KEY in env.</div>;
  }
const GOOGLE_MAP_LIBRARIES: ("marker")[] = ["marker"];

  const { isLoaded } = useJsApiLoader({
    id: "google-map-script",
    googleMapsApiKey: apiKey,
    libraries: GOOGLE_MAP_LIBRARIES,
    //libraries: ["marker"] as any, // for AdvancedMarkerElement
  });

  const points = useMemo(() => {
    
    return (events ?? [])
      .map((e) => {
        const coords = parseLatLng(e.fields);
        if (!coords) return null;
        return { ...coords, event: e };
      })
      .filter((p): p is { lat: number; lng: number; event: RawEvent } => !!p);
  }, [events]);

  const mapRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<Array<google.maps.marker.AdvancedMarkerElement>>([]);
  const infoWindowRef = useRef<google.maps.InfoWindow | null>(null);

  const [selectedId, setSelectedId] = useState<string | null>(null);

  // create / update markers when points change - ONLY SOURCE AND DESTINATION
  useEffect(() => {
    if (!isLoaded || !mapRef.current) return;

    // clear previous markers
    try {
      markersRef.current.forEach((m) => {
        (m as google.maps.marker.AdvancedMarkerElement).map = null;
      });
    } catch {
      /* empty */
    }
    markersRef.current = [];

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

      const markerHtml = makeMarkerContent(color, label);

      const wrapper = document.createElement("div");
      wrapper.innerHTML = markerHtml;
      const contentEl = wrapper.firstElementChild as HTMLElement;

      const title = asText((p.event.fields as any)?.EventName ?? (p.event.fields as any)?.Code, label);

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

      markersRef.current.push(advancedMarker);
    });

    // fit bounds to all points (including intermediate ones)
    try {
      const bounds = new google.maps.LatLngBounds();
      points.forEach((pt) => bounds.extend(pt));
      mapRef.current.fitBounds(bounds, 80);
    } catch {
      try {
        mapRef.current.setCenter({ lat: points[0].lat, lng: points[0].lng });
      } catch {
        /* empty */
      }
    }

    return () => {
      try {
        markersRef.current.forEach((m) => ((m as any).map = null));
        markersRef.current = [];
      } catch {
        /* empty */
      }
    };
  }, [isLoaded, points, onSelectEvent]);

  useEffect(() => {
    if (!isLoaded || !mapRef.current) return;
    if (!selectedId) return;

    const m = markersRef.current.find((mk) => (mk as any).__eventId === selectedId);
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

  const path = useMemo(() => points.map((p) => ({ lat: p.lat, lng: p.lng })), [points]);

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

            const title = asText((f as any).EventName ?? (f as any).Code, "Event");
            const stopId = asText((f as any).StopId ?? (f as any).stopId, "—");
            const timeRaw = (f as any).CreatedAt ?? (f as any).createdAt ?? null;

            return (
              <div
                key={ev.id}
                data-event-id={ev.id}
                onClick={() => {
                  setSelectedId(ev.id);
                  onSelectEvent?.(ev);

                  const m = markersRef.current.find((mk) => (mk as any).__eventId === ev.id);
                  if (m) {
                    google.maps.event.trigger(m as any, "click");
                  } else {
                    if (mapRef.current) {
                      mapRef.current.panTo({ lat: p.lat, lng: p.lng });
                      mapRef.current.setZoom(12);
                    }
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
  <strong>Stop ID:</strong>{" "}
  <span style={{ color: "#334155" }}>{stopId}</span>
</div>

<div style={{ fontSize: 12, color: "#6b7280" }}>
  <strong>Time:</strong> {timeRaw}
</div>

                  <div style={{ fontSize: 12, color: "#6b7280" }}>
                    <strong>Time:</strong> {timeRaw}
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
                mapId: import.meta.env.VITE_GOOGLE_MAPS_MAP_ID,
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
                if (points.length > 0) {
                  try {
                    const bounds = new google.maps.LatLngBounds();
                    points.forEach((pt) => bounds.extend(pt));
                    map.fitBounds(bounds, 80);
                  } catch {
                    map.setCenter({ lat: points[0].lat, lng: points[0].lng });
                    map.setZoom(4);
                  }
                }
              }}
              onUnmount={() => {
                mapRef.current = null;
                try {
                  markersRef.current.forEach((m) => ((m as any).map = null));
                } catch {
                  /* empty */
                }
                markersRef.current = [];
                if (infoWindowRef.current) {
                  infoWindowRef.current.close();
                  infoWindowRef.current = null;
                }
              }}
            >
              {path.length >= 2 && (
                <Polyline
                  path={path}
                  options={{
                    strokeColor: pinColors.mid,
                    strokeOpacity: 0.7,
                    strokeWeight: 3,
                    geodesic: true,
                    clickable: false,
                    icons: [
                      {
                        icon: {
                          path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
                          scale: 2.5,
                          strokeColor: pinColors.mid,
                          strokeWeight: 2,
                          fillColor: pinColors.mid,
                          fillOpacity: 0.8,
                        },
                        repeat: "120px",
                      },
                    ],
                  }}
                />
              )}

              {points.length > 2 && (
                <Polyline
                  path={[
                    { lat: points[0].lat, lng: points[0].lng },
                    { lat: points[points.length - 1].lat, lng: points[points.length - 1].lng },
                  ]}
                  options={{
                    strokeColor: "#9ca3af",
                    strokeOpacity: 0,
                    strokeWeight: 2,
                    geodesic: true,
                    clickable: false,
                    icons: [
                      {
                        icon: {
                          path: "M 0,-1 0,1",
                          strokeOpacity: 0.4,
                          strokeColor: "#9ca3af",
                          strokeWeight: 2,
                          scale: 3,
                        },
                        offset: "0",
                        repeat: "15px",
                      },
                    ],
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
