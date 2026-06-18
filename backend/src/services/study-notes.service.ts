import type { StudyNotes } from '../database/models/study_notes';
import type { ResearchStudy } from '../database/models/research_study';
import type { StudyParticipant } from '../database/models/study_participant';
import { Op, type CreationAttributes } from 'sequelize';

import sequelize from '../database';

// Typed model references — cast once, use everywhere. See Phase 3 notes.
const StudyNotesModel = sequelize.models.StudyNotes as typeof StudyNotes;
const ResearchStudyModel = sequelize.models.ResearchStudy as typeof ResearchStudy;
const StudyParticipantModel = sequelize.models.StudyParticipant as typeof StudyParticipant;

interface QueryOptions {
  limit?: number;
  offset?: number;
}

interface SearchCriteria {
  study_id?: number;  // A1: Changed from study_name to study_id
  filename?: string;
  participant_id?: number;  // H6: Changed from participant_name to participant_id FK
}

interface NoteInput {
  study_id?: number;
  study_name?: string;
  filename?: string;
  created_at?: Date;
  updated_at?: Date;
  [key: string]: unknown;
}

class StudyNotesService {
  /**
   * Create a new study note
   */
  async createStudyNote(noteData: NoteInput): Promise<StudyNotes> {
    try {
      // Handle case where study_id might be null
      if (!noteData.study_id) {
        // Try to find the study by name if study_id is not provided
        const study = await ResearchStudyModel.findOne({
          where: { name: noteData.study_name }
        });
        if (study) {
          noteData.study_id = study.id;
        }
      }

      // Prevent duplicates: if a note with the same filename and study_id
      // already exists, update it instead of creating a new one.
      // This handles double-submit from slow modal responses.
      if (noteData.filename && noteData.study_id) {
        const existing = await StudyNotesModel.findOne({
          where: { filename: noteData.filename, study_id: noteData.study_id }
        });
        if (existing) {
          console.log(`📝 Duplicate note detected (${noteData.filename}), updating existing record ${existing.id}`);
          await existing.update({ ...noteData, updated_at: new Date() });
          return existing;
        }
      }

      // Set manual timestamps
      const now = new Date();
      noteData.created_at = now;
      noteData.updated_at = now;

      const note = await StudyNotesModel.create(noteData as CreationAttributes<StudyNotes>);
      return note;
    } catch (error) {
      console.error('Error creating study note:', error);
      throw new Error(`Failed to create study note: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get a study note by ID
   */
  async getStudyNoteById(id: number): Promise<StudyNotes> {
    try {
      const note = await StudyNotesModel.findByPk(id, {
        include: [
          {
            model: ResearchStudyModel,
            as: 'study',
            attributes: ['id', 'name', 'path', 'description']
          },
          {
            model: StudyParticipantModel,
            as: 'participant',
            attributes: ['id', 'participant_code', 'participant_name']
          }
        ]
      });

      if (!note) {
        throw new Error('Study note not found');
      }

      return note;
    } catch (error) {
      console.error('Error getting study note by ID:', error);
      throw new Error(`Failed to get study note: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get study notes by study ID
   */
  async getStudyNotesByStudyId(studyId: number, options: QueryOptions = {}): Promise<StudyNotes[]> {
    try {
      const where = { study_id: studyId };

      const notes = await StudyNotesModel.findAll({
        where,
        include: [
          {
            model: ResearchStudyModel,
            as: 'study',
            attributes: ['id', 'name', 'path']
          }
        ],
        order: [
          ['created_at', 'DESC'],
          ['session_date', 'DESC']
        ],
        limit: options.limit || 100,
        offset: options.offset || 0
      });

      return notes;
    } catch (error) {
      console.error('Error getting study notes by study ID:', error);
      throw new Error(`Failed to get study notes: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get study notes by user ID
   */
  async getStudyNotesByUserId(userId: string, options: QueryOptions = {}): Promise<StudyNotes[]> {
    try {
      const where = { created_by: userId };

      const notes = await StudyNotesModel.findAll({
        where,
        include: [
          {
            model: ResearchStudyModel,
            as: 'study',
            attributes: ['id', 'name', 'path']
          }
        ],
        order: [['createdAt', 'DESC']],
        limit: options.limit || 100,
        offset: options.offset || 0
      });

      return notes;
    } catch (error) {
      console.error('Error getting study notes by user ID:', error);
      throw new Error(`Failed to get study notes: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get study notes by exact study name match
   */
  async getStudyNotesByStudyName(studyName: string, transcript: boolean, options: QueryOptions = {}): Promise<StudyNotes[]> {
    try {
      if (!studyName) {
        throw new Error('Study name is required');
      }

      const where = {
        study_name: studyName,
        transcript: transcript
      };

      const notes = await StudyNotesModel.findAll({
        where,
        include: [
          {
            model: ResearchStudyModel,
            as: 'study',
            attributes: ['id', 'name', 'path', 'description']
          }
        ],
        order: [
          ['created_at', 'DESC'],
          ['session_date', 'DESC']
        ],
        limit: options.limit || 100,
        offset: options.offset || 0
      });

      return notes;
    } catch (error) {
      console.error('Error getting study notes by exact study name:', error);
      throw new Error(`Failed to get study notes by exact study name: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get study notes by participant ID (FK-based query, replaces text-match on participant_name).
   * H6 remediation: eliminates PII duplication, enables proper relational queries.
   */
  async getStudyNotesByParticipant(
    participantId: number,
    studyId?: number,
    options: QueryOptions = {}
  ): Promise<StudyNotes[]> {
    try {
      if (!participantId) {
        throw new Error('Participant ID is required');
      }

      // Bug fix preserved: scope by study_id to avoid cross-study data leakage.
      // PII gate: only return approved notes (pii_reviewed=true) for analysis eligibility.
      const where: Record<string, unknown> = {
        participant_id: participantId,
        pii_reviewed: true,  // Defense-in-depth: only approved notes are analyzable
      };
      if (studyId !== undefined) {
        where.study_id = studyId;
      }

      const notes = await StudyNotesModel.findAll({
        where,
        include: [
          {
            model: ResearchStudyModel,
            as: 'study',
            attributes: ['id', 'name', 'path', 'description']
          },
          {
            model: StudyParticipantModel,
            as: 'participant',
            attributes: ['id', 'participant_code', 'participant_name']
          }
        ],
        order: [
          ['created_at', 'DESC'],
          ['session_date', 'DESC']
        ],
        limit: options.limit || 100,
        offset: options.offset || 0
      });

      return notes;
    } catch (error) {
      console.error('Error getting study notes by participant:', error);
      throw new Error(`Failed to get study notes by participant: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Search study notes
   */
  async searchStudyNotes(searchCriteria: SearchCriteria, options: QueryOptions = {}): Promise<StudyNotes[]> {
    try {
      const where: Record<string, unknown> = {};

      // Add search criteria (A1: use study_id FK, not study_name)
      if (searchCriteria.study_id) {
        where.study_id = searchCriteria.study_id;
      }

      if (searchCriteria.filename) {
        where.filename = { [Op.iLike]: `%${searchCriteria.filename}%` };
      }

      // H6: Use participant_id FK for filtering
      if (searchCriteria.participant_id) {
        where.participant_id = searchCriteria.participant_id;
      }

      const notes = await StudyNotesModel.findAll({
        where,
        include: [
          {
            model: ResearchStudyModel,
            as: 'study',
            attributes: ['id', 'name', 'path']
          },
          {
            model: StudyParticipantModel,
            as: 'participant',
            attributes: ['id', 'participant_code', 'participant_name']
          }
        ],
        order: [['createdAt', 'DESC']],
        limit: options.limit || 100,
        offset: options.offset || 0
      });

      return notes;
    } catch (error) {
      console.error('Error searching study notes:', error);
      throw new Error(`Failed to search study notes: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Update a study note
   */
  async updateStudyNote(id: number, updateData: Partial<NoteInput>): Promise<StudyNotes> {
    try {
      const note = await StudyNotesModel.findByPk(id);

      if (!note) {
        throw new Error('Study note not found');
      }

      // Set updated_at timestamp
      updateData.updated_at = new Date();

      // Update the note
      await note.update(updateData);

      return note;
    } catch (error) {
      console.error('Error updating study note:', error);
      throw new Error(`Failed to update study note: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Delete a study note
   */
  async deleteStudyNote(id: number): Promise<boolean> {
    try {
      const note = await StudyNotesModel.findByPk(id);

      if (!note) {
        throw new Error('Study note not found');
      }

      await note.destroy();
      return true;
    } catch (error) {
      console.error('Error deleting study note:', error);
      throw new Error(`Failed to delete study note: ${error instanceof Error ? error.message : String(error)}`);
    }
  }


}

const studyNotesService = new StudyNotesService();
export default studyNotesService;
