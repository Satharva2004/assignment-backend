// src/controllers/chatController.js
import fetch from 'node-fetch';
import { createClient } from '@supabase/supabase-js';
import { generateContent, buildRequestBody, MODEL_ID, BASE_URL, extractTextFromUploads, extractImagesFromUploads } from '../helpers/gemini.js';
import env from '../config/env.js';

const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);

// Generate chat response and store in conversation
export async function handleChatGenerate(req, res) {
  try {
    const start = Date.now();
    // For multipart/form-data, fields come as strings; parse options safely
    const { prompt, conversationId } = req.body || {};
    let { options } = req.body || {};
    if (options && typeof options === 'string') {
      try { options = JSON.parse(options); } catch { options = {}; }
    }
    options = options || {};
    
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
    
    // Determine includeSearch similar to geminiController: default false if files provided
    const uploads = Array.isArray(req.files) ? req.files : [];
    const effectiveIncludeSearch = typeof options.includeSearch === 'boolean'
      ? options.includeSearch
      : (uploads.length === 0);

    // Generate AI response
    const response = await generateContent(prompt, userId, {
      history: chatHistory.slice(-10), // Only keep last 10 messages for context
      includeSearch: effectiveIncludeSearch,
      uploads,
      // Reset history when new files arrive unless explicitly kept
      resetHistory: uploads.length > 0 && options.keepHistoryWithFiles !== true
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

// Stream chat response with database persistence
export async function handleChatStreamGenerate(req, res) {
  try {
    const { prompt: rawPrompt, conversationId } = req.body || {};
    // Parse options (may be JSON string for multipart)
    let { options: rawOptions } = req.body || {};
    if (rawOptions && typeof rawOptions === 'string') {
      try { rawOptions = JSON.parse(rawOptions); } catch { rawOptions = {}; }
    }
    const options = typeof rawOptions === 'object' && rawOptions !== null ? rawOptions : {};
    const prompt = String(rawPrompt || '').trim();
    
    if (!prompt) {
      return res.status(400).json({ error: "Prompt is required" });
    }

    const userId = req.userId;
    let currentConversationId = conversationId;
    let streamedContent = '';
    const streamedSources = new Set();

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

    // Get conversation history for context
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

    // Build chat history for Gemini (prior messages)
    const chatHistory = messages ? [...messages].reverse().map(m => ({
      role: m.role,
      parts: [{ text: m.content }]
    })) : [];

    // If uploads provided via multipart/form-data, include their extracted text and images
    let composedText = String(prompt);
    let imageParts = [];
    try {
      const files = Array.isArray(req.files) ? req.files : [];
      if (files.length) {
        const uploadedText = await extractTextFromUploads(files);
        const uploadedImages = await extractImagesFromUploads(files);
        if (uploadedText) {
          composedText += `\n\n--- Uploaded Files Text ---\n${uploadedText}`;
        }
        if (uploadedImages.length) {
          imageParts = uploadedImages.map(img => ({ inlineData: { mimeType: img.mimeType, data: img.data } }));
        }
      }
    } catch (_) {
      // ignore upload extraction errors to keep streaming resilient
    }

    // Add current user message (text + any image inlineData)
    const userParts = [{ text: composedText }, ...imageParts];
    chatHistory.push({
      role: 'user',
      parts: userParts
    });

    // Default includeSearch to false when files exist unless explicitly overridden
    const files = Array.isArray(req.files) ? req.files : [];
    const includeSearch = typeof options.includeSearch === 'boolean' ? options.includeSearch : (files.length === 0);
    const systemPrompt = options.systemPrompt || undefined;

    const body = buildRequestBody(chatHistory.slice(-10), systemPrompt, includeSearch);
    const url = `${BASE_URL}/${MODEL_ID}:streamGenerateContent?alt=sse&key=${env.GEMINI_API_KEY}`;

    // Prepare SSE response
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders?.();

    // Send conversation ID immediately
    res.write(`event: conversationId\n`);
    res.write(`data: ${JSON.stringify({ conversationId: currentConversationId })}\n\n`);

    const upstream = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "text/event-stream"
      },
      body: JSON.stringify(body)
    });

    if (!upstream.ok || !upstream.body) {
      const txt = await upstream.text().catch(() => "");
      res.write(`event: error\n`);
      res.write(`data: ${JSON.stringify({ status: upstream.status, error: txt || upstream.statusText })}\n\n`);
      return res.end();
    }

    // Track content for database persistence and emit simplified SSE {text: "..."}
    upstream.body.on("data", (chunk) => {
      const chunkStr = chunk.toString();
      console.log('Received chunk from Gemini:', chunkStr);
      const blocks = chunkStr.split('\n\n');
      for (const block of blocks) {
        const dataLine = block.split('\n').find(l => l.startsWith('data: '));
        if (!dataLine) continue;
        const payload = dataLine.slice(6);
        if (!payload || payload === '[DONE]') continue;
        try {
          const obj = JSON.parse(payload);
          const cand = obj?.candidates?.[0];
          const parts = cand?.content?.parts;
          if (Array.isArray(parts)) {
            for (const p of parts) {
              if (typeof p?.text === 'string' && p.text.length) {
                streamedContent += p.text;
                res.write(`event: message\n`);
                res.write(`data: ${JSON.stringify({ text: p.text })}\n\n`);
              }
            }
          }
          // Collect sources from grounding metadata if present
          const groundingChunks = cand?.groundingMetadata?.groundingChunks;
          if (Array.isArray(groundingChunks)) {
            for (const gc of groundingChunks) {
              const uri = gc?.web?.uri;
              if (typeof uri === 'string' && uri.startsWith('http')) {
                streamedSources.add(uri);
              }
            }
            if (groundingChunks.length) {
              console.log('[chatStream] collected grounding URLs from chunk:', groundingChunks.map(g => g?.web?.uri).filter(Boolean));
            }
          }
          if (cand?.finishReason) {
            res.write(`event: finish\n`);
            res.write(`data: ${JSON.stringify({ finishReason: cand.finishReason })}\n\n`);
          }
        } catch (_) {
          // ignore non-JSON frames
        }
      }
    });

    upstream.body.on("end", async () => {
      console.log('Gemini stream ended');
      try {
        if (streamedSources.size > 0) {
          console.log(`[chatStream] emitting sources from streamed grounding: count=${streamedSources.size}`);
          // Resolve titles for sources concurrently (limit simple)
          const urls = Array.from(streamedSources);
          const titlePromises = urls.map(async (u) => ({ url: u, title: await fetchPageTitle(u) }));
          let sourcesWithTitles = [];
          try {
            sourcesWithTitles = await Promise.all(titlePromises);
          } catch (_) {
            sourcesWithTitles = urls.map(u => ({ url: u }));
          }

          // Emit structured sources event
          console.log('[chatStream] sourcesWithTitles:', sourcesWithTitles);
          res.write(`event: sources\n`);
          res.write(`data: ${JSON.stringify({ sources: sourcesWithTitles })}\n\n`);
        } else {
          console.log('[chatStream] no streamed grounding sources found; attempting fallback generateContent for sources');
          // Fallback: perform a quick non-stream call to obtain sources
          try {
            const gen = await generateContent(prompt, userId, {
              history: chatHistory.slice(-10),
              includeSearch,
              uploads: files,
            });
            const sourcesWithTitles = Array.isArray(gen?.sources) ? gen.sources : [];
            if (sourcesWithTitles.length > 0) {
              console.log(`[chatStream] fallback produced sources: count=${sourcesWithTitles.length}`);
              if (!res.writableEnded) {
                res.write(`event: sources\n`);
                res.write(`data: ${JSON.stringify({ sources: sourcesWithTitles })}\n\n`);
              }
            } else {
              console.log('[chatStream] fallback produced no sources');
              if (!res.writableEnded) {
                console.log('[chatStream] emitting empty sources event');
                res.write(`event: sources\n`);
                res.write(`data: {"sources": []}\n\n`);
              }
            }
          } catch (e) {
            console.warn('Fallback source fetch failed:', e?.message || e);
            if (!res.writableEnded) {
              console.log('[chatStream] emitting empty sources event due to fallback error');
              res.write(`event: sources\n`);
              res.write(`data: {"sources": []}\n\n`);
            }
          }
        }
      } catch (e) {
        console.warn('Failed to emit sources/title message:', e?.message || e);
      }
      
      // Save messages to database after streaming completes
      try {
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
              content: streamedContent,
              sources: [] // Could extract sources from stream if needed
            }
          ]);
          
        if (saveError) {
          console.error('Error saving streamed messages:', saveError);
        }

        // Update conversation timestamp
        await supabase
          .from('conversations')
          .update({ updated_at: new Date().toISOString() })
          .eq('id', currentConversationId);

      } catch (dbError) {
        console.error('Database error after streaming:', dbError);
      }
      
      res.end();
    });

    upstream.body.on("error", (err) => {
      console.error('Gemini stream error:', err);
      try {
        res.write(`event: error\n`);
        res.write(`data: ${JSON.stringify({ message: err?.message || "stream error" })}\n\n`);
      } finally {
        res.end();
      }
    });

  } catch (error) {
    console.error('Error in handleChatStreamGenerate:', error);
    // Ensure we don't hang the stream on unexpected errors
    try {
      if (!res.headersSent) {
        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Cache-Control", "no-cache, no-transform");
        res.setHeader("Connection", "keep-alive");
        res.flushHeaders?.();
      }
      if (!res.writableEnded) {
        res.write(`event: error\n`);
        res.write(`data: ${JSON.stringify({ message: error?.message || 'stream error' })}\n\n`);
      }
    } catch (_) {
      // swallow
    } finally {
      if (!res.writableEnded) {
        try { res.end(); } catch {}
      }
    }
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