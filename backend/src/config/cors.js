// config/cors.js

/**
 * CORS configuration.
 *
 * Supports both single origin (CORS_ALLOWED_ORIGIN) and multiple origins
 * (CORS_ALLOWED_ORIGINS, comma-separated) for API+UI separation.
 *
 * When CORS_ALLOWED_ORIGINS is set, it takes precedence.
 * When neither is set, CORS is permissive (development default).
 */

function parseOrigins() {
  const multi = process.env.CORS_ALLOWED_ORIGINS;
  if (multi) {
    return multi.split(',').map(s => s.trim()).filter(Boolean);
  }
  return process.env.CORS_ALLOWED_ORIGIN || undefined;
}

const origins = parseOrigins();

module.exports = {
  origin: origins,
  optionsSuccessStatus: 200,
  allowedHeaders: ['Content-Type', 'Authorization', 'RefreshToken', 'X-CSRF-Token'],
  exposedHeaders: ['Content-Length', 'Content-Type', 'RefreshToken', 'Token'],
  credentials: true,
};
