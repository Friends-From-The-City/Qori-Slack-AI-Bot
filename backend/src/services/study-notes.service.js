const sequelize = require('../database');

class StudyNotesService {
  constructor() {
    this.StudyNotes = sequelize.models.StudyNotes;
    this.ResearchStudy = sequelize.models.ResearchStudy;
  }

  /**
   * Create a new study note
   * @param {Object} noteData - The note data to create
   * @returns {Promise<Object>} The created note
   */
  async createStudyNote(noteData) {
    try {
      // Handle case where study_id might be null
      if (!noteData.study_id) {
        // Try to find the study by name if study_id is not provided
        const study = await this.ResearchStudy.findOne({
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
        const existing = await this.StudyNotes.findOne({
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

      const note = await this.StudyNotes.create(noteData);
      return note;
    } catch (error) {
      console.error('Error creating study note:', error);
      throw new Error(`Failed to create study note: ${error.message}`);
    }
  }

  /**
   * Get a study note by ID
   * @param {number} id - The note ID
   * @returns {Promise<Object>} The study note
   */
  async getStudyNoteById(id) {
    try {
      const note = await this.StudyNotes.findByPk(id, {
        include: [
          {
            model: this.ResearchStudy,
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
      throw new Error(`Failed to get study note: ${error.message}`);
    }
  }

  /**
   * Get study notes by study ID
   * @param {number} studyId - The study ID
   * @param {Object} options - Query options
   * @returns {Promise<Array>} Array of study notes
   */
  async getStudyNotesByStudyId(studyId, options = {}) {
    try {
      const where = { study_id: studyId };

      const notes = await this.StudyNotes.findAll({
        where,
        include: [
          {
            model: this.ResearchStudy,
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
      throw new Error(`Failed to get study notes: ${error.message}`);
    }
  }

  /**
   * Get study notes by user ID
   * @param {string} userId - The Slack user ID
   * @param {Object} options - Query options
   * @returns {Promise<Array>} Array of study notes
   */
  async getStudyNotesByUserId(userId, options = {}) {
    try {
      const where = { created_by: userId };

      const notes = await this.StudyNotes.findAll({
        where,
        include: [
          {
            model: this.ResearchStudy,
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
      throw new Error(`Failed to get study notes: ${error.message}`);
    }
  }

  /**
   * Get study notes by exact study name match
   * @param {string} studyName - The exact name of the research study
   * @param {Object} options - Query options
   * @returns {Promise<Array>} Array of study notes
   */
  async getStudyNotesByStudyName(studyName, transcript, options = {}) {
    try {
      if (!studyName) {
        throw new Error('Study name is required');
      }

      const where = {
        study_name: studyName,
        transcript: transcript
      };

      const notes = await this.StudyNotes.findAll({
        where,
        include: [
          {
            model: this.ResearchStudy,
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
      throw new Error(`Failed to get study notes by exact study name: ${error.message}`);
    }
  }

  async getStudyNotesByParticipantName(participantName, options = {}) {
    try {
      if (!participantName) {
        throw new Error('Participant name is required');
      }

      const where = {
        participant_name: participantName
      };

      const notes = await this.StudyNotes.findAll({
        where,
        include: [
          {
            model: this.ResearchStudy,
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
      throw new Error(`Failed to get study notes by exact study name: ${error.message}`);
    }
  }

  /**
   * Search study notes
   * @param {Object} searchCriteria - Search criteria
   * @param {Object} options - Query options
   * @returns {Promise<Array>} Array of matching study notes
   */
  async searchStudyNotes(searchCriteria, options = {}) {
    try {
      const where = {};

      // Add search criteria
      if (searchCriteria.study_name) {
        where.study_name = { [sequelize.Op.iLike]: `%${searchCriteria.study_name}%` };
      }

      if (searchCriteria.filename) {
        where.filename = { [sequelize.Op.iLike]: `%${searchCriteria.filename}%` };
      }

      if (searchCriteria.participant_name) {
        where.participant_name = { [sequelize.Op.iLike]: `%${searchCriteria.participant_name}%` };
      }

      const notes = await this.StudyNotes.findAll({
        where,
        include: [
          {
            model: this.ResearchStudy,
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
      throw new Error(`Failed to search study notes: ${error.message}`);
    }
  }

  /**
   * Update a study note
   * @param {number} id - The note ID
   * @param {Object} updateData - The data to update
   * @returns {Promise<Object>} The updated note
   */
  async updateStudyNote(id, updateData) {
    try {
      const note = await this.StudyNotes.findByPk(id);

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
      throw new Error(`Failed to update study note: ${error.message}`);
    }
  }

  /**
   * Delete a study note
   * @param {number} id - The note ID
   * @returns {Promise<boolean>} Success status
   */
  async deleteStudyNote(id) {
    try {
      const note = await this.StudyNotes.findByPk(id);

      if (!note) {
        throw new Error('Study note not found');
      }

      await note.destroy();
      return true;
    } catch (error) {
      console.error('Error deleting study note:', error);
      throw new Error(`Failed to delete study note: ${error.message}`);
    }
  }


}

module.exports = new StudyNotesService();
