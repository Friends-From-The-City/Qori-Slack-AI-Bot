import { researchBriefModal } from './researchBriefModal';
import { loadDiscoveryArtifacts, aggregateDiscoveryVariables, type DiscoveryArtifact } from '../../discoveryLoader';
import { formatVariableCategories } from '../../cascadeVariableCategories';
import { getProjectApprover } from '../../../services/authorization.service';
import {
  deriveBarrierCoverage,
  formatOutOfScopeSuggestions,
  formatParticipantHints,
  type DiscoveredBarrier,
} from '../../barrierCoverageDerivation';
import type { WebClient } from '@slack/web-api';

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
  participants?: string;
  recruitment?: string;
  questions?: string;
  outOfScope?: string;
}

interface BuildBriefEntryModalOptions {
  leadResearcher: string | null;
  channelId: string;
  projectId: number;
  projectName: string;
  projectSlug: string;
  source: 'qori_brief_command' | 'project_next_steps';
  client: WebClient;
}

/**
 * Synthesize pre-population values from aggregated discovery variables.
 * Returns { method, participants, questions, outOfScope } for field pre-fills.
 *
 * LAYER 3 DERIVATION (2026-06-09):
 * - Out-of-scope: derived from barrier coverage analysis (method vs. barrier categories)
 * - Participants: vague category-level hints only — NO fabricated numbers, orgs, or specifics
 * - Risks are NOT pre-filled here — consumed by brief generation (research_brief.yaml)
 *
 * FABRICATION REMOVED: No longer invents "3 screen reader users", "VA Section 508 Office", etc.
 * If discovery doesn't support a real implication → leave empty (honest-empty).
 */
function synthesizeCascadeFields(
  upstream: Record<string, string>,
  _artifacts: DiscoveryArtifact[],
  methodKey?: string
): CascadeFields {
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
    }
  }

  // ─── LAYER 3: Barrier coverage derivation ───────────────────────
  // Parse discovered barriers for coverage analysis
  const barrierText = upstream.upstream_discovered_barriers || '';
  let barriers: DiscoveredBarrier[] = [];

  if (barrierText) {
    // Barriers are formatted as markdown by formatObjectAsMarkdown:
    // **1.** Screen-transition latency exceeds abandonment threshold
    //   id: barrier-001
    //   summary: ...
    //   barrier_categories: performance
    //
    // **2.** Navigation structure misaligns with user mental models
    //   id: barrier-002
    //   barrier_categories: ia, task-flow

    // Split on numbered headers: **1.**, **2.**, etc.
    const barrierBlocks = barrierText.split(/(?=\*\*\d+\.\*\*)/);

    for (const block of barrierBlocks) {
      if (!block.trim()) continue;

      // The markdown format from formatObjectAsMarkdown puts the ID in the header:
      // **1.** barrier-001
      //   title: Screen-transition latency exceeds abandonment threshold
      //   barrier_categories: performance

      // Extract id from header: **1.** barrier-001
      const headerMatch = block.match(/\*\*\d+\.\*\*\s*(.+?)(?:\n|$)/);
      // Extract title from the title: line
      const titleMatch = block.match(/^\s*title:\s*(.+?)(?:\n|$)/im);
      // Extract barrier_categories: ia, task-flow (comma-separated, not JSON array)
      const catMatch = block.match(/^\s*barrier_categories:\s*(.+?)(?:\n|$)/im);

      if (headerMatch || titleMatch) {
        // Use title from the title: line, fall back to header content
        const title = titleMatch ? titleMatch[1].trim() : (headerMatch ? headerMatch[1].trim() : 'Unknown barrier');
        const id = headerMatch ? headerMatch[1].trim() : `barrier-${barriers.length + 1}`;

        // Parse categories - could be comma-separated or single value
        let categories: string[] = [];
        if (catMatch) {
          const catStr = catMatch[1].trim();
          // Handle both "ia, task-flow" and "performance" formats
          categories = catStr.split(',').map(c => c.trim().replace(/['"[\]]/g, ''));
        }

        barriers.push({
          id,
          title,
          barrier_categories: categories as DiscoveredBarrier['barrier_categories'],
        });
      }
    }

    console.log(`📊 Layer 3: Parsed ${barriers.length} barriers from discovery for coverage analysis`);
  }

  // Derive coverage if we have barriers and a method
  if (barriers.length > 0 && methodKey) {
    try {
      console.log(`📊 Layer 3: Deriving coverage for ${barriers.length} barriers with method '${methodKey}'`);
      const derivation = deriveBarrierCoverage(barriers, methodKey);
      console.log(`📊 Layer 3: Derivation complete: ${derivation.inScope.length} in-scope, ${derivation.outOfScope.length} out-of-scope, ${derivation.manualReview.length} manual-review`);

      // Out-of-scope suggestions (method-aware, traceable)
      if (derivation.outOfScope.length > 0) {
        result.outOfScope = formatOutOfScopeSuggestions(derivation.outOfScope, derivation.methodLabel);
        console.log(`📊 Layer 3: Generated out-of-scope text: ${result.outOfScope.substring(0, 100)}...`);
      }

      // Participant hints (vague category-level only, NO fabrication)
      if (derivation.participantHints.length > 0) {
        result.participants = formatParticipantHints(derivation.participantHints);
        console.log(`📊 Layer 3: Generated participant hints: ${result.participants.substring(0, 100)}...`);
      }
    } catch (derivationError) {
      const message = derivationError instanceof Error ? derivationError.message : String(derivationError);
      console.error(`❌ Layer 3: Derivation failed: ${message}`);
      // Continue without derivation - don't crash the modal
    }
  }

  // ─── NO FABRICATION ─────────────────────────────────────────────
  // Old code invented: "3 screen reader users", "VA Section 508 Office", etc.
  // REMOVED. If typed barriers don't support a real implication → leave empty.
  // Researcher fills in specifics based on their study needs.

  return result;
}

/**
 * Build the brief entry modal.
 * Cascade-aware: auto-selects discovery sources, pre-populates fields from discovery data.
 *
 * Phase 2D: Requires projectId. Study name is inherited from project (no study_name_block).
 */
export async function buildBriefEntryModal(options: BuildBriefEntryModalOptions) {
  const { leadResearcher, channelId, projectId, projectName, projectSlug, source, client } = options;
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

  // Replace editable stakeholder_select with read-only inherited stakeholder display
  // Look up project approver (stakeholder, or owner as fallback)
  const approverInfo = await getProjectApprover(projectId);
  let approverDisplay = 'Not set';
  let approverRoleLabel = 'project owner';

  if (approverInfo) {
    // Resolve display name from Slack
    try {
      const userInfo = await client.users.info({ user: approverInfo.userId });
      const user = userInfo.user as Record<string, unknown> | undefined;
      const profile = user?.profile as Record<string, unknown> | undefined;
      approverDisplay = (user?.real_name || profile?.display_name || user?.name || approverInfo.userId) as string;
    } catch {
      approverDisplay = `<@${approverInfo.userId}>`;
    }

    if (approverInfo.source === 'stakeholder') {
      approverRoleLabel = 'stakeholder';
    } else {
      approverRoleLabel = 'project owner';
    }
  }

  // Replace stakeholder_block with read-only context block
  const stakeholderIdx = modalBlocks.findIndex((b: Record<string, unknown>) => b.block_id === 'stakeholder_block');
  if (stakeholderIdx !== -1) {
    modalBlocks[stakeholderIdx] = {
      type: "context",
      block_id: "stakeholder_display_block",
      elements: [
        {
          type: "mrkdwn",
          text: `:bust_in_silhouette: *Approver:* ${approverDisplay} (${approverRoleLabel} — approves this brief)`,
        },
      ],
    };
  }

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
      // Note: Slack limits: checkbox text = 150 chars, value = 75 chars
      const checkboxOptions = artifacts.map(a => {
        const categories = formatVariableCategories(Object.keys(a.variables));
        const categoryLabel = categories || `${a.variableCount} vars`;
        // Truncate slug if needed (for both display and value)
        const maxSlugDisplay = 30;
        const displaySlug = a.slug.length > maxSlugDisplay
          ? a.slug.substring(0, maxSlugDisplay - 1) + '…'
          : a.slug;
        // Build compact display: "📊 *slug* · label · date"
        const baseText = `${a.icon} *${displaySlug}* · ${a.label} · ${a.date}`;
        const displayText = baseText.length > 150
          ? baseText.substring(0, 147) + '…'
          : baseText;
        // Value: truncate to 75 chars
        const rawValue = `${a.type}::${a.slug}`;
        const value = rawValue.length > 75 ? rawValue.substring(0, 75) : rawValue;
        return {
          text: { type: "mrkdwn", text: displayText },
          value,
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

      // Aggregate variables for pre-population (pre-fills only, no narration blocks)
      const upstream = aggregateDiscoveryVariables(artifacts) as Record<string, string>;

      // ─── Method resolution (needed for barrier coverage derivation) ───
      const radioOptions: Record<string, string> = {
        // Usability Testing
        'usability testing': 'usability_testing',
        'usability test': 'usability_testing',
        'usability study': 'usability_testing',
        'moderated usability testing': 'usability_testing',
        'moderated usability test': 'usability_testing',
        'unmoderated usability testing': 'usability_testing',
        // User Interviews
        'user interviews': 'user_interviews',
        'user interview': 'user_interviews',
        'interviews': 'user_interviews',
        'interview': 'user_interviews',
        // Contextual Inquiry
        'contextual inquiry': 'contextual_inquiry',
        'contextual inquiries': 'contextual_inquiry',
        // Concept Testing
        'concept testing': 'concept_testing',
        'concept test': 'concept_testing',
        'concept validation': 'concept_testing',
        // Survey Research
        'survey': 'survey',
        'survey research': 'survey',
        'surveys': 'survey',
        // Card Sorting
        'card sorting': 'card_sorting',
        'card sort': 'card_sorting',
        'card sorts': 'card_sorting',
        // Tree Testing
        'tree testing': 'tree_testing',
        'tree test': 'tree_testing',
        'tree tests': 'tree_testing',
        // Mixed Methods
        'mixed methods': 'mixed_methods',
        'mixed method': 'mixed_methods',
      };

      // Extract method suggestion from upstream, resolve to method key
      let resolvedMethodKey: string | undefined;
      let methodSuggestion: string | undefined;

      console.log(`📊 Layer 3: Discovery variables loaded: ${Object.keys(upstream).join(', ')}`);

      const methodRecs = upstream.upstream_methodology_recommendations;
      if (methodRecs) {
        const methods = methodRecs.split('\n').filter((l: string) => l.trim().startsWith('**') || l.trim().startsWith('-'));
        if (methods.length > 0) {
          const firstMethod = methods[0].replace(/^\*\*\d+\.\*\*\s*/, '').replace(/^-\s*/, '').split('\n')[0];
          const methodName = firstMethod.match(/method(?:_name)?:\s*(.+?)(?:,|$)/i)?.[1] || firstMethod.substring(0, 80);
          methodSuggestion = methodName.trim();
        }
      }

      if (methodSuggestion) {
        const methodLower = methodSuggestion.toLowerCase();
        // Check for exact match first
        resolvedMethodKey = radioOptions[methodLower];
        // If no exact match, check if method string CONTAINS any known method name
        if (!resolvedMethodKey) {
          const orderedKeys = Object.keys(radioOptions).sort((a, b) => b.length - a.length);
          for (const key of orderedKeys) {
            if (methodLower.includes(key)) {
              resolvedMethodKey = radioOptions[key];
              break;
            }
          }
        }
        // Check for combined/mixed methods indicators
        if (!resolvedMethodKey) {
          const combinedIndicators = ['followed by', 'then', ' + ', ' and ', 'combined with'];
          const isCombined = combinedIndicators.some(ind => methodLower.includes(ind));
          if (isCombined) {
            resolvedMethodKey = 'mixed_methods';
          }
        }
        // If still no match, it's a custom method
        if (!resolvedMethodKey) {
          resolvedMethodKey = 'custom';
        }
      }

      // Now call synthesizeCascadeFields WITH the resolved method key
      console.log(`📊 Layer 3: Method resolved to '${resolvedMethodKey || 'none'}' from suggestion '${methodSuggestion || 'none'}'`);
      const cascade = synthesizeCascadeFields(upstream, artifacts, resolvedMethodKey);
      console.log(`📊 Layer 3: Cascade fields derived: outOfScope=${!!cascade.outOfScope}, participants=${!!cascade.participants}, method=${!!cascade.method}`);

      // Pre-populate method — hybrid radio + override (reuse resolution above)
      if (methodSuggestion) {
        const methodLower = methodSuggestion.toLowerCase();
        let matchedRadio = radioOptions[methodLower];
        if (!matchedRadio) {
          const orderedKeys = Object.keys(radioOptions).sort((a, b) => b.length - a.length);
          for (const key of orderedKeys) {
            if (methodLower.includes(key)) {
              matchedRadio = radioOptions[key];
              break;
            }
          }
        }
        if (!matchedRadio) {
          const combinedIndicators = ['followed by', 'then', ' + ', ' and ', 'combined with'];
          const isCombined = combinedIndicators.some(ind => methodLower.includes(ind));
          if (isCombined) {
            matchedRadio = 'mixed_methods';
          }
        }

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
        } else {
          // Doesn't match radio — pre-fill override text field
          const overrideIdx = modalBlocks.findIndex((b: Record<string, unknown>) => b.block_id === 'method_override_block');
          if (overrideIdx !== -1) {
            modalBlocks[overrideIdx] = {
              ...modalBlocks[overrideIdx],
              element: { ...(modalBlocks[overrideIdx].element as Record<string, unknown>), initial_value: cascade.method },
            };
          }
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
        }
      }

      // Pre-populate participants (composition only)
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
        }
      }

      // Pre-populate recruitment sources (separate from composition)
      if (cascade.recruitment) {
        const recruitIdx = modalBlocks.findIndex((b: Record<string, unknown>) => b.block_id === 'recruitment_sources_block');
        if (recruitIdx !== -1) {
          modalBlocks[recruitIdx] = {
            ...modalBlocks[recruitIdx],
            element: {
              ...(modalBlocks[recruitIdx].element as Record<string, unknown>),
              initial_value: cascade.recruitment,
            },
          };
        }
      }

      // Note: Risks from upstream_stakeholder_constraints are consumed by brief
      // generation (research_brief.yaml risks task), not displayed in modal.
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
