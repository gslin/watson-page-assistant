/**
 * Entry point for bundling Readability
 * Exposes Readability as a global variable
 */

import { Readability } from '@mozilla/readability';

// Expose Readability globally for content scripts
window.Readability = Readability;
