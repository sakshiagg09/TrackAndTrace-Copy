// src/components/ShipmentsTable.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Paper,
  Typography,
  Divider,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Checkbox,
  IconButton,
  Tooltip,
} from "@mui/material";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import CancelIcon from "@mui/icons-material/Cancel";
import HourglassEmptyIcon from "@mui/icons-material/HourglassEmpty";
import TuneIcon from "@mui/icons-material/Tune";
import CloseIcon from "@mui/icons-material/Close";
import { useNavigate } from "react-router-dom";

/* -------------------------------------------------------------------------- */
/*                             TYPE DEFINITIONS                               */
/* -------------------------------------------------------------------------- */

export type SimpleFieldDef = {
  title: string;
  technicalName: string;
  visibleInAdapt?: boolean;
  order?: number;
};

interface GraphItem {
  id: string;
  fields: Record<string, unknown>;
}



interface ShipmentsTableProps {
  rows: GraphItem[];
  fieldDefs: SimpleFieldDef[]; // must come from SharePoint
  storageKey?: string;
}

/* -------------------------------------------------------------------------- */
/*                              SMALL HELPERS                                  */
/* -------------------------------------------------------------------------- */

const DEFAULT_COLUMN_WIDTH = 160; // slightly narrower
const LS_PREFIX = "shipments_table_visible_cols_v1:";
const LS_WIDTH_PREFIX = "shipments_table_col_widths_v1:";

const ResizeHandle: React.FC<{ onMouseDown: (e: React.MouseEvent) => void }> = ({ onMouseDown }) => (
  <div
    onMouseDown={onMouseDown}
    style={{
      position: "absolute",
      top: 0,
      right: 0,
      width: 10,
      height: "100%",
      cursor: "col-resize",
      zIndex: 5,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
    }}
  >
    <div style={{ width: 2, height: "60%", background: "rgba(59,130,246,0.35)" }} />
  </div>
);

function isStatusField(name: string) {
  return String(name).toLowerCase().includes("status");
}

/* compact status icon only (tooltip shows full text) */
function renderStatusIcon(status: unknown) {
  const s = String(status ?? "").trim();
  const sl = s.toLowerCase();
  if (!s) {
    return (
      <Tooltip title="No status">
        <HourglassEmptyIcon fontSize="small" />
      </Tooltip>
    );
  }
  if (sl.includes("active")) {
    return (
      <Tooltip title={s}>
        <CheckCircleIcon fontSize="small" sx={{ color: "#2563eb" }} />
      </Tooltip>
    );
  }
  if (sl.includes("completed")) {
    return (
      <Tooltip title={s}>
        <CheckCircleIcon fontSize="small" sx={{ color: "#16a34a" }} />
      </Tooltip>
    );
  }
  if (sl.includes("in execution") || sl.includes("in progress") || sl.includes("execution") || sl.includes("in_execution")) {
    return (
      <Tooltip title={s}>
        <ErrorOutlineIcon fontSize="small" sx={{ color: "#f59e0b" }} />
      </Tooltip>
    );
  }
  if (sl.includes("cancel") || sl.includes("failed") || sl.includes("error")) {
    return (
      <Tooltip title={s}>
        <CancelIcon fontSize="small" sx={{ color: "#dc2626" }} />
      </Tooltip>
    );
  }
  return (
    <Tooltip title={s}>
      <HourglassEmptyIcon fontSize="small" />
    </Tooltip>
  );
}

/* Render an array of locations as "pointers/steps" (dots connected by a line).
   Expects each element to be string or an object with a label/name. */
const LocationStrip: React.FC<{ items: unknown[] }> = ({ items }) => {

  if (!Array.isArray(items) || items.length === 0) return null;
  // map to display strings
  const labels = items.map((it) => {
    if (it == null) return "";
    if (typeof it === "string") return it;
    if (typeof it === "object") {
      const obj = it as { label?: unknown; name?: unknown };
      return (obj.label ?? obj.name ?? JSON.stringify(it)).toString();
    }
    return String(it);
  });

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 80 }}>
      {labels.map((lbl, idx) => (
        <div key={idx} style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {idx > 0 && (
            <div
              aria-hidden
              style={{
                height: 2,
                width: 24,
                background: "#d1d5db",
                borderRadius: 1,
              }}
            />
          )}
          <Tooltip title={lbl}>
            <div
              style={{
                width: 12,
                height: 12,
                borderRadius: 12,
                background: "#2563eb",
                boxShadow: "0 0 0 3px rgba(37,99,235,0.08)",
              }}
            />
          </Tooltip>
        </div>
      ))}
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/*                             MAIN COMPONENT                                 */
/* -------------------------------------------------------------------------- */

const ShipmentsTable: React.FC<ShipmentsTableProps> = ({ rows, fieldDefs, storageKey = "" }) => {
  const navigate = useNavigate();

  // sanitize defs: remove falsy technicalName, dedupe by technicalName (first wins)
  const sanitizedDefs = useMemo(() => {
    if (!Array.isArray(fieldDefs)) return [];
    const seen = new Set<string>();
    const out: SimpleFieldDef[] = [];
    for (const f of fieldDefs) {
      if (!f || !f.technicalName) continue;
      const key = String(f.technicalName).trim();
      if (!key) continue;
      if (seen.has(key.toLowerCase())) continue;
      seen.add(key.toLowerCase());
      out.push({
        title: f.title ?? f.technicalName,
        technicalName: f.technicalName,
        visibleInAdapt: f.visibleInAdapt,
        order: typeof f.order === "number" ? f.order : undefined,
      });
    }
    return out;
  }, [fieldDefs]);

  // only fields allowed by visibleInAdapt (still toggleable in dialog)
  const adaptableFields = useMemo(() => sanitizedDefs.filter((f) => f.visibleInAdapt !== false), [sanitizedDefs]);

  // order by order/title
  const orderedMaster = useMemo(() => {
    return [...adaptableFields].sort((a, b) => {
      const oa = a.order ?? 9999;
      const ob = b.order ?? 9999;
      if (oa !== ob) return oa - ob;
      return (a.title ?? a.technicalName).localeCompare(b.title ?? b.technicalName);
    });
  }, [adaptableFields]);

  const storageId = LS_PREFIX + storageKey;
  const storageWidthId = LS_WIDTH_PREFIX + storageKey;

  // initial visible keys -> try localStorage then fallback to master list
  const initialVisible = useMemo(() => {
    try {
      const raw = localStorage.getItem(storageId);
      if (raw) {
        const arr = JSON.parse(raw) as string[];
        if (Array.isArray(arr) && arr.length > 0) {
          return arr.filter((k) => orderedMaster.some((m) => m.technicalName === k));
        }
      }
    } catch {
      // ignore
    }
    return orderedMaster.map((m) => m.technicalName);
  }, [orderedMaster, storageId]);

  const [visibleKeys, setVisibleKeys] = useState<string[]>(initialVisible);

  // find a sensible "location" field key (first matching field with 'location' or 'locationcode' in technicalName)
  const locationCandidateKey = useMemo(() => {
    const found = orderedMaster.find((m) => {
      const tn = (m.technicalName ?? "").toLowerCase();
      return tn.includes("location") || tn.includes("locationcode") || tn === "location";
    });
    return found?.technicalName ?? null;
  }, [orderedMaster]);

  // ensure visibleKeys only contains valid keys when master changes
  useEffect(() => {
    setVisibleKeys((prev) => {
      const next = prev.filter((k) => orderedMaster.some((m) => m.technicalName === k));
      // if locationCandidateKey exists and is visible, ensure it is last
      if (next.length === 0) return orderedMaster.map((m) => m.technicalName);
      // ensure location stays at end if present
      if (locationCandidateKey && next.includes(locationCandidateKey)) {
        const filtered = next.filter((k) => k !== locationCandidateKey);
        filtered.push(locationCandidateKey);
        return filtered;
      }
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderedMaster]);

  // persist visibleKeys
  useEffect(() => {
    try {
      localStorage.setItem(storageId, JSON.stringify(visibleKeys));
    } catch {
      // ignore
    }
  }, [visibleKeys, storageId]);

  // compute visible field defs in the exact order of visibleKeys (so header order matches visibleKeys)
  const visibleFields = useMemo(() => {
    // ensure locationCandidateKey is placed last if present
    const keys = visibleKeys.slice();
    if (locationCandidateKey && keys.includes(locationCandidateKey)) {
      const without = keys.filter((k) => k !== locationCandidateKey);
      without.push(locationCandidateKey);
      return without.map((k) => orderedMaster.find((m) => m.technicalName === k)).filter((x): x is SimpleFieldDef => !!x);
    }
    return keys.map((k) => orderedMaster.find((m) => m.technicalName === k)).filter((x): x is SimpleFieldDef => !!x);
  }, [visibleKeys, orderedMaster, locationCandidateKey]);

  // separate non-location vs location visible columns
  const nonLocationVisible = useMemo(() => visibleFields.filter((f) => f.technicalName !== locationCandidateKey), [visibleFields, locationCandidateKey]);
  const locationVisible = useMemo(() => visibleFields.find((f) => f.technicalName === locationCandidateKey) ?? null, [visibleFields, locationCandidateKey]);

  // Helper function to load column widths from localStorage
  const loadColWidths = (keys: string[]): number[] => {
    try {
      const raw = localStorage.getItem(storageWidthId);
      if (raw) {
        const stored = JSON.parse(raw) as Record<string, number>;
        const widths = keys.map((key) => stored[key] ?? DEFAULT_COLUMN_WIDTH);
        return widths;
      }
    } catch {
      // ignore
    }
    // Default widths
    const base = nonLocationVisible.map(() => DEFAULT_COLUMN_WIDTH);
    if (locationVisible) base.push(Math.max(200, DEFAULT_COLUMN_WIDTH + 40));
    return base;
  };

  // column widths per visible column (keeps non-location widths + optional final location width)
  const [colWidths, setColWidths] = useState<number[]>(() => {
    const keys = [...nonLocationVisible.map(f => f.technicalName), ...(locationVisible ? [locationVisible.technicalName] : [])];
    return loadColWidths(keys);
  });

  // Persist column widths to localStorage whenever they change
  useEffect(() => {
    try {
      const keys = [...nonLocationVisible.map(f => f.technicalName), ...(locationVisible ? [locationVisible.technicalName] : [])];
      const widthMap: Record<string, number> = {};
      keys.forEach((key, idx) => {
        widthMap[key] = colWidths[idx] ?? DEFAULT_COLUMN_WIDTH;
      });
      localStorage.setItem(storageWidthId, JSON.stringify(widthMap));
    } catch {
      // ignore
    }
  }, [colWidths, nonLocationVisible, locationVisible, storageWidthId]);

  useEffect(() => {
    // when visible columns count changes, reset widths sensibly while preserving existing widths where possible
    setColWidths((prev) => {
      const desiredLen = nonLocationVisible.length + (locationVisible ? 1 : 0);
      if (prev.length === desiredLen) return prev;
      
      // Load persisted widths for current visible columns
      const keys = [...nonLocationVisible.map(f => f.technicalName), ...(locationVisible ? [locationVisible.technicalName] : [])];
      return loadColWidths(keys);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nonLocationVisible.length, !!locationVisible, storageWidthId]);

  /* resizing (applies only to non-location columns) */
  const resizing = useRef<{ index: number; startX: number; startWidth: number } | null>(null);
  const handleMouseDown = (i: number, e: React.MouseEvent) => {
    // i is index within nonLocationVisible (not overall visibleFields)
    resizing.current = { index: i, startX: e.clientX, startWidth: colWidths[i] ?? DEFAULT_COLUMN_WIDTH };
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    document.body.style.userSelect = "none";
  };
  const handleMouseMove = (e: MouseEvent) => {
    if (!resizing.current) return;
    const { index, startX, startWidth } = resizing.current;
    const delta = e.clientX - startX;
    setColWidths((ws) => ws.map((w, i) => (i === index ? Math.max(100, startWidth + delta) : w)));
  };
  const handleMouseUp = () => {
    document.removeEventListener("mousemove", handleMouseMove);
    document.removeEventListener("mouseup", handleMouseUp);
    resizing.current = null;
    document.body.style.userSelect = "";
  };

  /* selection */
  const [selectedId, setSelectedId] = useState<string | null>(() => {
    try {
      return sessionStorage.getItem("selectedShipmentId");
    } catch {
      return null;
    }
  });
  useEffect(() => {
    try {
      if (selectedId) sessionStorage.setItem("selectedShipmentId", selectedId);
      else sessionStorage.removeItem("selectedShipmentId");
    } catch {
      // ignore
    }
  }, [selectedId]);
  const onRowClick = (id: string) => {
    setSelectedId(id);
    navigate(`/shipment-tracking-data/${id}`);
  };

  /* Adapt Columns dialog */
  const [adaptOpen, setAdaptOpen] = useState(false);
  const [dialogSearch, setDialogSearch] = useState("");
  const [localSelect, setLocalSelect] = useState<string[]>(visibleKeys);

  useEffect(() => {
    if (adaptOpen) {
      setLocalSelect(visibleKeys);
      setDialogSearch("");
    }
  }, [adaptOpen, visibleKeys]);

  const filteredForDialog = useMemo(() => {
    const s = dialogSearch.trim().toLowerCase();
    if (!s) return orderedMaster;
    return orderedMaster.filter((f) => (f.title ?? f.technicalName).toLowerCase().includes(s) || f.technicalName.toLowerCase().includes(s));
  }, [orderedMaster, dialogSearch]);

  const toggleLocal = (key: string) => setLocalSelect((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  const selectAll = () => setLocalSelect(orderedMaster.map((m) => m.technicalName));
  const clearAll = () => setLocalSelect([]);
  const resetDefaults = () => setLocalSelect(orderedMaster.map((m) => m.technicalName));
  const applyAndClose = () => {
    const next = orderedMaster.map((m) => m.technicalName).filter((k) => localSelect.includes(k));
    // if location present ensure last
    if (locationCandidateKey && next.includes(locationCandidateKey)) {
      const final = next.filter((k) => k !== locationCandidateKey);
      final.push(locationCandidateKey);
      setVisibleKeys(final);
    } else {
      setVisibleKeys(next.length ? next : orderedMaster.map((m) => m.technicalName));
    }
    setAdaptOpen(false);
  };

  /* ---------- DRAG & DROP for header reordering (non-location only) ---------- */
  const dragSrcKey = useRef<string | null>(null);
  const dragImageRef = useRef<HTMLElement | null>(null);

  const handleDragStart = (e: React.DragEvent, key: string) => {
    // only non-location columns should call this
    dragSrcKey.current = key;
    try {
      e.dataTransfer.setData("text/plain", "");
    } catch {
      // ignore
    }
    const img = document.createElement("div");
    img.style.width = "0px";
    img.style.height = "0px";
    img.style.overflow = "hidden";
    document.body.appendChild(img);
    dragImageRef.current = img;
    try {
      e.dataTransfer.setDragImage(img, 0, 0);
    } catch {
      // noop
    }
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  

  const handleDropOnHeader = (e: React.DragEvent, destKey: string) => {
    e.preventDefault();
    const srcKey = dragSrcKey.current;
    if (!srcKey) return;
    if (srcKey === destKey) return;

    // build keys list without changing location position (we'll re-append locationCandidateKey at end if present)
    const keys = visibleKeys.slice().filter(Boolean);
    // remove src
    const withoutSrc = keys.filter((k) => k !== srcKey);
    // find dest index to insert BEFORE destKey
    const destIndex = withoutSrc.findIndex((k) => k === destKey);
    const insertAt = destIndex >= 0 ? destIndex : withoutSrc.length;
    withoutSrc.splice(insertAt, 0, srcKey);

    // ensure location key ends up at the end if present
    let final = withoutSrc;
    if (locationCandidateKey && final.includes(locationCandidateKey)) {
      final = final.filter((k) => k !== locationCandidateKey);
      final.push(locationCandidateKey);
    }

    // reorder colWidths accordingly (map old positions to new)
    setColWidths((prevWidths) => {
      const oldKeys = visibleKeys.slice();
      const newKeys = final;
      const newWidths: number[] = [];
      
      // Load stored widths
      try {
        const raw = localStorage.getItem(storageWidthId);
        const stored = raw ? JSON.parse(raw) as Record<string, number> : {};
        
        for (let i = 0; i < newKeys.length; i++) {
          const nk = newKeys[i];
          // Try to use stored width first, then fallback to current width, then default
          newWidths.push(stored[nk] ?? prevWidths[oldKeys.indexOf(nk)] ?? DEFAULT_COLUMN_WIDTH);
        }
      } catch {
        // Fallback to mapping from old positions
        for (let i = 0; i < newKeys.length; i++) {
          const nk = newKeys[i];
          const oldIdx = oldKeys.indexOf(nk);
          newWidths.push(prevWidths[oldIdx] ?? DEFAULT_COLUMN_WIDTH);
        }
      }
      
      return newWidths;
    });

    setVisibleKeys(final);
    dragSrcKey.current = null;
  };

  const handleDragEnd = () => {
    if (dragImageRef.current && dragImageRef.current.parentNode) {
      dragImageRef.current.parentNode.removeChild(dragImageRef.current);
    }
    dragImageRef.current = null;
    dragSrcKey.current = null;
  };

  /* render helpers */
  const renderCell = (f: SimpleFieldDef, itemFields: Record<string, unknown>) => {
    const raw = (() => {
      if (!itemFields) return undefined;
      if (f.technicalName in itemFields) return itemFields[f.technicalName];
      const lower = f.technicalName.toLowerCase();
      const exact = Object.keys(itemFields).find((k) => k.toLowerCase() === lower);
      if (exact) return (itemFields as Record<string, unknown>)[exact];
      const contains = Object.keys(itemFields).find((k) => k.toLowerCase().includes(lower));
      if (contains) return (itemFields as Record<string, unknown>)[contains];
      return undefined;
    })();

    let value = raw ?? "—";

    if (isStatusField(f.technicalName)) return renderStatusIcon(value);

    // If field name includes 'location' treat location arrays or stringified arrays as location data
    const lowerName = f.technicalName.toLowerCase();

    // If value is a string that looks like "[a, b, c]" parse it into an array
    if (typeof value === "string") {
      const s = value.trim();
      if (s.startsWith("[") && s.endsWith("]") && s.includes(",")) {
        try {
          // attempt JSON parse first (in case items are quoted)
          const parsed = JSON.parse(s);
          if (Array.isArray(parsed)) {
            value = parsed;
          } else {
            const inner = s.slice(1, -1);
            value = inner.split(",").map((x) => x.trim()).filter((x) => x.length > 0);
          }
        } catch {
          const inner = s.slice(1, -1);
          value = inner.split(",").map((x) => x.trim()).filter((x) => x.length > 0);
        }
      }
    }

    const looksLikeLocationArray =
      Array.isArray(value) && (lowerName.includes("location") || lowerName.includes("route") || lowerName.includes("path") || lowerName.includes("stops") || lowerName.includes("legs") || lowerName.includes("milestone"));

    if (looksLikeLocationArray) {
      return <LocationStrip items={value as unknown[]} />;
    }

    // arrays (non-location) -> join
    if (Array.isArray(value)) {
      const stringArray = (value as unknown[]).map(v => String(v));
      return (
        <span style={{ display: "inline-block", width: "100%", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={stringArray.join(", ")}>
          {stringArray.join(", ")}
        </span>
      );
    }

    // default text
    return (
      <span
        style={{
          display: "inline-block",
          width: "100%",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
          boxSizing: "border-box",
        }}
        title={String(value)}
      >
        {String(value)}
      </span>
    );
  };

  // grid template: non-location widths + optional location width last
  const gridTemplate = [
    ...colWidths.slice(0, nonLocationVisible.length).map((w) => `${w}px`),
    ...(locationVisible ? [`${colWidths[nonLocationVisible.length] ?? DEFAULT_COLUMN_WIDTH}px`] : []),
  ].join(" ");

  /* -------------------- render -------------------- */
  return (
    <>
      <Paper elevation={2} style={{ padding: 12, overflowX: "auto", position: "relative" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <Typography variant="h6" style={{ fontWeight: 600, fontSize: 14 }}>
            Shipments ({rows.length})
          </Typography>

          <div style={{ display: "flex", gap: 8 }}>
            <Button startIcon={<TuneIcon />} variant="outlined" size="small" onClick={() => setAdaptOpen(true)}>
              Adapt Columns
            </Button>
          </div>
        </div>

        <div style={{ border: "1px solid rgba(0,0,0,0.06)", borderRadius: 6, overflow: "auto" }}>
          <div style={{ minWidth: "max-content", display: "block" }}>
            {/* header (grid) */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: gridTemplate,
                alignItems: "center",
                background: "#f3f4f6",
                color: "#374151",
                fontWeight: 600,
                fontSize: 12, // smaller
              }}
            >
              {/* non-location headers (draggable & resizable) */}
              {nonLocationVisible.map((f, i) => (
                <div
                  key={f.technicalName}
                  data-tn={f.technicalName}
                  draggable
                  onDragStart={(e) => handleDragStart(e, f.technicalName)}
                  onDragOver={handleDragOver}
                  onDrop={(e) => handleDropOnHeader(e, f.technicalName)}
                  onDragEnd={handleDragEnd}
                  style={{
                    position: "relative",
                    padding: "8px 10px",
                    borderRight: "1px solid rgba(0,0,0,0.06)",
                    boxSizing: "border-box",
                    minWidth: 80,
                    overflow: "hidden",
                    whiteSpace: "nowrap",
                    textOverflow: "ellipsis",
                    userSelect: "none",
                    cursor: "grab",
                    fontSize: 12,
                  }}
                >
                  {f.title ?? f.technicalName}
                  {/* Resize handle (only for non-location columns) */}
                  <ResizeHandle onMouseDown={(e) => handleMouseDown(i, e)} />
                </div>
              ))}

              {/* location header (sticky right, not draggable, not resizable) */}
              {locationVisible && (
                <div
                  key={locationVisible.technicalName}
                  style={{
                    position: "sticky",
                    right: 0,
                    zIndex: 4,
                    padding: "8px 10px",
                    borderLeft: "1px solid rgba(0,0,0,0.06)",
                    boxSizing: "border-box",
                    minWidth: 180,
                    background: "#f3f4f6",
                    overflow: "hidden",
                    whiteSpace: "nowrap",
                    textOverflow: "ellipsis",
                    fontSize: 12,
                  }}
                >
                  {locationVisible.title ?? locationVisible.technicalName}
                </div>
              )}
            </div>

            <Divider />

            {/* rows */}
            <div>
              {rows.length === 0 ? (
                <div style={{ padding: 12, textAlign: "center", color: "#6b7280", fontSize: 12 }}>No shipments found.</div>
              ) : (
                rows.map((r, ri) => {
                  const flds = r.fields ?? {};
                  const rid = r.id ?? String(ri);
                  const isSelected = selectedId === rid;
                  const bg = ri % 2 ? "#ffffff" : "#f9fafb";
                  const selectedStyle = isSelected ? { boxShadow: "inset 4px 0 0 #60a5fa", background: "#ecfeff" } : {};

                  return (
                    <div
                      key={rid}
                      role="row"
                      aria-selected={isSelected}
                      tabIndex={0}
                      onClick={() => onRowClick(rid)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          onRowClick(rid);
                        }
                      }}
                      style={{
                        display: "grid",
                        gridTemplateColumns: gridTemplate,
                        alignItems: "center",
                        background: bg,
                        ...selectedStyle,
                        cursor: "pointer",
                        fontSize: 12, // smaller
                      }}
                    >
                      {/* non-location cells */}
                      {nonLocationVisible.map((f) => (
                        <div
                          key={f.technicalName}
                          style={{
                            padding: "8px 10px",
                            borderRight: "1px solid rgba(0,0,0,0.04)",
                            boxSizing: "border-box",
                            minWidth: 80,
                            overflow: "hidden",
                            whiteSpace: "nowrap",
                            textOverflow: "ellipsis",
                          }}
                        >
                          {renderCell(f, flds)}
                        </div>
                      ))}

                      {/* location cell fixed to right */}
                      {locationVisible && (
                        <div
                          key={`${locationVisible.technicalName}-cell-${rid}`}
                          style={{
                            padding: "8px 10px",
                            boxSizing: "border-box",
                            minWidth: 180,
                            overflow: "hidden",
                            whiteSpace: "nowrap",
                            textOverflow: "ellipsis",
                            position: "sticky",
                            right: 0,
                            background: bg,
                            zIndex: 3,
                            borderLeft: "1px solid rgba(0,0,0,0.04)",
                          }}
                        >
                          {renderCell(locationVisible, flds)}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </Paper>

      {/* Adapt Columns dialog */}
      <Dialog open={adaptOpen} onClose={() => setAdaptOpen(false)} fullWidth maxWidth="md">
        <DialogTitle style={{ display: "flex", alignItems: "center", gap: 8 }}>
          Adapt Columns
          <IconButton onClick={() => setAdaptOpen(false)} style={{ marginLeft: "auto" }}>
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers>
          <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            <TextField placeholder="Search fields..." size="small" value={dialogSearch} onChange={(e) => setDialogSearch(e.target.value)} fullWidth />
            <Button onClick={() => selectAll()} size="small" variant="outlined">
              Select All
            </Button>
            <Button onClick={() => clearAll()} size="small" variant="outlined">
              Clear
            </Button>
            <Button onClick={() => resetDefaults()} size="small" variant="outlined">
              Reset
            </Button>
          </div>

          <List dense style={{ maxHeight: 420, overflow: "auto", border: "1px solid #eee", borderRadius: 4 }}>
            {filteredForDialog.map((f) => {
              const checked = localSelect.includes(f.technicalName);
              const disabledLabel = f.technicalName === locationCandidateKey ? " (kept at right)" : "";
              return (
                <ListItem key={f.technicalName} button onClick={() => toggleLocal(f.technicalName)} dense>
                  <ListItemIcon>
                    <Checkbox edge="start" checked={checked} tabIndex={-1} disableRipple onChange={() => toggleLocal(f.technicalName)} />
                  </ListItemIcon>
                  <ListItemText primary={`${f.title}${disabledLabel}`} secondary={f.technicalName} />
                </ListItem>
              );
            })}
          </List>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAdaptOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={applyAndClose}>
            Apply
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

export default ShipmentsTable;