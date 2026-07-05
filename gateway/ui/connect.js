import { setCsrfToken } from './api.js';

const message = document.getElementById('connectMessage');
const retryButton = document.getElementById('retryClaim');

function setMessage(text, isError = false) {
  message.textContent = text;
  message.classList.toggle('error', isError);
}

function readPairingCode() {
  const fragment = location.hash.replace(/^#/, '');
  if (!fragment) return '';
  return new URLSearchParams(fragment).get('code')?.trim() || '';
}

async function claimPairingCode() {
  const code = readPairingCode();
  if (!code) {
    setMessage('Код привязки отсутствует. Откройте свежую ссылку или отсканируйте новый QR с компьютера, где запущен переводчик.', true);
    return;
  }

  setMessage('Создаю защищенную сессию...');

  const response = await fetch('/api/session/claim', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    cache: 'no-store',
    body: JSON.stringify({ code }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || `HTTP ${response.status}`);
  }

  if (payload.csrfToken) setCsrfToken(payload.csrfToken);
  history.replaceState(null, '', '/connect');
  location.replace('/app/');
}

retryButton.addEventListener('click', () => {
  claimPairingCode().catch((error) => setMessage(error.message, true));
});

claimPairingCode().catch((error) => setMessage(error.message, true));
