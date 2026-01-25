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
  endpoint: 'https://api.openai.com/v1/chat/completions',
  apiKey: '',
  defaultPrompt: 'You are a helpful assistant that analyzes web page content. Please summarize the key points of the following article.',
  model: 'gpt-4o-mini'
};

/**
 * Get settings with defaults
 * @returns {Promise<Object>}
 */
export async function getSettings() {
  const stored = await storage.get(Object.keys(defaultSettings));
  return { ...defaultSettings, ...stored };
}

/**
 * Save settings
 * @param {Object} settings
 * @returns {Promise<void>}
 */
export async function saveSettings(settings) {
  return storage.set(settings);
}
