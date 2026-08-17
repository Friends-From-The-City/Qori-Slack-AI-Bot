/**
 * DataSubject Model
 *
 * GOV-2: Canonical subject registry for DSAR operations.
 *
 * A data_subject is a stable anchor representing a research participant or
 * survey respondent for privacy/DSAR purposes. It contains NO PII — only a
 * UUID public_id and project scope. Subject links (data_subject_links) connect
 * subjects to participant records and survey respondent keys.
 *
 * After DSAR deletion, the row survives as a tombstone (status='deleted',
 * deleted_at set) so the audit trail can reference the public_id without
 * retaining any personal information.
 *
 * The tombstone cascades if the parent project is deleted via ON DELETE CASCADE.
 * This is acceptable because disposition_audit_log is the durable proof of any
 * completed DSAR — it uses SET NULL FKs and denormalized fields that survive
 * project deletion.
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
import { randomUUID } from 'crypto';

export type DataSubjectStatus = 'active' | 'deleted';

class DataSubject extends Model<
  InferAttributes<DataSubject>,
  InferCreationAttributes<DataSubject>
> {
  declare id: CreationOptional<number>;
  declare public_id: CreationOptional<string>;
  declare project_id: ForeignKey<number>;
  declare status: CreationOptional<DataSubjectStatus>;
  declare created_by: string;
  declare created_at: CreationOptional<Date>;
  declare deleted_at: Date | null;

  static associate(models: Record<string, any>) {
    this.belongsTo(models.Project, {
      foreignKey: 'project_id',
      as: 'project',
      onDelete: 'CASCADE',
    });
    this.hasMany(models.DataSubjectLink, {
      foreignKey: 'data_subject_id',
      as: 'links',
      onDelete: 'CASCADE',
    });
  }
}

export default (sequelize: Sequelize) => {
  DataSubject.init(
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      public_id: {
        type: DataTypes.UUID,
        allowNull: false,
        unique: true,
        defaultValue: () => randomUUID(),
      },
      project_id: { type: DataTypes.INTEGER, allowNull: false },
      status: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: 'active',
        validate: { isIn: [['active', 'deleted']] },
      },
      created_by: { type: DataTypes.TEXT, allowNull: false },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      deleted_at: { type: DataTypes.DATE, allowNull: true },
    },
    {
      sequelize,
      modelName: 'DataSubject',
      tableName: 'data_subjects',
      timestamps: false,
    },
  );

  return DataSubject;
};

export type { DataSubject };
