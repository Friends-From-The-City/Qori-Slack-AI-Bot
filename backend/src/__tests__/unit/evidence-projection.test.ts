/**
 * Unit tests for the evidence projection seam.
 *
 * Tests verify:
 * - Accepted valid constructs project correctly
 * - Non-accepted constructs are not projected
 * - Accepted malformed constructs fail loudly (EvidenceProjectionError)
 * - Projected shape satisfies destination cascade schema
 * - Projection performs no LLM call (deterministic)
 * - Same construct produces identical projection repeatedly
 *
 * No database required.
 */

import {
  projectConstruct,
  registerProjection,
  hasProjection,
} from '../../services/evidence-projection.service';
import type { EvidenceConstruct } from '../../database/models/evidence_construct';
import { EvidenceProjectionError } from '../../types/handlers';

// Helper: create a minimal EvidenceConstruct-shaped object for testing
function fakeConstruct(overrides: Partial<EvidenceConstruct> = {}): EvidenceConstruct {
  return {
    id: 1,
    public_id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    project_id: 100,
    study_id: null,
    construct_type: 'knowledge_gap',
    label: 'Test gap',
    payload: {
      id: 'KG-001',
      title: 'Test gap title',
      summary: 'A knowledge gap',
      source_document: 'doc1.pdf',
      evidence: ['doc1.pdf'],
    },
    derivation_type: 'deterministic',
    derivation_context: null,
    status: 'accepted',
    reviewed_by: 'U12345',
    reviewed_at: new Date(),
    cascade_variable_key: null,
    created_by: 'U12345',
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  } as unknown as EvidenceConstruct;
}

describe('evidence-projection.service', () => {
  describe('projectConstruct — accepted valid construct', () => {
    it('projects an accepted knowledge_gap into cascade-compatible shape', () => {
      const construct = fakeConstruct({
        construct_type: 'knowledge_gap',
        payload: {
          id: 'KG-001',
          title: 'VA upload process gaps',
          summary: 'Multiple steps require redundant data entry',
          domain: 'usability',
          evidence: ['doc1.pdf', 'doc2.pdf'],
          source_document: 'desk-research-report.md',
          confidence: 'Strong',
        },
        status: 'accepted',
      });

      const result = projectConstruct(construct);

      expect(result).not.toBeNull();
      expect(result).toHaveLength(1);

      const projection = result![0];
      expect(projection.variable_key).toBe('knowledge_gaps');
      expect(projection.is_pool).toBe(true);
      expect(projection.item_key).toBe('KG-001');
      expect(projection.source_template).toBe('evidence_projection');
      expect(projection.value).toEqual({
        id: 'KG-001',
        title: 'VA upload process gaps',
        summary: 'Multiple steps require redundant data entry',
        domain: 'usability',
        evidence: ['doc1.pdf', 'doc2.pdf'],
        source_document: 'desk-research-report.md',
        confidence: 'Strong',
      });
    });

    it('projects an accepted barrier into discovered_barriers shape', () => {
      const construct = fakeConstruct({
        construct_type: 'barrier',
        payload: {
          id: 'DB-003',
          title: 'File size limit blocks uploads',
          summary: 'Users cannot upload files larger than 10MB',
          magnitude: 'high',
          evidence: ['session-3-notes.md'],
          affected_population: 'Veterans with large medical records',
          source_document: 'session_notes',
          confidence: 'Moderate',
        },
        status: 'accepted',
      });

      const result = projectConstruct(construct);

      expect(result).not.toBeNull();
      expect(result).toHaveLength(1);
      expect(result![0].variable_key).toBe('discovered_barriers');
      expect(result![0].is_pool).toBe(true);
      expect(result![0].value.id).toBe('DB-003');
      expect(result![0].value.magnitude).toBe('high');
    });
  });

  describe('projectConstruct — non-accepted constructs', () => {
    it('returns null for candidate constructs', () => {
      const construct = fakeConstruct({ status: 'candidate' });
      expect(projectConstruct(construct)).toBeNull();
    });

    it('returns null for rejected constructs', () => {
      const construct = fakeConstruct({ status: 'rejected' });
      expect(projectConstruct(construct)).toBeNull();
    });

    it('returns null for overridden constructs', () => {
      const construct = fakeConstruct({ status: 'overridden' });
      expect(projectConstruct(construct)).toBeNull();
    });

    it('returns null for construct types without a registered projection', () => {
      const construct = fakeConstruct({
        construct_type: 'persona',
        status: 'accepted',
      });
      expect(projectConstruct(construct)).toBeNull();
    });
  });

  describe('projectConstruct — fail-closed on malformed accepted constructs', () => {
    it('throws EvidenceProjectionError when payload is null', () => {
      const construct = fakeConstruct({
        construct_type: 'knowledge_gap',
        payload: null,
        status: 'accepted',
      });

      expect(() => projectConstruct(construct)).toThrow(EvidenceProjectionError);
    });

    it('throws EvidenceProjectionError when required field "id" is missing', () => {
      const construct = fakeConstruct({
        construct_type: 'knowledge_gap',
        payload: { title: 'Has title', summary: 'Has summary', source_document: 'doc.pdf' },
        status: 'accepted',
      });

      expect(() => projectConstruct(construct)).toThrow(EvidenceProjectionError);
      try {
        projectConstruct(construct);
      } catch (e) {
        expect((e as EvidenceProjectionError).missingFields).toContain('id');
      }
    });

    it('throws EvidenceProjectionError when required field "summary" is missing', () => {
      const construct = fakeConstruct({
        construct_type: 'barrier',
        payload: { id: 'DB-001', title: 'Has title', source_document: 'doc.pdf' },
        status: 'accepted',
      });

      expect(() => projectConstruct(construct)).toThrow(EvidenceProjectionError);
      try {
        projectConstruct(construct);
      } catch (e) {
        expect((e as EvidenceProjectionError).missingFields).toContain('summary');
      }
    });

    it('throws EvidenceProjectionError when multiple required fields are missing', () => {
      const construct = fakeConstruct({
        construct_type: 'knowledge_gap',
        payload: { domain: 'usability' }, // missing id, title, summary, source_document
        status: 'accepted',
      });

      expect(() => projectConstruct(construct)).toThrow(EvidenceProjectionError);
      try {
        projectConstruct(construct);
      } catch (e) {
        const err = e as EvidenceProjectionError;
        expect(err.missingFields).toContain('id');
        expect(err.missingFields).toContain('title');
        expect(err.missingFields).toContain('summary');
        expect(err.missingFields).toContain('source_document');
      }
    });
  });

  describe('projectConstruct — deterministic (idempotent)', () => {
    it('same construct produces identical projection repeatedly', () => {
      const construct = fakeConstruct({
        construct_type: 'knowledge_gap',
        payload: {
          id: 'KG-STABLE',
          title: 'Stable gap',
          summary: 'Always the same',
          source_document: 'doc.pdf',
        },
        status: 'accepted',
      });

      const result1 = projectConstruct(construct);
      const result2 = projectConstruct(construct);
      const result3 = projectConstruct(construct);

      expect(result1).toEqual(result2);
      expect(result2).toEqual(result3);
    });
  });

  describe('registry', () => {
    it('hasProjection returns true for registered types', () => {
      expect(hasProjection('knowledge_gap')).toBe(true);
      expect(hasProjection('barrier')).toBe(true);
    });

    it('hasProjection returns false for unregistered types', () => {
      expect(hasProjection('persona')).toBe(false);
      expect(hasProjection('ticket_candidate')).toBe(false);
    });

    it('allows registering custom projections with schema', () => {
      registerProjection(
        'finding',
        (construct) => [{
          variable_key: 'prioritized_finding',
          value: {
            id: String(construct.payload!.id),
            title: String(construct.payload!.title),
          },
          source_template: 'evidence_projection',
          is_pool: true,
          item_key: String(construct.payload!.id),
        }],
        { requiredPayloadFields: ['id', 'title'] },
      );

      expect(hasProjection('finding')).toBe(true);

      const result = projectConstruct(fakeConstruct({
        construct_type: 'finding',
        payload: { id: 'F-001', title: 'Test finding' },
        status: 'accepted',
      }));

      expect(result).not.toBeNull();
      expect(result![0].variable_key).toBe('prioritized_finding');
    });
  });
});
