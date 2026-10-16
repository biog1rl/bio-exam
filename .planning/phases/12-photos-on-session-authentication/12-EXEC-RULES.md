# Общие правила исполнителя фазы 12 (bio-exam)

Ты — lane executor фазы 12 «Photos on session authentication» в собственном git worktree. После плана ведущая сессия может прислать тебе следующий план твоей линии (api или web) сообщением: продолжай с тем, что уже прочитал, не перечитывай файлы без нужды. Вопросов пользователю не задавай: решения фазы лежат в `12-CONTEXT.md`, при противоречии плана коду или решению верни `## PLAN BLOCKED` с причиной.

## Корень и ветка (режим worktree)
- Твой корень — worktree, в котором ты запущен: `git rev-parse --show-toplevel`. Он лежит в `/Users/kdvornichenko/bio-exam/.claude/worktrees/` и не равен `/Users/kdvornichenko/bio-exam`. Перед первой правкой и перед возвратом проверь `test "$(git rev-parse --show-toplevel)" != /Users/kdvornichenko/bio-exam`. Не меняй файлы основного checkout и других worktree.
- Harness создаёт worktree от `origin/HEAD` (`master`), а не от `dev`. Шаг 0 первого плана, до всего остального: если `git status --short` пуст и `git rev-parse HEAD` не равен `git rev-parse dev`, выполни один раз `git reset --hard dev`. Это единственное разрешённое исключение из запрета на изменяющие git-команды. Если дерево не пусто — верни `## PLAN BLOCKED`.
- Каждый следующий план линии: перед ним ведущая сессия сама приводит твой worktree к `dev` (результат прошлого плана уже закоммичен там). В начале плана проверь `git status --short`: он должен быть пуст, а `git rev-parse HEAD` равен `git rev-parse dev`. Иначе верни `## PLAN BLOCKED`. После смены `yarn.lock` или `package.json` — снова `yarn install --immutable`.
- Первый план линии: `yarn install --immutable`, затем `yarn workspace @bio-exam/rbac build && yarn workspace @bio-exam/exam-core build`. После плана, который меняет `packages/exam-core` или `packages/rbac`, пересобери их перед проверками.
- `.planning` в worktree есть (он в git после шага 0): план, CONTEXT и остальное читай оттуда. SUMMARY пиши в `.planning/phases/12-photos-on-session-authentication/12-NN-SUMMARY.md` своего worktree.
- Файлов `.env` в worktree нет, не копируй их: `with-test-db`, `yarn verify` и `yarn e2e` сами создают изолированное окружение, порты и базу. Если шаг требует `.env`, верни `## PLAN BLOCKED`.
- Параллельно работает исполнитель другой линии. Перед `yarn verify` и `yarn e2e` посмотри `uptime`; при падении по таймауту или на unhandled 57P01 под нагрузкой повтори один раз.

## Коммиты — ПЕРЕОПРЕДЕЛЕНИЕ инструкций execute-plan
- **Не запускай `git commit`, `git add`, `git stash`, `git reset`, `git checkout -- …` и другие изменяющие git-команды** (исключение — шаг 0 выше). Коммитит только ведущая сессия, один коммит на план после проверки. Оставь все изменения (код, тесты, SUMMARY) в рабочем дереве worktree. Удаляй файлы обычным `rm`.
- Там, где execute-plan.md велит коммитить задачу или SUMMARY, — пропусти коммит, остальное делай. В SUMMARY поля коммитов пиши «не закоммичено».
- Не обновляй `.planning/STATE.md` и `.planning/ROADMAP.md`, не запускай `gsd-tools` для записи состояния: это делает ведущая сессия.
- Не запускай `12-plan-files`-подобных проверок: список файлов плана сверяет ведущая сессия.

## Инструкции исполнения (прочитай Read-ом в начале первого плана)
- `/Users/kdvornichenko/.claude/gsd-core/workflows/execute-plan.md`
- `/Users/kdvornichenko/.claude/gsd-core/templates/summary.md`
- Чекпоинтов в планах нет (`autonomous: true`); `/Users/kdvornichenko/.claude/gsd-core/references/checkpoints.md` читай только если встретишь чекпоинт.

## Обязательное чтение
- План (путь в задании), `.planning/PROJECT.md`, `.planning/STATE.md`, `.planning/config.json`.
- `12-CONTEXT.md` (решения фазы обязательны), `12-SQUAD-REVIEW.md`, `12-ARCH-REVIEW.md`, `12-VALIDATION.md`. Из `12-RESEARCH.md` и `12-PATTERNS.md` — только разделы, которые называет план. Для web-планов `12-UI-SPEC.md` (разделы плана).
- SUMMARY уже выполненных планов фазы в том же каталоге (`12-NN-SUMMARY.md`) — что уже построено; в твой worktree они попадают вместе с `dev`.
- `CLAUDE.md` → `AGENTS.md`; навыки из `.agents/skills/` для своей области (`bio-exam-api`, `bio-exam-web`, `bio-exam-data`) и ADR из строки Routing.
- Большие исходники (больше ~20 тыс. символов) читай через `codegraph_explore` или `Read` с offset и limit.

## Правила проекта
- CodeGraph первым: `codegraph explore`, `codegraph node`, `codegraph impact <symbol>` перед правкой символа, `codegraph affected <files>` для выбора тестов.
- **Комментарии в коде не писать нигде.** Сохраняй только директивные, которые файл уже использует.
- Всё, что трогает БД (тесты, миграции, скрипты), — только `node scripts/with-test-db.mjs <команда>` на одноразовой `test_*`. `DATABASE_URL` из `.env` не использовать никогда.
- Применённые миграции в `app/server/drizzle/` не править; новые — по рецепту плана, `migrations-manifest.json` вручную. Последняя выкаченная миграция — 0030, эта фаза добавляет 0031.
- Гигиена тестов: новые проверки — серверные интеграционные и e2e; юнит-тесты только для логики с вариантами; без хрупких структурных охранников; `test.each` с таблицами.
- Тексты, документы и сообщения — по-русски; идентификаторы, команды, пути как есть. SUMMARY и итоговый отчёт по-русски.
- Новый ключ окружения — в `.env.example` (плейсхолдер).
- Форматирование: перед возвратом `yarn format:check`; если падает на твоих файлах, отформатируй только их: `yarn exec oxfmt <файлы>` (не весь репозиторий) и сообщи.
- `yarn verify` — когда план требует; он сам поднимает одноразовую PostgreSQL. Изредка падает на unhandled 57P01 при зелёных тестах (известная нестабильность) — повтори один раз, не чини вслепую.
- Один раз за задачу: правки пакетом, затем typecheck и lint; скрипты проверок — по разу после работы, после исправления только упавшая часть. Не больше трёх скриншотов за план.
- Не запускай оболочки с `run_in_background`; серверы и watchers, которые запустил сам, останови до отчёта по PID или по шаблону с абсолютным путём твоего worktree, никакого `pkill` и `killall`. Чужие dev-серверы не трогай.
- Если план просит что-то, что противоречит этим правилам или текущему коду (код изменился после исследования; номера строк — ориентир), выбери вариант, сохраняющий цель плана и решения CONTEXT, и опиши отклонение в SUMMARY.
- Неотслеживаемые в основном checkout файлы (`.planning/phases/14.1-…`, правки `BankExplorer.tsx` и e2e `bank.spec.ts`, `teacher-zone.spec.ts`) принадлежат другим сессиям; в твоём worktree их нет, не восстанавливай.

## Результат
- Напиши `.planning/phases/12-photos-on-session-authentication/12-NN-SUMMARY.md` по шаблону в своём worktree.
- В ответе верни: `## PLAN COMPLETE` (или `## PLAN BLOCKED` с причиной), список изменённых и созданных файлов (`git status --short`), какие проверки запускал и их итог (с хвостом вывода при падении), отклонения от плана, что не проверено, заметки для следующих планов линии и **предлагаемое сообщение коммита одной строкой** в стиле `git log` проекта: `feat: …` / `fix: …` / `test: …` / `refactor: …` / `docs: …` + описание по-русски, без точки в конце, без ID задач и без трейлеров. Плюс абсолютный путь твоего worktree.

## Известные особенности окружения
- Если `yarn typecheck` в web падает на `app/web/.next/types/validator.ts` (устаревший артефакт сборки), это не твоя ошибка: каталог под `.gitignore`, его можно удалить (`rm -rf app/web/.next/types`) и повторить. Отслеживаемые файлы не трогать.
- Шаги пользователя фазы (Linux-замер памяти, реальные снимки, HEIC в Safari, лимит памяти контейнера, Caddy не ниже 10 МБ, выкатка 0031) исполнитель не делает и в серверы не заходит.
