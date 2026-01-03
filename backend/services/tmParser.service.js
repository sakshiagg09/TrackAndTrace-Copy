export function parseFinalInfo(finalInfo) {
  try {
    if (!finalInfo || finalInfo === "[]") return [];
    return JSON.parse(finalInfo);
  } catch (err) {
    console.error("FinalInfo parse error:", err);
    return [];
  }
}
