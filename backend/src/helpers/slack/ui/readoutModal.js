const buildReadoutModal = (state = {}) => {
  const selectedStudy = state.selectedStudy || null;
  const reportType = state.reportType || 'research_readout';
  const hasReadout = state.hasReadout || false;
  const readoutStats = state.readoutStats || null;

  // Create minimal state for private metadata to avoid size limits
  const minimalState = {
    selectedStudyId: selectedStudy?.id || null,
    selectedStudyName: selectedStudy?.name || null,
    selectedStudyPath: selectedStudy?.path || null,
    reportType,
    hasReadout,
    origin: state.origin
  };

  const getReportTypeCards = () => {
    return [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: '*What do you want to generate?*'
        }
      },
      {
        type: 'actions',
        block_id: 'report_type_selection',
        elements: [
          {
            type: 'button',
            action_id: 'select_research_readout',
            text: { type: 'plain_text', text: 'Research Readout' },
            style: reportType === 'research_readout' ? 'primary' : undefined,
            value: 'research_readout'
          },
          {
            type: 'button',
            action_id: 'select_targeted_readouts',
            text: { type: 'plain_text', text: 'Targeted Readouts' },
            style: reportType === 'targeted_readouts' ? 'primary' : undefined,
            value: 'targeted_readouts'
          }
        ]
      },
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: reportType === 'research_readout'
              ? '📄 *Research Readout* — Comprehensive findings, recommendations, and decisions from all research data'
              : '🎯 *Targeted Readouts* — Generate audience-specific reports from an existing research readout'
          }
        ]
      }
    ];
  };

  const getTargetedReadoutsConfig = () => {
    if (reportType !== 'targeted_readouts') return [];

    // Show error state if no research readout exists
    if (!hasReadout) {
      return [
        { type: 'divider' },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: '❌ *Research readout required*\n\nTargeted readouts consume findings from an existing research readout. Run a Research Readout first, then come back to generate audience-specific reports.'
          }
        },
        {
          type: 'context',
          elements: [
            {
              type: 'mrkdwn',
              text: '_Switch to "Research Readout" above to generate one now._'
            }
          ]
        }
      ];
    }

    // Show cascade context + audience checkboxes
    const blocks = [
      { type: 'divider' },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `✅ *Research readout available*${readoutStats ? `\n${readoutStats}` : ''}`
        }
      },
      {
        type: 'input',
        block_id: 'audience_selection',
        label: { type: 'plain_text', text: 'Generate for' },
        element: {
          type: 'checkboxes',
          action_id: 'audience_checkboxes',
          options: [
            {
              text: { type: 'mrkdwn', text: '*🎨 Designer* — design challenges + ticket candidates' },
              description: { type: 'plain_text', text: 'Creates GitHub Issues after review' },
              value: 'Design Team'
            },
            {
              text: { type: 'mrkdwn', text: '*⚙️ Engineering* — technical challenges + ticket candidates' },
              description: { type: 'plain_text', text: 'Creates GitHub Issues after review' },
              value: 'Engineering Team'
            },
            {
              text: { type: 'mrkdwn', text: '*♿ Accessibility* — WCAG compliance + ticket candidates' },
              description: { type: 'plain_text', text: 'Creates GitHub Issues after review' },
              value: 'Accessibility Team'
            },
            {
              text: { type: 'mrkdwn', text: '*👔 Leadership* — executive brief (BLUF style)' },
              description: { type: 'plain_text', text: 'Document only — no tickets' },
              value: 'Executive Leadership'
            }
          ]
        }
      },
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: '_Select one or more audiences. Each generates a separate document. Ticket candidates land in the document for review before GitHub Issues creation._'
          }
        ]
      }
    ];

    return blocks;
  };

  return {
    type: 'modal',
    callback_id: 'readout_modal_submit',
    private_metadata: JSON.stringify(minimalState),
    title: { type: 'plain_text', text: 'Research Reports' },
    submit: { type: 'plain_text', text: reportType === 'targeted_readouts' && !hasReadout ? 'Switch to Readout' : 'Generate' },
    close: { type: 'plain_text', text: 'Cancel' },
    blocks: [
      // Study Selection
      {
        type: 'input',
        block_id: 'study_selection',
        label: { type: 'plain_text', text: 'Study' },
        element: {
          type: 'static_select',
          action_id: 'study_selection_change',
          placeholder: { type: 'plain_text', text: 'Choose a research study...' },
          options: (state.availableStudies || []).slice(0, 10).map(study => ({
            text: { type: 'plain_text', text: study.name },
            value: study.id.toString()
          })),
          initial_option: selectedStudy ? {
            text: { type: 'plain_text', text: selectedStudy.name },
            value: selectedStudy.id.toString()
          } : undefined
        }
      },

      // Report Type Selection
      ...getReportTypeCards(),

      // Targeted Readouts Configuration (conditionally shown)
      ...getTargetedReadoutsConfig(),
    ]
  };
};

module.exports = { buildReadoutModal };
