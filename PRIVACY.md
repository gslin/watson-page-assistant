# Privacy Policy

Last updated: 2026-10-05

Watson Page Assistant ("the extension") is a browser extension for Chrome and Firefox that lets you ask an AI model about the web page you are viewing. This policy describes what data the extension handles and where it goes.

## Summary

- The developer does not run any server for this extension and does not receive, collect, or store your data.
- Page content and your questions are sent only to the AI API endpoint that you configure, and only after you open the assistant.
- Settings, including API keys, are stored locally in your browser.
- The extension contains no analytics, tracking, or advertising.

## Data the extension handles

### Website content

When you open the assistant (toolbar icon or keyboard shortcut), the extension reads the title, URL, and main text of the current tab. The main text is extracted locally with Readability.js. The extension does not read pages you have not opened the assistant on.

### Your questions and AI responses

The questions you type and the AI responses are kept in memory only while the assistant is open. They are discarded when you close the assistant or click the clear button, and are never written to disk.

### Settings and API keys

The following settings are stored in the browser's local extension storage (`storage.local`), which is not synced across devices:

- AI provider names, API endpoints, and API keys
- Selected model, reasoning effort, and a cached list of available models
- Prompt profiles and keyboard shortcut mappings
- Display mode, theme, and font size

## Where data is sent

The extension sends data only to the AI provider endpoints you configure on the options page:

- **Chat requests**: the page title, URL, and extracted text, the prompt of the selected profile, your questions and the conversation so far, and your API key (as an authentication header) are sent to the provider's chat completions endpoint. By default, the selected prompt is sent automatically when the assistant opens; you can turn this off per prompt profile.
- **Model list requests**: your API key is sent to the provider's models endpoint when the extension loads the list of available models.

The provider you choose (for example OpenAI, Anthropic, Google, or OpenRouter) processes this data under its own terms and privacy policy. Please review them before use. If you configure a local endpoint such as `http://localhost:8080`, the data does not leave your machine.

No data is sent to the developer or to any other party.

## Data sharing

The developer does not sell, transfer, or share user data. User data is not used for advertising, for determining creditworthiness or lending, or for any purpose unrelated to the extension's single purpose described above.

## Permissions

- `activeTab`: access the current tab after you open the assistant.
- `storage`: store the settings listed above locally.
- `sidePanel` (Chrome only): show the assistant next to the page.
- Content script on all URLs: extract the readable content of the current page when the assistant requests it. It does not modify pages or send data on its own.

## Your choices

- Use the "Reset to Defaults" button on the options page to delete all stored settings, including API keys.
- Uninstalling the extension removes all locally stored data.
- Close the assistant or click the clear button to discard the conversation.

## Changes to this policy

Changes to this policy are published in this file. The revision history is available in the [GitHub repository](https://github.com/gslin/watson-page-assistant/commits/main/PRIVACY.md).

## Contact

For questions about this policy, please open an issue at <https://github.com/gslin/watson-page-assistant/issues>.
