import express from "express";
import { receivePOD } from "../controller/podController.js";

const router = express.Router();

router.post("/pod", receivePOD);

export default router;
