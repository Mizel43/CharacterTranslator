import { cleanModelOutput } from './prompt.js';

function createFetchWithTimeout(defaultTimeoutMs) {
  return async function fetchWithTimeout(url, options = {}, timeoutMs = defaultTimeoutMs) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      return await fetch(url, { ...options, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  };
}

export function createQwenClient(config) {
  const fetchWithTimeout = createFetchWithTimeout(config.requestTimeoutMs);

  return {
    async qwenHealth() {
      try {
        const response = await fetchWithTimeout(`${config.qwenBaseUrl}/health`, {}, 5000);
        const data = await response.json().catch(() => ({}));
        return { ok: response.ok && data.ok !== false, status: response.status, data };
      } catch (error) {
        return { ok: false, error: error.name === 'AbortError' ? 'timeout' : error.message };
      }
    },

    async listModels() {
      const response = await fetchWithTimeout(`${config.qwenBaseUrl}/models`, {}, 15000);
      if (!response.ok) throw new Error(`Qwen models endpoint returned HTTP ${response.status}.`);

      const payload = await response.json();
      const rawModels = Array.isArray(payload?.data) ? payload.data : Array.isArray(payload) ? payload : [];
      const ids = rawModels
        .map((item) => (typeof item === 'string' ? item : item?.id))
        .filter((id) => typeof id === 'string' && /^qwen/i.test(id));

      return [...new Set(ids)];
    },

    async callChatCompletion(payload) {
      const response = await fetchWithTimeout(`${config.qwenBaseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer dummy-key',
        },
        body: JSON.stringify(payload),
      });

      const rawText = await response.text();
      let data;
      try {
        data = JSON.parse(rawText);
      } catch {
        data = { raw: rawText };
      }

      if (!response.ok) {
        const upstreamMessage = data?.error?.message || data?.message || `HTTP ${response.status}`;
        throw new Error(`Qwen is unavailable: ${upstreamMessage}`);
      }

      return {
        text: cleanModelOutput(data?.choices?.[0]?.message?.content),
        usage: data?.usage || null,
      };
    },
  };
}
