const express = require("express");
const router = express.Router();
const { receiveEvent } = require("../controller/eventsController");

// SKY → SKY+ ingestion API
router.post("/events", receiveEvent);

module.exports = router;
