# Общие правила исполнителя фазы 11 (bio-exam)

Ты — SEQUENTIAL executor на основном рабочем дереве репозитория. Вопросов пользователю не задавай: решения D-04, D-07 и D-21 приняты пользователем, остальное — [авто] в `11-CONTEXT.md`; при противоречии плана коду верни `## PLAN BLOCKED` с причиной.

## Корень и ветка
- Корень проекта (PROJECT_ROOT): `/Users/kdvornichenko/bio-exam`. Перед первой правкой и перед возвратом выполни:
  `test "$(git -C /Users/kdvornichenko/bio-exam rev-parse --show-toplevel)" = "$(git rev-parse --show-toplevel)" && test "$(git -C /Users/kdvornichenko/bio-exam rev-parse --abbrev-ref HEAD)" = dev`
  Если не совпало — остановись и верни блокер. Все пути пиши абсолютными или от этого корня. Не заходи в `/Users/kdvornichenko/bio-exam/.claude/worktrees/` и ничего там не меняй.
- Неотслеживаемый `docs/adr/0006-enforce-authorization-by-construction.md` принадлежит другой сессии: не читать как правило, не менять, не удалять, не добавлять в git.

## Коммиты — ПЕРЕОПРЕДЕЛЕНИЕ инструкций execute-plan
- **Не запускай `git commit`, `git add`, `git stash`, `git reset`, `git checkout -- …` и другие изменяющие git-команды.** Правило пользователя: коммитит только ведущая сессия, один коммит на план после проверки. Оставь все изменения в рабочем дереве.
- Там, где execute-plan.md велит коммитить задачу или SUMMARY, — пропусти коммит, остальное делай.
- Не обновляй `.planning/STATE.md` и `.planning/ROADMAP.md` — это делает ведущая сессия.

## Инструкции исполнения (прочитай Read-ом в начале)
- `/Users/kdvornichenko/.claude/gsd-core/workflows/execute-plan.md`
- `/Users/kdvornichenko/.claude/gsd-core/templates/summary.md`
- `/Users/kdvornichenko/.claude/gsd-core/references/executor-examples.md`
- Чекпоинтов в планах нет (`autonomous: true`); `/Users/kdvornichenko/.claude/gsd-core/references/checkpoints.md` читай только если встретишь чекпоинт.

## Обязательное чтение
- План (путь в задании), `/Users/kdvornichenko/bio-exam/.planning/PROJECT.md`, `/Users/kdvornichenko/bio-exam/.planning/STATE.md`, `/Users/kdvornichenko/bio-exam/.planning/config.json`
- `/Users/kdvornichenko/bio-exam/.planning/phases/11-deadline-finalisation-upload-window-and-background-jobs/11-CONTEXT.md` (решения D-01…D-21 — обязательны), `11-RESEARCH.md`, `11-PATTERNS.md`, `11-VALIDATION.md`, для web-планов `11-UI-SPEC.md`
- SUMMARY уже выполненных планов этой фазы в том же каталоге (`11-NN-SUMMARY.md`) — что уже построено
- `/Users/kdvornichenko/bio-exam/CLAUDE.md` → `AGENTS.md`; навыки из `.agents/skills/` для своей области (`bio-exam-api`, `bio-exam-web`, `bio-exam-data`)

## Правила проекта
- CodeGraph первым: `codegraph explore`, `codegraph node`, `codegraph impact <symbol>` перед правкой символа, `codegraph affected <files>` для выбора тестов.
- **Комментарии в коде не писать нигде.**
- Всё, что трогает БД (тесты, миграции, скрипты), — только `node scripts/with-test-db.mjs <команда>` на одноразовой `test_*`. `DATABASE_URL` из `.env` не использовать никогда.
- Применённые миграции в `app/server/drizzle/` не править; новые — по рецепту плана, `migrations-manifest.json` вручную.
- Гигиена тестов: новые проверки — серверные интеграционные и e2e; юнит-тесты только для логики с вариантами; без хрупких структурных охранников; `test.each` с таблицами.
- Тексты, документы и сообщения — по-русски; идентификаторы, команды, пути как есть.
- Новый ключ окружения — в `.env.example` (плейсхолдер).
- Форматирование: перед возвратом `yarn format:check`; если падает на твоих файлах, отформатируй только их: `yarn exec oxfmt <файлы>` (не весь репозиторий) и сообщи.
- `yarn verify` — когда план требует; он сам поднимает одноразовую PostgreSQL. Изредка падает на unhandled 57P01 при зелёных тестах (известная нестабильность) — повтори один раз, не чини вслепую.
- Если план просит что-то, что противоречит этим правилам или текущему коду (код изменился после исследования; номера строк — ориентир), выбери вариант, сохраняющий цель плана и решения CONTEXT, и опиши отклонение в SUMMARY.

## Результат
- Напиши `/Users/kdvornichenko/bio-exam/.planning/phases/11-deadline-finalisation-upload-window-and-background-jobs/11-NN-SUMMARY.md` по шаблону (каталог .planning не отслеживается git). Если среда откажет в записи SUMMARY — не обходи через shell, верни полный текст SUMMARY в ответе.
- В ответе верни: `## PLAN COMPLETE` (или `## PLAN BLOCKED` с причиной), список изменённых и созданных файлов (`git status --short`), какие проверки запускал и их итог (с хвостом вывода при падении), отклонения от плана, и **предлагаемое сообщение коммита одной строкой** в стиле `git log` проекта: `feat: …` / `fix: …` / `test: …` / `refactor: …` / `docs: …` + описание по-русски, без точки в конце, без ID задач и без трейлеров.

## Известные особенности окружения
- Если `yarn typecheck` в web падает на `app/web/.next/types/validator.ts` (устаревший артефакт сборки, ссылается на удалённые страницы), это не твоя ошибка: каталог `app/web/.next/types` под `.gitignore`, его можно удалить (`rm -rf app/web/.next/types`) и повторить. Отслеживаемые файлы не трогать.
- Ведущая сессия перед каждым планом делает `node .planning/phases/11-deadline-finalisation-upload-window-and-background-jobs/11-plan-files.cjs snapshot 11-NN`; ты в конце запускаешь только `check 11-NN` (если план не требует иначе).
- Решения пользователя фазы 11: D-04 (пустой просроченный черновик — попытки нет, сессия закрывается `expired`), D-07 (окно фото 15 минут по умолчанию) и D-21 (сдаются только сессии, у которых дедлайн плюс льгота прошли не раньше 24 ч назад; более давние закрываются `expired` без попытки, черновик в строке остаётся) — в `11-CONTEXT.md`; итог ревью планов — `11-SQUAD-REVIEW.md`.
- Миграции 0026–0029 в `dev` закоммичены, но не выкачены; последняя миграция в репозитории — 0029, эта фаза добавляет 0030.
