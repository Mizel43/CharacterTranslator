import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import QRCode from 'qrcode';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const connectUrl = process.argv[2];

if (!connectUrl) {
  console.error('Usage: node generate-connect.mjs <url>');
  process.exit(1);
}

const dataDir = path.join(root, 'data');
fs.mkdirSync(dataDir, { recursive: true });
const qrPath = path.join(dataDir, 'connect-qr.png');
const htmlPath = path.join(dataDir, 'connect-phone.html');

await QRCode.toFile(qrPath, connectUrl, {
  width: 420,
  margin: 2,
  errorCorrectionLevel: 'M',
});

const escaped = connectUrl
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;');

const html = `<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Подключить браузер</title>
  <style>
    body{font-family:system-ui,sans-serif;background:#111827;color:#f9fafb;display:grid;place-items:center;min-height:100vh;margin:0;padding:24px}
    main{max-width:680px;text-align:center;background:#1f2937;border:1px solid #374151;border-radius:12px;padding:28px}
    img{width:min(420px,90vw);border-radius:12px;background:white;padding:8px}
    a{display:inline-block;margin-top:18px;background:#f9fafb;color:#111827;padding:12px 18px;border-radius:8px;text-decoration:none;font-weight:700}
    p,li{color:#d1d5db;line-height:1.55;overflow-wrap:anywhere}
    ul{text-align:left}
  </style>
</head>
<body><main>
  <h1>Подключить браузер к локальному Gateway</h1>
  <p>Отсканируйте QR-код телефоном или откройте ссылку на этом компьютере. Она ведет на <code>/connect#code=...</code>, создаёт короткоживущую сессию и дальше открывает рабочий интерфейс на <code>/app/</code>.</p>
  <ul>
    <li>Код одноразовый и живёт несколько минут.</li>
    <li>GitHub Pages больше не используется как клиент к Gateway.</li>
    <li>Если вы перезапустите translator, потребуется новый QR или новая ссылка.</li>
  </ul>
  <img src="connect-qr.png" alt="QR-код подключения">
  <br><a href="${escaped}">Открыть ссылку привязки</a>
  <p>${escaped}</p>
</main></body></html>`;

fs.writeFileSync(htmlPath, html, 'utf8');
console.log(htmlPath);
