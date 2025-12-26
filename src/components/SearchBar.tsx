// src/components/SearchBar.tsx
import React, { useEffect, useMemo, useState } from "react";
import {
  TextField,
  Button,
  Typography,
  Paper,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  CircularProgress,
  Checkbox,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  IconButton,
  InputAdornment,
} from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import CloseIcon from "@mui/icons-material/Close";
import UploadIcon from "@mui/icons-material/Upload";
import { useNavigate } from "react-router-dom";

import type { SimpleFieldDef } from "../utils/simpleFieldConfig";

export interface SearchBarProps {
  fieldDefs: SimpleFieldDef[];
  onFilter: (filtersByTechnicalName: Record<string, string>) => void;
}

/* localStorage keys */
const LS_KEY = "searchbar_visible_fields_v1";
const FILTERS_LS = "searchbar_values_v1";

/* helpers */
function normalizeKey(k: string) {
  return (k ?? "").toString().trim().toLowerCase();
}

/* Allowed keys = fields allowed to appear in the search (visibleInAdapt !== false) */
const allowedKeysFromDefs = (defs: SimpleFieldDef[]) =>
  defs.filter((d) => d.visibleInAdapt !== false).map((d) => d.technicalName);

const DEFAULT_VISIBLE_KEYS = allowedKeysFromDefs;

/**
 * Map saved entries (title or technicalName) to canonical technicalNames.
 * Returns mapped array (no duplicates).
 */
function mapSavedKeysToTechnical(
  saved: string[],
  fieldDefs: SimpleFieldDef[]
): string[] {
  if (!Array.isArray(saved) || !Array.isArray(fieldDefs)) return [];

  const canonicalByLower = new Map<string, string>();

  for (const fd of fieldDefs) {
    canonicalByLower.set(
      normalizeKey(fd.technicalName),
      fd.technicalName
    );

    canonicalByLower.set(
      normalizeKey(fd.title),
      fd.technicalName
    );
  }

  const mapped: string[] = [];

  for (const s of saved) {
    const key = normalizeKey(s);
    const tech = canonicalByLower.get(key);

    if (tech && !mapped.includes(tech)) {
      mapped.push(tech);
    }
  }

  return mapped;
}


const SearchBar: React.FC<SearchBarProps> = ({ fieldDefs, onFilter }) => {
  const navigate = useNavigate();
  const [values, setValues] = useState<Record<string, string>>({});
  const [visibleKeys, setVisibleKeys] = useState<string[]>([]);
  const [adaptOpen, setAdaptOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);

  // persist only after initial load from fieldDefs
  const [initialized, setInitialized] = useState(false);

  // helper: list of allowed defs (visibleInAdapt !== false)
  const allowedDefs = useMemo(() => (Array.isArray(fieldDefs) ? fieldDefs.filter((f) => f.visibleInAdapt !== false) : []), [fieldDefs]);

  // initialize when fieldDefs are loaded
  useEffect(() => {
    if (!Array.isArray(fieldDefs) || fieldDefs.length === 0) return;

    // Build canonical map for tolerant mapping (both title and technicalName)
    const canonicalMap = new Map<string, string>();
    fieldDefs.forEach((fd) => {
      canonicalMap.set(normalizeKey(fd.technicalName), fd.technicalName);
      canonicalMap.set(normalizeKey(fd.title ?? ""), fd.technicalName);
    });

    // Restore filter values (saved object might use titles or tech names)
    const baseVals: Record<string, string> = {};
    fieldDefs.forEach((f) => (baseVals[f.technicalName] = ""));

    try {
      const raw = localStorage.getItem(FILTERS_LS);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object") {
          for (const [k, v] of Object.entries(parsed)) {
            const canonical = canonicalMap.get(normalizeKey(k));
            if (canonical) baseVals[canonical] = String(v ?? "");
          }
        }
      }
    } catch {
      // ignore parse errors
    }
    setValues(baseVals);

    // apply restored filters immediately if any value is present
    const hasAny = Object.values(baseVals).some((x) => x && x.toString().trim().length > 0);
    if (hasAny) {
      setTimeout(() => onFilter(baseVals), 0);
    }

    // Restore visible keys (supports title-based or techName-based saved arrays)
    try {
      const rawVK = localStorage.getItem(LS_KEY);
      const allowed = DEFAULT_VISIBLE_KEYS(fieldDefs); // only allowed by visibleInAdapt
      if (!rawVK) {
        setVisibleKeys(allowed);
      } else {
        const parsed = JSON.parse(rawVK);
        if (Array.isArray(parsed) && parsed.length > 0) {
          // Attempt mapping (handles titles or tech names)
          const mapped = mapSavedKeysToTechnical(parsed, fieldDefs);
          // prune mapped to allowed set (fields that currently have visibleInAdapt !== false)
          const pruned = mapped.filter((k) => allowed.includes(k));
          // If pruned empty, fall back to allowed defaults
          const final = pruned.length ? pruned : allowed;
          setVisibleKeys(final);
          // migrate and persist canonical + pruned selection
          try {
            localStorage.setItem(LS_KEY, JSON.stringify(final));
          } catch {
            // ignore
          }
        } else {
          // empty array or invalid -> fallback to defaults (do not persist empty array)
          setVisibleKeys(allowed);
        }
      }
    } catch {
      const allowed = DEFAULT_VISIBLE_KEYS(fieldDefs);
      setVisibleKeys(allowed);
    }

    setInitialized(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fieldDefs]);

  // If fieldDefs change later, ensure visibleKeys are still allowed (prune if needed)
  useEffect(() => {
    if (!initialized) return;
    if (!Array.isArray(fieldDefs) || fieldDefs.length === 0) return;

    const allowed = DEFAULT_VISIBLE_KEYS(fieldDefs);
    const next = visibleKeys.filter((k) => allowed.includes(k));
    if (next.length === visibleKeys.length) {
      // nothing changed
      return;
    }
    const final = next.length ? next : allowed;
    setVisibleKeys(final);
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(final));
    } catch {
      // ignore
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fieldDefs, initialized]);

  // Persist visibleKeys but only after initialization; avoid saving an empty array
  useEffect(() => {
    if (!initialized) return;
    try {
      if (Array.isArray(visibleKeys) && visibleKeys.length > 0) {
        localStorage.setItem(LS_KEY, JSON.stringify(visibleKeys));
      } else {
        localStorage.removeItem(LS_KEY);
      }
    } catch {
      // ignore storage errors
    }
  }, [visibleKeys, initialized]);

  const visibleDefs = useMemo(
    () => (fieldDefs || []).filter((f) => visibleKeys.includes(f.technicalName)),
    [fieldDefs, visibleKeys]
  );

  function handleChange(technicalName: string, value: string) {
    setValues((p) => ({ ...p, [technicalName]: value }));
  }

  function handleGo() {
    try {
      localStorage.setItem(FILTERS_LS, JSON.stringify(values));
    } catch {
      // ignore
    }
    onFilter(values);
  }

  function handleClear() {
    const cleared: Record<string, string> = {};
    Object.keys(values).forEach((k) => (cleared[k] = ""));
    setValues(cleared);
    onFilter(cleared);
    try {
      localStorage.removeItem(FILTERS_LS);
    } catch {
      // ignore
    }
  }

  /* Upload dialog (wired to the provided FLOW_URL) */
  const FLOW_URL =
    "https://default2e8ebe5915a540439ad0d9f03c89cb.47.environment.api.powerplatform.com:443/powerautomate/automations/direct/workflows/bb475d46eea3484eaae4df42fac4a6d8/triggers/manual/paths/invoke?api-version=1&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=wTd2e4vTIsIWucjZkMjLtCpOcVGnO3oUUc5rmkoT_Q4";

  const UploadDialog: React.FC<{ open: boolean; onClose: () => void }> = ({ open, onClose }) => {
    const [file, setFile] = useState<File | null>(null);
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState<string | null>(null);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const selected = e.target.files?.[0];
      if (!selected) return;
      if (selected.type !== "application/pdf") {
        setMessage("Please upload PDF only.");
        return;
      }
      setFile(selected);
      setMessage(null);
    };

    const toBase64 = (f: File) =>
      new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(f);
      });

    const handleUpload = async () => {
      if (!file) {
        setMessage("Select a file");
        return;
      }
      setLoading(true);
      setMessage(null);

      try {
        // Convert file to data URL and strip the prefix so we send raw base64 (matches schema)
        const dataUrl = await toBase64(file);
        const base64Content = dataUrl.split(",")[1] ?? "";

        // Payload must match the schema you provided:
        // { fileName: string, fileContent: string }
        const payload = {
          fileName: file.name,
          fileContent: base64Content,
        };

        const resp = await fetch(FLOW_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        });

        if (!resp.ok) {
          // try to read response text for better error message
          const text = await resp.text().catch(() => "");
          throw new Error(`Upload failed: ${resp.status} ${resp.statusText} ${text ? "- " + text : ""}`);
        }

        // First attempt: try to parse JSON (previous behavior)
        let jsonResp: Record<string, unknown> | null = null;
        try {
          jsonResp = await resp.clone().json();
        } catch {
          // ignore if not JSON
        }

        // Second attempt: if not JSON (or JSON didn't include an id), read as plain text
        const textResp = await resp.text().catch(() => "");

        // Helper: is this string a likely identifier? (alphanumeric + dashes/underscores, 3-40 chars)
        const isLikelyId = (s: string | null | undefined) => {
          if (!s) return false;
          const t = String(s).trim();
          return /^[A-Za-z0-9\-_]{3,40}$/.test(t);
        };

        // Try to extract id from JSON response first (check common keys)
        const candidateKeys = [
          "containerNumber",
          "containerNo",
          "container_number",
          "container_no",
          "freightNumber",
          "freightNo",
          "freight_number",
          "freight_no",
          "trackingNumber",
          "tracking_no",
          "tracking_number",
          "id",
          "shipmentId",
          "shipment_id",
        ];
        let foundId: string | null = null;

        if (jsonResp && typeof jsonResp === "object") {
          for (const k of candidateKeys) {
            if (k in jsonResp && jsonResp[k]) {
              const s = String(jsonResp[k]).trim();
              if (isLikelyId(s)) {
                foundId = s;
                break;
              }
            }
          }

          if (!foundId) {
            // scan string values in JSON for something that looks like an id
            for (const v of Object.values(jsonResp)) {
              if (!v) continue;
              const s = String(v).trim();
              if (isLikelyId(s)) {
                foundId = s;
                break;
              }
            }
          }
        }

        // If no id found in JSON, check plain text response (covers your case: response = "GESU1039022")
        if (!foundId && isLikelyId(textResp)) {
          foundId = textResp.trim();
        }

        // Fallback: if textResp contains JSON-like content (rare) but not pure id, try trimming quotes
        if (!foundId && textResp) {
          const trimmed = textResp.trim();
          // handles responses like: "GESU1039022" (with quotes)
          const unquoted = trimmed.replace(/^"(.*)"$/, "$1").replace(/^'(.*)'$/, "$1");
          if (isLikelyId(unquoted)) {
            foundId = unquoted;
          }
        }

        setMessage("Uploaded successfully");

        // If we found a container / freight id, navigate to shipment details page
        if (foundId) {
          const encoded = encodeURIComponent(foundId);
          // NOTE: changed to singular '/shipment/:id' to match ShipmentsTable navigation
          setMessage(`Opening shipment ${foundId}...`);
          // small timeout so user sees the upload success briefly
          setTimeout(() => {
            onClose();
            navigate(`/shipment/${encoded}`);
          }, 350);
        } else {
          // no id found — just close after brief confirmation
          setTimeout(() => {
            setMessage(null);
            onClose();
          }, 800);
        }

        setFile(null);
      } catch (e) {
        setMessage("Upload failed: " + String(e));
      } finally {
        setLoading(false);
      }
    };

    return (
      <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
        <DialogTitle>Upload PDF</DialogTitle>
        <DialogContent>
          <input type="file" accept="application/pdf" onChange={handleFileChange} />
          {file && <Typography sx={{ mt: 2, fontSize: 12 }}>{file.name}</Typography>}
          {loading && <CircularProgress size={20} sx={{ mt: 1 }} />}
          {message && <Typography sx={{ mt: 1, fontSize: 12 }}>{message}</Typography>}
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>Close</Button>
          <Button variant="contained" disabled={!file || loading} onClick={handleUpload} startIcon={<UploadIcon />}>
            Send
          </Button>
        </DialogActions>
      </Dialog>
    );
  };

  /* Adapt dialog: show only allowedDefs (fields with visibleInAdapt !== false) */
  const AdaptDialog: React.FC<{ open: boolean; onClose: () => void }> = ({ open, onClose }) => {
    const [search, setSearch] = useState("");
    const [local, setLocal] = useState<string[]>(visibleKeys);

   useEffect(() => {
  if (open) {
    setLocal(visibleKeys);
  }
}, [open]);

    // Only search within allowedDefs
const s = search.trim().toLowerCase();

const filtered = !s
  ? allowedDefs
  : allowedDefs.filter(
      (d) =>
        (d.title ?? d.technicalName).toLowerCase().includes(s) ||
        d.technicalName.toLowerCase().includes(s)
    );



    const toggle = (technicalName: string) =>
      setLocal((p) => (p.includes(technicalName) ? p.filter((k) => k !== technicalName) : [...p, technicalName]));

    const selectAll = () => setLocal(allowedDefs.map((f) => f.technicalName));
    const clearAll = () => setLocal([]);
    const resetDefaults = () => setLocal(DEFAULT_VISIBLE_KEYS(fieldDefs));

    return (
      <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
        <DialogTitle>
          Adapt Filters
          <IconButton onClick={onClose} sx={{ ml: "auto" }}>
            <CloseIcon />
          </IconButton>
        </DialogTitle>

        <DialogContent dividers>
          <TextField
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            fullWidth
            placeholder="Search for filters"
            size="small"
            InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }}
            InputLabelProps={{ sx: { fontSize: 12 } }}
            inputProps={{ style: { fontSize: 12 } }}
            sx={{
              mb: 2,
              "& .MuiOutlinedInput-root": { height: 34 },
              "& .MuiInputBase-input": { padding: "6px 10px", boxSizing: "border-box" },
            }}
          />

          <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            <Button size="small" onClick={selectAll}>Select All</Button>
            <Button size="small" onClick={clearAll}>Clear All</Button>
            <Button size="small" onClick={resetDefaults}>Reset Defaults</Button>
          </div>

          <List dense sx={{ maxHeight: 420, overflow: "auto", border: "1px solid #eee" }}>
            {filtered.map((f) => {
              const checked = local.includes(f.technicalName);
              return (
                <ListItem
                  key={f.technicalName}
                  button
                  onClick={() => toggle(f.technicalName)}
                  secondaryAction={<Checkbox edge="end" checked={checked} onChange={() => toggle(f.technicalName)} />}
                >
                  <ListItemIcon>
                    <Checkbox edge="start" checked={checked} tabIndex={-1} disableRipple />
                  </ListItemIcon>
                  <ListItemText primary={<span style={{ fontSize: 13 }}>{f.title}</span>} secondary={<span style={{ fontSize: 11 }}>{f.technicalName}</span>} />
                </ListItem>
              );
            })}
          </List>
        </DialogContent>

        <DialogActions>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="contained"
            onClick={() => {
              const allowed = DEFAULT_VISIBLE_KEYS(fieldDefs);
              const next = fieldDefs.map((fd) => fd.technicalName).filter((k) => local.includes(k));
              const toSave = next.length ? next.filter((k) => allowed.includes(k)) : allowed;
              setVisibleKeys(toSave);
              try {
                if (initialized) {
                  localStorage.setItem(LS_KEY, JSON.stringify(toSave));
                }
              } catch {
                // ignore
              }
              onClose();
            }}
          >
            OK
          </Button>
        </DialogActions>
      </Dialog>
    );
  };

  const visibleDefsSorted = useMemo(() => {
    const order = fieldDefs.map((fd) => fd.technicalName);
    return visibleDefs.slice().sort((a, b) => order.indexOf(a.technicalName) - order.indexOf(b.technicalName));
  }, [visibleDefs, fieldDefs]);

  return (
    <>
      <Paper elevation={1} className="p-6 mb-6" style={{ background: "linear-gradient(180deg,#fff 0%,#f9fbff 100%)", border: "1px solid rgba(0,0,0,0.05)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <Typography variant="h6" style={{ color: "#0b66d0", fontWeight: 600 }}>Filters</Typography>
          <div style={{ display: "flex", gap: 8 }}>
            <Button variant="outlined" size="small" onClick={() => handleClear()} sx={{ fontSize: 12 }}>Clear</Button>
            <Button variant="contained" onClick={handleGo} sx={{ backgroundColor: "#0b66d0", color: "#fff", fontSize: 12 }}>Go</Button>
            <Button variant="outlined" onClick={() => setAdaptOpen(true)} sx={{ fontSize: 12 }}>Adapt Filters</Button>
            <Button variant="contained" startIcon={<UploadIcon />} onClick={() => setUploadOpen(true)} sx={{ fontSize: 12 }}>Upload</Button>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px,1fr))", gap: 10 }}>
          {visibleDefsSorted.map((d) => (
            <TextField
              key={d.technicalName}
              label={d.title}
              fullWidth
              value={values[d.technicalName] ?? ""}
              onChange={(e) => handleChange(d.technicalName, e.target.value)}
              size="small"
              InputLabelProps={{ sx: { fontSize: 12 } }}
              inputProps={{ style: { fontSize: 12 } }}
              sx={{
                "& .MuiOutlinedInput-root": { height: 34 },
                "& .MuiInputBase-input": { padding: "6px 10px", boxSizing: "border-box" },
              }}
            />
          ))}
        </div>
      </Paper>

      <AdaptDialog open={adaptOpen} onClose={() => setAdaptOpen(false)} />
      <UploadDialog open={uploadOpen} onClose={() => setUploadOpen(false)} />
    </>
  );
};

export default SearchBar;
