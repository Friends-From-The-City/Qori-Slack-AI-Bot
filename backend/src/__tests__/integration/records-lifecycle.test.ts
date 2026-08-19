/**
 * GOV-6 — Records Lifecycle Integration Tests
 *
 * Tests all 23+ scenarios from the spec § 19, including:
 * - Schedule assignment and constraint validation
 * - Temporary vs permanent record behavior
 * - Deterministic eligibility date calculation
 * - Archival preserves canonical data
 * - Hold blocking behavior (project-level and record-level)
 * - Disposition gate (fail-closed)
 * - Disposition execution and events
 * - DSAR + hold interaction
 * - Raw SQL constraint enforcement
 */

import { getTestDb, truncateAll } from './setup/testDb';
import {
  injectSequelizeForTest as injectSchedule,
  clearInjectedSequelize as clearSchedule,
  createSchedule,
  findScheduleByPublicId,
} from '../../services/records-schedule.service';
import {
  injectSequelizeForTest as injectAssignment,
  clearInjectedSequelize as clearAssignment,
  assignRecord,
  setRetentionTrigger,
  findByRecord,
  findByProject,
} from '../../services/records-assignment.service';
import {
  injectSequelizeForTest as injectHold,
  clearInjectedSequelize as clearHold,
  createHold,
  releaseHold,
  computeEffectiveHold,
} from '../../services/records-hold.service';
import {
  injectSequelizeForTest as injectDisposition,
  clearInjectedSequelize as clearDisposition,
  evaluateEligibility,
  executeDisposition,
  findEventsByAssignment,
} from '../../services/disposition.service';
import {
  injectSequelizeForTest as injectArchival,
  clearInjectedSequelize as clearArchival,
  archiveProject,
  reactivateProject,
} from '../../services/archival.service';
import {
  injectSequelizeForTest as injectRetrieval,
  clearInjectedSequelize as clearRetrieval,
  retrieveProjectRecords,
} from '../../services/records-retrieval.service';
import {
  injectSequelizeForTest as injectDSAR,
  clearInjectedSequelize as clearDSAR,
  checkDSARRecordsConflict,
} from '../../services/records-dsar-boundary.service';

const sequelize = getTestDb();

// ─── Helpers ──────────────────────────────────────────────────────

async function seedProject(slug = 'gov6-test'): Promise<number> {
  const [rows] = await sequelize.query(
    `INSERT INTO projects (name, slug, status, created_by, created_at, updated_at)
     VALUES ('GOV-6 Test', '${slug}', 'active', 'U_TEST', NOW(), NOW())
     RETURNING id`
  );
  return (rows as any[])[0].id;
}

async function seedStudy(projectId: number, name = 'test-study'): Promise<{ id: number; public_id: string }> {
  const [rows] = await sequelize.query(
    `INSERT INTO research_studies (project_id, name, channel_name, created_by, researcher_name, researcher_email, created_at, updated_at)
     VALUES (${projectId}, '${name}', 'chan-test', 'U_TEST', 'Tester', 'test@test.com', NOW(), NOW())
     RETURNING id`
  );
  return { id: (rows as any[])[0].id, public_id: '' }; // studies don't have public_id yet
}

async function seedSource(projectId: number): Promise<string> {
  const [rows] = await sequelize.query(
    `INSERT INTO evidence_sources (project_id, source_type, label, created_by, created_at, updated_at)
     VALUES (${projectId}, 'survey_dataset', 'Test Source', 'U_TEST', NOW(), NOW())
     RETURNING public_id`
  );
  return (rows as any[])[0].public_id;
}

async function seedConstruct(projectId: number, label = 'Test nugget', payload: Record<string, unknown> = { text: 'Finding content', severity: 'high' }): Promise<string> {
  const [rows] = await sequelize.query(
    `INSERT INTO evidence_constructs (project_id, construct_type, derivation_type, status, label, payload, created_by, created_at, updated_at)
     VALUES (${projectId}, 'nugget', 'model', 'candidate', '${label}', '${JSON.stringify(payload)}', 'U_TEST', NOW(), NOW())
     RETURNING public_id`
  );
  return (rows as any[])[0].public_id;
}

async function seedArtifact(projectId: number): Promise<string> {
  const semanticKey = `test:${crypto.randomUUID()}`;
  const [rows] = await sequelize.query(
    `INSERT INTO research_artifacts (project_id, template_id, template_version, artifact_type, title, repo, ref, path, url, status, semantic_key, created_by, created_at, updated_at)
     VALUES (${projectId}, 'test_template', '1.0', 'readout', 'Test Artifact Title', 'test/repo', 'main', 'path/to/doc.md', 'https://example.com/doc', 'written', '${semanticKey}', 'U_TEST', NOW(), NOW())
     RETURNING public_id`
  );
  return (rows as any[])[0].public_id;
}

async function createTestSchedule(overrides: Record<string, any> = {}) {
  return createSchedule({
    authority_type: 'grs',
    authority_code: 'GRS 6.1-010',
    title: 'Test Schedule Item',
    record_value: 'temporary',
    retention_trigger: 'project_closed',
    retention_period_days: 90,
    disposition_action: 'destroy',
    ...overrides,
  });
}

// ─── Setup / Teardown ─────────────────────────────────────────────

beforeAll(() => {
  injectSchedule(sequelize);
  injectAssignment(sequelize);
  injectHold(sequelize);
  injectDisposition(sequelize);
  injectArchival(sequelize);
  injectRetrieval(sequelize);
  injectDSAR(sequelize);
});

afterAll(async () => {
  clearSchedule();
  clearAssignment();
  clearHold();
  clearDisposition();
  clearArchival();
  clearRetrieval();
  clearDSAR();
  await sequelize.close();
});

beforeEach(async () => {
  await truncateAll();
});

// ═══════════════════════════════════════════════════════════
// 1. SCHEDULE ASSIGNMENT
// ═══════════════════════════════════════════════════════════

describe('Records Schedule', () => {
  test('valid schedule assignment', async () => {
    const schedule = await createTestSchedule();
    expect(schedule.id).toBeDefined();
    expect(schedule.public_id).toBeDefined();
    expect(schedule.authority_type).toBe('grs');
    expect(schedule.record_value).toBe('temporary');
  });

  test('invalid authority_type rejected by DB', async () => {
    await expect(
      sequelize.query(
        `INSERT INTO records_schedules (authority_type, authority_code, title, record_value, retention_trigger, disposition_action, created_at)
         VALUES ('invalid_type', 'X', 'X', 'temporary', 'project_closed', 'destroy', NOW())`
      )
    ).rejects.toThrow(/chk_rs_authority_type/);
  });

  test('invalid record_value rejected by DB', async () => {
    await expect(
      sequelize.query(
        `INSERT INTO records_schedules (authority_type, authority_code, title, record_value, retention_trigger, disposition_action, created_at)
         VALUES ('grs', 'X', 'X', 'invalid_value', 'project_closed', 'destroy', NOW())`
      )
    ).rejects.toThrow(/chk_rs_record_value/);
  });

  test('invalid disposition_action rejected by DB', async () => {
    await expect(
      sequelize.query(
        `INSERT INTO records_schedules (authority_type, authority_code, title, record_value, retention_trigger, disposition_action, created_at)
         VALUES ('grs', 'X', 'X', 'temporary', 'project_closed', 'invalid_action', NOW())`
      )
    ).rejects.toThrow(/chk_rs_disposition_action/);
  });
});

// ═══════════════════════════════════════════════════════════
// 2. RECORDS ASSIGNMENT
// ═══════════════════════════════════════════════════════════

describe('Records Assignment', () => {
  test('valid record assignment', async () => {
    const projectId = await seedProject('assign-test');
    const sourcePublicId = await seedSource(projectId);

    const assignment = await assignRecord({
      project_id: projectId,
      record_type: 'evidence_source',
      record_public_id: sourcePublicId,
    });

    expect(assignment.lifecycle_status).toBe('active');
    expect(assignment.public_id).toBeDefined();
  });

  test('invalid record_type rejected by DB', async () => {
    const projectId = await seedProject('invalid-type');

    await expect(
      sequelize.query(
        `INSERT INTO records_management_assignments (project_id, record_type, record_public_id, lifecycle_status, assigned_at, updated_at)
         VALUES (${projectId}, 'invalid_type', '${crypto.randomUUID()}', 'active', NOW(), NOW())`
      )
    ).rejects.toThrow(/chk_rma_record_type/);
  });

  test('invalid lifecycle_status rejected by DB', async () => {
    const projectId = await seedProject('invalid-status');

    await expect(
      sequelize.query(
        `INSERT INTO records_management_assignments (project_id, record_type, record_public_id, lifecycle_status, assigned_at, updated_at)
         VALUES (${projectId}, 'project', '${crypto.randomUUID()}', 'invalid_status', NOW(), NOW())`
      )
    ).rejects.toThrow(/chk_rma_lifecycle_status/);
  });

  test('duplicate record_type + record_public_id rejected by unique constraint', async () => {
    const projectId = await seedProject('dup-test');
    const pubId = crypto.randomUUID();

    await sequelize.query(
      `INSERT INTO records_management_assignments (project_id, record_type, record_public_id, lifecycle_status, assigned_at, updated_at)
       VALUES (${projectId}, 'project', '${pubId}', 'active', NOW(), NOW())`
    );

    await expect(
      sequelize.query(
        `INSERT INTO records_management_assignments (project_id, record_type, record_public_id, lifecycle_status, assigned_at, updated_at)
         VALUES (${projectId}, 'project', '${pubId}', 'active', NOW(), NOW())`
      )
    ).rejects.toThrow(/uq_rma_record_type_public_id|Validation error/);
  });
});

// ═══════════════════════════════════════════════════════════
// 3. RETENTION CALCULATION
// ═══════════════════════════════════════════════════════════

describe('Retention Calculation', () => {
  test('deterministic eligibility date: retention_start + period_days', async () => {
    const projectId = await seedProject('retention-test');
    const schedule = await createTestSchedule({ retention_period_days: 30 });
    const sourcePublicId = await seedSource(projectId);

    const assignment = await assignRecord({
      project_id: projectId,
      record_type: 'evidence_source',
      record_public_id: sourcePublicId,
      records_schedule_id: schedule.id,
    });

    const startDate = new Date('2026-01-01');
    const result = await setRetentionTrigger(assignment.id, {
      retention_start_at: startDate,
    });

    expect(result.eligible_disposition_at).toBeDefined();
    const expected = new Date('2026-01-31');
    expect(result.eligible_disposition_at!.toISOString().slice(0, 10)).toBe(
      expected.toISOString().slice(0, 10)
    );
  });

  test('missing retention trigger blocks eligibility', async () => {
    const projectId = await seedProject('no-trigger');
    const schedule = await createTestSchedule();
    const sourcePublicId = await seedSource(projectId);

    const assignment = await assignRecord({
      project_id: projectId,
      record_type: 'evidence_source',
      record_public_id: sourcePublicId,
      records_schedule_id: schedule.id,
    });

    const eligibility = await evaluateEligibility(assignment.id);
    expect(eligibility.eligible).toBe(false);
    expect(eligibility.reasons).toContain('NO_CUTOFF');
  });

  test('no schedule → no automatic eligibility', async () => {
    const projectId = await seedProject('no-sched');
    const sourcePublicId = await seedSource(projectId);

    const assignment = await assignRecord({
      project_id: projectId,
      record_type: 'evidence_source',
      record_public_id: sourcePublicId,
    });

    const eligibility = await evaluateEligibility(assignment.id);
    expect(eligibility.eligible).toBe(false);
    expect(eligibility.reasons).toContain('NO_SCHEDULE');
  });
});

// ═══════════════════════════════════════════════════════════
// 4. ARCHIVAL
// ═══════════════════════════════════════════════════════════

describe('Archival', () => {
  test('archived record remains retrievable', async () => {
    const projectId = await seedProject('archive-retrieve');
    const sourcePublicId = await seedSource(projectId);

    await assignRecord({
      project_id: projectId,
      record_type: 'evidence_source',
      record_public_id: sourcePublicId,
    });

    await archiveProject(projectId, 'U_TEST');

    // Record still exists in DB
    const assignment = await findByRecord('evidence_source', sourcePublicId);
    expect(assignment).not.toBeNull();
    expect(assignment!.lifecycle_status).toBe('archived');

    // Evidence source still in DB
    const [sources] = await sequelize.query(
      `SELECT * FROM evidence_sources WHERE public_id = '${sourcePublicId}'`
    );
    expect((sources as any[]).length).toBe(1);
  });

  test('archive does not delete canonical evidence', async () => {
    const projectId = await seedProject('archive-evidence');
    const constructPublicId = await seedConstruct(projectId);

    await archiveProject(projectId, 'U_TEST');

    // Construct still exists
    const [constructs] = await sequelize.query(
      `SELECT * FROM evidence_constructs WHERE public_id = '${constructPublicId}'`
    );
    expect((constructs as any[]).length).toBe(1);
  });

  test('reactivate restores active status', async () => {
    const projectId = await seedProject('reactivate');
    const sourcePublicId = await seedSource(projectId);

    await assignRecord({
      project_id: projectId,
      record_type: 'evidence_source',
      record_public_id: sourcePublicId,
    });

    await archiveProject(projectId, 'U_TEST');
    const result = await reactivateProject(projectId, 'U_TEST');

    expect(result.new_status).toBe('active');
    expect(result.assignments_reactivated).toBe(1);

    const assignment = await findByRecord('evidence_source', sourcePublicId);
    expect(assignment!.lifecycle_status).toBe('active');
  });
});

// ═══════════════════════════════════════════════════════════
// 5. HOLDS
// ═══════════════════════════════════════════════════════════

describe('Holds', () => {
  test('active project hold blocks child disposition', async () => {
    const projectId = await seedProject('hold-project');
    const schedule = await createTestSchedule({ retention_period_days: 1 });
    const sourcePublicId = await seedSource(projectId);

    const assignment = await assignRecord({
      project_id: projectId,
      record_type: 'evidence_source',
      record_public_id: sourcePublicId,
      records_schedule_id: schedule.id,
    });

    // Set retention in the past so record is otherwise eligible
    await setRetentionTrigger(assignment.id, {
      retention_start_at: new Date('2020-01-01'),
    });

    // Create project-level hold (no targets = project scope)
    await createHold({
      project_id: projectId,
      hold_type: 'legal',
      title: 'Litigation hold',
      issued_by: 'U_ADMIN',
    });

    const eligibility = await evaluateEligibility(assignment.id);
    expect(eligibility.eligible).toBe(false);
    expect(eligibility.reasons).toContain('ACTIVE_HOLD');
  });

  test('record-level hold blocks disposition', async () => {
    const projectId = await seedProject('hold-record');
    const schedule = await createTestSchedule({ retention_period_days: 1 });
    const sourcePublicId = await seedSource(projectId);

    const assignment = await assignRecord({
      project_id: projectId,
      record_type: 'evidence_source',
      record_public_id: sourcePublicId,
      records_schedule_id: schedule.id,
    });

    await setRetentionTrigger(assignment.id, {
      retention_start_at: new Date('2020-01-01'),
    });

    // Create record-level hold
    await createHold({
      project_id: projectId,
      hold_type: 'audit',
      title: 'Audit hold on specific source',
      issued_by: 'U_ADMIN',
      targets: [{ target_type: 'evidence_source', target_public_id: sourcePublicId }],
    });

    const holdResult = await computeEffectiveHold(projectId, 'evidence_source', sourcePublicId);
    expect(holdResult.effective_hold).toBe(true);
    expect(holdResult.holds[0].scope).toBe('record');
  });

  test('released hold no longer blocks', async () => {
    const projectId = await seedProject('hold-release');
    const schedule = await createTestSchedule({ retention_period_days: 1 });
    const sourcePublicId = await seedSource(projectId);

    const assignment = await assignRecord({
      project_id: projectId,
      record_type: 'evidence_source',
      record_public_id: sourcePublicId,
      records_schedule_id: schedule.id,
    });

    await setRetentionTrigger(assignment.id, {
      retention_start_at: new Date('2020-01-01'),
    });

    const hold = await createHold({
      project_id: projectId,
      hold_type: 'legal',
      title: 'Temporary hold',
      issued_by: 'U_ADMIN',
    });

    // Confirm blocked
    let eligibility = await evaluateEligibility(assignment.id);
    expect(eligibility.eligible).toBe(false);

    // Release hold
    await releaseHold(hold.id, 'U_ADMIN');

    // Now eligible
    eligibility = await evaluateEligibility(assignment.id);
    expect(eligibility.eligible).toBe(true);
  });

  test('invalid hold_type rejected by DB', async () => {
    const projectId = await seedProject('hold-invalid');

    await expect(
      sequelize.query(
        `INSERT INTO records_holds (project_id, hold_type, title, status, issued_by, issued_at, created_at)
         VALUES (${projectId}, 'invalid_type', 'X', 'active', 'U_TEST', NOW(), NOW())`
      )
    ).rejects.toThrow(/chk_rh_hold_type/);
  });

  test('invalid hold status rejected by DB', async () => {
    const projectId = await seedProject('hold-status-invalid');

    await expect(
      sequelize.query(
        `INSERT INTO records_holds (project_id, hold_type, title, status, issued_by, issued_at, created_at)
         VALUES (${projectId}, 'legal', 'X', 'invalid_status', 'U_TEST', NOW(), NOW())`
      )
    ).rejects.toThrow(/chk_rh_status/);
  });
});

// ═══════════════════════════════════════════════════════════
// 6. PERMANENT RECORDS
// ═══════════════════════════════════════════════════════════

describe('Permanent Records', () => {
  test('permanent record cannot be destroyed (eligibility gate)', async () => {
    const projectId = await seedProject('permanent');
    const schedule = await createTestSchedule({
      record_value: 'permanent',
      disposition_action: 'transfer',
    });
    const constructPublicId = await seedConstruct(projectId);

    const assignment = await assignRecord({
      project_id: projectId,
      record_type: 'evidence_construct',
      record_public_id: constructPublicId,
      records_schedule_id: schedule.id,
    });

    await setRetentionTrigger(assignment.id, {
      retention_start_at: new Date('2020-01-01'),
    });

    const eligibility = await evaluateEligibility(assignment.id);
    expect(eligibility.eligible).toBe(false);
    expect(eligibility.reasons).toContain('TRANSFER_REQUIRED');
  });

  test('permanent record cannot reach completed destroy via executeDisposition', async () => {
    const projectId = await seedProject('perm-exec');
    const schedule = await createTestSchedule({
      record_value: 'permanent',
      disposition_action: 'transfer',
    });
    const constructPublicId = await seedConstruct(projectId, 'Permanent finding', { text: 'Must not be destroyed' });

    const assignment = await assignRecord({
      project_id: projectId,
      record_type: 'evidence_construct',
      record_public_id: constructPublicId,
      records_schedule_id: schedule.id,
    });

    await setRetentionTrigger(assignment.id, {
      retention_start_at: new Date('2020-01-01'),
    });

    const result = await executeDisposition(assignment.id, 'U_ADMIN', true);
    // Eligibility gate blocks permanent records before adapter is reached
    expect(result.outcome).toBe('blocked');
    expect(result.reasons.some((r: string) => r.includes('transfer'))).toBe(true);

    // Content must remain intact — no suppression occurred
    const [rows] = await sequelize.query(
      `SELECT label, payload FROM evidence_constructs WHERE public_id = '${constructPublicId}'`
    );
    const row = (rows as any[])[0];
    expect(row.label).toBe('Permanent finding');
    expect(row.payload).toEqual({ text: 'Must not be destroyed' });
  });
});

// ═══════════════════════════════════════════════════════════
// 7. DISPOSITION
// ═══════════════════════════════════════════════════════════

describe('Disposition', () => {
  test('eligible temporary construct: completed destroy suppresses payload', async () => {
    const projectId = await seedProject('eligible');
    const schedule = await createTestSchedule({ retention_period_days: 1 });
    const constructPublicId = await seedConstruct(projectId, 'Sensitive finding', { text: 'Governed content', severity: 'critical' });

    const assignment = await assignRecord({
      project_id: projectId,
      record_type: 'evidence_construct',
      record_public_id: constructPublicId,
      records_schedule_id: schedule.id,
    });

    await setRetentionTrigger(assignment.id, {
      retention_start_at: new Date('2020-01-01'),
    });

    const result = await executeDisposition(assignment.id, 'U_ADMIN', true);
    expect(result.outcome).toBe('completed');
    expect(result.event_public_id).toBeDefined();

    // Verify event created
    const events = await findEventsByAssignment(assignment.id);
    expect(events.length).toBe(1);
    expect(events[0].action).toBe('destroy');
    expect(events[0].outcome).toBe('completed');

    // Verify content was actually suppressed
    const [rows] = await sequelize.query(
      `SELECT label, payload, public_id, construct_type, derivation_type, status, created_by
       FROM evidence_constructs WHERE public_id = '${constructPublicId}'`
    );
    const row = (rows as any[])[0];
    // Content suppressed
    expect(row.label).toBeNull();
    expect(row.payload).toBeNull();
    // Structural metadata preserved
    expect(row.public_id).toBe(constructPublicId);
    expect(row.construct_type).toBe('nugget');
    expect(row.derivation_type).toBe('model');
    expect(row.status).toBe('candidate');
    expect(row.created_by).toBe('U_TEST');
  });

  test('eligible temporary artifact: completed destroy suppresses title/path/url', async () => {
    const projectId = await seedProject('eligible-artifact');
    const schedule = await createTestSchedule({ retention_period_days: 1 });
    const artifactPublicId = await seedArtifact(projectId);

    const assignment = await assignRecord({
      project_id: projectId,
      record_type: 'research_artifact',
      record_public_id: artifactPublicId,
      records_schedule_id: schedule.id,
    });

    await setRetentionTrigger(assignment.id, {
      retention_start_at: new Date('2020-01-01'),
    });

    const result = await executeDisposition(assignment.id, 'U_ADMIN', true);
    expect(result.outcome).toBe('completed');

    // Verify content suppressed
    const [rows] = await sequelize.query(
      `SELECT title, path, url, public_id, artifact_type, repo, ref, semantic_key
       FROM research_artifacts WHERE public_id = '${artifactPublicId}'`
    );
    const row = (rows as any[])[0];
    expect(row.title).toBeNull();
    expect(row.path).toBeNull();
    expect(row.url).toBeNull();
    // Structural metadata preserved
    expect(row.public_id).toBe(artifactPublicId);
    expect(row.artifact_type).toBe('readout');
    expect(row.repo).toBe('test/repo');
    expect(row.semantic_key).toBeDefined();
  });

  test('unsupported record type → manual_review_required, remains undisposed', async () => {
    const projectId = await seedProject('unsupported');
    const schedule = await createTestSchedule({ retention_period_days: 1 });
    const sourcePublicId = await seedSource(projectId);

    const assignment = await assignRecord({
      project_id: projectId,
      record_type: 'evidence_source',
      record_public_id: sourcePublicId,
      records_schedule_id: schedule.id,
    });

    await setRetentionTrigger(assignment.id, {
      retention_start_at: new Date('2020-01-01'),
    });

    const result = await executeDisposition(assignment.id, 'U_ADMIN', true);
    expect(result.outcome).toBe('manual_review_required');
    expect(result.reasons[0]).toContain('No automated disposition adapter');

    // Assignment NOT marked disposed
    const updated = await findByRecord('evidence_source', sourcePublicId);
    expect(updated!.lifecycle_status).not.toBe('disposed');

    // Source content remains intact
    const [rows] = await sequelize.query(
      `SELECT label, artifact_ref, metadata FROM evidence_sources WHERE public_id = '${sourcePublicId}'`
    );
    expect((rows as any[])[0].label).toBe('Test Source');
  });

  test('unauthorized disposition rejected', async () => {
    const projectId = await seedProject('unauth');
    const schedule = await createTestSchedule({ retention_period_days: 1 });
    const sourcePublicId = await seedSource(projectId);

    const assignment = await assignRecord({
      project_id: projectId,
      record_type: 'evidence_source',
      record_public_id: sourcePublicId,
      records_schedule_id: schedule.id,
    });

    await setRetentionTrigger(assignment.id, {
      retention_start_at: new Date('2020-01-01'),
    });

    const result = await executeDisposition(assignment.id, 'U_NORMAL', false);
    expect(result.outcome).toBe('blocked');
    expect(result.reasons[0]).toContain('AUTH_DENIED');
  });

  test('temporary record before retention date cannot be destroyed', async () => {
    const projectId = await seedProject('too-early');
    const schedule = await createTestSchedule({ retention_period_days: 36500 }); // 100 years
    const sourcePublicId = await seedSource(projectId);

    const assignment = await assignRecord({
      project_id: projectId,
      record_type: 'evidence_source',
      record_public_id: sourcePublicId,
      records_schedule_id: schedule.id,
    });

    await setRetentionTrigger(assignment.id, {
      retention_start_at: new Date(),
    });

    const eligibility = await evaluateEligibility(assignment.id);
    expect(eligibility.eligible).toBe(false);
    expect(eligibility.reasons).toContain('NOT_YET_ELIGIBLE');
  });

  test('disposed item cannot be disposed twice (idempotent)', async () => {
    const projectId = await seedProject('double-dispose');
    const schedule = await createTestSchedule({ retention_period_days: 1 });
    const constructPublicId = await seedConstruct(projectId);

    const assignment = await assignRecord({
      project_id: projectId,
      record_type: 'evidence_construct',
      record_public_id: constructPublicId,
      records_schedule_id: schedule.id,
    });

    await setRetentionTrigger(assignment.id, {
      retention_start_at: new Date('2020-01-01'),
    });

    // First disposition — completes
    const first = await executeDisposition(assignment.id, 'U_ADMIN', true);
    expect(first.outcome).toBe('completed');

    // Second attempt — blocked (idempotent)
    const second = await executeDisposition(assignment.id, 'U_ADMIN', true);
    expect(second.outcome).toBe('blocked');
    expect(second.reasons).toContain('Record already disposed');
  });

  test('disposition event created on blocked attempt', async () => {
    const projectId = await seedProject('blocked-event');
    const sourcePublicId = await seedSource(projectId);

    // No schedule assigned
    const assignment = await assignRecord({
      project_id: projectId,
      record_type: 'evidence_source',
      record_public_id: sourcePublicId,
    });

    const result = await executeDisposition(assignment.id, 'U_ADMIN', true);
    expect(result.outcome).toBe('blocked');

    const events = await findEventsByAssignment(assignment.id);
    expect(events.length).toBe(1);
    expect(events[0].outcome).toBe('blocked');
  });

  test('invalid disposition event action rejected by DB', async () => {
    const projectId = await seedProject('invalid-event-action');
    const sourcePublicId = await seedSource(projectId);

    const assignment = await assignRecord({
      project_id: projectId,
      record_type: 'evidence_source',
      record_public_id: sourcePublicId,
    });

    await expect(
      sequelize.query(
        `INSERT INTO records_disposition_events (assignment_id, action, authority_code, outcome, actor, executed_at, details)
         VALUES (${assignment.id}, 'invalid_action', 'X', 'completed', 'U_TEST', NOW(), '{}')`
      )
    ).rejects.toThrow(/chk_rde_action/);
  });

  test('invalid disposition event outcome rejected by DB', async () => {
    const projectId = await seedProject('invalid-event-outcome');
    const sourcePublicId = await seedSource(projectId);

    const assignment = await assignRecord({
      project_id: projectId,
      record_type: 'evidence_source',
      record_public_id: sourcePublicId,
    });

    await expect(
      sequelize.query(
        `INSERT INTO records_disposition_events (assignment_id, action, authority_code, outcome, actor, executed_at, details)
         VALUES (${assignment.id}, 'destroy', 'X', 'invalid_outcome', 'U_TEST', NOW(), '{}')`
      )
    ).rejects.toThrow(/chk_rde_outcome/);
  });
});

// ═══════════════════════════════════════════════════════════
// 8. NO PII IN DISPOSITION EVENTS
// ═══════════════════════════════════════════════════════════

describe('Disposition Event PII Safety', () => {
  test('no PII in disposition event details', async () => {
    const projectId = await seedProject('pii-check');
    const schedule = await createTestSchedule({ retention_period_days: 1 });
    const constructPublicId = await seedConstruct(projectId);

    const assignment = await assignRecord({
      project_id: projectId,
      record_type: 'evidence_construct',
      record_public_id: constructPublicId,
      records_schedule_id: schedule.id,
    });

    await setRetentionTrigger(assignment.id, {
      retention_start_at: new Date('2020-01-01'),
    });

    await executeDisposition(assignment.id, 'U_ADMIN', true);

    const events = await findEventsByAssignment(assignment.id);
    const details = events[0].details as Record<string, unknown>;

    // Details should contain only structural metadata
    expect(details).toHaveProperty('record_type');
    expect(details).toHaveProperty('record_public_id');
    expect(details).toHaveProperty('schedule_title');
    expect(details).toHaveProperty('suppressed_fields');

    // Should NOT contain any PII-like fields
    const detailsStr = JSON.stringify(details);
    expect(detailsStr).not.toContain('email');
    expect(detailsStr).not.toContain('phone');
    expect(detailsStr).not.toContain('address');
    expect(detailsStr).not.toContain('ssn');
  });
});

// ═══════════════════════════════════════════════════════════
// 9. DSAR + HOLD INTERACTION
// ═══════════════════════════════════════════════════════════

describe('DSAR + Records Interaction', () => {
  test('DSAR + active hold returns governance review required', async () => {
    const projectId = await seedProject('dsar-hold');
    const sourcePublicId = await seedSource(projectId);

    // Create a hold
    await createHold({
      project_id: projectId,
      hold_type: 'legal',
      title: 'Active litigation',
      issued_by: 'U_ADMIN',
    });

    const check = await checkDSARRecordsConflict(projectId, 'evidence_source', sourcePublicId);
    expect(check.decision).toBe('BLOCKED_BY_HOLD');
    expect(check.has_active_hold).toBe(true);
  });

  test('DSAR + records assignment returns governance review required', async () => {
    const projectId = await seedProject('dsar-assignment');
    const schedule = await createTestSchedule();
    const sourcePublicId = await seedSource(projectId);

    await assignRecord({
      project_id: projectId,
      record_type: 'evidence_source',
      record_public_id: sourcePublicId,
      records_schedule_id: schedule.id,
    });

    const check = await checkDSARRecordsConflict(projectId, 'evidence_source', sourcePublicId);
    expect(check.decision).toBe('GOVERNANCE_REVIEW_REQUIRED');
    expect(check.has_records_assignment).toBe(true);
  });

  test('DSAR with no records obligations permits deletion', async () => {
    const projectId = await seedProject('dsar-free');
    const sourcePublicId = await seedSource(projectId);

    const check = await checkDSARRecordsConflict(projectId, 'evidence_source', sourcePublicId);
    expect(check.decision).toBe('PERMIT');
  });
});

// ═══════════════════════════════════════════════════════════
// 10. RETRIEVAL
// ═══════════════════════════════════════════════════════════

describe('Retrieval', () => {
  test('archived project records are retrievable', async () => {
    const projectId = await seedProject('retrieve-test');
    const sourcePublicId = await seedSource(projectId);
    const constructPublicId = await seedConstruct(projectId);

    await assignRecord({
      project_id: projectId,
      record_type: 'evidence_source',
      record_public_id: sourcePublicId,
    });

    await archiveProject(projectId, 'U_TEST');

    const records = await retrieveProjectRecords(projectId);
    expect(records.project.status).toBe('archived');
    expect(records.evidence_sources.length).toBe(1);
    expect(records.evidence_constructs.length).toBe(1);
    expect(records.records_assignments.length).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════
// 11. CASCADE SAFETY
// ═══════════════════════════════════════════════════════════

describe('Project Cascade Safety', () => {
  test('project deletion cascades assignments but preserves disposition events via RESTRICT', async () => {
    const projectId = await seedProject('cascade-test');
    const schedule = await createTestSchedule({ retention_period_days: 1 });
    const constructPublicId = await seedConstruct(projectId);

    const assignment = await assignRecord({
      project_id: projectId,
      record_type: 'evidence_construct',
      record_public_id: constructPublicId,
      records_schedule_id: schedule.id,
    });

    await setRetentionTrigger(assignment.id, {
      retention_start_at: new Date('2020-01-01'),
    });

    // Execute disposition (creates event)
    await executeDisposition(assignment.id, 'U_ADMIN', true);

    // Project deletion should be blocked by RESTRICT on disposition_events FK
    await expect(
      sequelize.query(`DELETE FROM projects WHERE id = ${projectId}`)
    ).rejects.toThrow();
  });
});
