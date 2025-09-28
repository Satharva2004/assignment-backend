import fetch from "node-fetch";
import env from "../config/env.js";
import { generateContent, buildRequestBody, MODEL_ID, BASE_URL } from "../helpers/gemini.js";

export async function handleGenerate(req, res) {
  try {
    // For multipart/form-data, req.body contains text fields; files are in req.files (from Multer)
    const isMultipart = !!req.files;
    if (!isMultipart) {
      console.log('Received JSON request with body:', JSON.stringify(req.body, null, 2));
    } else {
      console.log('Received multipart request with fields:', req.body);
      const count = Array.isArray(req.files) ? req.files.length : 0;
      console.log('Received files count:', count);
      if (count > 0) {
        const meta = req.files.map(f => ({
          fieldname: f.fieldname,
          originalname: f.originalname,
          mimetype: f.mimetype,
          size: f.size
        }));
        console.log('Files meta:', JSON.stringify(meta, null, 2));
      }
    }
    
    if (!req.body) {
      return res.status(400).json({ error: "Request body is required" });
    }
    
    // Extract core params; when multipart, fields arrive as strings
    const { prompt } = req.body || {};
    let { options } = req.body || {};
    // If options is a JSON string (multipart), parse it safely
    if (options && typeof options === 'string') {
      try { options = JSON.parse(options); } catch { options = {}; }
    }
    options = options || {};
    if (!prompt) {
      return res.status(400).json({ error: "Prompt is required in the request body" });
    }

    // Derive a stable user/session id to isolate chat history across users and tabs
    const derivedSessionId =
      req.user?.id ||
      req.headers["x-session-id"] ||
      req.body?.sessionId ||
      req.ip ||
      "anonymous";

    const userId = String(derivedSessionId);

    const { expert, systemPrompt, includeSearch, keepHistoryWithFiles } = options;
    // Attach uploads from Multer (field name: 'files')
    const uploads = Array.isArray(req.files) ? req.files : [];
    // If client didn't specify includeSearch, default to false when files are provided
    const effectiveIncludeSearch =
      typeof includeSearch === 'boolean' ? includeSearch : (uploads.length === 0);
    
    console.log('Calling Gemini API with:', { 
      prompt, 
      userId,
      options: {
        expert,
        systemPrompt: systemPrompt ? '***provided***' : 'not provided',
        includeSearch: effectiveIncludeSearch, // default false if files exist
        uploadsCount: uploads.length,
        keepHistoryWithFiles: !!keepHistoryWithFiles
      }
    });
    
    const result = await generateContent(
      prompt,
      userId,
      {
        expert,
        systemPrompt,
        includeSearch: effectiveIncludeSearch,
        uploads,
        // By default, when new files are attached, do NOT use prior chat history
        // to avoid stale content from previous uploads. Opt-out via keepHistoryWithFiles=true
        resetHistory: uploads.length > 0 && keepHistoryWithFiles !== true
      }
    );
    console.log('Received response from Gemini API');
    
    res.json(result);
  } catch (error) {
    console.error('Error in handleGenerate:', error);
    res.status(500).json({ 
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}
//cry

// Stream tokens ASAP via SSE using Gemini's streamGenerateContent
export async function handleStreamGenerate(req, res) {
  try {
    const { prompt, options = {} } = req.body || {};
    if (!prompt) {
      return res.status(400).json({ error: "Prompt is required" });
    }

    const messages = [
      { role: "user", parts: [{ text: String(prompt) }] }
    ];

    const includeSearch = options.includeSearch !== false; // default true
    const systemPrompt = options.systemPrompt || undefined;

    const body = buildRequestBody(messages, systemPrompt, includeSearch);

    const url = `${BASE_URL}/${MODEL_ID}:streamGenerateContent?alt=sse&key=${env.GEMINI_API_KEY}`;

    // Prepare SSE response
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders?.();

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

    // Transform upstream SSE into simplified {text: "..."} events
    upstream.body.on("data", (chunk) => {
      const str = chunk.toString();
      console.log('Received chunk from Gemini:', str);
      const blocks = str.split('\n\n');
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
                res.write(`event: message\n`);
                res.write(`data: ${JSON.stringify({ text: p.text })}\n\n`);
              }
            }
          }
          if (cand?.finishReason) {
            res.write(`event: finish\n`);
            res.write(`data: ${JSON.stringify({ finishReason: cand.finishReason })}\n\n`);
          }
        } catch (e) {
          // If we can't parse, skip silently
        }
      }
    });
    upstream.body.on("end", () => {
      console.log('Gemini stream ended');
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
    // Ensure we don't hang the stream on unexpected errors
    try {
      res.setHeader("Content-Type", "text/event-stream");
      res.write(`event: error\n`);
      res.write(`data: ${JSON.stringify({ message: error.message })}\n\n`);
    } finally {
      res.end();
    }
  }
}