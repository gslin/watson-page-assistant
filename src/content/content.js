/**
 * Content script for extracting page content using Readability
 */

const browserAPI = typeof browser !== 'undefined' ? browser : chrome;

/**
 * Extract readable content from the current page
 * @returns {Object|null} Extracted content or null if extraction fails
 */
function extractContent() {
  const documentClone = document.cloneNode(true);

  if (typeof Readability === 'undefined') {
    throw new Error('Readability library is not loaded');
  }

  const reader = new Readability(documentClone);
  const article = reader.parse();

  if (!article) {
    // Fallback: return basic page info if Readability fails
    return {
      title: document.title,
      content: document.body?.innerText?.substring(0, 50000) || '',
      textContent: document.body?.innerText?.substring(0, 50000) || '',
      excerpt: '',
      byline: '',
      siteName: window.location.hostname,
      url: window.location.href
    };
  }

  return {
    title: article.title || document.title,
    content: article.content || '',
    textContent: article.textContent || '',
    excerpt: article.excerpt || '',
    byline: article.byline || '',
    siteName: article.siteName || window.location.hostname,
    url: window.location.href
  };
}

// Listen for messages from sidebar/background
browserAPI.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'EXTRACT_CONTENT') {
    try {
      const content = extractContent();
      sendResponse({ success: true, data: content });
    } catch (error) {
      console.error('Error extracting content:', error);
      sendResponse({ success: false, data: null, error: error.message });
    }
    return true; // Keep the message channel open for async response
  }
});

// Log that content script is loaded
console.log('Watson Page Assistant content script loaded');
