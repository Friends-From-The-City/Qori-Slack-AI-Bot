// config/sentry.js
//
// Sentry v8 configuration with PII scrubbing.
// CRITICAL: Federal data-handling requires scrubbing participant data
// before sending to third-party error services.
//
// CONVENTION: Error messages should NOT interpolate PII. Use structured
// fields for PII data, and generic messages for the error itself.
// Example: throw new Error('Extraction failed') with context = { participant_id: 'PT-007' }
// NOT: throw new Error('Extraction failed for PT-007')
// The scrubber is a BACKSTOP, not the primary defense.

const Sentry = require('@sentry/node');

const { NODE_ENV, SENTRY_DSN } = process.env;

// ═══════════════════════════════════════════════════════════════════════════
// PII SCRUBBING CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════
//
// Two-phase scrubbing:
// 1. COLLECT known PII values from structured fields (extra, contexts, etc.)
// 2. SCRUB those exact values from ALL strings (including exception messages)
// 3. REDACT the structured fields themselves
//
// This catches interpolated PII in error messages without guessing at patterns.

// Fields that contain PII and should be fully redacted
const PII_FIELDS = new Set([
  // Participant identifiers
  'participant_id',
  'participantId',
  'participant',
  'participant_name',
  'participantName',
  'participant_code',
  'respondent_key',
  // Content fields
  'text',
  'quote',
  'verbatim',
  'verbatim_quote',
  'nugget_text',
  'nugget_content',
  'content',
  'transcript',
  'session_notes',
  'session_summary',
  'raw_notes',
  'survey_response',
  'free_text',
  'message_text',
  // Name fields
  'name',
  'real_name',
  'display_name',
  'researcher_name',
  'lead_researcher',
  'observer_name',
  // Contact fields
  'email',
  'phone',
  'phone_number',
  // Variable store
  'variables',
  'cascade_variables',
  'variable_payload',
  'value', // variable value field
  // Secrets (should never appear, but fail-closed if they do)
  'token',
  'secret',
  'api_key',
  'authorization',
  'password',
]);

// Patterns to detect and redact in string values (fallback)
const PII_PATTERNS = [
  // Participant IDs: PT-001, P-12, P01, PT12
  { pattern: /\bP[T]?[-_]?\d{1,4}\b/gi, replacement: '[REDACTED_PARTICIPANT_ID]' },
  // Email addresses
  { pattern: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, replacement: '[REDACTED_EMAIL]' },
  // Slack tokens (xoxb-, xoxp-, xapp-, xoxs-) — before phone pattern so numeric
  // segments inside tokens aren't partially matched as phone numbers
  { pattern: /\b(?:xox[bpas]|xapp)-[a-zA-Z0-9-]+\b/g, replacement: '[REDACTED_TOKEN]' },
  // Bearer tokens in strings
  { pattern: /\bBearer\s+[a-zA-Z0-9._~+/=-]+/gi, replacement: 'Bearer [REDACTED_TOKEN]' },
  // Phone numbers (US format)
  { pattern: /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g, replacement: '[REDACTED_PHONE]' },
];

/**
 * Recursively collect PII values from an object.
 * Returns a Set of string values that should be scrubbed from messages.
 */
function collectPIIValues(data, collected = new Set(), visited = new Set(), depth = 0) {
  if (depth > 30 || data === null || data === undefined) return collected;

  if (typeof data === 'string') {
    // Don't collect very short strings (likely not meaningful PII)
    // or very long strings (would cause performance issues)
    if (data.length >= 3 && data.length <= 500) {
      collected.add(data);
    }
    return collected;
  }

  if (typeof data !== 'object') return collected;
  if (visited.has(data)) return collected;
  visited.add(data);

  if (Array.isArray(data)) {
    for (const item of data.slice(0, 50)) { // Limit array traversal
      collectPIIValues(item, collected, visited, depth + 1);
    }
    return collected;
  }

  for (const [key, value] of Object.entries(data)) {
    const keyLower = key.toLowerCase();
    // Only collect values from PII fields
    if (PII_FIELDS.has(key) || PII_FIELDS.has(keyLower)) {
      if (typeof value === 'string' && value.length >= 3 && value.length <= 500) {
        collected.add(value);
      } else if (typeof value === 'object' && value !== null) {
        // Recursively collect from nested PII objects
        collectPIIValues(value, collected, visited, depth + 1);
      }
    } else {
      // Still traverse non-PII fields to find nested PII
      collectPIIValues(value, collected, visited, depth + 1);
    }
  }

  return collected;
}

/**
 * Scrub known PII values from a string.
 * @param {string} text - The string to scrub
 * @param {Set<string>} knownPII - Set of known PII values to remove
 * @returns {string} - Scrubbed string
 */
function scrubKnownPIIFromString(text, knownPII) {
  if (typeof text !== 'string') return text;

  let scrubbed = text;

  // First, scrub known PII values (exact match, case-insensitive)
  for (const piiValue of knownPII) {
    if (piiValue && piiValue.length >= 3) {
      // Escape regex special characters in the PII value
      const escaped = piiValue.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(escaped, 'gi');
      scrubbed = scrubbed.replace(regex, '[REDACTED_PII]');
    }
  }

  // Then apply pattern-based scrubbing (catches PII not in structured fields)
  for (const { pattern, replacement } of PII_PATTERNS) {
    scrubbed = scrubbed.replace(pattern, replacement);
  }

  // Truncate very long strings
  if (scrubbed.length > 500) {
    return scrubbed.substring(0, 200) + '[TRUNCATED_LONG_STRING]';
  }

  return scrubbed;
}

/**
 * Recursively scrub PII from an object or value.
 * @param {any} data - The data to scrub
 * @param {Set<string>} knownPII - Set of known PII values to scrub from strings
 * @param {Set<any>} visited - Set of already-visited objects (cycle prevention)
 * @param {number} depth - Current recursion depth
 * @returns {any} - Scrubbed data
 */
function scrubPII(data, knownPII = new Set(), visited = new Set(), depth = 0) {
  // Prevent infinite recursion
  if (depth > 50) return '[TRUNCATED_DEEP_NESTING]';

  // Handle primitives
  if (data === null || data === undefined) return data;

  if (typeof data === 'string') {
    return scrubKnownPIIFromString(data, knownPII);
  }

  if (typeof data === 'number' || typeof data === 'boolean') {
    return data;
  }

  // Handle arrays
  if (Array.isArray(data)) {
    // Truncate very long arrays (likely variable dumps)
    if (data.length > 20) {
      return `[REDACTED_ARRAY: ${data.length} items]`;
    }
    return data.map((item) => scrubPII(item, knownPII, visited, depth + 1));
  }

  // Handle objects
  if (typeof data === 'object') {
    // Cycle detection
    if (visited.has(data)) return '[CIRCULAR_REF]';
    visited.add(data);

    const scrubbed = {};
    for (const [key, value] of Object.entries(data)) {
      const keyLower = key.toLowerCase();

      // Check if this field should be fully redacted
      if (PII_FIELDS.has(key) || PII_FIELDS.has(keyLower)) {
        // Indicate what was redacted without exposing content
        if (typeof value === 'string') {
          scrubbed[key] = `[REDACTED_${key.toUpperCase()}: ${value.length} chars]`;
        } else if (Array.isArray(value)) {
          scrubbed[key] = `[REDACTED_${key.toUpperCase()}: ${value.length} items]`;
        } else if (typeof value === 'object' && value !== null) {
          scrubbed[key] = `[REDACTED_${key.toUpperCase()}: object]`;
        } else {
          scrubbed[key] = '[REDACTED]';
        }
        continue;
      }

      // Recursively scrub nested values
      scrubbed[key] = scrubPII(value, knownPII, visited, depth + 1);
    }
    return scrubbed;
  }

  return data;
}

/**
 * Scrub PII from a Sentry event before sending.
 * @param {import('@sentry/node').Event} event - Sentry event
 * @returns {import('@sentry/node').Event | null} - Scrubbed event or null to drop
 */
function beforeSend(event) {
  // Debug mode: log before/after for PII verification
  // Set SENTRY_DEBUG_SCRUBBING=true to enable
  const debugScrubbing = process.env.SENTRY_DEBUG_SCRUBBING === 'true';

  if (debugScrubbing) {
    console.log('\n========== SENTRY BEFORE SCRUBBING ==========');
    console.log(JSON.stringify({
      exception_message: event.exception?.values?.[0]?.value,
      exception_stack_vars: event.exception?.values?.[0]?.stacktrace?.frames?.slice(-3).map(f => ({
        function: f.function,
        vars: f.vars
      })),
      extra: event.extra,
      contexts: event.contexts,
      tags: event.tags,
      breadcrumbs: event.breadcrumbs?.slice(-3),
      request_data: event.request?.data,
    }, null, 2));
  }

  try {
    // PHASE 1: Collect known PII values from all structured fields
    // These will be scrubbed from ALL strings, including exception messages
    const knownPII = new Set();

    if (event.extra) {
      collectPIIValues(event.extra, knownPII);
    }
    if (event.contexts) {
      collectPIIValues(event.contexts, knownPII);
    }
    if (event.tags) {
      collectPIIValues(event.tags, knownPII);
    }
    if (event.breadcrumbs) {
      for (const crumb of event.breadcrumbs) {
        if (crumb.data) collectPIIValues(crumb.data, knownPII);
      }
    }

    if (debugScrubbing && knownPII.size > 0) {
      console.log(`\n📋 Collected ${knownPII.size} PII values to scrub from messages`);
    }

    // PHASE 2: Scrub exception messages using known PII values
    if (event.exception?.values) {
      event.exception.values = event.exception.values.map((ex) => ({
        ...ex,
        value: typeof ex.value === 'string'
          ? scrubKnownPIIFromString(ex.value, knownPII)
          : ex.value,
        // Scrub stack trace local variables if present
        stacktrace: ex.stacktrace
          ? {
              ...ex.stacktrace,
              frames: ex.stacktrace.frames?.map((frame) => ({
                ...frame,
                vars: frame.vars ? scrubPII(frame.vars, knownPII) : frame.vars,
              })),
            }
          : ex.stacktrace,
      }));
    }

    // PHASE 3: Scrub structured fields (with field-level redaction)
    if (event.extra) {
      event.extra = scrubPII(event.extra, knownPII);
    }

    if (event.contexts) {
      event.contexts = scrubPII(event.contexts, knownPII);
    }

    // Scrub tags (shouldn't contain PII, but defense in depth)
    if (event.tags) {
      event.tags = scrubPII(event.tags, knownPII);
    }

    // Scrub breadcrumbs
    if (event.breadcrumbs) {
      event.breadcrumbs = event.breadcrumbs.map((crumb) => ({
        ...crumb,
        message: typeof crumb.message === 'string'
          ? scrubKnownPIIFromString(crumb.message, knownPII)
          : crumb.message,
        data: crumb.data ? scrubPII(crumb.data, knownPII) : crumb.data,
      }));
    }

    // Scrub request body if present
    if (event.request?.data) {
      event.request.data = scrubPII(event.request.data, knownPII);
    }

    if (debugScrubbing) {
      console.log('\n========== SENTRY AFTER SCRUBBING ==========');
      console.log(JSON.stringify({
        exception_message: event.exception?.values?.[0]?.value,
        exception_stack_vars: event.exception?.values?.[0]?.stacktrace?.frames?.slice(-3).map(f => ({
          function: f.function,
          vars: f.vars
        })),
        extra: event.extra,
        contexts: event.contexts,
        tags: event.tags,
        breadcrumbs: event.breadcrumbs?.slice(-3),
        request_data: event.request?.data,
      }, null, 2));
      console.log('==============================================\n');
    }

    return event;
  } catch (scrubError) {
    // If scrubbing fails, drop the event rather than risk PII leak
    console.error('Sentry PII scrubbing failed, dropping event:', scrubError);
    return null;
  }
}

/**
 * Initialize Sentry with PII-safe configuration.
 * Call this once at app startup, before other imports.
 */
function initSentry() {
  if (NODE_ENV === 'development' || !SENTRY_DSN) {
    console.log('Sentry: Disabled (development mode or no DSN)');
    return;
  }

  // Release tag ties every Sentry event to the exact deployed version.
  // QORI_RELEASE_ID is the provider-neutral variable; RAILWAY_GIT_COMMIT_SHA
  // is the legacy fallback for current Railway deployments.
  const release = process.env.QORI_RELEASE_ID || process.env.RAILWAY_GIT_COMMIT_SHA;

  Sentry.init({
    dsn: SENTRY_DSN,
    environment: NODE_ENV,
    ...(release && { release }),

    // PII scrubbing via beforeSend hook
    beforeSend,

    // Disable automatic PII collection
    sendDefaultPii: false,

    // Don't capture local variables in stack traces (can contain PII)
    includeLocalVariables: false,

    // Disable performance monitoring (out of scope for now)
    tracesSampleRate: 0,

    // Tag all events from this service
    initialScope: {
      tags: {
        service: 'qori-slack-backend',
      },
    },

    // Integrations: basic error capture only
    integrations: [
      // HTTP request tracking (without capturing bodies)
      Sentry.httpIntegration({ breadcrumbs: true }),
      // Express integration for request context
      Sentry.expressIntegration(),
    ],
  });

  console.log(`Sentry: Initialized for ${NODE_ENV} environment with PII scrubbing${release ? ` (release: ${release.substring(0, 8)})` : ' (no release tag)'}`);

}

module.exports = {
  initSentry,
  scrubPII,
  scrubKnownPIIFromString,
  collectPIIValues,
  beforeSend,
  PII_FIELDS,
  PII_PATTERNS,
};
