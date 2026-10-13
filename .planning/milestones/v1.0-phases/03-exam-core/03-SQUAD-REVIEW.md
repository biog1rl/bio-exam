# Squad review — phase 3

- Дата: 2026-10-04
- Планы: 03-01 … 03-13
- Критики: plan-critic (gsd-plan-checker, sonnet), risk-critic (general-purpose, opus), code-critic (Explore, opus); затем devils-advocate (sonnet); один цикл ревизии gsd-planner (sonnet); перепроверка gsd-plan-checker
- Outcome: **REVISED** (открытых BLOCKER нет)

Автономный запуск: пользователь недоступен. BLOCKER у критиков не было; цикл ревизии запущен оркестратором ради подтверждённого MAJOR C1 (verify 03-09 T1 красный по построению) и дешёвых MINOR, которые иначе всплыли бы поломками у исполнителя. Поднято 21 находка (P1–P8, R1–R6, C1–C7), после слияния дублей (P2 = C4, P7 = R3, P4 = R4, R5 = C7) — 17 уникальных.

## Surviving findings

| id | severity | verdict | статус | где |
|---|---|---|---|---|
| C1 | MAJOR | CONFIRMED | fixed | 03-09: тест порядка перенесён в T2 после снятия `superRefine` |
| R1 | MINOR | DOWNGRADED | fixed | CONTEXT `<specifics>` п.3 и 03-08 T3: обратное направление D-11 (`"1.50"`, `"10.0"`, `"1e3"`), выгрузка ключей перед деплоем при счётчике > 0 |
| C2 | MINOR | CONFIRMED | fixed | 03-04 T1, 03-11 T2: `import type` рядом с реэкспортом |
| C3 | MINOR | CONFIRMED | fixed | 03-10: все вызовы в тестах 03-02 со вторым аргументом |
| C5 | MINOR | CONFIRMED | fixed | 03-06 T2, 03-11: части choice/matching при ключе `null` строятся по `content`, не `[]` |
| P2 (= C4) | MINOR | CONFIRMED | fixed | 03-11: гейт `d2 flipped` может упасть; шапка `review.spec.ts` обновляется |
| C6 | MINOR | не проверялся DA | fixed | 03-08: SQL на дважды закодированные ключи в отложенной проверке |
| P7 (= R3) | MINOR | не проверялся DA | fixed | 03-10: «типы не загружены» не блокирует сохранение ложной ошибкой |
| P4 (= R4) | MINOR | не проверялся DA | fixed | 03-05/03-13: паритет с измерением «конфиг типа» (tiers, one_mistake_partial, `{}`, чужая метрика) |
| P6 | MINOR | не проверялся DA | fixed | 03-09: D-13 для PATCH и `/save` |
| P8 | MINOR | не проверялся DA | fixed | 03-08: гейт на неотслеживаемую миграцию в `app/server/drizzle` |
| P5 | MINOR | не проверялся DA | fixed | 03-11: `summaryText` из `getSequenceReview` под unit-тестом |
| P3 | MINOR | не проверялся DA | open | гейт «приватных копий нет» — регулярки по именам из D-17; постоянного теста нет |
| R2 | MINOR | не проверялся DA | open (deferred) | админский разбор старых попыток `sequence_digits` может противоречить сохранённым баллам; SQL и решение — отложенная проверка пользователя (03-11) |
| R5 (= C7) | MINOR | не проверялся DA | open (оркестратор) | фаза 2 не закоммичена; границы планов восстанавливаются снимками `.planning/commit-snapshots/after-03-NN`, которые оркестратор снимает после каждого плана |
| R6 | MINOR | не проверялся DA | open (оркестратор) | единый чеклист «до merge в master» для фаз 2–3 ведётся в STATE.md `## Deferred Verification` |

## Refuted

- P1: при `workflow.use_worktrees=false` планы одной волны исполняются по очереди (`sequential-root-pin.md`, «Wave serialization»); пересечений `files_modified` в волнах нет.
- R1 пункты (a) отдельный план для D-11 и (c) окно деплоя — признаны избыточными; гейт «до деплоя» держит пользователь (GSD не коммитит и не деплоит).

## Revision

Изменены 03-04, 03-05, 03-06, 03-08, 03-09, 03-10, 03-11, 03-13 и `<specifics>` п.3 CONTEXT. Номера планов, волны, `depends_on` и `files_modified` не менялись. Все 13 планов проходят `frontmatter.validate` и `verify.plan-structure`; 87 `<automated>` с `<fails_when>`.
