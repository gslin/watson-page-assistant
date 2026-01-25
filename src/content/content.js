/**
 * Content script for extracting page content using Readability
 */

const browserAPI = typeof browser !== 'undefined' ? browser : chrome;

/**
 * Extract readable content from the current page
 * @returns {Object|null} Extracted content or null if extraction fails
 */
function extractContent() {
  try {
    // Clone the document to avoid modifying the original
    const documentClone = document.cloneNode(true);

    // Check if Readability is available
    if (typeof Readability === 'undefined') {
      console.error('Readability is not loaded');
      return null;
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
  } catch (error) {
    console.error('Error extracting content:', error);
    return null;
  }
}

// Listen for messages from sidebar/background
browserAPI.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'EXTRACT_CONTENT') {
    const content = extractContent();
    sendResponse({ success: !!content, data: content });
    return true; // Keep the message channel open for async response
  }
});

// Log that content script is loaded
console.log('Watson Page Assistant content script loaded');
