const sequelize = require('../database');

/**
 * Get or create a SlackUserState row for the given Slack user.
 * All public functions below go through this so the row always exists.
 */
const ensureRow = async (slackUserId) => {
  const { SlackUserState } = sequelize.models;
  const [row] = await SlackUserState.findOrCreate({
    where: { slack_user_id: slackUserId },
    defaults: { slack_user_id: slackUserId },
  });
  return row;
};

// ── Active study ──────────────────────────────────────────────

const setActiveStudy = async (slackUserId, studyId) => {
  const row = await ensureRow(slackUserId);
  await row.update({
    active_study_id: studyId,
    updated_at: new Date(),
  });
};

const getActiveStudy = async (slackUserId) => {
  const row = await ensureRow(slackUserId);
  return row.active_study_id;
};

const clearActiveStudy = async (slackUserId) => {
  const row = await ensureRow(slackUserId);
  await row.update({
    active_study_id: null,
    updated_at: new Date(),
  });
};

// ── Onboarding ────────────────────────────────────────────────

const markOnboarded = async (slackUserId) => {
  const row = await ensureRow(slackUserId);
  await row.update({
    onboarded_at: new Date(),
    updated_at: new Date(),
  });
};

const isFirstRun = async (slackUserId) => {
  const row = await ensureRow(slackUserId);
  return row.onboarded_at === null;
};

module.exports = {
  setActiveStudy,
  getActiveStudy,
  clearActiveStudy,
  markOnboarded,
  isFirstRun,
};
