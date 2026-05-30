// config/sentry.js
//
// Sentry v8 configuration with PII scrubbing.
// CRITICAL: Federal data-handling requires scrubbing participant data
// before sending to third-party error services.

const Sentry = require('@sentry/node');

const { NODE_ENV, SENTRY_DSN } = process.env;

// ═══════════════════════════════════════════════════════════════════════════
// PII SCRUBBING CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════
//
// What gets scrubbed:
// 1. Participant identifiers (PT-XXX, P-XXX, P01, participant IDs)
// 2. Names (participant names, researcher names in error context)
// 3. Nugget content / verbatim quotes (text, quote, verbatim fields)
// 4. Variable store payloads (cascade variables that may contain PII)
// 5. Session content (transcripts, notes, summaries)
//
// Scrubbing approach: Deep recursive traversal of error data. Sensitive
// fields are redacted with [REDACTED_*] markers that indicate what was
// stripped without exposing the content.

// Fields that contain PII and should be fully redacted
const PII_FIELDS = new Set([
  // Participant identifiers
  'participant_id',
  'participantId',
  'participant',
  'participant_name',
  'participantName',
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
  // Name fields
  'name',
  'real_name',
  'display_name',
  'researcher_name',
  'lead_researcher',
  'observer_name',
  // Variable store
  'variables',
  'cascade_variables',
  'variable_payload',
  'value', // variable value field
]);

// Patterns to detect and redact in string values
const PII_PATTERNS = [
  // Participant IDs: PT-001, P-12, P01, PT12
  { pattern: /\bP[T]?[-_]?\d{1,4}\b/gi, replacement: '[REDACTED_PARTICIPANT_ID]' },
  // Email addresses
  { pattern: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, replacement: '[REDACTED_EMAIL]' },
  // Phone numbers (US format)
  { pattern: /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g, replacement: '[REDACTED_PHONE]' },
  // Names that look like "John Smith" or "Dr. Smith" (basic heuristic)
  { pattern: /\b(?:Dr\.|Mr\.|Ms\.|Mrs\.)\s+[A-Z][a-z]+\b/g, replacement: '[REDACTED_NAME]' },
];

/**
 * Recursively scrub PII from an object or value.
 * @param {any} data - The data to scrub
 * @param {Set<any>} visited - Set of already-visited objects (cycle prevention)
 * @param {number} depth - Current recursion depth
 * @returns {any} - Scrubbed data
 */
function scrubPII(data, visited = new Set(), depth = 0) {
  // Prevent infinite recursion
  if (depth > 50) return '[TRUNCATED_DEEP_NESTING]';

  // Handle primitives
  if (data === null || data === undefined) return data;

  if (typeof data === 'string') {
    let scrubbed = data;
    for (const { pattern, replacement } of PII_PATTERNS) {
      scrubbed = scrubbed.replace(pattern, replacement);
    }
    // Truncate very long strings (likely content/transcript dumps)
    if (scrubbed.length > 500) {
      return scrubbed.substring(0, 200) + '[TRUNCATED_LONG_STRING]';
    }
    return scrubbed;
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
    return data.map((item) => scrubPII(item, visited, depth + 1));
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
      scrubbed[key] = scrubPII(value, visited, depth + 1);
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
    // Scrub exception values (error messages)
    if (event.exception?.values) {
      event.exception.values = event.exception.values.map((ex) => ({
        ...ex,
        value: typeof ex.value === 'string' ? scrubPII(ex.value) : ex.value,
        // Scrub stack trace local variables if present
        stacktrace: ex.stacktrace
          ? {
              ...ex.stacktrace,
              frames: ex.stacktrace.frames?.map((frame) => ({
                ...frame,
                vars: frame.vars ? scrubPII(frame.vars) : frame.vars,
              })),
            }
          : ex.stacktrace,
      }));
    }

    // Scrub extra context
    if (event.extra) {
      event.extra = scrubPII(event.extra);
    }

    // Scrub contexts
    if (event.contexts) {
      event.contexts = scrubPII(event.contexts);
    }

    // Scrub tags (shouldn't contain PII, but defense in depth)
    if (event.tags) {
      event.tags = scrubPII(event.tags);
    }

    // Scrub breadcrumbs
    if (event.breadcrumbs) {
      event.breadcrumbs = event.breadcrumbs.map((crumb) => ({
        ...crumb,
        message: typeof crumb.message === 'string' ? scrubPII(crumb.message) : crumb.message,
        data: crumb.data ? scrubPII(crumb.data) : crumb.data,
      }));
    }

    // Scrub request body if present
    if (event.request?.data) {
      event.request.data = scrubPII(event.request.data);
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

  Sentry.init({
    dsn: SENTRY_DSN,
    environment: NODE_ENV,

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

  console.log(`Sentry: Initialized for ${NODE_ENV} environment with PII scrubbing`);
}

module.exports = {
  initSentry,
  scrubPII,
  beforeSend,
  PII_FIELDS,
  PII_PATTERNS,
};
