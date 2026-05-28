/**
 * folderStructure.ts — Canonical folder structure per Phase 1 spec
 *
 * This is the SINGLE SOURCE OF TRUTH for folder paths in the project/study hierarchy.
 * YAML templates' output_options.path values MUST align with these constants.
 * Pattern enforcement tests verify alignment.
 *
 * Phase B-0.5: Replaces the opaque config/templates/ folder copy mechanism
 * with explicit, testable structure definitions.
 *
 * Reference: docs/project-restructure-phase1-spec.md lines 37-81
 */

// ─── Project-level folders ───────────────────────────────────────────
// Relative to project root: {team}/{project-slug}/

export const PROJECT_FOLDERS = {
  /** Discovery artifacts (desk research, stakeholder synthesis, surveys) */
  DISCOVERY: '00-discovery',
  /** Cascade variables for project-scoped discovery */
  DISCOVERY_VARIABLES: '00-discovery/.variables',
} as const;

// ─── Study-level folders ─────────────────────────────────────────────
// Relative to study root: {team}/{project-slug}/{study-slug}/

export const STUDY_FOLDERS = {
  /** Research brief */
  BRIEF: '01-brief',
  /** Research plan and discussion guide */
  PLAN: '02-plan',
  /** Fieldwork: participant tracking, sessions, transcripts, outreach */
  FIELDWORK: '03-fieldwork',
  /** Session recordings and notes */
  FIELDWORK_SESSIONS: '03-fieldwork/sessions',
  /** Uploaded and coded transcripts */
  FIELDWORK_TRANSCRIPTS: '03-fieldwork/transcripts',
  /** Participant outreach messages */
  FIELDWORK_OUTREACH: '03-fieldwork/outreach',
  /** Synthesis: affinity mapping, personas, JTBD, design opportunities */
  SYNTHESIS: '04-synthesis',
  /** Research readouts and stakeholder briefs */
  READOUTS: '05-readouts',
  /** Generated GitHub issues */
  TICKETS: '06-tickets',
  /** Cascade variables for study-scoped artifacts */
  VARIABLES: '.variables',
} as const;

// ─── Scaffolded content files ────────────────────────────────────────
// Files written by scaffoldProject / scaffoldStudy at creation time.
// Content templates live in qori-studies/_content/

export const SCAFFOLDED_CONTENT = {
  /** Project README documenting folder structure */
  PROJECT_README: 'README.md',
  /** Study README documenting cascade status */
  STUDY_README: 'README.md',
  /** Observer guidelines for fieldwork sessions */
  OBSERVER_GUIDELINES: '03-fieldwork/observer-guidelines.md',
  /** Expanded observer guide with role-specific instructions */
  OBSERVER_GUIDE_EXPANDED: '03-fieldwork/observer-guide-expanded.md',
} as const;

// ─── Content template filenames ──────────────────────────────────────
// Names of template files in qori-studies/_content/

export const CONTENT_TEMPLATES = {
  PROJECT_README: 'project-readme-template.md',
  STUDY_README: 'study-readme-template.md',
  OBSERVER_GUIDELINES: 'observer-guidelines.md',
  OBSERVER_GUIDE_EXPANDED: 'observer-guide-expanded.md',
} as const;

// ─── Type exports ────────────────────────────────────────────────────

export type ProjectFolder = typeof PROJECT_FOLDERS[keyof typeof PROJECT_FOLDERS];
export type StudyFolder = typeof STUDY_FOLDERS[keyof typeof STUDY_FOLDERS];
export type ScaffoldedFile = typeof SCAFFOLDED_CONTENT[keyof typeof SCAFFOLDED_CONTENT];
export type ContentTemplate = typeof CONTENT_TEMPLATES[keyof typeof CONTENT_TEMPLATES];

// ─── Validation helpers ──────────────────────────────────────────────

/** All valid project-level folder paths */
export const ALL_PROJECT_FOLDERS = Object.values(PROJECT_FOLDERS);

/** All valid study-level folder paths */
export const ALL_STUDY_FOLDERS = Object.values(STUDY_FOLDERS);

/** All valid folder paths (project + study) */
export const ALL_FOLDERS = [...ALL_PROJECT_FOLDERS, ...ALL_STUDY_FOLDERS];
