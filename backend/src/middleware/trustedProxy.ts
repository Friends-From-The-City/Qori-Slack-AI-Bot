/**
 * Trusted proxy configuration.
 *
 * Parses TRUSTED_PROXY environment variable into a value safe for
 * Express app.set('trust proxy', ...).
 *
 * Default: false (disabled). Agency must explicitly configure.
 *
 * Supported values:
 *   unset / "" / "false"   → false (disabled)
 *   "true"                 → true (trust all proxies)
 *   "1", "2", etc.         → number (hop count)
 *   IP/CIDR string         → string (e.g., "10.0.0.0/8")
 *   comma-separated IPs    → string[] (e.g., "10.0.0.1,10.0.0.2")
 *   invalid                → false + warning
 */

const CIDR_PATTERN = /^(\d{1,3}\.){3}\d{1,3}(\/\d{1,2})?$/;
const IPV6_PATTERN = /^[0-9a-fA-F]*:[0-9a-fA-F:]+$/;

export function parseTrustedProxy(raw: string | undefined): boolean | number | string | string[] {
  if (raw === undefined || raw === '' || raw === 'false') {
    return false;
  }

  if (raw === 'true') {
    return true;
  }

  // Numeric hop count
  const num = Number(raw);
  if (Number.isFinite(num) && num > 0 && Number.isInteger(num)) {
    return num;
  }

  // Comma-separated list of IPs/CIDRs
  if (raw.includes(',')) {
    const parts = raw.split(',').map(s => s.trim()).filter(Boolean);
    const allValid = parts.every(p => CIDR_PATTERN.test(p) || IPV6_PATTERN.test(p) || p === 'loopback' || p === 'linklocal' || p === 'uniquelocal');
    if (allValid && parts.length > 0) {
      return parts;
    }
    console.warn(
      `[CONFIG] TRUSTED_PROXY contains invalid entries in comma-separated list. ` +
      `Falling back to disabled. Value: "${raw.substring(0, 100)}"`,
    );
    return false;
  }

  // Single IP/CIDR or Express named value
  if (
    CIDR_PATTERN.test(raw) ||
    IPV6_PATTERN.test(raw) ||
    raw === 'loopback' ||
    raw === 'linklocal' ||
    raw === 'uniquelocal'
  ) {
    return raw;
  }

  console.warn(
    `[CONFIG] TRUSTED_PROXY has unrecognized value. ` +
    `Falling back to disabled. Value: "${raw.substring(0, 100)}"`,
  );
  return false;
}
