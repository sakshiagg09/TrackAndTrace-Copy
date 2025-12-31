router.post("/api/delay", async (req, res) => {
  try {
    const {
      FoId,
      StopId,
      ETA,
      Event,
      EventCode,
      EvtReasonCode,
      Description
    } = req.body;

    if (!FoId || !StopId) {
      return res.status(400).json({ error: "FoId & StopId required" });
    }

    // ✅ FINAL, SAFE ETA PARSING
    let etaDate = null;

    if (ETA && typeof ETA === "string" && ETA.length === 14) {
      const yyyy = Number(ETA.substring(0, 4));
      const MM   = Number(ETA.substring(4, 6)) - 1; // JS month = 0-based
      const dd   = Number(ETA.substring(6, 8));
      const HH   = Number(ETA.substring(8, 10));
      const mm   = Number(ETA.substring(10, 12));
      const ss   = Number(ETA.substring(12, 14));

      etaDate = new Date(yyyy, MM, dd, HH, mm, ss);

      // 🚨 Validate date
      if (isNaN(etaDate.getTime())) {
        return res.status(400).json({ error: "Invalid ETA format" });
      }
    }

    const pool = await getPool();

    await pool.request()
      .input("FoId", sql.NVarChar, FoId)
      .input("StopId", sql.NVarChar, StopId)
      .input("ETA", sql.DateTime2, etaDate)   // ✅ THIS FIXES EVERYTHING
      .input("Event", sql.NVarChar, Event ?? "")
      .input("EventCode", sql.NVarChar, EventCode ?? "")
      .input("EvtReasonCode", sql.NVarChar, EvtReasonCode ?? "")
      .input("Description", sql.NVarChar, Description ?? "")
      .query(`
        INSERT INTO dbo.Events
        (
          FoId,
          StopId,
          ETA,
          Event,
          EventCode,
          EvtReasonCode,
          Description
        )
        VALUES
        (
          @FoId,
          @StopId,
          @ETA,
          @Event,
          @EventCode,
          @EvtReasonCode,
          @Description
        )
      `);

    return res.status(201).json({
      status: "SUCCESS",
      FoId,
      StopId,
      ETA: etaDate
    });

  } catch (err) {
    console.error("❌ Delay insert failed", err);
    return res.status(500).json({ error: err.message });
  }
});
