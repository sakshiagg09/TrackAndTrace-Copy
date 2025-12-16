const axios = require("axios");

/* ------------------ Normalizer ------------------ */
function normalize(data) {
  const d = data?.d;
  if (!d) return [];
  if (Array.isArray(d.results)) return d.results;
  return [d];
}

/* ------------------ Event Mapping ------------------ */
function convertEventCode(eventCode) {
  switch ((eventCode ?? "").toUpperCase()) {
    case "DEPARTURE": return "DEPT";
    case "ARRIVAL": return "ARRI";
   // case "DELAY": return "DLY";
    default: return eventCode;
  }
}

/* ------------------ CSRF Fetch Token ------------------ */
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
  if (!token) throw new Error("Missing CSRF token");

  const cookieHeader = res.headers["set-cookie"] || [];
  const cookie = cookieHeader.map(c => c.split(";")[0]).join("; ");

  return { token, cookie };
}

/* ------------------ GET FO Details ------------------ */
async function getEvent(req, res) {
  try {
    const { fo_id } = req.params;

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
    return res.status(500).json({
      success: false,
      error: err.response?.data || err.message
    });
  }
}

/* ------------------ POST Normal Events ------------------ */
async function postEvent(req, res) {
  try {
    const { FoId, Action, StopId } = req.body;

    const mappedAction = convertEventCode(Action);
    const { token, cookie } = await fetchCsrf();

    const url =
      "http://103.152.79.22:8002/sap/opu/odata/SAP/ZSKY_SRV/EventsReportingSet";

    // 🔥 DO NOT MODIFY STOPID AT ALL
    const payload = {
      FoId,
      Action: mappedAction,
      StopId // send EXACTLY "SP_1000"
    };

    console.log("🚀 FINAL PAYLOAD SENT TO SAP:", payload);

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

    return res.json({
      success: true,
      tm_response: result.data
    });

  } catch (err) {
    console.error("❌ SAP POST EVENT ERROR:", err.response?.data || err.message);
    return res.status(err.response?.status || 500).json({
      success: false,
      error: err.response?.data || err.message
    });
  }
}


/* ------------------ GET POD Items ------------------ */
/*async function getItems(req, res) {
  try {
    const { FoId, Location } = req.query;

    const url =
      `http://103.152.79.22:8002/sap/opu/odata/SAP/ZSKY_SRV/ItemsSet?$filter=FoId eq '${FoId}' and Location eq '${Location}'&$format=json`;

    const result = await axios.get(url, {
      headers: {
        Authorization: `Basic ${process.env.SAP_BASIC}`,
        Accept: "application/json"
      }
    });

    const items = normalize(result.data);
    return res.json({ success: true, items });

  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err.response?.data || err.message
    });
  }
}*/

/* ------------------ POST POD Event ------------------ */
/* ------------------ POST POD Event ------------------ */
async function postPOD(req, res) {
  try {
    const { FoId, StopId, Discrepency } = req.body;

    const { token, cookie } = await fetchCsrf();

    const url =
      "http://103.152.79.22:8002/sap/opu/odata/SAP/ZSKY_SRV/ProofOfDeliverySet";

    // ✔ If Items is already a string, do NOT stringify again
  //  const itemsString =
   //   typeof Items === "string" ? Items : JSON.stringify(Items);

    const payload = {
      FoId,
      StopId: StopId.padStart(10, "0"),
      Discrepency,
    //  Items: itemsString
    };

    console.log("📦 FINAL POD PAYLOAD TO SAP:", payload);

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
    console.error("❌ SAP POD ERROR:", err.response?.data || err.message);
    return res.status(err.response?.status || 500).json({
      success: false,
      error: err.response?.data || err.message
    });
  }
}

/* ------------------ POST Delay Event ------------------ */
async function postDelay(req, res) {
  try {
    const { FoId, StopId, ETA, RefEvent, EventCode } = req.body;

    const { token, cookie } = await fetchCsrf();

    const url =
      "http://103.152.79.22:8002/sap/opu/odata/SAP/ZSKY_SRV/DelaySet";

    const payload = {
      FoId,
      StopId,
      ETA,
      RefEvent,
      EventCode
    };

    console.log("📦 FINAL Delay PAYLOAD TO SAP:", payload);


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
    return res.status(err.response?.status || 500).json({
      success: false,
      error: err.response?.data || err.message
    });
  }
}



module.exports = { getEvent, postEvent, postPOD, postDelay };
