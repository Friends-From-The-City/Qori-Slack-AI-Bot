import type { User } from '../database/models/user.model';
import type { CreationAttributes, WhereOptions } from 'sequelize';

import sequelize from '../database';

// Typed model reference — cast once, use everywhere. See Phase 3 notes.
const UserModel = sequelize.models.User as typeof User;

// NOTE: This function references platform_user_id and platform_workspace_id
// which do not exist on the User model. This is legacy boilerplate from the
// original express-starter template that never worked with the actual schema.
// The where clause will always fail to match, so it effectively always creates.
interface LegacyUserInput {
  platform_user_id?: string;
  platform_workspace_id?: string;
  [key: string]: unknown;
}

const addNewUser = async (user: LegacyUserInput): Promise<LegacyUserInput> => {
  try {
    // Legacy boilerplate — platform_user_id/platform_workspace_id don't exist
    // on the User model. Using WhereOptions cast because the columns are from
    // the original express-starter template that never matched the actual schema.
    const legacyWhere = {
      platform_user_id: user.platform_user_id,
      platform_workspace_id: user.platform_workspace_id,
    } as WhereOptions<User>;

    const existingUser = await UserModel.findOne({
      where: legacyWhere,
    });

    if (!existingUser) {
      await UserModel.create(user as CreationAttributes<User>);
    } else {
      await UserModel.update(user as Partial<CreationAttributes<User>>, {
        where: legacyWhere,
      });
    }

    return user;
  } catch (error) {
    console.error("Error in addNewUser: ", error);
    throw new Error("Failed to add or update user");
  }
};

export {
  addNewUser,
};
