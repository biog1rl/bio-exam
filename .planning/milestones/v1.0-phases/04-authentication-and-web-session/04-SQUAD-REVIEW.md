# Squad review — phase 4

- Дата: 2026-10-04
- Планы: 04-01 … 04-14
- Критики: plan-critic (gsd-plan-checker, opus), code-critic (Explore, opus), risk-critic (general-purpose, opus); затем devils-advocate (opus); один цикл ревизии gsd-planner (opus); перепроверка gsd-plan-checker (sonnet) — VERIFIED
- Outcome: **REVISED** (открытых BLOCKER нет)

Автономный запуск, пользователь недоступен. Поднято 22 находки (P1–P3, C1–C9, R1–R10). Две из них заявлены как BLOCKER (C1, R1), девять как MAJOR.

## Surviving findings

| id | severity | verdict | статус | где |
|---|---|---|---|---|
| C1 | BLOCKER | CONFIRMED | fixed | 04-12 T3: гард контента при отказе по разделу рендерит `children` и один раз вызывает `router.refresh()`, без `null`; e2e `PAGE NOT FOUND` при видимой шапке; UI-SPEC строки 219–221 |
| R1 | MAJOR (было BLOCKER) | CONFIRMED, источник IP не проверен | fixed | 04-08: `IP_TRUSTED = false`, потолок пары = `LOGIN_CAP_MS` (60 с), тест «атакующий и владелец с одного IP»; 04-14 T4: проверка IP на preview — стоп-условие; CONTEXT D-11/D-12 |
| R2 | MAJOR | CONFIRMED | fixed | 04-14 T4: runbook из 10 шагов. 0021 на прод до merge, база preview, тестовые учётки, web после Ready server, откат web → server |
| R5 | MAJOR | CONFIRMED | fixed | 04-09/04-10: `ok / rejected (401) / unavailable`; без навигации при `unavailable`; повтор keep-alive через 30 с |
| C2 | MAJOR | CONFIRMED | fixed | 04-03 T2: фикстура generate-no-diff удаляет снимки новее 0015 |
| R3 | MINOR (было MAJOR) | CONFIRMED | fixed | 04-06/04-07: `revoked_at` выставляется токенам отозванных сессий; SQL отката в 04-14 |
| R4, C6 | MINOR (было MAJOR) | CONFIRMED (механизм) | accepted | дизайн D-07 не меняется; цена (выход через ~15 мин при потере ответа ротации, в том числе на RSC-prefetch) дописана в CONTEXT `<specifics>` п. 4 и Deferred |
| C3 | MINOR (было MAJOR) | CONFIRMED | fixed | 04-06 T1: `logout.ts` переводится в T1 |
| C4 | MINOR (было MAJOR) | CONFIRMED | fixed | 04-05: `roles` убирается из `SessionUser` в T2 вместе с переводом `public.ts` |
| R6 | MINOR | — | fixed | 04-11: в proxy `rejected` только для 401 |
| R9 | MINOR | — | частично | logout очищает cookie в `finally` (04-06); `/healthz` до `sessionOptional` не переносился, потому что `app.ts` нет в планах |
| P1, P2 | MINOR | — | fixed | отпечатки `before-04-NN/fingerprint.json` вместо `git status` |
| P3 | MINOR | — | open | в пяти планах больше 15 файлов; задачи узкие, план 04-12 не делился |
| R7, R8, R10, C7, C9 | MINOR | не проверялись DA | open | имя cookie через кандидатов; очистка `refresh_tokens`; e2e keep-alive через `page.clock`; фикстура role-deny в parity; env шага CI «Build web» |

## Refuted

- C5: оркестратор запускает исполнителей строго по одному, поэтому гонки глобальных гейтов нет; 0021 аддитивна, связи по содержанию между планами волны 1 нет.
- C8: в переносимых исходниках нет `roles.includes(`.

## Revision

Изменены 04-01, 04-02, 04-03, 04-05 … 04-12, 04-14, а также `04-CONTEXT.md` и `04-UI-SPEC.md`. Волны, `depends_on` и номера планов не менялись. Все планы проходят `frontmatter.validate`, `verify.plan-structure` и `check.verify-failure-directions` (108 команд, 0 blocker), решения D-01…D-24 покрыты.
