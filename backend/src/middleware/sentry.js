// middleware/sentry.js
//
// Sentry v8 user context middleware.
// Sets the user on the current scope for error attribution.
// Note: Email is not set (PII concern) - only user ID for debugging.

const Sentry = require('@sentry/node');

module.exports = function (req, res, next) {
  if (req.user) {
    // Only set user ID, not email (PII scrubbing)
    Sentry.setUser({ id: req.user.id });
  }
  next();
};
