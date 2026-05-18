import type { SlackUserState } from '../database/models/slack_user_state';

import sequelize from '../database';

// Typed model reference — cast once, use everywhere. See Phase 3 notes.
const SlackUserStateModel = sequelize.models.SlackUserState as typeof SlackUserState;

/**
 * Get or create a SlackUserState row for the given Slack user.
 * All public functions below go through this so the row always exists.
 */
const ensureRow = async (slackUserId: string): Promise<SlackUserState> => {
  const [row] = await SlackUserStateModel.findOrCreate({
    where: { slack_user_id: slackUserId },
    defaults: { slack_user_id: slackUserId },
  });
  return row;
};

// ── Active study ──────────────────────────────────────────────

const setActiveStudy = async (slackUserId: string, studyId: number): Promise<void> => {
  const row = await ensureRow(slackUserId);
  await row.update({
    active_study_id: studyId,
    updated_at: new Date(),
  });
};

const getActiveStudy = async (slackUserId: string): Promise<number | null> => {
  const row = await ensureRow(slackUserId);
  return row.active_study_id;
};

const clearActiveStudy = async (slackUserId: string): Promise<void> => {
  const row = await ensureRow(slackUserId);
  await row.update({
    active_study_id: null,
    updated_at: new Date(),
  });
};

// ── Onboarding ────────────────────────────────────────────────

const markOnboarded = async (slackUserId: string): Promise<void> => {
  const row = await ensureRow(slackUserId);
  await row.update({
    onboarded_at: new Date(),
    updated_at: new Date(),
  });
};

const isFirstRun = async (slackUserId: string): Promise<boolean> => {
  const row = await ensureRow(slackUserId);
  return row.onboarded_at === null;
};

export {
  setActiveStudy,
  getActiveStudy,
  clearActiveStudy,
  markOnboarded,
  isFirstRun,
};
