import crypto from 'node:crypto';

import { clearCookie, parseCookies, serializeCookie } from './cookies.js';

function createAuthError(statusCode, code, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

function getProtocol(req) {
  const forwarded = String(req.headers['x-forwarded-proto'] || '').trim();
  if (forwarded) return forwarded.split(',')[0].trim();

  const cfVisitor = String(req.headers['cf-visitor'] || '').trim();
  if (cfVisitor.includes('"https"')) return 'https';

  return req.socket.encrypted ? 'https' : 'http';
}

function shouldUseSecureCookies(req) {
  return getProtocol(req) === 'https';
}

function timingSafeMatch(left, right) {
  const a = Buffer.from(String(left || ''));
  const b = Buffer.from(String(right || ''));
  if (a.length === 0 || a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export function createAuth({ config, sessionStore, pairingCode }) {
  const rawPairingCode = String(pairingCode || '').trim();
  if (rawPairingCode.length < 16) {
    throw new Error('TRANSLATOR_PAIRING_CODE is missing or too short. Start the gateway through start_translator.bat.');
  }

  const pairing = {
    hash: crypto.createHash('sha256').update(rawPairingCode).digest('hex'),
    expiresAt: Date.now() + config.pairingCodeTtlMs,
    used: false,
  };

  function claimPairingCode(code, metadata) {
    const trimmed = String(code || '').trim();
    if (!trimmed) {
      throw createAuthError(400, 'missing_pairing_code', 'Pairing code is required.');
    }

    if (pairing.used) {
      throw createAuthError(401, 'pairing_code_already_used', 'Pairing code has already been used.');
    }

    if (Date.now() > pairing.expiresAt) {
      throw createAuthError(401, 'pairing_code_expired', 'Pairing code has expired. Start the translator again to get a fresh code.');
    }

    const providedHash = crypto.createHash('sha256').update(trimmed).digest('hex');
    if (!timingSafeMatch(providedHash, pairing.hash)) {
      throw createAuthError(401, 'invalid_pairing_code', 'Pairing code is invalid.');
    }

    pairing.used = true;
    return sessionStore.createSession(metadata);
  }

  function getSession(req) {
    const cookies = parseCookies(req.headers.cookie);
    const sessionId = cookies.qct_session;
    if (!sessionId) return null;
    return sessionStore.getSession(sessionId);
  }

  function validateCsrf(req, session) {
    const token = String(req.headers['x-csrf-token'] || '').trim();
    return timingSafeMatch(token, session.csrfToken);
  }

  function issueSessionCookies(req, session) {
    const secure = shouldUseSecureCookies(req);

    return [
      serializeCookie('qct_session', session.id, {
        httpOnly: true,
        sameSite: 'Lax',
        secure,
        path: '/',
        maxAge: Math.floor(config.sessionTtlMs / 1000),
      }),
      serializeCookie('qct_csrf', session.csrfToken, {
        httpOnly: false,
        sameSite: 'Lax',
        secure,
        path: '/',
        maxAge: Math.floor(config.sessionTtlMs / 1000),
      }),
    ];
  }

  function clearSessionCookies(req) {
    const secure = shouldUseSecureCookies(req);
    return [
      clearCookie('qct_session', { path: '/', httpOnly: true, sameSite: 'Lax', secure }),
      clearCookie('qct_csrf', { path: '/', sameSite: 'Lax', secure }),
    ];
  }

  function destroySession(req) {
    const cookies = parseCookies(req.headers.cookie);
    if (cookies.qct_session) {
      sessionStore.destroySession(cookies.qct_session);
    }
  }

  return {
    claimPairingCode,
    getSession,
    validateCsrf,
    issueSessionCookies,
    clearSessionCookies,
    destroySession,
    revokeAllSessions: () => sessionStore.destroyAllSessions(),
    getPairingStatus: () => ({ used: pairing.used, expiresAt: pairing.expiresAt }),
  };
}
