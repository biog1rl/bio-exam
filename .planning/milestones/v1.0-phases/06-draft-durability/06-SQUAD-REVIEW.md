# Squad review — phase 6

- Дата: 2026-10-04
- Планы: 06-01 … 06-11
- Порядок проверки:
  1. Критики: plan-critic (gsd-plan-checker), code-critic, risk-critic.
  2. devils-advocate (opus).
  3. Решения пользователя по четырём вопросам.
  4. Один цикл ревизии gsd-planner (opus).
  5. Перепроверка gsd-plan-checker (opus): 0 BLOCKER, 0 WARNING, 4 INFO. INFO 1–3 исправлены в документах, INFO 4 записан в Deferred 06-11.
- Outcome: **REVISED**, открытых BLOCKER нет.

## Решения пользователя

1. После обрыва связи при «Завершить» перезагрузка сама досылает попытку с тем же `clientAttemptId` — для любого теста (C-03, R-02).
2. Возврат к брошенной просроченной сессии теста с лимитом: сначала «Начать тест?», таймер только после подтверждения, итог по времени решает сервер (R-03).
3. Локальная копия черновика вопроса старее сервера: показывается серверная версия и тост «Восстановить правки с этого устройства»; keepalive при уходе — без `lockVersion` (R-01, R-07).
4. Фаза 7 вливается в `dev` до исполнения фазы 6 (R-13, R-14). Выполнено: `dev` 0d633ed.

## Surviving findings

| id | severity | verdict | статус | где |
|---|---|---|---|---|
| P-01 | Medium | CONFIRMED | fixed | 06-03, 06-05: итог слияния пишется в WAL, повтор submit шлёт полный набор ответов |
| C-01, R-04 | medium-low | CONFIRMED | fixed | 06-03, 06-07: чужой WAL удаляется независимо от кэша; `navigate` после сдачи не пишет WAL; `visitCount` только в `active` |
| C-03 / R-02 | medium | решение 1 | fixed | 06-05, 06-11 п. 2a |
| R-03 | medium | решение 2 | fixed | CONTEXT D-02, D-07; 06-05, 06-07, 06-11 |
| R-01 + R-07 | Medium | решение 3 | fixed | CONTEXT D-19; UI-SPEC; 06-04, 06-08; угроза T-6-29 accept |
| C-04 | medium-low | CONFIRMED | fixed | 06-03: `saveIndicatorKind` учитывает сессию и WAL-pending |
| M-1 | medium-low | missed by critics | fixed | 06-03, 06-04: init → dispose → init в StrictMode |
| R-08 | Medium-Low | CONFIRMED | fixed | 06-04: копия удаляется только при совпадении сериализации |
| C-09 / R-09 | low-medium | CONFIRMED | fixed | 06-06: `MdxPlugin` пропускает обновления без изменений; `returnValue = ''` |
| R-10 | Low | CONFIRMED | fixed | 06-04: при `gone` нет `beforeunload`; копия с `forbidden` не восстанавливается |
| P-04, C-02, C-06, C-08, C-10, C-11, P-05, C-12 | low | CONFIRMED | fixed | 06-01, 06-05, 06-08, 06-09, 06-10, CONTEXT |
| R-06 | Low | DOWNGRADED | fixed / deferred | 06-02: keepalive шлёт и ключ в полёте; лимит суммы тел — Deferred 06-11 |
| R-05, R-15, R-16 | Low | — | deferred | 06-11 `## Deferred` |
| P-03, C-05, C-07, R-12 | Info / Low | DOWNGRADED | accepted | — |

## Refuted

- P-02, R-11.

## [авто] решения ревизии к подтверждению пользователем

- Текст тоста расхождения копии «Черновик изменён в другом месте. Открыта версия с сервера, правки с этого устройства не применены.», `duration: Infinity`.
- Проверка часов раньше ветки `frozenKey`, `frozenKey` при этом удаляется.
- `baseLockVersion` обновляется при собственных подтверждениях вкладки.
