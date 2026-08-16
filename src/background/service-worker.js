/**
 * Background/Service Worker for Watson Page Assistant
 * Handles cross-browser differences for sidebar/side panel and popup window
 */

const browserAPI = typeof browser !== 'undefined' ? browser : chrome;
const isFirefox = typeof browser !== 'undefined';

const POPUP_PATH = 'popup/popup.html';
const POPUP_WIDTH = 420;
const POPUP_HEIGHT = 640;
const PROFILE_COMMANDS = ['open-profile-1', 'open-profile-2', 'open-profile-3', 'open-profile-4'];

let assistantWindowId = null;
let assistantTabId = null;
let assistantSourceTab = null;

function getPopupUrl() {
  return browserAPI.runtime.getURL(POPUP_PATH);
}

function isAssistantUrl(url) {
  return typeof url === 'string' && url.startsWith(getPopupUrl());
}

function isPageTab(tab) {
  if (!tab?.id) return false;
  const url = tab.url || '';
  if (!url || isAssistantUrl(url)) return false;
  if (
    url.startsWith('about:') ||
    url.startsWith('moz-extension:') ||
    url.startsWith('chrome:') ||
    url.startsWith('chrome-extension:') ||
    url.startsWith('edge:')
  ) {
    return false;
  }
  return true;
}

/**
 * Read the configured display mode (sidebar | popup)
 */
async function getDisplayMode() {
  const { displayMode } = await browserAPI.storage.local.get('displayMode');
  return displayMode === 'popup' ? 'popup' : 'sidebar';
}

/**
 * Toolbar title follows display mode.
 * Always clear action.default_popup so onClicked fires (standalone window, not dropdown).
 */
async function applyDisplayMode() {
  const mode = await getDisplayMode();
  try {
    if (browserAPI.action?.setPopup) {
      await browserAPI.action.setPopup({ popup: '' });
    }
    if (browserAPI.action?.setTitle) {
      await browserAPI.action.setTitle({
        title: mode === 'popup'
          ? 'Watson Page Assistant'
          : 'Watson Page Assistant Settings'
      });
    }
  } catch (error) {
    console.error('Failed to apply display mode:', error);
  }
}

/**
 * Capture the page tab the user was on before the assistant takes focus
 */
async function captureSourceTab() {
  const fallback = await queryActivePageTab();
  if (fallback?.tabId) {
    assistantSourceTab = fallback;
  }
  return assistantSourceTab;
}

/**
 * Active web page tab — never the assistant itself (window or tab)
 */
async function queryActivePageTab() {
  try {
    const windows = await browserAPI.windows.getAll({
      populate: true,
      windowTypes: ['normal']
    });
    const ordered = [
      ...windows.filter((win) => win.focused),
      ...windows.filter((win) => !win.focused)
    ];

    for (const win of ordered) {
      const tabs = win.tabs || [];
      const active = tabs.find((tab) => tab.active);
      if (isPageTab(active)) {
        return { tabId: active.id, url: active.url };
      }

      const others = tabs
        .filter((tab) => isPageTab(tab))
        .sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0));
      if (others[0]) {
        return { tabId: others[0].id, url: others[0].url };
      }
    }
  } catch (error) {
    console.error('Failed to query page tab:', error);
  }

  return { error: 'Could not get active tab' };
}

function rememberAssistantTab(tab) {
  if (!tab) return;
  assistantTabId = tab.id ?? null;
  assistantWindowId = tab.windowId ?? null;
}

/**
 * Reuse an already-open assistant window or tab if possible
 */
async function findExistingAssistant() {
  if (assistantTabId != null) {
    try {
      const tab = await browserAPI.tabs.get(assistantTabId);
      if (tab?.id) {
        rememberAssistantTab(tab);
        return tab;
      }
    } catch {
      assistantTabId = null;
      assistantWindowId = null;
    }
  }

  try {
    const tabs = await browserAPI.tabs.query({});
    const found = tabs.find((tab) => isAssistantUrl(tab.url) || isAssistantUrl(tab.pendingUrl));
    if (found) {
      rememberAssistantTab(found);
      return found;
    }
  } catch (error) {
    console.error('Failed to find assistant:', error);
  }

  return null;
}

async function focusAssistant(tab) {
  if (tab?.id) {
    await browserAPI.tabs.update(tab.id, { active: true });
  }
  const windowId = tab?.windowId ?? assistantWindowId;
  if (windowId != null && browserAPI.windows?.update) {
    await browserAPI.windows.update(windowId, { focused: true });
  }
}

function buildWindowFeatures(position) {
  const features = [
    `width=${POPUP_WIDTH}`,
    `height=${POPUP_HEIGHT}`,
    'resizable=yes',
    'scrollbars=yes'
  ];
  if (Number.isFinite(position?.left)) features.push(`left=${position.left}`);
  if (Number.isFinite(position?.top)) features.push(`top=${position.top}`);
  return features.join(',');
}

/**
 * Ask the page to window.open(). That is a content browsing context, so Firefox
 * runs ProvideWindow and honors browser.link.open_newwindow.restriction.
 * Background window.open / windows.create are chrome-privileged and always
 * create a real window.
 */
async function openViaPageWindow(url, position) {
  const tabId = assistantSourceTab?.tabId;
  if (!tabId) return false;

  try {
    const response = await browserAPI.tabs.sendMessage(tabId, {
      type: 'OPEN_ASSISTANT',
      url,
      name: 'watson-assistant',
      features: buildWindowFeatures(position)
    });
    return Boolean(response?.ok);
  } catch (error) {
    console.error('Failed to open assistant from page:', error);
    return false;
  }
}

async function openAssistantTab(url) {
  const createProps = { url, active: true };
  const openerTabId = assistantSourceTab?.tabId;
  if (openerTabId) {
    try {
      const opener = await browserAPI.tabs.get(openerTabId);
      if (opener.windowId != null) createProps.windowId = opener.windowId;
      if (typeof opener.index === 'number') createProps.index = opener.index + 1;
    } catch {
      // Source tab may have gone away
    }
  }

  const tab = await browserAPI.tabs.create(createProps);
  rememberAssistantTab(tab);
}

async function getPopupPosition() {
  try {
    const current = await browserAPI.windows.getLastFocused({ windowTypes: ['normal'] });
    if (!current) return {};
    const position = {};
    if (Number.isFinite(current.left) && Number.isFinite(current.width)) {
      position.left = current.left + current.width - POPUP_WIDTH - 32;
    }
    if (Number.isFinite(current.top)) {
      position.top = current.top + 72;
    }
    if (typeof current.incognito === 'boolean') {
      position.incognito = current.incognito;
    }
    return position;
  } catch (error) {
    console.error('Failed to position assistant window:', error);
    return {};
  }
}

async function waitAndRememberAssistant() {
  for (let i = 0; i < 20; i++) {
    const found = await findExistingAssistant();
    if (found) return found;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return null;
}

async function createAssistantPopupWindow(url, position) {
  const createOptions = {
    url,
    type: 'popup',
    width: POPUP_WIDTH,
    height: POPUP_HEIGHT,
    focused: true
  };
  if (Number.isFinite(position.left)) createOptions.left = position.left;
  if (Number.isFinite(position.top)) createOptions.top = position.top;
  if (typeof position.incognito === 'boolean') {
    createOptions.incognito = position.incognito;
  }

  let win;
  try {
    win = await browserAPI.windows.create(createOptions);
  } catch (error) {
    if (createOptions.incognito) {
      delete createOptions.incognito;
      win = await browserAPI.windows.create(createOptions);
    } else {
      throw error;
    }
  }

  assistantWindowId = win?.id ?? null;
  const tab = win?.tabs?.[0];
  if (tab?.id) assistantTabId = tab.id;
}

/**
 * Open (or focus) the assistant as a popup window or tab
 */
async function openAssistantWindow() {
  const existing = await findExistingAssistant();
  if (existing) {
    await focusAssistant(existing);
    return;
  }

  await captureSourceTab();
  const url = getPopupUrl();
  const position = await getPopupPosition();

  if (isFirefox) {
    // Content-context window.open respects restriction=0 → tab.
    // If the page blocks popups, open a tab instead of forcing a window.
    if (await openViaPageWindow(url, position)) {
      await waitAndRememberAssistant();
      return;
    }
    await openAssistantTab(url);
    return;
  }

  await createAssistantPopupWindow(url, position);
}

/**
 * Open the assistant in the configured display mode
 */
async function openAssistant() {
  await applyDisplayMode();
  const mode = await getDisplayMode();

  if (mode === 'popup') {
    try {
      await openAssistantWindow();
      return;
    } catch (error) {
      console.error('Failed to open popup window, falling back to sidebar:', error);
    }
  }

  try {
    if (!isFirefox && chrome.sidePanel) {
      const [tab] = await chrome.tabs.query({
        active: true,
        lastFocusedWindow: true,
        windowType: 'normal'
      });
      if (tab?.id) await chrome.sidePanel.open({ tabId: tab.id });
    } else if (isFirefox && browser.sidebarAction) {
      if (typeof browser.sidebarAction.toggle === 'function') {
        await browser.sidebarAction.toggle();
      } else {
        await browser.sidebarAction.open();
      }
    }
  } catch (error) {
    console.error('Failed to open sidebar:', error);
  }
}

/**
 * Initialize the extension
 */
async function init() {
  if (!isFirefox && chrome.sidePanel) {
    // Chrome: Disable global side panel, use per-tab mode
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false });
  }
  await applyDisplayMode();
}

init();

// Initialize on install/update
browserAPI.runtime.onInstalled.addListener(init);

if (browserAPI.storage?.onChanged) {
  browserAPI.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'local' && changes.displayMode) {
      applyDisplayMode();
    }
  });
}

if (browserAPI.windows?.onRemoved) {
  browserAPI.windows.onRemoved.addListener((windowId) => {
    if (windowId === assistantWindowId) {
      assistantWindowId = null;
      assistantTabId = null;
    }
  });
}

if (browserAPI.tabs?.onRemoved) {
  browserAPI.tabs.onRemoved.addListener((tabId) => {
    if (tabId === assistantTabId) {
      assistantTabId = null;
      assistantWindowId = null;
    }
  });
}

// Handle keyboard shortcut commands (works for both Chrome and Firefox)
if (browserAPI.commands?.onCommand) {
  browserAPI.commands.onCommand.addListener(async (command) => {
    const isProfileCommand = PROFILE_COMMANDS.includes(command);
    const isOpenCommand = command === 'open-sidebar' || isProfileCommand;

    if (!isOpenCommand) return;

    // For profile commands: look up which profile is assigned to this slot
    if (isProfileCommand) {
      const { profileShortcuts } = await browserAPI.storage.local.get('profileShortcuts');
      const profileId = (profileShortcuts || {})[command];
      if (profileId) {
        await browserAPI.storage.local.set({ pendingProfileId: profileId });
      }
    }

    await openAssistant();
  });
}

// Toolbar icon: popup mode opens the assistant window; sidebar mode opens settings
if (browserAPI.action?.onClicked) {
  browserAPI.action.onClicked.addListener(async () => {
    const mode = await getDisplayMode();
    if (mode === 'popup') {
      try {
        await openAssistantWindow();
      } catch (error) {
        console.error('Failed to open popup window:', error);
      }
      return;
    }
    browserAPI.runtime.openOptionsPage();
  });
}

// Handle messages between sidebar/popup and content scripts
browserAPI.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'GET_ACTIVE_TAB') {
    const fromPopup = typeof sender.url === 'string' && sender.url.includes('/popup/popup.html');

    (async () => {
      if (fromPopup && assistantSourceTab?.tabId) {
        try {
          const tab = await browserAPI.tabs.get(assistantSourceTab.tabId);
          if (tab?.id) {
            sendResponse({ tabId: tab.id, url: tab.url });
            return;
          }
        } catch {
          assistantSourceTab = null;
        }
      }

      sendResponse(await queryActivePageTab());
    })().catch((error) => {
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
