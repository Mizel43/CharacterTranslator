import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildSecurityHeaders } from './security-headers.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UI_ROOT = path.resolve(__dirname, 'ui');

const MIME_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};

function contentTypeFor(filePath) {
  return MIME_TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
}

async function readSafeFile(filePath) {
  const resolved = path.resolve(filePath);
  if (!resolved.startsWith(UI_ROOT)) return null;

  try {
    const stat = await fs.stat(resolved);
    if (!stat.isFile()) return null;
    return await fs.readFile(resolved);
  } catch {
    return null;
  }
}

function send(res, status, filePath, body) {
  res.writeHead(status, {
    'Content-Type': contentTypeFor(filePath),
    'Content-Length': body.length,
    'Cache-Control': 'no-store',
    ...buildSecurityHeaders(),
  });
  res.end(body);
}

export function createStaticHandler() {
  return async function handleStatic(req, res) {
    const requestUrl = new URL(req.url, 'http://localhost');
    if (req.method !== 'GET' && req.method !== 'HEAD') return false;

    if (requestUrl.pathname === '/app') {
      res.writeHead(302, { Location: '/app/' });
      res.end();
      return true;
    }

    let filePath = null;

    if (requestUrl.pathname === '/connect') {
      filePath = path.join(UI_ROOT, 'connect.html');
    } else if (requestUrl.pathname === '/app/' || requestUrl.pathname === '/app/index.html') {
      filePath = path.join(UI_ROOT, 'index.html');
    } else if (requestUrl.pathname.startsWith('/app/')) {
      filePath = path.join(UI_ROOT, requestUrl.pathname.slice('/app/'.length));
    }

    if (!filePath) return false;

    const body = await readSafeFile(filePath);
    if (!body) {
      send(res, 404, 'missing.txt', Buffer.from('Not found', 'utf8'));
      return true;
    }

    send(res, 200, filePath, req.method === 'HEAD' ? Buffer.alloc(0) : body);
    return true;
  };
}
