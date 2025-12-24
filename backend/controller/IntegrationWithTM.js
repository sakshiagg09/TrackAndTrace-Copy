const axios = require("axios");

/* ------------------ Helpers ------------------ */
function normalize(data) {
  const d = data?.d ?? data;
  if (!d) return null;
  if (Array.isArray(d.results)) return d.results;
  if (typeof d === "object") return [d];
  return null;
}

function convertEventCode(eventCode) {
  switch ((eventCode ?? "").toUpperCase()) {
    case "ARRIVAL": return "ARRI";
    case "DEPARTURE": return "DEPT";
    default: return eventCode;
  }
}

/* ------------------ CSRF FETCH ------------------ */
async function fetchCsrf() {
  const url = "http://103.152.79.22:8002/sap/opu/odata/SAP/ZSKY_SRV/$metadata";

  const res = await axios({
    method: "GET",
    url,
    headers: {
      "x-csrf-token": "Fetch",
      Authorization: `Basic ${process.env.SAP_BASIC}`,
      Accept: "application/xml"
    }
  });

  const token = res.headers["x-csrf-token"];
  const cookieHeader = res.headers["set-cookie"];

  if (!token) {
    throw new Error("CSRF token missing from SAP response");
  }

  const cookie = cookieHeader
    ? cookieHeader.map(c => c.split(";")[0]).join("; ")
    : "";

  return { token, cookie };
}

/* ------------------ TM GET ------------------ */
async function getEvent(req, res) {
  try {
    const fo_id = req.params.fo_id || req.query.fo_id;

    if (!fo_id)
      return res.status(400).json({ success: false, message: "fo_id required" });

    const url =
      `http://103.152.79.22:8002/sap/opu/odata/SAP/ZSKY_SRV/SearchFOSet(FoId='${fo_id}')?$format=json`;

    const result = await axios.get(url, {
      headers: {
        Authorization: `Basic ${process.env.SAP_BASIC}`,
        Accept: "application/json"
      }
    });

    const payload = normalize(result.data)[0];
    return res.json({ success: true, data: payload });

  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
}

/* ------------------ TM POST ------------------ */
async function postEvent(req, res) {
  try {
    const { FoId, Action, StopId } = req.body;

    if (!FoId || !Action)
      return res.status(400).json({
        success: false,
        message: "FoId and Action required"
      });

    // Fetch CSRF
    const { token, cookie } = await fetchCsrf();

    const url =
      "http://103.152.79.22:8002/sap/opu/odata/SAP/ZSKY_SRV/EventsReportingSet";

    const payload = {
      FoId,
      Action,
      StopId: StopId ?? "SP_1000"
    };

    console.log("SAP POST payload:", payload);

    const result = await axios({
      method: "POST",
      url,
      data: payload,
      headers: {
        Authorization: `Basic ${process.env.SAP_BASIC}`,
        "x-csrf-token": token,
        Cookie: cookie,
        Accept: "application/json",
        "Content-Type": "application/json"
      }
    });

    return res.json({ success: true, tm_response: result.data });

  } catch (err) {
    console.error("SAP Error:", err.response?.data || err.message);

    return res.status(err.response?.status || 500).json({
      success: false,
      error: err.response?.data || err.message
    });
  }
}

module.exports = { getEvent, postEvent };
