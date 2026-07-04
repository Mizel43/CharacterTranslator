import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

function listen(server) {
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server.address().port)));
}

function close(server) {
  return new Promise((resolve) => server.close(resolve));
}

test('mock Qwen response follows expected OpenAI shape', async () => {
  const server = http.createServer((req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ choices: [{ message: { content: 'you really think so?' } }] }));
  });
  const port = await listen(server);
  const response = await fetch(`http://127.0.0.1:${port}/api/chat/completions`, { method: 'POST' });
  const payload = await response.json();
  assert.equal(payload.choices[0].message.content, 'you really think so?');
  await close(server);
});
