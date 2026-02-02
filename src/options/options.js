/**
 * Options page script
 */

const browserAPI = typeof browser !== 'undefined' ? browser : chrome;

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
  defaultPrompt: 'You are a helpful assistant that analyzes web page content. Please summarize the key points of the following article.',
  model: 'gpt-4.1-nano',
  theme: 'system',
  fontSize: 'medium',
  autoSubmitPrompt: true
};

const PRESETS = {
  openai: {
    name: 'OpenAI',
    endpoint: 'https://api.openai.com/v1/chat/completions'
  },
  mistral: {
    name: 'Mistral AI',
    endpoint: 'https://api.mistral.ai/v1/chat/completions'
  }
};

const form = document.getElementById('settings-form');
const statusEl = document.getElementById('status');
const resetBtn = document.getElementById('reset-btn');
const loadModelsBtn = document.getElementById('load-models-btn');
const modelSelect = document.getElementById('model');
const modelStatusEl = document.getElementById('model-status');
const themeSelect = document.getElementById('theme');
const fontSizeSelect = document.getElementById('fontSize');
const providerListEl = document.getElementById('provider-list');
const addProviderBtn = document.getElementById('add-provider-btn');

let providers = [];
let activeProviderId = '';

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
        <input type="text" class="provider-name-input" value="${escapeAttr(provider.name)}" placeholder="Provider name">
      </div>
      <div class="form-group">
        <label>API Endpoint</label>
        <input type="url" class="provider-endpoint-input" value="${escapeAttr(provider.endpoint)}" placeholder="https://api.openai.com/v1/chat/completions">
      </div>
      <div class="form-group">
        <label>API Key</label>
        <input type="password" class="provider-apikey-input" value="${escapeAttr(provider.apiKey)}" placeholder="sk-...">
      </div>
    `;

    // Sync edits back to providers array
    detail.querySelector('.provider-name-input').addEventListener('input', (e) => {
      provider.name = e.target.value;
      nameSpan.textContent = provider.name || '(unnamed)';
    });
    detail.querySelector('.provider-endpoint-input').addEventListener('input', (e) => {
      provider.endpoint = e.target.value;
      try {
        endpointSpan.textContent = new URL(e.target.value).hostname;
      } catch {
        endpointSpan.textContent = e.target.value;
      }
    });
    detail.querySelector('.provider-apikey-input').addEventListener('input', (e) => {
      provider.apiKey = e.target.value;
    });

    item.appendChild(header);
    item.appendChild(detail);
    providerListEl.appendChild(item);
  });
}

function escapeAttr(str) {
  return (str || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Add a new provider (optionally from preset)
 */
function addProvider(preset) {
  const config = preset ? PRESETS[preset] : { name: '', endpoint: '' };
  const newProvider = {
    id: generateId(),
    name: config.name || '',
    endpoint: config.endpoint || '',
    apiKey: ''
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

/**
 * Fetch available models from API
 */
async function fetchModels(provider) {
  const modelsEndpoint = provider.endpoint.replace('/chat/completions', '/models');

  const response = await fetch(modelsEndpoint, {
    headers: { 'Authorization': `Bearer ${provider.apiKey}` }
  });

  if (!response.ok) {
    throw new Error(`API Error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  return data.data
    .map(m => m.id)
    .sort();
}

/**
 * Parse model value to {providerId, modelId}
 */
function parseModelValue(value) {
  const idx = (value || '').indexOf('::');
  if (idx === -1) return { providerId: null, modelId: value };
  return { providerId: value.substring(0, idx), modelId: value.substring(idx + 2) };
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
    return;
  }

  if (selectedModel && modelSelect.querySelector(`option[value="${CSS.escape(selectedModel)}"]`)) {
    modelSelect.value = selectedModel;
  }
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

  const { cachedModels: existing } = await browserAPI.storage.local.get('cachedModels');
  const cachedModels = existing || {};
  const results = [];

  for (const provider of configuredProviders) {
    try {
      const models = await fetchModels(provider);
      cachedModels[provider.id] = models;
      results.push(`${provider.name}: ${models.length} models`);
    } catch (error) {
      console.error(`Failed to fetch models from ${provider.name}:`, error);
      results.push(`${provider.name}: failed (${error.message})`);
    }
  }

  await browserAPI.storage.local.set({ cachedModels });
  populateModelSelect(cachedModels, currentModel || savedModel || defaultSettings.model);
  updateModelStatus(`Loaded: ${results.join(', ')}`, 'success');

  loadModelsBtn.disabled = false;
  loadModelsBtn.classList.remove('loading');
}

let savedModel = '';

/**
 * Migrate old settings if needed
 */
async function migrateIfNeeded(stored) {
  if (stored.endpoint && !stored.providers) {
    const migrated = {
      providers: [
        {
          id: 'migrated',
          name: 'My API',
          endpoint: stored.endpoint,
          apiKey: stored.apiKey || ''
        }
      ],
      activeProviderId: 'migrated'
    };
    await browserAPI.storage.local.set(migrated);
    await browserAPI.storage.local.remove(['endpoint', 'apiKey']);
    return { ...stored, ...migrated };
  }
  return stored;
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

    renderProviders();

    document.getElementById('defaultPrompt').value = settings.defaultPrompt;
    document.getElementById('autoSubmitPrompt').checked = settings.autoSubmitPrompt;
    themeSelect.value = settings.theme;
    fontSizeSelect.value = settings.fontSize;
    applyTheme(settings.theme);

    savedModel = settings.model;

    // Auto-load models from all configured providers
    const configuredProviders = providers.filter(p => p.endpoint && p.apiKey);
    if (configuredProviders.length > 0) {
      await loadAllModels();
    } else {
      // Show cached models if available
      const { cachedModels } = await browserAPI.storage.local.get('cachedModels');
      if (cachedModels) {
        populateModelSelect(cachedModels, savedModel || defaultSettings.model);
      }
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

  const settings = {
    providers,
    activeProviderId,
    model: document.getElementById('model').value,
    defaultPrompt: document.getElementById('defaultPrompt').value.trim(),
    theme: themeSelect.value,
    fontSize: fontSizeSelect.value,
    autoSubmitPrompt: document.getElementById('autoSubmitPrompt').checked
  };

  try {
    await browserAPI.storage.local.set(settings);
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
themeSelect.addEventListener('change', () => applyTheme(themeSelect.value));

addProviderBtn.addEventListener('click', () => addProvider());
document.querySelectorAll('.btn-preset').forEach(btn => {
  btn.addEventListener('click', () => addProvider(btn.dataset.preset));
});

if (browserAPI.theme?.onUpdated) {
  browserAPI.theme.onUpdated.addListener(() => {
    if (themeSelect.value === 'system') {
      applyTheme('system');
    }
  });
}

document.addEventListener('DOMContentLoaded', loadSettings);
