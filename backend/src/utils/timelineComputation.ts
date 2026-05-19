/**
 * timelineComputation.ts — Shared timeline phase computation
 *
 * Extracted from planHandler.ts for reuse by briefHandler.ts (ADR 0005).
 * Both plan and brief render timeline phases mechanically via Handlebars
 * rather than letting the LLM compute dates.
 */

import { addDays, format, parseISO, isValid } from 'date-fns';

// ─── Types ──────────────────────────────────────────────────────

export type TimelinePreference = 'standard' | 'accelerated' | 'extended';

export interface PhaseDurations {
  planning: number;
  recruitment: number;
  fieldwork: number;
  analysis: number;
  reporting: number;
}

export interface TimelinePhase {
  phase: string;
  dates: string;
  duration: string;
}

// ─── Constants ──────────────────────────────────────────────────

export const PHASE_DURATIONS: Record<TimelinePreference, PhaseDurations> = {
  standard:    { planning: 3, recruitment: 7, fieldwork: 5, analysis: 1, reporting: 1 },
  accelerated: { planning: 2, recruitment: 4, fieldwork: 3, analysis: 1, reporting: 1 },
  extended:    { planning: 7, recruitment: 14, fieldwork: 10, analysis: 3, reporting: 2 },
};

/** Human-readable duration labels for each timeline preference. */
export const TIMELINE_DISPLAY_LABELS: Record<TimelinePreference, string> = {
  standard: '6 weeks',
  accelerated: '4 weeks',
  extended: '8 weeks',
};

// ─── Functions ──────────────────────────────────────────────────

/**
 * Build timeline phases with calculated dates.
 * Returns an array of { phase, dates, duration } objects for Handlebars iteration.
 */
export function buildTimelinePhases(startDateStr: string, timelinePref: string): TimelinePhase[] {
  const durations = PHASE_DURATIONS[timelinePref as TimelinePreference] || PHASE_DURATIONS.standard;

  let cursor: Date;
  if (startDateStr) {
    const parsed = parseISO(startDateStr);
    cursor = isValid(parsed) ? parsed : addDays(new Date(), 7);
  } else {
    cursor = addDays(new Date(), 7);
  }

  const phases = [
    { name: 'Planning and stakeholder alignment', days: durations.planning },
    { name: 'Recruitment', days: durations.recruitment },
    { name: 'Fieldwork (sessions)', days: durations.fieldwork },
    { name: 'Analysis', days: durations.analysis },
    { name: 'Reporting', days: durations.reporting },
  ];

  return phases.map(p => {
    const phaseStart = new Date(cursor);
    const phaseEnd = addDays(phaseStart, p.days - 1);
    const result: TimelinePhase = {
      phase: p.name,
      dates: `${format(phaseStart, 'MMM d')} – ${format(phaseEnd, 'MMM d, yyyy')}`,
      duration: `${p.days} day${p.days > 1 ? 's' : ''}`,
    };
    cursor = addDays(phaseEnd, 1);
    return result;
  });
}

/**
 * Compute a human-readable timeline summary from the phases array.
 */
export function buildTimelineSummary(timelinePhases: TimelinePhase[]): string {
  if (!timelinePhases || timelinePhases.length === 0) return 'TBD';

  const totalDays = timelinePhases.reduce((sum, p) => {
    const match = p.duration.match(/(\d+)/);
    return sum + (match ? parseInt(match[1], 10) : 0);
  }, 0);

  if (totalDays === 0) return 'TBD';

  const startPart = timelinePhases[0].dates.split('–')[0].trim();
  const lastDates = timelinePhases[timelinePhases.length - 1].dates;
  const yearMatch = lastDates.match(/\d{4}/);
  const year = yearMatch ? yearMatch[0] : '';
  const startLabel = startPart.match(/\d{4}/) ? startPart : `${startPart}, ${year}`;

  if (totalDays < 7) {
    return `${totalDays} day${totalDays > 1 ? 's' : ''}, starting ${startLabel}`;
  }

  const weeks = Math.ceil(totalDays / 7);
  return `${weeks} week${weeks > 1 ? 's' : ''}, starting ${startLabel}`;
}
