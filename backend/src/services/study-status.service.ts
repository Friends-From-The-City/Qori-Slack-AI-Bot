import type { StudyStatus } from '../database/models/study_status';
import { Op, type CreationAttributes } from 'sequelize';

import sequelize from '../database';

// Typed model reference — cast once, use everywhere. See Phase 3 notes.
const StudyStatusModel = sequelize.models.StudyStatus as typeof StudyStatus;

interface StudyStatusInput {
  file_name?: string;
  path?: string;
  study_id?: number;
  status?: string;
  reason?: string | null;
  requested_by?: string | null;
  approved_by?: string | null;
  [key: string]: unknown;
}

const addStudyStatus = async (data: StudyStatusInput): Promise<StudyStatus> => {
  try {
    // Extract file_name from URL if path is provided
    let fileName = data.file_name;
    if (!fileName && data.path) {
      const urlParts = data.path.split('/');
      fileName = urlParts[urlParts.length - 1]; // Get the last part of the URL
    }


    // Check if a record with this file_name already exists
    const existingRecord = await StudyStatusModel.findOne({
      where: { file_name: fileName },
    });

    if (existingRecord) {
      // Update existing record
      const updateData: Record<string, unknown> = {
        study_id: data.study_id,
        path: data.path,
        status: data.status,
        updated_at: new Date(),
      };

      // For approvals, clear reason and requested_by
      if (data.status === 'approve') {
        updateData.reason = null;
        updateData.requested_by = null;
        updateData.approved_by = data.approved_by;
      } else {
        // For other statuses, update relevant fields
        if (data.reason !== undefined) updateData.reason = data.reason;
        if (data.requested_by !== undefined) updateData.requested_by = data.requested_by;
        if (data.approved_by !== undefined) updateData.approved_by = data.approved_by;
      }

      const updatedRecord = await existingRecord.update(updateData);
      return updatedRecord;
    }

    // Create new record
    const createData = {
      ...data,
      path: data.path,
      file_name: fileName,
    };

    const record = await StudyStatusModel.create(createData as CreationAttributes<StudyStatus>);
    return record;
  } catch (err) {
    console.error('addStudyStatus error:', err);
    throw new Error('Failed to add or update study status');
  }
};

const getStudyStatusByStudyId = async (studyId: number): Promise<StudyStatus[]> => {
  try {
    const records = await StudyStatusModel.findAll({
      where: { study_id: studyId },
      order: [['updated_at', 'DESC']], // Most recent first
    });

    return records;
  } catch (err) {
    console.error('getStudyStatusByStudyId error:', err);
    throw new Error('Failed to fetch study status records');
  }
};

const getStudyStatusByFileName = async (fileName: string): Promise<StudyStatus[]> => {
  try {
    const records = await StudyStatusModel.findAll({
      where: { file_name: fileName },
      order: [['updated_at', 'DESC']],
    });
    return records;
  } catch (err) {
    console.error('getStudyStatusByFileName error:', err);
    throw new Error('Failed to fetch study status records by file name');
  }
};

const getStudyStatusById = async (id: number): Promise<StudyStatus | null> => {
  try {
    const record = await StudyStatusModel.findByPk(id);
    return record;
  } catch (err) {
    console.error('getStudyStatusById error:', err);
    throw new Error('Failed to fetch study status record by ID');
  }
};

const getStudyStakeholderGuide = async (studyId?: number): Promise<StudyStatus[]> => {
  try {
    const whereClause: Record<string, unknown> = {
      file_name: {
        [Op.iLike]: '%stakeholder%' // Case-insensitive search for "stakeholder" in filename
      }
    };

    // Add study_id filter if provided
    if (studyId !== undefined) {
      whereClause.study_id = studyId;
    }

    const records = await StudyStatusModel.findAll({
      where: whereClause,
      order: [['updated_at', 'DESC']], // Most recent first
    });

    return records;
  } catch (err) {
    console.error('getStudyStakeholderGuide error:', err);
    throw new Error('Failed to fetch study stakeholder guide');
  }
};

export { addStudyStatus, getStudyStatusByStudyId, getStudyStatusByFileName, getStudyStatusById, getStudyStakeholderGuide };
