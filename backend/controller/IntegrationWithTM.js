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
    case "DELAY": return "DLY";
    case "POD": return "POD";
    case "UNPLANNED": return "UNPLN";
    default: return eventCode;
  }
}

async function fetchCsrf() {
  const url = "http://103.152.79.22:8002/sap/opu/odata/SAP/ZSKY_SRV/$metadata";

  const res = await axios({
    method: "GET",
    url,
    headers: {
      "x-csrf-token": "Fetch",
      Authorization: `Basic ${process.env.SAP_BASIC}`
    }
  });

  return {
    token: res.headers["x-csrf-token"],
    cookie: res.headers["set-cookie"][0].split(";")[0]
  };
}

/* ------------------ TM GET ------------------ */
async function getEvent(req, res) {
  try {
    const fo_id = req.params.fo_id;

    if (!fo_id)
      return res.status(400).json({ success: false, message: "fo_id required" });

    const url = `http://103.152.79.22:8002/sap/opu/odata/SAP/ZSKY_SRV/SearchFOSet(FoId='${fo_id}')?$format=json`;

    const result = await axios.get(url, {
      headers: {
        Authorization: `Basic ${process.env.SAP_BASIC}`,
        Accept: "application/json"
      }
    });

    const payload = normalize(result.data)[0];

    res.json({ success: true, data: payload });

  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

/* ------------------ TM POST ------------------ */
async function postEvent(req, res) {
  try {
    const { fo_id, event, StopId} = req.body;
    console.log("Request Body:", fo_id, event, StopId);

    if (!fo_id || !event)
      return res.status(400).json({
        success: false,
        message: "fo_id and event_code required"
      });

    // Convert to SAP event code
   // const mappedCode = convertEventCode(event_code);

    // Fetch CSRF token + cookie
    const { token, cookie } = await fetchCsrf();

    const url = `http://103.152.79.22:8002/sap/opu/odata/SAP/ZSKY_SRV`;

    /* -------------------------------
       🔥 SAP TM REQUIRED PAYLOAD
       Hardcoded for now as per your requirement
       FoId, Action, StopId
    -------------------------------- */
    const payload = {
      "FoId": fo_id,           // "6300003009"
      "Action": event,    // "DEPT"
      "StopId": "SP_1000",     // hardcoded stop ID
    };

    const result = await axios.post(url, payload, {
      headers: {
        Authorization: `Basic ${process.env.SAP_BASIC}`,
        "x-csrf-token": token,
        Cookie: cookie,
        path: '/EventsReportingSet',
        "Content-Type": "application/json"
      }
    });

    res.json({ success: true, tm_response: result.data });

  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

module.exports = { getEvent, postEvent };
