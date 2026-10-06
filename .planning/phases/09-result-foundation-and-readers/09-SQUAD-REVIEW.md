# Squad review — phase 9

- **Дата:** 2026-10-06
- **Планы:** 09-01 … 09-19 (19 планов, 11 волн)
- **Итог:** REVISED (открытых BLOCKER нет)

Критики: plan-critic (покрытие цели), code-critic (план против кода на HEAD 57e7a38), risk-critic (продакшен). Опровержение: devils-advocate. Ревизия: gsd-planner, перепроверка: gsd-plan-checker (VERIFICATION PASSED).

## Surviving findings

| id | severity | verdict | evidence | status |
|----|----------|---------|----------|--------|
| C1 | MAJOR | CONFIRMED | `scripts/exam-core-no-private-copies.test.mjs:157` ловит `mistakeMetric === 'manual'`, который 09-08 планировал в `ScoringSettingsPageClient.tsx` | fixed: фильтр по `isAutoScoredTemplate` (09-03, 09-08), прогон охраны в verify 09-08 |
| R1 / C2 | MAJOR | CONFIRMED | `~/.claude/servers/bio-exam-ops/deploy.sh:22-35,95-110` откатывает только образ после `migrate`; старый `getGlobalQuestionTypes` падает на `open` (`registry.ts:220,231-232`), старый `submitAttempt` (`submit.ts:143-157`) не пишет `auto_total_points`/`final_*` | fixed: шаги пользователя 09-05 и 09-19 — слияние фазы одним пакетом, ручной `deploy.sh`, репетиция на дампе под `bio_exam`, запрет отката одного образа после 0026, расширенный запрос сверки |
| R2 | MINOR (было MAJOR) | DOWNGRADED | `sessions.ts:129-136` + `question-type-resolver.ts:91-99` (глобальный `db` внутри транзакции), пул 20 | fixed: 09-07 читает вопрос и тип до `db.transaction`, тест N > пула |
| R3 | MINOR | CONFIRMED (по сути) | `users_created_by_fk` без `ON DELETE` (`schema.ts:95-99`), удаление пригласившего падает 23503 | fixed: D-21 пересмотрен, 0026 ставит `ON DELETE SET NULL`, исключений в тесте-каталоге не остаётся, поведенческий случай добавлен |
| C3 / R5 | MINOR | — | `admin-api.ts:181` не принимает `averageScore: null` | fixed: допуск `null` в web в том же плане 09-09 |
| C4, C5, C6, C7, C9, C10, P1/C8, P3, P5, R6 | MINOR | — | см. отчёты критиков | fixed планировщиком (09-02, 09-05, 09-09, 09-11, 09-12, 09-13, 09-18, 09-19) |
| scope | WARNING | — | оценки контекста 09-05 150k, 09-12 140k, 09-06 120k, 09-03/07/11/13 110k (confidence low) | open, принято: 09-05 неделим (миграция с немедленным CHECK и писатель), исполнители работают со сжатием контекста |

## Refuted

- Предложенные для R1 `BEFORE INSERT`-триггер и вынос сида `open` в 0027 — несоразмерны: ломают принцип одного писателя проекции и D-22; риск закрыт шагом выкатки.

## Revision

Один цикл ревизии планировщика (15 пунктов): `isAutoScoredTemplate` в exam-core и фильтр «Правил баллов» по шаблону; шаги выкатки 0026 и запрос сверки; `users_created_by_fk` → `SET NULL` в 0026 и пустой список исключений; чтение типов до транзакции черновика; допуск `averageScore: null` в web вместе с сервером; характеризация поле за полем; обновление литералов `review: 'all'`; порядок аккаунтов e2e; «до N балл.» у pending в TestRunner; параметры `AttemptRequestError`; `Queryable` у `insertAttemptFixture`; схема `SubmitAttemptErrorSchema` как контракт 422/400; оговорка «graded = проверено» до фазы 15; заметка о снятии запрета `open` в фазе 17; тесты каскадов при триггере и WAL после `answers-invalid`.
