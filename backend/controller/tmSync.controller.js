import { syncTMToAzure } from "../services/tmToAzure.service.js";

export async function runTMSync(req, res) {
  const result = await syncTMToAzure();
  res.json(result);
}
