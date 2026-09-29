/**
 * Sidebar script for Watson Page Assistant
 */

import { getProviderHeaders } from '../common/openai-client.js';
import {
  applyReasoningEffort,
  getReasoningOptions,
  populateReasoningSelect
} from '../common/reasoning.js';

const browserAPI = typeof browser !== 'undefined' ? browser : chrome;
const isPopup = window.location.pathname === '/popup/popup.html';
const sourceTabId = new URLSearchParams(window.location.search).get('sourceTabId');
const pendingProfileKey = isPopup
  ? `pendingProfileId:popup:${sourceTabId || 'unbound'}`
  : 'pendingProfileId';
let profilesReady = false;

// Configure marked
if (typeof MarkedModule !== 'undefined') {
  MarkedModule.marked.setOptions({
    breaks: true,
    gfm: true
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
  return content.replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Default settings
const defaultSettings = {
  providers: [
    {
      id: 'default-openai',
      name: 'OpenAI',
      endpoint: 'https://api.openai.com/v1/chat/completions',
      apiKey: ''
    }
  ],
  activeProviderId: 'default-openai',
  promptProfiles: [
    {
      id: 'profile-default',
      name: 'Summarize',
      prompt: 'You are a helpful assistant that analyzes web page content. Please summarize the key points of the following article.'
    }
  ],
  activeProfileId: 'profile-default',
  model: 'gpt-4.1-nano',
  reasoningEffort: '',
  theme: 'system',
  fontSize: 'medium',
  displayMode: 'sidebar',
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
        const brightness = (r * 0.2126 + g * 0.7152 + b * 0.0722);
        return brightness < 128;
      }
    }
  } catch (error) {
    console.error('Failed to detect Firefox theme:', error);
  }
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
let currentModel = null;
let cachedModelMeta = {};

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
const reasoningSelect = document.getElementById('reasoning-select');
const profileSelect = document.getElementById('profile-select');

/**
 * Parse model value to {providerId, modelId}
 */
function parseModelValue(value) {
  const idx = (value || '').indexOf('::');
  if (idx === -1) return { providerId: null, modelId: value };
  return { providerId: value.substring(0, idx), modelId: value.substring(idx + 2) };
}

/**
 * Find provider by ID
 */
function findProvider(providerId) {
  const providers = settings.providers || defaultSettings.providers;
  return providers.find(p => p.id === providerId);
}

/**
 * Get provider for the currently selected model
 */
function getProviderForCurrentModel() {
  const { providerId } = parseModelValue(currentModel);
  if (providerId) {
    const provider = findProvider(providerId);
    if (provider) return provider;
  }
  // Fallback to active provider
  const providers = settings.providers || defaultSettings.providers;
  const activeId = settings.activeProviderId || defaultSettings.activeProviderId;
  return providers.find(p => p.id === activeId) || providers[0];
}

function getReasoningEffort() {
  return reasoningSelect?.value || '';
}

function syncReasoningSelect(preferred) {
  const provider = getProviderForCurrentModel();
  const { modelId } = parseModelValue(currentModel);
  const values = provider
    ? getReasoningOptions(
      provider.endpoint,
      modelId,
      cachedModelMeta[provider.id]?.[modelId]
    )
    : null;
  const selected = preferred !== undefined
    ? preferred
    : (reasoningSelect?.value || settings.reasoningEffort || '');
  populateReasoningSelect(reasoningSelect, values, selected);
}

/**
 * Load settings from storage
 */
async function loadSettings() {
  try {
    const stored = await browserAPI.storage.local.get(null);

    // Migration: old format -> new format
    if (stored.endpoint && !stored.providers) {
      const migrated = {
        providers: [{
          id: 'migrated',
          name: 'My API',
          endpoint: stored.endpoint,
          apiKey: stored.apiKey || ''
        }],
        activeProviderId: 'migrated'
      };
      await browserAPI.storage.local.set(migrated);
      await browserAPI.storage.local.remove(['endpoint', 'apiKey']);
      Object.assign(stored, migrated);
    }

    settings = { ...defaultSettings, ...stored };
    applyTheme(settings.theme);
    applyFontSize(settings.fontSize);
  } catch (error) {
    console.error('Failed to load settings:', error);
  }
}

/**
 * Populate model selector dropdown from cached models for all providers
 */
async function populateModelSelect() {
  try {
    const providers = settings.providers || defaultSettings.providers;
    const stored = await browserAPI.storage.local.get(['cachedModels', 'cachedModelMeta']);
    const { cachedModels } = stored;
    if (stored.cachedModelMeta) {
      cachedModelMeta = stored.cachedModelMeta;
    }

    modelSelect.innerHTML = '';
    let hasModels = false;

    for (const provider of providers) {
      const models = (cachedModels && cachedModels[provider.id]) || [];
      if (models.length === 0) continue;

      hasModels = true;
      const optgroup = document.createElement('optgroup');
      optgroup.label = provider.name || provider.id;

      for (const m of models) {
        const option = document.createElement('option');
        option.value = `${provider.id}::${m}`;
        option.textContent = m;
        if (option.value === settings.model) {
          option.selected = true;
        }
        optgroup.appendChild(option);
      }

      modelSelect.appendChild(optgroup);
    }

    if (!hasModels) {
      // Fallback: show current setting as single option
      const option = document.createElement('option');
      option.value = settings.model;
      const { modelId } = parseModelValue(settings.model);
      option.textContent = modelId;
      modelSelect.appendChild(option);
      currentModel = settings.model;
      syncReasoningSelect();
      return;
    }

    // Restore selection
    currentModel = currentModel || settings.model;
    if (modelSelect.querySelector(`option[value="${CSS.escape(currentModel)}"]`)) {
      modelSelect.value = currentModel;
    } else {
      // Select first available
      const firstOption = modelSelect.querySelector('option');
      if (firstOption) {
        currentModel = firstOption.value;
        modelSelect.value = currentModel;
      }
    }
    syncReasoningSelect();
  } catch (error) {
    console.error('Failed to load cached models:', error);
    const option = document.createElement('option');
    option.value = settings.model;
    option.textContent = parseModelValue(settings.model).modelId;
    modelSelect.replaceChildren(option);
    currentModel = settings.model;
    syncReasoningSelect();
  }
}

/**
 * Populate profile selector dropdown
 */
function populateProfileSelect() {
  const profiles = settings.promptProfiles || defaultSettings.promptProfiles;
  profileSelect.innerHTML = '';

  for (const profile of profiles) {
    const option = document.createElement('option');
    option.value = profile.id;
    option.textContent = profile.name || '(unnamed)';
    profileSelect.appendChild(option);
  }

  // Restore selection to active profile
  const activeId = settings.activeProfileId || defaultSettings.activeProfileId;
  if (profileSelect.querySelector(`option[value="${CSS.escape(activeId)}"]`)) {
    profileSelect.value = activeId;
  } else {
    const first = profileSelect.querySelector('option');
    if (first) profileSelect.value = first.value;
  }

  updatePromptFromProfile();
}

/**
 * Get the currently selected profile
 */
function getSelectedProfile() {
  const profiles = settings.promptProfiles || defaultSettings.promptProfiles;
  return profiles.find(p => p.id === profileSelect.value) || profiles[0];
}

/**
 * Update the input textarea (and model if set) from the selected profile
 */
function updatePromptFromProfile() {
  const profile = getSelectedProfile();
  if (!profile) return;

  userInput.value = profile.prompt;

  // Switch model if profile specifies one
  if (profile.model && modelSelect.querySelector(`option[value="${CSS.escape(profile.model)}"]`)) {
    currentModel = profile.model;
    modelSelect.value = profile.model;
  }

  const preferredReasoning = profile.model
    ? (profile.reasoningEffort || '')
    : (settings.reasoningEffort || '');
  syncReasoningSelect(preferredReasoning);

  updateSendButtonState();
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
      throw new Error(tabInfo?.error || 'Could not get active tab');
    }

    currentTabId = tabInfo.tabId;

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

    if (response?.error) {
      throw new Error(response.error);
    }

    if (!response?.success || !response?.data) {
      throw new Error('Failed to extract page content');
    }

    pageContent = response.data;

    pageTitleEl.textContent = pageContent.title;
    pageUrlEl.textContent = pageContent.url;
    pageInfo.hidden = false;

    addMessage('system', `Page extracted: "${pageContent.title}"`);

    updateSendButtonState();

    const provider = getProviderForCurrentModel();
    const profile = getSelectedProfile();
    const shouldAutoSubmit = profile?.autoSubmit ?? true;
    if (isInitialLoad && shouldAutoSubmit && profile?.prompt && provider.apiKey) {
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
  const provider = getProviderForCurrentModel();
  const hasApiKey = provider && provider.apiKey && provider.apiKey.length > 0;
  sendBtn.disabled = !hasInput || !hasApiKey;
}

/**
 * Stream chat completion from API
 */
async function streamChatCompletion(messages, onChunk) {
  abortController = new AbortController();

  const provider = getProviderForCurrentModel();
  const { modelId } = parseModelValue(currentModel);
  const body = {
    model: modelId,
    messages,
    stream: true
  };
  applyReasoningEffort(body, provider.endpoint, getReasoningEffort());

  const response = await fetch(provider.endpoint, {
    method: 'POST',
    headers: getProviderHeaders(provider, { json: true }),
    body: JSON.stringify(body),
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

  const provider = getProviderForCurrentModel();
  if (!provider.apiKey) {
    showError('Please set your API key in the settings.');
    return;
  }

  addMessage('user', userText);
  chatHistory.push({ role: 'user', content: userText });
  userInput.value = '';
  updateSendButtonState();

  const messages = [];

  let systemContent = 'You are a helpful assistant. Always format your responses using Markdown.';
  if (pageContent) {
    systemContent += `\n\nPage Title: ${pageContent.title}\nPage URL: ${pageContent.url}\n\nPage Content:\n${pageContent.textContent}`;
  }
  messages.push({ role: 'system', content: systemContent });

  messages.push(...chatHistory);

  const typingIndicator = createTypingIndicator();
  chatContainer.appendChild(typingIndicator);
  chatContainer.scrollTop = chatContainer.scrollHeight;

  const assistantMessage = document.createElement('div');
  assistantMessage.className = 'message assistant';
  assistantMessage.style.display = 'none';
  let accumulatedContent = '';

  try {
    sendBtn.disabled = true;

    const fullContent = await streamChatCompletion(messages, (chunk) => {
      if (typingIndicator.parentNode) {
        typingIndicator.remove();
        chatContainer.appendChild(assistantMessage);
        assistantMessage.style.display = 'block';
      }

      accumulatedContent += chunk;
      assistantMessage.innerHTML = renderMarkdown(accumulatedContent);
      chatContainer.scrollTop = chatContainer.scrollHeight;
    });

    chatHistory.push({ role: 'assistant', content: fullContent });

  } catch (error) {
    if (error.name === 'AbortError') {
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

  const profile = getSelectedProfile();
  if (profile?.prompt) {
    userInput.value = profile.prompt;
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
  syncReasoningSelect();
  updateSendButtonState();
});
profileSelect.addEventListener('change', () => {
  updatePromptFromProfile();
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
    if (changes.providers) {
      settings.providers = changes.providers.newValue;
      updateSendButtonState();
    }
    if (changes.activeProviderId) {
      settings.activeProviderId = changes.activeProviderId.newValue;
    }
    if (changes.model) {
      settings.model = changes.model.newValue;
    }
    if (changes.reasoningEffort) {
      settings.reasoningEffort = changes.reasoningEffort.newValue;
      syncReasoningSelect(changes.reasoningEffort.newValue);
    }
    if (changes.promptProfiles) {
      settings.promptProfiles = changes.promptProfiles.newValue;
      populateProfileSelect();
    }
    if (changes.activeProfileId) {
      settings.activeProfileId = changes.activeProfileId.newValue;
    }
    if (profilesReady && changes[pendingProfileKey]?.newValue) {
      applyPendingProfile();
    }
    if (changes.cachedModels) {
      populateModelSelect();
    }
    if (changes.cachedModelMeta) {
      cachedModelMeta = changes.cachedModelMeta.newValue || {};
      syncReasoningSelect();
    }

    if (changes.theme) {
      applyTheme(changes.theme.newValue);
    }

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

/**
 * Apply a pending profile switch triggered by keyboard shortcut
 */
async function applyPendingProfile() {
  const stored = await browserAPI.storage.local.get(pendingProfileKey);
  const pendingProfileId = stored[pendingProfileKey];
  if (!pendingProfileId) return;
  await browserAPI.storage.local.remove(pendingProfileKey);
  if (profileSelect.querySelector(`option[value="${CSS.escape(pendingProfileId)}"]`)) {
    profileSelect.value = pendingProfileId;
    updatePromptFromProfile();
  }
}

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
  await loadSettings();
  const storedMeta = await browserAPI.storage.local.get('cachedModelMeta');
  cachedModelMeta = storedMeta.cachedModelMeta || {};
  await populateModelSelect();
  populateProfileSelect();
  profilesReady = true;

  // Switch to profile requested by keyboard shortcut (if any)
  await applyPendingProfile();

  userInput.focus();

  updateSendButtonState();

  extractContent();
});

// Focus input when sidebar becomes visible
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    userInput.focus();
  }
});
