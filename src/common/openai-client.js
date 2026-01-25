/**
 * OpenAI API client with streaming support
 */

/**
 * Send a chat completion request with streaming
 * @param {Object} options
 * @param {string} options.endpoint - API endpoint URL
 * @param {string} options.apiKey - API key
 * @param {string} options.model - Model name
 * @param {Array} options.messages - Chat messages
 * @param {function} options.onChunk - Callback for each streamed chunk
 * @param {AbortSignal} [options.signal] - Optional abort signal
 * @returns {Promise<string>} - Complete response text
 */
export async function streamChatCompletion({
  endpoint,
  apiKey,
  model,
  messages,
  onChunk,
  signal
}) {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      messages,
      stream: true
    }),
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
 * @param {AbortSignal} [options.signal] - Optional abort signal
 * @returns {Promise<string>} - Response content
 */
export async function chatCompletion({
  endpoint,
  apiKey,
  model,
  messages,
  signal
}) {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      messages,
      stream: false
    }),
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
