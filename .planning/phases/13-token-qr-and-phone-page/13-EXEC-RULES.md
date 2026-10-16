# Общие правила исполнителя фазы 13 (bio-exam)

Ты — lane executor фазы 13 «Token QR and phone page» в собственном git worktree. После плана ведущая сессия может прислать тебе следующий план твоей линии (api или web) сообщением: продолжай с тем, что уже прочитал, не перечитывай файлы без нужды. Вопросов пользователю не задавай: решения фазы лежат в `13-CONTEXT.md`, при противоречии плана коду или решению верни `## PLAN BLOCKED` с причиной.

## Корень и ветка (режим worktree)
- Твой корень — worktree, в котором ты запущен: `git rev-parse --show-toplevel`. Он лежит в `/Users/kdvornichenko/bio-exam/.claude/worktrees/` и не равен `/Users/kdvornichenko/bio-exam`. Перед первой правкой и перед возвратом проверь `test "$(git rev-parse --show-toplevel)" != /Users/kdvornichenko/bio-exam`. Не меняй файлы основного checkout и других worktree.
- Worktree создаётся от HEAD ведущей сессии (`worktree.baseRef: "head"` в `.claude/settings.local.json`), то есть от `dev` с коммитами предыдущих планов.
- Шаг 0 каждого плана, до всего остального: `git status --short` пуст и `git rev-parse HEAD` равен `git rev-parse dev`. Иначе верни `## PLAN BLOCKED` с выводом обеих команд и ничего не правь. Перед вторым и следующими планами линии ведущая сессия сама приводит твой worktree к `dev`. После смены `yarn.lock` или `package.json` — снова `yarn install --immutable`.
- Шаг 0б (работа W1): `git ls-files --error-unmatch app/server/drizzle/0033_question_photo_settings.sql` успешен. Иначе `## PLAN BLOCKED`.
- Первый план линии: `yarn install --immutable`, затем `yarn workspace @bio-exam/rbac build && yarn workspace @bio-exam/exam-core build`. После плана, который меняет `packages/exam-core` или `packages/rbac`, пересобери их перед проверками.
- `.planning` в worktree есть: план, CONTEXT и остальное читай оттуда. SUMMARY пиши в `.planning/phases/13-token-qr-and-phone-page/13-NN-SUMMARY.md` своего worktree.
- Файлов `.env` в worktree нет, не копируй их: `with-test-db`, `yarn verify` и `yarn e2e` сами создают изолированное окружение, порты и базу. Если шаг требует `.env`, верни `## PLAN BLOCKED`.
- Параллельно работает исполнитель другой линии. Перед `yarn verify` и `yarn e2e` посмотри `uptime`; при падении по таймауту или на unhandled 57P01 под нагрузкой повтори один раз.
- Неотслеживаемые в основном checkout файлы (`.planning/design/`, `PhotoViewer.tsx` и правки соседних работ) принадлежат другим сессиям; в твоём worktree их может не быть, не восстанавливай. Если плану нужен `.planning/design/qr-dialog.md`, а его в worktree нет, читай его из `/Users/kdvornichenko/bio-exam/.planning/design/qr-dialog.md` только на чтение.

## Коммиты — ПЕРЕОПРЕДЕЛЕНИЕ инструкций execute-plan
- **Не запускай `git commit`, `git add`, `git stash`, `git reset`, `git checkout -- …` и другие изменяющие git-команды.** Коммитит только ведущая сессия, один коммит на план после проверки. Оставь все изменения (код, тесты, SUMMARY) в рабочем дереве worktree. Удаляй файлы обычным `rm`.
- Там, где execute-plan.md велит коммитить задачу или SUMMARY, — пропусти коммит, остальное делай. В SUMMARY поля коммитов пиши «не закоммичено».
- Не обновляй `.planning/STATE.md` и `.planning/ROADMAP.md`, не запускай `gsd-tools` для записи состояния: это делает ведущая сессия.

## Инструкции исполнения (прочитай Read-ом в начале первого плана)
- `/Users/kdvornichenko/.claude/gsd-core/workflows/execute-plan.md`
- `/Users/kdvornichenko/.claude/gsd-core/templates/summary.md`
- Чекпоинтов в планах нет (`autonomous: true`); `/Users/kdvornichenko/.claude/gsd-core/references/checkpoints.md` читай только если встретишь чекпоинт.

## Обязательное чтение
- План (путь в задании), `.planning/PROJECT.md`, `.planning/STATE.md`, `.planning/config.json`.
- `13-CONTEXT.md` (решения фазы обязательны, включая «Поправки 2026-10-16»), `13-SQUAD-REVIEW.md`, `13-ARCH-REVIEW.md`, `13-UI-CONTRACT.md`, `13-PATTERNS.md`. Из `13-RESEARCH.md` и `13-UI-SPEC.md` — только разделы, которые называет план; `.planning/design/qr-dialog.md` для QR-диалога.
- SUMMARY уже выполненных планов фазы в том же каталоге (`13-NN-SUMMARY.md`).
- `CLAUDE.md` → `AGENTS.md`; навыки из `.agents/skills/` для своей области (`bio-exam-api`, `bio-exam-web`, `bio-exam-data`) и ADR из строки Routing.
- Большие исходники (больше ~20 тыс. символов) читай через `codegraph_explore` или `Read` с offset и limit.

## Правила проекта
- CodeGraph первым: `codegraph explore`, `codegraph node`, `codegraph impact <symbol>` перед правкой символа, `codegraph affected <files>` для выбора тестов.
- **Комментарии в коде не писать нигде.** Сохраняй только директивные, которые файл уже использует.
- Всё, что трогает БД (тесты, миграции, скрипты), — только `node scripts/with-test-db.mjs -- <команда>` на одноразовой `test_*`. `DATABASE_URL` из `.env` не использовать никогда.
- Применённые миграции в `app/server/drizzle/` не править. Эта фаза добавляет одну миграцию 0034 (план 13-02), после 0033 работы W1; `migrations-manifest.json` вручную, `when` строго больше `when` 0033.
- Гигиена тестов: новые проверки — серверные интеграционные и e2e; юнит-тесты только для логики с вариантами; без хрупких структурных охранников; `test.each` с таблицами.
- Тексты, документы и сообщения — по-русски; идентификаторы, команды, пути как есть. SUMMARY и итоговый отчёт по-русски. Тексты интерфейса дословно из `13-UI-CONTRACT.md` и `qr-dialog.md`; текстов, которых там нет, не придумывай.
- Токен ссылки не пишется в логи, SUMMARY, снимки экрана и вывод команд; в отчёте только первые 6 символов.
- Новый ключ окружения — в `.env.example` (плейсхолдер); в этой фазе новых ключей нет.
- Форматирование: перед возвратом `yarn format:check`; если падает на твоих файлах, отформатируй только их: `yarn exec oxfmt <файлы>` и сообщи.
- `yarn verify` — только в плане 13-08. Изредка падает на unhandled 57P01 при зелёных тестах (известная нестабильность) — повтори один раз, не чини вслепую.
- Один раз за задачу: правки пакетом, затем typecheck и lint; скрипты проверок — по разу после работы, после исправления только упавшая часть. Не больше трёх скриншотов за план.
- Не запускай оболочки с `run_in_background`; серверы и watchers, которые запустил сам, останови до отчёта по PID или по шаблону с абсолютным путём твоего worktree, никакого `pkill` и `killall`. Чужие dev-серверы не трогай.
- Если план просит что-то, что противоречит этим правилам или текущему коду (код изменился после исследования; номера строк — ориентир), выбери вариант, сохраняющий цель плана и решения CONTEXT, и опиши отклонение в SUMMARY.

## Результат
- Напиши `.planning/phases/13-token-qr-and-phone-page/13-NN-SUMMARY.md` по шаблону в своём worktree.
- В ответе верни: `## PLAN COMPLETE` (или `## PLAN BLOCKED` с причиной), список изменённых и созданных файлов (`git status --short`), какие проверки запускал и их итог (с хвостом вывода при падении), отклонения от плана, что не проверено, заметки для следующих планов линии и **предлагаемое сообщение коммита одной строкой** в стиле `git log` проекта: `feat: …` / `fix: …` / `test: …` / `refactor: …` / `docs: …` + описание по-русски, без точки в конце, без ID задач и без трейлеров. Плюс абсолютный путь твоего worktree.

## Известные особенности окружения
- Если `yarn typecheck` в web падает на `app/web/.next/types/validator.ts` (устаревший артефакт сборки), это не твоя ошибка: каталог под `.gitignore`, его можно удалить (`rm -rf app/web/.next/types`) и повторить. Отслеживаемые файлы не трогать.
- Шаги пользователя (спайк на телефонах 13-SPIKE.md, проверка QR камерами iPhone и Android, выкатка 0034, серверные работы) исполнитель не делает и в серверы не заходит.
