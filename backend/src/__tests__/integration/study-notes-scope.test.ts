/**
 * Study Notes Scope Tests
 *
 * Bug fix verification: getStudyNotesByParticipant must scope by study_id
 * to prevent cross-study data leakage. Without this, participant in
 * Study A would see notes from Study B if the same participant_id is used.
 *
 * H6 refactor: Changed from text-match on participant_name to FK-based
 * participant_id queries. This eliminates PII duplication and enables
 * proper relational queries.
 */

import { getTestDb, truncateAll, TEST_ORG_ID } from './setup/testDb';
import studyNotesService from '../../services/study-notes.service';

const sequelize = getTestDb();

// Test fixtures
let projectId: number;
let studyAId: number;
let studyBId: number;
let aliceAId: number;  // Alice participant in Study A
let aliceBId: number;  // Different Alice participant in Study B
let bobBId: number;    // Bob participant in Study B

beforeEach(async () => {
  await truncateAll();

  const Project = sequelize.models.Project;
  const ResearchStudy = sequelize.models.ResearchStudy;
  const StudyParticipant = sequelize.models.StudyParticipant;
  const StudyNotes = sequelize.models.StudyNotes;

  // Create project
  const project = await Project.create({
    name: 'Test Project',
    slug: 'test-project',
    status: 'active',
    created_by: 'U12345',
    organization_id: TEST_ORG_ID,
  });
  projectId = (project as unknown as { id: number }).id;

  // Create two studies in the same project
  const studyA = await ResearchStudy.create({
    project_id: projectId,
    name: 'Study A',
    slug: 'study-a',
    path: 'test-project/study-a',
    status: 'active',
    created_by: 'U12345',
    channel_name: 'study-a-channel',
    researcher_name: 'Researcher A',
    researcher_email: 'a@example.com',
  });
  studyAId = (studyA as unknown as { id: number }).id;

  const studyB = await ResearchStudy.create({
    project_id: projectId,
    name: 'Study B',
    slug: 'study-b',
    path: 'test-project/study-b',
    status: 'active',
    created_by: 'U12345',
    channel_name: 'study-b-channel',
    researcher_name: 'Researcher B',
    researcher_email: 'b@example.com',
  });
  studyBId = (studyB as unknown as { id: number }).id;

  // Create participants in each study
  const aliceA = await StudyParticipant.create({
    study_id: studyAId,
    participant_code: 'PT-001',
    participant_name: 'Alice',
    status_select: 'scheduled',
    added_by: 'U12345',
  });
  aliceAId = (aliceA as unknown as { id: number }).id;

  const aliceB = await StudyParticipant.create({
    study_id: studyBId,
    participant_code: 'PT-001',
    participant_name: 'Alice', // Same name, different study
    status_select: 'scheduled',
    added_by: 'U12345',
  });
  aliceBId = (aliceB as unknown as { id: number }).id;

  // Create notes for Alice in BOTH studies (using participant_id FK)
  const now = new Date();
  await StudyNotes.create({
    study_id: studyAId,
    study_name: 'Study A',
    filename: 'alice-session-1.md',
    file_url: 'https://github.com/test/alice-session-1',
    participant_id: aliceAId,
    transcript: true,
    session_date: '2026-05-01',
    created_by: 'U12345',
    created_at: now,
    updated_at: now,
    pii_reviewed: true,  // Required for getStudyNotesByParticipant query
  });

  await StudyNotes.create({
    study_id: studyAId,
    study_name: 'Study A',
    filename: 'alice-session-2.md',
    file_url: 'https://github.com/test/alice-session-2',
    participant_id: aliceAId,
    transcript: true,
    session_date: '2026-05-02',
    created_by: 'U12345',
    created_at: now,
    updated_at: now,
    pii_reviewed: true,  // Required for getStudyNotesByParticipant query
  });

  await StudyNotes.create({
    study_id: studyBId,
    study_name: 'Study B',
    filename: 'alice-study-b.md',
    file_url: 'https://github.com/test/alice-study-b',
    participant_id: aliceBId,
    transcript: true,
    session_date: '2026-05-15',
    created_by: 'U12345',
    created_at: now,
    updated_at: now,
    pii_reviewed: true,  // Required for getStudyNotesByParticipant query
  });
});

afterAll(async () => {
  await sequelize.close();
});

describe('getStudyNotesByParticipant study_id scoping (H6 FK refactor)', () => {
  it('returns only notes for the specified participant when participant_id is provided', async () => {
    // Query Alice's notes in Study A using her participant_id
    const notesA = await studyNotesService.getStudyNotesByParticipant(aliceAId, studyAId);

    expect(notesA).toHaveLength(2);
    expect(notesA.every(n => n.study_id === studyAId)).toBe(true);
    expect(notesA.every(n => n.participant_id === aliceAId)).toBe(true);
    expect(notesA.map(n => n.filename)).toContain('alice-session-1.md');
    expect(notesA.map(n => n.filename)).toContain('alice-session-2.md');
    expect(notesA.map(n => n.filename)).not.toContain('alice-study-b.md');
  });

  it('returns only notes from Study B when querying Study B participant', async () => {
    // Query Alice's notes in Study B using her Study B participant_id
    const notesB = await studyNotesService.getStudyNotesByParticipant(aliceBId, studyBId);

    expect(notesB).toHaveLength(1);
    expect(notesB[0].study_id).toBe(studyBId);
    expect(notesB[0].participant_id).toBe(aliceBId);
    expect(notesB[0].filename).toBe('alice-study-b.md');
  });

  it('includes participant association with name for display', async () => {
    const notesA = await studyNotesService.getStudyNotesByParticipant(aliceAId, studyAId);

    expect(notesA).toHaveLength(2);
    // Verify participant association is included
    const note = notesA[0] as any;
    expect(note.participant).toBeDefined();
    expect(note.participant.participant_name).toBe('Alice');
    expect(note.participant.participant_code).toBe('PT-001');
  });

  it('returns empty array when participant exists in other study but not in specified study', async () => {
    // Create "Bob" only in Study B
    const StudyParticipant = sequelize.models.StudyParticipant;
    const StudyNotes = sequelize.models.StudyNotes;
    const now = new Date();

    const bob = await StudyParticipant.create({
      study_id: studyBId,
      participant_code: 'PT-002',
      participant_name: 'Bob',
      status_select: 'scheduled',
      added_by: 'U12345',
    });
    bobBId = (bob as unknown as { id: number }).id;

    await StudyNotes.create({
      study_id: studyBId,
      study_name: 'Study B',
      filename: 'bob-notes.md',
      file_url: 'https://github.com/test/bob-notes',
      participant_id: bobBId,
      transcript: true,
      session_date: '2026-05-20',
      created_by: 'U12345',
      created_at: now,
      updated_at: now,
      pii_reviewed: true,  // Required for getStudyNotesByParticipant query
    });

    // Query Bob's notes scoped to Study A — Bob doesn't exist in Study A, so should return empty
    // (The participant_id itself is study-scoped, so this tests the study_id filter)
    const bobNotesA = await studyNotesService.getStudyNotesByParticipant(bobBId, studyAId);
    expect(bobNotesA).toHaveLength(0);

    // Query Bob's notes scoped to Study B — should return 1
    const bobNotesB = await studyNotesService.getStudyNotesByParticipant(bobBId, studyBId);
    expect(bobNotesB).toHaveLength(1);
    expect(bobNotesB[0].filename).toBe('bob-notes.md');
  });

  it('rejects query without participant_id', async () => {
    await expect(
      studyNotesService.getStudyNotesByParticipant(0, studyAId)
    ).rejects.toThrow('Participant ID is required');
  });
});
