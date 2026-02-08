/**
 * Background/Service Worker for Watson Page Assistant
 * Handles cross-browser differences for sidebar/side panel
 */

const browserAPI = typeof browser !== 'undefined' ? browser : chrome;
const isFirefox = typeof browser !== 'undefined';

/**
 * Initialize the extension
 */
async function init() {
  if (!isFirefox && chrome.sidePanel) {
    // Chrome: Disable global side panel, use per-tab mode
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false });
  }
}

// Initialize on install/update
browserAPI.runtime.onInstalled.addListener(init);

// Chrome: Handle keyboard shortcut command
if (!isFirefox && chrome.commands) {
  chrome.commands.onCommand.addListener(async (command) => {
    if (command === 'open-sidebar') {
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab?.id) {
          await chrome.sidePanel.open({ tabId: tab.id });
        }
      } catch (error) {
        console.error('Failed to open side panel:', error);
      }
    }
  });
}

// Firefox: Handle action (toolbar icon) click to open preferences
if (isFirefox) {
  browserAPI.action.onClicked.addListener(() => {
    browserAPI.runtime.openOptionsPage();
  });
}

// Chrome: Handle action (toolbar icon) click to open preferences
if (!isFirefox && chrome.action) {
  chrome.action.onClicked.addListener(() => {
    chrome.runtime.openOptionsPage();
  });
}

// Handle messages between sidebar and content scripts
browserAPI.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'GET_ACTIVE_TAB') {
    // Get the current active tab
    browserAPI.tabs.query({ active: true, currentWindow: true })
      .then(([tab]) => {
        sendResponse({ tabId: tab?.id, url: tab?.url });
      })
      .catch((error) => {
        console.error('Failed to get active tab:', error);
        sendResponse({ error: error.message });
      });
    return true; // Keep message channel open for async response
  }

  if (message.type === 'FORWARD_TO_TAB') {
    // Forward a message to a specific tab's content script
    const { tabId, payload } = message;
    browserAPI.tabs.sendMessage(tabId, payload)
      .then((response) => {
        sendResponse(response);
      })
      .catch((error) => {
        console.error('Failed to forward message to tab:', error);
        sendResponse({ error: error.message });
      });
    return true;
  }
});

// Log that service worker is loaded
console.log('Watson Page Assistant service worker loaded');
