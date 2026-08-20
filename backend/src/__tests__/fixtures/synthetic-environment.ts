/**
 * Synthetic Demo/Test Environment — WS-0 Foundation
 *
 * Deterministic fixture contract for developer testing and future demo dataset.
 * Absolutely no real PII.
 *
 * Usage:
 *   import { seedSyntheticEnvironment, SYNTHETIC } from '../fixtures/synthetic-environment';
 *   await seedSyntheticEnvironment(sequelize);
 *
 * All IDs are deterministic so tests can reference them by constant.
 */

import type { Sequelize } from 'sequelize';

// ─── Deterministic Fixture Constants ───────────────────────────────

export const SYNTHETIC = {
  // Organization
  org: {
    slug: 'demo-agency',
    name: 'Demo Federal Agency',
    publicId: '00000000-0000-4000-a000-000000000001',
  },

  // Teams
  teams: {
    research: { slug: 'ux-research', name: 'UX Research Team' },
    design: { slug: 'design', name: 'Design Team' },
  },

  // Actors (synthetic researchers — no real PII)
  actors: {
    researcher1: {
      displayName: 'Alex Rivera',
      publicId: '00000000-0000-4000-a000-000000000010',
      provider: 'oidc',
      providerSubject: 'demo-researcher-1',
    },
    researcher2: {
      displayName: 'Jordan Chen',
      publicId: '00000000-0000-4000-a000-000000000011',
      provider: 'oidc',
      providerSubject: 'demo-researcher-2',
    },
    admin: {
      displayName: 'Sam Taylor',
      publicId: '00000000-0000-4000-a000-000000000012',
      provider: 'oidc',
      providerSubject: 'demo-admin',
    },
  },

  // Projects
  projects: {
    active: {
      slug: 'claims-redesign',
      name: 'Claims Process Redesign',
      publicId: '00000000-0000-4000-a000-000000000020',
    },
    completed: {
      slug: 'onboarding-study',
      name: 'New User Onboarding Study',
      publicId: '00000000-0000-4000-a000-000000000021',
    },
    archived: {
      slug: 'legacy-navigation',
      name: 'Legacy Navigation Audit',
      publicId: '00000000-0000-4000-a000-000000000022',
    },
  },

  // Studies
  studies: {
    active: {
      name: 'Claims Form Usability Study',
      path: 'claims-form-usability',
    },
    completed: {
      name: 'Onboarding Wizard Evaluation',
      path: 'onboarding-wizard-eval',
    },
    archived: {
      name: 'Navigation Patterns Audit',
      path: 'nav-patterns-audit',
    },
  },

  // Participant codes (no PII — codes only)
  participants: {
    p1: { participant_code: 'P001', status: 'completed' },
    p2: { participant_code: 'P002', status: 'completed' },
    p3: { participant_code: 'P003', status: 'scheduled' },
    p4: { participant_code: 'P004', status: 'no_show' },
  },

  // Evidence chain
  evidence: {
    source: { semanticKey: 'transcript:claims:P001:session-1', sourceType: 'transcript' },
    nugget: { semanticKey: 'nugget:claims:form-confusion', constructType: 'nugget', label: 'Form field confusion' },
    theme: { semanticKey: 'theme:claims:form-ux', constructType: 'theme', label: 'Form UX patterns' },
    finding: { semanticKey: 'finding:claims:form-redesign', constructType: 'finding', label: 'Redesign claim forms for clarity' },
    recommendation: { semanticKey: 'rec:claims:simplified-form', constructType: 'recommendation', label: 'Simplify claim submission form' },
  },

  // Artifacts
  artifacts: {
    brief: { templateId: 'research_brief', artifactType: 'brief', title: 'Claims Research Brief' },
    plan: { templateId: 'research_plan', artifactType: 'plan', title: 'Claims Research Plan' },
    readout: { templateId: 'research_readout', artifactType: 'readout', title: 'Claims Research Readout' },
  },

  // Governance
  governance: {
    staleEvidence: { label: 'Stale evidence marker' },
    recordsHold: { holdType: 'litigation', reason: 'Synthetic hold for demo' },
    dsarSafe: { subjectCode: 'DSAR-DEMO-001' },
  },

  // Branding
  branding: {
    displayName: 'Demo Agency Research Portal',
    shortName: 'DARP',
    publicUrl: 'https://research.demo.agency.gov',
    themeTokens: {
      'color-primary': '#1a4480',
      'color-accent': '#005ea2',
      'color-base': '#1b1b1b',
    },
  },
} as const;

// ─── Seed Function ─────────────────────────────────────────────────

/**
 * Seed the synthetic environment into the database.
 * Idempotent — checks for existing org before inserting.
 */
export async function seedSyntheticEnvironment(sequelize: Sequelize): Promise<SeedResult> {
  const result: SeedResult = {
    organization: null,
    teams: [],
    actors: [],
    projects: [],
    studies: [],
    participants: [],
    evidenceSources: [],
    evidenceConstructs: [],
    artifacts: [],
  };

  const t = await sequelize.transaction();

  try {
    // 1. Organization
    const [org] = await sequelize.query(
      `INSERT INTO organizations (public_id, slug, name, status)
       VALUES (:publicId, :slug, :name, 'active')
       ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
       RETURNING id, public_id, slug`,
      {
        replacements: SYNTHETIC.org,
        transaction: t,
      },
    ) as [Array<{ id: number; public_id: string; slug: string }>, unknown];
    const orgId = org[0].id;
    result.organization = org[0];

    // 2. Teams
    for (const [, teamDef] of Object.entries(SYNTHETIC.teams)) {
      const [team] = await sequelize.query(
        `INSERT INTO teams (organization_id, slug, name, status)
         VALUES (:orgId, :slug, :name, 'active')
         ON CONFLICT (organization_id, slug) DO UPDATE SET name = EXCLUDED.name
         RETURNING id, public_id, slug`,
        { replacements: { orgId, ...teamDef }, transaction: t },
      ) as [Array<{ id: number; public_id: string; slug: string }>, unknown];
      result.teams.push(team[0]);
    }

    // 3. Actors
    for (const [, actorDef] of Object.entries(SYNTHETIC.actors)) {
      const [actor] = await sequelize.query(
        `INSERT INTO actors (public_id, organization_id, display_name, status)
         VALUES (:publicId, :orgId, :displayName, 'active')
         ON CONFLICT (public_id) DO UPDATE SET display_name = EXCLUDED.display_name
         RETURNING id, public_id, display_name`,
        { replacements: { orgId, ...actorDef }, transaction: t },
      ) as [Array<{ id: number; public_id: string; display_name: string }>, unknown];
      result.actors.push(actor[0]);

      // Create identity
      await sequelize.query(
        `INSERT INTO actor_identities (actor_id, provider, provider_subject, metadata)
         VALUES (:actorId, :provider, :providerSubject, '{}')
         ON CONFLICT DO NOTHING`,
        {
          replacements: { actorId: actor[0].id, provider: actorDef.provider, providerSubject: actorDef.providerSubject },
          transaction: t,
        },
      );
    }

    // 4. Projects
    for (const [key, projDef] of Object.entries(SYNTHETIC.projects)) {
      const status = key === 'archived' ? 'archived' : key === 'completed' ? 'completed' : 'active';
      const [proj] = await sequelize.query(
        `INSERT INTO projects (public_id, slug, name, status, created_by, organization_id)
         VALUES (:publicId, :slug, :name, :status, 'synthetic-seed', :orgId)
         ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
         RETURNING id, public_id, slug`,
        { replacements: { orgId, status, ...projDef }, transaction: t },
      ) as [Array<{ id: number; public_id: string; slug: string }>, unknown];
      result.projects.push(proj[0]);

      // Add admin as owner
      const adminActor = result.actors.find(a => a.display_name === 'Sam Taylor');
      if (adminActor) {
        await sequelize.query(
          `INSERT INTO project_memberships (project_id, actor_id, role)
           VALUES (:projectId, :actorId, 'owner')
           ON CONFLICT (project_id, actor_id) DO NOTHING`,
          { replacements: { projectId: proj[0].id, actorId: adminActor.id }, transaction: t },
        );
      }

      // Add researcher1 as researcher
      const researcher = result.actors.find(a => a.display_name === 'Alex Rivera');
      if (researcher) {
        await sequelize.query(
          `INSERT INTO project_memberships (project_id, actor_id, role)
           VALUES (:projectId, :actorId, 'researcher')
           ON CONFLICT (project_id, actor_id) DO NOTHING`,
          { replacements: { projectId: proj[0].id, actorId: researcher.id }, transaction: t },
        );
      }
    }

    // 5. Organization memberships
    //    All actors start as 'member' (migration backfill rule).
    //    Sam Taylor is then explicitly promoted to 'owner' (bootstrap rule).
    for (const actorResult of result.actors) {
      await sequelize.query(
        `INSERT INTO organization_memberships (organization_id, actor_id, role)
         VALUES (:orgId, :actorId, 'member')
         ON CONFLICT (organization_id, actor_id) DO NOTHING`,
        { replacements: { orgId, actorId: actorResult.id }, transaction: t },
      );
    }
    // Explicit bootstrap: promote Sam Taylor to owner
    const adminActor = result.actors.find(a => a.display_name === 'Sam Taylor');
    if (adminActor) {
      await sequelize.query(
        `UPDATE organization_memberships SET role = 'owner', updated_at = NOW()
         WHERE organization_id = :orgId AND actor_id = :actorId`,
        { replacements: { orgId, actorId: adminActor.id }, transaction: t },
      );
    }

    // 6. Branding
    if (result.organization) {
      await sequelize.query(
        `INSERT INTO organization_branding (organization_id, display_name, short_name, public_url, theme_tokens)
         VALUES (:orgId, :displayName, :shortName, :publicUrl, :themeTokens)
         ON CONFLICT (organization_id) DO UPDATE SET
           display_name = EXCLUDED.display_name,
           short_name = EXCLUDED.short_name`,
        {
          replacements: {
            orgId,
            displayName: SYNTHETIC.branding.displayName,
            shortName: SYNTHETIC.branding.shortName,
            publicUrl: SYNTHETIC.branding.publicUrl,
            themeTokens: JSON.stringify(SYNTHETIC.branding.themeTokens),
          },
          transaction: t,
        },
      );
    }

    await t.commit();
  } catch (error) {
    await t.rollback();
    throw error;
  }

  return result;
}

/**
 * Reset the synthetic environment — remove all synthetic data.
 */
export async function resetSyntheticEnvironment(sequelize: Sequelize): Promise<void> {
  await sequelize.query(
    `DELETE FROM organizations WHERE slug = :slug`,
    { replacements: { slug: SYNTHETIC.org.slug } },
  );
}

// ─── Types ─────────────────────────────────────────────────────────

interface SeedResult {
  organization: { id: number; public_id: string; slug: string } | null;
  teams: Array<{ id: number; public_id: string; slug: string }>;
  actors: Array<{ id: number; public_id: string; display_name: string }>;
  projects: Array<{ id: number; public_id: string; slug: string }>;
  studies: Array<{ id: number }>;
  participants: Array<{ id: number }>;
  evidenceSources: Array<{ id: number }>;
  evidenceConstructs: Array<{ id: number }>;
  artifacts: Array<{ id: number }>;
}
