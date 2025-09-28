import express from 'express';
import { uploadArray } from "../middleware/upload.js";
import { authenticate, requireAuth } from "../middleware/auth.js";
import { handleChatGenerate, handleChatStreamGenerate, getConversations, getConversationHistory, deleteConversation } from "../controllers/chatController.js";


const router = express.Router();

// Create new chat or continue existing conversation (non-stream)
router.post('/chat', authenticate, requireAuth, uploadArray, handleChatGenerate);

// Stream chat responses
router.post('/chat/stream', authenticate, requireAuth, uploadArray, handleChatStreamGenerate);

// Get all conversations for the authenticated user
router.get('/conversations', authenticate, requireAuth, getConversations);

// Get a specific conversation with its messages
router.get('/conversations/:conversationId', authenticate, requireAuth, getConversationHistory);

// Delete a conversation
router.delete('/conversations/:conversationId', authenticate, requireAuth, deleteConversation);

export default router;
