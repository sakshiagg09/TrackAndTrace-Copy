import express from "express";
import { receiveDelay } from "../controller/delayController.js";

const router = express.Router();

router.post("/delay", receiveDelay);

export default router;
