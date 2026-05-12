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

    /**
     * Record an outreach event. Auto-advances not_contacted → contacted.
     */
    async recordOutreachSent(method = 'email') {
      this.outreach_sent_at = new Date();
      this.outreach_method = method;
      this.outreach_count = (this.outreach_count || 0) + 1;
      this.updated_at = new Date();
      if (this.status_select === PARTICIPANT_STATUS.NOT_CONTACTED) {
        this.status_select = PARTICIPANT_STATUS.CONTACTED;
      }
      await this.save();
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
      outreach_sent_at: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      outreach_method: {
        type: DataTypes.STRING(20),
        allowNull: true,
        validate: {
          isIn: [['email', 'slack', 'phone', 'other']],
        },
      },
      outreach_count: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
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
