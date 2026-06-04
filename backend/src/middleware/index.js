// middleware/index.js

const sentryMiddleware = require('./sentry');
const validate         = require('./validate');
const cache            = require('./cache');

module.exports = {
  sentryMiddleware,
  validate,
  cache,
};
