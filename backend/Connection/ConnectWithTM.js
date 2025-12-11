require("dotenv").config();
const axios = require("axios");

module.exports = async (req, res) => {
  try {
    console.log("🔥 Incoming /api/postEvent request");
    console.log("📩 Request body:", req.body);

    const { fo_id } = req.body;

    if (!fo_id) {
      console.error("❌ Missing fo_id in request");
      return res.status(400).json({ success: false, error: "fo_id is required" });
    }

    // Check Basic token
    console.log("🔐 SAP BASIC Token:", process.env.SAP_BASIC ? "Loaded ✓" : "❌ MISSING");

    // Build SAP OData URL
    const tmURL = `http://103.152.79.22:8002/sap/opu/odata/SAP/ZSKY_SRV/SearchFOSet(FoId='${fo_id}')`;

    console.log("🌍 Final SAP URL:", tmURL);

    // Call SAP
    console.log("🚀 Calling SAP TM with Basic Authorization...");

    const result = await axios.get(tmURL, {
      headers: {
        "Authorization": `Basic ${process.env.SAP_BASIC}`,
        "Accept": "application/json"
      },
      validateStatus: () => true, // allow 4xx responses to return
    });

    console.log("📥 SAP Response Status:", result.status);
    console.log("📥 SAP Response Headers:", result.headers);
    console.log("📥 SAP Response Body:", result.data);

    if (result.status >= 400) {
      console.error("❌ SAP returned an error");
      return res.status(result.status).json({
        success: false,
        error: result.data,
      });
    }

    // Success
    console.log("✅ SAP TM Call Successful!");
    return res.json({
      success: true,
      tm_response: result.data,
    });

  } catch (error) {
    console.error("🔥 Exception while calling SAP TM");
    console.error("📛 Error Message:", error.message);
    console.error("📛 Error Stack:", error.stack);

    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};
