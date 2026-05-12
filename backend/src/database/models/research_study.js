// models/research_study.js

const { DataTypes, Model } = require("sequelize");

module.exports = (sequelize) => {
  class ResearchStudy extends Model {
    static associate(models) {
      // one-to-many → many user‐roles per study
      this.hasMany(models.ResearchStudyUserRole, {
        foreignKey: "research_id",
        as: "userRoles",
        onDelete: "CASCADE",
      });

      // one-to-many → many participants per study
      this.hasMany(models.StudyParticipant, {
        foreignKey: "study_id",
        as: "participants",
        onDelete: "CASCADE",
      });

      // one-to-many → many study notes per study
      this.hasMany(models.StudyNotes, {
        foreignKey: "study_id",
        as: "studyNotes",
        onDelete: "CASCADE",
      });

      // one-to-many → many briefs per study
      this.hasMany(models.ResearchPlan, {
        foreignKey: "study_id",
        as: "plans",
        onDelete: "CASCADE",
      });

      // one-to-many → many session summaries per study
      this.hasMany(models.SessionSummary, {
        foreignKey: "study_id",
        as: "sessionSummaries",
        onDelete: "CASCADE",
      });
    }
  }

  ResearchStudy.init(
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      name: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      channel_name: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      description: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      link: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      path: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      sha4: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      created_by: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      researcher_name: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      researcher_email: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      total_participants: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      parsed_budget_amount: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
      },
      target_participants: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      created_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: sequelize.literal("CURRENT_TIMESTAMP"),
      },
      updated_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: sequelize.literal("CURRENT_TIMESTAMP"),
      },
    },
    {
      tableName: "research_studies",
      underscored: true,
      timestamps: false, // we're managing created_at/updated_at manually
      sequelize,
    }
  );

  return ResearchStudy;
};
