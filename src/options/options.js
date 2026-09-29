/**
 * Options page script
 */

import { getModelsEndpoint, getProviderHeaders } from '../common/openai-client.js';
import {
  extractReasoningMeta,
  getReasoningOptions,
  populateReasoningSelect
} from '../common/reasoning.js';

const browserAPI = typeof browser !== 'undefined' ? browser : chrome;

const SHORTCUT_SLOTS = [
  { key: 'open-profile-1', label: 'Slot 1' },
  { key: 'open-profile-2', label: 'Slot 2' },
  { key: 'open-profile-3', label: 'Slot 3' },
  { key: 'open-profile-4', label: 'Slot 4' }
];

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
  profileShortcuts: {},
  model: 'gpt-4.1-nano',
  reasoningEffort: '',
  theme: 'system',
  fontSize: 'medium',
  displayMode: 'sidebar',
  autoSubmitPrompt: true
};

const PRESETS = {
  cerebras: {
    name: 'Cerebras',
    endpoint: 'https://api.cerebras.ai/v1/chat/completions'
  },
  claude: {
    name: 'Claude',
    endpoint: 'https://api.anthropic.com/v1/chat/completions'
  },
  gemini: {
    name: 'Gemini',
    endpoint: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions'
  },
  grok: {
    name: 'Grok',
    endpoint: 'https://api.x.ai/v1/chat/completions'
  },
  groq: {
    name: 'Groq',
    endpoint: 'https://api.groq.com/openai/v1/chat/completions'
  },
  llamacpp: {
    name: 'llama.cpp',
    endpoint: 'http://localhost:8080/v1/chat/completions',
    apiKey: 'sk-no-key-required'
  },
  mistral: {
    name: 'Mistral AI',
    endpoint: 'https://api.mistral.ai/v1/chat/completions'
  },
  openai: {
    name: 'OpenAI',
    endpoint: 'https://api.openai.com/v1/chat/completions'
  },
  openrouter: {
    name: 'OpenRouter',
    endpoint: 'https://openrouter.ai/api/v1/chat/completions'
  },
  perplexity: {
    name: 'Perplexity',
    endpoint: 'https://api.perplexity.ai/chat/completions'
  }
};

// Perplexity has no public /models list; keep the official Sonar catalog as fallback.
const PERPLEXITY_MODELS = [
  'sonar',
  'sonar-deep-research',
  'sonar-pro',
  'sonar-reasoning-pro'
];

const form = document.getElementById('settings-form');
const statusEl = document.getElementById('status');
const resetBtn = document.getElementById('reset-btn');
const loadModelsBtn = document.getElementById('load-models-btn');
const modelSelect = document.getElementById('model');
const reasoningSelect = document.getElementById('reasoning');
const reasoningGroup = document.getElementById('reasoning-group');
const modelStatusEl = document.getElementById('model-status');
const themeSelect = document.getElementById('theme');
const fontSizeSelect = document.getElementById('fontSize');
const displayModeSelect = document.getElementById('displayMode');
const providerListEl = document.getElementById('provider-list');
const addProviderBtn = document.getElementById('add-provider-btn');
const profileListEl = document.getElementById('profile-list');
const addProfileBtn = document.getElementById('add-profile-btn');

let providers = [];
let activeProviderId = '';

let promptProfiles = [];
let activeProfileId = '';
let currentProfileShortcuts = {};
let cachedModels = {};
let cachedModelMeta = {};
let savedReasoningEffort = '';

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

/**
 * Show status message
 */
function showStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.className = `status ${isError ? 'error' : 'success'}`;
  statusEl.hidden = false;

  setTimeout(() => {
    statusEl.hidden = true;
  }, 3000);
}

/**
 * Update model status message
 */
function updateModelStatus(message, type = 'default') {
  modelStatusEl.textContent = message;
  modelStatusEl.className = type !== 'default' ? `model-status-${type}` : '';
}

/**
 * Generate a unique provider ID
 */
function generateId() {
  return 'provider-' + Date.now() + '-' + Math.random().toString(36).substr(2, 6);
}

/**
 * Generate a unique profile ID
 */
function generateProfileId() {
  return 'profile-' + Date.now() + '-' + Math.random().toString(36).substr(2, 6);
}

/**
 * Render prompt profile list UI
 */
function renderProfiles() {
  profileListEl.innerHTML = '';

  promptProfiles.forEach((profile) => {
    const item = document.createElement('div');
    item.className = 'profile-item' + (profile.id === activeProfileId ? ' active' : '');

    const header = document.createElement('div');
    header.className = 'profile-header';

    const radio = document.createElement('input');
    radio.type = 'radio';
    radio.name = 'active-profile';
    radio.checked = profile.id === activeProfileId;
    radio.addEventListener('change', () => {
      activeProfileId = profile.id;
      renderProfiles();
    });

    const nameSpan = document.createElement('span');
    nameSpan.className = 'profile-name';
    nameSpan.textContent = profile.name || '(unnamed)';

    const toggleBtn = document.createElement('button');
    toggleBtn.type = 'button';
    toggleBtn.className = 'btn-toggle';
    toggleBtn.textContent = '▼';
    toggleBtn.addEventListener('click', () => {
      const detail = item.querySelector('.profile-detail');
      const isHidden = detail.hidden;
      detail.hidden = !isHidden;
      toggleBtn.textContent = isHidden ? '▲' : '▼';
    });

    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'btn-delete';
    deleteBtn.textContent = '✕';
    deleteBtn.addEventListener('click', () => {
      if (promptProfiles.length <= 1) {
        showStatus('Cannot delete the last profile', true);
        return;
      }
      promptProfiles = promptProfiles.filter(p => p.id !== profile.id);
      if (activeProfileId === profile.id) {
        activeProfileId = promptProfiles[0].id;
      }
      renderProfiles();
    });

    header.appendChild(radio);
    header.appendChild(nameSpan);
    header.appendChild(toggleBtn);
    header.appendChild(deleteBtn);

    const detail = document.createElement('div');
    detail.className = 'profile-detail';
    detail.hidden = true;

    // Name field
    const nameGroup = document.createElement('div');
    nameGroup.className = 'form-group';
    const nameLabel = document.createElement('label');
    nameLabel.textContent = 'Name';
    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.value = profile.name || '';
    nameInput.placeholder = 'Profile name';
    nameInput.addEventListener('input', (e) => {
      profile.name = e.target.value;
      nameSpan.textContent = profile.name || '(unnamed)';
    });
    nameGroup.appendChild(nameLabel);
    nameGroup.appendChild(nameInput);
    detail.appendChild(nameGroup);

    // Prompt field
    const promptGroup = document.createElement('div');
    promptGroup.className = 'form-group';
    const promptLabel = document.createElement('label');
    promptLabel.textContent = 'Prompt';
    const promptTextarea = document.createElement('textarea');
    promptTextarea.rows = 5;
    promptTextarea.placeholder = 'Enter your prompt...';
    promptTextarea.value = profile.prompt || '';
    promptTextarea.addEventListener('input', (e) => {
      profile.prompt = e.target.value;
    });
    promptGroup.appendChild(promptLabel);
    promptGroup.appendChild(promptTextarea);
    detail.appendChild(promptGroup);

    // Model field
    const modelGroup = document.createElement('div');
    modelGroup.className = 'form-group';
    const modelLabel = document.createElement('label');
    modelLabel.textContent = 'Model';
    const modelSelectEl = document.createElement('select');
    const noneOpt = document.createElement('option');
    noneOpt.value = '';
    noneOpt.textContent = '(use global model)';
    modelSelectEl.appendChild(noneOpt);
    for (const provider of providers) {
      const models = cachedModels[provider.id] || [];
      if (models.length === 0) continue;
      const optgroup = document.createElement('optgroup');
      optgroup.label = provider.name || provider.id;
      for (const modelId of models) {
        const opt = document.createElement('option');
        opt.value = `${provider.id}::${modelId}`;
        opt.textContent = modelId;
        optgroup.appendChild(opt);
      }
      modelSelectEl.appendChild(optgroup);
    }
    if (profile.model) modelSelectEl.value = profile.model;
    modelGroup.appendChild(modelLabel);
    modelGroup.appendChild(modelSelectEl);
    detail.appendChild(modelGroup);

    const reasoningGroupEl = document.createElement('div');
    reasoningGroupEl.className = 'form-group';
    const reasoningLabel = document.createElement('label');
    reasoningLabel.textContent = 'Reasoning';
    const reasoningSelectEl = document.createElement('select');
    reasoningSelectEl.addEventListener('change', (e) => {
      profile.reasoningEffort = e.target.value;
    });
    reasoningGroupEl.appendChild(reasoningLabel);
    reasoningGroupEl.appendChild(reasoningSelectEl);
    detail.appendChild(reasoningGroupEl);

    const syncProfileReasoning = () => {
      if (!profile.model) {
        populateReasoningSelect(reasoningSelectEl, null, '');
        reasoningGroupEl.hidden = true;
        profile.reasoningEffort = '';
        return;
      }
      const shown = updateReasoningSelect(
        reasoningSelectEl,
        profile.model,
        profile.reasoningEffort || ''
      );
      reasoningGroupEl.hidden = !shown;
    };
    modelSelectEl.addEventListener('change', (e) => {
      profile.model = e.target.value;
      if (!profile.model) {
        profile.reasoningEffort = '';
      }
      syncProfileReasoning();
    });
    syncProfileReasoning();

    // Auto-submit field
    const autoGroup = document.createElement('div');
    autoGroup.className = 'form-group';
    const autoLabel = document.createElement('label');
    autoLabel.className = 'checkbox-label';
    const autoCheckbox = document.createElement('input');
    autoCheckbox.type = 'checkbox';
    autoCheckbox.checked = profile.autoSubmit ?? true;
    autoCheckbox.addEventListener('change', (e) => {
      profile.autoSubmit = e.target.checked;
    });
    autoLabel.appendChild(autoCheckbox);
    autoLabel.appendChild(document.createTextNode(' Auto-submit prompt when the assistant opens'));
    autoGroup.appendChild(autoLabel);
    detail.appendChild(autoGroup);

    item.appendChild(header);
    item.appendChild(detail);
    profileListEl.appendChild(item);
  });

  renderShortcutSlots();
}

/**
 * Add a new prompt profile
 */
function addProfile() {
  const newProfile = {
    id: generateProfileId(),
    name: '',
    prompt: '',
    model: '',
    reasoningEffort: '',
    autoSubmit: true
  };
  promptProfiles.push(newProfile);
  if (promptProfiles.length === 1) {
    activeProfileId = newProfile.id;
  }
  renderProfiles();
  // Auto-expand the new one
  const items = profileListEl.querySelectorAll('.profile-item');
  const last = items[items.length - 1];
  if (last) {
    const detail = last.querySelector('.profile-detail');
    detail.hidden = false;
    last.querySelector('.btn-toggle').textContent = '▲';
  }
}

/**
 * Render shortcut slot dropdowns, populated with current profiles
 */
function renderShortcutSlots() {
  SHORTCUT_SLOTS.forEach(({ key }, i) => {
    const select = document.getElementById(`shortcut-slot-${i + 1}`);
    if (!select) return;
    const savedValue = currentProfileShortcuts[key] || '';

    select.innerHTML = '<option value="">(none)</option>';
    for (const profile of promptProfiles) {
      const option = document.createElement('option');
      option.value = profile.id;
      option.textContent = profile.name || '(unnamed)';
      if (profile.id === savedValue) option.selected = true;
      select.appendChild(option);
    }
  });
}

/**
 * Get the active provider object
 */
function getActiveProvider() {
  return providers.find(p => p.id === activeProviderId) || providers[0];
}

/**
 * Render provider list UI
 */
function renderProviders() {
  providerListEl.innerHTML = '';

  providers.forEach((provider) => {
    const item = document.createElement('div');
    item.className = 'provider-item' + (provider.id === activeProviderId ? ' active' : '');

    const header = document.createElement('div');
    header.className = 'provider-header';

    const radio = document.createElement('input');
    radio.type = 'radio';
    radio.name = 'active-provider';
    radio.checked = provider.id === activeProviderId;
    radio.addEventListener('change', () => {
      activeProviderId = provider.id;
      renderProviders();
    });

    const nameSpan = document.createElement('span');
    nameSpan.className = 'provider-name';
    nameSpan.textContent = provider.name || '(unnamed)';

    const endpointSpan = document.createElement('span');
    endpointSpan.className = 'provider-endpoint-summary';
    try {
      endpointSpan.textContent = new URL(provider.endpoint).hostname;
    } catch {
      endpointSpan.textContent = provider.endpoint;
    }

    const toggleBtn = document.createElement('button');
    toggleBtn.type = 'button';
    toggleBtn.className = 'btn-toggle';
    toggleBtn.textContent = '▼';
    toggleBtn.addEventListener('click', () => {
      const detail = item.querySelector('.provider-detail');
      const isHidden = detail.hidden;
      detail.hidden = !isHidden;
      toggleBtn.textContent = isHidden ? '▲' : '▼';
    });

    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'btn-delete';
    deleteBtn.textContent = '✕';
    deleteBtn.addEventListener('click', () => {
      if (providers.length <= 1) {
        showStatus('Cannot delete the last provider', true);
        return;
      }
      providers = providers.filter(p => p.id !== provider.id);
      if (activeProviderId === provider.id) {
        activeProviderId = providers[0].id;
      }
      renderProviders();
    });

    header.appendChild(radio);
    header.appendChild(nameSpan);
    header.appendChild(endpointSpan);
    header.appendChild(toggleBtn);
    header.appendChild(deleteBtn);

    const detail = document.createElement('div');
    detail.className = 'provider-detail';
    detail.hidden = true;
    detail.innerHTML = `
      <div class="form-group">
        <label>Name</label>
        <input type="text" class="provider-name-input" placeholder="Provider name">
      </div>
      <div class="form-group">
        <label>API Endpoint</label>
        <input type="url" class="provider-endpoint-input" placeholder="https://api.openai.com/v1/chat/completions">
      </div>
      <div class="form-group">
        <label>API Key</label>
        <input type="password" class="provider-apikey-input" placeholder="Your API key">
      </div>
    `;

    const nameInput = detail.querySelector('.provider-name-input');
    const endpointInput = detail.querySelector('.provider-endpoint-input');
    const apiKeyInput = detail.querySelector('.provider-apikey-input');
    nameInput.value = provider.name || '';
    endpointInput.value = provider.endpoint || '';
    apiKeyInput.value = provider.apiKey || '';

    // Sync edits back to providers array
    nameInput.addEventListener('input', (e) => {
      provider.name = e.target.value;
      nameSpan.textContent = provider.name || '(unnamed)';
    });
    endpointInput.addEventListener('input', (e) => {
      provider.endpoint = e.target.value;
      try {
        endpointSpan.textContent = new URL(e.target.value).hostname;
      } catch {
        endpointSpan.textContent = e.target.value;
      }
    });
    apiKeyInput.addEventListener('input', (e) => {
      provider.apiKey = e.target.value;
    });

    item.appendChild(header);
    item.appendChild(detail);
    providerListEl.appendChild(item);
  });
}

/**
 * Add a new provider (optionally from preset)
 */
function addProvider(preset) {
  const config = preset ? PRESETS[preset] : { name: '', endpoint: '', apiKey: '' };
  const newProvider = {
    id: generateId(),
    name: config.name || '',
    endpoint: config.endpoint || '',
    apiKey: config.apiKey || ''
  };
  providers.push(newProvider);
  if (providers.length === 1) {
    activeProviderId = newProvider.id;
  }
  renderProviders();
  // Auto-expand the new one
  const items = providerListEl.querySelectorAll('.provider-item');
  const last = items[items.length - 1];
  if (last) {
    const detail = last.querySelector('.provider-detail');
    detail.hidden = false;
    last.querySelector('.btn-toggle').textContent = '▲';
  }
}

function getFallbackModels(provider) {
  try {
    if (new URL(provider.endpoint).hostname === 'api.perplexity.ai') {
      return [...PERPLEXITY_MODELS];
    }
  } catch {
    // ignore invalid URL
  }
  return null;
}

/**
 * Fetch available models from API
 */
async function fetchModels(provider) {
  const fallback = getFallbackModels(provider);

  try {
    const modelsEndpoint = getModelsEndpoint(provider.endpoint);
    const response = await fetch(modelsEndpoint, {
      headers: getProviderHeaders(provider)
    });

    if (!response.ok) {
      if (fallback) return { models: fallback, meta: {} };
      throw new Error(`API Error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const parsed = parseModelsList(data);
    if (parsed.models.length === 0 && fallback) {
      return { models: fallback, meta: {} };
    }
    return parsed;
  } catch (error) {
    if (fallback) return { models: fallback, meta: {} };
    throw error;
  }
}

function parseModelsList(data) {
  const models = [];
  const meta = {};
  for (const entry of data.data || []) {
    if (!entry?.id) continue;
    models.push(entry.id);
    const reasoning = extractReasoningMeta(entry);
    if (reasoning) meta[entry.id] = reasoning;
  }
  models.sort();
  return { models, meta };
}

/**
 * Parse model value to {providerId, modelId}
 */
function parseModelValue(value) {
  const idx = (value || '').indexOf('::');
  if (idx === -1) return { providerId: null, modelId: value };
  return { providerId: value.substring(0, idx), modelId: value.substring(idx + 2) };
}

function findProvider(providerId) {
  return providers.find(p => p.id === providerId);
}

/**
 * Show reasoning values for the selected model, if the platform supports them.
 */
function updateReasoningSelect(selectEl, modelValue, selected = '') {
  const { providerId, modelId } = parseModelValue(modelValue);
  const provider = findProvider(providerId) || getActiveProvider();
  if (!provider || !modelId) {
    return populateReasoningSelect(selectEl, null, '');
  }

  const values = getReasoningOptions(
    provider.endpoint,
    modelId,
    cachedModelMeta[provider.id]?.[modelId]
  );
  return populateReasoningSelect(selectEl, values, selected);
}

function syncGlobalReasoningSelect() {
  const shown = updateReasoningSelect(
    reasoningSelect,
    modelSelect.value,
    reasoningSelect.value || savedReasoningEffort
  );
  reasoningGroup.hidden = !shown;
}

/**
 * Populate model select with all providers' models using optgroups
 */
function populateModelSelect(cachedModels, selectedModel = '') {
  modelSelect.innerHTML = '';
  let totalModels = 0;

  for (const provider of providers) {
    const models = (cachedModels && cachedModels[provider.id]) || [];
    if (models.length === 0) continue;

    const optgroup = document.createElement('optgroup');
    optgroup.label = provider.name || provider.id;

    for (const modelId of models) {
      const option = document.createElement('option');
      option.value = `${provider.id}::${modelId}`;
      option.textContent = modelId;
      optgroup.appendChild(option);
      totalModels++;
    }

    modelSelect.appendChild(optgroup);
  }

  if (totalModels === 0) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = '-- No available models --';
    modelSelect.appendChild(option);
    syncGlobalReasoningSelect();
    return;
  }

  if (selectedModel && modelSelect.querySelector(`option[value="${CSS.escape(selectedModel)}"]`)) {
    modelSelect.value = selectedModel;
  }

  syncGlobalReasoningSelect();
}

/**
 * Load models from all providers that have an API key
 */
async function loadAllModels(preserveSelection = true) {
  const configuredProviders = providers.filter(p => p.endpoint && p.apiKey);
  if (configuredProviders.length === 0) {
    updateModelStatus('Please configure at least one provider with endpoint and API key', 'error');
    return;
  }

  const currentModel = preserveSelection ? modelSelect.value : '';

  loadModelsBtn.disabled = true;
  loadModelsBtn.classList.add('loading');
  updateModelStatus('Loading model list...', 'loading');

  const { cachedModels: existing, cachedModelMeta: existingMeta } = await browserAPI.storage.local.get([
    'cachedModels',
    'cachedModelMeta'
  ]);
  const fetchedModels = existing || {};
  const fetchedMeta = existingMeta || {};
  const results = [];

  for (const provider of configuredProviders) {
    try {
      const { models, meta } = await fetchModels(provider);
      fetchedModels[provider.id] = models;
      fetchedMeta[provider.id] = meta || {};
      results.push(`${provider.name}: ${models.length} models`);
    } catch (error) {
      console.error(`Failed to fetch models from ${provider.name}:`, error);
      results.push(`${provider.name}: failed (${error.message})`);
    }
  }

  cachedModels = fetchedModels;
  cachedModelMeta = fetchedMeta;
  await browserAPI.storage.local.set({
    cachedModels: fetchedModels,
    cachedModelMeta: fetchedMeta
  });
  populateModelSelect(fetchedModels, currentModel || savedModel || defaultSettings.model);
  renderProfiles();
  updateModelStatus(`Loaded: ${results.join(', ')}`, 'success');

  loadModelsBtn.disabled = false;
  loadModelsBtn.classList.remove('loading');
}

let savedModel = '';

/**
 * Migrate old settings if needed
 */
async function migrateIfNeeded(stored) {
  let result = { ...stored };

  // Migrate old endpoint/apiKey format to providers array
  if (result.endpoint && !result.providers) {
    const providerMigration = {
      providers: [
        {
          id: 'migrated',
          name: 'My API',
          endpoint: result.endpoint,
          apiKey: result.apiKey || ''
        }
      ],
      activeProviderId: 'migrated'
    };
    await browserAPI.storage.local.set(providerMigration);
    await browserAPI.storage.local.remove(['endpoint', 'apiKey']);
    Object.assign(result, providerMigration);
    delete result.endpoint;
    delete result.apiKey;
  }

  // Migrate old defaultPrompt to promptProfiles
  if (result.defaultPrompt && !result.promptProfiles) {
    const profileMigration = {
      promptProfiles: [
        {
          id: 'profile-migrated',
          name: 'Default',
          prompt: result.defaultPrompt
        }
      ],
      activeProfileId: 'profile-migrated'
    };
    await browserAPI.storage.local.set(profileMigration);
    await browserAPI.storage.local.remove(['defaultPrompt']);
    Object.assign(result, profileMigration);
    delete result.defaultPrompt;
  }

  return result;
}

/**
 * Load settings from storage
 */
async function loadSettings() {
  try {
    const stored = await browserAPI.storage.local.get(null);
    const settings = await migrateIfNeeded({ ...defaultSettings, ...stored });

    providers = settings.providers || defaultSettings.providers;
    activeProviderId = settings.activeProviderId || defaultSettings.activeProviderId;

    promptProfiles = settings.promptProfiles || defaultSettings.promptProfiles;
    activeProfileId = settings.activeProfileId || defaultSettings.activeProfileId;
    currentProfileShortcuts = settings.profileShortcuts || {};

    // Load cached models before rendering profiles (for model dropdowns in profile details)
    const storedCache = await browserAPI.storage.local.get(['cachedModels', 'cachedModelMeta']);
    cachedModels = storedCache.cachedModels || {};
    cachedModelMeta = storedCache.cachedModelMeta || {};

    renderProviders();
    renderProfiles(); // also calls renderShortcutSlots()

    themeSelect.value = settings.theme;
    fontSizeSelect.value = settings.fontSize;
    displayModeSelect.value = settings.displayMode === 'popup' ? 'popup' : 'sidebar';
    applyTheme(settings.theme);

    savedModel = settings.model;
    savedReasoningEffort = settings.reasoningEffort || '';
    reasoningSelect.value = savedReasoningEffort;

    // Auto-load models from all configured providers
    const configuredProviders = providers.filter(p => p.endpoint && p.apiKey);
    if (configuredProviders.length > 0) {
      await loadAllModels();
    } else if (Object.keys(cachedModels).length > 0) {
      populateModelSelect(cachedModels, savedModel || defaultSettings.model);
    }
  } catch (error) {
    console.error('Failed to load settings:', error);
    showStatus('Failed to load settings', true);
  }
}

/**
 * Save settings to storage
 */
async function saveSettings(e) {
  e.preventDefault();

  const profileShortcuts = {};
  SHORTCUT_SLOTS.forEach(({ key }, i) => {
    profileShortcuts[key] = document.getElementById(`shortcut-slot-${i + 1}`).value;
  });

  const settings = {
    providers,
    activeProviderId,
    promptProfiles,
    activeProfileId,
    profileShortcuts,
    model: document.getElementById('model').value,
    reasoningEffort: reasoningSelect.value,
    theme: themeSelect.value,
    fontSize: fontSizeSelect.value,
    displayMode: displayModeSelect.value === 'popup' ? 'popup' : 'sidebar'
  };

  try {
    await browserAPI.storage.local.set(settings);
    savedModel = settings.model;
    savedReasoningEffort = settings.reasoningEffort;
    showStatus('Settings saved successfully!');
  } catch (error) {
    console.error('Failed to save settings:', error);
    showStatus('Failed to save settings', true);
  }
}

/**
 * Reset settings to defaults
 */
async function resetSettings() {
  if (!confirm('Are you sure you want to reset all settings to defaults?')) {
    return;
  }

  try {
    await browserAPI.storage.local.clear();
    await browserAPI.storage.local.set(defaultSettings);
    await loadSettings();
    showStatus('Settings reset to defaults');
  } catch (error) {
    console.error('Failed to reset settings:', error);
    showStatus('Failed to reset settings', true);
  }
}

// Event listeners
form.addEventListener('submit', saveSettings);
resetBtn.addEventListener('click', resetSettings);
loadModelsBtn.addEventListener('click', () => loadAllModels());
modelSelect.addEventListener('change', () => {
  syncGlobalReasoningSelect();
});
themeSelect.addEventListener('change', () => applyTheme(themeSelect.value));

addProviderBtn.addEventListener('click', () => addProvider());
document.querySelectorAll('.btn-preset').forEach(btn => {
  btn.addEventListener('click', () => addProvider(btn.dataset.preset));
});

addProfileBtn.addEventListener('click', () => addProfile());

if (browserAPI.theme?.onUpdated) {
  browserAPI.theme.onUpdated.addListener(() => {
    if (themeSelect.value === 'system') {
      applyTheme('system');
    }
  });
}

document.addEventListener('DOMContentLoaded', loadSettings);
