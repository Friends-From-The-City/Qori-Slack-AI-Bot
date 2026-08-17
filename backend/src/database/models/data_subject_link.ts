/**
 * DataSubjectLink Model
 *
 * GOV-2: Scoped links connecting a data_subject to participant records and
 * survey respondent keys. Supports two structurally exclusive link shapes:
 *
 * participant:
 *   participant_id NOT NULL, study_id NOT NULL
 *   evidence_source_id NULL, respondent_key NULL
 *
 * survey_respondent:
 *   evidence_source_id NOT NULL, respondent_key NOT NULL
 *   participant_id NULL
 *
 * CHECK constraints at the DB level enforce exclusivity — a link row cannot
 * mix participant and respondent fields.
 *
 * UNIQUE constraints ensure:
 * - One participant is linked to at most one subject
 * - One (source, respondent_key) is linked to at most one subject
 *
 * All FKs use ON DELETE CASCADE — when a participant, study, or evidence
 * source is deleted, associated links are automatically removed.
 */

import {
  DataTypes,
  Model,
  type InferAttributes,
  type InferCreationAttributes,
  type CreationOptional,
  type ForeignKey,
  type Sequelize,
} from 'sequelize';

export type SubjectLinkType = 'participant' | 'survey_respondent';
export type LinkConfidence = 'confirmed' | 'inferred';

class DataSubjectLink extends Model<
  InferAttributes<DataSubjectLink>,
  InferCreationAttributes<DataSubjectLink>
> {
  declare id: CreationOptional<number>;
  declare data_subject_id: ForeignKey<number>;
  declare link_type: SubjectLinkType;
  declare study_id: ForeignKey<number> | null;
  declare participant_id: ForeignKey<number> | null;
  declare evidence_source_id: ForeignKey<number> | null;
  declare respondent_key: string | null;
  declare confidence: CreationOptional<LinkConfidence>;
  declare linked_by: string;
  declare linked_at: CreationOptional<Date>;

  static associate(models: Record<string, any>) {
    this.belongsTo(models.DataSubject, {
      foreignKey: 'data_subject_id',
      as: 'dataSubject',
      onDelete: 'CASCADE',
    });
    this.belongsTo(models.ResearchStudy, {
      foreignKey: 'study_id',
      as: 'study',
      onDelete: 'CASCADE',
    });
    this.belongsTo(models.StudyParticipant, {
      foreignKey: 'participant_id',
      as: 'participant',
      onDelete: 'CASCADE',
    });
    this.belongsTo(models.EvidenceSource, {
      foreignKey: 'evidence_source_id',
      as: 'evidenceSource',
      onDelete: 'CASCADE',
    });
  }
}

export default (sequelize: Sequelize) => {
  DataSubjectLink.init(
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      data_subject_id: { type: DataTypes.INTEGER, allowNull: false },
      link_type: {
        type: DataTypes.STRING(30),
        allowNull: false,
        validate: { isIn: [['participant', 'survey_respondent']] },
      },
      study_id: { type: DataTypes.INTEGER, allowNull: true },
      participant_id: { type: DataTypes.INTEGER, allowNull: true },
      evidence_source_id: { type: DataTypes.INTEGER, allowNull: true },
      respondent_key: { type: DataTypes.TEXT, allowNull: true },
      confidence: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: 'confirmed',
        validate: { isIn: [['confirmed', 'inferred']] },
      },
      linked_by: { type: DataTypes.TEXT, allowNull: false },
      linked_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    },
    {
      sequelize,
      modelName: 'DataSubjectLink',
      tableName: 'data_subject_links',
      timestamps: false,
    },
  );

  return DataSubjectLink;
};

export type { DataSubjectLink };
