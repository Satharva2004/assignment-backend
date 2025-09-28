// routes/geminiRouter.js
import express from "express";
import { handleGenerate } from "../controllers/geminiController.js";
import { uploadArray } from "../middleware/upload.js";
import { authenticate, requireAuth } from "../middleware/auth.js";
import { handleChatGenerate, handleChatStreamGenerate, getConversations, getConversationHistory, deleteConversation } from "../controllers/chatController.js";

const router = express.Router();

// Accepts both application/json (no files) and multipart/form-data with a single field 'files'
router.post("/generate", uploadArray, handleGenerate);

// Protected chat endpoints (accepts both application/json and multipart/form-data with field 'files')
router.post("/chat", authenticate, requireAuth, uploadArray, handleChatGenerate);
router.post("/chat/stream", authenticate, requireAuth, uploadArray, handleChatStreamGenerate);
router.get("/conversations", authenticate, requireAuth, getConversations);
router.get("/conversations/:conversationId", authenticate, requireAuth, getConversationHistory);
router.delete("/conversations/:conversationId", authenticate, requireAuth, deleteConversation);

export default router;
