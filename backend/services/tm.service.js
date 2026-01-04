import axios from "axios";

const SAP_BASE = process.env.SAP_BASE_URL;
const SAP_CLIENT = process.env.SAP_CLIENT || "";


/* ---------------- Helper ---------------- */
function parseEtaToDate(eta) {
  if (!eta || !/^\d{14}$/.test(eta)) return null;

  const yyyy = Number(eta.slice(0, 4));
  const MM   = Number(eta.slice(4, 6)) - 1;
  const dd   = Number(eta.slice(6, 8));
  const HH   = Number(eta.slice(8, 10));
  const mm   = Number(eta.slice(10, 12));
  const ss   = Number(eta.slice(12, 14));

  const d = new Date(Date.UTC(yyyy, MM, dd, HH, mm, ss));
  return isNaN(d.getTime()) ? null : d;
}

function toIsoDateTime(eta) {
  if (!eta || !/^\d{14}$/.test(eta)) {
    throw new Error("Invalid ETA format. Expected YYYYMMDDHHMMSS");
  }

  const yyyy = eta.slice(0, 4);
  const MM   = eta.slice(4, 6);
  const dd   = eta.slice(6, 8);
  const HH   = eta.slice(8, 10);
  const mm   = eta.slice(10, 12);
  const ss   = eta.slice(12, 14);

  return `${yyyy}-${MM}-${dd}T${HH}:${mm}:${ss}`;
}

function unwrapOData(data) {
  if (data?.d) return data.d;
  return data;
}

async function fetchCsrf() {
  const url =
    `${SAP_BASE}/$metadata` +
    (SAP_CLIENT ? `?sap-client=${SAP_CLIENT}` : "");

  const res = await axios.get(url, {
    headers: {
      "x-csrf-token": "Fetch",
      Authorization: `Basic ${process.env.SAP_BASIC}`,
      Accept: "application/xml",
      "X-Requested-With": "XMLHttpRequest"
    }
  });

  return {
    token: res.headers["x-csrf-token"],
    cookie: res.headers["set-cookie"]
      ?.map(c => c.split(";")[0])
      .join("; ")
  };
}

/* ================= EVENT → TM ================= */

export async function postEventToTM(payload) {
  const { FoId, Action, StopId } = payload;

  if (!FoId || !Action) {
    throw new Error("FoId & Action required for TM Event");
  }

  const { token, cookie } = await fetchCsrf();

  const tmPayload = {
    FoId: String(FoId).trim(),
    Action: String(Action).trim(),
    StopId: String(StopId ?? "").trim()
  };

  const url =
    `${SAP_BASE}/EventsReportingSet` +
    (SAP_CLIENT ? `?sap-client=${SAP_CLIENT}` : "");

  const result = await axios.post(url, tmPayload, {
    headers: {
      Authorization: `Basic ${process.env.SAP_BASIC}`,
      "x-csrf-token": token,
      Cookie: cookie,
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-Requested-With": "XMLHttpRequest"
    },
    validateStatus: () => true
  });

  if (result.status >= 400) {
    throw new Error(
      `TM EVENT failed (${result.status}): ${JSON.stringify(result.data)}`
    );
  }

  return unwrapOData(result.data);
}

export async function postDelayToTM(payload) {
  const { token, cookie } = await fetchCsrf();

  // 🔒 STRICT VALIDATION
  if (!/^\d{14}$/.test(payload.ETA)) {
    throw new Error("ETA must be YYYYMMDDHHMMSS");
  }

  const tmPayload = {
    FoId: String(payload.FoId).trim(),
    StopId: String(payload.StopId).trim(),
    ETA: payload.ETA,                 // ✅ EXACT FORMAT
    RefEvent: String(payload.RefEvent ?? "").trim(),
    EventCode: String(payload.EventCode ?? "").trim(),
    EvtReasonCode: String(payload.EvtReasonCode ?? "").trim(),
    Description: String(payload.Description ?? "").trim()
  };

  const url =
    `${SAP_BASE}/DelaySet` +
    (SAP_CLIENT ? `?sap-client=${SAP_CLIENT}` : "");

  const result = await axios.post(url, tmPayload, {
    headers: {
      Authorization: `Basic ${process.env.SAP_BASIC}`,
      "x-csrf-token": token,
      Cookie: cookie,
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-Requested-With": "XMLHttpRequest"
    },
    validateStatus: () => true
  });

  if (result.status >= 400) {
    throw new Error(`TM Delay failed: ${JSON.stringify(result.data)}`);
  }

  return tmPayload; // return for SQL save
}


export async function postPODToTM(payload) {
  const { FoId, StopId, Discrepency, Items } = payload;

  if (!FoId || !StopId) {
    throw new Error("FoId & StopId required for POD");
  }

  const { token, cookie } = await fetchCsrf();

  const tmPayload = {
    FoId: String(FoId).trim(),
    StopId: String(StopId).trim(),
    Discrepency: String(Discrepency ?? "").trim(),
    Items: String(Items ?? "").trim()
  };

  console.log("FINAL POD PAYLOAD >>>", tmPayload); // debug once

  const result = await axios.post(
    `${SAP_BASE}/ProofOfDeliverySet${SAP_CLIENT ? `?sap-client=${SAP_CLIENT}` : ""}`,
    tmPayload,
    {
      headers: {
        Authorization: `Basic ${process.env.SAP_BASIC}`,
        "x-csrf-token": token,
        Cookie: cookie,
        Accept: "application/json",
        "Content-Type": "application/json",
        "X-Requested-With": "XMLHttpRequest"
      },
      validateStatus: () => true
    }
  );

  if (result.status >= 400) {
    throw new Error(`TM POD failed: ${JSON.stringify(result.data)}`);
  }

  return result.data;
}
