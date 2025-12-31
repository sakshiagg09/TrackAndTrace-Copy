import axios from "axios";

/* ------------------ Config ------------------ */
const SAP_BASE =
  process.env.SAP_BASE_URL ||
  "http://103.152.79.22:8002/sap/opu/odata/SAP/ZSKY_SRV";

const SAP_CLIENT = process.env.SAP_CLIENT || ""; // optional, if your system needs it

/* ------------------ Helpers ------------------ */
function unwrapODataV2Entity(data) {
  // TM returns { d: { ...entity... } }
  if (!data) return null;
  if (data.d && typeof data.d === "object") return data.d;
  return data;
}

/* ------------------ CSRF FETCH ------------------ */
async function fetchCsrf() {
  const url = `${SAP_BASE}/$metadata${SAP_CLIENT ? `?sap-client=${encodeURIComponent(SAP_CLIENT)}` : ""}`;

  const res = await axios({
    method: "GET",
    url,
    headers: {
      "x-csrf-token": "Fetch",
      Authorization: `Basic ${process.env.SAP_BASIC}`,
      Accept: "application/xml",
      "X-Requested-With": "XMLHttpRequest",
      "DataServiceVersion": "2.0",
      "MaxDataServiceVersion": "2.0",
      ...(SAP_CLIENT ? { "sap-client": String(SAP_CLIENT) } : {}),
    },
  });

  const token = res.headers["x-csrf-token"];
  const cookieHeader = res.headers["set-cookie"];

  if (!token) throw new Error("CSRF token missing from SAP response");

  const cookie = cookieHeader
    ? cookieHeader.map((c) => c.split(";")[0]).join("; ")
    : "";

  return { token, cookie };
}

/* ------------------ TM GET ------------------ */
export async function getEvent(req, res) {
  try {
    const fo_id = req.params.fo_id || req.query.fo_id;
    if (!fo_id) {
      return res.status(400).json({ success: false, message: "fo_id required" });
    }

    const url =
      `${SAP_BASE}/SearchFOSet(FoId='${encodeURIComponent(fo_id)}')?$format=json` +
      (SAP_CLIENT ? `&sap-client=${encodeURIComponent(SAP_CLIENT)}` : "");

    const result = await axios.get(url, {
      headers: {
        Authorization: `Basic ${process.env.SAP_BASIC}`,
        Accept: "application/json",
        "X-Requested-With": "XMLHttpRequest",
        "DataServiceVersion": "2.0",
        "MaxDataServiceVersion": "2.0",
        ...(SAP_CLIENT ? { "sap-client": String(SAP_CLIENT) } : {}),
      },
    });

    // return same shape you want (entity)
    const entity = unwrapODataV2Entity(result.data);
    return res.json(entity);
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
}

/* ------------------ TM POST (callable helper) ------------------ */
export async function postEventToTM(payload) {
  const { token, cookie } = await fetchCsrf();

  // ✅ send ONLY what TM accepts
  const tmPayload = {
    FoId: String(payload?.FoId ?? "").trim(),
    Action: String(payload?.Action ?? "").trim(),
    StopId: String(payload?.StopId ?? "").trim(),
  };

  if (!tmPayload.FoId || !tmPayload.Action) {
    throw new Error("FoId and Action required");
  }

  const url =
    `${SAP_BASE}/EventsReportingSet` +
    (SAP_CLIENT ? `?sap-client=${encodeURIComponent(SAP_CLIENT)}` : "");

  const result = await axios({
    method: "POST",
    url,
    data: JSON.stringify(tmPayload), // ✅ force raw JSON
    headers: {
      Authorization: `Basic ${process.env.SAP_BASIC}`,
      "x-csrf-token": token,
      Cookie: cookie,
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-Requested-With": "XMLHttpRequest",
      "DataServiceVersion": "2.0",
      "MaxDataServiceVersion": "2.0",
      ...(SAP_CLIENT ? { "sap-client": String(SAP_CLIENT) } : {}),
    },
    validateStatus: () => true,
  });

  if (result.status >= 400) {
    const errPayload =
      typeof result.data === "string" ? result.data : JSON.stringify(result.data);
    throw new Error(`TM POST failed (${result.status}): ${errPayload}`);
  }

  // ✅ IMPORTANT: return ONLY the entity (d)
  return unwrapODataV2Entity(result.data);
}

/* ------------------ TM POST (Express handler wrapper) ------------------ */
export async function postEvent(req, res) {
  try {
    const entity = await postEventToTM(req.body);

    // ✅ Respond EXACTLY like TM direct (entity only)
    return res.status(200).json(entity);
  } catch (err) {
    console.error("SAP Error:", err.response?.data || err.message);
    return res.status(err.response?.status || 500).json({
      success: false,
      error: err.response?.data || err.message,
    });
  }
}
