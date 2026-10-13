---
phase: 08-client-requests-runtime-and-decomposition
plan: 13
subsystem: web
tags: [http, swr, groups, HTTP-02, D-06, D-08, D-09]
status: complete
deferred_human_gate: true

requires:
  - phase: 08-04
    provides: модуль запросов lib/http (request, fetcherWith, swrFetcher, MalformedBodyError), LoadErrorAlert
  - phase: 08-11
    provides: usersKeys в lib/users/api.ts
provides:
  - доменный слой групп app/web/lib/groups/api.ts (groupsKeys, parse-проверки конвертов, фетчеры уровня модуля, saveGroup, deleteGroup)
  - экран «Группы» с блоком ошибки загрузки вместо пустого состояния
  - GroupSheet и DeleteGroupDialog на слое групп, строки ошибок вспомогательных данных
affects: [08-18, 08-19, 08-23, 08-28]

actuals:
  tokens: 8300
  tasks: 3
  commits: 0
plan_head_before: 50ef4f0680bcfc1e8a24174c07fd66a75084e2f9
plan_head_after: 50ef4f0680bcfc1e8a24174c07fd66a75084e2f9

tech-stack:
  added: []
  patterns:
    - "Ключи групп — строки groupsKeys.*(); list(), my(), ownerOptions() — литералы as const; candidates(q) обрезает и кодирует запрос и совпадает с candidatesSource 07.1"
    - "parse групп проверяют только конверт (массив groups/users/owners, group.members) и возвращают тело без преобразования"
    - "Вспомогательные данные в GroupSheet: строка text-xs text-destructive при error && data === undefined"

key-files:
  created:
    - app/web/lib/groups/api.ts
    - app/web/lib/groups/api.test.ts
  modified:
    - app/web/app/(internal)/(protected)/admin/groups/GroupsClient.tsx
    - app/web/components/groups/GroupSheet.tsx
    - app/web/components/groups/DeleteGroupDialog.tsx
    - app/web/lib/groups/group-form.ts
    - app/web/lib/groups/group-form.test.ts

key-decisions:
  - "groupSaveDisabled получила вход membersFailed: правка группы с ошибкой загрузки состава не сохраняется (T-8-30), новая группа не зависит от состава"
  - "SWR состава группы — revalidateOnFocus: false: GroupSheet заполняет выбранных участников из данных SWR, ревалидация по фокусу сбрасывала бы правку (правило 08-04 для локальной формы)"
  - "Ошибка списка владельцев (/api/groups/owner-options) строку не рисует: в UI-SPEC текста для неё нет; в выборе остаются «Администраторы» и текущий владелец (решение исполнителя, автономно)"
  - "candidatesSource и его тест в group-form оставлены: ключ кандидатов в GroupSheet теперь groupsKeys.candidates, паритет строк закреплён тестом api.test.ts"
  - "Тип GroupSheetGroup оставлен как алиас Group из lib/groups/api.ts"

requirements-completed: [HTTP-02]

duration: 25min
completed: 2026-10-05
---

# Phase 8 Plan 13: Экраны групп на доменном слое Summary

**Слой `lib/groups/api.ts` с ключами `groupsKeys`, узкими parse и фетчерами `fetcherWith(parse)`; экран «Группы» показывает блок «Не удалось загрузить группы» с «Повторить» вместо «Групп пока нет»; `GroupSheet` и `DeleteGroupDialog` без локальных fetcher'ов, голого `fetch` и `@/lib/api-fetch`.**

## Performance

- **Duration:** около 25 мин
- **Completed:** 2026-10-05
- **Tasks:** 3/3
- **Files modified:** 7 (2 новых, 5 изменённых)

## Accomplishments

- `app/web/lib/groups/api.ts`: `groupsKeys` (`list() === '/api/groups'`, `my() === '/api/groups/my'`, `detail(id)`, `candidates(q)`, `ownerOptions()`), `parseGroupsList`, `parseMyGroups`, `parseGroupDetail`, `parseCandidates`, `parseOwnerOptions`, фетчеры уровня модуля `groupsListFetcher`, `myGroupsFetcher`, `groupDetailFetcher`, `candidatesFetcher`, `ownerOptionsFetcher`, действия `saveGroup({ id?, body })` (POST без id, PATCH с id) и `deleteGroup(id)`; типы `Group`, `GroupMember`, `GroupDetail`, `Candidate`, `MyGroup`, `GroupPayload`.
- `GroupsClient.tsx`: `useSWR(groupsKeys.list(), groupsListFetcher)`; при `error && data === undefined` — `LoadErrorAlert` «Не удалось загрузить группы» вместо рамки таблицы целиком, поиск и шапка остаются; `h1` «Группы» с `tabIndex={-1}` — `focusTarget`; строка «Не удалось загрузить группы. Обновите страницу.» удалена; загрузка и пустые состояния прежние; ошибка ревалидации при загруженном списке блок не рисует.
- `GroupSheet.tsx`: пользователи администратора — `useSWR(usersKeys.list(), swrFetcher)`; кандидаты учителя — `groupsKeys.candidates(q)` с `candidatesFetcher` и `shouldRetryOnError: false` (ошибка 07.1 «Не удалось выполнить поиск. Попробуйте ещё раз.» прежняя); владельцы — `groupsKeys.ownerOptions()`; состав — `groupsKeys.detail(id)`. Над чипами строки «Не удалось загрузить участников группы» и «Не удалось загрузить список пользователей». «Сохранить группу» выключена, пока состав не загружен или загрузился с ошибкой. Сохранение — `saveGroup`, тост `groupSaveErrorText(status)`, при `auth` тоста нет.
- `DeleteGroupDialog.tsx`: `deleteGroup`, тост «Не удалось удалить группу. Попробуйте ещё раз.», при `auth` тоста нет.

## Task Commits

Коммит: не выполнялся (правило пользователя), изменения в рабочем дереве.

1. **Task 1: Слой групп и экран «Группы» (tracer, TDD)** — RED: `api.test.ts` до `api.ts`, `vitest run lib/groups` — `Test Files 1 failed | 1 passed` (импорт `./api` не найден). GREEN: 30 тестов зелёные, `typecheck` exit 0. Тracer-гейт (повтор `vitest run lib/groups` + `typecheck` после `GroupsClient`) пройден, расширение продолжено.
2. **Task 2: GroupSheet и удаление** — RED: новый тест `groupSaveDisabled` с `membersFailed` красный (1 failed | 30 passed), GREEN после правки `group-form.ts` (31 passed). Проверка `node -e …` печатает `groups screens ok`.
3. **Task 3: affected, verify, e2e, сверка** — результаты ниже.

## Проверки

- `yarn workspace @bio-exam/web vitest run lib/groups`: 2 файла, 31 тест, passed.
- `yarn workspace @bio-exam/web typecheck`: exit 0.
- `yarn workspace @bio-exam/web lint`: exit 0; новых замечаний в файлах плана нет (два `set-state-in-effect` в `GroupSheet.tsx` на эффектах, существовавших до плана).
- `yarn verify`: `yarn verify: OK` (все шаги passed; web 1219 тестов, script-tests 202 pass).
- `yarn e2e`: 190 passed (1.8m), failed нет; сценарии групп `teacher-zone.spec.ts` (шаг 4 — приглашение в группу) зелёные без правок спецификаций. Строки `Server request for /admin/attempts/not-a-uuid failed: status 400` в логе — журнал веб-сервера ожидаемых негативных сценариев, не падения.
- `node .planning/phases/08-client-requests-runtime-and-decomposition/08-plan-files.cjs check 08-13`: `08-13 changed only its files`.
- Логи: scratchpad `08-13-red.log`, `08-13-lint.log`, `08-13-verify.log`, `08-13-e2e.log`, `08-13-impact.log`, `08-13-affected.log`.

## codegraph impact (до правок)

- `GroupsClient` — 3 символа: `GroupsClient`, `GroupsPage` (`admin/groups/page.tsx`), маршрут `/web/app/admin/groups`.
- `GroupSheet` — 5 символов: `GroupSheet`, `GroupsClient`, `GroupsPage` и их файлы.
- `DeleteGroupDialog` — 5 символов: `DeleteGroupDialog`, `GroupsClient`, `GroupsPage` и их файлы.
- `strictFetcher` — 4 символа: `strictFetcher`, `GroupSheet`, `GroupsClient` и файл.

## codegraph affected (после правок)

Запуск из основного дерева (индекс по нему, новый `lib/groups/api.ts` в индексе отсутствует). 24 файла: `app/web/lib/groups/api.test.ts`, `app/web/lib/groups/group-form.test.ts`, `e2e/tests/teacher-zone.spec.ts`, `e2e/tests/{answer-durability,assets,auth,authoring,question-draft-durability,review,session}.spec.ts`, `e2e/fixtures/exam.ts`, серверные `routes/tests/{exam-flow.test.ts,index.ts,public.ts}` и web-экраны тестов (`TestsClient`, `TopicTestsClient`, `QuestionEditorPageClient`, `NewQuestionDraftPageClient`, `TopicFormDialog`, `useTestEditorModel`, `QuestionTypesPageClient`, `QuestionTypeDetailsPageClient`, `ScoringSettingsPageClient`, `TestRunner`) — связь через общие модули `lib/http`/`apiFetch`. Все покрыты `yarn verify` и `yarn e2e`.

## Deviations from Plan

### Применение правил фазы

**1. [Правило 08-04] revalidateOnFocus: false на SWR состава группы**
- **Найдено в:** Task 2
- **Причина:** GroupSheet заполняет выбранных участников из данных SWR; ревалидация по фокусу заменяла бы правку пользователя составом с сервера
- **Файл:** app/web/components/groups/GroupSheet.tsx
- **Коммит:** не выполнялся (правило пользователя)

Других отклонений нет. Опциональные `group-form.ts` и `group-form.test.ts` использованы: условие `groupSaveDisabled` изменилось (T-8-30), тест дополнен.

## Threat Flags

Нет: новых конечных точек и путей доступа план не добавляет. T-8-30 закрыт `groupSaveDisabled` с `membersFailed` и тестом; T-8-31 — `parseGroupsList` и блок ошибки; T-8-SC — установок пакетов нет.

## Known Stubs

Нет.

## Deferred human verification

Не выполнено, ждёт пользователя; исполнитель не одобрял.

1. Блок ошибки на экране «Группы» и строки ошибок в `GroupSheet` на ширине 375px (Поверхность 1, backstop): открыть `/admin/groups` при недоступном API (или с ответом 500 на `/api/groups`) — блок «Не удалось загрузить группы» с причиной и «Повторить» вместо таблицы, поле поиска на месте; после успешного повтора фокус на `h1` «Группы». В `GroupSheet` правки группы при ошибке `/api/groups/<id>` — строка «Не удалось загрузить участников группы», кнопка «Сохранить группу» выключена. Сводно в 08-28.
2. Коммит файлов плана делает ведущая сессия.

## Передачи следующим планам

- 08-18 (`UsersClient`, `EditUserDialog`) и 08-19 (`InviteUserDialog`): ключ списка групп — `groupsKeys.list()` (литерал `'/api/groups'`), фетчер — `groupsListFetcher` из `@/lib/groups/api`; `parseGroupsList` возвращает тело без преобразования, поэтому один кэш на все экраны. Тип строки — `Group` (`owner` есть только у zone.all).
- `ProfileClient` (`/api/groups/my`) этим планом не тронут: для перевода есть `groupsKeys.my()` и `myGroupsFetcher`/`parseMyGroups` (конверт `{ groups, group }`, проверяется только массив `groups`).
- `GroupSheet` берёт `/api/users` через `useSWR<{ rows, total }>(usersKeys.list(), swrFetcher)`: если 08-18 вводит фетчер с `parse` для `'/api/users'`, он должен возвращать тело без преобразования — ключ общий.
- `candidatesSource` в `group-form.ts` больше не используется экраном (только тестом паритета); убрать вместе с `candidatesHint` может 08-23.
- `GroupSheetGroup` — алиас `Group`; новые места берут `Group` из `@/lib/groups/api`.

## Файлы к коммиту

- app/web/lib/groups/api.ts
- app/web/lib/groups/api.test.ts
- app/web/lib/groups/group-form.ts
- app/web/lib/groups/group-form.test.ts
- app/web/app/(internal)/(protected)/admin/groups/GroupsClient.tsx
- app/web/components/groups/GroupSheet.tsx
- app/web/components/groups/DeleteGroupDialog.tsx

## Self-Check: PASSED

- Файлы на месте: `app/web/lib/groups/api.ts`, `app/web/lib/groups/api.test.ts` (FOUND); изменённые пять файлов видны в `git status`.
- Коммитов нет по правилу пользователя: `plan_head_before` = `plan_head_after` = 50ef4f0, изменения в рабочем дереве.
