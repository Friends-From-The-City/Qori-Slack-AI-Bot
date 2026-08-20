/**
 * Accessibility Implementation Foundation — WS-0
 *
 * Technical baseline for WCAG 2.2 AA / Section 508 compliance.
 * No screens built yet — this defines the contract, primitives, and
 * guidance that Workspace UI implementation must follow.
 *
 * Design system must support:
 * - USWDS-compatible accessibility behavior
 * - Modern Qori visual design
 * - Agency-specific token mapping
 */

// ─── Accessibility Contract ────────────────────────────────────────

export const ACCESSIBILITY_TARGET = 'WCAG 2.2 AA' as const;
export const SECTION_508_ALIGNMENT = true;

// ─── ARIA Live Region Announcements ────────────────────────────────

export type AriaLiveRegion = 'polite' | 'assertive' | 'off';

export interface AccessibilityAnnouncement {
  message: string;
  priority: AriaLiveRegion;
}

/**
 * Announcement types for screen-reader users.
 * Components emit these; the workspace shell routes them to a live region.
 */
export const announcements = {
  /** Navigation completed */
  pageLoaded: (title: string): AccessibilityAnnouncement => ({
    message: `Page loaded: ${title}`,
    priority: 'polite',
  }),
  /** Form submission result */
  formResult: (success: boolean, message: string): AccessibilityAnnouncement => ({
    message: success ? `Success: ${message}` : `Error: ${message}`,
    priority: 'assertive',
  }),
  /** Data loading state */
  loadingState: (resource: string, loading: boolean): AccessibilityAnnouncement => ({
    message: loading ? `Loading ${resource}...` : `${resource} loaded`,
    priority: 'polite',
  }),
  /** Error notification */
  error: (message: string): AccessibilityAnnouncement => ({
    message: `Error: ${message}`,
    priority: 'assertive',
  }),
} as const;

// ─── Focus Management Contract ─────────────────────────────────────

/**
 * Focus management rules for Workspace components.
 * Keyboard-first interaction support.
 */
export interface FocusManagementContract {
  /** On page navigation, focus moves to main content heading */
  onPageNavigate: 'main-heading';
  /** On modal open, focus moves to first focusable element */
  onModalOpen: 'first-focusable';
  /** On modal close, focus returns to trigger element */
  onModalClose: 'trigger-element';
  /** On drawer open, focus moves to drawer heading */
  onDrawerOpen: 'drawer-heading';
  /** On drawer close, focus returns to trigger */
  onDrawerClose: 'trigger-element';
  /** On error, focus moves to first error message */
  onError: 'first-error';
  /** On toast/notification, do NOT move focus (use aria-live) */
  onNotification: 'no-focus-change';
}

// ─── Semantic Component Primitives ─────────────────────────────────

/**
 * Semantic HTML requirements for component primitives.
 * These are the building blocks for the Workspace design system.
 */
export interface SemanticPrimitiveContract {
  /** Buttons use <button> (not <div onClick>) */
  button: { element: 'button'; requiredAttrs: ['type'] };
  /** Links use <a> with href (not <span onClick>) */
  link: { element: 'a'; requiredAttrs: ['href'] };
  /** Form inputs have associated <label> elements */
  input: { element: 'input'; requiredAttrs: ['id']; associatedLabel: true };
  /** Data tables use <table> with <caption> and <th scope> */
  dataTable: { element: 'table'; requiredChildren: ['caption', 'thead', 'tbody'] };
  /** Navigation uses <nav> with aria-label */
  navigation: { element: 'nav'; requiredAttrs: ['aria-label'] };
  /** Main content uses <main> landmark */
  mainContent: { element: 'main'; singleInstance: true };
  /** Headings follow h1→h2→h3 hierarchy (no skips) */
  headings: { hierarchical: true; maxSkip: 0 };
}

// ─── Reduced Motion Support ────────────────────────────────────────

/**
 * CSS media query contract for reduced-motion preference.
 * All animations and transitions must respect prefers-reduced-motion.
 */
export const REDUCED_MOTION_MEDIA_QUERY = '@media (prefers-reduced-motion: reduce)' as const;

/**
 * Reduced-motion behavior:
 * - Disable all non-essential animations
 * - Reduce transition durations to 0ms
 * - Preserve layout-critical transforms (e.g., dropdown positioning)
 * - Never auto-play video or animated content
 */

// ─── Color Independence ────────────────────────────────────────────

/**
 * Color-independent state indicators.
 * Every state change conveyed by color must also have a non-color indicator.
 */
export interface ColorIndependentStates {
  /** Error: red color + icon + text label */
  error: { color: true; icon: true; textLabel: true };
  /** Warning: amber color + icon + text label */
  warning: { color: true; icon: true; textLabel: true };
  /** Success: green color + icon + text label */
  success: { color: true; icon: true; textLabel: true };
  /** Status (active/inactive): color + text label + pattern/shape */
  status: { color: true; textLabel: true; patternOrShape: true };
  /** Required field: color + asterisk + screen reader text */
  required: { color: true; asterisk: true; srText: true };
}

// ─── Accessible Forms Contract ─────────────────────────────────────

/**
 * Form accessibility requirements.
 */
export interface AccessibleFormContract {
  /** Every input has a visible, associated <label> */
  visibleLabels: true;
  /** Required fields marked with aria-required and visual indicator */
  requiredIndicator: 'aria-required' | 'visual-plus-sr';
  /** Error messages associated via aria-describedby */
  errorAssociation: 'aria-describedby';
  /** Form-level error summary at top, linked to individual errors */
  errorSummary: true;
  /** Inline validation messages appear on blur, not keystroke */
  validationTiming: 'blur';
  /** Submit button clearly labeled with action */
  submitLabel: 'descriptive-action';
}

// ─── Accessible Dialog Contract ────────────────────────────────────

/**
 * Dialog/drawer accessibility requirements.
 */
export interface AccessibleDialogContract {
  /** role="dialog" with aria-labelledby pointing to heading */
  role: 'dialog';
  ariaLabelledby: 'dialog-heading';
  /** Focus trap within dialog while open */
  focusTrap: true;
  /** Escape key closes dialog */
  escapeClose: true;
  /** Close button has accessible label */
  closeButtonLabel: true;
  /** Background content has aria-hidden="true" */
  backgroundHidden: true;
}

// ─── Data Table / Chart Guidance ───────────────────────────────────

/**
 * Accessible data presentation guidance for tables and charts.
 */
export interface DataPresentationGuidance {
  tables: {
    /** Use <caption> for table title */
    caption: true;
    /** Use <th scope="col|row"> for headers */
    scopedHeaders: true;
    /** Complex tables use aria-describedby for instructions */
    complexDescription: true;
    /** Sortable columns announce sort state */
    sortAnnouncement: true;
    /** Pagination announces result count and range */
    paginationAnnouncement: true;
  };
  charts: {
    /** Every chart has a text summary alternative */
    textAlternative: true;
    /** Data table fallback for screen readers */
    dataTableFallback: true;
    /** Color-blind safe palette */
    colorBlindSafe: true;
    /** High contrast mode support */
    highContrastSupport: true;
  };
}

// ─── USWDS Design Token Compatibility ──────────────────────────────

/**
 * Design tokens that map to USWDS principles.
 * The visual design is Qori's own — tokens provide USWDS-compatible
 * accessibility behavior without forcing stock USWDS appearance.
 */
export interface DesignTokenContract {
  /** Focus indicator: visible, high-contrast, 2px+ outline offset */
  focusIndicator: {
    style: 'outline';
    width: '2px';
    offset: '2px';
    contrastRatio: '3:1-minimum';
  };
  /** Touch target: minimum 44x44px (WCAG 2.2 Target Size) */
  touchTarget: {
    minimumSize: '44px';
  };
  /** Text contrast: 4.5:1 for normal text, 3:1 for large text */
  textContrast: {
    normalText: '4.5:1';
    largeText: '3:1';
    uiComponents: '3:1';
  };
  /** Spacing scale compatible with USWDS spacing units */
  spacingScale: 'uswds-compatible';
  /** Typography scale: minimum 16px base, 1.5 line height for body */
  typography: {
    baseSize: '16px';
    bodyLineHeight: '1.5';
    headingLineHeight: '1.3';
  };
}

// ─── Keyboard Interaction Patterns ─────────────────────────────────

/**
 * Standard keyboard patterns following WAI-ARIA Authoring Practices.
 */
export const keyboardPatterns = {
  /** Tab: move to next focusable element */
  tab: 'next-focusable',
  /** Shift+Tab: move to previous focusable element */
  shiftTab: 'previous-focusable',
  /** Enter/Space: activate button/link */
  enterSpace: 'activate',
  /** Escape: close modal/drawer, cancel operation */
  escape: 'close-cancel',
  /** Arrow keys: navigate within composite widgets (menus, tabs, tree) */
  arrows: 'widget-navigation',
  /** Home/End: jump to first/last item in list/menu */
  homeEnd: 'first-last',
} as const;
