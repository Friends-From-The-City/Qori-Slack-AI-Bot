// models/study_participant.js

const { DataTypes, Model } = require("sequelize");
const { PARTICIPANT_STATUS, PARTICIPANT_STATUS_VALUES } = require("../../constants/participantStatus");

module.exports = (sequelize) => {
  class StudyParticipant extends Model {
    static associate(models) {
      // many-to-one → one study has many participants
      this.belongsTo(models.ResearchStudy, {
        foreignKey: "study_id",
        as: "study",
        onDelete: "CASCADE",
      });
    }
  }

  StudyParticipant.init(
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      study_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: 'research_studies',
          key: 'id',
        },
      },
      participant_name: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      contact_details: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      recruitment_source: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      scheduled_date: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      scheduled_time: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      status_select: {
        type: DataTypes.STRING,
        allowNull: true,
        defaultValue: PARTICIPANT_STATUS.CONTACTED,
        validate: {
          isIn: [PARTICIPANT_STATUS_VALUES],
        },
      },
      notes_field: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      demographics_info: {
        type: DataTypes.JSON,
        allowNull: true,
      },
      added_by: {
        type: DataTypes.STRING,
        allowNull: false,
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
      tableName: "study_participants",
      underscored: true,
      timestamps: false, // we're managing created_at/updated_at manually
      sequelize,
    }
  );

  return StudyParticipant;
}; 
