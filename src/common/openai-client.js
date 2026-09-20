/**
 * OpenAI API client with streaming support
 */

import { applyReasoningEffort } from './reasoning.js';

const ANTHROPIC_HOST = 'api.anthropic.com';
const ANTHROPIC_VERSION = '2023-06-01';

function getHostname(endpoint) {
  try {
    return new URL(endpoint).hostname;
  } catch {
    return '';
  }
}

/**
 * Build request headers for an OpenAI-compatible provider.
 * Anthropic requires a version header and accepts x-api-key;
 * browser-direct calls also need the CORS opt-in header.
 * @param {Object} provider
 * @param {string} provider.endpoint
 * @param {string} provider.apiKey
 * @param {{ json?: boolean }} [options]
 * @returns {Record<string, string>}
 */
export function getProviderHeaders(provider, { json = false } = {}) {
  const headers = {
    Authorization: `Bearer ${provider.apiKey}`
  };
  if (json) {
    headers['Content-Type'] = 'application/json';
  }
  if (getHostname(provider.endpoint) === ANTHROPIC_HOST) {
    headers['anthropic-version'] = ANTHROPIC_VERSION;
    headers['x-api-key'] = provider.apiKey;
    headers['anthropic-dangerous-direct-browser-access'] = 'true';
  }
  return headers;
}

/**
 * Derive the models list URL from a chat completions endpoint.
 * Anthropic paginates /v1/models (default 20); request the max page.
 * @param {string} endpoint
 * @returns {string}
 */
export function getModelsEndpoint(endpoint) {
  const modelsEndpoint = endpoint.replace('/chat/completions', '/models');
  if (getHostname(endpoint) !== ANTHROPIC_HOST) {
    return modelsEndpoint;
  }
  try {
    const url = new URL(modelsEndpoint);
    url.searchParams.set('limit', '1000');
    return url.toString();
  } catch {
    return modelsEndpoint;
  }
}

/**
 * Send a chat completion request with streaming
 * @param {Object} options
 * @param {string} options.endpoint - API endpoint URL
 * @param {string} options.apiKey - API key
 * @param {string} options.model - Model name
 * @param {Array} options.messages - Chat messages
 * @param {function} options.onChunk - Callback for each streamed chunk
 * @param {string} [options.reasoningEffort] - Reasoning effort when supported
 * @param {AbortSignal} [options.signal] - Optional abort signal
 * @returns {Promise<string>} - Complete response text
 */
export async function streamChatCompletion({
  endpoint,
  apiKey,
  model,
  messages,
  onChunk,
  reasoningEffort,
  signal
}) {
  const body = {
    model,
    messages,
    stream: true
  };
  applyReasoningEffort(body, endpoint, reasoningEffort);

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: getProviderHeaders({ endpoint, apiKey }, { json: true }),
    body: JSON.stringify(body),
    signal
  });

  if (!response.ok) {
    const errorText = await response.text();
    let errorMessage;
    try {
      const errorJson = JSON.parse(errorText);
      errorMessage = errorJson.error?.message || errorText;
    } catch {
      errorMessage = errorText;
    }
    throw new Error(`API Error (${response.status}): ${errorMessage}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let fullContent = '';
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith('data: ')) continue;

      const data = trimmed.slice(6);
      if (data === '[DONE]') continue;

      try {
        const parsed = JSON.parse(data);
        const content = parsed.choices?.[0]?.delta?.content;
        if (content) {
          fullContent += content;
          onChunk(content);
        }
      } catch (e) {
        // Skip invalid JSON
        console.warn('Failed to parse SSE data:', e);
      }
    }
  }

  return fullContent;
}

/**
 * Send a non-streaming chat completion request
 * @param {Object} options
 * @param {string} options.endpoint - API endpoint URL
 * @param {string} options.apiKey - API key
 * @param {string} options.model - Model name
 * @param {Array} options.messages - Chat messages
 * @param {string} [options.reasoningEffort] - Reasoning effort when supported
 * @param {AbortSignal} [options.signal] - Optional abort signal
 * @returns {Promise<string>} - Response content
 */
export async function chatCompletion({
  endpoint,
  apiKey,
  model,
  messages,
  reasoningEffort,
  signal
}) {
  const body = {
    model,
    messages,
    stream: false
  };
  applyReasoningEffort(body, endpoint, reasoningEffort);

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: getProviderHeaders({ endpoint, apiKey }, { json: true }),
    body: JSON.stringify(body),
    signal
  });

  if (!response.ok) {
    const errorText = await response.text();
    let errorMessage;
    try {
      const errorJson = JSON.parse(errorText);
      errorMessage = errorJson.error?.message || errorText;
    } catch {
      errorMessage = errorText;
    }
    throw new Error(`API Error (${response.status}): ${errorMessage}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || '';
}
