/**
 * formExtraction.ts — Shared utility for extracting values from Slack modal state
 *
 * Bolt's view.state.values is loosely typed. This utility provides type-safe
 * extraction with consistent null handling across handlers.
 *
 * D8 cleanup: Consolidates duplicated extract() helpers from:
 * - briefHandler.ts
 * - planHandler.ts
 * - discussionGuideHandler.ts
 * - runTemplateHandler.ts
 */

import type { ViewStateValue } from '@slack/bolt';

type ViewStateValues = Record<string, Record<string, ViewStateValue>>;

/**
 * Extract a single value from modal state (text input, date picker, or radio selection).
 * Returns the value string, or null if block/action doesn't exist.
 */
export function extractValue(
  values: ViewStateValues,
  blockId: string,
  actionId: string,
): string | null {
  const block = values[blockId];
  if (!block) return null;
  const action = block[actionId];
  if (!action) return null;

  // Plain text input
  if (action.value !== undefined) return action.value?.trim() || null;
  // Radio buttons / static_select — extract just the value
  if (action.selected_option !== undefined) return action.selected_option?.value || null;
  // Date picker
  if (action.selected_date !== undefined) return action.selected_date;

  return null;
}

/**
 * Extract multiple values from modal state (checkboxes, multi_select).
 * Returns array of value strings, or empty array if nothing selected.
 */
export function extractValues(
  values: ViewStateValues,
  blockId: string,
  actionId: string,
): string[] {
  const block = values[blockId];
  if (!block) return [];
  const action = block[actionId];
  if (!action) return [];

  if (action.selected_options !== undefined) {
    return action.selected_options.map((opt: { value: string }) => opt.value);
  }

  return [];
}

/**
 * Extract the full selected_option object (when you need both value and text).
 * Used by briefHandler for methodology selection where the label matters.
 */
export function extractOption(
  values: ViewStateValues,
  blockId: string,
  actionId: string,
): { value: string; text: { type: string; text: string } } | null {
  const block = values[blockId];
  if (!block) return null;
  const action = block[actionId];
  if (!action) return null;

  if (action.selected_option !== undefined) {
    return action.selected_option as { value: string; text: { type: string; text: string } } | null;
  }

  return null;
}

/**
 * Extract a user ID from users_select.
 */
export function extractUserId(
  values: ViewStateValues,
  blockId: string,
  actionId: string,
): string | null {
  const block = values[blockId];
  if (!block) return null;
  const action = block[actionId];
  if (!action) return null;

  if ((action as any).selected_user !== undefined) {
    return (action as any).selected_user || null;
  }

  return null;
}

/**
 * Flexible extract that returns string | string[] | null.
 * Backwards-compatible with planHandler's original signature.
 */
export function extract(
  values: ViewStateValues,
  blockId: string,
  actionId: string,
): string | string[] | null {
  const block = values[blockId];
  if (!block) return null;
  const action = block[actionId];
  if (!action) return null;

  if (action.value !== undefined) return action.value?.trim() || null;
  if (action.selected_option !== undefined) return action.selected_option?.value || null;
  if (action.selected_date !== undefined) return action.selected_date;
  if (action.selected_options !== undefined) {
    return action.selected_options.map((opt: { value: string }) => opt.value);
  }

  return null;
}
