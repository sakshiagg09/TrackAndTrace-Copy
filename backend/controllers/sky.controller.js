import { saveSkyEvent } from "../services/events.service.js";
import { postDelayToTM } from "../services/tm.service.js";

export async function receiveEvent(req, res) {
  try {
    const { FoId, Action } = req.body;
    if (!FoId || !Action) {
      return res.status(400).json({ error: "FoId & Action required" });
    }

    await saveSkyEvent(req.body);
    const tmRes = await postEventToTM(req.body);
    res.json(tmRes);

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

/*export async function receiveDelay(req, res) {
  try {
    const { FoId, StopId } = req.body;
    if (!FoId || !StopId) {
      return res.status(400).json({ error: "FoId & StopId required" });
    }

    await saveSkyEvent(req.body);
    const tmRes = await postDelayToTM(req.body);
    res.json(tmRes);

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}*/

export async function receiveDelay(req, res) {
  try {
    const payload = req.body;

    // 1️⃣ Send to TM
    const { etaDate } = await postDelayToTM(payload);

    // 2️⃣ Save to SQL
await saveSkyEvent({
  FoId: payload.FoId,
  StopId: payload.StopId,
  Event: payload.RefEvent ?? "DELAY",
  EventCode: payload.EventCode,
  EvtReasonCode: payload.EvtReasonCode,
  Description: payload.Description,
  ETA: payload.ETA    // ✅ THIS WAS MISSING
});


    res.json({
      success: true,
      message: "Delay sent to TM and saved in SQL"
    });

  } catch (err) {
    console.error("Delay error:", err.message);
    res.status(400).json({ error: err.message });
  }
}


export async function receivePOD(req, res) {
  try {
    const { FoId, StopId } = req.body;
    if (!FoId || !StopId) {
      return res.status(400).json({ error: "FoId & StopId required" });
    }

    await saveSkyEvent(req.body);
    const tmRes = await postPODToTM(req.body);
    res.json(tmRes);

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
