/**
 * ticketHandler.ts — /qori-tickets command
 *
 * Creates GitHub Issues from ticket_candidates stored in Postgres.
 * Review-before-create: researcher selects which tickets to create.
 * Supports designer, engineering, and accessibility audiences.
 */

import type { AllMiddlewareArgs, SlackCommandMiddlewareArgs, SlackViewMiddlewareArgs, ViewSubmitAction, SlashCommand } from '@slack/bolt';

import { getStudiesByUser } from '../../../services/research_study.service';
import { getActiveStudy, setActiveStudy } from '../../../services/slack-user-state.service';
import sequelize from '../../../database';
import type { StudyVariableAttributes } from '../../../types/models';
import { assertStudyAccess } from '../../../services/authorization.service';
import { postEphemeralOrDM } from '../slackHelpers';

// ─── Types ──────────────────────────────────────────────────────

type AudienceKey = 'designer' | 'engineering' | 'accessibility';

interface AudienceConfigItem {
  label: string;
  variableKey: string;
  sourceTemplate: string;
  labelPrefix: string;
}

interface TicketCandidate {
  id: string;
  title: string;
  description: string;
  priority: string;
  effort: string;
  addresses_findings?: string[];
  // Designer fields
  current_design_state?: string;
  affected_personas?: string[];
  affected_journey_stages?: string[];
  affected_screens?: string[];
  acceptance_criteria?: string[];
  design_artifacts_needed?: string[];
  collaboration_needed?: string[];
  blocked_by?: string[];
  related_engineering_tickets?: string[];
  // Engineering fields
  user_impact_metrics?: string[];
  current_behavior?: string;
  technical_acceptance_criteria?: string[];
  affected_components?: string[];
  technical_constraints?: string[];
  testing_approach?: string[];
  enables?: string[];
  related_design_tickets?: string[];
  related_accessibility_tickets?: string[];
  effort_rationale?: string;
  effort_estimate_sprints?: string;
  // Accessibility fields
  wcag_criterion?: string;
  section_508_implication?: string;
  compliance_priority_rationale?: string;
  affected_at_users?: string[];
  evidence_nuggets?: string[];
  recommended_testing?: string[];
  regression_risk?: string;
  compliance_deadline?: string;
}

interface PrioritizedFinding {
  id: string;
  finding: string;
  severity?: number | null;
  representative_quote?: string;
  representative_quote_source?: string;
  supporting_nuggets?: string[];
}

interface NuggetDetail {
  id: string;
  verbatim_quote?: string;
  participant?: string;
}

interface StudyOption {
  text: { type: 'plain_text'; text: string };
  value: string;
}

/** Typed accessors for CreatedIssue model attributes used by the handler */
interface CreatedIssueRecord {
  id: number;
  public_id: string;
  study_id: number;
  audience: string;
  ticket_id: string;
  github_issue_number: number | null;
  github_url: string | null;
  github_repo: string;
  status: string;
}

interface CreatedIssueResult {
  number: number;
  url: string;
  title: string;
  id: string;
}

interface FailedIssueResult {
  id: string;
  title: string;
  error: string;
}

// ─── Config ─────────────────────────────────────────────────────

const AUDIENCE_CONFIG: Record<AudienceKey, AudienceConfigItem> = {
  designer: {
    label: 'Designer',
    variableKey: 'design_ticket_candidates',
    sourceTemplate: 'designer_readout',
    labelPrefix: 'audience:designer',
  },
  engineering: {
    label: 'Engineering',
    variableKey: 'engineering_ticket_candidates',
    sourceTemplate: 'engineering_readout',
    labelPrefix: 'audience:engineering',
  },
  accessibility: {
    label: 'Accessibility',
    variableKey: 'accessibility_ticket_candidates',
    sourceTemplate: 'accessibility_readout',
    labelPrefix: 'audience:accessibility',
  },
};

// ═══════════════════════════════════════════════════════════
// STEP 1: Open modal with study + audience selection
// ═══════════════════════════════════════════════════════════

const ticketHandler = async ({ ack, body, client, command }: SlackCommandMiddlewareArgs & AllMiddlewareArgs): Promise<void> => {
  try {
    await ack();

    const userId = command.user_id;
    const studies = await getStudiesByUser(userId);

    if (!studies || studies.length === 0) {
      await postEphemeralOrDM(
        client,
        command.channel_id,
        userId,
        '❌ No studies found. Create a study first.',
      );
      return;
    }

    const activeStudyId: number | null = await getActiveStudy(userId);
    await client.views.open({
      trigger_id: command.trigger_id,
      // buildStep1Modal returns a valid Slack modal structure — cast through unknown
      // because the return type doesn't exactly match Bolt's strict View union
      view: buildStep1Modal(studies, command, activeStudyId) as unknown as Parameters<typeof client.views.open>[0]['view'],
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('❌ ticketHandler error:', message);
  }
};

function buildStep1Modal(
  studies: Array<{ id: number; name: string }>,
  command: SlashCommand,
  activeStudyId: number | null,
): Record<string, unknown> {
  const studyOptions: StudyOption[] = studies.slice(0, 10).map(s => ({
    text: { type: 'plain_text' as const, text: s.name },
    value: s.id.toString(),
  }));
  const initialStudyOption = activeStudyId
    ? studyOptions.find(o => o.value === activeStudyId.toString())
    : null;

  return {
    type: 'modal',
    callback_id: 'tickets_step1_submit',
    private_metadata: JSON.stringify({
      origin: { channel: command.channel_id, user: command.user_id },
    }),
    title: { type: 'plain_text', text: 'Create GitHub Issues' },
    submit: { type: 'plain_text', text: 'Load Tickets' },
    close: { type: 'plain_text', text: 'Cancel' },
    blocks: [
      {
        type: 'input',
        block_id: 'study_select',
        label: { type: 'plain_text', text: 'Study *' },  // R7: required marking
        element: {
          type: 'static_select',
          action_id: 'study_select_action',
          placeholder: { type: 'plain_text', text: 'Choose a study...' },
          options: studyOptions,
          ...(initialStudyOption ? { initial_option: initialStudyOption } : {}),
        },
      },
      {
        type: 'input',
        block_id: 'audience_select',
        label: { type: 'plain_text', text: 'Audience *' },  // R7: required marking
        element: {
          type: 'static_select',
          action_id: 'audience_select_action',
          placeholder: { type: 'plain_text', text: 'Choose audience...' },
          options: [
            { text: { type: 'plain_text', text: 'Designer' }, value: 'designer' },
            { text: { type: 'plain_text', text: 'Engineering' }, value: 'engineering' },
            { text: { type: 'plain_text', text: 'Accessibility' }, value: 'accessibility' },
          ],
        },
      },
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: '_Leadership readouts are document-only — no tickets._',
          },
        ],
      },
    ],
  };
}

// ═══════════════════════════════════════════════════════════
// STEP 1 SUBMIT: Load tickets and show Step 2
// ═══════════════════════════════════════════════════════════

const handleStep1Submit = async ({ ack, body, view, client }: SlackViewMiddlewareArgs<ViewSubmitAction> & AllMiddlewareArgs): Promise<void> => {
  const values = view.state.values;
  const studyId: string | undefined = values.study_select?.study_select_action?.selected_option?.value;
  const audience: string | undefined = values.audience_select?.audience_select_action?.selected_option?.value;
  const meta = JSON.parse(view.private_metadata || '{}');

  if (!studyId || !audience) {
    await (ack as Function)({ response_action: 'errors', errors: { study_select: 'Select a study', audience_select: 'Select an audience' } });
    return;
  }

  // Authorization check: verify user has access to this study (ADR 0024)
  await assertStudyAccess(body.user.id, parseInt(studyId, 10), client);

  const config = AUDIENCE_CONFIG[audience as AudienceKey];
  if (!config) {
    await (ack as Function)({ response_action: 'errors', errors: { audience_select: 'Invalid audience' } });
    return;
  }

  // Look up study and update active study
  const studies = await getStudiesByUser(body.user.id);
  const study = studies.find((s: { id: number }) => s.id.toString() === studyId);
  if (!study) {
    await (ack as Function)({ response_action: 'errors', errors: { study_select: 'Study not found' } });
    return;
  }
  await setActiveStudy(body.user.id, study.id);

  // Query ticket_candidates from Postgres
  const StudyVariable = sequelize.models?.StudyVariable;
  const CreatedIssue = sequelize.models?.CreatedIssue;

  let tickets: TicketCandidate[] = [];
  try {
    const row = await StudyVariable.findOne({
      where: {
        study_id: study.id,
        variable_key: config.variableKey,
        scope: 'study',
      },
      attributes: ['value'],
    });

    const typedRow = row as unknown as StudyVariableAttributes | null;
    if (!typedRow || !typedRow.value || !Array.isArray(typedRow.value)) {
      await (ack as Function)({
        response_action: 'errors',
        errors: { audience_select: `No ${config.label} tickets found. Generate the ${config.label} readout first.` },
      });
      return;
    }

    tickets = typedRow.value as TicketCandidate[];
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('❌ Error loading tickets:', message);
    await (ack as Function)({ response_action: 'errors', errors: { study_select: 'Error loading tickets' } });
    return;
  }

  // Check which tickets already have GitHub issues
  let existingIssues: Array<{ ticket_id: string; github_issue_number: number; github_url: string }> = [];
  if (CreatedIssue) {
    try {
      // @ts-expect-error — pre-existing type mismatch from require() → import migration
      existingIssues = await CreatedIssue.findAll({
        where: { study_id: study.id, audience },
        attributes: ['ticket_id', 'github_issue_number', 'github_url'],
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn('⚠️ Could not check existing issues:', message);
    }
  }
  const existingTicketIds = new Set(existingIssues.map(i => i.ticket_id));

  // Build Step 2 modal with ticket checkboxes
  const ticketOptions = tickets.map(t => {
    const alreadyCreated = existingTicketIds.has(t.id);
    const findingsCount = Array.isArray(t.addresses_findings) ? t.addresses_findings.length : 0;
    const label = `*${t.id}* — ${t.title}`;
    const desc = `${t.priority} · ${t.effort} · ${findingsCount} finding${findingsCount !== 1 ? 's' : ''}${alreadyCreated ? ' · ✅ Already created' : ''}`;

    return {
      text: { type: 'mrkdwn' as const, text: label },
      description: { type: 'plain_text' as const, text: desc },
      value: t.id,
    };
  });

  const initialOptions = ticketOptions.filter(o => !existingTicketIds.has(o.value));

  const step2Meta = {
    ...meta,
    studyId: study.id,
    studyName: study.name,
    studyPath: study.path,
    audience,
    ticketCount: tickets.length,
  };

  const step2View = {
    type: 'modal',
    callback_id: 'tickets_step2_submit',
    private_metadata: JSON.stringify(step2Meta),
    title: { type: 'plain_text', text: `${config.label} Tickets` },
    submit: { type: 'plain_text', text: `Create ${initialOptions.length} Issue${initialOptions.length !== 1 ? 's' : ''}` },
    close: { type: 'plain_text', text: 'Cancel' },
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Study:* ${study.name}\n*Audience:* ${config.label}\n*Available tickets:* ${tickets.length}${existingTicketIds.size > 0 ? `\n*Already created:* ${existingTicketIds.size}` : ''}`,
        },
      },
      { type: 'divider' },
      {
        type: 'input',
        block_id: 'ticket_selection',
        label: { type: 'plain_text', text: 'Select tickets to create as GitHub Issues' },
        element: {
          type: 'checkboxes',
          action_id: 'ticket_checkboxes',
          options: ticketOptions,
          ...(initialOptions.length > 0 ? { initial_options: initialOptions } : {}),
        },
      },
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: `_Issues will be created in \`${process.env.GITHUB_OWNER}/${process.env.GITHUB_REPO}\`. Uncheck any tickets to exclude._`,
          },
        ],
      },
    ],
  };

  await (ack as Function)({ response_action: 'update', view: step2View });
};

// ═══════════════════════════════════════════════════════════
// STEP 2 SUBMIT: Create GitHub Issues
// ═══════════════════════════════════════════════════════════

const handleStep2Submit = async ({ ack, body, view, client }: SlackViewMiddlewareArgs<ViewSubmitAction> & AllMiddlewareArgs): Promise<void> => {
  await ack();

  const values = view.state.values;
  const meta = JSON.parse(view.private_metadata || '{}');
  const { studyId, studyName, studyPath, audience } = meta as { studyId: number; studyName: string; studyPath: string; audience: AudienceKey };
  const userId = body.user.id;

  const selectedTicketIds: string[] = values.ticket_selection?.ticket_checkboxes?.selected_options?.map((o: any) => o.value) || [];

  if (selectedTicketIds.length === 0) {
    await client.chat.postMessage({
      channel: userId,
      text: '❌ No tickets selected. No GitHub Issues created.',
    });
    return;
  }

  const config = AUDIENCE_CONFIG[audience];
  if (!config) return;

  // Load full ticket data from Postgres
  const StudyVariable = sequelize.models?.StudyVariable;
  const CreatedIssue = sequelize.models?.CreatedIssue;

  let tickets: TicketCandidate[] = [];
  let findings: PrioritizedFinding[] = [];
  const nuggetDetails: Record<string, NuggetDetail> = {};
  try {
    const ticketRow = await StudyVariable.findOne({
      where: { study_id: studyId, variable_key: config.variableKey, scope: 'study' },
      attributes: ['value'],
    });
    const typedTicketRow = ticketRow as unknown as StudyVariableAttributes | null;
    tickets = ((typedTicketRow?.value || []) as TicketCandidate[]).filter(t => selectedTicketIds.includes(t.id));

    const findingsRow = await StudyVariable.findOne({
      where: { study_id: studyId, variable_key: 'prioritized_findings', scope: 'study' },
      attributes: ['value'],
    });
    const typedFindingsRow = findingsRow as unknown as StudyVariableAttributes | null;
    findings = (typedFindingsRow?.value || []) as PrioritizedFinding[];

    const detailRows = await StudyVariable.findAll({
      where: { study_id: studyId, variable_key: 'atomic_nugget_detail', scope: 'study' },
      attributes: ['item_key', 'value'],
    });
    const typedDetailRows = detailRows as unknown as StudyVariableAttributes[];
    for (const row of typedDetailRows) {
      if (row.item_key && row.value) {
        nuggetDetails[row.item_key] = row.value as NuggetDetail;
      } else if (!row.item_key && Array.isArray(row.value)) {
        for (const item of row.value as NuggetDetail[]) {
          if (item.id) nuggetDetails[item.id] = item;
        }
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('❌ Error loading ticket data:', message);
    await client.chat.postMessage({ channel: userId, text: `❌ Error loading tickets: ${message}` });
    return;
  }

  // Build findings lookup
  const findingsMap: Record<string, PrioritizedFinding> = {};
  for (const f of findings) {
    if (f.id) findingsMap[f.id] = f;
  }

  await client.chat.postMessage({
    channel: userId,
    text: `Creating ${tickets.length} GitHub Issue(s) for *${config.label}* audience...`,
  });

  // Create issues sequentially
  const { Octokit } = await import('@octokit/rest');
  const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
  const owner = process.env.GITHUB_OWNER!;
  const repo = process.env.GITHUB_REPO!;
  const repoFull = `${owner}/${repo}`;

  const created: CreatedIssueResult[] = [];
  const failed: FailedIssueResult[] = [];

  for (const ticket of tickets) {
    try {
      // Step A: Check if this semantic action already has a mapping
      let existingMapping = null;
      if (CreatedIssue) {
        existingMapping = await CreatedIssue.findOne({
          where: { study_id: studyId, audience, ticket_id: ticket.id },
        });
      }

      if (existingMapping) {
        const em = existingMapping as unknown as CreatedIssueRecord;
        if (em.status === 'created' && em.github_issue_number) {
          // Already created — resolve existing issue, don't duplicate
          created.push({ number: em.github_issue_number, url: em.github_url ?? '', title: ticket.title, id: ticket.id });
          console.log(`♻️  Issue already exists for ${ticket.id}: #${em.github_issue_number} (idempotent resolve)`);
          continue;
        }
        // Status is 'pending' or 'failed' — attempt recovery below
      }

      const issueBody = formatIssueBody(ticket, audience, studyName, findingsMap, nuggetDetails, studyPath);
      const labels = buildLabels(ticket, audience, studyName);

      // Step B: Reserve pending mapping (if model available and no existing mapping)
      let mappingId: number | null = null;
      let actionPublicId: string | null = null;
      if (CreatedIssue && !existingMapping) {
        try {
          const pending = await CreatedIssue.create({
            study_id: studyId,
            audience,
            ticket_id: ticket.id,
            github_repo: repoFull,
            created_by: userId,
            status: 'pending',
            github_issue_number: null,
            github_url: null,
          });
          const pendingRecord = pending as unknown as CreatedIssueRecord;
          mappingId = pendingRecord.id;
          actionPublicId = pendingRecord.public_id;
        } catch (dbErr) {
          // Unique constraint violation = concurrent request already reserved
          const dbMessage = dbErr instanceof Error ? dbErr.message : String(dbErr);
          if (dbMessage.includes('unique') || dbMessage.includes('duplicate')) {
            const concurrent = await CreatedIssue.findOne({
              where: { study_id: studyId, audience, ticket_id: ticket.id },
            });
            if (concurrent) {
              const cc = concurrent as unknown as CreatedIssueRecord;
              if (cc.status === 'created' && cc.github_issue_number) {
                created.push({ number: cc.github_issue_number, url: cc.github_url ?? '', title: ticket.title, id: ticket.id });
                console.log(`♻️  Concurrent issue resolved for ${ticket.id}: #${cc.github_issue_number}`);
                continue;
              }
              mappingId = cc.id;
              actionPublicId = cc.public_id;
            }
          } else {
            console.warn(`⚠️ Could not reserve mapping: ${dbMessage}`);
          }
        }
      } else if (existingMapping) {
        const emRecord = existingMapping as unknown as CreatedIssueRecord;
        mappingId = emRecord.id;
        actionPublicId = emRecord.public_id;
      }

      // Append Qori action marker to issue body for recovery
      const markerLine = actionPublicId
        ? `\n\n<!-- qori-action-id: ${actionPublicId} -->`
        : '';
      const issueBodyWithMarker = issueBody + markerLine;

      // Step C: Create GitHub issue
      const { data } = await octokit.rest.issues.create({
        owner,
        repo,
        title: ticket.title,
        body: issueBodyWithMarker,
        labels,
      });

      // Step D: Update mapping with GitHub issue details
      if (CreatedIssue && mappingId) {
        try {
          await CreatedIssue.update(
            {
              github_issue_number: data.number,
              github_url: data.html_url,
              status: 'created',
              updated_at: new Date(),
            },
            { where: { id: mappingId } },
          );
        } catch (dbErr) {
          const dbMessage = dbErr instanceof Error ? dbErr.message : String(dbErr);
          console.warn(`⚠️ GitHub issue #${data.number} created but DB update failed: ${dbMessage}`);
          // Issue exists on GitHub — next retry will recover via marker
        }
      } else if (CreatedIssue && !mappingId) {
        // No prior mapping — create full record
        try {
          await CreatedIssue.create({
            study_id: studyId,
            audience,
            ticket_id: ticket.id,
            github_issue_number: data.number,
            github_url: data.html_url,
            github_repo: repoFull,
            created_by: userId,
            status: 'created',
          });
        } catch (dbErr) {
          const dbMessage = dbErr instanceof Error ? dbErr.message : String(dbErr);
          console.warn(`⚠️ Could not track issue in DB: ${dbMessage}`);
        }
      }

      created.push({ number: data.number, url: data.html_url, title: ticket.title, id: ticket.id });
      console.log(`✅ Created issue #${data.number}: ${ticket.title}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`❌ Failed to create issue "${ticket.title}":`, message);
      failed.push({ id: ticket.id, title: ticket.title, error: message });
    }
  }

  const issueLinks = created.map(i => `• <${i.url}|#${i.number}> — ${i.title}`).join('\n');
  const summaryText = `✅ Created ${created.length} GitHub Issue(s) for *${config.label}* audience\n\n${issueLinks}${failed.length > 0 ? `\n\n❌ ${failed.length} failed: ${failed.map(f => f.id).join(', ')}` : ''}`;

  await client.chat.postMessage({
    channel: userId,
    text: summaryText,
    blocks: [
      {
        type: 'section',
        text: { type: 'mrkdwn', text: summaryText },
      },
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: `Repository: \`${repoFull}\` · Study: ${studyName} · Audience: ${config.label}`,
          },
        ],
      },
    ],
  });
};

// ═══════════════════════════════════════════════════════════
// ISSUE BODY FORMATTING (audience-specific)
// ═══════════════════════════════════════════════════════════

function formatIssueBody(
  ticket: TicketCandidate,
  audience: AudienceKey,
  studyName: string,
  findingsMap: Record<string, PrioritizedFinding> = {},
  nuggetDetails: Record<string, NuggetDetail> = {},
  studyPath: string = studyName,
): string {
  const sections: string[] = [];

  sections.push(`## Description\n\n${ticket.description}`);

  // ── Designer body ──
  if (audience === 'designer') {
    if (ticket.current_design_state) {
      sections.push(`## Current Design State\n\n${ticket.current_design_state}`);
    }
    if (ticket.affected_personas?.length) {
      sections.push(`## Affected Personas\n\n${ticket.affected_personas.map(p => `- ${p}`).join('\n')}`);
    }
    if (ticket.affected_journey_stages?.length) {
      sections.push(`## Affected Journey Stages\n\n${ticket.affected_journey_stages.map(s => `- ${s}`).join('\n')}`);
    }
    if (ticket.affected_screens?.length) {
      sections.push(`## Affected Screens\n\n${ticket.affected_screens.map(s => `- ${s}`).join('\n')}`);
    }
    if (ticket.acceptance_criteria?.length) {
      sections.push(`## Acceptance Criteria\n\n${ticket.acceptance_criteria.map(c => `- [ ] ${c}`).join('\n')}`);
    }
    if (ticket.design_artifacts_needed?.length) {
      sections.push(`## Design Artifacts Needed\n\n${ticket.design_artifacts_needed.map(a => `- ${a}`).join('\n')}`);
    }
    if (ticket.collaboration_needed?.length) {
      sections.push(`## Collaboration Needed\n\n${ticket.collaboration_needed.map(c => `- ${c}`).join('\n')}`);
    }
    const designDeps: string[] = [];
    designDeps.push(`- Blocked by: ${ticket.blocked_by?.length ? ticket.blocked_by.join(', ') : 'None'}`);
    designDeps.push(`- Related engineering work: ${ticket.related_engineering_tickets?.length ? ticket.related_engineering_tickets.join(', ') : 'None'}`);
    sections.push(`## Dependencies\n\n${designDeps.join('\n')}`);
  }

  // ── Engineering body ──
  if (audience === 'engineering') {
    if (ticket.user_impact_metrics?.length) {
      sections.push(`## Why This Matters\n\n${ticket.user_impact_metrics.map(m => `- ${m}`).join('\n')}`);
    }
    if (ticket.current_behavior) {
      sections.push(`## Current Behavior\n\n${ticket.current_behavior}`);
    }
    if (ticket.technical_acceptance_criteria?.length) {
      sections.push(`## Definition of Done\n\n${ticket.technical_acceptance_criteria.map(c => `- [ ] ${c}`).join('\n')}`);
    }
    if (ticket.affected_components?.length) {
      sections.push(`## Affected Components\n\n${ticket.affected_components.map(c => `- ${c}`).join('\n')}`);
    }
    if (ticket.technical_constraints?.length) {
      sections.push(`## Technical Constraints\n\n${ticket.technical_constraints.map(c => `- ${c}`).join('\n')}`);
    } else {
      sections.push(`## Technical Constraints\n\nNone documented in upstream research`);
    }
    if (ticket.testing_approach?.length) {
      sections.push(`## Testing Approach\n\n${ticket.testing_approach.map(t => `- ${t}`).join('\n')}`);
    }
    const engDeps: string[] = [];
    engDeps.push(`- Blocked by: ${ticket.blocked_by?.length ? ticket.blocked_by.join(', ') : 'None'}`);
    engDeps.push(`- Enables: ${ticket.enables?.length ? ticket.enables.join(', ') : 'None'}`);
    engDeps.push(`- Related design work: ${ticket.related_design_tickets?.length ? ticket.related_design_tickets.join(', ') : 'None'}`);
    engDeps.push(`- Related accessibility work: ${ticket.related_accessibility_tickets?.length ? ticket.related_accessibility_tickets.join(', ') : 'None'}`);
    sections.push(`## Dependencies\n\n${engDeps.join('\n')}`);

    const effortLine = ticket.effort_rationale
      ? `${ticket.effort} — ${ticket.effort_rationale}`
      : `${ticket.effort}${ticket.effort_estimate_sprints ? ` (${ticket.effort_estimate_sprints})` : ''}`;
    sections.push(`## Effort Estimate\n\n${effortLine}`);
  }

  // ── Accessibility body ──
  if (audience === 'accessibility') {
    if (ticket.wcag_criterion) {
      sections.push(`## WCAG Criterion\n\n${ticket.wcag_criterion}`);
    }
    if (ticket.section_508_implication) {
      sections.push(`## Section 508 Implication\n\n${ticket.section_508_implication}`);
    }
    if (ticket.compliance_priority_rationale) {
      sections.push(`## Priority Rationale\n\n${ticket.compliance_priority_rationale}`);
    }
    if (ticket.affected_at_users?.length) {
      sections.push(`## Affected AT Users\n\n${ticket.affected_at_users.map(u => `- ${u}`).join('\n')}`);
    }
    if (ticket.affected_personas?.length) {
      sections.push(`## Affected Personas\n\n${ticket.affected_personas.map(p => `- ${p}`).join('\n')}`);
    }
    if (ticket.evidence_nuggets?.length) {
      sections.push(`## Evidence Nuggets\n\n${ticket.evidence_nuggets.map(n => `- ${n}`).join('\n')}`);
    }
    if (ticket.recommended_testing?.length) {
      sections.push(`## Recommended Testing\n\n${ticket.recommended_testing.map(t => `- ${t}`).join('\n')}`);
    }
    if (ticket.regression_risk) {
      sections.push(`## Regression Risk\n\n${ticket.regression_risk}`);
    }
    const a11yDeps: string[] = [];
    a11yDeps.push(`- Related engineering work: ${ticket.related_engineering_tickets?.length ? ticket.related_engineering_tickets.join(', ') : 'None'}`);
    sections.push(`## Dependencies\n\n${a11yDeps.join('\n')}`);
    if (ticket.compliance_deadline) {
      sections.push(`## Compliance Deadline\n\n${ticket.compliance_deadline}`);
    }
  }

  // Common footer — linked findings with statements + verbatim evidence
  if (ticket.addresses_findings?.length) {
    const owner = process.env.GITHUB_OWNER;
    const repo = process.env.GITHUB_REPO;
    const readoutPath = `${studyPath}/05-readouts/`;
    const readoutLink = `https://github.com/${owner}/${repo}/tree/main/${readoutPath}`;

    const findingLines = ticket.addresses_findings.map(fId => {
      const finding = findingsMap[fId];
      if (finding) {
        const severity = finding.severity ? ` (Severity ${finding.severity})` : '';
        return `- **${fId}**${severity} — ${finding.finding}`;
      }
      return `- **${fId}** — [see research readout](${readoutLink})`;
    });
    sections.push(`## Linked Findings\n\n${findingLines.join('\n')}`);

    // Collect verbatim quotes from supporting nuggets across all linked findings
    const quotes: Array<{ quote: string; source: string }> = [];
    for (const fId of ticket.addresses_findings) {
      const finding = findingsMap[fId];
      if (!finding) continue;

      if (finding.representative_quote && finding.representative_quote_source) {
        quotes.push({ quote: finding.representative_quote, source: finding.representative_quote_source });
      }

      const nuggetIds = finding.supporting_nuggets || [];
      for (const nId of nuggetIds.slice(0, 3)) {
        const detail = nuggetDetails[nId];
        if (detail?.verbatim_quote) {
          if (!quotes.some(q => q.quote === detail.verbatim_quote)) {
            const participant = detail.participant
              || (nId.match(/PT-\d+/) ? nId.match(/PT-\d+/)![0] : nId);
            quotes.push({
              quote: detail.verbatim_quote,
              source: participant,
            });
          }
        }
      }
    }

    if (quotes.length > 0) {
      const topQuotes = quotes.slice(0, 3);
      const quoteBlock = topQuotes.map(q => `> "${q.quote}"\n> — ${q.source}`).join('\n\n');
      sections.push(`<details>\n<summary>Research evidence</summary>\n\n${quoteBlock}\n\n</details>`);
    }
  }

  sections.push(`## Source\n\n- **Study:** ${studyName}\n- **Audience:** ${audience}\n- **Ticket ID:** ${ticket.id}\n- **Priority:** ${ticket.priority}\n- **Effort:** ${ticket.effort}\n\n---\n*Generated by Qori*`);

  return sections.join('\n\n');
}

// ═══════════════════════════════════════════════════════════
// LABEL GENERATION (audience-specific)
// ═══════════════════════════════════════════════════════════

function buildLabels(ticket: TicketCandidate, audience: AudienceKey, studyName: string): string[] {
  const labels: string[] = [
    `priority:${ticket.priority}`,
    `effort:${ticket.effort}`,
    `audience:${audience}`,
    `study:${studyName}`,
  ];

  if (audience === 'engineering') {
    if (ticket.effort_estimate_sprints && parseInt(ticket.effort_estimate_sprints) > 3) {
      labels.push('tech-debt');
    }
  }

  if (audience === 'accessibility') {
    if (ticket.wcag_criterion) {
      const criteria = ticket.wcag_criterion.split(',').map(c => c.trim()).filter(Boolean);
      for (const criterion of criteria) {
        const match = criterion.match(/(\d+\.\d+\.\d+)/);
        if (match) {
          labels.push(`wcag:${match[1]}`);
        }
      }
    }
    if (ticket.priority === 'P0_legal') {
      labels.push('compliance');
    }
  }

  return labels;
}

export {
  ticketHandler,
  handleStep1Submit,
  handleStep2Submit,
};
