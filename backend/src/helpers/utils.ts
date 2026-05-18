import slackApiClient from './slackApiClient';

interface SlackTeam {
  id: string;
  name: string;
  [key: string]: unknown;
}

interface SlackMember {
  id: string;
  is_bot: boolean;
  name: string;
  real_name?: string;
  [key: string]: unknown;
}

export async function getTeamInfo(): Promise<SlackTeam> {
  try {
    const workspace = await slackApiClient.get('team.info');
    return workspace.data.team;
  } catch (err: unknown) {
    console.error('Error fetching team info:', err);
    throw new Error('Failed to fetch team info');
  }
}

export async function getAllMembers(): Promise<SlackMember[]> {
  try {
    const workspace = await slackApiClient.get('users.list');
    return workspace.data.members.filter(
      (member: SlackMember) => !member.is_bot && member.id !== 'USLACKBOT',
    );
  } catch (err: unknown) {
    console.error('Error fetching all members:', err);
    throw new Error('Failed to fetch all members');
  }
}
