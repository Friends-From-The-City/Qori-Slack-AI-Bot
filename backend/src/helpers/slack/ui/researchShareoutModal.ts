export const researchShareoutModal = {
  type: "modal",
  callback_id: "research-shareout-submit",
  title: {
    type: "plain_text",
    text: "Research Shareouts",
  },
  submit: {
    type: "plain_text",
    text: "Select Shareout Type",
  },
  close: {
    type: "plain_text",
    text: "Cancel",
  },
  blocks: [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: "*Create summaries and presentations from your research findings*",
      },
    },
    {
      type: "input",
      block_id: "shareout_type",
      dispatch_action: true,
      label: {
        type: "plain_text",
        text: "Shareout Type *",
      },
      element: {
        type: "static_select",
        action_id: "type_select",
        placeholder: {
          type: "plain_text",
          text: "Select shareout type...",
        },
        options: [
          {
            text: {
              type: "plain_text",
              text: "🎯 Stakeholder Summary – 1-minute TL;DR for executives",
            },
            value: "stakeholder_summary",
          },
          {
            text: {
              type: "plain_text",
              text: "📊 Executive Readout – High-level findings presentation",
            },
            value: "executive_readout",
          },
          {
            text: {
              type: "plain_text",
              text: "👥 Team Shareout – Internal research presentation",
            },
            value: "team_shareout",
          },
          {
            text: {
              type: "plain_text",
              text: "📄 Research Report – Detailed findings document",
            },
            value: "research_report",
          },
          {
            text: {
              type: "plain_text",
              text: "🏛️ Policy Brief – Recommendations for government",
            },
            value: "policy_brief",
          },
          {
            text: {
              type: "plain_text",
              text: "📐 Design Requirements – Product specifications",
            },
            value: "design_requirements",
          },
        ],
      },
    },
    {
      type: "divider",
    },
    {
      type: "header",
      text: {
        type: "plain_text",
        text: "📋 Study Context",
      },
    },
    {
      type: "input",
      block_id: "study_name",
      label: {
        type: "plain_text",
        text: "Study Name *",
      },
      element: {
        type: "plain_text_input",
        action_id: "input",
        placeholder: {
          type: "plain_text",
          text: "e.g., Veterans Housing Application Study",
        },
      },
    },
    {
      type: "input",
      block_id: "target_audience",
      optional: true,
      label: {
        type: "plain_text",
        text: "Target Audience",
      },
      element: {
        type: "plain_text_input",
        action_id: "input",
        placeholder: {
          type: "plain_text",
          text: "e.g., City Council, Product",
        },
      },
    },
    {
      type: "input",
      block_id: "meeting_deadline",
      optional: true,
      label: {
        type: "plain_text",
        text: "Meeting/Deadline",
      },
      element: {
        type: "plain_text_input",
        action_id: "input",
        placeholder: {
          type: "plain_text",
          text: "e.g., Board meeting 12/15",
        },
      },
    },
    {
      type: "header",
      text: {
        type: "plain_text",
        text: "📑 Research Findings",
      },
    },
    {
      type: "input",
      block_id: "synthesized_findings",
      label: {
        type: "plain_text",
        text: "Synthesized Findings *",
      },
      hint: {
        type: "plain_text",
        text: "Paste your research insights, themes, conclusions, or analysis results (not raw quotes)",
      },
      element: {
        type: "plain_text_input",
        multiline: true,
        action_id: "input",
        placeholder: {
          type: "plain_text",
          text: "[Add your synthesized insights, not raw interview quotes]",
        },
      },
    },
    {
      type: "header",
      text: {
        type: "plain_text",
        text: "📤 Delivery",
      },
    },
    {
      type: "input",
      block_id: "delivery_channel",
      label: {
        type: "plain_text",
        text: "Delivery Channel *",
      },
      element: {
        type: "plain_text_input",
        action_id: "input",
        placeholder: {
          type: "plain_text",
          text: "#stakeholder-updates or #research-team",
        },
      },
    },
    {
      type: "input",
      block_id: "people_to_notify",
      optional: true,
      label: {
        type: "plain_text",
        text: "People to Notify",
      },
      element: {
        type: "plain_text_input",
        action_id: "input",
        placeholder: {
          type: "plain_text",
          text: "@director.johnson, @product.lead",
        },
      },
    },
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: "💡 *Key Difference:* Shareouts are for *already-analyzed* findings, not raw data. Use `/run-template` for synthesis, then return here to share.",
        },
      ],
    },
  ],
};
