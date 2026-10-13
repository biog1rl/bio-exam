---
phase: 04-authentication-and-web-session
plan: 13
subsystem: web-auth-ui
tags: [login-page, retry-after, auth-06, auth-04, edit-user-dialog, alert-dialog, ui-spec, vitest, playwright]
status: complete
deferred_human_gate: true

requires:
  - phase: 04-authentication-and-web-session
    provides: "04-08: 429 с Retry-After и DELETE /api/users/:id/login-throttle; 04-07: POST /api/users/:id/sessions/revoke; 04-10: me из AuthProvider на странице логина; 04-12: гейты разделов"
provides:
  - "app/web/lib/session/wait-format.ts: formatWait(seconds)"
  - "app/web/lib/session/login-errors.ts: loginErrorText(status), parseRetryAfter(header), NETWORK_ERROR_TEXT, TOO_MANY_WAIT_TEXT(wait), TOO_MANY_LATER_TEXT, READY_AGAIN_TEXT"
  - "app/web/components/users/session-actions.ts: sessionActionsState, тексты подтверждений, успехов и ошибок действий администратора"
  - "Страница логина: тексты по коду ответа, состояние 429 с обратным отсчётом"
  - "Блок «Сеансы и вход» в EditUserDialog с двумя AlertDialog"
  - "Описание к успеху смены пароля в профиле"
affects: [04-14]

actuals:
  tokens: 14000
  tasks: 2
  commits: 0
plan_head_before: 3c7ca9d998ad01caf5703cd323d933cf29df8ac4
plan_head_after: 3c7ca9d998ad01caf5703cd323d933cf29df8ac4

tech-stack:
  added: []
  patterns:
    - "Состояние ошибки страницы логина — размеченное объединение none | text | wait | later | ready; таймер живёт в эффекте по until и очищается при размонтировании"
    - "Подтверждения действий администратора — управляемые AlertDialog без Trigger: onClick с preventDefault держит диалог до ответа, onCloseAutoFocus возвращает фокус на кнопку блока"

key-files:
  created:
    - app/web/lib/session/wait-format.ts
    - app/web/lib/session/login-errors.ts
    - app/web/lib/session/login-errors.test.ts
    - app/web/components/users/session-actions.ts
    - app/web/components/users/session-actions.test.ts
  modified:
    - app/web/app/(internal)/login/LoginPageClient.tsx
    - app/web/components/users/dialogs/EditUserDialog.tsx
    - app/web/app/(internal)/(protected)/profile/ProfileClient.tsx
    - e2e/tests/session.spec.ts

key-decisions:
  - "Решение исполнителя (автономно): в e2e 429 шесть неудачных входов делает сама страница /login через fetch в page.evaluate, а не request.post. Троттлинг считает пару (логин, IP), а Express с trust proxy берёт IP из X-Forwarded-For; запросы из браузера дают тот же IP, что и клик Войти, без допущений о клиенте APIRequestContext"
  - "Решение исполнителя (автономно): в кнопках блока «Сеансы и вход» выключение учитывает и отправку формы (submitting, deleting), а не только запрос действия"
  - "Решение исполнителя (автономно): break-all в описании AlertDialog применяется только к «{login}» (обёртка span), а не ко всему абзацу, чтобы не рвать русские слова"
  - "Решение исполнителя (автономно): Esc и клик вне AlertDialog не закрывают его, пока идёт запрос; кнопка Отмена в это время выключена"

requirements-completed: []

duration: 35min
completed: 2026-10-04
---

# Phase 04 Plan 13: страница логина с ответом 429 и блок «Сеансы и вход» в карточке пользователя

**Страница логина выбирает текст по коду ответа и показывает 429 с обратным отсчётом по Retry-After: кнопка Войти выключена, ввод пароля строку не снимает, смена логина снимает. В карточке пользователя появился блок «Сеансы и вход» с подтверждениями «Завершить все сеансы» и «Снять ограничение входа». Успех смены пароля получил описание «На других устройствах нужно войти заново.».**

Коммит: не выполнялся (правило пользователя), изменения в рабочем дереве.

## Performance

- **Duration:** ~35 мин
- **Completed:** 2026-10-04
- **Tasks:** 2/2
- **Files:** 5 созданы, 4 изменены

## Accomplishments

- `formatWait`: меньше 60 — `{s} с`, иначе `{m} мин` и при остатке ` {s} с`. `parseRetryAfter` принимает только строку из цифр со значением > 0; `0`, пусто, `null`, `-5`, `1.5`, HTTP-дата, `30s`, ` 30` дают `null`. `loginErrorText`: 400, 401, 403 — свои тексты, остальное — `Не удалось войти. Попробуйте ещё раз.`.
- `LoginPageClient.tsx`: тело ответа с ошибкой больше не читается, английские строки сервера на странице не появляются. При 429 с корректным `Retry-After` состояние `wait` с `until = Date.now() + N * 1000`, интервал раз в секунду пересчитывает остаток с округлением вверх, по нулю — `ready` (`sr-only role="status"` «Можно снова войти.»). При 429 без корректного заголовка — `…Попробуйте позже.`, кнопка активна. Строка ожидания: видимый `aria-hidden` span с тикающим временем и `sr-only role="alert"` с начальным. Прочие ошибки — `<p role="alert" className="text-sm text-destructive">`. Ввод пароля при `wait` ничего не меняет. Ввод логина снимает `wait`, если нормализованное значение отличается от логина, на котором пришёл 429. Кнопка показа пароля подписана «Показать пароль» / «Скрыть пароль». При отправке в кнопке `LoaderComponent className="mr-2 size-4"` и `sr-only` «Вход…». Плейсхолдеры, `CardTitle`, вёрстка не менялись. localStorage и cookie не используются. Число оставшихся попыток не показывается.
- `session-actions.ts`: `sessionActionsState({ meId, user, canEdit, pending })` → `{ visible, revokeDisabled, revokeHint, clearDisabled }`, тексты UI-SPEC дословно.
- `EditUserDialog.tsx`: блок по разметке UI-SPEC после строки «Персональные права пользователя» и перед строкой ошибки. Рендерится только при `can('users','edit')`. Иконки `LogOut` и `LockKeyholeOpen` с `aria-hidden`, кнопки `variant="outline"` и `w-full mob:w-auto`. «Завершить все сеансы» обёрнута в `<span>` с `Tooltip`; на своём аккаунте выключена с подсказкой. При пустом `user.login` выключена «Снять ограничение входа». Два управляемых `AlertDialog`: заголовок `font-medium`, `«{login}»` в описании с `break-all`, «Отмена», действие «Завершить сеансы» (destructive-классы из `DeleteGroupDialog`) или «Снять ограничение». Пока идёт запрос, на кнопке «Завершаем…» / «Снимаем…», а кнопки блока, подтверждения, «Сохранить» и «Удалить» выключены. Запросы идут через `apiFetch`: `POST …/sessions/revoke`, `DELETE …/login-throttle`. Успех и ошибка показываются `toast.success` / `toast.error` с сохранённым `user.login`. На 403 — текст про права, `AuthExpiredError` обходится без тоста. После закрытия фокус возвращается на кнопку блока. Вложенный `Dialog` удаления не менялся.
- `ProfileClient.tsx`: `toast.success('Пароль успешно изменен', { description: 'На других устройствах нужно войти заново.' })`. Остальной файл не трогался, аватар по-прежнему по `can('users','edit')`.
- `e2e/tests/session.spec.ts`: два теста с тегом `@session`:
  - `login page shows the 429 wait and re-enables on login change`;
  - `admin sees session actions in the user card`.

## CodeGraph

`codegraph impact LoginPage`: 21 символ. Это `app/(internal)/login/page.tsx` (`Page`, маршрут `/login`) и e2e: `fixtures/exam.ts` (`takeTest`, `answerQuestion`, `adminReviewSections`), `tests/auth.spec.ts` (`logIn`, `logOut`, `openUserMenu`, `expectRedirectToLogin`), `tests/authoring.spec.ts`. Эти e2e опираются на плейсхолдеры, кнопку «Войти» и переход после входа, а это не менялось.

`codegraph impact EditUserDialog`: 9 символов. Это `UsersTable` → `admin/users/UsersClient.tsx` и `UserProfileAssignmentsPage` → `profile/[id]/page.tsx`. Пропсы диалога не менялись, `UsersTable.tsx`, `UserRowItem.tsx` и `UserProfileAssignmentsPage.tsx` не трогались.

`codegraph affected` по изменённым файлам дал 7 тестовых файлов: `session-actions.test.ts`, `login-errors.test.ts`, `e2e/fixtures/exam.ts`, `e2e/tests/auth.spec.ts`, `authoring.spec.ts`, `review.spec.ts`, `session.spec.ts`. Все прогнаны в `yarn verify` и полном `yarn e2e`.

## Task Commits

1. **Task 1 (tracer): страница логина, тексты по коду и 429 с обратным отсчётом.** Коммит: не выполнялся (правило пользователя).
   - Tracer gate (auto) пройден. `vitest run lib/session/login-errors.test.ts`: 25 passed. `yarn e2e --grep "@session|@flow1"`: 26 passed. Статическая проверка напечатала `login page per ui-spec`. Tracer verified end-to-end — expanding.
2. **Task 2 (tdd): блок «Сеансы и вход», описание к смене пароля, полный прогон.** Коммит: не выполнялся.

## TDD

- Task 1: `login-errors.test.ts` написан до модулей. RED: `Test Files 1 failed`, `no tests`, потому что модулей `login-errors` и `wait-format` не было. GREEN: 25 passed.
- Task 2: `session-actions.test.ts` написан до модуля. RED: `Cannot find module './session-actions'`, `Test Files 1 failed`. GREEN: 13 passed.
- RED/GREEN-коммиты не делались по правилу пользователя. Порядок «сначала красный тест» соблюдён.

## Проверки

| Проверка | Итог |
|---|---|
| `yarn workspace @bio-exam/web vitest run lib/session/login-errors.test.ts` | 1 file, 25 passed |
| `yarn e2e --grep "@session\|@flow1"` (Task 1) | exit 0, 26 passed |
| статическая проверка `LoginPageClient.tsx` | `login page per ui-spec` |
| `yarn workspace @bio-exam/web vitest run components/users/session-actions.test.ts` | 1 file, 13 passed |
| `yarn e2e --grep "admin sees session actions"` | exit 0, 6 passed (setup и два проекта) |
| `rg` строк приёмки в `EditUserDialog.tsx` и `session-actions.ts` | все пять строк найдены |
| `yarn verify` | `yarn verify: OK`: web 18 files, server 21, exam-core 11, rbac 1, все шаги passed |
| `yarn e2e` (полный) | exit 0, `126 passed (54.4s)`. ✘ только у `D1 — fixed in Phase 5 (SCORE-03) … @known-defect` в двух проектах (ожидаемый `test.fail`) |
| прод-сборка web по `buildCommand` с плейсхолдерами env | exit 0, `✓ Compiled successfully`, без `Invalid server env` |
| `yarn workspace @bio-exam/web lint` по изменённым файлам | новых предупреждений нет. В `EditUserDialog.tsx` и `ProfileClient.tsx` остались прежние `set-state-in-effect` (эффекты существовали до плана) |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Двойной тост в e2e карточки пользователя**
- **Found during:** Task 2, первый прогон e2e
- **Issue:** `getByText('Ограничение входа для «…» снято')` нашёл 2 элемента. В защищённой части смонтированы два `Toaster`: `app/web/app/layout.tsx` и `components/AppLayout/AppLayout.tsx`. Поэтому каждый тост приложения показывается дважды. Дефект существовал до плана.
- **Fix:** в тесте проверяется, что `DELETE …/login-throttle` ушёл ровно один раз, а тост берётся через `.first()`. Код `Toaster` не менялся, файлы вне плана. Дефект записан в `deferred-items.md`.
- **Files modified:** e2e/tests/session.spec.ts

**2. Способ создания неудач в e2e 429.** План описывает `request.post`. Неудачи делаются `fetch` со страницы `/login` (см. key-decisions). Это решение исполнителя, а не исправление ошибки.

Прочее выполнено по плану. Решения исполнителя перечислены в key-decisions.

## Threat Flags

Нет. Новых маршрутов нет. Блок администратора виден только при `users.edit`, решение принимает Express. `parseRetryAfter` строгий. Тексты не раскрывают, существует ли логин.

## Known Stubs

Нет.

## Deferred human verification

Не выполнено, ждёт пользователя. Исполнитель ничего не одобрял.

1. UI-SPEC, пункты [авто], которые требуют подтверждения:
   - высота кнопок 36px, как во всём приложении;
   - web читает только заголовок `Retry-After`, поля в теле нет;
   - тексты выбираются по коду ответа, `ERROR_MESSAGES` на сервере не переводятся;
   - для новых подтверждений используется `AlertDialog`;
   - состояние ограничения входа не показывается;
   - «Завершить все сеансы» выключена на своём аккаунте;
   - блок стоит в карточке пользователя, а не на странице `/profile/<логин>`;
   - успех смены пароля получил описание.
2. Backstop на ширине 375px:
   - открыть подтверждение для пользователя с логином максимальной длины (32 символа по `LOGIN_PATTERN`). `«{login}»` должен переноситься, у диалога не должно быть горизонтального скролла, тост тоже переносится;
   - в блоке «Сеансы и вход» каждая кнопка стоит на своей строке во всю ширину, подписи не обрезаны.
3. Коммит файлов плана делает пользователь или оркестратор.

## Файлы к коммиту

- app/web/lib/session/wait-format.ts
- app/web/lib/session/login-errors.ts
- app/web/lib/session/login-errors.test.ts
- app/web/app/(internal)/login/LoginPageClient.tsx
- app/web/components/users/session-actions.ts
- app/web/components/users/session-actions.test.ts
- app/web/components/users/dialogs/EditUserDialog.tsx
- app/web/app/(internal)/(protected)/profile/ProfileClient.tsx
- e2e/tests/session.spec.ts
- .planning/phases/04-authentication-and-web-session/04-13-SUMMARY.md, deferred-items.md, .planning/STATE.md, .planning/ROADMAP.md (gsd-tools)

`UserProfileAssignmentsPage.tsx` и `DashboardClient.tsx` не трогались.

## Next Phase Readiness

- 04-14: интерфейсы троттлинга и отзыва сеансов готовы. В чек-лист выкатки входит визуальная проверка на 375px из Deferred.

## Self-Check: PASSED

Все 5 созданных файлов на месте, 4 изменённых видны в `git status`. Вне allow-list плана изменений нет (кроме `.planning`). Коммиты не ожидаются по правилу пользователя, поэтому `commits: 0` при изменениях в рабочем дереве задуман правилами запуска.
