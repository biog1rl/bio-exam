---
phase: 09-result-foundation-and-readers
plan: 10
subsystem: student-readers-profile-search
tags: [attempts-me, chart-data, profile, global-search, pending, attemptResultColumns, attemptResultSql]
requires: ["09-07", "09-09"]
provides:
  - "attempts/me и профиль ученика (GET /api/users/:userId/test-attempts) читают результат через attemptResultColumns: у pending earnedPoints, scorePercentage и passed равны null, есть reviewStatus, autoEarnedPoints, autoTotalPoints"
  - "chart-data берёт процент из final_score_percentage, исключает review_status = 'pending', без запасного нуля; форма ответа прежняя"
  - "Глобальный поиск по попыткам берёт значения из attemptResultSql('ta'): у pending заголовок без процента, подпись «На проверке», процент в искомой строке NULL"
  - "app/server/src/routes/tests/attempt-readers-pending.test.ts: поведенческий тест читателей с попытками none, pending и graded"
affects: [09-12, 09-16, 09-17, phase-14, phase-15]
tech-stack:
  added: []
  patterns:
    - "Статические SQL-ветки статуса в searchAttempts, значения поиска остаются параметрами $1…$4"
    - "Один поведенческий тест на все серверные читатели результата вместо охранника по тексту SQL"
key-files:
  created:
    - app/server/src/routes/tests/attempt-readers-pending.test.ts
  modified:
    - app/server/src/routes/tests/public.ts
    - app/server/src/routes/users/index.ts
    - app/server/src/services/search/database-search.ts
decisions:
  - "Попытка на проверке в chart-data пропускается и по условию запроса, и защитной проверкой на null: пустая запись даты невозможна"
  - "Выражение статуса в поиске собрано один раз и подставляется в заголовок, подпись, искомую строку условия: «Сдано», «Не сдано» и «На проверке» ищутся так же, как отображаются"
metrics:
  tasks: 3
  completed: 2026-10-06
status: complete
actuals:
  tokens: 40000
  tasks: 3
  commits: 0
---

# Phase 9 Plan 10: Ученические читатели, профиль и глобальный поиск знают «на проверке» Summary

«Мои попытки», профиль и глобальный поиск читают результат через `attemptResultColumns` и `attemptResultSql('ta')`, `chart-data` строится только из попыток с итогом на дату сдачи; один поведенческий тест проходит все серверные читатели (список, сводка списка, дашборд, «Мои попытки», chart-data, профиль, поиск) с попытками none, pending и graded. Изменения в рабочем дереве, не закоммичены (правило пользователя). `yarn verify: OK`.

## codegraph impact (до правок)

- `searchAttempts`: 9 символов (`searchDatabase`, `GET /api/search`, `services/search/index.ts`, `search-limits.test.ts`, `database-search.test.ts`, бенч `scripts/bench/run.ts`). Сигнатура не менялась, форма ответа прежняя.
- Обработчики `attempts/me`, `chart-data` (public.ts) и профиля (users/index.ts): правка внутри обработчиков, сигнатуры и маршруты не менялись, охват зоны не менялся.

## codegraph affected

Затронутые тесты: `search-limits.test.ts`, `database-search.test.ts`, `attempt-readers-pending.test.ts`, плюс маршруты `admin/attempts.ts`, `admin/question-drafts.ts`, `public.ts`. Запускались: поведенческий тест, `attempt-readers-none.characterization.test.ts`, `src/services/search`, `search-results.characterization.test.ts`, `teacher-zone-search.matrix.test.ts`, `src/routes/users`, `attempt-access-matrix.test.ts` (14 файлов, 246 тестов зелёные), охранные скрипты (27 тестов), затем весь `yarn verify`.

## Что сделано

- Task 1 (tracer): мир `test_readers_pending` с одним учеником и двумя тестами; N сдана по HTTP (радио, 100 %), P и G вставлены через `insertAttemptFixture` в режиме `outcomeFacts` (радио 1 из 1, открытый 0 из 3; у G `finalScores` 2). `attempts/me`: `...attemptResultColumns` вместо четырёх фактовых столбцов.
- Task 2: `chart-data`: условие `ne(testAttempts.reviewStatus, 'pending')`, оценка из `finalScorePercentage` с `Math.round` без запасного нуля, пропуск `null` до создания записи даты. Профиль: `...attemptResultColumns`.
- Task 3: `searchAttempts` строит `pending`, `status` и `percent` из `attemptResultSql('ta')`; `title`, `subtitle`, `snippet_source`, искомая строка условия и `score` ссылаются на них. Тест поиска, списка и дашборда добавлен в поведенческий файл.

## Таблица «читатель → none / pending / graded»

| Читатель | none (N, 100 %) | pending (P) | graded (G, 75 %) |
| -------- | --------------- | ----------- | ---------------- |
| `attempts/me` | 100 %, пройдено, `reviewStatus none` | `null`/`null`/`null`, автобаллы 1 из 1, `totalPoints 4` | 75 %, пройдено, 3 из 4 |
| `chart-data` | на дате сдачи | нет записи | одна запись на сегодня: max 75, min 75, count 1 |
| профиль `test-attempts` | 100 % | `scorePercentage null`, `reviewStatus pending` | 75 % |
| поиск, `title` | `Тест rdp-t1 · 100%` | без процента | `Тест rdp-t2 · 75%` |
| поиск, `subtitle` | «Сдано» | «На проверке» | «Сдано» |
| поиск `q=25` (фактовый процент P) | - | не находит | - |
| поиск `q=проверке` | - | находит | не находит |
| список админа | 100 % | `null`, `pendingTotal 1`, фильтр `review=pending` отдаёт только P | 75 %; среднее 87,5, «пройдено» 2 |
| дашборд админа | входит | `totalAttempts 3`, в `latestAttempts` с `scorePercentage null`, не в среднем и не в «пройдено» | входит в среднее 87,5 |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug-proofing] Попытка P сдана 2020-01-15, а не «вчера»**
- **Found during:** Task 1
- **Issue:** при дате «вчера» поиск `q=25` на 26-е число месяца находил бы P по `submitted_at::date::text`, и проверка T-09-30 мигала бы раз в месяц.
- **Fix:** P сдана в фиксированную дату `2020-01-15T10:00:00.000Z`; диапазон `chart-data` от 2020-01-01 до завтра покрывает её, проверка «записи за дату P нет» сохранена. Цель плана (pending не создаёт запись на графике, graded встаёт на дату сдачи) достигнута.
- **Files modified:** `app/server/src/routes/tests/attempt-readers-pending.test.ts`

**2. [Rule 3 - Simplification] Открытый вопрос в `questions` не вставлялся**
- **Found during:** Task 1
- **Issue:** ни один из читателей плана не читает `questions`; факты `outcomeFacts` ссылаются на `questionId` без внешнего ключа (так же засеян `admin-attempts-list.test.ts`).
- **Fix:** у открытого факта случайный UUID, у радио факта настоящий `questionId` из `addQuestion`.

**3. `database-search.test.ts` не менялся**
- Тест разбирает запросы по подстроке `from test_attempts ta` и не сверяет текст выражений; правка не требовалась (файл помечен optional).

## Known Stubs

Нет.

## Threat Flags

Нет новых поверхностей: маршрутов и охвата зоны не добавлено. T-09-30 (поиск по проценту pending) закрыт `final_score_percentage` в искомой строке и тестом `q=25`; T-09-32 закрыт статическими ветками SQL, значения остаются параметрами; T-09-50 закрыт условием `review_status <> 'pending'` в `chart-data` и тестом записи за дату.

## Проверки

- `node scripts/with-test-db.mjs -- yarn workspace @bio-exam/server vitest run src/routes/tests/attempt-readers-pending.test.ts` — 7 тестов зелёные.
- Набор плана (поведенческий, характеризация 09-02, поиск, `search-results.characterization`, `teacher-zone-search.matrix`, `src/routes/users`, `attempt-access-matrix`) — 14 файлов, 246 тестов зелёные.
- `node --test scripts/attempt-integrity-guards.test.mjs scripts/teacher-zone-guards.test.mjs` — pass 27, fail 0.
- `yarn verify: OK` (все восемь шагов passed).
- `node .planning/phases/09-result-foundation-and-readers/09-plan-files.cjs check 09-10` — `09-10 changed only its files`.
- Критерии приёмки: `attemptResultColumns` в `public.ts` 2, `scorePercentage ?? 0` 0, `ta.score_percentage|ta.passed` в поиске 0, `rg testAttempts\.(scorePercentage|passed)\b app/server/src/routes` пуст.

## Files for commit

- M `app/server/src/routes/tests/public.ts`
- M `app/server/src/routes/users/index.ts`
- M `app/server/src/services/search/database-search.ts`
- A `app/server/src/routes/tests/attempt-readers-pending.test.ts`

## Self-Check: PASSED

Файлы существуют, команды из плана зелёные, коммитов нет по правилу пользователя (`commits: 0`).
