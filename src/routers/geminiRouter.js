// routes/geminiRouter.js
import express from "express";
import { handleGenerate } from "../controllers/geminiController.js";
import { uploadArray } from "../middleware/upload.js";

const router = express.Router();

// Accepts both application/json (no files) and multipart/form-data with a single field 'files'
router.post("/generate", uploadArray, handleGenerate);

export default router;
