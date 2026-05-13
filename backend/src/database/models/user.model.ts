// models/user.ts
//
// NOTE: This model includes auth boilerplate (password, tokens, email) from
// the original express-starter template. Qori uses Slack OAuth, not password
// auth. The boilerplate is preserved but not actively used.

import {
  DataTypes,
  Model,
  type InferAttributes,
  type InferCreationAttributes,
  type CreationOptional,
  type NonAttribute,
  type Sequelize,
} from 'sequelize';

const { compare, hash } = require('bcrypt');
const { tokenHelper, mailHelper } = require('../../helpers');

class User extends Model<
  InferAttributes<User, { omit: 'fullName' }>,
  InferCreationAttributes<User, { omit: 'fullName' }>
> {
  // — Attributes —
  declare id: CreationOptional<number>;
  declare first_name: string;
  declare last_name: string | null;
  declare email: string | null;
  declare phone: string | null;
  declare avatar: string | null;
  declare is_admin: CreationOptional<boolean>;
  declare created_at: CreationOptional<Date>;
  declare updated_at: CreationOptional<Date>;

  // — Virtual fields —
  get fullName(): NonAttribute<string> {
    return `${this.first_name} ${this.last_name}`;
  }

  // — Instance methods (legacy auth boilerplate) —
  generateToken(expiresIn: string = '1h') {
    const data = { id: this.id, email: this.email };
    return tokenHelper.generateToken(data, expiresIn);
  }

  validatePassword(plainPassword: string): Promise<boolean> {
    return compare(plainPassword, (this as any).password);
  }

  sendMail(mail: { subject: string; html: string }) {
    const payload = { ...mail, to: `${this.fullName} <${this.email}>` };
    return mailHelper.sendMail(payload);
  }

  // — Associations —
  static associate(_models: Record<string, any>) {
    // No associations
  }
}

module.exports = (sequelize: Sequelize) => {
  User.init(
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      first_name: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      last_name: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      email: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      phone: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      avatar: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      is_admin: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      created_at: {
        type: DataTypes.DATE,
        defaultValue: sequelize.literal('CURRENT_TIMESTAMP'),
      },
      updated_at: {
        type: DataTypes.DATE,
        defaultValue: sequelize.literal('CURRENT_TIMESTAMP'),
        onUpdate: sequelize.literal('CURRENT_TIMESTAMP') as unknown as string,
      },
    },
    {
      tableName: 'users',
      underscored: true,
      timestamps: false,
      sequelize,
    },
  );

  // Legacy auth hooks — password field exists in DB but not in init()
  User.addHook('beforeSave', async (instance: any) => {
    if (instance.changed('password')) {
      instance.password = await hash(instance.password, 10);
    }
  });

  User.addHook('afterCreate', (instance: User) => {
    const payload = {
      subject: 'Welcome to Express Starter',
      html: 'Your account is created successfully!',
    };
    instance.sendMail(payload);
  });

  User.addHook('afterDestroy', (instance: User) => {
    const payload = {
      subject: 'Sorry to see you go',
      html: 'Your account is destroyed successfully!',
    };
    instance.sendMail(payload);
  });

  return User;
};

export type { User };
