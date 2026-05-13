/**
 * Shared types used across multiple domains.
 *
 * Types here are referenced by cascade, model, handler, and template-processor
 * types. A type belongs here when it's used in more than one place and benefits
 * from a single definition.
 */

// ---------------------------------------------------------------------------
// Branded ID types
// ---------------------------------------------------------------------------

/**
 * Branded type helper. Prevents accidentally passing a raw number where
 * a specific ID is expected (e.g., passing a participant ID where a study ID
 * is required). The __brand property exists only at the type level.
 */
type Brand<T, B extends string> = T & { readonly __brand: B };

/** Auto-increment integer ID for a research study (research_studies.id). */
export type StudyId = Brand<number, 'StudyId'>;

/** Auto-increment integer ID for a study participant (study_participants.id). */
export type ParticipantId = Brand<number, 'ParticipantId'>;

/** Slack user ID string (e.g., "U0123ABCDEF"). */
export type SlackUserId = Brand<string, 'SlackUserId'>;

// ---------------------------------------------------------------------------
// Participant status (re-exported from constants for type use)
// ---------------------------------------------------------------------------

/**
 * Re-export ParticipantStatus from the constants module.
 * The canonical values live in constants/participantStatus.ts (ADR 0002).
 * Import from there for runtime values; import from here for type-only use.
 */
export type { ParticipantStatus } from '../constants/participantStatus';

// ---------------------------------------------------------------------------
// Cascade variable ID patterns
// ---------------------------------------------------------------------------

/**
 * Participant identifier used in cascade variables (e.g., "PT-001", "PT-002").
 * This is the human-readable participant ID used in session summaries and
 * cascade data, NOT the database auto-increment ID.
 */
export type CascadeParticipantId = string;

/**
 * Discovery artifact synthetic study_id pattern used in study_variables.
 * Format: "discovery:{team}:{type}" (e.g., "discovery:friends-lab:desk-research").
 */
export type DiscoveryStudyId = `discovery:${string}:${string}`;

// ---------------------------------------------------------------------------
// Outreach method
// ---------------------------------------------------------------------------

/** Valid outreach methods for participant contact. */
export type OutreachMethod = 'email' | 'slack' | 'phone' | 'other';

// ---------------------------------------------------------------------------
// Study status
// ---------------------------------------------------------------------------

/** Status values for study approval workflow. */
export type StudyApprovalStatus = 'approve' | 'rejected' | 'need_changes' | 'created';

// ---------------------------------------------------------------------------
// Session observer types
// ---------------------------------------------------------------------------

/** Roles an observer can hold in a research session. */
export type ObserverRole =
  | 'note_taker'
  | 'silent_observer'
  | 'pm_observer'
  | 'stakeholder'
  | 'observer';

/** Status of an observer request. */
export type ObserverStatus = 'pending' | 'approved' | 'denied' | 'removed' | 'confirmed';

/** How the observer was added to the session. */
export type ObserverJoinedVia = 'researcher_add' | 'channel_cta' | 'request';
