/**
 * Cross-browser storage wrapper
 * Works with both Firefox (browser.*) and Chrome (chrome.*)
 */

const browserAPI = typeof browser !== 'undefined' ? browser : chrome;

export const storage = {
  /**
   * Get values from local storage
   * @param {string|string[]|null} keys - Keys to retrieve, or null for all
   * @returns {Promise<Object>}
   */
  async get(keys) {
    return browserAPI.storage.local.get(keys);
  },

  /**
   * Set values in local storage
   * @param {Object} items - Key-value pairs to store
   * @returns {Promise<void>}
   */
  async set(items) {
    return browserAPI.storage.local.set(items);
  },

  /**
   * Remove values from local storage
   * @param {string|string[]} keys - Keys to remove
   * @returns {Promise<void>}
   */
  async remove(keys) {
    return browserAPI.storage.local.remove(keys);
  },

  /**
   * Clear all local storage
   * @returns {Promise<void>}
   */
  async clear() {
    return browserAPI.storage.local.clear();
  }
};

/**
 * Default settings
 */
export const defaultSettings = {
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
  model: 'gpt-4o-mini',
  displayMode: 'sidebar'
};

/**
 * Migrate old settings format (endpoint/apiKey at top level) to new providers format
 */
async function migrateSettings(stored) {
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
    // Write new format and remove old keys
    await storage.set(migrated);
    await storage.remove(['endpoint', 'apiKey']);
    return { ...stored, ...migrated, endpoint: undefined, apiKey: undefined };
  }
  return stored;
}

/**
 * Get the active provider from settings
 */
export function getActiveProvider(settings) {
  const providers = settings.providers || defaultSettings.providers;
  const activeId = settings.activeProviderId || defaultSettings.activeProviderId;
  return providers.find(p => p.id === activeId) || providers[0];
}

/**
 * Get settings with defaults
 * @returns {Promise<Object>}
 */
export async function getSettings() {
  const stored = await storage.get(null);
  const migrated = await migrateSettings(stored);
  const result = { ...defaultSettings };
  for (const key of Object.keys(defaultSettings)) {
    if (migrated[key] !== undefined) {
      result[key] = migrated[key];
    }
  }
  // Preserve extra keys like model, theme, fontSize, etc.
  for (const key of Object.keys(migrated)) {
    if (migrated[key] !== undefined) {
      result[key] = migrated[key];
    }
  }
  return result;
}

/**
 * Save settings
 * @param {Object} settings
 * @returns {Promise<void>}
 */
export async function saveSettings(settings) {
  return storage.set(settings);
}
