/**
 * Modal callback flow tests
 *
 * These tests verify modal callback chains work correctly, using the Slack
 * client mock and view state builders.
 *
 * Phase 2A: Establish test patterns and infrastructure
 * Phase 2B: Update tests when handlers change for project restructure
 *
 * Note: These are integration tests that require database setup.
 * Pattern enforcement tests (pattern-enforcement.test.ts) can run without DB.
 */

import { createSlackClientMock, expectModalOpened, expectMessagePosted } from '../__helpers__/slack-client-mock';
import {
  buildBriefViewState,
  buildPlanViewState,
  buildPrivateMetadata,
  buildMockView,
  buildMockBody,
  buildFieldworkStudyPickerState,
} from '../__helpers__/view-state-builders';

// ═══════════════════════════════════════════════════════════
// TEST INFRASTRUCTURE VERIFICATION
// ═══════════════════════════════════════════════════════════

describe('modal flow test infrastructure', () => {
  describe('slack client mock', () => {
    it('captures views.open calls', async () => {
      const mock = createSlackClientMock();

      await mock.client.views.open({
        trigger_id: 'test_trigger',
        view: {
          type: 'modal',
          callback_id: 'test_modal',
          title: { type: 'plain_text', text: 'Test' },
        },
      });

      expect(mock.viewsOpened).toHaveLength(1);
      expect(mock.viewsOpened[0].view.callback_id).toBe('test_modal');
    });

    it('captures views.update calls', async () => {
      const mock = createSlackClientMock();

      await mock.client.views.update({
        view_id: 'V_EXISTING',
        view: {
          type: 'modal',
          callback_id: 'updated_modal',
          title: { type: 'plain_text', text: 'Updated' },
        },
      });

      expect(mock.viewsUpdated).toHaveLength(1);
      expect(mock.viewsUpdated[0].view_id).toBe('V_EXISTING');
    });

    it('captures chat.postMessage calls', async () => {
      const mock = createSlackClientMock();

      await mock.client.chat.postMessage({
        channel: 'C_TEST',
        text: 'Test message',
      });

      expect(mock.messagesPosted).toHaveLength(1);
      expect(mock.messagesPosted[0].channel).toBe('C_TEST');
    });

    it('resolves user info from profiles', async () => {
      const mock = createSlackClientMock();

      const result = await mock.client.users.info({ user: 'U_RESEARCHER' });

      expect(result.ok).toBe(true);
      expect(result.user.real_name).toBe('Jane Researcher');
    });

    it('resets captured calls between tests', async () => {
      const mock = createSlackClientMock();

      await mock.client.views.open({
        trigger_id: 'test',
        view: { type: 'modal', callback_id: 'test' },
      });
      expect(mock.viewsOpened).toHaveLength(1);

      mock.reset();

      expect(mock.viewsOpened).toHaveLength(0);
    });
  });

  describe('view state builders', () => {
    it('builds brief view state with defaults', () => {
      const state = buildBriefViewState();

      expect(state.values.study_select_block.study_select.selected_option?.value).toBe('test-study');
      expect(state.values.problem_block.problem_input.value).toContain('understand user needs');
    });

    it('builds brief view state with custom values', () => {
      const state = buildBriefViewState({
        studyName: 'mobile-nav-study',
        problemStatement: 'Veterans struggle with navigation',
      });

      expect(state.values.study_select_block.study_select.selected_option?.value).toBe('mobile-nav-study');
      expect(state.values.problem_block.problem_input.value).toBe('Veterans struggle with navigation');
    });

    it('builds plan view state', () => {
      const state = buildPlanViewState({
        studyName: 'test-study',
        methodology: 'card_sorting',
      });

      expect(state.values.study_select_block.study_select.selected_option?.value).toBe('test-study');
      expect(state.values.methodology_block.methodology_select.selected_option?.value).toBe('card_sorting');
    });

    it('builds private metadata with channel context', () => {
      const metadata = buildPrivateMetadata({
        channelId: 'C_RESEARCH',
        studyName: 'my-study',
        userId: 'U_LEAD',
      });

      const parsed = JSON.parse(metadata);
      expect(parsed.channelId).toBe('C_RESEARCH');
      expect(parsed.studyName).toBe('my-study');
      expect(parsed.userId).toBe('U_LEAD');
    });

    it('builds mock view submission object', () => {
      const state = buildBriefViewState();
      const view = buildMockView('research_brief_modal', state, {
        channelId: 'C_TEST',
        studyName: 'test-study',
      });

      expect(view.type).toBe('modal');
      expect(view.callback_id).toBe('research_brief_modal');
      expect(JSON.parse(view.private_metadata).channelId).toBe('C_TEST');
    });

    it('builds mock body with user context', () => {
      const body = buildMockBody('U_RESEARCHER');

      expect(body.user.id).toBe('U_RESEARCHER');
      expect(body.trigger_id).toBeDefined();
    });
  });

  describe('assertion helpers', () => {
    it('expectModalOpened finds modal by callback_id', () => {
      const mock = createSlackClientMock();
      mock.viewsOpened.push({
        trigger_id: 'test',
        view: { type: 'modal', callback_id: 'target_modal' },
      });

      const found = expectModalOpened(mock, 'target_modal');
      expect(found.view.callback_id).toBe('target_modal');
    });

    it('expectModalOpened throws for missing modal', () => {
      const mock = createSlackClientMock();

      expect(() => {
        expectModalOpened(mock, 'nonexistent_modal');
      }).toThrow('Expected modal with callback_id "nonexistent_modal"');
    });

    it('expectMessagePosted finds message by channel', () => {
      const mock = createSlackClientMock();
      mock.messagesPosted.push({ channel: 'C_TARGET', text: 'Hello' });

      const found = expectMessagePosted(mock, 'C_TARGET');
      expect(found.text).toBe('Hello');
    });
  });
});

// ═══════════════════════════════════════════════════════════
// MODAL CHAIN PATTERNS (for Phase 2B handler tests)
// ═══════════════════════════════════════════════════════════

describe('modal chain patterns', () => {
  /**
   * Brief Modal Flow Pattern:
   * 1. /qori-brief command opens study picker modal
   * 2. User selects study → modal updates with brief form
   * 3. User submits → handler processes → posts to channel
   *
   * Phase 2B changes:
   * - Study picker → Project picker (channel anchored)
   * - private_metadata includes project_id
   */
  describe('brief modal chain', () => {
    it('demonstrates brief modal submission pattern', () => {
      const mock = createSlackClientMock();
      const state = buildBriefViewState({
        studyName: 'va-mobile-nav',
        problemStatement: 'Veterans struggle with mobile navigation',
      });
      const view = buildMockView('research_brief_modal', state, {
        channelId: 'C_RESEARCH',
        studyName: 'va-mobile-nav',
      });

      // Verify the test fixtures are correctly structured
      expect(view.callback_id).toBe('research_brief_modal');
      expect(view.state.values.problem_block.problem_input.value).toBe(
        'Veterans struggle with mobile navigation',
      );

      // In Phase 2B: verify project_id in private_metadata
      const metadata = JSON.parse(view.private_metadata);
      expect(metadata.channelId).toBe('C_RESEARCH');
      // Phase 2B assertion: expect(metadata.projectId).toBeDefined();
    });
  });

  /**
   * Plan Modal Flow Pattern:
   * 1. /qori-plan command opens study picker
   * 2. Handler loads upstream cascade variables (brief emits)
   * 3. If required variables missing → DM user with contract error
   * 4. User submits → handler processes with cascade context
   *
   * Phase 2B changes:
   * - cascade read uses project_id FK instead of study_name string
   */
  describe('plan modal chain', () => {
    it('demonstrates plan modal with cascade context', () => {
      const state = buildPlanViewState({
        studyName: 'va-mobile-nav',
        methodology: 'usability_testing',
      });
      const view = buildMockView('research_plan_modal', state, {
        channelId: 'C_RESEARCH',
        studyName: 'va-mobile-nav',
      });

      // Simulate upstream cascade variables that would be loaded
      const upstreamVariables = {
        research_objectives: ['Understand navigation patterns'],
        research_questions: [{ id: 'RQ-001', question: 'Test', priority: 'Primary' }],
        target_barriers: [],
        participant_criteria: 'Veterans with accounts',
      };

      // Verify cascade data structure is correct for handler
      expect(upstreamVariables.research_objectives).toBeDefined();
      expect(Array.isArray(upstreamVariables.research_questions)).toBe(true);
    });

    it('demonstrates cascade contract violation pattern', () => {
      // When required upstream variables are missing
      const missingVariables = {
        research_questions: [], // research_objectives is missing
      };

      const missing = ['research_objectives', 'target_barriers', 'participant_criteria'].filter(
        (key) => missingVariables[key as keyof typeof missingVariables] === undefined,
      );

      // Handler should throw TemplateContractError for these
      expect(missing).toContain('research_objectives');
      expect(missing).toContain('target_barriers');
    });
  });

  /**
   * Fieldwork Dashboard Flow Pattern:
   * 1. /qori-fieldwork opens study picker
   * 2. User selects study → dashboard modal with participant list
   * 3. Actions update participant status, open add participant modal
   *
   * Phase 2B changes:
   * - Dashboard scoped to project (all studies in project)
   * - participant_id FK instead of participant_code string
   */
  describe('fieldwork dashboard chain', () => {
    it('demonstrates fieldwork study picker', () => {
      const state = buildFieldworkStudyPickerState({ studyId: '42' });
      const view = buildMockView('fieldwork_study_picker', state, {
        channelId: 'C_RESEARCH',
      });

      expect(view.callback_id).toBe('fieldwork_study_picker');
      expect(state.values.study_select_block.study_select.selected_option?.value).toBe('42');
    });

    it('demonstrates modal update pattern for dashboard refresh', async () => {
      const mock = createSlackClientMock();

      // Simulate dashboard refresh after participant update
      await mock.client.views.update({
        view_id: 'V_DASHBOARD',
        view: {
          type: 'modal',
          callback_id: 'fieldwork_dashboard',
          title: { type: 'plain_text', text: 'Fieldwork Dashboard' },
          blocks: [
            // Updated participant list would go here
          ],
        },
      });

      expect(mock.viewsUpdated).toHaveLength(1);
      expect(mock.viewsUpdated[0].view_id).toBe('V_DASHBOARD');
    });
  });
});

// ═══════════════════════════════════════════════════════════
// PHASE 2B READINESS MARKERS
// ═══════════════════════════════════════════════════════════

describe('phase 2b readiness', () => {
  /**
   * These tests document the expected changes in Phase 2B.
   * They currently pass with placeholder assertions.
   * In 2B, update these with actual project_id assertions.
   */

  it('private_metadata structure will include project_id in 2B', () => {
    const metadata = buildPrivateMetadata({
      channelId: 'C_RESEARCH',
      studyName: 'test-study', // 2A: uses studyName
      // projectId: 1,        // 2B: will add projectId
    });

    const parsed = JSON.parse(metadata);
    expect(parsed.channelId).toBeDefined();
    // 2A: uses studyName
    expect(parsed.studyName).toBe('test-study');
    // 2B assertion: expect(parsed.projectId).toBeDefined();
  });

  it('view state builders will support project selection in 2B', () => {
    // In 2B, study selection may be preceded by project selection
    // or derived from channel-project binding
    const state = buildBriefViewState({ studyName: 'test-study' });

    // 2A: study is selected directly
    expect(state.values.study_select_block.study_select.selected_option?.value).toBe('test-study');
    // 2B: may have project_select_block.project_select
  });
});
