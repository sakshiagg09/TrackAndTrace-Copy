import express from "express";
import { runTMSync } from "../controllers/tmSync.controller.js";

const router = express.Router();

router.get("/sync/tm", runTMSync);

export default router;
