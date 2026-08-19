/**
 * Synthesis Cascade Contract Tests (ADR 0018)
 *
 * These tests verify the cascade CONTRACT:
 * - Gate A (structure): TEMPLATE_CONSUMES declares expected variables per synthesis type
 * - Gate B (integration): Handler helpers ACTUALLY READ what's declared from the variable store
 *
 * The structure tests verify the contract is correctly declared.
 * The integration tests verify the handler loads what's declared (not just structure).
 *
 * Infrastructure: Uses injectSequelizeForTest() to unify DB connections (L004 fix).
 */

import { getTestDb, truncateAll, TEST_ORG_ID } from './setup/testDb';
import { TEMPLATE_CONSUMES } from '../../helpers/slack/ui/cascadeReadinessBlocks';
import { buildSessionDataStats, buildAvailableEnrichments, buildSynthesisCascadeData } from '../../helpers/slack/commands/researchSynthesisHandler';
import { injectSequelizeForTest, clearInjectedSequelize, type VariableContext } from '../../helpers/studyVariables';

const sequelize = getTestDb();

// Mock GitHub functions (not needed for DB-only tests but avoids import errors)
jest.mock('../../helpers/github', () => ({
  fetchFileFromRepoByPath: jest.fn().mockResolvedValue({ content: '' }),
  createOrUpdateFileOnGitHub: jest.fn().mockResolvedValue({ success: true }),
  getContentRepo: jest.fn().mockReturnValue('test-repo'),
}));

beforeAll(() => {
  // CRITICAL: Inject test DB instance so studyVariables.ts reads from the same DB we seed
  injectSequelizeForTest(sequelize);
});

beforeEach(async () => {
  await truncateAll();
  jest.clearAllMocks();
});

afterAll(async () => {
  clearInjectedSequelize();
  await sequelize.close();
});

// ═══════════════════════════════════════════════════════════════════
// PART 1: STRUCTURE TESTS (Gate A — contract declaration is correct)
// ═══════════════════════════════════════════════════════════════════

describe('cascade contract structure: all synthesis types defined', () => {
  const synthesisTypes = [
    'affinity_mapping',
    'journey_mapping',
    'persona_generation',
    'jobs_to_be_done',
    'usability_issues',
    'design_opportunities',
  ];

  for (const synthesisType of synthesisTypes) {
    it(`${synthesisType} has TEMPLATE_CONSUMES entry`, () => {
      expect(TEMPLATE_CONSUMES[synthesisType]).toBeDefined();
      expect(Array.isArray(TEMPLATE_CONSUMES[synthesisType])).toBe(true);
      expect(TEMPLATE_CONSUMES[synthesisType].length).toBeGreaterThan(0);
    });
  }
});

describe('cascade contract structure: required variables', () => {
  const synthesisTypes = [
    'affinity_mapping',
    'journey_mapping',
    'persona_generation',
    'jobs_to_be_done',
    'usability_issues',
    'design_opportunities',
  ];

  for (const synthesisType of synthesisTypes) {
    it(`${synthesisType} requires atomic_nugget_core (required=true)`, () => {
      const consumes = TEMPLATE_CONSUMES[synthesisType];
      const nuggetCore = consumes.find((c: { key: string }) => c.key === 'atomic_nugget_core');

      expect(nuggetCore).toBeDefined();
      expect(nuggetCore!.required).toBe(true);
    });

    it(`${synthesisType} requires atomic_nugget_detail (required=true)`, () => {
      const consumes = TEMPLATE_CONSUMES[synthesisType];
      const nuggetDetail = consumes.find((c: { key: string }) => c.key === 'atomic_nugget_detail');

      expect(nuggetDetail).toBeDefined();
      expect(nuggetDetail!.required).toBe(true);
    });
  }
});

describe('cascade contract structure: spec structure valid', () => {
  const synthesisTypes = [
    'affinity_mapping',
    'journey_mapping',
    'persona_generation',
    'jobs_to_be_done',
    'usability_issues',
    'design_opportunities',
  ];

  for (const synthesisType of synthesisTypes) {
    it(`${synthesisType} consumes specs have required fields`, () => {
      const consumes = TEMPLATE_CONSUMES[synthesisType];

      for (const spec of consumes) {
        expect(spec.key).toBeDefined();
        expect(typeof spec.key).toBe('string');
        expect(typeof spec.required).toBe('boolean');
        expect(spec.label).toBeDefined();
        expect(typeof spec.label).toBe('string');
        expect(spec.source_hint).toBeDefined();
        expect(typeof spec.source_hint).toBe('string');
      }
    });
  }
});

describe('cascade contract structure: no duplicate keys', () => {
  const allTypes = Object.keys(TEMPLATE_CONSUMES);

  for (const type of allTypes) {
    it(`${type} has no duplicate keys in consumes`, () => {
      const consumes = TEMPLATE_CONSUMES[type];
      const keys = consumes.map((c: { key: string }) => c.key);
      const uniqueKeys = new Set(keys);

      expect(keys.length).toBe(uniqueKeys.size);
    });
  }
});

// ═══════════════════════════════════════════════════════════════════
// PART 2: INTEGRATION TESTS (Gate B — handler loads what's declared)
// ═══════════════════════════════════════════════════════════════════

describe('cascade contract integration: buildSessionDataStats reads nuggets', () => {
  it('returns null when no nuggets exist', async () => {
    // Create project and study first
    const Project = sequelize.models.Project;
    const ResearchStudy = sequelize.models.ResearchStudy;

    const project = await Project.create({
      name: 'Test Project',
      slug: 'test-project',
      status: 'active',
      created_by: 'U12345',
    organization_id: TEST_ORG_ID,
    });
    const study = await ResearchStudy.create({
      name: 'Test Study',
      slug: 'test-study',
      project_id: (project as unknown as { id: number }).id,
      status: 'active',
      created_by: 'U12345',
      channel_name: 'test-channel',
      researcher_name: 'Test Researcher',
      researcher_email: 'test@example.com',
    });

    const variableContext: VariableContext = {
      projectId: (project as unknown as { id: number }).id,
      studyId: (study as unknown as { id: number }).id,
    };

    const stats = await buildSessionDataStats(variableContext);
    expect(stats).toBeNull();
  });

  it('returns correct stats when nuggets are seeded', async () => {
    // Create project, study, and seed nuggets
    const Project = sequelize.models.Project;
    const ResearchStudy = sequelize.models.ResearchStudy;
    const StudyVariable = sequelize.models.StudyVariable;

    const project = await Project.create({
      name: 'Test Project',
      slug: 'test-project',
      status: 'active',
      created_by: 'U12345',
    organization_id: TEST_ORG_ID,
    });
    const study = await ResearchStudy.create({
      name: 'Test Study',
      slug: 'test-study',
      project_id: (project as unknown as { id: number }).id,
      status: 'active',
      created_by: 'U12345',
      channel_name: 'test-channel',
      researcher_name: 'Test Researcher',
      researcher_email: 'test@example.com',
    });

    const projectId = (project as unknown as { id: number }).id;
    const studyId = (study as unknown as { id: number }).id;

    // Seed atomic_nugget_core pool data
    const nuggets = [
      { id: 'NUG-001', participant: 'P001', text: 'First nugget', session: '2026-05-01' },
      { id: 'NUG-002', participant: 'P001', text: 'Second nugget', session: '2026-05-01' },
      { id: 'NUG-003', participant: 'P002', text: 'Third nugget', session: '2026-05-02' },
    ];

    for (const nugget of nuggets) {
      await StudyVariable.create({
        project_id: projectId,
        study_id: studyId,
        variable_key: 'atomic_nugget_core',
        variable_type: 'pool',
        item_key: nugget.id,
        value: nugget,
        participant_id: nugget.participant,
        source_template: 'session_summary',
        source_version: '1.0',
        source_date: new Date().toISOString(),
        is_pool: true,
        scope: 'study',
        stale: false,
        extracted_at: new Date(),
        updated_at: new Date(),
      });
    }

    const variableContext: VariableContext = { projectId, studyId };
    const stats = await buildSessionDataStats(variableContext);

    expect(stats).not.toBeNull();
    expect(stats!.totalNuggets).toBe(3);
    expect(stats!.totalSessions).toBe(2); // P001 and P002
    expect(stats!.participantBreakdown).toHaveLength(2);

    const p001 = stats!.participantBreakdown.find(p => p.participantId === 'P001');
    expect(p001).toBeDefined();
    expect(p001!.nuggetCount).toBe(2);
  });
});

describe('cascade contract integration: buildAvailableEnrichments reads optional vars', () => {
  it('returns empty array when no enrichments exist', async () => {
    const Project = sequelize.models.Project;
    const ResearchStudy = sequelize.models.ResearchStudy;

    const project = await Project.create({
      name: 'Test Project',
      slug: 'test-project',
      status: 'active',
      created_by: 'U12345',
    organization_id: TEST_ORG_ID,
    });
    const study = await ResearchStudy.create({
      name: 'Test Study',
      slug: 'test-study',
      project_id: (project as unknown as { id: number }).id,
      status: 'active',
      created_by: 'U12345',
      channel_name: 'test-channel',
      researcher_name: 'Test Researcher',
      researcher_email: 'test@example.com',
    });

    const variableContext: VariableContext = {
      projectId: (project as unknown as { id: number }).id,
      studyId: (study as unknown as { id: number }).id,
    };

    const enrichments = await buildAvailableEnrichments(variableContext, 'affinity_mapping');
    expect(enrichments).toEqual([]);
  });

  it('returns enrichments when optional variables are seeded', async () => {
    const Project = sequelize.models.Project;
    const ResearchStudy = sequelize.models.ResearchStudy;
    const StudyVariable = sequelize.models.StudyVariable;

    const project = await Project.create({
      name: 'Test Project',
      slug: 'test-project',
      status: 'active',
      created_by: 'U12345',
    organization_id: TEST_ORG_ID,
    });
    const study = await ResearchStudy.create({
      name: 'Test Study',
      slug: 'test-study',
      project_id: (project as unknown as { id: number }).id,
      status: 'active',
      created_by: 'U12345',
      channel_name: 'test-channel',
      researcher_name: 'Test Researcher',
      researcher_email: 'test@example.com',
    });

    const projectId = (project as unknown as { id: number }).id;
    const studyId = (study as unknown as { id: number }).id;

    // Seed target_barriers (optional enrichment that affinity_mapping consumes)
    const barriers = [
      { id: 'TB-001', barrier: 'Complex navigation' },
      { id: 'TB-002', barrier: 'Missing documentation' },
    ];

    for (const barrier of barriers) {
      await StudyVariable.create({
        project_id: projectId,
        study_id: studyId,
        variable_key: 'target_barriers',
        variable_type: 'pool',
        item_key: barrier.id,
        value: barrier,
        participant_id: null,
        source_template: 'research_brief',
        source_version: '1.0',
        source_date: new Date().toISOString(),
        is_pool: true,
        scope: 'study',
        stale: false,
        extracted_at: new Date(),
        updated_at: new Date(),
      });
    }

    const variableContext: VariableContext = { projectId, studyId };
    const enrichments = await buildAvailableEnrichments(variableContext, 'affinity_mapping');

    expect(enrichments.length).toBeGreaterThan(0);
    const barriersEnrichment = enrichments.find(e => e.key === 'target_barriers');
    expect(barriersEnrichment).toBeDefined();
    expect(barriersEnrichment!.count).toBe(2);
    expect(barriersEnrichment!.source).toBe('research_brief');
  });
});

describe('cascade contract integration: buildSynthesisCascadeData readiness logic', () => {
  it('returns readyToRun=false when required variables missing', async () => {
    const Project = sequelize.models.Project;
    const ResearchStudy = sequelize.models.ResearchStudy;

    const project = await Project.create({
      name: 'Test Project',
      slug: 'test-project',
      status: 'active',
      created_by: 'U12345',
    organization_id: TEST_ORG_ID,
    });
    const study = await ResearchStudy.create({
      name: 'Test Study',
      slug: 'test-study',
      project_id: (project as unknown as { id: number }).id,
      status: 'active',
      created_by: 'U12345',
      channel_name: 'test-channel',
      researcher_name: 'Test Researcher',
      researcher_email: 'test@example.com',
    });

    const variableContext: VariableContext = {
      projectId: (project as unknown as { id: number }).id,
      studyId: (study as unknown as { id: number }).id,
    };

    const cascadeData = await buildSynthesisCascadeData(variableContext, 'affinity_mapping');

    expect(cascadeData.readyToRun).toBe(false);
    expect(cascadeData.sessionStats).toBeNull();
    expect(cascadeData.missingRequired.length).toBeGreaterThan(0);

    // Should list atomic_nugget_core as missing
    const missingCore = cascadeData.missingRequired.find(m => m.key === 'atomic_nugget_core');
    expect(missingCore).toBeDefined();
  });

  it('returns readyToRun=true when all required variables present', async () => {
    const Project = sequelize.models.Project;
    const ResearchStudy = sequelize.models.ResearchStudy;
    const StudyVariable = sequelize.models.StudyVariable;

    const project = await Project.create({
      name: 'Test Project',
      slug: 'test-project',
      status: 'active',
      created_by: 'U12345',
    organization_id: TEST_ORG_ID,
    });
    const study = await ResearchStudy.create({
      name: 'Test Study',
      slug: 'test-study',
      project_id: (project as unknown as { id: number }).id,
      status: 'active',
      created_by: 'U12345',
      channel_name: 'test-channel',
      researcher_name: 'Test Researcher',
      researcher_email: 'test@example.com',
    });

    const projectId = (project as unknown as { id: number }).id;
    const studyId = (study as unknown as { id: number }).id;
    const now = new Date().toISOString();

    // Seed required: atomic_nugget_core
    await StudyVariable.create({
      project_id: projectId,
      study_id: studyId,
      variable_key: 'atomic_nugget_core',
      variable_type: 'pool',
      item_key: 'NUG-001',
      value: { id: 'NUG-001', participant: 'P001', text: 'Test nugget' },
      participant_id: 'P001',
      source_template: 'session_summary',
      source_version: '1.0',
      source_date: now,
      is_pool: true,
      scope: 'study',
      stale: false,
      extracted_at: new Date(),
      updated_at: new Date(),
    });

    // Seed required: atomic_nugget_detail
    await StudyVariable.create({
      project_id: projectId,
      study_id: studyId,
      variable_key: 'atomic_nugget_detail',
      variable_type: 'pool',
      item_key: 'NUG-001',
      value: { id: 'NUG-001', context: 'Test context', emotion: 'frustrated' },
      participant_id: 'P001',
      source_template: 'session_summary',
      source_version: '1.0',
      source_date: now,
      is_pool: true,
      scope: 'study',
      stale: false,
      extracted_at: new Date(),
      updated_at: new Date(),
    });

    const variableContext: VariableContext = { projectId, studyId };
    const cascadeData = await buildSynthesisCascadeData(variableContext, 'affinity_mapping');

    expect(cascadeData.readyToRun).toBe(true);
    expect(cascadeData.sessionStats).not.toBeNull();
    expect(cascadeData.sessionStats!.totalNuggets).toBe(1);
    expect(cascadeData.missingRequired).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════════
// PART 3: TYPE-SPECIFIC CONTRACT TESTS
// ═══════════════════════════════════════════════════════════════════

describe('cascade contract: type-specific requirements', () => {
  it('persona_generation requires participant_metadata', () => {
    const consumes = TEMPLATE_CONSUMES['persona_generation'];
    const participantMetadata = consumes.find((c: { key: string }) => c.key === 'participant_metadata');

    expect(participantMetadata).toBeDefined();
    expect(participantMetadata!.required).toBe(true);
  });

  it('affinity_mapping has participant_metadata as optional', () => {
    const consumes = TEMPLATE_CONSUMES['affinity_mapping'];
    const participantMetadata = consumes.find((c: { key: string }) => c.key === 'participant_metadata');

    expect(participantMetadata).toBeDefined();
    expect(participantMetadata!.required).toBe(false);
  });

  it('journey_mapping can optionally use personas', () => {
    const consumes = TEMPLATE_CONSUMES['journey_mapping'];
    const personas = consumes.find((c: { key: string }) => c.key === 'personas');

    expect(personas).toBeDefined();
    expect(personas!.required).toBe(false);
  });

  it('design_opportunities can optionally use stakeholder_constraints', () => {
    const consumes = TEMPLATE_CONSUMES['design_opportunities'];
    const constraints = consumes.find((c: { key: string }) => c.key === 'stakeholder_constraints');

    expect(constraints).toBeDefined();
    expect(constraints!.required).toBe(false);
  });

  it('types with target_barriers have it as optional', () => {
    const typesWithBarriers = ['affinity_mapping', 'journey_mapping', 'persona_generation'];

    for (const type of typesWithBarriers) {
      const consumes = TEMPLATE_CONSUMES[type];
      const barriers = consumes.find((c: { key: string }) => c.key === 'target_barriers');

      expect(barriers).toBeDefined();
      expect(barriers!.required).toBe(false);
    }
  });
});

describe('cascade contract: service_blueprint exclusion', () => {
  it('service_blueprint exists but is legacy (v1.2, not v7.0)', () => {
    const consumes = TEMPLATE_CONSUMES['service_blueprint'];
    expect(consumes).toBeDefined();

    const keys = consumes.map((c: { key: string }) => c.key);
    expect(keys).toContain('atomic_nugget_core');
    expect(keys).toContain('atomic_nugget_detail');
  });
});

describe('cascade contract: handler helpers exported', () => {
  it('buildSessionDataStats is exported and callable', () => {
    expect(typeof buildSessionDataStats).toBe('function');
  });

  it('buildAvailableEnrichments is exported and callable', () => {
    expect(typeof buildAvailableEnrichments).toBe('function');
  });

  it('buildSynthesisCascadeData is exported and callable', () => {
    expect(typeof buildSynthesisCascadeData).toBe('function');
  });
});
