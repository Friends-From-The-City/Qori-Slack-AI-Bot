// services/session_observer.service.ts

import type { SessionObserver } from '../database/models/session_observer';
import type { ResearchStudy } from '../database/models/research_study';
import type { StudyParticipant } from '../database/models/study_participant';
import type { ObserverRole, ObserverStatus } from '../types/common';
import { Op } from 'sequelize';

const sequelize = require('../database');

// Typed model references — cast once, use everywhere. See Phase 3 notes.
const SessionObserverModel = sequelize.models.SessionObserver as typeof SessionObserver;
const ResearchStudyModel = sequelize.models.ResearchStudy as typeof ResearchStudy;
const StudyParticipantModel = sequelize.models.StudyParticipant as typeof StudyParticipant;

const MAX_OBSERVERS_PER_SESSION = 3;
const ROLE_LIMITS: Record<string, number> = {
  note_taker: 1,
  stakeholder: 1,
  pm_observer: 2,
  silent_observer: 3,
};

interface ObserverInput {
  session_id: string;
  study_id?: number;
  participant_id?: number | null;
  requester_id: string | string[];
  requester_name: string | string[];
  role?: ObserverRole;
  reason?: string;
  status?: ObserverStatus;
  joined_via?: string;
  [key: string]: unknown;
}

interface ConfirmedObserverInput {
  session_id: string;
  study_id: number;
  participant_id?: number | null;
  requester_id: string;
  requester_name: string;
  joined_via: string;
  role?: ObserverRole;
}

interface CanAddResult {
  allowed: boolean;
  slotsRemaining: number;
  reason?: string;
  role?: string;
  roleLimit?: number;
}

interface ObserverStats {
  total_observers: number;
  confirmed_observers: number;
  approved_observers: number;
  pending_observers: number;
  denied_observers: number;
  sessions_covered: number;
  sessions_at_cap: number;
  total_sessions: number;
}

interface SessionWithCount {
  id: string;
  sessionId: string;
  participantId: number;
  label: string;
  count: number;
}

class SessionObserverService {
  /**
   * Helper: Ensure value is array
   * Handles: arrays, JSON strings (like '["U09PAF33A8H"]'), plain strings
   */
  _toArray(value: unknown): string[] {
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
    return [String(value)];
  }

  /**
   * Helper: Add unique values to array
   */
  _addUnique(existingArray: unknown, newValue: string): string[] {
    const arr = this._toArray(existingArray);
    return arr.includes(newValue) ? arr : [...arr, newValue];
  }

  /**
   * Create or update an observer request based on session_id
   */
  async createObserverRequest(observerData: ObserverInput): Promise<SessionObserver> {
    try {
      const [observer, created] = await SessionObserverModel.findOrCreate({
        where: { session_id: observerData.session_id },
        defaults: {
          ...observerData,
          requester_id: this._toArray(observerData.requester_id),
          requester_name: this._toArray(observerData.requester_name),
        } as any
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

  /**
   * Add a confirmed observer directly (no approval step).
   * Idempotent: if the user is already an observer for this session, returns the existing row.
   */
  async addConfirmedObserver({ session_id, study_id, participant_id, requester_id, requester_name, joined_via, role = 'silent_observer' }: ConfirmedObserverInput): Promise<{ observer: SessionObserver; created: boolean }> {
    try {
      // Check if this user is already an observer for this session
      const existing = await this._findObserverForSession(session_id, requester_id);
      if (existing) {
        return { observer: existing, created: false };
      }

      const observer = await SessionObserverModel.create({
        session_id,
        study_id,
        participant_id: participant_id || null,
        requester_id: this._toArray(requester_id),
        requester_name: this._toArray(requester_name),
        role,
        status: 'confirmed',
        joined_via,
      } as any);

      console.log('✅ Confirmed observer added:', observer.id, 'session:', session_id);
      return { observer, created: true };
    } catch (error) {
      console.error('Error adding confirmed observer:', error);
      throw error;
    }
  }

  /**
   * Check if a user is already an observer for a specific session.
   * Returns true if any active row (not removed/denied) exists.
   */
  async isObserverForSession(sessionId: string, userId: string): Promise<boolean> {
    const existing = await this._findObserverForSession(sessionId, userId);
    return !!existing;
  }

  /**
   * Internal: find an active observer row for a session + user.
   */
  async _findObserverForSession(sessionId: string, userId: string): Promise<SessionObserver | null> {
    const observers = await SessionObserverModel.findAll({
      where: {
        session_id: sessionId,
        status: { [Op.notIn]: ['removed', 'denied'] },
      },
    });

    return observers.find((obs: SessionObserver) => {
      const ids = this._toArray(obs.requester_id);
      return ids.includes(userId);
    }) || null;
  }

  /**
   * Count active (confirmed + approved) observers for a session.
   */
  async countConfirmedObserversForSession(sessionId: string): Promise<number> {
    return SessionObserverModel.count({
      where: {
        session_id: sessionId,
        status: { [Op.in]: ['confirmed', 'approved'] },
      },
    });
  }

  /**
   * Count active observers for a session filtered by role.
   */
  async countObserversByRoleForSession(sessionId: string, role: string): Promise<number> {
    return SessionObserverModel.count({
      where: {
        session_id: sessionId,
        role,
        status: { [Op.in]: ['confirmed', 'approved'] },
      },
    });
  }

  /**
   * Check if more observers can be added to a session.
   * When role is provided, checks both the overall session cap and the per-role limit.
   */
  async canAddObserversToSession(sessionId: string, count: number = 1, role: string | null = null): Promise<CanAddResult> {
    const current = await this.countConfirmedObserversForSession(sessionId);
    const slotsRemaining = MAX_OBSERVERS_PER_SESSION - current;

    // Overall session cap
    if (count > slotsRemaining) {
      return { allowed: false, slotsRemaining, reason: 'session_full' };
    }

    // Per-role limit
    if (role && ROLE_LIMITS[role]) {
      const roleCount = await this.countObserversByRoleForSession(sessionId, role);
      const roleLimit = ROLE_LIMITS[role];
      if (roleCount + count > roleLimit) {
        return { allowed: false, slotsRemaining, reason: 'role_full', role, roleLimit };
      }
    }

    return { allowed: true, slotsRemaining };
  }

  async getObserverByUser(userId: string): Promise<SessionObserver[]> {
    console.log("🚀 ~ SessionObserverService ~ getObserverByUser ~ userId:", userId)
    try {
      // Fetch all active observers and filter where user is in requester_id array
      const allObservers = await SessionObserverModel.findAll({
        where: { status: { [Op.in]: ['approved', 'confirmed'] } },
        include: [
          {
            model: ResearchStudyModel,
            as: 'study',
            attributes: ['id', 'name', 'path', 'researcher_name']
          },
          {
            model: StudyParticipantModel,
            as: 'participant',
            attributes: ['id', 'participant_name', 'scheduled_date', 'scheduled_time', 'status_select']
          }
        ],
        order: [['created_at', 'DESC']]
      });
      console.log("🚀 ~ SessionObserverService ~ getObserverByUser ~ allObservers:", allObservers)

      // Filter using helper method - handle both getter property and raw dataValues
      const filtered = allObservers.filter((observer: SessionObserver) => {
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
  async updateObserverStatus(observerId: number, status: ObserverStatus, approvedBy: string | null = null): Promise<SessionObserver> {
    try {
      const observer = await SessionObserverModel.findByPk(observerId);
      if (!observer) {
        throw new Error('Observer request not found');
      }

      const updateData: Record<string, unknown> = {
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
  async getObserverRequestsByStudy(studyId: number): Promise<SessionObserver[]> {
    try {
      const observers = await SessionObserverModel.findAll({
        where: { study_id: studyId },
        include: [
          {
            model: ResearchStudyModel,
            as: 'study',
            attributes: ['id', 'name']
          },
          {
            model: StudyParticipantModel,
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
  async getObserverRequestsBySession(sessionId: string): Promise<SessionObserver[]> {
    try {
      const observers = await SessionObserverModel.findAll({
        where: { session_id: sessionId },
        include: [
          {
            model: ResearchStudyModel,
            as: 'study',
            attributes: ['id', 'name']
          },
          {
            model: StudyParticipantModel,
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
  async getObserverRequestsByStatus(studyId: number, status: ObserverStatus): Promise<SessionObserver[]> {
    try {
      const observers = await SessionObserverModel.findAll({
        where: {
          study_id: studyId,
          status: status
        },
        include: [
          {
            model: ResearchStudyModel,
            as: 'study',
            attributes: ['id', 'name']
          },
          {
            model: StudyParticipantModel,
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
   * Get observer statistics for a study, including session coverage.
   */
  async getObserverStats(studyId: number): Promise<ObserverStats> {
    try {
      const totalObservers = await SessionObserverModel.count({
        where: { study_id: studyId }
      });

      const confirmedObservers = await SessionObserverModel.count({
        where: { study_id: studyId, status: 'confirmed' }
      });

      const approvedObservers = await SessionObserverModel.count({
        where: { study_id: studyId, status: 'approved' }
      });

      const pendingObservers = await SessionObserverModel.count({
        where: { study_id: studyId, status: 'pending' }
      });

      const deniedObservers = await SessionObserverModel.count({
        where: { study_id: studyId, status: 'denied' }
      });

      // Session coverage
      let sessions_covered = 0;
      let sessions_at_cap = 0;
      let totalSessions = 0;

      try {
        const activeBySession = await SessionObserverModel.findAll({
          where: {
            study_id: studyId,
            status: { [Op.in]: ['confirmed', 'approved'] },
          },
          attributes: [
            'session_id',
            // as any — Sequelize fn/col aggregates don't map to model attributes
            [sequelize.fn('COUNT', sequelize.col('id')), 'cnt'],
          ],
          group: ['session_id'],
          raw: true,
        });
        sessions_covered = activeBySession.length;
        sessions_at_cap = activeBySession.filter((r: any) => parseInt(r.cnt, 10) >= MAX_OBSERVERS_PER_SESSION).length;
      } catch (e: any) {
        console.error('Error computing session coverage:', e.message);
      }

      try {
        totalSessions = await StudyParticipantModel.count({
          where: { study_id: studyId },
        });
      } catch (e: any) {
        console.error('Error counting total sessions:', e.message);
      }

      return {
        total_observers: totalObservers,
        confirmed_observers: confirmedObservers,
        approved_observers: approvedObservers,
        pending_observers: pendingObservers,
        denied_observers: deniedObservers,
        sessions_covered,
        sessions_at_cap,
        total_sessions: totalSessions,
      };
    } catch (error) {
      console.error('Error fetching observer stats:', error);
      throw error;
    }
  }

  /**
   * Get all observers for a study (confirmed + approved).
   */
  async getObserversByStudy(studyId: number): Promise<SessionObserver[]> {
    try {
      return await SessionObserverModel.findAll({
        where: {
          study_id: studyId,
          status: { [Op.in]: ['confirmed', 'approved'] },
        },
        include: [
          { model: ResearchStudyModel, as: 'study', attributes: ['id', 'name', 'path', 'researcher_name'] },
          { model: StudyParticipantModel, as: 'participant', attributes: ['id', 'participant_name', 'scheduled_date', 'scheduled_time'] },
        ],
        order: [['created_at', 'DESC']],
      });
    } catch (error) {
      console.error('Error fetching observers by study:', error);
      throw error;
    }
  }

  /**
   * Mark guidelines as sent
   */
  async markGuidelinesSent(observerId: number): Promise<SessionObserver> {
    try {
      const observer = await SessionObserverModel.findByPk(observerId);
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
  async removeObserver(observerId: number, removedBy: string): Promise<SessionObserver> {
    try {
      const observer = await SessionObserverModel.findByPk(observerId);
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

/**
 * Build session options with current observer counts for a study.
 * Returns array of { id, sessionId, participantId, label, count }.
 */
const buildSessionsWithCounts = async (studyId: number): Promise<SessionWithCount[]> => {
  const studyParticipantService = require('./study_participant.service');
  const participants: StudyParticipant[] = await studyParticipantService.getParticipantsByStudy(studyId);
  const sessions: SessionWithCount[] = [];

  for (const p of participants) {
    const ptId = `PT-${String(p.id).padStart(3, '0')}`;
    const dateStr = p.scheduled_date || 'TBD';
    const count = await service.countConfirmedObserversForSession(ptId);
    sessions.push({
      id: `${ptId}|${p.id}`,
      sessionId: ptId,
      participantId: p.id,
      label: `${ptId} — ${dateStr}`,
      count,
    });
  }

  return sessions;
};

const service = new SessionObserverService();
(service as any).MAX_OBSERVERS_PER_SESSION = MAX_OBSERVERS_PER_SESSION;
(service as any).ROLE_LIMITS = ROLE_LIMITS;
(service as any).buildSessionsWithCounts = buildSessionsWithCounts;

module.exports = service;
