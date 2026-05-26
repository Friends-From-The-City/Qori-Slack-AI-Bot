import { researchBriefModal } from './researchBriefModal';
import { loadDiscoveryArtifacts, aggregateDiscoveryVariables, type DiscoveryArtifact } from '../../discoveryLoader';
import { formatVariableCategories } from '../../cascadeVariableCategories';

// ─── Modal metadata contract ─────────────────────────────────────

/** The shape of private_metadata for the research_brief_modal. */
export interface BriefEntryModalMetadata {
  channelId: string;
  projectId: number;
  projectName: string;
  projectSlug: string;
  source: 'qori_brief_command' | 'project_next_steps';
}

interface CascadeFields {
  method?: string;
  methodHint?: string;
  participants?: string;
  participantsHint?: string;
  questions?: string;
  questionsHint?: string;
  outOfScope?: string;
  outOfScopeHint?: string;
  risksPreview?: string;
}

interface BuildBriefEntryModalOptions {
  leadResearcher: string | null;
  channelId: string;
  projectId: number;
  projectName: string;
  projectSlug: string;
  source: 'qori_brief_command' | 'project_next_steps';
}

/**
 * Synthesize pre-population values from aggregated discovery variables.
 * Returns { method, methodHint, participants, participantsHint, questions, questionsHint, outOfScope, outOfScopeHint, risksPreview }
 */
function synthesizeCascadeFields(upstream: Record<string, string>, artifacts: DiscoveryArtifact[]): CascadeFields {
  const result: CascadeFields = {};

  // Method — from methodology_recommendations
  const methodRecs = upstream.upstream_methodology_recommendations;
  if (methodRecs) {
    // Find most-recommended method (appears in most sources)
    const methods = methodRecs.split('\n').filter((l: string) => l.trim().startsWith('**') || l.trim().startsWith('-'));
    if (methods.length > 0) {
      // Use first recommendation's method name
      const firstMethod = methods[0].replace(/^\*\*\d+\.\*\*\s*/, '').replace(/^-\s*/, '').split('\n')[0];
      const methodName = firstMethod.match(/method(?:_name)?:\s*(.+?)(?:,|$)/i)?.[1] || firstMethod.substring(0, 80);
      result.method = methodName.trim();
      result.methodHint = `Recommended by ${artifacts.length} discovery source${artifacts.length === 1 ? '' : 's'}`;
    }
  }

  // Research questions — from stakeholder_questions_for_users (Blocking + first Important)
  const questions = upstream.upstream_stakeholder_questions_for_users;
  if (questions) {
    const lines = questions.split('\n').filter((l: string) => l.trim());
    // Extract question text from the formatted objects
    const questionTexts: string[] = [];
    for (const line of lines) {
      const qMatch = line.match(/research_question:\s*(.+)/i) || line.match(/question:\s*(.+)/i);
      if (qMatch) {
        questionTexts.push(qMatch[1].trim());
      }
    }
    if (questionTexts.length > 0) {
      result.questions = questionTexts.slice(0, 3).map((q, i) => `${i + 1}. ${q}`).join('\n');
      result.questionsHint = `Pulled from stakeholder questions for users (${Math.min(questionTexts.length, 3)} of ${questionTexts.length} selected)`;
    }
  }

  // Out of scope — items discovery already established
  const barriers = upstream.upstream_discovered_barriers;
  if (barriers) {
    const established: string[] = [];
    // Look for high-confidence barriers that are already proven
    const barrierLines = barriers.split('\n').filter((l: string) => l.trim());
    for (const line of barrierLines) {
      const titleMatch = line.match(/title:\s*(.+)/i);
      if (titleMatch) {
        established.push(titleMatch[1].trim());
      }
    }
    if (established.length > 0) {
      result.outOfScope = established.slice(0, 2).map(e => `${e} (already established by discovery)`).join('\n');
      result.outOfScopeHint = `First items pre-populated — discovery already established these findings`;
    }
  }

  // Participants — synthesize from discovery evidence
  const segments: string[] = [];
  const participantHints: string[] = [];

  // Check for AT user evidence from constraints or survey
  const constraintText = upstream.upstream_stakeholder_constraints || '';
  const surveyText = upstream.upstream_survey_themes || '';
  const barrierText = upstream.upstream_discovered_barriers || '';

  if (constraintText.match(/screen.reader|assistive.tech|508|accessibility/i) ||
      surveyText.match(/screen.reader|assistive.tech|accessibility/i) ||
      barrierText.match(/screen.reader|assistive.tech|accessibility/i)) {
    segments.push('3 screen reader users');
    segments.push('2 voice control users');
    participantHints.push('AT users flagged by discovery');
  }

  // Check for age-related patterns
  if (barrierText.match(/age|older|65\+|senior/i) ||
      surveyText.match(/age|older|65\+|senior/i)) {
    segments.push('at least 3 aged 65+');
    participantHints.push('age-related barriers in discovery');
  }

  if (segments.length > 0) {
    result.participants = `8-12 Veterans, including ${segments.join(', ')}. Mix of iOS and Android users. Recruited via VA Section 508 Office and MHV coordinators.`;
    result.participantsHint = `Composition reflects discovery: ${participantHints.join('; ')}`;
  }

  // Risks preview — from stakeholder_constraints
  const constraints = upstream.upstream_stakeholder_constraints;
  if (constraints) {
    const riskLines: string[] = [];
    const constraintBlocks = constraints.split('\n\n').filter((b: string) => b.trim());
    for (const block of constraintBlocks.slice(0, 3)) {
      const constraintMatch = block.match(/constraint:\s*(.+)/i);
      const sourceMatch = block.match(/source(?:_role)?:\s*(.+)/i);
      if (constraintMatch) {
        const risk = constraintMatch[1].trim().substring(0, 80);
        const source = sourceMatch ? sourceMatch[1].trim() : 'Stakeholder';
        riskLines.push(`- ${risk} (${source})`);
      }
    }
    result.risksPreview = riskLines.join('\n');
  }

  return result;
}

/**
 * Build the brief entry modal.
 * Cascade-aware: auto-selects discovery, pre-populates fields with sparkle markers.
 *
 * Phase 2D: Requires projectId. Study name is inherited from project (no study_name_block).
 */
export async function buildBriefEntryModal(options: BuildBriefEntryModalOptions) {
  const { leadResearcher, channelId, projectId, projectName, projectSlug, source } = options;
  const modalBlocks: Record<string, unknown>[] = JSON.parse(JSON.stringify(researchBriefModal.blocks));

  // Remove study_name_block — study inherits project name
  const studyNameIdx = modalBlocks.findIndex((b: Record<string, unknown>) => b.block_id === 'study_name_block');
  if (studyNameIdx !== -1) {
    modalBlocks.splice(studyNameIdx, 1);
  }

  // Add project context block at the top (after first context/divider)
  const projectContextBlock = {
    type: "context",
    block_id: "project_context_block",
    elements: [
      {
        type: "mrkdwn",
        text: `:file_folder: Creating research brief for project *${projectName}*`,
      },
    ],
  };
  // Insert after first block (usually a header context)
  modalBlocks.splice(1, 0, projectContextBlock);

  // Pre-fill lead researcher if available
  if (leadResearcher) {
    const leadIdx = modalBlocks.findIndex((b: Record<string, unknown>) => b.block_id === 'lead_researcher_block' || b.block_id === 'lead_researcher');
    if (leadIdx !== -1) {
      modalBlocks[leadIdx] = {
        ...modalBlocks[leadIdx],
        element: { ...(modalBlocks[leadIdx].element as Record<string, unknown>), initial_value: leadResearcher },
      };
    }
  }

  // Calculate default start date (next Monday)
  const today = new Date();
  const dayOfWeek = today.getDay();
  const daysUntilMonday = dayOfWeek === 0 ? 1 : (8 - dayOfWeek);
  const nextMonday = new Date(today);
  nextMonday.setDate(today.getDate() + daysUntilMonday);
  const defaultStartDate = nextMonday.toISOString().split('T')[0];

  const startDateIndex = modalBlocks.findIndex((b: Record<string, unknown>) => b.block_id === 'start_date_block');
  if (startDateIndex !== -1) {
    modalBlocks[startDateIndex] = {
      ...modalBlocks[startDateIndex],
      element: { ...(modalBlocks[startDateIndex].element as Record<string, unknown>), initial_date: defaultStartDate },
    };
  }

  // Query discovery artifacts for this project
  let artifacts: DiscoveryArtifact[] = [];
  try {
    artifacts = await loadDiscoveryArtifacts(projectId);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn('⚠️ Failed to load discovery artifacts for brief modal:', message);
  }

  // Find the discovery placeholder blocks and replace
  const headerIdx = modalBlocks.findIndex((b: Record<string, unknown>) => b.block_id === 'discovery_header_block');
  const statusIdx = modalBlocks.findIndex((b: Record<string, unknown>) => b.block_id === 'discovery_status_block');

  if (headerIdx !== -1 && statusIdx !== -1) {
    if (artifacts.length === 0) {
      // No discovery — show empty state
      modalBlocks[statusIdx] = {
        type: "context",
        block_id: "discovery_status_block",
        elements: [
          {
            type: "mrkdwn",
            text: "⚠️ No discovery research available for this team yet. Run `/qori-discover` first to add organizational context, or proceed without — brief will be generated from your inputs alone.",
          },
        ],
      };
    } else {
      // Build checkbox options from artifacts — AUTO-SELECT ALL
      const checkboxOptions = artifacts.map(a => {
        const categories = formatVariableCategories(Object.keys(a.variables));
        const categoryLabel = categories || `${a.variableCount} variables`;
        return {
          text: {
            type: "mrkdwn",
            text: `${a.icon} *${a.slug}*\n      ${a.label} · ${categoryLabel} · ${a.date}`,
          },
          value: `${a.type}::${a.slug}`,
        };
      });

      // Status with auto-selected message
      modalBlocks[statusIdx] = {
        type: "context",
        block_id: "discovery_status_block",
        elements: [
          {
            type: "mrkdwn",
            text: `✅ ${artifacts.length} discovery source${artifacts.length === 1 ? '' : 's'} available — auto-selected`,
          },
        ],
      };

      // Checkboxes with ALL pre-selected (initial_options = all options)
      const checkboxBlock = {
        type: "input",
        block_id: "discovery_selection_block",
        optional: true,
        label: {
          type: "plain_text",
          text: "Discovery sources",
        },
        element: {
          type: "checkboxes",
          action_id: "discovery_selection",
          options: checkboxOptions,
          initial_options: checkboxOptions, // AUTO-SELECT ALL
        },
      };

      // Insert checkbox block after status
      modalBlocks.splice(statusIdx + 1, 0, checkboxBlock);

      // Aggregate variables for pre-population
      const upstream = aggregateDiscoveryVariables(artifacts) as Record<string, string>;
      const cascade = synthesizeCascadeFields(upstream, artifacts);

      // Build cascade-suggests blocks
      const cascadeBlocks: Record<string, unknown>[] = [];

      cascadeBlocks.push({ type: "divider" });
      cascadeBlocks.push({
        type: "context",
        elements: [{
          type: "mrkdwn",
          text: "🤖 *Discovery suggests* — Edit any field to override. Uncheck sources above to exclude.",
        }],
      });

      // Pre-populate method — hybrid radio + override
      if (cascade.method) {
        // Check if cascade method matches a radio option
        const radioOptions: Record<string, string> = {
          'usability testing': 'usability_testing',
          'moderated usability testing': 'usability_testing',
          'user interviews': 'user_interviews',
          'contextual inquiry': 'contextual_inquiry',
          'concept testing': 'concept_testing',
          'survey': 'survey',
          'survey research': 'survey',
          'card sorting': 'card_sorting',
          'tree testing': 'tree_testing',
          'mixed methods': 'mixed_methods',
        };
        const matchedRadio = radioOptions[cascade.method.toLowerCase()];

        if (matchedRadio) {
          // Matches a radio option — pre-select it
          const methodIdx = modalBlocks.findIndex((b: Record<string, unknown>) => b.block_id === 'research_method_block');
          if (methodIdx !== -1) {
            const element = modalBlocks[methodIdx].element as Record<string, unknown>;
            const opts = element.options as Array<{ value: string }>;
            const matchedOpt = opts.find(o => o.value === matchedRadio);
            if (matchedOpt) {
              modalBlocks[methodIdx] = {
                ...modalBlocks[methodIdx],
                element: { ...element, initial_option: matchedOpt },
              };
            }
          }
          cascadeBlocks.push({
            type: "context",
            elements: [{ type: "mrkdwn", text: `✨ *Method:* ${cascade.method} — ${cascade.methodHint}` }],
          });
        } else {
          // Doesn't match radio — pre-fill override text field
          const overrideIdx = modalBlocks.findIndex((b: Record<string, unknown>) => b.block_id === 'method_override_block');
          if (overrideIdx !== -1) {
            modalBlocks[overrideIdx] = {
              ...modalBlocks[overrideIdx],
              element: { ...(modalBlocks[overrideIdx].element as Record<string, unknown>), initial_value: cascade.method },
            };
          }
          cascadeBlocks.push({
            type: "context",
            elements: [{ type: "mrkdwn", text: `✨ *Method:* Discovery recommends combined method — using custom field. ${cascade.methodHint}` }],
          });
        }
      }

      // Pre-populate research questions (learning objectives field)
      if (cascade.questions) {
        const learningIdx = modalBlocks.findIndex((b: Record<string, unknown>) => b.block_id === 'learning_objectives_block');
        if (learningIdx !== -1) {
          modalBlocks[learningIdx] = {
            ...modalBlocks[learningIdx],
            element: {
              ...(modalBlocks[learningIdx].element as Record<string, unknown>),
              initial_value: cascade.questions,
            },
          };
          cascadeBlocks.push({
            type: "context",
            elements: [{
              type: "mrkdwn",
              text: `✨ *Research questions:* ${cascade.questionsHint}`,
            }],
          });
        }
      }

      // Pre-populate out of scope
      if (cascade.outOfScope) {
        const oosIdx = modalBlocks.findIndex((b: Record<string, unknown>) => b.block_id === 'out_of_scope_block');
        if (oosIdx !== -1) {
          modalBlocks[oosIdx] = {
            ...modalBlocks[oosIdx],
            element: {
              ...(modalBlocks[oosIdx].element as Record<string, unknown>),
              initial_value: cascade.outOfScope,
            },
          };
          cascadeBlocks.push({
            type: "context",
            elements: [{
              type: "mrkdwn",
              text: `✨ *Out of scope:* ${cascade.outOfScopeHint}`,
            }],
          });
        }
      }

      // Pre-populate participants
      if (cascade.participants) {
        const partIdx = modalBlocks.findIndex((b: Record<string, unknown>) => b.block_id === 'participant_approach_block');
        if (partIdx !== -1) {
          modalBlocks[partIdx] = {
            ...modalBlocks[partIdx],
            element: {
              ...(modalBlocks[partIdx].element as Record<string, unknown>),
              initial_value: cascade.participants,
            },
          };
          cascadeBlocks.push({
            type: "context",
            elements: [{
              type: "mrkdwn",
              text: `✨ *Participants:* ${cascade.participantsHint}`,
            }],
          });
        }
      }

      // Risks preview from constraints
      if (cascade.risksPreview) {
        cascadeBlocks.push({
          type: "context",
          elements: [{
            type: "mrkdwn",
            text: `⚠️ *Risks preview* (from stakeholder constraints):\n${cascade.risksPreview}`,
          }],
        });
      }

      // Insert all cascade blocks after the checkbox block
      const insertIdx = statusIdx + 2; // after status + checkbox
      modalBlocks.splice(insertIdx, 0, ...cascadeBlocks);
    }
  }

  return {
    ...researchBriefModal,
    blocks: modalBlocks,
    private_metadata: JSON.stringify({
      channelId,
      projectId,
      projectName,
      projectSlug,
      source,
    } satisfies BriefEntryModalMetadata),
  };
}
