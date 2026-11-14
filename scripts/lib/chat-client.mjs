// The site's own chat window talks to a Chatwoot API inbox through Chatwoot's public client API (made for custom chat
// interfaces; CORS open on /public/api/*): a contact and a conversation are created with the visitor's first message,
// messages are listed while the window is open. The session (contact source id, conversation id) is kept in the
// visitor's browser, so the conversation continues across pages and visits.

// Messages a visitor sees: theirs (incoming to the inbox) and the team's replies; activity and templates are left out.
/** @typedef {{ id: number, text: string, mine: boolean }} ChatMessage */
/** @param {any} list @returns {ChatMessage[]} */
export function visibleMessages(list) {
  return (Array.isArray(list) ? list : list?.payload ?? [])
    .filter((message) => (message.message_type === 0 || message.message_type === 1) && message.content)
    .map((message) => ({ id: message.id, text: message.content, mine: message.message_type === 0 }));
}

/**
 * @param {{ baseUrl: string, inboxIdentifier: string, fetchImpl?: typeof fetch, storage?: { getItem(key: string): string | null, setItem(key: string, value: string): void } | null }} options
 */
export function chatClient({ baseUrl, inboxIdentifier, fetchImpl = fetch, storage = null }) {
  const root = `${baseUrl.replace(/\/$/, '')}/public/api/v1/inboxes/${encodeURIComponent(inboxIdentifier)}`;
  const key = `chat-session:${inboxIdentifier}`;
  const load = () => { try { return JSON.parse(storage?.getItem(key) ?? 'null'); } catch { return null; } };
  const save = (value) => { try { storage?.setItem(key, JSON.stringify(value)); } catch { /* storage blocked: session lasts for this page */ } };
  let session = load();
  const call = async (path, init = {}) => {
    const response = await fetchImpl(`${root}${path}`, { ...init, headers: { 'content-type': 'application/json' } });
    if (!response.ok) throw Object.assign(new Error(`chat ${init.method ?? 'GET'} ${path}: HTTP ${response.status}`), { status: response.status });
    return response.json();
  };
  const post = (path, body) => call(path, { method: 'POST', body: JSON.stringify(body) });
  const messagesPath = () => `/contacts/${encodeURIComponent(session.sourceId)}/conversations/${session.conversationId}/messages`;

  async function start(attributes) {
    if (!session?.sourceId) {
      const contact = await post('/contacts', { custom_attributes: attributes });
      session = { sourceId: contact.source_id };
      save(session);
    }
    if (!session.conversationId) {
      const conversation = await post(`/contacts/${encodeURIComponent(session.sourceId)}/conversations`, { custom_attributes: attributes });
      session = { ...session, conversationId: conversation.id };
      save(session);
    }
  }

  return {
    get started() { return Boolean(session?.conversationId); },
    get email() { return session?.email ?? null; },
    // Sends one message, starting the conversation first when there is none (a session the server no longer knows
    // is started again once).
    async send(content, attributes = {}) {
      try {
        await start(attributes);
        return await post(messagesPath(), { content });
      } catch (error) {
        if (error.status !== 404 || !session) throw error;
        session = null;
        await start(attributes);
        return post(messagesPath(), { content });
      }
    },
    /** @returns {Promise<ChatMessage[]>} */
    async messages() {
      return session?.conversationId ? visibleMessages(await call(messagesPath())) : [];
    },
    async setEmail(email) {
      await call(`/contacts/${encodeURIComponent(session.sourceId)}`, { method: 'PATCH', body: JSON.stringify({ email }) });
      session = { ...session, email };
      save(session);
    },
  };
}
