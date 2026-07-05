# Технический план MVP

## Changelog 0.2.0 - Style Engine v2

- Добавлен единый `docs/style-config.json` для пресетов, уровней контролов, tooltip, interaction rules и температур.
- Gateway формирует prompt через Style Engine v2 и больше не передает модели только числа вида `Flirt: 3/4`.
- Request schema расширена полями `presetId`, `priority`, `previous`; действия результата включают `alternative`, `shorter`, `softer`, `bolder`, `more_vulgar`, `apply_settings`.
- Frontend заменяет `Контекст` и `Тон` на `Пресет`, хранит историю до 5 предыдущих вариантов и делает delta rewrite после изменения sliders.
- Добавлены validator и один скрытый correction retry на Gateway.

## 1. Компоненты

### Web UI

Статический HTML/CSS/JavaScript без фреймворков. Размещается на GitHub Pages.

Отвечает за:

- управление персонажами;
- хранение настроек в `localStorage`;
- сбор параметров перевода;
- обращение к Gateway;
- копирование результата;
- импорт и экспорт JSON;
- PWA-кэш интерфейса.

### Translator Gateway

Node.js HTTP-сервер на `127.0.0.1:8787`.

Маршруты:

```text
GET  /public/ping
GET  /api/health
GET  /api/models
POST /api/translate
```

Функции:

- Bearer-аутентификация;
- точный CORS allowlist;
- in-memory rate limit;
- ограничение размера JSON и исходного текста;
- серверная сборка промпта;
- нормализация профиля;
- запрос в FreeQwenApi;
- очистка ответа модели;
- сокрытие внутреннего API от браузера.

### FreeQwenApi

Работает на `127.0.0.1:3264/api`.

Используемые маршруты:

```text
GET  /api/health
GET  /api/models
POST /api/chat/completions
```

### Cloudflare Quick Tunnel

Публикует только Gateway. FreeQwenApi напрямую наружу не выставляется.

## 2. Поток запроса

1. Пользователь выбирает профиль и параметры.
2. Браузер отправляет JSON в `/api/translate`.
3. Gateway проверяет origin, токен, rate limit и поля.
4. Gateway превращает параметры в system/user messages.
5. FreeQwenApi пересылает запрос в авторизованную сессию Qwen Chat.
6. Gateway извлекает `choices[0].message.content`.
7. Интерфейс показывает и копирует результат.

## 3. Безопасность

- FreeQwenApi слушает только localhost.
- Gateway слушает только localhost и публикуется через tunnel.
- Токен генерируется криптографическим RNG, 256 бит.
- Токен не находится в GitHub Pages.
- Первичная передача на телефон идёт через URL fragment.
- После чтения fragment удаляется через `history.replaceState`.
- CORS разрешает только заданный GitHub Pages origin и localhost preview.
- Длина текста ограничена 4000 символами.
- Частота по умолчанию: 30 запросов за 10 минут на IP.
- Профили допускаются только для возраста 18+.

## 4. Конфигурация

Основной файл: `translator.config.json`.

Изменяемые поля:

- `frontendUrl`;
- `allowedOrigins`;
- `gatewayPort`;
- `qwenBaseUrl`;
- `defaultModel`;
- `maxInputChars`;
- `requestTimeoutMs`;
- `rateLimit`.

Секретный токен: `data/access-token.txt`.

## 5. Надёжность

- каждый процесс запускается отдельно и получает собственный лог;
- PID сохраняются в `data/processes.json`;
- перед запуском проверяются `/health` и `/public/ping`;
- при частичном сбое уже запущенные процессы завершаются;
- обновление FreeQwenApi создаёт резервную копию и восстанавливает её при ошибке;
- список моделей имеет fallback на `qwen3.7-max` и `qwen3.7-plus`.

## 6. Следующий этап после MVP

1. Закрепить постоянный Cloudflare Tunnel и домен.
2. Добавить синхронизацию профилей через облачную базу.
3. Добавить локальный `llama.cpp` как альтернативный движок.
4. Добавить историю с локальным шифрованием.
5. Добавить серверное хранение пресетов без передачи полного лора при каждом запросе.
6. Добавить тестовый набор фраз и сравнение моделей.
