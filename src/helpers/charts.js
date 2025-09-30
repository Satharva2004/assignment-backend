// src/helpers/charts.js
import fetch from "node-fetch";
import env from "../config/env.js";
import { CHARTS_PROMPT } from "../prompts/charts.js";
import { buildRequestBody, BASE_URL, MODEL_ID, extractTextFromUploads, extractImagesFromUploads } from "./gemini.js";

const GENERATE_CONTENT_API = "generateContent";

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
    return { ok: true, value: JSON.parse(t) };
  } catch (_) {}

  // 3) Extract first JSON object from text using first '{' and last '}'
  const first = t.indexOf('{');
  const last = t.lastIndexOf('}');
  if (first !== -1 && last !== -1 && last > first) {
    const candidate = t.slice(first, last + 1);
    try {
      return { ok: true, value: JSON.parse(candidate) };
    } catch (_) {}
  }

  // 4) Last attempt: remove trailing commas (common issue) and try again
  const noTrailingCommas = t
    .replace(/,\s*([}\]])/g, '$1');
  try {
    return { ok: true, value: JSON.parse(noTrailingCommas) };
  } catch (_) {}

  return { ok: false, error: "Invalid JSON from model" };
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

  return {
    ok: parsed.ok,
    chart: parsed.ok ? parsed.value : null,
    raw: text,
    error: parsed.ok ? null : parsed.error,
    processingTime: Date.now() - start
  };
}
