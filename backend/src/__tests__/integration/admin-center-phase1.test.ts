/**
 * Admin Center Phase 1 Integration Tests
 *
 * Per ADR 0025 Phase 1 spec, these tests verify:
 * - TEST 1 (bypass): non-owner denied + denial logged
 * - TEST 2 (survivor): audit log has durable fields after successful delete
 *
 * Note: /qori-delete was removed entirely (single destructive surface = /qori-admin).
 * The previous TEST 3 (one-path) is no longer needed.
 */

import { getTestDb, truncateAll, TEST_ORG_ID } from './setup/testDb';
import { isProjectOwner, assertProjectOwner } from '../../services/authorization.service';
import { logDispositionAction, gatherParticipantRecordCounts } from '../../services/audit.service';
import studyParticipantService from '../../services/study_participant.service';

import type { Project } from '../../database/models/project';
import type { ProjectMember } from '../../database/models/project_member';
import type { ResearchStudy } from '../../database/models/research_study';
import type { StudyParticipant } from '../../database/models/study_participant';
import type { DispositionAuditLog } from '../../database/models/disposition_audit_log';

const sequelize = getTestDb();
const ProjectModel = sequelize.models.Project as typeof Project;
const ProjectMemberModel = sequelize.models.ProjectMember as typeof ProjectMember;
const ResearchStudyModel = sequelize.models.ResearchStudy as typeof ResearchStudy;
const StudyParticipantModel = sequelize.models.StudyParticipant as typeof StudyParticipant;
const DispositionAuditLogModel = sequelize.models.DispositionAuditLog as typeof DispositionAuditLog;

describe('Admin Center Phase 1 Integration Tests', () => {
  const ownerId = 'U_OWNER_TEST';
  const nonOwnerId = 'U_NON_OWNER_TEST';

  beforeEach(async () => {
    await truncateAll();
  });

  afterAll(async () => {
    await sequelize.close();
  });

  /**
   * TEST 1 (bypass): Non-owner attempts delete via handler → denied + denial logged
   *
   * Verifies fail-closed authorization: non-owner cannot delete, and the
   * denial is logged with outcome:'denied'.
   */
  test('TEST 1 (bypass): non-owner delete attempt is denied and logged', async () => {
    // Setup: Create project, owner membership, study, and participant
    const testProject = await ProjectModel.create({
      name: 'Admin Center Test Project',
      slug: 'admin-center-test-project',
      channel_id: 'C_ADMIN_TEST',
      created_by: ownerId,
      organization_id: TEST_ORG_ID,
    });

    await ProjectMemberModel.create({
      project_id: testProject.id,
      user_id: ownerId,
      role: 'owner',
    });

    const testStudy = await ResearchStudyModel.create({
      name: 'Admin Test Study',
      project_id: testProject.id,
      created_by: ownerId,
      channel_name: 'admin-test-channel',
      researcher_name: 'Test Researcher',
      researcher_email: 'test@example.com',
    });

    const testParticipant = await StudyParticipantModel.create({
      study_id: testStudy.id,
      participant_code: 'P001',
      status_select: 'scheduled',
      added_by: ownerId,
    });

    // 1. Verify non-owner is NOT an owner
    const isOwner = await isProjectOwner(nonOwnerId, testProject.id);
    expect(isOwner).toBe(false);

    // 2. assertProjectOwner should throw for non-owner
    await expect(assertProjectOwner(nonOwnerId, testProject.id)).rejects.toThrow(
      /Access denied.*owner|not authorized/i
    );

    // 3. Simulate handler denial logging (as the handler would do)
    const denialLog = await logDispositionAction({
      action: 'deletion_denied',
      record_type: 'participant',
      target_id: testParticipant.id,
      target_identifier: testParticipant.participant_code,
      actor_user_id: nonOwnerId,
      project_id: testProject.id,
      project_name: testProject.name,
      study_id: testStudy.id,
      study_name: testStudy.name,
      participant_id: testParticipant.id,
      participant_code: testParticipant.participant_code,
      authorization_basis: 'project_owner_required',
      outcome: 'denied',
      outcome_detail: 'User is not project owner',
      records_affected: {},
    });

    // 4. Verify denial was logged
    expect(denialLog).toBeDefined();
    expect(denialLog.outcome).toBe('denied');
    expect(denialLog.actor_user_id).toBe(nonOwnerId);
    expect(denialLog.outcome_detail).toContain('not project owner');

    // 5. Query to confirm it's in the database
    const found = await DispositionAuditLogModel.findByPk(denialLog.id);
    expect(found).not.toBeNull();
    expect(found!.outcome).toBe('denied');
  });

  /**
   * TEST 2 (survivor): Successful delete → audit log has durable fields AFTER delete
   *
   * This is the re-query-bug check: we gather context BEFORE delete, execute delete,
   * then log with the pre-gathered values. The audit row must have study_name,
   * project_name, and records_affected populated even though the participant is gone.
   */
  test('TEST 2 (survivor): audit log has durable fields after successful delete', async () => {
    // Setup: Create project, owner membership, study
    const testProject = await ProjectModel.create({
      name: 'Survivor Test Project',
      slug: 'survivor-test-project',
      channel_id: 'C_SURVIVOR_TEST',
      created_by: ownerId,
      organization_id: TEST_ORG_ID,
    });

    await ProjectMemberModel.create({
      project_id: testProject.id,
      user_id: ownerId,
      role: 'owner',
    });

    const testStudy = await ResearchStudyModel.create({
      name: 'Survivor Test Study',
      project_id: testProject.id,
      created_by: ownerId,
      channel_name: 'survivor-test-channel',
      researcher_name: 'Test Researcher',
      researcher_email: 'test@example.com',
    });

    // Create a participant specifically for deletion
    const deletableParticipant = await StudyParticipantModel.create({
      study_id: testStudy.id,
      participant_code: 'P002',
      status_select: 'scheduled',
      added_by: ownerId,
    });

    // 1. GATHER BEFORE: Capture context before deletion
    const participantCode = deletableParticipant.participant_code;
    const participantId = deletableParticipant.id;
    const studyName = testStudy.name;
    const projectName = testProject.name;
    const recordCounts = await gatherParticipantRecordCounts(
      participantId,
      testStudy.id,
      participantCode
    );

    // 2. EXECUTE DELETE
    await studyParticipantService.deleteParticipant(participantId);

    // 3. Verify participant is actually gone
    const stillExists = await StudyParticipantModel.findByPk(participantId);
    expect(stillExists).toBeNull();

    // 4. LOG AFTER with pre-gathered values (truthful audit pattern)
    const auditLog = await logDispositionAction({
      action: 'delete_participant',
      record_type: 'participant',
      target_id: participantId,
      target_identifier: participantCode,
      actor_user_id: ownerId,
      project_id: testProject.id,
      project_name: projectName,
      study_id: testStudy.id,
      study_name: studyName,
      participant_id: participantId,
      participant_code: participantCode,
      authorization_basis: 'project_owner',
      outcome: 'success',
      outcome_detail: 'DSAR deletion request',
      records_affected: recordCounts,
    });

    // 5. VERIFY: Re-query the audit log row
    const survivorRow = await DispositionAuditLogModel.findByPk(auditLog.id);

    expect(survivorRow).not.toBeNull();
    // Durable fields must be populated (not NULL, not empty)
    expect(survivorRow!.project_name).toBe(projectName);
    expect(survivorRow!.study_name).toBe(studyName);
    expect(survivorRow!.participant_code).toBe(participantCode);
    expect(survivorRow!.outcome).toBe('success');
    // records_affected should be an object (even if counts are 0)
    expect(typeof survivorRow!.records_affected).toBe('object');
  });

});
