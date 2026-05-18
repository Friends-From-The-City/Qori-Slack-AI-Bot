import type { StudyNotes } from '../database/models/study_notes';
import type { ResearchStudy } from '../database/models/research_study';
import { Op, type CreationAttributes } from 'sequelize';

import sequelize from '../database';

// Typed model references — cast once, use everywhere. See Phase 3 notes.
const StudyNotesModel = sequelize.models.StudyNotes as typeof StudyNotes;
const ResearchStudyModel = sequelize.models.ResearchStudy as typeof ResearchStudy;

interface QueryOptions {
  limit?: number;
  offset?: number;
}

interface SearchCriteria {
  study_name?: string;
  filename?: string;
  participant_name?: string;
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

  async getStudyNotesByParticipantName(participantName: string, options: QueryOptions = {}): Promise<StudyNotes[]> {
    try {
      if (!participantName) {
        throw new Error('Participant name is required');
      }

      const where = {
        participant_name: participantName
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
   * Search study notes
   */
  async searchStudyNotes(searchCriteria: SearchCriteria, options: QueryOptions = {}): Promise<StudyNotes[]> {
    try {
      const where: Record<string, unknown> = {};

      // Add search criteria
      if (searchCriteria.study_name) {
        where.study_name = { [Op.iLike]: `%${searchCriteria.study_name}%` };
      }

      if (searchCriteria.filename) {
        where.filename = { [Op.iLike]: `%${searchCriteria.filename}%` };
      }

      if (searchCriteria.participant_name) {
        where.participant_name = { [Op.iLike]: `%${searchCriteria.participant_name}%` };
      }

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
