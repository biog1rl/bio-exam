# Squad review — phase 11

- Дата: 2026-10-06
- Планы: 11-01 … 11-18 (18 планов, 10 волн), код dev 37d04bd (после слияния уборки ux/navigation)
- Итог: **REVISED** — блокеров не было; две подтверждённые находки MAJOR и подтверждённые MINOR закрыты одним циклом правки, повторная проверка `VERIFICATION PASSED`

## Surviving findings

| id | severity | verdict | evidence | status |
|----|----------|---------|----------|--------|
| R1 = C2 | MAJOR | CONFIRMED | выборка задачи без нижней границы (11-08), брошенные сессии закрываются только лениво (`sessions.ts:94-101`, `submit.ts:107-112`) — первый прогон сдал бы весь исторический хвост задним числом | fixed: решение пользователя D-21 (сдавать только сессии, у которых дедлайн + льгота не старше 24 ч; старше — `expired` без попытки), тесты 25 ч / 23 ч в 11-04, 11-06, 11-07, 11-08, подсчёт после выкатки в шагах 11-18 |
| R2 | MAJOR | CONFIRMED | судьба `expired` вела к «Начать тест?» и `applyServerSession` стирал WAL без сверки (`lifecycle.ts:416-419`), а 422 в 11-13 текст сохранял | fixed: `applyTimeExpired(current, { certain })` в 11-14 Task 3, перенос неподтверждённых текстов в `test-unsent-`, строки UI-SPEC согласованы |
| P1 | MINOR | DOWNGRADED | ленивые пути без запаса 60 с — узкое окно принято в RESEARCH Pattern 3 | open (принято) |
| P2 / C4 | MINOR | DOWNGRADED | устаревшая обёртка `buildQuestionMarkdownCandidates`; ветка `draft_changed` в `/submit` | fixed (11-04) |
| R3 | MINOR | DOWNGRADED | ошибка финализации давала бы 500 на `/start` | fixed: `expired` + `logger.error`, память сбоев задачи, тест с вопросом неизвестного типа |
| R4 | MINOR | DOWNGRADED | шаги пользователя без `idle_in_transaction_session_timeout` и с проверкой логов остановки на той же выкатке | fixed (11-18) |
| C1 | MINOR | DOWNGRADED | `attempt-time-limit.test.ts:163-178` падает после 11-06 и не был в списке закреплений | fixed (11-06, 11-02, VALIDATION) |
| C3, C5, C7, C8, C9, C10, P3/C6, P5, R5, R8 | MINOR | — | устаревшие ссылки, разбор тела 409, невыполнимые grep-критерии, литералы в `schema.ts`, `prefix` у `createOwnTest`, `null` скрытого поля, лимит прогона задачи 20 с, `PG_POOL_MAX` в e2e, запись `unsent` до удаления WAL | fixed |
| P4 | MINOR | — | пометка о недошедшем тексте не показывается после перезагрузки | open (MINOR, не правилось) |
| R6, R7 | MINOR | DOWNGRADED | задачи в локальном `yarn dev`; смещение часов от `Date.now` | open (принято) |

## Refuted

- R9 — `closeIdleConnections()` раз в секунду закрывает keep-alive соединения, предел 25 с укладывается в `stop_grace_period` 30 с.

## Revision

Один цикл `gsd-planner` (правки на месте, 15 планов, плюс `11-VALIDATION.md`, `11-EXEC-RULES.md`, строки таблиц WAL и возврата на страницу в `11-UI-SPEC.md`). Новые символы: `DEADLINE_FINALIZE_MAX_AGE_HOURS`, `closeStaleOpenSessions`, `FINALIZE_FAILURE_COOLDOWN_MS`, `FINALIZE_RUN_BUDGET_MS`, `applyTimeExpired`, `app/server/src/lib/db-errors.ts`; новые угрозы T-11-58…T-11-67. Волны и `depends_on` не менялись, в каждом плане 2–3 задачи. Повторная проверка `gsd-plan-checker`: VERIFICATION PASSED.
