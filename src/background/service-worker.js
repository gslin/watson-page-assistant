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

const PROFILE_COMMANDS = ['open-profile-1', 'open-profile-2', 'open-profile-3', 'open-profile-4'];

// Handle keyboard shortcut commands (works for both Chrome and Firefox)
if (browserAPI.commands?.onCommand) {
  browserAPI.commands.onCommand.addListener(async (command) => {
    const isProfileCommand = PROFILE_COMMANDS.includes(command);
    const isSidebarCommand = command === 'open-sidebar' || isProfileCommand;

    if (!isSidebarCommand) return;

    // For profile commands: look up which profile is assigned to this slot
    if (isProfileCommand) {
      const { profileShortcuts } = await browserAPI.storage.local.get('profileShortcuts');
      const profileId = (profileShortcuts || {})[command];
      if (profileId) {
        await browserAPI.storage.local.set({ pendingProfileId: profileId });
      }
    }

    // Open the sidebar
    try {
      if (!isFirefox && chrome.sidePanel) {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab?.id) await chrome.sidePanel.open({ tabId: tab.id });
      } else if (isFirefox && browser.sidebarAction) {
        await browser.sidebarAction.open();
      }
    } catch (error) {
      console.error('Failed to open sidebar:', error);
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
