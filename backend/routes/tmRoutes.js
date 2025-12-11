const express = require("express");
const router = express.Router();

const getFO = require("../controllers/tmGetFO");
const postEvent = require("../controllers/tmPostEvent");

// GET FO details
router.get("/fo/:fo_id", getFO);

// POST event to TM (arrival, departure, etc.)
router.post("/event", postEvent);

module.exports = router;