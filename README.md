# Watson Page Assistant

A cross-browser extension that extracts web page content using Readability.js and performs AI analysis via the OpenAI API.

## Features

- Extracts clean web page content using Readability.js
- OpenAI API streaming responses
- Supports Firefox and Chrome
- Customizable API endpoint, model, and system prompt

## Keyboard Shortcuts

- **Firefox**: `Ctrl+Y` to open Sidebar
- **Chrome**: `Ctrl+Shift+Y` to open Sidebar

## Installation

### Development Build

```bash
npm install
make build
```

### Testing on Firefox

1. Open `about:debugging#/runtime/this-firefox`
2. Click "Load Temporary Add-on"
3. Select `dist/firefox/manifest.json`

### Testing on Chrome

1. Open `chrome://extensions/`
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select the `dist/chrome` directory

## Configuration

Click the extension options page to configure:

- **API Endpoint**: OpenAI-compatible API endpoint
- **API Key**: Your API key
- **Model**: Select model (gpt-4o, gpt-4o-mini, etc.)
- **Default Prompt**: System prompt

## Usage

1. Open any web page
2. Use the keyboard shortcut or click the toolbar icon to open the sidebar
3. Click "Extract Page" to extract page content
4. Enter your question and submit, the AI will respond in real-time

## Directory Structure

```
watson-page-assistant/
├── src/
│   ├── common/           # Shared modules
│   ├── background/       # Service Worker
│   ├── sidebar/          # Sidebar UI
│   ├── options/          # Options page
│   └── content/          # Content Script
├── manifests/
│   ├── firefox/
│   └── chrome/
├── icons/
├── dist/                 # Build output
└── scripts/              # Build scripts
```

## License

MIT
