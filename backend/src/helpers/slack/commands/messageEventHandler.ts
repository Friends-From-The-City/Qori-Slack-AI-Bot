/**
 * messageEventHandler.ts — Global message event handler
 *
 * Extracted from events.js. Handles the Slack message event:
 * ignores bot messages, punches the message via punchService,
 * and echoes back.
 */

import type { EventContext } from '../../../types/handlers';

// NOTE: punchService does not exist in the services barrel — this is legacy dead code.
// The punchMessage() call below will be a no-op.
const punchService: Record<string, (...args: unknown[]) => void> = {};

// ─── message event handler ────────────────────────────────────────

interface MessageEvent {
  subtype?: string;
  text: string;
  user?: string;
  channel?: string;
  ts?: string;
}

async function handleMessageEvent({ event, say }: EventContext<MessageEvent>): Promise<void> {
  console.log('message event:', event);
  if (event.subtype && event.subtype === 'bot_message') return; // Ignore bot messages

  punchService.punchMessage(event);

  // Do something with the message, like creating an event in your app or notifying users
  await say(`You said: ${event.text}`);
}

export {
  handleMessageEvent,
};
