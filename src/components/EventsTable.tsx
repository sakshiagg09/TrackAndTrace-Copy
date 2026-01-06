// src/components/EventsTable.tsx
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
export interface SimpleFieldDef {
  id?: number;
  title: string;
  technicalName: string;
  visibleInAdapt?: boolean;
  order?: number;
}


export type EventRow = {
  id: string;
  fields: Record<string, unknown>;
};

interface EventsTableProps {
  rows: EventRow[];
  fieldDefs: SimpleFieldDef[]; // fields from fetchSimpleFieldConfig (optional)
  storageKey?: string; // localStorage prefix to persist columns/widths/order
  onSelectRow?: (id: string | null) => void;
}

/* -------------------------------------------------------------------------- */
/*                                   Helpers                                   */
/* -------------------------------------------------------------------------- */

const DEFAULT_COLUMN_WIDTH = 160; // match ShipmentsTable default
const LS_PREFIX = "events_table_v1:";

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
/* ================== AZURE SQL SAFE HELPERS ================== */
/* ADDED ONLY FOR AZURE SQL NULL / CASE / DATETIME SAFETY */

function getSqlValue(
  fields: Record<string, unknown>,
  technicalName: string
): unknown {
  if (!fields) return undefined;

  // Exact match
  if (technicalName in fields) {
    return fields[technicalName];
  }

  const lower = technicalName.toLowerCase();

  // Case-insensitive match (Azure SQL safe)
  const exactKey = Object.keys(fields).find(
    (k) => k.toLowerCase() === lower
  );
  if (exactKey) return fields[exactKey];

  // Partial fallback (legacy data safety)
// ❌ prevent ID fields from fuzzy matching
if (!lower.includes("id")) {
  const partialKey = Object.keys(fields).find(
    (k) => k.toLowerCase().includes(lower)
  );
  if (partialKey) return fields[partialKey];
}

}

function formatSqlValue(
  value: unknown,
  technicalName?: string
): string {
  if (value === null || value === undefined) return "—";

  // ✅ format ONLY real date fields
  if (
    typeof value === "string" &&
    technicalName &&
    ["eta", "timestamp", "eventdate", "createdon", "updatedon"].includes(
      technicalName.toLowerCase()
    )
  ) {
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) {
      return d.toLocaleString();
    }
  }

  // ✅ IDs remain IDs
  return String(value);
}


/* -------------------------------------------------------------------------- */
/*                                 Component                                   */
/* -------------------------------------------------------------------------- */

const EventsTable: React.FC<EventsTableProps> = ({ rows, fieldDefs, storageKey = "", onSelectRow }) => {
  // sanitize defs: ensure technicalName and title exist
  const sanitized = useMemo(() => {
    if (!Array.isArray(fieldDefs)) return [];
    const seen = new Set<string>();
    const out: SimpleFieldDef[] = [];
    for (const f of fieldDefs) {
      if (!f || !f.technicalName) continue;
      const key = String(f.technicalName).trim();
      if (!key) continue;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        title: f.title ?? f.technicalName,
        technicalName: f.technicalName,
        visibleInAdapt: f.visibleInAdapt ?? true,
order: f.order,
id: f.id,

      } as SimpleFieldDef);
    }
    return out;
  }, [fieldDefs]);

  // allowed/adaptable fields
  const adaptable = useMemo(() => sanitized.filter((s) => s.visibleInAdapt !== false), [sanitized]);

  // ordering: try to use order property, fallback to title
  const orderedMaster = useMemo(() => {
    return [...adaptable].sort((a, b) => {
const oa = a.order ?? 9999;
const ob = b.order ?? 9999;

      if (oa !== ob) return oa - ob;
      return (a.title ?? a.technicalName).localeCompare(b.title ?? b.technicalName);
    });
  }, [adaptable]);

  const storageId = LS_PREFIX + (storageKey || "default");

  // initial visible keys from localStorage or fallback to master list
  const initialVisible = useMemo(() => {
    try {
      const raw = localStorage.getItem(storageId);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed.visibleKeys) && parsed.visibleKeys.length > 0) {
          const vk = parsed.visibleKeys.filter((k: string) => orderedMaster.some((m) => m.technicalName === k));
          if (vk.length) return vk;
        }
      }
    } catch {
      // ignore
    }
    return orderedMaster.map((m) => m.technicalName);
  }, [orderedMaster, storageId]);

  const [visibleKeys, setVisibleKeys] = useState<string[]>(initialVisible);

  // -----------------------
  // column widths (persisted)
  // -----------------------
  const savedWidths = useMemo(() => {
    try {
      const raw = localStorage.getItem(storageId);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed.colWidths)) return parsed.colWidths as number[];
      }
    } catch {
  // intentionally ignored
}

    return null;
  }, [storageId]);

  const [colWidths, setColWidths] = useState<number[]>(() => savedWidths ?? initialVisible.map(() => DEFAULT_COLUMN_WIDTH));

  useEffect(() => {
    // when visibleFields length changes reset widths if no saved widths
setColWidths(
  savedWidths
    ? savedWidths
    : initialVisible.map(() => DEFAULT_COLUMN_WIDTH)
);

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialVisible.length]);

  // selected row persisted in sessionStorage
  const sessionSelectedKey = `events_selected:${storageKey || "default"}`;
  const [selectedId, setSelectedId] = useState<string | null>(() => {
    try {
      return sessionStorage.getItem(sessionSelectedKey);
    } catch {
      return null;
    }
  });

  useEffect(() => {
    try {
      if (selectedId) sessionStorage.setItem(sessionSelectedKey, selectedId);
      else sessionStorage.removeItem(sessionSelectedKey);
    } catch {
  // intentionally ignored
}
  }, [selectedId, sessionSelectedKey]);

  useEffect(() => {
    // ensure visible keys remain valid when master changes
    setVisibleKeys((prev) => {
      const next = prev.filter((k) => orderedMaster.some((m) => m.technicalName === k));
      return next.length ? next : orderedMaster.map((m) => m.technicalName);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderedMaster.length]);

  // persist visibleKeys + colWidths together
  useEffect(() => {
    try {
      const payload = {
        visibleKeys,
        colWidths: colWidths,
      };
      localStorage.setItem(storageId, JSON.stringify(payload));
    } catch {
  // intentionally ignored
}
  }, [visibleKeys, colWidths, storageId]);

  // visible field defs in visibleKeys order
  const visibleFields = useMemo(() => {
    return visibleKeys.map((k) => orderedMaster.find((m) => m.technicalName === k)).filter((x): x is SimpleFieldDef => !!x);
  }, [orderedMaster, visibleKeys]);

  /* resizing */
  const resizing = useRef<{ index: number; startX: number; startWidth: number } | null>(null);
  const handleMouseDown = (i: number, e: React.MouseEvent) => {
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

  /* adapt columns dialog */
  const [adaptOpen, setAdaptOpen] = useState(false);
  const [dialogSearch, setDialogSearch] = useState("");
  const [localSelect, setLocalSelect] = useState<string[]>(visibleKeys);

  useEffect(() => {
    if (adaptOpen) {
      setLocalSelect(visibleKeys.slice());
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
    setVisibleKeys(next.length ? next : orderedMaster.map((m) => m.technicalName));
    setAdaptOpen(false);
  };

  /* drag & drop header reorder */
  const dragSrcIndex = useRef<number | null>(null);
  const dragImageRef = useRef<HTMLElement | null>(null);

  const reorderVisibleKeys = (srcIndex: number, destIndex: number) => {
    if (srcIndex === destIndex) return;
    const keys = [...visibleKeys];
    const srcKey = keys[srcIndex];
    if (!srcKey) return;
    keys.splice(srcIndex, 1);
    keys.splice(destIndex, 0, srcKey);
    setVisibleKeys(keys);
    setColWidths((ws) => {
      const w = [...ws];
      const from = Math.min(Math.max(0, srcIndex), w.length - 1);
      const moved = w.splice(from, 1)[0];
      const to = Math.min(Math.max(0, destIndex), w.length);
      w.splice(to, 0, moved);
      return w;
    });
  };

  const handleDragStart = (e: React.DragEvent, index: number) => {
    dragSrcIndex.current = index;
    try {
      e.dataTransfer.setData("text/plain", "");
    } catch { /* empty */ }
    const img = document.createElement("div");
    img.style.width = "0px";
    img.style.height = "0px";
    img.style.overflow = "hidden";
    document.body.appendChild(img);
    dragImageRef.current = img;
    try {
      e.dataTransfer.setDragImage(img, 0, 0);
    } catch { /* empty */ }
    e.dataTransfer.effectAllowed = "move";
  };
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };
  const handleDrop = (e: React.DragEvent, destIndex: number) => {
    e.preventDefault();
    const src = dragSrcIndex.current;
    if (src == null) return;
    reorderVisibleKeys(src, destIndex);
    dragSrcIndex.current = null;
  };
  const handleDragEnd = () => {
    if (dragImageRef.current && dragImageRef.current.parentNode) dragImageRef.current.parentNode.removeChild(dragImageRef.current);
    dragImageRef.current = null;
    dragSrcIndex.current = null;
  };

  /* render cell (tries several fuzzy lookups) */
  const renderCell = (f: SimpleFieldDef, itemFields: Record<string, unknown>) => {
// 🔧 Azure SQL safe value resolution
const raw = getSqlValue(itemFields, f.technicalName);

    const value = raw ?? "—";

    if (isStatusField(f.technicalName)) return renderStatusIcon(value);

    if (Array.isArray(value)) {
      return (
        <span
          style={{
            display: "inline-block",
            width: "100%",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
          title={(value as unknown[]).join(", ")}
        >
          {(value as unknown[]).join(", ")}
        </span>
      );
    }

return (
  <span
    style={{
      display: "inline-block",
      width: "100%",
      whiteSpace: "nowrap",
      overflow: "hidden",
      textOverflow: "ellipsis",
    }}
   title={formatSqlValue(value, f.technicalName)}
  >
   {formatSqlValue(value, f.technicalName)}

  </span>
);

  };

  const gridTemplate = colWidths.map((w) => `${w}px`).join(" ");

  return (
    <>
      <Paper elevation={2} style={{ padding: 12, overflowX: "auto", position: "relative" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <Typography variant="h6" style={{ fontWeight: 600, fontSize: 14 }}>
            Events ({rows.length})
          </Typography>

          <div style={{ display: "flex", gap: 8 }}>
            <Button startIcon={<TuneIcon />} variant="outlined" size="small" onClick={() => setAdaptOpen(true)}>
              Adapt Columns
            </Button>
          </div>
        </div>

        <div style={{ border: "1px solid rgba(0,0,0,0.06)", borderRadius: 6, overflow: "auto" }}>
          <div style={{ minWidth: "max-content", display: "block" }}>
            {/* header */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: gridTemplate,
                alignItems: "center",
                background: "#f3f4f6",
                color: "#374151",
                fontWeight: 600,
                fontSize: 12, // match ShipmentsTable header size
              }}
            >
              {visibleFields.map((f, i) => (
                <div
                  key={f.technicalName}
                  data-idx={i}
                  draggable
                  onDragStart={(e) => handleDragStart(e, i)}
                  onDragOver={(e) => handleDragOver(e)}
                  onDrop={(e) => handleDrop(e, i)}
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
                  <ResizeHandle onMouseDown={(e) => handleMouseDown(i, e)} />
                </div>
              ))}
            </div>

            <Divider />

            {/* rows */}
            <div>
              {rows.length === 0 ? (
                <div style={{ padding: 12, textAlign: "center", color: "#6b7280", fontSize: 12 }}>No events found.</div>
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
                      onClick={() => {
                        setSelectedId(rid);
                        onSelectRow?.(rid);
                      }}
                      onDoubleClick={() => {
                        // placeholder for future expand
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setSelectedId(rid);
                          onSelectRow?.(rid);
                        }
                      }}
                      style={{
                        display: "grid",
                        gridTemplateColumns: gridTemplate,
                        alignItems: "center",
                        background: bg,
                        ...selectedStyle,
                        cursor: "pointer",
                        fontSize: 12,
                      }}
                      data-event-id={r.id}
                    >
                      {visibleFields.map((f) => (
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
            <TextField
              placeholder="Search fields..."
              size="small"
              value={dialogSearch}
              onChange={(e) => setDialogSearch(e.target.value)}
              fullWidth
              InputLabelProps={{ sx: { fontSize: 12 } }}
              inputProps={{ style: { fontSize: 12 } }}
              sx={{
                "& .MuiOutlinedInput-root": { height: 34 },
                "& .MuiInputBase-input": { padding: "6px 10px", boxSizing: "border-box" },
              }}
            />
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
              return (
                <ListItem key={f.technicalName} button onClick={() => toggleLocal(f.technicalName)} dense>
                  <ListItemIcon>
                    <Checkbox edge="start" checked={checked} tabIndex={-1} disableRipple onChange={() => toggleLocal(f.technicalName)} />
                  </ListItemIcon>
                  <ListItemText
                    primary={<span style={{ fontSize: 12 }}>{f.title}</span>}
                    secondary={<span style={{ fontSize: 11 }}>{f.technicalName}</span>}
                  />
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

export default EventsTable;
