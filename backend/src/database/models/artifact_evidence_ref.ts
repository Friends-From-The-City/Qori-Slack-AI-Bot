/**
 * ArtifactEvidenceRef Model — PH-6A
 *
 * Join table linking research artifacts to canonical evidence constructs.
 * Answers: "Which canonical evidence does this artifact reflect?"
 *
 * Unique constraint on (artifact_id, construct_id, ref_type) prevents
 * duplicate lineage rows on re-attachment.
 */

import {
  DataTypes,
  Model,
  type InferAttributes,
  type InferCreationAttributes,
  type CreationOptional,
  type Sequelize,
} from 'sequelize';

class ArtifactEvidenceRef extends Model<
  InferAttributes<ArtifactEvidenceRef>,
  InferCreationAttributes<ArtifactEvidenceRef>
> {
  declare id: CreationOptional<number>;
  declare artifact_id: number;
  declare construct_id: number;
  declare ref_type: CreationOptional<string>;
  declare created_at: CreationOptional<Date>;
}

export default (sequelize: Sequelize) => {
  ArtifactEvidenceRef.init(
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      artifact_id: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'research_artifacts', key: 'id' } },
      construct_id: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'evidence_constructs', key: 'id' } },
      ref_type: { type: DataTypes.STRING(30), allowNull: false, defaultValue: 'reflects' },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: sequelize.literal('CURRENT_TIMESTAMP') },
    },
    { tableName: 'artifact_evidence_refs', underscored: true, timestamps: false, sequelize },
  );
  return ArtifactEvidenceRef;
};

export type { ArtifactEvidenceRef };
