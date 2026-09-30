import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const backgroundSource = readFileSync(new URL('../src/background/service-worker.js', import.meta.url), 'utf8');
const flush = () => new Promise(resolve => setImmediate(resolve));

function event() {
  const listeners = [];
  return {
    listeners,
    addListener: listener => listeners.push(listener),
    emit: (...args) => Promise.all(listeners.map(listener => listener(...args)))
  };
}

function createBrowser({ firefox = true, pageOpen = true, displayMode = 'popup' } = {}) {
  const baseUrl = `${firefox ? 'moz' : 'chrome'}-extension://test/`;
  const tabs = new Map([
    [1, { id: 1, windowId: 10, index: 0, active: true, url: 'https://example.com/article' }],
    [2, { id: 2, windowId: 10, index: 1, active: false, url: 'https://example.com/article' }]
  ]);
  const stored = { displayMode, profileShortcuts: { 'open-profile-1': 'profile-a', 'open-profile-2': 'profile-b' } };
  const calls = { pageOpen: [], tabs: [], windows: [], focused: [], sidebar: [], settings: 0, errors: [] };
  // Firefox background pages keep localStorage across event page restarts; assume a previous sync.
  const localData = new Map([['displayMode', displayMode]]);
  const localStorage = { getItem: key => localData.get(key) ?? null, setItem: (key, value) => localData.set(key, String(value)) };
  // Firefox only treats the synchronous part of a shortcut handler as user input.
  let handlingUserInput = false;
  const commandEvent = event();
  const emitCommand = commandEvent.emit;
  commandEvent.emit = (...args) => {
    handlingUserInput = true;
    try {
      return emitCommand(...args);
    } finally {
      handlingUserInput = false;
    }
  };
  let nextTabId = 100;
  const addTab = props => {
    const tab = { id: nextTabId++, windowId: 10, ...structuredClone(props) };
    tabs.set(tab.id, tab);
    return tab;
  };
  const api = {
    runtime: {
      getURL: path => baseUrl + path,
      onInstalled: event(),
      onMessage: event(),
      openOptionsPage: () => calls.settings++
    },
    storage: {
      onChanged: event(),
      local: {
        get: async keys => structuredClone(keys == null ? stored : Object.fromEntries(
          (Array.isArray(keys) ? keys : [keys]).map(key => [key, stored[key]])
        )),
        set: async values => {
          const changes = Object.fromEntries(Object.entries(values).map(([key, newValue]) => [key, { newValue }]));
          Object.assign(stored, values);
          await api.storage.onChanged.emit(changes, 'local');
        },
        remove: async key => { delete stored[key]; }
      }
    },
    tabs: {
      query: async query => [...tabs.values()].filter(tab => !query.active || tab.active),
      get: async id => {
        if (!tabs.has(id)) throw new Error('Tab closed');
        return tabs.get(id);
      },
      update: async (id, props) => {
        calls.focused.push(id);
        Object.assign(tabs.get(id), props);
      },
      create: async props => {
        calls.tabs.push(structuredClone(props));
        return addTab(props);
      },
      sendMessage: async (id, message) => {
        if (message.type === 'OPEN_ASSISTANT') {
          calls.pageOpen.push({ id, ...structuredClone(message) });
          if (pageOpen === 'error') throw new Error('Content script unavailable');
          if (pageOpen) addTab({ url: message.url });
          return { ok: pageOpen };
        }
        return { success: true, data: { title: `Article ${id}`, url: tabs.get(id).url, textContent: `Content ${id}` } };
      }
    },
    windows: {
      getAll: async () => [{ id: 10, focused: true, tabs: [...tabs.values()] }],
      getLastFocused: async () => ({ id: 10, left: 0, top: 0, width: 1200, incognito: false }),
      update: async () => {},
      create: async props => {
        calls.windows.push(structuredClone(props));
        return { id: 20, tabs: [addTab({ url: props.url, windowId: 20 })] };
      }
    },
    action: { onClicked: event(), setPopup: async () => {}, setTitle: async () => {} },
    commands: { onCommand: commandEvent },
    sidebarAction: {
      toggle: async () => {
        if (!handlingUserInput) throw new Error('sidebarAction.toggle may only be called from a user input handler');
        calls.sidebar.push('toggle');
      }
    },
    sidePanel: { setPanelBehavior: () => {}, open: async props => calls.sidebar.push(props.tabId) }
  };
  function startBackground() {
    api.runtime.onMessage.listeners.length = 0;
    api.commands.onCommand.listeners.length = 0;
    api.action.onClicked.listeners.length = 0;
    vm.runInNewContext(backgroundSource, {
      [firefox ? 'browser' : 'chrome']: api,
      ...(firefox && { localStorage }),
      URL,
      setTimeout,
      console: { log: () => {}, error: (...args) => calls.errors.push(args) }
    });
  }
  function message(message, url) {
    return new Promise(resolve => api.runtime.onMessage.listeners[0](message, { url }, response => resolve(structuredClone(response))));
  }
  startBackground();
  return { api, tabs, stored, calls, baseUrl, startBackground, message };
}

for (const firefox of [true, false]) {
  test(`${firefox ? 'Firefox' : 'Chrome'} keeps assistants and source content separate`, async () => {
    const app = createBrowser({ firefox });
    await Promise.all([1, 2].map(id => app.api.action.onClicked.emit(app.tabs.get(id))));
    const assistants = [...app.tabs.values()].filter(tab => tab.id >= 100);
    assert.equal(assistants.length, 2);
    assert.equal(new Set(assistants.map(tab => tab.url)).size, 2);
    for (const tab of assistants) {
      const source = Number(new URL(tab.url).searchParams.get('sourceTabId'));
      assert.deepEqual(await app.message({ type: 'GET_ACTIVE_TAB' }, tab.url), {
        tabId: source, url: app.tabs.get(source).url
      });
      await app.api.action.onClicked.emit(app.tabs.get(source));
      assert.equal(app.calls.focused.at(-1), tab.id);
    }
    assert.equal(app.tabs.size, 4);
    if (firefox) {
      assert.equal(new Set(app.calls.pageOpen.map(call => call.name)).size, 2);
      assert.match(app.calls.pageOpen[0].features, /width=420,height=640/);
      assert.equal(app.calls.windows.length, 0);
    } else {
      assert.equal(app.calls.windows.length, 2);
      assert.ok(app.calls.windows.every(win => win.type === 'popup' && win.width === 420 && win.height === 640));
    }
    assert.deepEqual(app.calls.errors, []);
  });
}

test('rapid repeated opening reuses the same assistant, including after background restart', async () => {
  const app = createBrowser();
  await Promise.all(Array.from({ length: 3 }, () => app.api.action.onClicked.emit(app.tabs.get(1))));
  assert.equal(app.calls.pageOpen.length, 1);
  app.startBackground();
  await app.api.action.onClicked.emit(app.tabs.get(1));
  assert.equal(app.calls.pageOpen.length, 1);
  assert.equal(app.calls.focused.at(-1), 100);
  assert.equal((await app.message({ type: 'GET_ACTIVE_TAB' }, app.tabs.get(100).url)).tabId, 1);
  app.tabs.delete(100);
  await app.api.action.onClicked.emit(app.tabs.get(1));
  assert.equal(app.calls.pageOpen.length, 2);
});

for (const pageOpen of [false, 'error']) {
  test(`Firefox falls back to separate adjacent tabs when page opening returns ${pageOpen}`, async () => {
    const app = createBrowser({ pageOpen });
    await Promise.all([1, 2].map(id => app.api.action.onClicked.emit(app.tabs.get(id))));
    assert.equal(app.calls.tabs.length, 2);
    assert.ok(app.calls.tabs.every(tab => tab.active && tab.windowId === 10));
    assert.deepEqual(app.calls.tabs.map(tab => tab.index).sort(), [1, 2]);
    assert.equal(app.calls.windows.length, 0);
  });
}

test('a closed source reports an error instead of extracting another page', async () => {
  const app = createBrowser();
  await app.api.action.onClicked.emit(app.tabs.get(1));
  const assistant = app.tabs.get(100);
  app.tabs.delete(1);
  assert.deepEqual(await app.message({ type: 'GET_ACTIVE_TAB' }, assistant.url), { error: 'Source tab is no longer available' });
  await app.api.action.onClicked.emit(assistant);
  assert.equal(app.calls.focused.at(-1), assistant.id);
  assert.equal(app.calls.pageOpen.length, 1);
});

test('profile shortcuts target the source assistant even when invoked inside it', async () => {
  const app = createBrowser();
  await app.api.commands.onCommand.emit('open-profile-1', app.tabs.get(1));
  await app.api.commands.onCommand.emit('open-profile-2', app.tabs.get(2));
  assert.equal(app.stored['pendingProfileId:popup:1'], 'profile-a');
  assert.equal(app.stored['pendingProfileId:popup:2'], 'profile-b');
  assert.equal(app.stored.pendingProfileId, undefined);
  await app.api.commands.onCommand.emit('open-profile-2', app.tabs.get(100));
  assert.equal(app.stored['pendingProfileId:popup:1'], 'profile-b');
  assert.equal(app.calls.focused.at(-1), 100);
  assert.equal(app.calls.pageOpen.length, 2);
});

for (const firefox of [true, false]) {
  test(`${firefox ? 'Firefox' : 'Chrome'} sidebar mode preserves shortcuts and toolbar settings`, async () => {
    const app = createBrowser({ firefox, displayMode: 'sidebar' });
    await app.api.action.onClicked.emit(app.tabs.get(1));
    await app.api.commands.onCommand.emit('open-profile-1', app.tabs.get(1));
    assert.equal(app.calls.settings, 1);
    assert.equal(app.stored.pendingProfileId, 'profile-a');
    assert.deepEqual(app.calls.sidebar, [firefox ? 'toggle' : 1]);
    assert.equal(app.calls.pageOpen.length + app.calls.windows.length, 0);
    assert.equal((await app.message({ type: 'GET_ACTIVE_TAB' }, app.baseUrl + 'sidebar/sidebar.html')).tabId, 1);
    assert.deepEqual(app.calls.errors, []);
  });
}

test('Firefox shortcuts follow display mode changes across background restarts', async () => {
  const app = createBrowser({ displayMode: 'sidebar' });
  await app.api.storage.local.set({ displayMode: 'popup' });
  await flush();
  app.startBackground();
  await app.api.commands.onCommand.emit('open-sidebar', app.tabs.get(1));
  assert.equal(app.calls.pageOpen.length, 1);
  assert.deepEqual(app.calls.sidebar, []);
  await app.api.storage.local.set({ displayMode: 'sidebar' });
  await flush();
  app.startBackground();
  await app.api.commands.onCommand.emit('open-sidebar', app.tabs.get(1));
  assert.deepEqual(app.calls.sidebar, ['toggle']);
  assert.equal(app.calls.pageOpen.length, 1);
  assert.deepEqual(app.calls.errors, []);
});

// Minimal DOM for exercising the actual shared UI module and its storage listeners.
function element() {
  const children = [];
  return {
    children, value: '', style: {}, hidden: true,
    set innerHTML(value) { children.length = 0; },
    appendChild(child) { children.push(child); },
    addEventListener() {},
    focus() {},
    querySelector(selector) {
      const value = selector.match(/value="(.*)"/)?.[1];
      return children.find(child => value === undefined || child.value === value);
    }
  };
}

let uiId = 0;
async function loadUI(app, path) {
  const elements = new Map();
  const events = new Map();
  const url = app.baseUrl + path;
  globalThis.window = { location: new URL(url) };
  globalThis.document = {
    documentElement: { style: { setProperty() {} }, classList: { remove() {}, add() {} } },
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, element());
      return elements.get(id);
    },
    createElement: element,
    addEventListener: (name, handler) => events.set(name, handler)
  };
  globalThis.CSS = { escape: value => value };
  globalThis.browser = {
    ...app.api,
    runtime: { ...app.api.runtime, sendMessage: (message, callback) => app.message(message, url).then(callback) }
  };
  await import(`../src/sidebar/sidebar.js?test=${uiId++}`);
  return { elements, initialize: () => events.get('DOMContentLoaded')() };
}

test('popup profiles stay isolated during initialization and later shortcut changes', async t => {
  t.after(() => {
    for (const key of ['window', 'document', 'CSS', 'browser']) delete globalThis[key];
  });
  const app = createBrowser();
  Object.assign(app.stored, {
    theme: 'light',
    activeProfileId: 'profile-a',
    promptProfiles: [
      { id: 'profile-a', name: 'A', prompt: 'Prompt A', autoSubmit: false },
      { id: 'profile-b', name: 'B', prompt: 'Prompt B', autoSubmit: false }
    ]
  });
  const first = await loadUI(app, 'popup/popup.html?sourceTabId=1');
  // A shortcut arriving before the dropdown is ready must survive initialization.
  await app.api.storage.local.set({ 'pendingProfileId:popup:1': 'profile-b' });
  await first.initialize();
  await flush();
  assert.equal(first.elements.get('user-input').value, 'Prompt B');
  assert.equal(first.elements.get('page-title').textContent, 'Article 1');
  const second = await loadUI(app, 'popup/popup.html?sourceTabId=2');
  await second.initialize();
  await flush();
  assert.equal(second.elements.get('user-input').value, 'Prompt A');
  assert.equal(second.elements.get('page-title').textContent, 'Article 2');

  await app.api.storage.local.set({ 'pendingProfileId:popup:1': 'profile-a' });
  await flush();
  assert.equal(first.elements.get('user-input').value, 'Prompt A');
  assert.equal(second.elements.get('user-input').value, 'Prompt A');
  await app.api.storage.local.set({ 'pendingProfileId:popup:2': 'profile-b', pendingProfileId: 'profile-b' });
  await flush();
  assert.equal(first.elements.get('user-input').value, 'Prompt A');
  assert.equal(second.elements.get('user-input').value, 'Prompt B');
  assert.equal(app.stored.pendingProfileId, 'profile-b');

  const sidebar = await loadUI(app, 'sidebar/sidebar.html');
  await sidebar.initialize();
  await flush();
  assert.equal(sidebar.elements.get('user-input').value, 'Prompt B');
  assert.equal(app.stored.pendingProfileId, undefined);
  assert.deepEqual(app.calls.errors, []);
});
