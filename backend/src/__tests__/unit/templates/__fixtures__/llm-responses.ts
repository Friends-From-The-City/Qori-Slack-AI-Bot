/**
 * Canned LLM responses for template testing.
 *
 * These fixtures provide deterministic responses for each template's AI tasks,
 * allowing tests to verify template rendering and cascade variable emission
 * without making actual API calls.
 *
 * Responses are organized by template ID, then by task_id.
 * Each response should be realistic enough to test downstream parsing.
 */

// ═══════════════════════════════════════════════════════════
// RESEARCH BRIEF (v7.0)
// ═══════════════════════════════════════════════════════════

export const researchBriefResponses: Record<string, string> = {
  // Actual task IDs from research_brief.yaml v7.0
  descriptive_title: `VA Mobile Navigation Experience Study`,

  summary: `This usability study with 8 Veterans will reveal how mobile navigation patterns affect task completion and identify opportunities to reduce abandonment. The study maps mental models to current IA structures, informing the mobile redesign initiative.`,

  problem_narrative: `Veterans using VA.gov mobile experience report difficulty finding critical services, leading to abandonment of tasks and reliance on phone support. This creates both user frustration and operational burden on call centers.

Analytics show 40% of mobile sessions end without task completion, with navigation-related exits concentrated in claims status and appointment scheduling flows. Call center data indicates a 15% increase in "can't find on website" inquiries specifically from mobile users.`,

  method_rationale: `Moderated usability testing enables direct observation of navigation behaviors while capturing the reasoning behind participant choices. The think-aloud protocol reveals mental model mismatches that analytics alone cannot surface.`,

  participant_rationale: `Veterans with VA.gov accounts who access the site primarily via mobile devices. Mix of benefit types (healthcare, disability, education) to ensure diverse navigation needs are represented.`,

  out_of_scope_rationale: `Desktop navigation patterns are excluded as they involve different interaction paradigms and are addressed in a parallel initiative. Content strategy recommendations require separate analysis of information architecture.`,

  risks: `- **Recruitment risk**: May be challenging to recruit Veterans with mobile-primary usage. Mitigation: Partner with Perigean for targeted outreach.
- **Technical risk**: Remote testing depends on participant connectivity. Mitigation: Include backup phone dial-in option.`,

  approval_items: `- [ ] Methodology appropriate for research questions
- [ ] Timeline realistic given scope
- [ ] Budget adequate for participant compensation
- [ ] PII handling plan approved`,
};

// ═══════════════════════════════════════════════════════════
// RESEARCH PLAN (v7.0)
// ═══════════════════════════════════════════════════════════

export const researchPlanResponses: Record<string, string> = {
  elaborate_objectives: `### Detailed Research Objectives

**Objective 1: Map current navigation journeys**
Document the step-by-step paths Veterans take when seeking benefits information on mobile. Identify decision points, backtracking patterns, and abandonment triggers.

**Objective 2: Identify mental model mismatches**
Understand how Veterans conceptualize VA services and compare this against the current information architecture. Surface category labels that create confusion.

**Objective 3: Evaluate search as fallback**
Assess how Veterans use search when primary navigation fails. Identify query patterns and evaluate search result relevance.

**Objective 4: Prioritize improvement opportunities**
Rank navigation pain points by frequency and severity. Map opportunities to specific IA or design interventions.`,

  methodology_details: `### Methodology: Moderated Usability Testing

**Approach**: Remote moderated sessions using think-aloud protocol with task completion measurement.

**Session structure**:
1. Introduction and consent (5 min)
2. Warm-up questions about mobile usage (10 min)
3. Task scenarios (35 min)
4. Retrospective questions (10 min)

**Task scenarios**:
- Find the status of a disability claim
- Locate information about education benefits
- Schedule a healthcare appointment
- Find contact information for a regional office

**Data collection**:
- Task completion rate (binary)
- Time on task
- Number of navigation steps
- Error frequency and type
- Satisfaction rating (7-point scale)
- Verbalized pain points`,

  discussion_guide_outline: `### Discussion Guide Outline

**Section 1: Context and Mobile Usage**
- Primary device for VA.gov access
- Frequency of mobile vs desktop usage
- Types of tasks attempted on mobile

**Section 2: Navigation Tasks**
- Task 1: Claim status (high frequency)
- Task 2: Benefits exploration (exploratory)
- Task 3: Appointment scheduling (transactional)
- Task 4: Contact information (utility)

**Section 3: Retrospective**
- Most frustrating navigation experience
- Suggestions for improvement
- Comparison to other mobile experiences`,

  participant_criteria_details: `### Participant Criteria

**Required characteristics**:
- Active VA benefits user (any benefit type)
- Uses smartphone as primary or frequent VA.gov access device
- Accessed VA.gov mobile in past 30 days

**Desired variation**:
- Mix of iOS and Android users
- Range of ages (25-65+)
- Geographic diversity
- Mix of benefit types (healthcare, disability, education)

**Screener questions**:
1. How often do you access VA.gov on your smartphone?
2. What VA benefits do you currently use?
3. Describe your last attempt to find information on VA.gov mobile.`,

  deliverables_list: `### Deliverables

1. **Research readout presentation** (Week 6)
   - Key findings with video clips
   - Prioritized recommendations
   - Journey map showing pain points

2. **Detailed findings document** (Week 6)
   - Per-task analysis
   - Participant quotes and observations
   - Statistical summary of completion rates

3. **Design recommendations brief** (Week 7)
   - Specific IA changes with rationale
   - Prioritized by impact and effort
   - Success metrics for validation`,
};

// ═══════════════════════════════════════════════════════════
// SESSION SUMMARY (v7.0)
// ═══════════════════════════════════════════════════════════

export const sessionSummaryResponses: Record<string, string> = {
  summary_body: `## Session Overview

Participant PT-003 completed 3 of 4 navigation tasks. The session revealed significant friction in the claims status flow, with the participant requiring 7 taps to reach destination (expected: 3).

## Key Observations

### Task 1: Find claim status
- **Outcome**: Completed with difficulty
- **Path taken**: Home → Menu → Benefits → Claims → Status (7 taps)
- **Quote**: "I know this is in here somewhere, I just can't remember exactly where."
- **Severity**: High

### Task 2: Education benefits
- **Outcome**: Completed successfully
- **Path taken**: Home → Menu → Education → GI Bill (4 taps)
- **Observation**: Participant used search after initial confusion, then navigated directly.

### Task 3: Schedule appointment
- **Outcome**: Failed
- **Path taken**: Attempted Health Care → Appointments, could not find scheduling option
- **Quote**: "This just shows my past appointments, how do I make a new one?"
- **Severity**: Critical

### Task 4: Contact information
- **Outcome**: Completed successfully
- **Path taken**: Used footer link directly (2 taps)

## Participant Profile

- Age range: 35-44
- Primary device: iPhone
- VA benefits: Healthcare, Disability
- Mobile frequency: Several times per week

## Atomic Insights

1. **Navigation depth**: Claims status buried too deep in hierarchy
2. **Labeling issue**: "Appointments" label suggests viewing, not scheduling
3. **Search reliance**: Participant defaulted to search when unsure
4. **Footer utility**: Contact info found easily via persistent footer`,

  extract_nuggets: `[
    {
      "id": "N-001",
      "nugget_type": "pain_point",
      "severity": "high",
      "text": "Claims status requires 7 taps to reach, participant expected 3",
      "participant": "PT-003",
      "session": "2026-06-15"
    },
    {
      "id": "N-002",
      "nugget_type": "pain_point",
      "severity": "critical",
      "text": "Could not find appointment scheduling - label 'Appointments' suggests viewing only",
      "participant": "PT-003",
      "session": "2026-06-15"
    },
    {
      "id": "N-003",
      "nugget_type": "behavior",
      "severity": "medium",
      "text": "Defaulted to search when primary navigation unclear",
      "participant": "PT-003",
      "session": "2026-06-15"
    },
    {
      "id": "N-004",
      "nugget_type": "positive",
      "severity": "low",
      "text": "Contact info easily accessible via footer - good pattern",
      "participant": "PT-003",
      "session": "2026-06-15"
    }
  ]`,
};

// ═══════════════════════════════════════════════════════════
// RESEARCH READOUT (v7.0)
// ═══════════════════════════════════════════════════════════

export const researchReadoutResponses: Record<string, string> = {
  executive_summary: `## Executive Summary

This usability study with 8 Veterans revealed critical navigation barriers in the VA.gov mobile experience. **Task completion rate was 62%** (20 of 32 tasks), with appointment scheduling emerging as the most problematic flow (25% completion).

Three high-priority findings require immediate attention:
1. Claims status navigation is buried 4 levels deep
2. Appointment scheduling label misleads users
3. Service categorization doesn't match Veteran mental models

Recommended interventions include flattening the claims hierarchy, clarifying appointment labels, and conducting card sort research to inform IA restructure.`,

  findings_body: `## Detailed Findings

### Finding 1: Claims status buried too deep

**Evidence**: 7 of 8 participants required 5+ taps to reach claims status. Average time: 45 seconds (expected: 15 seconds).

**Participant quotes**:
- "Why is this so hard to find? I check this every week."
- "I gave up and just called the 800 number."

**Impact**: High frustration, increased call center volume.

**Recommendation**: Surface claims status on home screen or within 2 taps.

---

### Finding 2: Appointment scheduling label misleads

**Evidence**: 6 of 8 participants could not find appointment scheduling. "Appointments" interpreted as viewing existing appointments only.

**Participant quotes**:
- "This just shows my past appointments, how do I make a new one?"
- "Schedule should be a separate button."

**Impact**: Critical — blocks primary healthcare task.

**Recommendation**: Add explicit "Schedule appointment" action or relabel section.

---

### Finding 3: Service categories don't match mental models

**Evidence**: Card sort showed Veterans group services by life event (transitioning, healthcare need), not VA organizational structure.

**Impact**: Medium — affects exploratory navigation.

**Recommendation**: Conduct follow-up IA study to inform restructure.`,

  recommendations_body: `## Recommendations

### Priority 1: Flatten claims navigation
- Add claims status widget to home screen
- Target: Reachable in 2 taps or less
- Effort: Medium | Impact: High

### Priority 2: Clarify appointment actions
- Add "Schedule appointment" button to Appointments section
- Update label to "View & Schedule Appointments"
- Effort: Low | Impact: High

### Priority 3: Restructure service categories
- Conduct card sort with 20 Veterans
- Test alternative IA against current
- Effort: High | Impact: Medium

### Priority 4: Improve search relevance
- Audit top search queries
- Ensure first results match common tasks
- Effort: Medium | Impact: Medium`,

  extract_findings: `[
    {
      "id": "F-001",
      "finding": "Claims status navigation buried too deep",
      "evidence_strength": "high",
      "participant_coverage": "7/8",
      "severity": "high"
    },
    {
      "id": "F-002",
      "finding": "Appointment scheduling label misleads users",
      "evidence_strength": "high",
      "participant_coverage": "6/8",
      "severity": "critical"
    },
    {
      "id": "F-003",
      "finding": "Service categories don't match mental models",
      "evidence_strength": "medium",
      "participant_coverage": "5/8",
      "severity": "medium"
    }
  ]`,

  extract_recommendations: `[
    {
      "id": "R-001",
      "recommendation": "Flatten claims navigation to 2 taps",
      "priority": "high",
      "effort": "medium",
      "addresses_findings": ["F-001"]
    },
    {
      "id": "R-002",
      "recommendation": "Add explicit schedule appointment action",
      "priority": "high",
      "effort": "low",
      "addresses_findings": ["F-002"]
    },
    {
      "id": "R-003",
      "recommendation": "Conduct card sort to inform IA restructure",
      "priority": "medium",
      "effort": "high",
      "addresses_findings": ["F-003"]
    }
  ]`,
};

// ═══════════════════════════════════════════════════════════
// DESK RESEARCH (v7.0)
// ═══════════════════════════════════════════════════════════

export const deskResearchResponses: Record<string, string> = {
  synthesis_body: `## Research Overview

This desk research synthesizes 12 sources on mobile navigation patterns for government digital services. Key themes include progressive disclosure, task-based architecture, and accessibility-first design.

## Validated Themes

### Theme 1: Progressive disclosure reduces cognitive load

Sources consistently recommend revealing complexity gradually rather than displaying all options upfront. UK GDS and USDS both mandate maximum 3 levels of navigation on mobile.

**Supporting evidence**:
- UK GDS Mobile Guidelines (2024): "No more than 3 taps to any destination"
- USDS Digital Playbook: "Start simple, add complexity only when needed"
- Nielsen Norman Group: "Mobile users have 50% less tolerance for deep hierarchies"

### Theme 2: Task-based IA outperforms org-chart IA

Users navigate by goal, not by department. Government sites structured around organizational units consistently underperform task-based alternatives.

**Supporting evidence**:
- Canada.ca redesign study: 40% improvement in task completion after IA restructure
- Australian DTA research: "Citizens don't know or care which agency handles what"

### Theme 3: Search must be prominent but not primary

Mobile users expect search but prefer direct navigation when possible. Search should be visible but not the only path.

**Supporting evidence**:
- Google Mobile UX research: "Search as escape hatch, not default"
- VA.gov analytics: 23% of mobile users start with search

## Knowledge Gaps

1. Limited research on Veteran-specific mobile patterns
2. No studies on navigation for users with cognitive disabilities
3. Gap in understanding cross-device journey continuity`,

  extract_themes: `[
    {
      "id": "T-001",
      "theme_name": "Progressive disclosure reduces cognitive load",
      "summary": "Reveal complexity gradually, maximum 3 levels on mobile",
      "source_count": 3,
      "confidence": "high"
    },
    {
      "id": "T-002",
      "theme_name": "Task-based IA outperforms org-chart IA",
      "summary": "Structure around user goals, not organizational units",
      "source_count": 2,
      "confidence": "high"
    },
    {
      "id": "T-003",
      "theme_name": "Search must be prominent but not primary",
      "summary": "Visible search as fallback, not default navigation path",
      "source_count": 2,
      "confidence": "medium"
    }
  ]`,

  extract_barriers: `[
    {
      "id": "DB-001",
      "barrier": "Deep navigation hierarchies cause mobile abandonment",
      "source": "UK GDS, Nielsen Norman Group"
    },
    {
      "id": "DB-002",
      "barrier": "Org-chart information architecture confuses citizens",
      "source": "Canada.ca, Australian DTA"
    }
  ]`,
};

// ═══════════════════════════════════════════════════════════
// EXPORT ALL FIXTURES
// ═══════════════════════════════════════════════════════════

export const llmResponseFixtures: Record<string, Record<string, string>> = {
  research_brief: researchBriefResponses,
  research_plan: researchPlanResponses,
  session_summary: sessionSummaryResponses,
  research_readout: researchReadoutResponses,
  desk_research: deskResearchResponses,
};

/**
 * Get mock responses for a specific template.
 */
export function getMockResponses(templateId: string): Record<string, string> {
  return llmResponseFixtures[templateId] || {};
}
