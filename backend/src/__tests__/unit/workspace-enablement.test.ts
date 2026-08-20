/**
 * WS-0: Workspace Enablement Foundation — Unit Tests
 *
 * Tests for middleware, services, and contracts that don't require a database.
 */

// ─── Accessibility contract ────────────────────────────────────────

describe('Accessibility foundation', () => {
  it('exports accessibility contract constants', () => {
    const { ACCESSIBILITY_TARGET, SECTION_508_ALIGNMENT, announcements, keyboardPatterns } = require('../../accessibility/index');
    expect(ACCESSIBILITY_TARGET).toBe('WCAG 2.2 AA');
    expect(SECTION_508_ALIGNMENT).toBe(true);
    expect(announcements).toBeTruthy();
    expect(keyboardPatterns).toBeTruthy();
  });

  it('announcements produce valid messages', () => {
    const { announcements } = require('../../accessibility/index');
    const pageMsg = announcements.pageLoaded('Dashboard');
    expect(pageMsg.message).toContain('Dashboard');
    expect(pageMsg.priority).toBe('polite');

    const errorMsg = announcements.error('Something broke');
    expect(errorMsg.priority).toBe('assertive');
  });
});

// ─── Synthetic environment ────────────────────────────────────────

describe('Synthetic environment', () => {
  it('exports deterministic fixture constants', () => {
    const { SYNTHETIC } = require('../fixtures/synthetic-environment');
    expect(SYNTHETIC.org.slug).toBe('demo-agency');
    expect(SYNTHETIC.actors.researcher1.displayName).toBe('Alex Rivera');
    expect(SYNTHETIC.projects.active.slug).toBe('claims-redesign');
    expect(SYNTHETIC.branding.displayName).toBe('Demo Agency Research Portal');
  });

  it('no real PII in fixture data', () => {
    const { SYNTHETIC } = require('../fixtures/synthetic-environment');
    const json = JSON.stringify(SYNTHETIC);
    // No real emails, phone numbers, or SSNs
    expect(json).not.toMatch(/@.*\.(gov|com|org)/);
    expect(json).not.toMatch(/\d{3}-\d{2}-\d{4}/);
  });
});

// ─── Logo validation constants ────────────────────────────────────

describe('Logo validation', () => {
  it('defines correct allowed content types', () => {
    const { ALLOWED_LOGO_CONTENT_TYPES, MAX_LOGO_SIZE_BYTES } = require('../../database/models/organization_branding');
    expect(ALLOWED_LOGO_CONTENT_TYPES).toContain('image/png');
    expect(ALLOWED_LOGO_CONTENT_TYPES).toContain('image/jpeg');
    expect(ALLOWED_LOGO_CONTENT_TYPES).toContain('image/svg+xml');
    expect(ALLOWED_LOGO_CONTENT_TYPES).toContain('image/webp');
    expect(ALLOWED_LOGO_CONTENT_TYPES).not.toContain('application/javascript');
    expect(MAX_LOGO_SIZE_BYTES).toBe(2 * 1024 * 1024);
  });
});

// ─── Session adapter ──────────────────────────────────────────────

describe('Session adapter', () => {
  it('returns null when no session data', async () => {
    const { sessionAdapter } = require('../../middleware/auth/sessionAdapter');
    const result = await sessionAdapter.extractIdentity({ session: {} });
    expect(result).toBeNull();
  });

  it('returns identity when session has actorPublicId', async () => {
    const { sessionAdapter } = require('../../middleware/auth/sessionAdapter');
    const result = await sessionAdapter.extractIdentity({
      session: { actorPublicId: 'test-uuid' },
    });
    expect(result).toBeTruthy();
    expect(result.provider).toBe('session');
    expect(result.providerSubject).toBe('test-uuid');
  });
});
