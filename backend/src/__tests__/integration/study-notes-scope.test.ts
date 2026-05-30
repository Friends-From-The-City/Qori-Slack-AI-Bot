/**
 * Study Notes Scope Tests
 *
 * Bug fix verification: getStudyNotesByParticipantName must scope by study_id
 * to prevent cross-study data leakage. Without this, participant "Alice" in
 * Study A would see notes from Study B if both studies have a participant named Alice.
 */

import { getTestDb, truncateAll } from './setup/testDb';
import studyNotesService from '../../services/study-notes.service';

const sequelize = getTestDb();

// Test fixtures
let projectId: number;
let studyAId: number;
let studyBId: number;

beforeEach(async () => {
  await truncateAll();

  const Project = sequelize.models.Project;
  const ResearchStudy = sequelize.models.ResearchStudy;
  const StudyNotes = sequelize.models.StudyNotes;

  // Create project
  const project = await Project.create({
    name: 'Test Project',
    slug: 'test-project',
    status: 'active',
    created_by: 'U12345',
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

  // Create notes for "Alice" in BOTH studies
  const now = new Date();
  await StudyNotes.create({
    study_id: studyAId,
    study_name: 'Study A',
    filename: 'alice-session-1.md',
    file_url: 'https://github.com/test/alice-session-1',
    participant_name: 'Alice',
    transcript: true,
    session_date: '2026-05-01',
    created_by: 'U12345',
    created_at: now,
    updated_at: now,
  });

  await StudyNotes.create({
    study_id: studyAId,
    study_name: 'Study A',
    filename: 'alice-session-2.md',
    file_url: 'https://github.com/test/alice-session-2',
    participant_name: 'Alice',
    transcript: true,
    session_date: '2026-05-02',
    created_by: 'U12345',
    created_at: now,
    updated_at: now,
  });

  await StudyNotes.create({
    study_id: studyBId,
    study_name: 'Study B',
    filename: 'alice-study-b.md',
    file_url: 'https://github.com/test/alice-study-b',
    participant_name: 'Alice',
    transcript: true,
    session_date: '2026-05-15',
    created_by: 'U12345',
    created_at: now,
    updated_at: now,
  });
});

afterAll(async () => {
  await sequelize.close();
});

describe('getStudyNotesByParticipantName study_id scoping', () => {
  it('returns only notes from the specified study when study_id is provided', async () => {
    // Query Alice's notes scoped to Study A
    const notesA = await studyNotesService.getStudyNotesByParticipantName('Alice', studyAId);

    expect(notesA).toHaveLength(2);
    expect(notesA.every(n => n.study_id === studyAId)).toBe(true);
    expect(notesA.map(n => n.filename)).toContain('alice-session-1.md');
    expect(notesA.map(n => n.filename)).toContain('alice-session-2.md');
    expect(notesA.map(n => n.filename)).not.toContain('alice-study-b.md');
  });

  it('returns only notes from Study B when scoped to Study B', async () => {
    // Query Alice's notes scoped to Study B
    const notesB = await studyNotesService.getStudyNotesByParticipantName('Alice', studyBId);

    expect(notesB).toHaveLength(1);
    expect(notesB[0].study_id).toBe(studyBId);
    expect(notesB[0].filename).toBe('alice-study-b.md');
  });

  it('returns all notes across studies when study_id is omitted (backwards compatible)', async () => {
    // Query without study_id — should return all Alice's notes
    const allNotes = await studyNotesService.getStudyNotesByParticipantName('Alice');

    expect(allNotes).toHaveLength(3);
    const studyIds = allNotes.map(n => n.study_id);
    expect(studyIds).toContain(studyAId);
    expect(studyIds).toContain(studyBId);
  });

  it('returns empty array when participant exists in other study but not in specified study', async () => {
    // Create "Bob" only in Study B
    const StudyNotes = sequelize.models.StudyNotes;
    const now = new Date();
    await StudyNotes.create({
      study_id: studyBId,
      study_name: 'Study B',
      filename: 'bob-notes.md',
      file_url: 'https://github.com/test/bob-notes',
      participant_name: 'Bob',
      transcript: true,
      session_date: '2026-05-20',
      created_by: 'U12345',
      created_at: now,
      updated_at: now,
    });

    // Query Bob's notes scoped to Study A — should return empty
    const bobNotesA = await studyNotesService.getStudyNotesByParticipantName('Bob', studyAId);
    expect(bobNotesA).toHaveLength(0);

    // Query Bob's notes scoped to Study B — should return 1
    const bobNotesB = await studyNotesService.getStudyNotesByParticipantName('Bob', studyBId);
    expect(bobNotesB).toHaveLength(1);
    expect(bobNotesB[0].filename).toBe('bob-notes.md');
  });
});
