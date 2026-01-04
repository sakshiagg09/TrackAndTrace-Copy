import express from "express";
import sql from "mssql";

const router = express.Router();

/**
 * GET /api/ui-fields-config
 * Maps dbo.UIFieldConfig → frontend SimpleFieldDef
 */
router.get("/", async (_req, res) => {
  try {
    const result = await sql.query(`
      SELECT
        Title,
        TechnicalName,
        Visible
      FROM dbo.UIFieldConfig
    `);

    // 🔁 Transform DB → frontend contract
    const mapped = result.recordset.map((r, idx) => ({
      title: r.Title,
      technicalName: r.TechnicalName,
      visibleInAdapt: r.Visible === true,
      order: idx + 1 // optional, stable ordering
    }));

    res.json(mapped); // ✅ MUST return JSON array
  } catch (err) {
    console.error("UI Fields Config Error:", err);
    res.status(500).json({ error: "Failed to load UI field config" });
  }
});

export default router;
