/**
 * EvidenceRelationship Model
 *
 * Per ADR 0030: Directed typed edges in the evidence lineage graph.
 *
 * Lineage endpoint integrity is database-enforced via FK columns and
 * CHECK constraints:
 *   - from_source_id / from_construct_id: exactly one non-null (CHECK)
 *   - to_source_id / to_construct_id: exactly one non-null (CHECK)
 *   - All four columns are FK-backed with CASCADE delete
 *
 * Currently supported edge patterns:
 *   source → construct    (DERIVED_FROM)
 *   construct → construct (SUPPORTS, ADDRESSES, TESTED_BY, etc.)
 *
 * Future edge types (e.g., recommendation → ticket) can be added via
 * additive FK columns when those vertical slices are implemented.
 *
 * Identity (ADR 0030):
 *   id        — internal relational PK
 *   public_id — durable UUID for external references
 */

import {
  DataTypes,
  Model,
  type InferAttributes,
  type InferCreationAttributes,
  type CreationOptional,
  type Sequelize,
} from 'sequelize';
import { randomUUID } from 'crypto';

/**
 * Directed lineage edge types. All edges flow UPSTREAM → DOWNSTREAM:
 *
 * DERIVED_FROM      source → construct  "This construct was derived from this source"
 * SYNTHESIZED_FROM  construct → construct  "This construct was synthesized from these upstream constructs"
 * SUPPORTS          construct → construct  "This construct provides supporting evidence for that construct"
 * ADDRESSES         construct → construct  "This construct addresses the question/barrier"
 * TESTED_BY         construct → construct  "This construct was tested by"
 * CONTRADICTS       construct → construct  "These constructs present conflicting evidence"
 * REFINES           construct → construct  "This construct refines/specializes the upstream"
 * IMPLEMENTED_BY    construct → construct  "This recommendation is implemented by this ticket"
 * VALIDATES         construct → construct  "This construct validates the upstream"
 */
export type RelationshipType =
  | 'DERIVED_FROM'
  | 'SYNTHESIZED_FROM'
  | 'SUPPORTS'
  | 'ADDRESSES'
  | 'TESTED_BY'
  | 'CONTRADICTS'
  | 'REFINES'
  | 'IMPLEMENTED_BY'
  | 'VALIDATES';

export interface RelationshipProvenance {
  method?: string;
  decision_basis?: string;
  created_by_template?: string;
  [key: string]: unknown;
}

class EvidenceRelationship extends Model<
  InferAttributes<EvidenceRelationship>,
  InferCreationAttributes<EvidenceRelationship>
> {
  declare id: CreationOptional<number>;
  declare public_id: CreationOptional<string>;
  declare from_source_id: number | null;
  declare from_construct_id: number | null;
  declare to_source_id: number | null;
  declare to_construct_id: number | null;
  declare relationship_type: RelationshipType;
  declare provenance: RelationshipProvenance | null;
  declare created_at: CreationOptional<Date>;
}

export default (sequelize: Sequelize) => {
  EvidenceRelationship.init(
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      public_id: {
        type: DataTypes.UUID,
        allowNull: false,
        unique: true,
        defaultValue: () => randomUUID(),
      },
      from_source_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      from_construct_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      to_source_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      to_construct_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      relationship_type: {
        type: DataTypes.STRING(50),
        allowNull: false,
        validate: {
          isIn: [[
            'DERIVED_FROM', 'SYNTHESIZED_FROM', 'SUPPORTS', 'ADDRESSES',
            'TESTED_BY', 'CONTRADICTS', 'REFINES', 'IMPLEMENTED_BY', 'VALIDATES',
          ]],
        },
      },
      provenance: {
        type: DataTypes.JSONB,
        allowNull: true,
      },
      created_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: sequelize.literal('CURRENT_TIMESTAMP'),
      },
    },
    {
      tableName: 'evidence_relationships',
      underscored: true,
      timestamps: false,
      sequelize,
    },
  );

  return EvidenceRelationship;
};

export type { EvidenceRelationship };
