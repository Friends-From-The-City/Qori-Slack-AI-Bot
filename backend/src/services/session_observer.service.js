// services/session_observer.service.js

const sequelize = require("../database");

class SessionObserverService {
  /**
   * Helper: Ensure value is array
   * Handles: arrays, JSON strings (like '["U09PAF33A8H"]'), plain strings
   */
  _toArray(value) {
    if (!value) return [];
    
    // If already an array, return as is
    if (Array.isArray(value)) {
      return value;
    }
    
    // If it's a string that looks like JSON, try to parse it
    if (typeof value === 'string') {
      const trimmed = value.trim();
      // Check if it's a JSON string (starts with [ or {)
      if ((trimmed.startsWith('[') && trimmed.endsWith(']')) || 
          (trimmed.startsWith('{') && trimmed.endsWith('}'))) {
        try {
          const parsed = JSON.parse(value);
          return Array.isArray(parsed) ? parsed : [parsed];
        } catch (e) {
          // If parsing fails, treat as plain string
          return [value];
        }
      }
      // Plain string - return as single-item array
      return [value];
    }
    
    // For other types, wrap in array
    return [value];
  }

  /**
   * Helper: Add unique values to array
   */
  _addUnique(existingArray, newValue) {
    const arr = this._toArray(existingArray);
    return arr.includes(newValue) ? arr : [...arr, newValue];
  }

  /**
   * Create or update an observer request based on session_id
   */
  async createObserverRequest(observerData) {
    try {
      const [observer, created] = await sequelize.models.SessionObserver.findOrCreate({
        where: { session_id: observerData.session_id },
        defaults: {
          ...observerData,
          requester_id: this._toArray(observerData.requester_id),
          requester_name: this._toArray(observerData.requester_name),
        }
      });

      if (!created) {
        // Add new requester to existing arrays (if not duplicate)
        const newRequesterId = this._toArray(observerData.requester_id)[0];
        const newRequesterName = this._toArray(observerData.requester_name)[0];

        // Get current requester_id and normalize it to array (handles old string data)
        const currentRequesterIds = this._toArray(observer.requester_id || observer.dataValues?.requester_id);
        const currentRequesterNames = this._toArray(observer.requester_name || observer.dataValues?.requester_name);

        // Only update the requester arrays — don't spread observerData, which
        // would overwrite the first observer's role/reason with the new one's.
        await observer.update({
          requester_id: this._addUnique(currentRequesterIds, newRequesterId),
          requester_name: this._addUnique(currentRequesterNames, newRequesterName),
          updated_at: new Date()
        });
        
        const updatedObserver = await observer.reload();
        const requesterIds = this._toArray(updatedObserver.requester_id || updatedObserver.dataValues?.requester_id);
        console.log('✅ Observer updated:', observer.id, 'Requesters:', requesterIds.length, requesterIds);
      } else {
        console.log('✅ Observer created:', observer.id);
      }

      return observer;
    } catch (error) {
      console.error('Error creating/updating observer request:', error);
      throw error;
    }
  }

  async getObserverByUser(userId) {
    console.log("🚀 ~ SessionObserverService ~ getObserverByUser ~ userId:", userId)
    try {
      // Fetch all approved observers and filter where user is in requester_id array
      const allObservers = await sequelize.models.SessionObserver.findAll({
        where: { status: "approved" },
        include: [
          {
            model: sequelize.models.ResearchStudy,
            as: 'study',
            attributes: ['id', 'name', 'path', 'researcher_name']
          },
          {
            model: sequelize.models.StudyParticipant,
            as: 'participant',
            attributes: ['id', 'participant_name', 'scheduled_date', 'scheduled_time', 'status_select']
          }
        ],
        order: [['created_at', 'DESC']]
      });
      console.log("🚀 ~ SessionObserverService ~ getObserverByUser ~ allObservers:", allObservers)

      // Filter using helper method - handle both getter property and raw dataValues
      const filtered = allObservers.filter(observer => {
        // Get requester_id from property (uses getter) or from raw dataValues
        const requesterId = observer.requester_id !== undefined 
          ? observer.requester_id 
          : (observer.dataValues?.requester_id);
        
        // Normalize to array (handles JSON strings, arrays, plain strings)
        const requesterIds = this._toArray(requesterId);
        const includes = requesterIds.includes(userId);
        
        if (includes) {
          console.log(`✅ Found matching observer ${observer.id} for user ${userId}. Requesters:`, requesterIds);
        }
        
        return includes;
      });
      
      console.log("🚀 ~ SessionObserverService ~ getObserverByUser ~ filtered count:", filtered.length);
      return filtered;
    } catch (error) {
      console.error('Error fetching observer by user:', error);
      throw error;
    }
  }

  /**
   * Update observer request status
   */
  async updateObserverStatus(observerId, status, approvedBy = null) {
    try {
      const observer = await sequelize.models.SessionObserver.findByPk(observerId);
      if (!observer) {
        throw new Error('Observer request not found');
      }

      const updateData = {
        status,
        updated_at: new Date()
      };

      if (approvedBy) {
        updateData.approved_by = approvedBy;
        updateData.approved_at = new Date();
      }

      await observer.update(updateData);
      console.log('✅ Observer request updated:', observer.id, 'Status:', status);
      return observer;
    } catch (error) {
      console.error('Error updating observer status:', error);
      throw error;
    }
  }

  /**
   * Get observer requests by study
   */
  async getObserverRequestsByStudy(studyId) {
    try {
      const observers = await sequelize.models.SessionObserver.findAll({
        where: { study_id: studyId },
        include: [
          {
            model: sequelize.models.ResearchStudy,
            as: 'study',
            attributes: ['id', 'name']
          },
          {
            model: sequelize.models.StudyParticipant,
            as: 'participant',
            attributes: ['id', 'participant_name', 'scheduled_date', 'scheduled_time']
          }
        ],
        order: [['created_at', 'DESC']]
      });
      return observers;
    } catch (error) {
      console.error('Error fetching observer requests by study:', error);
      throw error;
    }
  }

  /**
   * Get observer requests by session
   */
  async getObserverRequestsBySession(sessionId) {
    try {
      const observers = await sequelize.models.SessionObserver.findAll({
        where: { session_id: sessionId },
        include: [
          {
            model: sequelize.models.ResearchStudy,
            as: 'study',
            attributes: ['id', 'name']
          },
          {
            model: sequelize.models.StudyParticipant,
            as: 'participant',
            attributes: ['id', 'participant_name', 'scheduled_date', 'scheduled_time']
          }
        ],
        order: [['created_at', 'DESC']]
      });
      return observers;
    } catch (error) {
      console.error('Error fetching observer requests by session:', error);
      throw error;
    }
  }

  /**
   * Get observer requests by status
   */
  async getObserverRequestsByStatus(studyId, status) {
    try {
      const observers = await sequelize.models.SessionObserver.findAll({
        where: {
          study_id: studyId,
          status: status
        },
        include: [
          {
            model: sequelize.models.ResearchStudy,
            as: 'study',
            attributes: ['id', 'name']
          },
          {
            model: sequelize.models.StudyParticipant,
            as: 'participant',
            attributes: ['id', 'participant_name', 'scheduled_date', 'scheduled_time']
          }
        ],
        order: [['created_at', 'DESC']]
      });
      return observers;
    } catch (error) {
      console.error('Error fetching observer requests by status:', error);
      throw error;
    }
  }

  /**
   * Get observer statistics for a study
   */
  async getObserverStats(studyId) {
    try {
      const totalObservers = await sequelize.models.SessionObserver.count({
        where: { study_id: studyId }
      });

      const approvedObservers = await sequelize.models.SessionObserver.count({
        where: {
          study_id: studyId,
          status: 'approved'
        }
      });

      const pendingObservers = await sequelize.models.SessionObserver.count({
        where: {
          study_id: studyId,
          status: 'pending'
        }
      });

      const deniedObservers = await sequelize.models.SessionObserver.count({
        where: {
          study_id: studyId,
          status: 'denied'
        }
      });

      return {
        total_observers: totalObservers,
        approved_observers: approvedObservers,
        pending_observers: pendingObservers,
        denied_observers: deniedObservers
      };
    } catch (error) {
      console.error('Error fetching observer stats:', error);
      throw error;
    }
  }

  /**
   * Mark guidelines as sent
   */
  async markGuidelinesSent(observerId) {
    try {
      const observer = await sequelize.models.SessionObserver.findByPk(observerId);
      if (!observer) {
        throw new Error('Observer request not found');
      }

      await observer.update({
        guidelines_sent: true,
        guidelines_sent_at: new Date(),
        updated_at: new Date()
      });

      console.log('✅ Guidelines marked as sent for observer:', observerId);
      return observer;
    } catch (error) {
      console.error('Error marking guidelines as sent:', error);
      throw error;
    }
  }

  /**
   * Remove observer from session
   */
  async removeObserver(observerId, removedBy) {
    try {
      const observer = await sequelize.models.SessionObserver.findByPk(observerId);
      if (!observer) {
        throw new Error('Observer request not found');
      }

      await observer.update({
        status: 'removed',
        approved_by: removedBy,
        updated_at: new Date()
      });

      console.log('✅ Observer removed from session:', observerId);
      return observer;
    } catch (error) {
      console.error('Error removing observer:', error);
      throw error;
    }
  }
}

module.exports = new SessionObserverService(); 
