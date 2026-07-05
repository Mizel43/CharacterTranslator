import crypto from 'node:crypto';

function createSessionId() {
  return crypto.randomBytes(32).toString('base64url');
}

export function createSessionStore({ sessionTtlMs }) {
  const sessions = new Map();

  function pruneExpiredSessions() {
    const now = Date.now();
    for (const [id, session] of sessions.entries()) {
      if (session.expiresAt <= now) sessions.delete(id);
    }
  }

  return {
    createSession(metadata = {}) {
      pruneExpiredSessions();

      const session = {
        id: createSessionId(),
        csrfToken: createSessionId(),
        createdAt: Date.now(),
        expiresAt: Date.now() + sessionTtlMs,
        metadata,
      };

      sessions.set(session.id, session);
      return session;
    },

    getSession(sessionId) {
      pruneExpiredSessions();
      const session = sessions.get(String(sessionId || ''));
      if (!session) return null;
      if (session.expiresAt <= Date.now()) {
        sessions.delete(session.id);
        return null;
      }
      return session;
    },

    destroySession(sessionId) {
      sessions.delete(String(sessionId || ''));
    },

    destroyAllSessions() {
      sessions.clear();
    },
  };
}
