// routers/uploadRouter.js
import express from "express";
import { uploadMixed } from "../middleware/upload.js";
import { handleUpload } from "../controllers/uploadController.js";

const router = express.Router();

// Accepts multipart/form-data with fields: files[] and images[]
router.post("/upload", uploadMixed, handleUpload);

export default router;
