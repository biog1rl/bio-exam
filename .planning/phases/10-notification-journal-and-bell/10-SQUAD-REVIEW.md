# Squad review — phase 10

- **Дата:** 2026-10-06
- **Планы:** 10-01 … 10-08 на момент ревью; после ревизии 10-01 … 10-09 (9 планов, 7 волн)
- **Итог:** REVISED (открытых BLOCKER нет)

Критики: plan-critic (покрытие цели), code-critic (план против кода на HEAD 9bfc67a), risk-critic (продакшен). Опровержение: devils-advocate. Ревизия: gsd-planner (три прохода: находки отряда; решение пользователя D-18; разбиение 10-02), перепроверка: gsd-plan-checker.

## Surviving findings

| id | severity | verdict | evidence | status |
|----|----------|---------|----------|--------|
| R1 | MAJOR | CONFIRMED | «User steps» 10-01 и 10-08 разрешали откат одного образа после 0027, а 0026 фазы 9 ещё не на проде: при совместной выкатке `$PREV` — образ до фазы 9 (`~/.claude/servers/bio-exam-ops/deploy.sh:26-29`, профиль сервера «Ловушки») | fixed: откат образа допустим только если прод уже на 0026 (запрос к `public.__drizzle_migrations`), иначе правила 0026; угроза T-10-34; образ без 0027 даёт 500 на `unread-count` |
| R2 | MINOR (было MAJOR) | DOWNGRADED → решение пользователя | события `test.assigned` для неопубликованных тестов раскрывали название черновика и вели на «нет доступа» (`test-editor-utils.ts:11`, `public.ts:174`) | fixed: D-18 (пользователь) — событие только для видимого теста, при публикации событие всем назначенным; новый план 10-09 |
| P1 / C3 | MINOR | DOWNGRADED | тест отката в 10-02 без `await tx.insert` | fixed: `await` и проверка через `tx.select` до `throw` |
| C1 | MINOR | DOWNGRADED | `m.entries` вместо `m.migrations` в приёмке 10-01 | fixed |
| C2 | MINOR | — | индекс ленты `DESC NULLS LAST` против `ORDER BY … DESC` | fixed: `.desc().nullsFirst()`, `EXPLAIN` в SUMMARY 10-03 |
| C4 | MINOR | — | `lowContrastTexts` не проверяет число и точку | fixed: `elementContrast` в спеке 10-06 |
| C5 / N1 | MINOR | — | направление вызова в тексте навыка | fixed в 10-08 |
| R3, R4, R5, P2, P3, P4 | MINOR | — | см. отчёты критиков | fixed планировщиком |
| N2 | WARNING | — | 10-02 после D-18 — 4 задачи, ~115k токенов | fixed: публикация вынесена в 10-09 (волна 3) |

## Refuted

- Нет. Понижены: P1/C3 (направление «откат причины» доказано вторым случаем), C1 (дублирует `check-migrations`), R2 (продуктовый выбор, не дефект плана — решён пользователем).

## Revision

Три прохода планировщика: (1) 13 находок отряда — шаги выкатки, тест отката, манифест, индекс `NULLS FIRST` и `EXPLAIN`, контраст числа и точки, текст навыка, импорт `db`, порядок блокировок и параллельные назначения, бюджет редактора в 10-05, e2e опроса с часами Playwright, `Open Questions (RESOLVED)`, решение о `params`/`actor_id` в SUMMARY; (2) D-18 — видимость теста при назначении, `recordTestPublished` в транзакции `updateTestSettings`, e2e черновика; (3) разбиение 10-02 на 10-02 и 10-09, 10-08 зависит от 10-09. 10-03 и 10-09 правят один `services/notifications/index.ts` в волне 3 — допущено (`coupling_justified`, исполнение по очереди).
