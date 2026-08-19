/**
 * planCommandOpener.ts — /qori-plan slash command handler
 *
 * Extracted from events.ts inline handler. Handles the /qori-plan slash
 * command: fetches user's studies and opens the study picker modal.
 *
 * This is the COMMAND entry point (/qori-plan).
 * planModalOpener.ts is the ACTION entry point (create_research_plan button).
 */

import type { AllMiddlewareArgs, SlackCommandMiddlewareArgs } from '@slack/bolt';
import type { View } from '@slack/types';

import { getStudiesByUser } from '../../../../services/research_study.service';
import { studySetupModalPlanStudy } from '../../ui/studySetupModal';

async function planCommand({ ack, client, command }: SlackCommandMiddlewareArgs & AllMiddlewareArgs): Promise<void> {
  await ack();
  const studies = await getStudiesByUser(command.user_id);
  const modal = studySetupModalPlanStudy(studies, command.channel_id);
  await client.views.open({ trigger_id: command.trigger_id, view: modal as View });
}

export { planCommand };
