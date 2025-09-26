import express from 'express';
import { handleChatGenerate, getConversations, getConversation } from '../controllers/chatController.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

// Create new chat or continue existing conversation
router.post('/chat', authenticate, handleChatGenerate);

// Get all conversations for the authenticated user
router.get('/conversations', authenticate, getConversations);

// Get a specific conversation with its messages
router.get('/conversations/:conversationId', authenticate, getConversation);

export default router;
