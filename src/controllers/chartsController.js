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
      return res.status(500).json({
        ok: false,
        error: result.error || 'Failed to generate chart',
        processingTime: result.processingTime || null,
      });
    }

    return res.json({
      chartUrl: result.chartUrl,
      quickChartSuccess: result.quickChartSuccess,
    });
  } catch (error) {
    console.error('Error in handleChartsGenerate:', error);
    res.status(500).json({ error: error.message });
  }
}


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
        expert: options.expert,
        systemPrompt: options.systemPrompt
      }),
      generateCharts(prompt, userId, { includeSearch, uploads })
    ]);

    const charts = chartsRes.status === 'fulfilled' ? chartsRes.value : { ok: false, error: chartsRes.reason?.message || 'Charts generation failed' };

    return res.json({
      charts: {
        chart: charts?.chart || null,
        error: charts?.ok === true ? null : (charts?.error || 'Failed to generate charts')
      }
    });
  } catch (error) {
    console.error('Error in handleChatWithChartsParallel:', error);
    res.status(500).json({ error: error.message });
  }
}