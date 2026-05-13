/**
 * Type verification test — confirms that model types thread through
 * services and association mixins correctly.
 *
 * These tests compile but don't run against a real database. They verify
 * that TypeScript sees the correct types on model attributes and
 * association returns. If a test here fails to compile, the model
 * typing pattern is broken.
 *
 * This file can be removed after Phase 3 is verified.
 */

import type { StudyParticipant } from '../database/models/study_participant';
import type { ResearchStudy } from '../database/models/research_study';

// -- Verify attribute types on StudyParticipant --

function verifyParticipantTypes(participant: StudyParticipant) {
  // These should compile with their correct types:
  const id: number = participant.id;
  const name: string = participant.participant_name;
  const status: string | null = participant.status_select;
  const compensation: number | null = participant.compensation_amount;
  const outreachMethod: 'email' | 'slack' | 'phone' | 'other' | null = participant.outreach_method;
  const outreachCount: number = participant.outreach_count;
  const studyId: number = participant.study_id;

  // Suppress unused variable warnings
  void id; void name; void status; void compensation;
  void outreachMethod; void outreachCount; void studyId;
}

// -- Verify attribute types on ResearchStudy --

function verifyStudyTypes(study: ResearchStudy) {
  const id: number = study.id;
  const name: string = study.name;
  const budget: number | null = study.parsed_budget_amount;
  const target: number | null = study.target_participants;
  const totalParticipants: number = study.total_participants;

  void id; void name; void budget; void target; void totalParticipants;
}

// -- Verify association mixin types thread through --

async function verifyAssociationTypes(participant: StudyParticipant) {
  // getStudy() should return a ResearchStudy, not a generic Model
  const study = await participant.getStudy();

  // These should compile — proving ResearchStudy fields are visible:
  const budget: number | null = study.parsed_budget_amount;
  const studyName: string = study.name;
  const researcherName: string = study.researcher_name;

  void budget; void studyName; void researcherName;
}

async function verifyReverseAssociation(study: ResearchStudy) {
  // getParticipants() should return StudyParticipant[], not Model[]
  const participants = await study.getParticipants();
  const first = participants[0];

  // These should compile — proving StudyParticipant fields are visible:
  const comp: number | null = first.compensation_amount;
  const status: string | null = first.status_select;

  void comp; void status;
}

// -- Jest test to make this file discoverable by the test runner --

describe('Type verification', () => {
  it('compiles correctly (type-only checks, no runtime assertions)', () => {
    // If this file compiles, the types are correct.
    // The functions above are never called — they exist only for the compiler.
    expect(true).toBe(true);
  });
});
