/**
 * ticketHandler.js — /qori-tickets command
 *
 * Creates GitHub Issues from ticket_candidates stored in Postgres.
 * Review-before-create: researcher selects which tickets to create.
 * Supports designer, engineering, and accessibility audiences.
 */
const { getStudiesByUser, getResearchStudyWithRoles } = require('../../../services/research_study.service');

const AUDIENCE_CONFIG = {
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

const ticketHandler = async ({ ack, body, client, command }) => {
  try {
    await ack();

    const userId = command.user_id;
    const studies = await getStudiesByUser(userId);

    if (!studies || studies.length === 0) {
      await client.chat.postEphemeral({
        channel: command.channel_id,
        user: userId,
        text: '❌ No studies found. Create a study first.',
      });
      return;
    }

    await client.views.open({
      trigger_id: command.trigger_id,
      view: buildStep1Modal(studies, command),
    });
  } catch (error) {
    console.error('❌ ticketHandler error:', error.message);
  }
};

function buildStep1Modal(studies, command) {
  const studyOptions = studies.slice(0, 10).map(s => ({
    text: { type: 'plain_text', text: s.name },
    value: s.id.toString(),
  }));

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
        label: { type: 'plain_text', text: 'Study' },
        element: {
          type: 'static_select',
          action_id: 'study_select_action',
          placeholder: { type: 'plain_text', text: 'Choose a study...' },
          options: studyOptions,
        },
      },
      {
        type: 'input',
        block_id: 'audience_select',
        label: { type: 'plain_text', text: 'Audience' },
        element: {
          type: 'static_select',
          action_id: 'audience_select_action',
          placeholder: { type: 'plain_text', text: 'Choose audience...' },
          options: [
            { text: { type: 'plain_text', text: '🎨 Designer' }, value: 'designer' },
            { text: { type: 'plain_text', text: '⚙️ Engineering' }, value: 'engineering' },
            { text: { type: 'plain_text', text: '♿ Accessibility' }, value: 'accessibility' },
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

const handleStep1Submit = async ({ ack, body, view, client }) => {
  const values = view.state.values;
  const studyId = values.study_select?.study_select_action?.selected_option?.value;
  const audience = values.audience_select?.audience_select_action?.selected_option?.value;
  const meta = JSON.parse(view.private_metadata || '{}');

  if (!studyId || !audience) {
    await ack({ response_action: 'errors', errors: { study_select: 'Select a study', audience_select: 'Select an audience' } });
    return;
  }

  const config = AUDIENCE_CONFIG[audience];
  if (!config) {
    await ack({ response_action: 'errors', errors: { audience_select: 'Invalid audience' } });
    return;
  }

  // Look up study
  const studies = await getStudiesByUser(body.user.id);
  const study = studies.find(s => s.id.toString() === studyId);
  if (!study) {
    await ack({ response_action: 'errors', errors: { study_select: 'Study not found' } });
    return;
  }

  // Query ticket_candidates from Postgres
  const sequelize = require('../../../database');
  const StudyVariable = sequelize.models?.StudyVariable;
  const CreatedIssue = sequelize.models?.CreatedIssue;

  let tickets = [];
  try {
    const row = await StudyVariable.findOne({
      where: {
        study_name: study.name,
        variable_key: config.variableKey,
        scope: 'study',
      },
      attributes: ['value'],
    });

    if (!row || !row.value || !Array.isArray(row.value)) {
      await ack({
        response_action: 'errors',
        errors: { audience_select: `No ${config.label} tickets found. Generate the ${config.label} readout first.` },
      });
      return;
    }

    tickets = row.value;
  } catch (err) {
    console.error('❌ Error loading tickets:', err.message);
    await ack({ response_action: 'errors', errors: { study_select: 'Error loading tickets' } });
    return;
  }

  // Check which tickets already have GitHub issues
  let existingIssues = [];
  if (CreatedIssue) {
    try {
      existingIssues = await CreatedIssue.findAll({
        where: { study_name: study.name, audience },
        attributes: ['ticket_id', 'github_issue_number', 'github_url'],
      });
    } catch (err) {
      console.warn('⚠️ Could not check existing issues:', err.message);
    }
  }
  const existingTicketIds = new Set(existingIssues.map(i => i.ticket_id));

  // Build Step 2 modal with ticket checkboxes
  const ticketOptions = tickets.map(t => {
    const alreadyCreated = existingTicketIds.has(t.id);
    const findingsCount = Array.isArray(t.addresses_findings) ? t.addresses_findings.length : 0;
    const label = `*${t.id}* — ${t.title}`;
    const desc = `${t.priority} · ${t.effort} · ${findingsCount} finding(s)${alreadyCreated ? ' · ✅ Already created' : ''}`;

    return {
      text: { type: 'mrkdwn', text: label },
      description: { type: 'plain_text', text: desc },
      value: t.id,
    };
  });

  // Filter out already-created for initial selection (all uncreated checked by default)
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

  await ack({ response_action: 'update', view: step2View });
};

// ═══════════════════════════════════════════════════════════
// STEP 2 SUBMIT: Create GitHub Issues
// ═══════════════════════════════════════════════════════════

const handleStep2Submit = async ({ ack, body, view, client }) => {
  await ack();

  const values = view.state.values;
  const meta = JSON.parse(view.private_metadata || '{}');
  const { studyName, audience } = meta;
  const userId = body.user.id;

  const selectedTicketIds = values.ticket_selection?.ticket_checkboxes?.selected_options?.map(o => o.value) || [];

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
  const sequelize = require('../../../database');
  const StudyVariable = sequelize.models?.StudyVariable;
  const CreatedIssue = sequelize.models?.CreatedIssue;

  let tickets = [];
  let findings = [];
  let nuggetDetails = {};
  try {
    // Load ticket candidates
    const ticketRow = await StudyVariable.findOne({
      where: { study_name: studyName, variable_key: config.variableKey, scope: 'study' },
      attributes: ['value'],
    });
    tickets = (ticketRow?.value || []).filter(t => selectedTicketIds.includes(t.id));

    // Load prioritized_findings for finding statements
    const findingsRow = await StudyVariable.findOne({
      where: { study_name: studyName, variable_key: 'prioritized_findings', scope: 'study' },
      attributes: ['value'],
    });
    findings = findingsRow?.value || [];

    // Load atomic_nugget_detail for verbatim quotes
    const detailRows = await StudyVariable.findAll({
      where: { study_name: studyName, variable_key: 'atomic_nugget_detail', scope: 'study' },
      attributes: ['item_key', 'value'],
    });
    // Build lookup: nugget ID → detail object
    // Handle both pool items (individual rows) and singleton array (one row)
    for (const row of detailRows) {
      if (row.item_key && row.value) {
        nuggetDetails[row.item_key] = row.value;
      } else if (!row.item_key && Array.isArray(row.value)) {
        // Singleton array: extract each item by id
        for (const item of row.value) {
          if (item.id) nuggetDetails[item.id] = item;
        }
      }
    }
  } catch (err) {
    console.error('❌ Error loading ticket data:', err.message);
    await client.chat.postMessage({ channel: userId, text: `❌ Error loading tickets: ${err.message}` });
    return;
  }

  // Build findings lookup: finding ID → finding object
  const findingsMap = {};
  for (const f of findings) {
    if (f.id) findingsMap[f.id] = f;
  }

  // Acknowledge
  await client.chat.postMessage({
    channel: userId,
    text: `🔄 Creating ${tickets.length} GitHub Issue(s) for *${config.label}* audience...`,
  });

  // Create issues sequentially
  const { Octokit } = await import('@octokit/rest');
  const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
  const owner = process.env.GITHUB_OWNER;
  const repo = process.env.GITHUB_REPO;
  const repoFull = `${owner}/${repo}`;

  const created = [];
  const failed = [];

  for (const ticket of tickets) {
    try {
      const issueBody = formatIssueBody(ticket, audience, studyName, findingsMap, nuggetDetails);
      const labels = buildLabels(ticket, audience, studyName);

      const { data } = await octokit.rest.issues.create({
        owner,
        repo,
        title: ticket.title,
        body: issueBody,
        labels,
      });

      // Track in Postgres
      if (CreatedIssue) {
        try {
          await CreatedIssue.create({
            study_name: studyName,
            audience,
            ticket_id: ticket.id,
            github_issue_number: data.number,
            github_url: data.html_url,
            github_repo: repoFull,
            created_by: userId,
          });
        } catch (dbErr) {
          // Duplicate or DB error — log but don't fail
          console.warn(`⚠️ Could not track issue in DB: ${dbErr.message}`);
        }
      }

      created.push({ number: data.number, url: data.html_url, title: ticket.title, id: ticket.id });
      console.log(`✅ Created issue #${data.number}: ${ticket.title}`);
    } catch (err) {
      console.error(`❌ Failed to create issue "${ticket.title}":`, err.message);
      failed.push({ id: ticket.id, title: ticket.title, error: err.message });
    }
  }

  // Send summary DM
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

function formatIssueBody(ticket, audience, studyName, findingsMap = {}, nuggetDetails = {}) {
  const sections = [];

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
    const designDeps = [];
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
    const engDeps = [];
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
    const a11yDeps = [];
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
    const readoutPath = `${studyName}/primary-research/05-reports/`;
    const readoutLink = `https://github.com/${owner}/${repo}/tree/main/${readoutPath}`;

    // Finding statements with severity
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
    const quotes = [];
    for (const fId of ticket.addresses_findings) {
      const finding = findingsMap[fId];
      if (!finding) continue;

      // Use representative_quote from finding itself
      if (finding.representative_quote && finding.representative_quote_source) {
        quotes.push({ quote: finding.representative_quote, source: finding.representative_quote_source });
      }

      // Also pull from supporting_nuggets → atomic_nugget_detail
      const nuggetIds = finding.supporting_nuggets || [];
      for (const nId of nuggetIds.slice(0, 3)) { // Max 3 per finding
        const detail = nuggetDetails[nId];
        if (detail?.verbatim_quote) {
          // Avoid duplicating the representative_quote
          if (!quotes.some(q => q.quote === detail.verbatim_quote)) {
            // Extract participant code from nugget ID (nugget-PT-003-001 → PT-003)
            // or use detail.participant field. Never show raw nugget ID as attribution.
            const participant = detail.participant
              || (nId.match(/PT-\d+/) ? nId.match(/PT-\d+/)[0] : nId);
            quotes.push({
              quote: detail.verbatim_quote,
              source: participant,
            });
          }
        }
      }
    }

    // Add collapsed research evidence if we have quotes
    if (quotes.length > 0) {
      // Limit to 3 most representative quotes total
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

function buildLabels(ticket, audience, studyName) {
  const labels = [
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
      // WCAG field may contain multiple criteria comma-separated — split into individual labels
      // Also sanitize: GitHub labels can't contain commas
      const criteria = ticket.wcag_criterion.split(',').map(c => c.trim()).filter(Boolean);
      for (const criterion of criteria) {
        // Extract just the number (e.g., "1.4.4" from "1.4.4 Resize Text")
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

module.exports = {
  ticketHandler,
  handleStep1Submit,
  handleStep2Submit,
};
