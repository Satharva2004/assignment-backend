// routes/geminiRouter.js
import express from "express";
import { handleGenerate } from "../controllers/geminiController.js";

const router = express.Router();

router.post("/generate", handleGenerate);

export default router;
