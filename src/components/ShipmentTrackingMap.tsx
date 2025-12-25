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
  // optional callback when user clicks marker/list
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

function parseLatLng(fields: Record<string, unknown>) {
  // Safely read a few common coordinate shapes without fighting TS's `unknown`.
  const f: any = fields as any;
  const geo: any = f?.GeoLocation ?? f?.geoLocation ?? f?.geolocation;

  const latRaw = f?.latitude ?? f?.Latitude ?? f?.geoLat ?? geo?.Latitude ?? geo?.latitude;
  const lonRaw = f?.longitude ?? f?.Longitude ?? f?.geoLon ?? geo?.Longitude ?? geo?.longitude;

  const lat = latRaw === undefined || latRaw === null ? NaN : parseFloat(String(latRaw));
  const lon = lonRaw === undefined || lonRaw === null ? NaN : parseFloat(String(lonRaw));
  if (isNaN(lat) || isNaN(lon)) return null;
  return { lat, lng: lon };
}

function buildListItemHtml(fields: Record<string, unknown>) {
  const title = fields?.EventName ?? fields?.Code ?? "Event";
  const location = fields?.location ?? fields?.locationCode ?? "";
  const time = fields?.actualTime ?? fields?.createdAt ?? fields?.Created ?? "";
  const tStr = time ? new Date(String(time)).toLocaleString() : "";
  return `
    <div style="font-size:13px;max-width:260px">
      <div style="font-weight:600;margin-bottom:4px;">${escapeHtml(title)}</div>
      <div style="font-size:12px;color:#374151;margin-bottom:4px;"><strong>Loc:</strong> ${escapeHtml(location)}</div>
      <div style="font-size:12px;color:#6b7280;"><strong>Time:</strong> ${escapeHtml(tStr)}</div>
    </div>
  `;
}

function escapeHtml(s: unknown) {
  if (s === null || s === undefined) return "";
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** create small html pin (circle + optional number/text) */
function makeMarkerContent(color: string, label?: string) {
  const bg = color;
  
  // Adjust width based on label length for better text fitting
  const isLongLabel = label && label.length > 1;
  const minWidth = isLongLabel ? "auto" : "28px";
  const padding = isLongLabel ? "0 10px" : "0";
  const height = "28px";
  
  return `
    <div style="display:flex;flex-direction:column;align-items:center;pointer-events:none;">
      <div style="min-width:${minWidth};height:${height};border-radius:14px;background:${bg};display:flex;align-items:center;justify-content:center;box-shadow:0 1px 4px rgba(0,0,0,0.25);padding:${padding};">
        ${label ? `<div style="font-size:${isLongLabel ? '11px' : '12px'};color:white;font-weight:700;white-space:nowrap;">${escapeHtml(label)}</div>` : ""}
      </div>
      <div style="width:2px;height:10px;background:${bg};margin-top:2px;border-radius:1px;"></div>
    </div>
  `;
}

/**
 * ShipmentTrackingMap
 *
 * - left column: scrollable events list (like SAP GTT)
 * - right column: Google map (AdvancedMarkerElement)
 */
export default function ShipmentTrackingMap({
  events,
  height = 520,
  onSelectEvent,
}: ShipmentTrackingMapProps) {
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;
  if (!apiKey) {
    // Fail early: user forgot to set VITE_GOOGLE_MAPS_API_KEY
    return <div style={{ padding: 12, color: "crimson" }}>Missing VITE_GOOGLE_MAPS_API_KEY in env.</div>;
  }

  // eslint-disable-next-line react-hooks/rules-of-hooks
  const { isLoaded } = useJsApiLoader({
    id: "google-map-script",
    googleMapsApiKey: apiKey,
    libraries: ["marker"], // required for AdvancedMarkerElement
  });

  // parse coords
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const points = useMemo(() => {
    return (events ?? [])
      .map((e) => {
        const coords = parseLatLng(e.fields);
        if (!coords) return null;
        return { ...coords, event: e };
      })
      .filter((p): p is { lat: number; lng: number; event: RawEvent } => !!p);
  }, [events]);

  // map / markers refs
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const mapRef = useRef<google.maps.Map | null>(null);
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const markersRef = useRef<Array<google.maps.marker.AdvancedMarkerElement>>([]);
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const infoWindowRef = useRef<google.maps.InfoWindow | null>(null);

  // local selection state (for highlighting list & marker)
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // create / update markers when points change - ONLY SOURCE AND DESTINATION
  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => {
    if (!isLoaded || !mapRef.current) return;

    // clear previous markers
    try {
      markersRef.current.forEach((m) => {
        // detach from map
        (m as google.maps.marker.AdvancedMarkerElement).map = null;
      });
    } catch { /* empty */ }
    markersRef.current = [];

    if (!points || points.length === 0) return;

    // Create markers only for source and destination
    const markerPoints = points.length === 1 
      ? [{ point: points[0], index: 0, role: "start" as const }]
      : [
          { point: points[0], index: 0, role: "start" as const },
          { point: points[points.length - 1], index: points.length - 1, role: "end" as const }
        ];

    markerPoints.forEach(({ point: p, role }) => {
      const color = role === "start" ? pinColors.start : pinColors.end;
      const label = role === "start" ? "Source" : "Destination";
      
      const markerHtml = makeMarkerContent(color, label);

      // create DOM element for content
      const wrapper = document.createElement("div");
      wrapper.innerHTML = markerHtml;
      const contentEl = wrapper.firstElementChild as HTMLElement;

      // create advanced marker
      const advancedMarker = new (google.maps as any).marker.AdvancedMarkerElement({
        position: { lat: p.lat, lng: p.lng },
        map: mapRef.current,
        content: contentEl,
        title: p.event.fields?.EventName ?? p.event.fields?.Code ?? label,
      }) as google.maps.marker.AdvancedMarkerElement;

      // store index on dom for reference
      (advancedMarker as any).__eventId = p.event.id;

      advancedMarker.addListener("click", () => {
        setSelectedId(p.event.id);
        onSelectEvent?.(p.event);
        // show info window
        if (!infoWindowRef.current) infoWindowRef.current = new google.maps.InfoWindow({ maxWidth: 320 });
        infoWindowRef.current.setContent(buildListItemHtml(p.event.fields));
        // InfoWindow open anchored to marker (works with AdvancedMarkerElement)
        infoWindowRef.current.open({ anchor: advancedMarker as any, map: mapRef.current });
        // scroll left list to item
        const el = document.querySelector(`[data-event-id="${p.event.id}"]`) as HTMLElement | null;
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "center" });
          el.classList.add("ring-2", "ring-blue-400");
          setTimeout(() => el.classList.remove("ring-2", "ring-blue-400"), 1500);
        }
      });

      markersRef.current.push(advancedMarker);
    });

    // fit bounds to all points (including intermediate ones for proper path display)
    try {
      const bounds = new google.maps.LatLngBounds();
      points.forEach((pt) => bounds.extend(pt));
      if (!bounds.isEmpty && !bounds.equals(new google.maps.LatLngBounds())) {
        mapRef.current.fitBounds(bounds, 80);
      }
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (err) {
      // ignore fit errors
      // fallback: center first point
      try {
        mapRef.current.setCenter({ lat: points[0].lat, lng: points[0].lng });
      } catch { /* empty */ }
    }

    return () => {
      // cleanup markers
      try {
        markersRef.current.forEach((m) => ((m as any).map = null));
        markersRef.current = [];
      } catch {}
    };
  }, [isLoaded, points, onSelectEvent]);

  // when selectedId changes, highlight marker (bring to front) and open infowindow (if not already)
  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => {
    if (!isLoaded || !mapRef.current) return;
    if (!selectedId) return;
    const m = markersRef.current.find((mk) => (mk as any).__eventId === selectedId);
    if (!m) return;
    try {
      // scroll into view handled when marker clicked; here we also pan
      mapRef.current.panTo((m as any).position ?? (m as any).getPosition());
      if (!infoWindowRef.current) infoWindowRef.current = new google.maps.InfoWindow({ maxWidth: 320 });
      infoWindowRef.current.setContent(" "); // clear, real content set when clicked / selected
      infoWindowRef.current.open({ anchor: m as any, map: mapRef.current });
    } catch {}
  }, [selectedId, isLoaded]);

  // compute polyline path from points (includes all points for smooth path)
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const path = useMemo(() => points.map((p) => ({ lat: p.lat, lng: p.lng })), [points]);

  // render
  return (
    <div
      style={{
        display: "flex",
        gap: 12,
        alignItems: "stretch" ,       
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
            const f = ev.fields ?? {};
            const isSelected = selectedId === ev.id;
            
            // Determine the label for this point
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
              showMarkerIndicator = false; // No marker for intermediate points
            }
            
            return (
              <div
                key={ev.id}
                data-event-id={ev.id}
                onClick={() => {
                  setSelectedId(ev.id);
                  onSelectEvent?.(ev);
                  
                  // Check if this point has a marker (only source and destination)
                  const m = markersRef.current.find((mk) => (mk as any).__eventId === ev.id);
                  if (m) {
                    google.maps.event.trigger(m as any, "click");
                  } else {
                    // For intermediate points without markers, just pan to location
                    if (mapRef.current) {
                      mapRef.current.panTo({ lat: p.lat, lng: p.lng });
                      mapRef.current.setZoom(12); // Zoom in for better view
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
                {/* Visual indicator for mapped points */}
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
                  <div style={{ fontWeight: 700, color: "#0f172a", fontSize: 13 }}>
                    {f.EventName ?? f.Code ?? "Event"}
                  </div>
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
                    <strong style={{ color: "#374151" }}>Location:</strong>{" "}
                    <span style={{ color: "#334155" }}>{f.location ?? f.locationCode ?? "—"}</span>
                  </div>
                  <div style={{ fontSize: 12, color: "#6b7280" }}>
                    <strong>Time:</strong>{" "}
                    {f.actualTime ? new Date(String(f.actualTime)).toLocaleString() : (f.createdAt ? new Date(String(f.createdAt)).toLocaleString() : "—")}
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
          <div style={{ ...containerBaseStyle, height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
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
                    stylers: [{ visibility: "off" }]
                  }
                ]
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
                // cleanup
                mapRef.current = null;
                try {
                  markersRef.current.forEach((m) => ((m as any).map = null));
                } catch {}
                markersRef.current = [];
                if (infoWindowRef.current) {
                  infoWindowRef.current.close();
                  infoWindowRef.current = null;
                }
              }}
            >
              {/* route polyline connecting all points */}
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
              
              {/* Optional: Dashed line between source and destination for direct route visualization */}
              {points.length > 2 && (
                <Polyline
                    path={[
                    { lat: points[0].lat, lng: points[0].lng },
                    { lat: points[points.length - 1].lat, lng: points[points.length - 1].lng }
                    ]}
                    options={{
                    strokeColor: "#9ca3af",
                    strokeOpacity: 0,  // Make the line itself invisible
                    strokeWeight: 2,
                    geodesic: true,
                    clickable: false,
                    icons: [{
                        icon: {
                        path: 'M 0,-1 0,1',
                        strokeOpacity: 0.4,
                        strokeColor: "#9ca3af",
                        strokeWeight: 2,
                        scale: 3
                        },
                        offset: '0',
                        repeat: '15px'  // Creates dashed effect
                    }],
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