// src/helpers/charts.js
import fetch from "node-fetch";
import env from "../config/env.js";
import { CHARTS_PROMPT } from "../prompts/charts.js";
import { buildRequestBody, BASE_URL, MODEL_ID, extractTextFromUploads, extractImagesFromUploads } from "./gemini.js";

const GENERATE_CONTENT_API = "generateContent";
const QUICKCHART_API_URL = "https://quickchart.io/chart/create";

async function callQuickChartAPI(chartConfig) {
  try {
    const response = await fetch(QUICKCHART_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(chartConfig),
    });

    const data = await response.json();

    if (response.ok && data.success && data.url) {
      return {
        success: true,
        url: data.url,
        error: null,
      };
    }

    return {
      success: false,
      url: null,
      error: data.error || 'QuickChart API request failed',
    };
  } catch (error) {
    return {
      success: false,
      url: null,
      error: `QuickChart API error: ${error.message}`,
    };
  }
}

function tryParseJson(text) {
  if (!text || typeof text !== 'string') {
    return { ok: false, error: "Empty response from model" };
  }

  let t = text.trim();

  // 1) Strip Markdown fences ```json ... ``` or ``` ... ```
  const fenceRe = /```(?:json|javascript)?\s*([\s\S]*?)```/i;
  const fenced = t.match(fenceRe);
  if (fenced && fenced[1]) {
    t = fenced[1].trim();
  }

  // 2) Quick parse attempt
  try {
    const parsed = JSON.parse(t);
    if (validateChartConfig(parsed)) {
      return { ok: true, value: parsed };
    }
  } catch (_) {}

  // 3) Extract first JSON object from text using first '{' and last '}'
  const first = t.indexOf('{');
  const last = t.lastIndexOf('}');
  if (first !== -1 && last !== -1 && last > first) {
    const candidate = t.slice(first, last + 1);
    try {
      const parsed = JSON.parse(candidate);
      if (validateChartConfig(parsed)) {
        return { ok: true, value: parsed };
      }
    } catch (_) {}
  }

  // 4) Fix common JSON issues
  let fixed = t
    .replace(/,\s*([}\]])/g, '$1')  // Remove trailing commas
    .replace(/"data":\s*,/g, '"data": []')  // Fix empty data arrays
    .replace(/:\s*,/g, ': null,')  // Fix missing values
    .replace(/,\s*}/g, '}')  // Remove trailing commas before }
    .replace(/,\s*]/g, ']');  // Remove trailing commas before ]

  try {
    const parsed = JSON.parse(fixed);
    if (validateChartConfig(parsed)) {
      return { ok: true, value: parsed };
    }
  } catch (_) {}

  return { ok: false, error: "Invalid JSON from model" };
}

function validateChartConfig(config) {
  // Validate the chart config has required structure
  if (!config || typeof config !== 'object') return false;
  if (!config.chart || typeof config.chart !== 'object') return false;
  if (!config.chart.data || typeof config.chart.data !== 'object') return false;
  if (!Array.isArray(config.chart.data.datasets)) return false;
  
  // Validate all datasets have data arrays with values
  for (const dataset of config.chart.data.datasets) {
    if (!Array.isArray(dataset.data) || dataset.data.length === 0) {
      return false;
    }
    // Check for invalid values
    for (const val of dataset.data) {
      if (typeof val !== 'number' || isNaN(val)) {
        return false;
      }
    }
  }
  
  return true;
}

export async function generateCharts(prompt, userId = 'default', options = {}) {
  const start = Date.now();
  const uploads = Array.isArray(options.uploads) ? options.uploads : [];
  const includeSearch = typeof options.includeSearch === 'boolean' ? options.includeSearch : (uploads.length === 0);

  // Compose user message with uploads (same behavior as chat helper)
  let composedText = String(prompt || '');
  const uploadedText = await extractTextFromUploads(uploads);
  const uploadedImages = await extractImagesFromUploads(uploads);
  if (uploadedText) composedText += `\n\n--- Uploaded Files Text ---\n${uploadedText}`;

  const parts = [{ text: composedText }];
  for (const img of uploadedImages) {
    parts.push({ inlineData: { mimeType: img.mimeType, data: img.data } });
  }

  const messages = [{ role: 'user', parts }];
  const body = buildRequestBody(messages, CHARTS_PROMPT, includeSearch);

  const url = `${BASE_URL}/${MODEL_ID}:${GENERATE_CONTENT_API}?key=${env.GEMINI_API_KEY}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = data?.error?.message || `${res.status} ${res.statusText}`;
    return {
      ok: false,
      error: message,
      status: res.status,
      processingTime: Date.now() - start
    };
  }

  // Collect all text parts from the first candidate
  const cand = data?.candidates?.[0];
  const text = Array.isArray(cand?.content?.parts)
    ? cand.content.parts.map(p => (typeof p?.text === 'string' ? p.text : '')).join('')
    : '';

  const parsed = tryParseJson(text.trim());

  if (parsed.ok) {
    // Call QuickChart API with the generated JSON
    const quickChartResult = await callQuickChartAPI(parsed.value);
    
    return {
      ok: true,
      chartConfig: parsed.value,
      chartUrl: quickChartResult.url,
      quickChartSuccess: quickChartResult.success,
      raw: text,
      error: quickChartResult.error || null,
      processingTime: Date.now() - start
    };
  }

  // Fallback: build a minimal bar chart using the prompt as title
  const title = (String(prompt || '').trim() || 'Generated Chart').slice(0, 80);
  const fallback = {
    backgroundColor: '#fff',
    width: 500,
    height: 300,
    devicePixelRatio: 1.0,
    chart: {
      type: 'bar',
      data: {
        labels: ['Item 1', 'Item 2', 'Item 3', 'Item 4', 'Item 5'],
        datasets: [
          {
            label: 'Values',
            data: [1, 1, 1, 1, 1],
            backgroundColor: 'rgba(75,192,192,0.6)',
            borderColor: 'rgba(75,192,192,1)',
            borderWidth: 1,
          },
        ],
      },
      options: {
        responsive: true,
        plugins: {
          legend: { position: 'top' },
          title: { display: true, text: title },
        },
        scales: {
          y: { beginAtZero: true, ticks: { display: false }, grid: { display: false } },
          x: { grid: { display: false } },
        },
      },
    },
  };

  // Try to call QuickChart API even with fallback
  const quickChartResult = await callQuickChartAPI(fallback);

  return {
    ok: true,
    chartConfig: fallback,
    chartUrl: quickChartResult.url,
    quickChartSuccess: quickChartResult.success,
    raw: text,
    error: quickChartResult.error || null,
    processingTime: Date.now() - start,
    warning: 'FALLBACK_CHART',
  };
}
