/**
 * Reasoning effort options for OpenAI-compatible chat completions.
 *
 * Values follow each platform's documented Chat Completions parameter.
 * When a models list includes per-model metadata, that wins over the
 * hostname catalog.
 */

function getHostname(endpoint) {
  try {
    return new URL(endpoint).hostname;
  } catch {
    return '';
  }
}

function modelId(value) {
  return (value || '').toLowerCase();
}

const OPENAI_VALUES = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'];
const GEMINI_VALUES = ['none', 'minimal', 'low', 'medium', 'high'];
const XAI_VALUES = ['none', 'low', 'medium', 'high', 'xhigh'];
const GROQ_VALUES = ['none', 'default', 'low', 'medium', 'high'];
const CEREBRAS_VALUES = ['none', 'low', 'medium', 'high'];
const MISTRAL_VALUES = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh'];
const OPENROUTER_VALUES = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'];
const PERPLEXITY_VALUES = ['minimal', 'low', 'medium', 'high'];
const ANTHROPIC_VALUES = ['low', 'medium', 'high', 'xhigh', 'max'];
const LLAMACPP_VALUES = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'];

function openaiValues(id) {
  const m = modelId(id);
  if (!m) return null;
  if (m.includes('gpt-5-chat') || m.includes('gpt-4.1-chat')) return null;
  const isReasoning =
    m.includes('gpt-5') ||
    m.includes('gpt-6') ||
    m.includes('gpt-oss') ||
    /^o[1-9]/.test(m) ||
    m.includes('/o1') ||
    m.includes('/o3') ||
    m.includes('/o4');
  if (!isReasoning) return null;
  if (m.includes('gpt-6')) {
    return OPENAI_VALUES.filter((value) => value !== 'none');
  }
  return [...OPENAI_VALUES];
}

function geminiValues(id) {
  const m = modelId(id);
  if (!m.includes('gemini-2.5') && !m.includes('gemini-3')) return null;
  let values = [...GEMINI_VALUES];
  // Gemini 2.5 Pro and Gemini 3 cannot disable thinking.
  if (m.includes('gemini-3') || m.includes('gemini-2.5-pro')) {
    values = values.filter((value) => value !== 'none');
  }
  // Gemini 3.8 / 3.7 Flash and 3.1/3 Pro reject "minimal".
  if (
    m.includes('gemini-3.8') ||
    m.includes('gemini-3.7') ||
    m.includes('gemini-3.1-pro') ||
    m.includes('gemini-3-pro')
  ) {
    values = values.filter((value) => value !== 'minimal');
  }
  return values;
}

function xaiValues(id) {
  const m = modelId(id);
  if (!m.includes('grok')) return null;
  if (m.includes('grok-4.6') || m.includes('grok-4-6')) {
    return ['low', 'medium', 'high', 'xhigh'];
  }
  if (m.includes('grok-4.5') || m.includes('grok-4-5')) {
    return ['low', 'medium', 'high'];
  }
  if (m.includes('grok-4.3') || m.includes('grok-3-mini')) {
    return ['none', 'low', 'medium', 'high'];
  }
  if (m.includes('grok-4')) {
    return ['low', 'medium', 'high'];
  }
  return null;
}

function groqValues(id) {
  const m = modelId(id);
  if (m.includes('gpt-oss')) return ['low', 'medium', 'high'];
  if (m.includes('qwen3.8') || m.includes('qwen-3.8') || m.includes('qwen3-8')) {
    return [...GROQ_VALUES];
  }
  if (m.includes('qwen3') || m.includes('qwen-3')) return ['none', 'default'];
  if (m.includes('minimax')) return [...GROQ_VALUES];
  return null;
}

function cerebrasValues(id) {
  const m = modelId(id);
  if (m.includes('gpt-oss')) return ['low', 'medium', 'high'];
  if (
    m.includes('qwen-3.8') ||
    m.includes('qwen-3-8') ||
    m.includes('qwen3.8') ||
    m.includes('gemma-4') ||
    m.includes('kimi')
  ) {
    return [...CEREBRAS_VALUES];
  }
  return null;
}

function mistralValues(id) {
  const m = modelId(id);
  if (m.includes('mistral-small') || m.includes('mistral-medium')) {
    return [...MISTRAL_VALUES];
  }
  return null;
}

function anthropicValues(id) {
  const m = modelId(id);
  if (!m.includes('claude')) return null;
  // Effort is on Claude 4.5+ / Claude 5. Claude 3.x uses budget_tokens.
  if (m.includes('claude-3')) return null;
  return [...ANTHROPIC_VALUES];
}

function perplexityValues() {
  return [...PERPLEXITY_VALUES];
}

function openrouterValues(id) {
  const m = modelId(id);
  const slash = m.indexOf('/');
  if (slash === -1) return null;
  const vendor = m.slice(0, slash);
  const rest = m.slice(slash + 1);
  switch (vendor) {
    case 'openai':
      return openaiValues(rest);
    case 'google':
      return geminiValues(rest);
    case 'x-ai':
    case 'xai':
      return xaiValues(rest);
    case 'anthropic':
      return anthropicValues(rest);
    case 'mistralai':
    case 'mistral':
      return mistralValues(rest);
    case 'perplexity':
      return perplexityValues();
    case 'groq':
      return groqValues(rest);
    default:
      return null;
  }
}

function hostCatalogValues(hostname, id) {
  switch (hostname) {
    case 'api.openai.com':
      return openaiValues(id);
    case 'generativelanguage.googleapis.com':
      return geminiValues(id);
    case 'api.x.ai':
      return xaiValues(id);
    case 'api.groq.com':
      return groqValues(id);
    case 'api.cerebras.ai':
      return cerebrasValues(id);
    case 'api.mistral.ai':
      return mistralValues(id);
    case 'openrouter.ai':
      return openrouterValues(id);
    case 'api.perplexity.ai':
      return perplexityValues();
    case 'api.anthropic.com':
      return anthropicValues(id);
    default:
      if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]') {
        return [...LLAMACPP_VALUES];
      }
      return null;
  }
}

function hostDefaultValues(hostname) {
  switch (hostname) {
    case 'api.openai.com':
      return [...OPENAI_VALUES];
    case 'generativelanguage.googleapis.com':
      return [...GEMINI_VALUES];
    case 'api.x.ai':
      return [...XAI_VALUES];
    case 'api.groq.com':
      return [...GROQ_VALUES];
    case 'api.cerebras.ai':
      return [...CEREBRAS_VALUES];
    case 'api.mistral.ai':
      return [...MISTRAL_VALUES];
    case 'openrouter.ai':
      return [...OPENROUTER_VALUES];
    case 'api.perplexity.ai':
      return [...PERPLEXITY_VALUES];
    case 'api.anthropic.com':
      return [...ANTHROPIC_VALUES];
    default:
      if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]') {
        return [...LLAMACPP_VALUES];
      }
      return [...OPENROUTER_VALUES];
  }
}

/**
 * Read per-model reasoning metadata from a /models list entry.
 * @param {Object} model
 * @returns {{ values: string[]|null }|undefined}
 */
export function extractReasoningMeta(model) {
  if (!model || typeof model !== 'object') return undefined;

  if (Array.isArray(model.reasoning_efforts) && model.reasoning_efforts.length > 0) {
    return { values: model.reasoning_efforts.filter(Boolean) };
  }

  const reasoning = model.reasoning;
  if (reasoning && typeof reasoning === 'object') {
    let values;
    if (Array.isArray(reasoning.supported_efforts)) {
      values = reasoning.supported_efforts.filter((value) => value && value !== 'null');
    } else {
      // Object present: either all gateway values (null) or an unspecified list.
      values = null;
    }
    if (reasoning.mandatory && Array.isArray(values)) {
      values = values.filter((value) => value !== 'none');
    }
    return { values, mandatory: Boolean(reasoning.mandatory) };
  }

  const params = model.supported_parameters;
  if (
    Array.isArray(params) &&
    (params.includes('reasoning') || params.includes('reasoning_effort'))
  ) {
    return { values: null };
  }

  return undefined;
}

/**
 * Possible reasoning effort values for a model, or null if the UI should hide.
 * @param {string} endpoint
 * @param {string} id
 * @param {{ values: string[]|null }} [meta]
 * @returns {string[]|null}
 */
export function getReasoningOptions(endpoint, id, meta) {
  if (meta && Array.isArray(meta.values) && meta.values.length > 0) {
    return meta.values;
  }

  const hostname = getHostname(endpoint);

  if (meta && meta.values === null) {
    const values = hostDefaultValues(hostname);
    if (meta.mandatory) {
      return values.filter((value) => value !== 'none');
    }
    return values;
  }

  return hostCatalogValues(hostname, id);
}

/**
 * Add the platform-specific reasoning field to a chat completions body.
 * @param {Object} body
 * @param {string} endpoint
 * @param {string} [effort]
 * @returns {Object}
 */
export function applyReasoningEffort(body, endpoint, effort) {
  if (!effort) return body;
  if (getHostname(endpoint) === 'api.anthropic.com') {
    body.output_config = { effort };
  } else {
    body.reasoning_effort = effort;
  }
  return body;
}

/**
 * Fill a <select> with reasoning values. Hides it when unsupported.
 * @param {HTMLSelectElement} selectEl
 * @param {string[]|null} values
 * @param {string} [selected]
 * @returns {boolean} whether the control should be shown
 */
export function populateReasoningSelect(selectEl, values, selected = '') {
  if (!selectEl) return false;

  selectEl.innerHTML = '';
  const defaultOption = document.createElement('option');
  defaultOption.value = '';
  defaultOption.textContent = '(default)';
  selectEl.appendChild(defaultOption);

  if (!values || values.length === 0) {
    selectEl.value = '';
    selectEl.hidden = true;
    return false;
  }

  for (const value of values) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = value;
    selectEl.appendChild(option);
  }

  selectEl.hidden = false;
  selectEl.value = values.includes(selected) ? selected : '';
  return true;
}
