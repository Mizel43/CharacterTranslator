# Публикация на GitHub Pages

## Вариант через сайт GitHub

1. Создайте новый публичный репозиторий, например `qwen-character-translator`.
2. Загрузите содержимое этой папки в корень репозитория.
3. Откройте **Settings → Pages**.
4. В разделе **Build and deployment → Source** выберите **GitHub Actions**.
5. Откройте вкладку **Actions** и дождитесь успешного выполнения `Deploy GitHub Pages`.
6. GitHub покажет адрес вида:

```text
https://USERNAME.github.io/qwen-character-translator/
```

7. Впишите этот адрес в `translator.config.json` на компьютере.
8. В `allowedOrigins` впишите:

```text
https://USERNAME.github.io
```

Путь `/qwen-character-translator/` в `allowedOrigins` не добавляется.

## Вариант через Git

```bash
git init
git add .
git commit -m "Initial MVP"
git branch -M main
git remote add origin https://github.com/USERNAME/qwen-character-translator.git
git push -u origin main
```

После каждого `git push` GitHub Actions автоматически опубликует свежую версию папки `web`.

## Что нельзя загружать

Проверьте, что в коммит не попали:

```text
data/access-token.txt
vendor/FreeQwenApi/session/
vendor/FreeQwenApi/.env
tools/cloudflared.exe
logs/
```

Они уже находятся в `.gitignore`, но при ручной загрузке через браузер GitHub `.gitignore` не фильтрует выбранные вами файлы.
