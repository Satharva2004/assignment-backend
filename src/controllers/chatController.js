// src/controllers/chatController.js
import { createClient } from '@supabase/supabase-js';
import { generateContentWithHistory } from '../helpers/geminiWithHistory.js';
import env from '../config/env.js';

const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);

export async function handleChatGenerate(req, res) {
  try {
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
          user_id: userId, // This will be null for anonymous users
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

    // Get conversation history
    const { data: messages, error: historyError } = await supabase
      .from('messages')
      .select('role, content')
      .eq('conversation_id', currentConversationId)
      .order('created_at', { ascending: true });

    if (historyError) {
      console.error('Error fetching history:', historyError);
      return res.status(500).json({ error: 'Failed to fetch conversation history' });
    }

    // Save user message
    const { error: userMessageError } = await supabase
      .from('messages')
      .insert({
        conversation_id: currentConversationId,
        role: 'user',
        content: prompt
      });

    if (userMessageError) {
      console.error('Error saving user message:', userMessageError);
      return res.status(500).json({ error: 'Failed to save message' });
    }

    // Generate response with history
    const result = await generateContentWithHistory(prompt, messages || []);

    // Save model response
    const { error: modelMessageError } = await supabase
      .from('messages')
      .insert({
        conversation_id: currentConversationId,
        role: 'model',
        content: result.content,
        sources: result.sources
      });

    if (modelMessageError) {
      console.error('Error saving model message:', modelMessageError);
      return res.status(500).json({ error: 'Failed to save response' });
    }

    // Update conversation timestamp
    await supabase
      .from('conversations')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', currentConversationId);

    res.json({
      ...result,
      conversationId: currentConversationId
    });

  } catch (error) {
    console.error('Error in handleChatGenerate:', error);
    res.status(500).json({ 
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}

export async function getConversations(req, res) {
  try {
    const { userId } = req.params;
    
    const { data: conversations, error } = await supabase
      .from('conversations')
      .select(`
        id,
        title,
        created_at,
        updated_at,
        messages!inner(content)
      `)
      .eq('user_id', userId)
      .order('updated_at', { ascending: false });

    if (error) {
      console.error('Error fetching conversations:', error);
      return res.status(500).json({ error: 'Failed to fetch conversations' });
    }

    res.json(conversations);
  } catch (error) {
    console.error('Error in getConversations:', error);
    res.status(500).json({ error: error.message });
  }
}

export async function getConversationHistory(req, res) {
  try {
    const { conversationId } = req.params;
    
    const { data: messages, error } = await supabase
      .from('messages')
      .select('role, content, sources, created_at')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Error fetching conversation history:', error);
      return res.status(500).json({ error: 'Failed to fetch conversation history' });
    }

    res.json(messages);
  } catch (error) {
    console.error('Error in getConversationHistory:', error);
    res.status(500).json({ error: error.message });
  }
}