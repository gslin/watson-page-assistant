/**
 * Options page script
 */

const browserAPI = typeof browser !== 'undefined' ? browser : chrome;

const defaultSettings = {
  endpoint: 'https://api.openai.com/v1/chat/completions',
  apiKey: '',
  defaultPrompt: 'You are a helpful assistant that analyzes web page content. Please summarize the key points of the following article.',
  model: 'gpt-4.1-nano',
  theme: 'system'
};

const form = document.getElementById('settings-form');
const statusEl = document.getElementById('status');
const resetBtn = document.getElementById('reset-btn');
const loadModelsBtn = document.getElementById('load-models-btn');
const modelSelect = document.getElementById('model');
const modelStatusEl = document.getElementById('model-status');
const themeSelect = document.getElementById('theme');

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
 * Fetch available models from OpenAI API
 */
async function fetchModels(endpoint, apiKey) {
  // Derive models endpoint from chat/completions endpoint
  const modelsEndpoint = endpoint.replace('/chat/completions', '/models');

  const response = await fetch(modelsEndpoint, {
    headers: { 'Authorization': `Bearer ${apiKey}` }
  });

  if (!response.ok) {
    throw new Error(`API Error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  // Filter GPT-related models and sort
  return data.data
    .filter(m => m.id.includes('gpt'))
    .map(m => m.id)
    .sort();
}

/**
 * Populate model select with fetched models
 */
function populateModelSelect(models, selectedModel = '') {
  modelSelect.innerHTML = '';

  if (models.length === 0) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = '-- No available models --';
    modelSelect.appendChild(option);
    return;
  }

  models.forEach(modelId => {
    const option = document.createElement('option');
    option.value = modelId;
    option.textContent = modelId;
    modelSelect.appendChild(option);
  });

  // Select previously saved model if it exists
  if (selectedModel && models.includes(selectedModel)) {
    modelSelect.value = selectedModel;
  }
}

/**
 * Load models from API
 */
async function loadModels(preserveSelection = true) {
  const endpoint = document.getElementById('endpoint').value.trim();
  const apiKey = document.getElementById('apiKey').value.trim();

  if (!endpoint || !apiKey) {
    updateModelStatus('Please fill in API Endpoint and API Key first', 'error');
    return;
  }

  // Remember currently selected model
  const currentModel = preserveSelection ? modelSelect.value : '';

  // Show loading state
  loadModelsBtn.disabled = true;
  loadModelsBtn.classList.add('loading');
  updateModelStatus('Loading model list...', 'loading');

  try {
    const models = await fetchModels(endpoint, apiKey);
    populateModelSelect(models, currentModel || savedModel || defaultSettings.model);
    updateModelStatus(`Loaded ${models.length} models`, 'success');

    // Cache models to storage for sidebar use
    await browserAPI.storage.local.set({ cachedModels: models });
  } catch (error) {
    console.error('Failed to fetch models:', error);
    updateModelStatus(`Failed to load: ${error.message}`, 'error');
    // Keep default option
    modelSelect.innerHTML = '<option value="">-- Load failed --</option>';
  } finally {
    loadModelsBtn.disabled = false;
    loadModelsBtn.classList.remove('loading');
  }
}

// Store loaded model value for setting selection after model list loads
let savedModel = '';

/**
 * Load settings from storage
 */
async function loadSettings() {
  try {
    const stored = await browserAPI.storage.local.get(Object.keys(defaultSettings));
    const settings = { ...defaultSettings, ...stored };

    document.getElementById('endpoint').value = settings.endpoint;
    document.getElementById('apiKey').value = settings.apiKey;
    document.getElementById('defaultPrompt').value = settings.defaultPrompt;
    themeSelect.value = settings.theme;
    applyTheme(settings.theme);

    // Remember saved model setting
    savedModel = settings.model;

    // Automatically load model list if endpoint and apiKey are available
    if (settings.endpoint && settings.apiKey) {
      await loadModels();
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
    endpoint: document.getElementById('endpoint').value.trim(),
    apiKey: document.getElementById('apiKey').value.trim(),
    model: document.getElementById('model').value,
    defaultPrompt: document.getElementById('defaultPrompt').value.trim(),
    theme: themeSelect.value
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
loadModelsBtn.addEventListener('click', () => loadModels());
themeSelect.addEventListener('change', () => applyTheme(themeSelect.value));

// Listen for Firefox theme changes (for system/auto mode)
if (browserAPI.theme?.onUpdated) {
  browserAPI.theme.onUpdated.addListener(() => {
    if (themeSelect.value === 'system') {
      applyTheme('system');
    }
  });
}

// Load settings on page load
document.addEventListener('DOMContentLoaded', loadSettings);
