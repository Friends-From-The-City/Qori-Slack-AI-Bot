/**
 * Trusted Proxy Configuration Tests — PLAT-3
 *
 * Verifies:
 * - Default is disabled (false)
 * - Spoofed X-Forwarded-For NOT trusted without explicit config
 * - Explicit config enables trust
 * - Invalid values fall back to false
 */

import { parseTrustedProxy } from '../../middleware/trustedProxy';

describe('parseTrustedProxy', () => {
  it('returns false when env var is undefined', () => {
    expect(parseTrustedProxy(undefined)).toBe(false);
  });

  it('returns false when env var is empty string', () => {
    expect(parseTrustedProxy('')).toBe(false);
  });

  it('returns false when env var is "false"', () => {
    expect(parseTrustedProxy('false')).toBe(false);
  });

  it('returns true when env var is "true"', () => {
    expect(parseTrustedProxy('true')).toBe(true);
  });

  it('returns numeric 1 when env var is "1"', () => {
    expect(parseTrustedProxy('1')).toBe(1);
  });

  it('returns numeric 2 when env var is "2"', () => {
    expect(parseTrustedProxy('2')).toBe(2);
  });

  it('returns the string for a valid CIDR', () => {
    expect(parseTrustedProxy('10.0.0.0/8')).toBe('10.0.0.0/8');
  });

  it('returns the string for "loopback"', () => {
    expect(parseTrustedProxy('loopback')).toBe('loopback');
  });

  it('returns the string for "linklocal"', () => {
    expect(parseTrustedProxy('linklocal')).toBe('linklocal');
  });

  it('returns array for comma-separated valid IPs', () => {
    const result = parseTrustedProxy('10.0.0.1,10.0.0.2');
    expect(result).toEqual(['10.0.0.1', '10.0.0.2']);
  });

  it('returns false with warning for invalid value', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation();
    expect(parseTrustedProxy('not-a-valid-value')).toBe(false);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('TRUSTED_PROXY has unrecognized value'),
    );
    warn.mockRestore();
  });

  it('returns false with warning for invalid comma-separated values', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation();
    expect(parseTrustedProxy('10.0.0.1,invalid-entry')).toBe(false);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('invalid entries'),
    );
    warn.mockRestore();
  });

  it('returns false for "0"', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation();
    expect(parseTrustedProxy('0')).toBe(false);
    warn.mockRestore();
  });

  it('returns false for negative numbers', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation();
    expect(parseTrustedProxy('-1')).toBe(false);
    warn.mockRestore();
  });
});
