// src/controllers/chartsController.js
import { generateCharts } from "../helpers/charts.js";
import { generateContent, extractTextFromUploads, extractImagesFromUploads } from "../helpers/gemini.js";

// Return only the charts JSON (non-stream)
export async function handleChartsGenerate(req, res) {
  try {
    const { prompt } = req.body || {};
    let { options } = req.body || {};
    if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
      return res.status(400).json({ error: "Prompt is required" });
    }
    if (options && typeof options === 'string') {
      try { options = JSON.parse(options); } catch { options = {}; }
    }
    options = options || {};

    const uploads = Array.isArray(req.files) ? req.files : [];
    const includeSearch = typeof options.includeSearch === 'boolean' ? options.includeSearch : (uploads.length === 0);

    const result = await generateCharts(prompt, req.userId, { uploads, includeSearch });

    if (!result.ok) {
      return res.status(502).json({ error: result.error || 'Failed to generate charts', raw: result.raw });
    }

    return res.json({
      ok: true,
      chart: result.chart,
      raw: result.raw,
      processingTime: result.processingTime
    });
  } catch (error) {
    console.error('Error in handleChartsGenerate:', error);
    res.status(500).json({ error: error.message });
  }
}

// Run chat (non-stream) and charts generation in parallel and return both together
export async function handleChatWithChartsParallel(req, res) {
  try {
    const { prompt, conversationId } = req.body || {};
    let { options } = req.body || {};
    if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
      return res.status(400).json({ error: "Prompt is required" });
    }
    if (options && typeof options === 'string') {
      try { options = JSON.parse(options); } catch { options = {}; }
    }
    options = options || {};

    const uploads = Array.isArray(req.files) ? req.files : [];
    const includeSearch = typeof options.includeSearch === 'boolean' ? options.includeSearch : (uploads.length === 0);
    const userId = req.userId;

    const [chatRes, chartsRes] = await Promise.allSettled([
      generateContent(prompt, userId, {
        includeSearch,
        uploads,
        resetHistory: uploads.length > 0 && options.keepHistoryWithFiles !== true,
        expert: options.expert || 'research',
        systemPrompt: options.systemPrompt
      }),
      generateCharts(prompt, userId, { includeSearch, uploads })
    ]);

    const chat = chatRes.status === 'fulfilled' ? chatRes.value : { error: chatRes.reason?.message || 'Chat generation failed' };
    const charts = chartsRes.status === 'fulfilled' ? chartsRes.value : { ok: false, error: chartsRes.reason?.message || 'Charts generation failed' };

    return res.json({
      chat: {
        content: chat?.content || chat?.text || '',
        sources: Array.isArray(chat?.sources) ? chat.sources : [],
        error: chat?.error || null,
        attempts: chat?.attempts || 1,
        processingTime: chat?.processingTime || null
      },
      charts: {
        ok: charts?.ok === true,
        chart: charts?.chart || null,
        raw: charts?.raw || null,
        error: charts?.ok === true ? null : (charts?.error || 'Failed to generate charts'),
        processingTime: charts?.processingTime || null
      }
    });
  } catch (error) {
    console.error('Error in handleChatWithChartsParallel:', error);
    res.status(500).json({ error: error.message });
  }
}
