/**
 * ResearchArtifact Model — PH-6A
 *
 * Canonical identity for rendered research artifacts. Identity is stable
 * and independent of GitHub path/location.
 *
 * public_id = stable canonical identity
 * repo/ref/path/url/commit_sha = mutable rendered location (never cleared on retry)
 * semantic_key = derivation identity (logical_key + derivation_fingerprint)
 *
 * Per ADR 0038: artifact identity is persisted and stable. GitHub location
 * is mutable projection metadata. Rendered artifacts are not canonical evidence.
 */

import {
  DataTypes,
  Model,
  type InferAttributes,
  type InferCreationAttributes,
  type CreationOptional,
  type Sequelize,
} from 'sequelize';

export type ArtifactStatus = 'pending' | 'written' | 'failed';

/** Projection/publication status — distinct from workflow status (PLAT-3, ADR 0044) */
export type PublicationStatus = 'not_published' | 'publishing' | 'published' | 'projection_failed';

export type ArtifactType =
  | 'discovery'
  | 'brief'
  | 'plan'
  | 'fieldwork'
  | 'synthesis'
  | 'readout'
  | 'tickets';

class ResearchArtifact extends Model<
  InferAttributes<ResearchArtifact>,
  InferCreationAttributes<ResearchArtifact>
> {
  declare id: CreationOptional<number>;
  declare public_id: CreationOptional<string>;
  declare project_id: number;
  declare study_id: number | null;
  declare template_id: string;
  declare template_version: string;
  declare artifact_type: ArtifactType;
  declare title: string | null;
  declare repo: string;
  declare ref: CreationOptional<string>;
  declare path: string | null;
  declare commit_sha: string | null;
  declare url: string | null;
  declare status: CreationOptional<ArtifactStatus>;
  declare publication_status: CreationOptional<PublicationStatus>;
  declare last_write_error: string | null;
  declare last_write_attempted_at: Date | null;
  declare semantic_key: string;
  declare created_by: string;
  declare created_at: CreationOptional<Date>;
  declare updated_at: CreationOptional<Date>;

  static associate(models: Record<string, any>) {
    this.belongsTo(models.Project, {
      foreignKey: 'project_id', as: 'project', onDelete: 'CASCADE',
    });
    this.belongsTo(models.ResearchStudy, {
      foreignKey: 'study_id', as: 'study', onDelete: 'CASCADE',
    });
  }
}

export default (sequelize: Sequelize) => {
  ResearchArtifact.init(
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      public_id: { type: DataTypes.UUID, allowNull: false, defaultValue: DataTypes.UUIDV4, unique: true },
      project_id: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'projects', key: 'id' } },
      study_id: { type: DataTypes.INTEGER, allowNull: true, references: { model: 'research_studies', key: 'id' } },
      template_id: { type: DataTypes.STRING(100), allowNull: false },
      template_version: { type: DataTypes.STRING(20), allowNull: false },
      artifact_type: { type: DataTypes.STRING(50), allowNull: false },
      title: { type: DataTypes.STRING, allowNull: true },
      repo: { type: DataTypes.STRING(200), allowNull: false },
      ref: { type: DataTypes.STRING(100), allowNull: false, defaultValue: 'main' },
      path: { type: DataTypes.STRING, allowNull: true },
      commit_sha: { type: DataTypes.STRING(64), allowNull: true },
      url: { type: DataTypes.STRING, allowNull: true },
      status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'pending' },
      publication_status: { type: DataTypes.STRING(30), allowNull: false, defaultValue: 'not_published' },
      last_write_error: { type: DataTypes.STRING, allowNull: true },
      last_write_attempted_at: { type: DataTypes.DATE, allowNull: true },
      semantic_key: { type: DataTypes.STRING(300), allowNull: false, unique: true },
      created_by: { type: DataTypes.STRING(100), allowNull: false },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: sequelize.literal('CURRENT_TIMESTAMP') },
      updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: sequelize.literal('CURRENT_TIMESTAMP') },
    },
    { tableName: 'research_artifacts', underscored: true, timestamps: false, sequelize },
  );
  return ResearchArtifact;
};

export type { ResearchArtifact };
