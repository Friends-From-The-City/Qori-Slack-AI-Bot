/**
 * Slack WebClient mock for testing modal callback flows.
 *
 * Captures calls to views.open(), views.update(), views.push(), and chat.postMessage()
 * for assertion in tests. Also mocks users.info() for user resolution.
 *
 * Usage:
 *   const mock = createSlackClientMock();
 *   await handler({ client: mock.client, ... });
 *   expect(mock.viewsOpened).toHaveLength(1);
 *   expect(mock.viewsOpened[0].view.callback_id).toBe('my_modal');
 */

export interface ViewsOpenCall {
  trigger_id: string;
  view: Record<string, unknown>;
}

export interface ViewsUpdateCall {
  view_id: string;
  view: Record<string, unknown>;
  hash?: string;
}

export interface ViewsPushCall {
  trigger_id: string;
  view: Record<string, unknown>;
}

export interface ChatPostMessageCall {
  channel: string;
  text?: string;
  blocks?: unknown[];
  thread_ts?: string;
}

export interface UsersInfoCall {
  user: string;
}

export interface SlackClientMock {
  client: MockedWebClient;
  viewsOpened: ViewsOpenCall[];
  viewsUpdated: ViewsUpdateCall[];
  viewsPushed: ViewsPushCall[];
  messagesPosted: ChatPostMessageCall[];
  usersQueried: UsersInfoCall[];
  reset: () => void;
}

export interface MockedWebClient {
  views: {
    open: (params: ViewsOpenCall) => Promise<{ ok: true; view: { id: string } }>;
    update: (params: ViewsUpdateCall) => Promise<{ ok: true; view: { id: string } }>;
    push: (params: ViewsPushCall) => Promise<{ ok: true; view: { id: string } }>;
  };
  chat: {
    postMessage: (params: ChatPostMessageCall) => Promise<{ ok: true; ts: string; channel: string }>;
  };
  users: {
    info: (params: UsersInfoCall) => Promise<{
      ok: true;
      user: {
        id: string;
        real_name: string;
        profile: {
          display_name: string;
          email: string;
        };
      };
    }>;
  };
  conversations: {
    create: (params: { name: string; is_private?: boolean }) => Promise<{
      ok: true;
      channel: { id: string; name: string };
    }>;
    invite: (params: { channel: string; users: string }) => Promise<{ ok: true }>;
  };
}

/**
 * User profiles for mocking users.info() responses.
 * Add entries here to customize user resolution in tests.
 */
const DEFAULT_USER_PROFILES: Record<string, { real_name: string; display_name: string; email: string }> = {
  U_TEST_USER: { real_name: 'Test User', display_name: 'testuser', email: 'test@example.com' },
  U_RESEARCHER: { real_name: 'Jane Researcher', display_name: 'janer', email: 'jane@example.com' },
  U_STAKEHOLDER: { real_name: 'Bob Stakeholder', display_name: 'bobs', email: 'bob@example.com' },
};

/**
 * Create a fresh Slack client mock. Call reset() between tests to clear captured calls.
 */
export function createSlackClientMock(
  userProfiles: Record<string, { real_name: string; display_name: string; email: string }> = DEFAULT_USER_PROFILES,
): SlackClientMock {
  const viewsOpened: ViewsOpenCall[] = [];
  const viewsUpdated: ViewsUpdateCall[] = [];
  const viewsPushed: ViewsPushCall[] = [];
  const messagesPosted: ChatPostMessageCall[] = [];
  const usersQueried: UsersInfoCall[] = [];

  let viewIdCounter = 1;
  let messageIdCounter = 1;
  let channelIdCounter = 1;

  const client: MockedWebClient = {
    views: {
      open: async (params: ViewsOpenCall) => {
        viewsOpened.push(params);
        return { ok: true as const, view: { id: `V_MOCK_${viewIdCounter++}` } };
      },
      update: async (params: ViewsUpdateCall) => {
        viewsUpdated.push(params);
        return { ok: true as const, view: { id: params.view_id } };
      },
      push: async (params: ViewsPushCall) => {
        viewsPushed.push(params);
        return { ok: true as const, view: { id: `V_MOCK_${viewIdCounter++}` } };
      },
    },
    chat: {
      postMessage: async (params: ChatPostMessageCall) => {
        messagesPosted.push(params);
        return {
          ok: true as const,
          ts: `${Date.now()}.${messageIdCounter++}`,
          channel: params.channel,
        };
      },
    },
    users: {
      info: async (params: UsersInfoCall) => {
        usersQueried.push(params);
        const profile = userProfiles[params.user] || {
          real_name: `User ${params.user}`,
          display_name: params.user.toLowerCase(),
          email: `${params.user.toLowerCase()}@example.com`,
        };
        return {
          ok: true as const,
          user: {
            id: params.user,
            real_name: profile.real_name,
            profile: {
              display_name: profile.display_name,
              email: profile.email,
            },
          },
        };
      },
    },
    conversations: {
      create: async (params: { name: string; is_private?: boolean }) => {
        return {
          ok: true as const,
          channel: { id: `C_MOCK_${channelIdCounter++}`, name: params.name },
        };
      },
      invite: async () => {
        return { ok: true as const };
      },
    },
  };

  return {
    client,
    viewsOpened,
    viewsUpdated,
    viewsPushed,
    messagesPosted,
    usersQueried,
    reset: () => {
      viewsOpened.length = 0;
      viewsUpdated.length = 0;
      viewsPushed.length = 0;
      messagesPosted.length = 0;
      usersQueried.length = 0;
      viewIdCounter = 1;
      messageIdCounter = 1;
      channelIdCounter = 1;
    },
  };
}

/**
 * Assert that a specific modal was opened.
 */
export function expectModalOpened(
  mock: SlackClientMock,
  callbackId: string,
): ViewsOpenCall {
  const found = mock.viewsOpened.find(
    (call) => (call.view as { callback_id?: string }).callback_id === callbackId,
  );
  if (!found) {
    const opened = mock.viewsOpened.map((c) => (c.view as { callback_id?: string }).callback_id);
    throw new Error(
      `Expected modal with callback_id "${callbackId}" to be opened. Opened: [${opened.join(', ')}]`,
    );
  }
  return found;
}

/**
 * Assert that a specific view was updated.
 */
export function expectViewUpdated(
  mock: SlackClientMock,
  viewId: string,
): ViewsUpdateCall {
  const found = mock.viewsUpdated.find((call) => call.view_id === viewId);
  if (!found) {
    const updated = mock.viewsUpdated.map((c) => c.view_id);
    throw new Error(
      `Expected view "${viewId}" to be updated. Updated: [${updated.join(', ')}]`,
    );
  }
  return found;
}

/**
 * Assert that a message was posted to a specific channel.
 */
export function expectMessagePosted(
  mock: SlackClientMock,
  channel: string,
): ChatPostMessageCall {
  const found = mock.messagesPosted.find((call) => call.channel === channel);
  if (!found) {
    const channels = mock.messagesPosted.map((c) => c.channel);
    throw new Error(
      `Expected message posted to "${channel}". Posted to: [${channels.join(', ')}]`,
    );
  }
  return found;
}
