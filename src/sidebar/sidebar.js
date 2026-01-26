/**
 * Sidebar script for Watson Page Assistant
 */

const browserAPI = typeof browser !== 'undefined' ? browser : chrome;

// Configure marked
if (typeof MarkedModule !== 'undefined') {
  MarkedModule.marked.setOptions({
    breaks: true,  // 支援換行
    gfm: true      // GitHub Flavored Markdown
  });
}

/**
 * Render markdown to HTML with sanitization
 */
function renderMarkdown(content) {
  if (typeof MarkedModule !== 'undefined' && typeof DOMPurifyModule !== 'undefined') {
    const rawHtml = MarkedModule.marked.parse(content);
    return DOMPurifyModule.DOMPurify.sanitize(rawHtml);
  }
  // Fallback: escape HTML for safety
  return content.replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Default settings
const defaultSettings = {
  endpoint: 'https://api.openai.com/v1/chat/completions',
  apiKey: '',
  defaultPrompt: 'You are a helpful assistant that analyzes web page content. Please summarize the key points of the following article.',
  model: 'gpt-4.1-nano',
  theme: 'system',
  fontSize: 'medium',
  autoSubmitPrompt: true
};

/**
 * Apply font size to the page
 */
function applyFontSize(fontSize) {
  const sizeMap = {
    'small': '12px',
    'medium': '14px',
    'large': '16px',
    'xlarge': '18px'
  };
  document.documentElement.style.setProperty(
    '--base-font-size',
    sizeMap[fontSize] || '14px'
  );
}

// Flag to track initial load for auto-submit
let isInitialLoad = true;

/**
 * Detect if Firefox theme is dark
 */
async function isFirefoxThemeDark() {
  try {
    const theme = await browserAPI.theme.getCurrent();
    if (theme?.colors?.frame) {
      // Parse the frame color to determine brightness
      const color = theme.colors.frame;
      let r, g, b;

      if (typeof color === 'string') {
        if (color.startsWith('#')) {
          const hex = color.slice(1);
          r = parseInt(hex.substr(0, 2), 16);
          g = parseInt(hex.substr(2, 2), 16);
          b = parseInt(hex.substr(4, 2), 16);
        } else if (color.startsWith('rgb')) {
          const match = color.match(/\d+/g);
          if (match) {
            [r, g, b] = match.map(Number);
          }
        }
      } else if (Array.isArray(color)) {
        [r, g, b] = color;
      }

      if (r !== undefined) {
        // Calculate perceived brightness (ITU-R BT.709)
        const brightness = (r * 0.2126 + g * 0.7152 + b * 0.0722);
        return brightness < 128;
      }
    }
  } catch (error) {
    console.error('Failed to detect Firefox theme:', error);
  }
  // Fallback to system preference
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

/**
 * Apply theme to the page
 */
async function applyTheme(theme) {
  const html = document.documentElement;
  html.classList.remove('theme-light', 'theme-dark');

  if (theme === 'system') {
    const isDark = await isFirefoxThemeDark();
    html.classList.add(isDark ? 'theme-dark' : 'theme-light');
  } else {
    html.classList.add(`theme-${theme}`);
  }
}

// State
let settings = { ...defaultSettings };
let chatHistory = [];
let pageContent = null;
let currentTabId = null;
let abortController = null;
let currentModel = null;  // Session-level model (不存回 storage)

// DOM Elements
const chatContainer = document.getElementById('chat-container');
const welcomeMessage = document.getElementById('welcome-message');
const pageInfo = document.getElementById('page-info');
const pageTitleEl = document.getElementById('page-title');
const pageUrlEl = document.getElementById('page-url');
const userInput = document.getElementById('user-input');
const sendBtn = document.getElementById('send-btn');
const settingsBtn = document.getElementById('settings-btn');
const clearBtn = document.getElementById('clear-btn');
const errorBanner = document.getElementById('error-banner');
const errorMessage = document.getElementById('error-message');
const errorClose = document.getElementById('error-close');
const modelSelect = document.getElementById('model-select');

/**
 * Load settings from storage
 */
async function loadSettings() {
  try {
    const stored = await browserAPI.storage.local.get(Object.keys(defaultSettings));
    settings = { ...defaultSettings, ...stored };
    applyTheme(settings.theme);
    applyFontSize(settings.fontSize);
  } catch (error) {
    console.error('Failed to load settings:', error);
  }
}

/**
 * Populate model selector dropdown from cached models
 */
async function populateModelSelect() {
  try {
    // 從 cache 讀取 model list
    const { cachedModels } = await browserAPI.storage.local.get('cachedModels');

    if (!cachedModels || cachedModels.length === 0) {
      // 若無 cache，使用預設 model
      modelSelect.innerHTML = `<option value="${settings.model}">${settings.model}</option>`;
      currentModel = settings.model;
      return;
    }

    // 填充 select options
    modelSelect.innerHTML = cachedModels
      .map(m => `<option value="${m}"${m === settings.model ? ' selected' : ''}>${m}</option>`)
      .join('');

    // 設定初始值
    currentModel = currentModel || settings.model;
    if (cachedModels.includes(currentModel)) {
      modelSelect.value = currentModel;
    } else if (cachedModels.length > 0) {
      currentModel = cachedModels[0];
      modelSelect.value = currentModel;
    }
  } catch (error) {
    console.error('Failed to load cached models:', error);
    modelSelect.innerHTML = `<option value="${settings.model}">${settings.model}</option>`;
    currentModel = settings.model;
  }
}

/**
 * Show error message
 */
function showError(message) {
  errorMessage.textContent = message;
  errorBanner.hidden = false;
}

/**
 * Hide error message
 */
function hideError() {
  errorBanner.hidden = true;
}

/**
 * Add a message to the chat
 */
function addMessage(role, content) {
  welcomeMessage.hidden = true;

  const messageEl = document.createElement('div');
  messageEl.className = `message ${role}`;

  if (role === 'assistant') {
    messageEl.innerHTML = renderMarkdown(content);
  } else {
    messageEl.textContent = content;
  }

  chatContainer.appendChild(messageEl);
  chatContainer.scrollTop = chatContainer.scrollHeight;

  return messageEl;
}

/**
 * Create typing indicator
 */
function createTypingIndicator() {
  const indicator = document.createElement('div');
  indicator.className = 'message assistant typing-indicator';
  indicator.innerHTML = '<span></span><span></span><span></span>';
  return indicator;
}

/**
 * Get the current active tab
 */
async function getActiveTab() {
  return new Promise((resolve) => {
    browserAPI.runtime.sendMessage({ type: 'GET_ACTIVE_TAB' }, (response) => {
      resolve(response);
    });
  });
}

/**
 * Extract content from the current page
 */
async function extractContent() {
  try {
    const tabInfo = await getActiveTab();
    if (!tabInfo?.tabId) {
      throw new Error('Could not get active tab');
    }

    currentTabId = tabInfo.tabId;

    // Send message to content script
    const response = await new Promise((resolve, reject) => {
      browserAPI.runtime.sendMessage(
        { type: 'FORWARD_TO_TAB', tabId: currentTabId, payload: { type: 'EXTRACT_CONTENT' } },
        (response) => {
          if (browserAPI.runtime.lastError) {
            reject(new Error(browserAPI.runtime.lastError.message));
          } else {
            resolve(response);
          }
        }
      );
    });

    if (!response?.success || !response?.data) {
      throw new Error('Failed to extract page content');
    }

    pageContent = response.data;

    // Update page info display
    pageTitleEl.textContent = pageContent.title;
    pageUrlEl.textContent = pageContent.url;
    pageInfo.hidden = false;

    addMessage('system', `Page extracted: "${pageContent.title}"`);

    // Enable send button
    updateSendButtonState();

    // Auto-submit prompt if enabled and conditions are met
    if (isInitialLoad && settings.autoSubmitPrompt && settings.defaultPrompt && settings.apiKey) {
      isInitialLoad = false;
      sendMessage();
    }

  } catch (error) {
    console.error('Extract error:', error);
    showError(`Failed to extract page: ${error.message}`);
  }
}

/**
 * Update send button state
 */
function updateSendButtonState() {
  const hasInput = userInput.value.trim().length > 0;
  const hasApiKey = settings.apiKey.length > 0;
  sendBtn.disabled = !hasInput || !hasApiKey;
}

/**
 * Stream chat completion from OpenAI API
 */
async function streamChatCompletion(messages, onChunk) {
  abortController = new AbortController();

  const response = await fetch(settings.endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${settings.apiKey}`
    },
    body: JSON.stringify({
      model: currentModel,
      messages,
      stream: true
    }),
    signal: abortController.signal
  });

  if (!response.ok) {
    const errorText = await response.text();
    let errorMsg;
    try {
      const errorJson = JSON.parse(errorText);
      errorMsg = errorJson.error?.message || errorText;
    } catch {
      errorMsg = errorText;
    }
    throw new Error(`API Error (${response.status}): ${errorMsg}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let fullContent = '';

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
      } catch {
        // Skip invalid JSON
      }
    }
  }

  return fullContent;
}

/**
 * Send a message to the AI
 */
async function sendMessage() {
  const userText = userInput.value.trim();
  if (!userText) return;

  if (!settings.apiKey) {
    showError('Please set your API key in the settings.');
    return;
  }

  // Add user message
  addMessage('user', userText);
  chatHistory.push({ role: 'user', content: userText });
  userInput.value = '';
  updateSendButtonState();

  // Build messages array
  const messages = [];

  // System prompt with page content if available
  let systemContent = 'You are a helpful assistant. Always format your responses using Markdown.';
  if (pageContent) {
    systemContent += `\n\nPage Title: ${pageContent.title}\nPage URL: ${pageContent.url}\n\nPage Content:\n${pageContent.textContent}`;
  }
  messages.push({ role: 'system', content: systemContent });

  // Add chat history
  messages.push(...chatHistory);

  // Show typing indicator
  const typingIndicator = createTypingIndicator();
  chatContainer.appendChild(typingIndicator);
  chatContainer.scrollTop = chatContainer.scrollHeight;

  // Create assistant message element for streaming
  const assistantMessage = document.createElement('div');
  assistantMessage.className = 'message assistant';
  assistantMessage.style.display = 'none';
  let accumulatedContent = '';

  try {
    sendBtn.disabled = true;

    const fullContent = await streamChatCompletion(messages, (chunk) => {
      // Remove typing indicator and show message
      if (typingIndicator.parentNode) {
        typingIndicator.remove();
        chatContainer.appendChild(assistantMessage);
        assistantMessage.style.display = 'block';
      }

      // Accumulate content and render markdown
      accumulatedContent += chunk;
      assistantMessage.innerHTML = renderMarkdown(accumulatedContent);
      chatContainer.scrollTop = chatContainer.scrollHeight;
    });

    // Add to chat history
    chatHistory.push({ role: 'assistant', content: fullContent });

  } catch (error) {
    if (error.name === 'AbortError') {
      // Request was cancelled
      return;
    }
    console.error('Chat error:', error);
    typingIndicator.remove();
    showError(error.message);
  } finally {
    sendBtn.disabled = false;
    abortController = null;
    updateSendButtonState();
  }
}

/**
 * Clear chat history
 */
function clearChat() {
  chatHistory = [];
  pageContent = null;
  pageInfo.hidden = true;
  chatContainer.innerHTML = '';
  welcomeMessage.hidden = false;
  chatContainer.appendChild(welcomeMessage);

  // Restore default prompt
  if (settings.defaultPrompt) {
    userInput.value = settings.defaultPrompt;
  }

  updateSendButtonState();
}

/**
 * Open settings page
 */
function openSettings() {
  browserAPI.runtime.openOptionsPage();
}

// Event listeners
sendBtn.addEventListener('click', sendMessage);
settingsBtn.addEventListener('click', openSettings);
clearBtn.addEventListener('click', clearChat);
errorClose.addEventListener('click', hideError);

userInput.addEventListener('input', updateSendButtonState);
modelSelect.addEventListener('change', (e) => {
  currentModel = e.target.value;
});
userInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    if (!sendBtn.disabled) {
      sendMessage();
    }
  }
});

// Listen for storage changes to update settings
browserAPI.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'local') {
    for (const key of Object.keys(changes)) {
      if (key in settings) {
        settings[key] = changes[key].newValue;
      }
    }
    updateSendButtonState();

    // 當 cachedModels 更新時，重新載入 model list
    if (changes.cachedModels) {
      populateModelSelect();
    }

    // 當 theme 變更時，套用新主題
    if (changes.theme) {
      applyTheme(changes.theme.newValue);
    }

    // Apply new font size when fontSize changes
    if (changes.fontSize) {
      applyFontSize(changes.fontSize.newValue);
    }
  }
});

// Listen for Firefox theme changes (for system/auto mode)
if (browserAPI.theme?.onUpdated) {
  browserAPI.theme.onUpdated.addListener(() => {
    if (settings.theme === 'system') {
      applyTheme('system');
    }
  });
}

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
  await loadSettings();
  await populateModelSelect();

  // Fill in default message
  if (settings.defaultPrompt) {
    userInput.value = settings.defaultPrompt;
  }

  // Auto focus to input field
  userInput.focus();

  updateSendButtonState();

  // Auto extract page content
  extractContent();
});

// Focus input when sidebar becomes visible (e.g., reopened via Ctrl-Y)
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    userInput.focus();
  }
});
