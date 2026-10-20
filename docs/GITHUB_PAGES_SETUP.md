# GitHub Pages для Hangul Durak

Подготовлено 20 октября 2026 в ветке `multiplayer`. Commit, push, merge, изменение настроек GitHub и deploy **не выполнялись**.

Целевой адрес: <https://averanges.github.io/korean-card-game/>.

## Подготовленная конфигурация

`.github/workflows/deploy-pages.yml` запускается при push в `multiplayer` и содержит `workflow_dispatch`. Job сборки дополнительно проверяет ref, поэтому другая ветка не публикуется. Используются Node.js **22**, `npm ci`, `npm run build`, официальные `actions/configure-pages@v5`, `actions/upload-pages-artifact@v4`, `actions/deploy-pages@v4`. Публикуется только `dist`. Права: `contents: read`, `pages: write`, `id-token: write`. Последовательные build/deploy jobs связаны через `needs`, используется environment `github-pages` и ограничение параллельных публикаций.

Только шаг сборки GitHub Pages получает:

```text
DEPLOY_TARGET=github-pages
VITE_ROOM_API_BASE=https://hangul-durak-rooms.nick-belichenko.workers.dev
```

`vite.config.mjs` выбирает `/korean-card-game/` только при этом `DEPLOY_TARGET`. По умолчанию остаётся `/`: Cloudflare Pages, Netlify и локальный запуск не переключаются на префикс GitHub. Секреты или новые зависимости не добавлены.

## Пути и прямые ссылки

`src/hosting.ts` отделяет путь приложения (`/singleplayer`, `/room/ID`) от пути хостинга (`/korean-card-game/singleplayer`, `/korean-card-game/room/ID`). Подключён к маршрутизатору, навигации и RoomLobby. Ссылки-приглашения, переход после создания/входа и ссылка на главное меню сохраняют префикс. ID комнаты и правила проверки сервера не меняются.

Vite автоматически переписывает CSS и HTML-ссылки на JS, CSS, WebP и SVG. Ссылка fallback на диагностику использует `%BASE_URL%`. Статическая диагностика определяет свой каталог из URL и загружает index, метаданные и iframe внутри этого каталога. `health.html` остаётся самостоятельным HTML без React.

**Только в сборке GitHub Pages** `scripts/build.mjs` создаёт `dist/404.html`, совпадающий с собранным `index.html`. GitHub Pages отдаёт этот HTML при прямом открытии/обновлении `/singleplayer`, `/multiplayer`, `/room/ID`. Ресурсы имеют абсолютный URL с префиксом проекта, а приложение разбирает исходный путь. Перенаправлений, hash-маршрутов и переноса URL комнаты в query нет.

При таком подходе HTTP-статус первого документа глубокой ссылки будет **404**, хотя приложение загрузится и покажет нужный экран. Это ожидаемое свойство custom 404 на статическом GitHub Pages. Меню и физические файлы, включая health/diagnostics, возвращают 200. Обычная корневая сборка не содержит этого 404.html: поведение Cloudflare SPA fallback не изменяется.

## Проверки

- Сборка с `DEPLOY_TARGET=github-pages` и требуемым production endpoint — успешно.
- **17 файлов** JS/CSS/WebP/SVG проверены: наличие, правильные URL, HTTP 200, MIME и размер ответа. CSS не ссылается на `/assets/` вне префикса. В JS нет локального endpoint.
- **8 браузерных проверок** настоящего production-приложения на локальном сервере, который имитирует GitHub Pages и **не делает SPA-rewrites**: меню; одиночная партия с настоящим действием движка; refresh singleplayer через 404; переход и refresh multiplayer; прямой ID комнаты и refresh без потери пути; диагностика и запуск iframe; health с отключённым JS; получение всех ресурсов. Проверены мобильная ширина 390 и настольная 1440. Ошибок JS и неуспешных запросов assets нет; запросов вне префикса нет.
- **87 общих тестов** успешно, включая новый тест путей и существующие игровые проверки. В среде Codex использован прежний вспомогательный `work/check-rooms.mjs solo` для выполнения тех же исходных тестов через Node test runner из-за ранее установленной ошибки окружения `tsx`.
- Затем заново собрана обычная версия: `base=/`, пути к ресурсам корневые, `dist/404.html` отсутствует. **9 проверок диагностики** корневой версии также прошли. TypeScript и проверки мобильной/учебной production-сборки успешны.
- CI workflow подготовлен, но на GitHub не запускался. Локальные проверки выполнены установленным Node 24; Node 22 задан в workflow. Создание реальной сетевой партии на ещё не опубликованном GitHub Pages не проверялось: проверены маршрутизация, форма входа и ID комнаты. Серверные правила и WebSocket не заменялись и не изменялись.

Результаты: [checks.json](github-pages/checks.json), [меню desktop](github-pages/menu-desktop.png), [меню mobile](github-pages/menu-mobile.png), [одиночная партия](github-pages/singleplayer-mobile.png), [прямая ссылка комнаты](github-pages/room-direct-mobile.png).

## Что сделать вручную

1. В [Settings → Pages](https://github.com/averanges/korean-card-game/settings/pages) выбрать **Source: GitHub Actions**. Не выбирать публикацию папки исходников из ветки.
2. В Settings → Environments → `github-pages`, если есть ограничение веток, разрешить **multiplayer**. Убедиться, что политика Actions разрешает официальные actions из workflow.
3. Проверить `git status` и diff в локальной ветке `multiplayer`. Предыдущая задача диагностики также оставила незакоммиченные изменения: новый workflow должен попасть в репозиторий вместе с зависимостями `src/StartupBoundary.tsx`, изменённым `src/main.tsx` и `public/diagnostics.html`. Нельзя отправлять только workflow, оставив импортируемый новый компонент локально.
4. После проверки файлов **самостоятельно** создать коммит и выполнить push в `multiplayer`. Этот push уже запустит публикацию GitHub Pages; Cloudflare/Netlify могут также реагировать на push согласно их существующим настройкам. Никаких действий в `main` для push-триггера не требуется.
5. Открыть [Actions](https://github.com/averanges/korean-card-game/actions), проверить `Deploy GitHub Pages`, затем итоговый адрес environment.

Пример команд для ручной подготовки, выполняемых из корня проекта:

```powershell
git branch --show-current
git status
git diff
git add -- .github/workflows/deploy-pages.yml vite.config.mjs index.html scripts/build.mjs scripts/check-pages-build.mjs scripts/check-diagnostics.mjs src/hosting.ts src/hosting.test.ts src/navigation.ts src/AppShell.tsx src/rooms/RoomLobby.tsx src/main.tsx src/StartupBoundary.tsx public/diagnostics.html public/health.html docs/GITHUB_PAGES_SETUP.md docs/github-pages
git diff --cached --stat
# После проверки списка, вручную:
git commit -m "Add GitHub Pages hosting"
git push origin multiplayer
```

Это инструкция, перечисленные Git-команды изменения состояния не запускались агентом. Остальные материалы предыдущего диагностического отчёта при желании добавить отдельно.

### Ручной workflow_dispatch

В Actions выбрать `Deploy GitHub Pages` → Run workflow → ветка **multiplayer**. GitHub требует, чтобы workflow с `workflow_dispatch` был доступен в **default branch**. Если default branch — `main`, а новый файл существует только в `multiplayer`, ручная кнопка/dispatch могут быть недоступны. Это ограничение GitHub, не ошибка сборки. Регистрацию workflow в default branch нужно согласовать отдельно; `main` и default branch в этой задаче не изменялись. Push в `multiplayer` остаётся основным способом первого запуска.

После регистрации workflow команда ручного запуска:

```powershell
gh workflow run deploy-pages.yml --ref multiplayer --repo averanges/korean-card-game
```

### Доступ к существующему Worker

Frontend будет использовать указанный production endpoint. Сервер проверяет Origin, поэтому для сетевых комнат его существующая конфигурация должна разрешать **`https://averanges.github.io`**, без `/korean-card-game/` в Origin. В локальном `worker/wrangler.jsonc` этого адреса сейчас нет; текущая удалённая конфигурация может отличаться. Проверить разрешённые origins и при необходимости добавить новый, сохранив Netlify/Cloudflare, нужно отдельно. `FRONTEND_ORIGIN` менять на GitHub ради этого не требуется: клиент формирует приглашение на текущем хостинге с правильным base.

Исходники, конфигурация и публикация Worker в этой задаче **не менялись**. Попытка только читающего OPTIONS-пробника из среды Codex была заблокирована сетевой изоляцией; это не доказательство отказа удалённого Worker. Поэтому полную сетевую партию после публикации нужно проверить отдельно. При отсутствии разрешения Origin статическое меню/одиночная игра работают, но создание/вход в комнаты будут отклонены.

## Адреса после публикации

- <https://averanges.github.io/korean-card-game/>
- <https://averanges.github.io/korean-card-game/health.html>
- <https://averanges.github.io/korean-card-game/diagnostics.html>
- <https://averanges.github.io/korean-card-game/singleplayer>
- <https://averanges.github.io/korean-card-game/multiplayer>
- `https://averanges.github.io/korean-card-game/room/ID` — действительный ID из приглашения.

Локальный повтор сборки GitHub Pages (переменные меняются только в текущем PowerShell и восстанавливаются):

```powershell
$pagesPreviousTarget = $env:DEPLOY_TARGET
$pagesPreviousApi = $env:VITE_ROOM_API_BASE
try {
    $env:DEPLOY_TARGET = 'github-pages'
    $env:VITE_ROOM_API_BASE = 'https://hangul-durak-rooms.nick-belichenko.workers.dev'
    npm run build
    node scripts/check-pages-build.mjs
} finally {
    $env:DEPLOY_TARGET = $pagesPreviousTarget
    $env:VITE_ROOM_API_BASE = $pagesPreviousApi
}
# Для возврата обычной локальной production-сборки:
npm run build
```

Опциональный `node scripts/check-pages-build.mjs --browser` требует установленный Playwright/Chrome (можно указать `PLAYWRIGHT_MODULE` и `CHECK_BROWSER`); обычная статическая проверка в CI внешних библиотек не требует.

## Изменённые файлы этого этапа

Новые: `.github/workflows/deploy-pages.yml`, `src/hosting.ts`, `src/hosting.test.ts`, `scripts/check-pages-build.mjs`, этот документ и `docs/github-pages/`.

Обновлены: `vite.config.mjs`, `scripts/build.mjs`, `src/navigation.ts`, `src/AppShell.tsx`, `src/rooms/RoomLobby.tsx`, base-ссылка в `index.html`, относительные пути в `public/diagnostics.html`.

Изменения `src/main.tsx` и новый `src/StartupBoundary.tsx` относятся к предыдущей диагностике и сохранены. Движок, замки, магия, словари и Worker не менялись.

Основания конфигурации: [Vite — GitHub Pages](https://vite.dev/guide/static-deploy.html#github-pages), [GitHub — custom Pages workflows](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages), [условие ручного запуска](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manually-run-a-workflow).
