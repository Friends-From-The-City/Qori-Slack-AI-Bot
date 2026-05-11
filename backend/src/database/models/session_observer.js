// models/session_observer.js

const { DataTypes, Model } = require("sequelize");

module.exports = (sequelize) => {
  class SessionObserver extends Model {
    static associate(models) {
      // many-to-one → one study has many observers
      this.belongsTo(models.ResearchStudy, {
        foreignKey: "study_id",
        as: "study",
        onDelete: "CASCADE",
      });

      // many-to-one → one participant can have many observers
      this.belongsTo(models.StudyParticipant, {
        foreignKey: "participant_id",
        as: "participant",
        onDelete: "CASCADE",
      });
    }
  }

  SessionObserver.init(
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
      participant_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: {
          model: 'study_participants',
          key: 'id',
        },
      },
      session_id: {
        type: DataTypes.STRING,
        allowNull: false,
        comment: 'Session identifier like pt001, pt002, etc.',
      },
      requester_id: {
        type: DataTypes.JSON,
        allowNull: false,
        defaultValue: [],
        comment: 'Array of Slack user IDs of people requesting to observe',
        get() {
          const value = this.getDataValue('requester_id');
          return Array.isArray(value) ? value : [];
        },
      },
      requester_name: {
        type: DataTypes.JSON,
        allowNull: true,
        defaultValue: [],
        comment: 'Array of display names of the requesters',
        get() {
          const value = this.getDataValue('requester_name');
          return Array.isArray(value) ? value : [];
        },
      },
      role: {
        type: DataTypes.ENUM('note_taker', 'silent_observer', 'pm_observer', 'stakeholder', 'observer'),
        allowNull: false,
        comment: 'Observer role type',
      },
      reason: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: 'Reason for wanting to observe',
      },
      status: {
        type: DataTypes.ENUM('pending', 'approved', 'denied', 'removed', 'confirmed'),
        allowNull: false,
        defaultValue: 'pending',
        comment: 'Current status of the observer request',
      },
      joined_via: {
        type: DataTypes.STRING(20),
        allowNull: true,
        comment: 'How observer was added: researcher_add, channel_cta, request',
      },
      approved_by: {
        type: DataTypes.STRING,
        allowNull: true,
        comment: 'Slack user ID of the person who approved/denied',
      },
      approved_at: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: 'When the request was approved/denied',
      },
      guidelines_sent: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment: 'Whether observer guidelines have been sent',
      },
      guidelines_sent_at: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: 'When guidelines were sent',
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
      tableName: "session_observers",
      underscored: true,
      timestamps: false, // we're managing created_at/updated_at manually
      sequelize,
    }
  );

  return SessionObserver;
}; 
