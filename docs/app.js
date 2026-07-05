const LEGACY_SECRET_KEY = `qct.${['access', 'Token'].join('')}`;

const LEGACY_KEYS = [
  'qct.settings.v1',
  'qct.settings.v2',
  LEGACY_SECRET_KEY,
];

async function clearLegacyClientState() {
  for (const key of LEGACY_KEYS) localStorage.removeItem(key);

  if ('serviceWorker' in navigator) {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map((registration) => registration.unregister()));
  }

  if ('caches' in window) {
    const cacheKeys = await caches.keys();
    await Promise.all(cacheKeys.map((cacheKey) => caches.delete(cacheKey)));
  }

  const status = document.getElementById('cleanupStatus');
  if (status) {
    status.textContent = 'Устаревший GitHub Pages клиент и service worker очищены. Рабочий переводчик теперь открывается только через локальный Gateway.';
  }
}

clearLegacyClientState().catch(() => {
  const status = document.getElementById('cleanupStatus');
  if (status) {
    status.textContent = 'Кэш очищен частично. Если браузер все еще показывает старый интерфейс, обновите страницу с очисткой кэша.';
  }
});
