import type { ChannelConfig } from '../database/models/channel_config';
import type { InferCreationAttributes } from 'sequelize';

import sequelize from '../database';

// Typed model reference — cast once, use everywhere. See Phase 3 notes.
const ChannelConfigModel = sequelize.models.ChannelConfig as typeof ChannelConfig;

const addChannelConfig = async (data: Partial<InferCreationAttributes<ChannelConfig>>): Promise<ChannelConfig> => {
  const { channel_id } = data;
  if (!channel_id) throw new Error('channel_id is required');

  try {
    let record = await ChannelConfigModel.findOne({ where: { channel_id } });

    if (record) {
      await record.update(data);
      console.log('🔄 updated', record.id);
    } else {
      record = await ChannelConfigModel.create(data as InferCreationAttributes<ChannelConfig>);
      console.log('✨ created', record.id);
    }

    return record;
  } catch (err) {
    console.error('addOrUpdateChannelConfig:', err);
    throw new Error('Failed to add or update channel config');
  }
};

const getChannelConfigByChannelId = async (channelId: string): Promise<ChannelConfig | null> => {
  try {
    const channelConfig = await ChannelConfigModel.findOne({
      where: { channel_id: channelId }
    });
    console.log("🚀 ~ getChannelConfigByChannelId ~ channelConfig:", channelConfig);
    return channelConfig;
  } catch (error) {
    console.error("Error in getChannelConfigByChannelId:", error);
    throw new Error("Failed to fetch channel config");
  }
};


export {
  addChannelConfig,
  getChannelConfigByChannelId
};
