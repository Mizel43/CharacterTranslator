# Проверки перед передачей

Выполнено:

- синтаксическая проверка `gateway/server.js`, `gateway/prompt.js`, `gateway/generate-connect.mjs`, `web/app.js`;
- unit-тесты нормализации запроса, ограничения 18+ и очистки ответа модели;
- end-to-end тест Gateway с mock OpenAI-compatible Qwen API;
- проверка Bearer-аутентификации;
- проверка разрешённого и запрещённого CORS origin;
- проверка JSON GitHub Actions workflow;
- проверка разбора HTML.

Не выполнено в среде сборки:

- реальная авторизация в Qwen Chat;
- реальный запуск Windows BAT/PowerShell;
- создание настоящего Cloudflare Quick Tunnel;
- публикация в пользовательский GitHub-репозиторий.

Эти действия требуют Windows, браузерной авторизации пользователя и доступа к его аккаунтам.
