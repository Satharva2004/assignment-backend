// src/controllers/chatController.js
import { createClient } from '@supabase/supabase-js';
import { generateContent } from '../helpers/gemini.js';
import env from '../config/env.js';

const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);

// Generate chat response and store in conversation
export async function handleChatGenerate(req, res) {
  try {
    const start = Date.now();
    const { prompt, conversationId } = req.body;
    
    if (!prompt) {
      return res.status(400).json({ error: "Prompt is required" });
    }


 


    // userId is set by optionalAuth middleware
    const userId = req.userId;
    let currentConversationId = conversationId;
    
    // If no conversation ID provided, create a new conversation
    if (!currentConversationId) {
      const { data: conversation, error: convError } = await supabase
        .from('conversations')
        .insert({
          user_id: userId,
          title: prompt.substring(0, 50) + (prompt.length > 50 ? '...' : '')
        })
        .select()
        .single();
        
      if (convError) {
        console.error('Error creating conversation:', convError);
        return res.status(500).json({ error: 'Failed to create conversation' });
      }
      
      currentConversationId = conversation.id;
    }

    // Get last 10 messages for context
    const { data: messages, error: historyError } = await supabase
      .from('messages')
      .select('role, content')
      .eq('conversation_id', currentConversationId)
      .order('created_at', { ascending: false })
      .limit(10);

    if (historyError) {
      console.error('Error fetching history:', historyError);
      return res.status(500).json({ error: 'Failed to fetch conversation history' });
    }
    
    // Reverse to get chronological order
    const chatHistory = messages ? [...messages].reverse().map(m => ({
      role: m.role,
      parts: [{ text: m.content }]
    })) : [];
    
    // Add current user message to history
    chatHistory.push({
      role: 'user',
      parts: [{ text: prompt }]
    });
    
    // Generate AI response
    const response = await generateContent(prompt, userId, {
      history: chatHistory.slice(-10), // Only keep last 10 messages for context
      includeSearch: true,
      uploads: req.files || []
    });
    
    // Save both user message and AI response to database
    const aiContent = response?.content || response?.text || '';
    const aiSources = Array.isArray(response?.sources) ? response.sources : [];

    const { error: saveError } = await supabase
      .from('messages')
      .insert([
        {
          conversation_id: currentConversationId,
          role: 'user',
          content: prompt,
          sources: []
        },
        {
          conversation_id: currentConversationId,
          role: 'model',
          content: aiContent,
          sources: aiSources
        }
      ]);
      
    if (saveError) {
      console.error('Error saving messages:', saveError);
      // Don't fail the request, just log the error
    }

    // Optionally bump conversation updated_at
    await supabase
      .from('conversations')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', currentConversationId);

    const processingTime = Date.now() - start;
    const apiResponse = {
      content: aiContent,
      sources: aiSources,
      timestamp: new Date().toISOString(),
      processingTime,
      attempts: response?.attempts || 1,
      conversationId: currentConversationId
    };

    res.json(apiResponse);

  } catch (error) {
    console.error('Error in handleChatGenerate:', error);
    res.status(500).json({ 
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}

// Get all conversations for the authenticated user
export async function getConversations(req, res) {
  try {
    const userId = req.userId;
    
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const { data: conversations, error } = await supabase
      .from('conversations')
      .select('id, title, created_at, updated_at')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false });
      
    if (error) {
      console.error('Error fetching conversations:', error);
      return res.status(500).json({ error: 'Failed to fetch conversations' });
    }
    
    res.json(conversations);
  } catch (error) {
    console.error('Error in getConversations:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function getConversationHistory(req, res) {
  try {
    const { conversationId } = req.params;
    const userId = req.userId;

    if (!conversationId) {
      return res.status(400).json({ error: 'Conversation ID is required' });
    }

    // Fetch conversation and verify ownership (if user is authenticated)
    const { data: conversation, error: convError } = await supabase
      .from('conversations')
      .select('id, user_id, title, created_at, updated_at')
      .eq('id', conversationId)
      .single();

    if (convError || !conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    if (userId && conversation.user_id && conversation.user_id !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const { data: messages, error: messagesError } = await supabase
      .from('messages')
      .select('id, role, content, sources, created_at')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true });

    if (messagesError) {
      console.error('Error fetching conversation history:', messagesError);
      return res.status(500).json({ error: 'Failed to fetch conversation history' });
    }

    res.json({
      id: conversation.id,
      title: conversation.title,
      user_id: conversation.user_id,
      created_at: conversation.created_at,
      updated_at: conversation.updated_at,
      messages: messages || []
    });
  } catch (error) {
    console.error('Error in getConversationHistory:', error);
    const isNetwork = (error?.message || '').toLowerCase().includes('fetch failed');
    res.status(isNetwork ? 503 : 500).json({ 
      error: isNetwork ? 'Supabase network error while fetching conversation' : error.message,
      hint: isNetwork ? 'Verify SUPABASE_URL/SUPABASE_ANON_KEY and internet connectivity on the server' : undefined
    });
  }
}

// Delete a conversation and its messages (requires authentication)
export async function deleteConversation(req, res) {
  try {
    const { conversationId } = req.params;
    const userId = req.userId;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    if (!conversationId) {
      return res.status(400).json({ error: 'Conversation ID is required' });
    }

    // Verify ownership
    const { data: conversation, error: convError } = await supabase
      .from('conversations')
      .select('id, user_id')
      .eq('id', conversationId)
      .single();

    if (convError || !conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }
    if (conversation.user_id !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Delete messages first
    const { error: msgDelError } = await supabase
      .from('messages')
      .delete()
      .eq('conversation_id', conversationId);
    if (msgDelError) {
      console.error('Error deleting messages:', msgDelError);
      return res.status(500).json({ error: 'Failed to delete conversation messages' });
    }

    // Delete conversation
    const { error: convDelError } = await supabase
      .from('conversations')
      .delete()
      .eq('id', conversationId);
    if (convDelError) {
      console.error('Error deleting conversation:', convDelError);
      return res.status(500).json({ error: 'Failed to delete conversation' });
    }

    return res.json({ success: true });
  } catch (error) {
    console.error('Error in deleteConversation:', error);
    res.status(500).json({ error: error.message });
  }
}