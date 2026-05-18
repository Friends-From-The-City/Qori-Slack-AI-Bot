/**
 * Type helper for Slack modal views.
 *
 * Modal builder functions return plain objects whose string literal fields
 * (e.g., `type: "modal"`, `type: "plain_text"`) get widened to `string` by
 * TypeScript inference. The @slack/web-api expects the strict View union from
 * @slack/types. This helper performs a single cast so handlers stay clean.
 *
 * Slack validates the view payload at runtime — a malformed view gets an API
 * error, not silent corruption, so this cast is safe.
 */
import type { View } from '@slack/types';

/** Cast a modal-shaped object to Slack's View type for views.open/update/push. */
export function asView(modal: Record<string, unknown>): View {
  return modal as unknown as View;
}
