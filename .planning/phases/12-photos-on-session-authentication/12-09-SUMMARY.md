---
phase: 12-photos-on-session-authentication
plan: 09
subsystem: web
tags: [web, answer-photos, test-runner, e2e, a11y]

requires:
  - phase: 12-photos-on-session-authentication
    provides: "12-06: createPhotoUploadQueue, prepareForUpload, answer-photos-api.ts, uploadWindowRefusalText"
  - phase: 12-photos-on-session-authentication
    provides: "12-07: PUT/DELETE/GET фото под сессией; 12-08: раздача GET /api/answer-photos/:photoId/:variant"
provides:
  - "AttemptSnapshot.sessionId"
  - "PhotoBlock: блок фото в карточке открытого вопроса с sources file/camera/gallery"
  - "useAnswerPhotoSession (реестр очередей на сессию в TestRunner) и useAnswerPhotos (подписка блока)"
  - "Сид e2e: photo-student-desktop/mobile, тесты answer-photos-desktop/mobile; спек e2e/tests/answer-photos.spec.ts"
affects: [12-10, 13, 14]

actuals:
  tokens: 7100
  tasks: 3
  commits: "не закоммичено"

tech-stack:
  added: []
  patterns:
    - "Очереди фото принадлежат сессии: реестр в TestRunner, ключ questionId; блок только рисует снимок"

key-files:
  created:
    - app/web/components/tests/answer-photos/PhotoBlock.tsx
    - app/web/components/tests/answer-photos/use-answer-photos.ts
    - e2e/tests/answer-photos.spec.ts
  modified:
    - app/web/components/tests/attempt-lifecycle/lifecycle.ts
    - app/web/components/tests/TestRunner.tsx
    - e2e/fixtures/seed.json

key-decisions:
  - "PhotoBlock получает photos: AnswerPhotoQueueHandle (target внутри), а не target: так требует шаг 4 Task 1 и D1/C1 — очередь живёт в TestRunner"
  - "disabled блока = interactionDisabled && !deadlinePassed (12-UI-SPEC 12-09 №1): после дедлайна блок активен, окно решает сервер"
  - "Реестр очередей освобождается отложенно (setTimeout 0, отмена при повторном retain): StrictMode в dev не убивает очереди двойным эффектом"
  - "Список с сервера грузится один раз на очередь (флаг listed в handle); пока не пришёл — «— из 5», Skeleton, кнопки выбора disabled"
  - "У retrying удаления нет (таблица состояний 12-UI-SPEC), хотя очередь его допускает"

requirements-completed: [PHOTO-01, PHOTO-02, PHOTO-06]

coverage:
  - id: D1
    description: "Ученик прикрепляет фото к открытому вопросу, видит миниатюру и «N из 5», фото переживает перезагрузку"
    requirement: PHOTO-01
    verification:
      - kind: e2e
        ref: "e2e/tests/answer-photos.spec.ts (desktop и mobile)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Удаление, три автоповтора и «Повторить» тем же photoId, отказ сервера текстом, смена вопроса во время загрузки"
    requirement: PHOTO-02
    verification:
      - kind: e2e
        ref: "e2e/tests/answer-photos.spec.ts"
        status: pass
    human_judgment: false
  - id: D3
    description: "Семь файлов: пять готовых, «Не добавлено фото: 2», выбор aria-disabled, контраст и 375 px"
    requirement: PHOTO-06
    verification:
      - kind: e2e
        ref: "e2e/tests/answer-photos.spec.ts"
        status: pass
    human_judgment: false

duration: 13min
completed: 2026-10-16
status: complete
---

# Phase 12 Plan 09: Блок фото в раннере Summary

**`PhotoBlock` в карточке открытого вопроса: «Добавить фото» (`accept="image/*" multiple`), список строк с миниатюрой 64 px, «N из 5» из ответа сервера, удаление, «Повторить», отказы текстом сервера, сводка лишних фото; очереди живут в `TestRunner` на сессию и не обрываются при «Далее»; e2e на desktop и mobile**

## Performance

- **Duration:** около 13 мин
- **Started:** 2026-10-16T15:59:00Z
- **Completed:** 2026-10-16T16:12:00Z
- **Tasks:** 3 из 3
- **Files modified:** 6 (3 новых, 3 изменённых)

## Accomplishments

- `lifecycle.ts`: `AttemptSnapshot.sessionId`, в сборке `sessionId: session?.sessionId ?? null`. Фикстуры и ожидания тестов жизненного цикла правки не потребовали (полных снимков тесты не сравнивают).
- `use-answer-photos.ts`: `useAnswerPhotoSession({ testId, sessionId })` — реестр `questionId → очередь` (`createPhotoUploadQueue` с `uploadAnswerPhoto`, `deleteAnswerPhoto`, `prepareForUpload`, `crypto.randomUUID()`), создаётся лениво, освобождается при смене сессии и размонтировании `TestRunner`; `useAnswerPhotos(handle)` — `useSyncExternalStore`, список при первом показе блока для очереди → `seed`, `listing`, `loadFailure: RequestFailure | null`, `reload`.
- `PhotoBlock.tsx` по 12-UI-SPEC «Поверхность 1» и расхождениям 12-09: `div role="group"` на `bg-card`, подпись `p tabIndex={-1}`, счётчик — один `span` `aria-live="polite" aria-atomic="true"` с текстом `{count} из 5` (`— из 5` пока список грузится), подсказки «До 5 фото в форматах JPEG, PNG или WebP.» / «Чтобы добавить другое фото, удалите одно из прикреплённых.», кнопки выбора по `sources` (`file` — `multiple`, `camera` — `capture="environment"`, `gallery` — без `capture`), на лимите `aria-disabled="true"`, список строк со статусами «Загрузка…», «Повторная попытка…», текстом `message` (`role="alert"`, `text-destructive`), кнопками «Повторить» / «Удалить» / «Убрать» с `aria-label` по номеру, сводка лишних фото одной строкой («Не добавлено фото: {k}» при k ≥ 2), `LoadErrorAlert` с `new RequestError(loadFailure)`, фокус после удаления на кнопку соседней строки или первую кнопку выбора, битая миниатюра → `ImageOff`.
- `TestRunner.tsx`: `useAnswerPhotoSession` выше ветки одного вопроса; `PhotoBlock` после `QuestionInput` при `!questionResult`, `questionUiTemplate === 'open'` и `snapshot.sessionId`; `disabled={interactionDisabled && !deadlinePassed}`.
- Сид: аккаунты `photo-student-desktop`/`photo-student-mobile`, тесты `answer-photos-desktop`/`answer-photos-mobile` (тема `e2e-deadline`, без лимита, `ap-choice` single_choice и `ap-open` open «Сфотографируйте решение задачи в тетради»).
- `answer-photos.spec.ts` (serial, один контекст ученика на группу): tracer с перезагрузкой; удаление → «0 из 5», фокус на «Добавить фото», Tab и Enter → `filechooser`; `note.jpg` → «Поддерживаются фото в форматах JPEG, PNG и WebP» и «Убрать»; сбой сети через `page.route` с `abort` → 4 PUT одним `photoId`, «Повторить загрузку фото 1» → тот же `photoId`, готово; задержанный на 1,5 с PUT, «Назад» и «Далее» → «Фото 1» и «1 из 5», после перезагрузки на месте; 7 файлов → 5 миниатюр, «5 из 5», `ANSWER_PHOTO_LIMIT_MESSAGE`, «Не добавлено фото: 2», `aria-disabled="true"`; `lowContrastTexts` пуст на `refused`, `failed` и на полном списке, `horizontalOverflow` пуст на 375 px.

## Task Commits

Не закоммичено (коммитит ведущая сессия).

1. **Task 1: tracer — sessionId, PhotoBlock, хук, TestRunner, сид, спек** — не закоммичено
2. **Task 2: состояния блока и сценарии e2e** — не закоммичено
3. **Task 3: существующие спеки с open и ворота** — не закоммичено

## Проверки

- `yarn e2e tests/answer-photos.spec.ts`: первый прогон — 10 из 12 зелёные, 2 упали на `getByRole('button', { name: 'Назад' })` (вторая кнопка «Назад» с `aria-label` в шапке страницы); локаторы «Назад»/«Далее» ограничены секцией вопроса, второй прогон 30 passed (12 тестов спека + setup).
- `yarn e2e tests/review.spec.ts tests/attempt-review-pending.spec.ts tests/deadline-finalised.spec.ts tests/timed-attempt.spec.ts tests/answer-photos.spec.ts`: 58 passed. Существующие спеки не правились: появившийся блок их локаторы не задел.
- `yarn workspace @bio-exam/web typecheck`: exit 0.
- `yarn workspace @bio-exam/web lint`: ошибок нет; в файлах плана одно предупреждение `next(no-img-element)` в `PhotoBlock.tsx` (допустимо по плану); `TestRunner.tsx:110 set-state-in-effect` было до плана.
- `yarn verify: OK` с первого прогона: web 1690 тестов (103 файла), server 2087 (107 файлов), script-tests 236; остальные шаги passed.
- Критерии приёмки: `sessionId: session?.sessionId` в `lifecycle.ts`; `PhotoBlock` в `TestRunner.tsx` — 2; `accept="image/*"`, `capture="environment"`, `bg-card`, `role="group"`, `aria-atomic`, «Повторить загрузку фото», «Убрать фото», `new RequestError(`, «Сделать фото», «Выбрать из галереи», `ANSWER_PHOTO_LIMIT_MESSAGE`, «Чтобы добавить другое фото, удалите одно из прикреплённых.» в `PhotoBlock.tsx`; `photo-student-` в сиде — 4; в спеке «0 из 5», «5 из 5», текст типа файла, `lowContrastTexts`, `horizontalOverflow`, `aria-disabled`, `filechooser`, «Не добавлено фото: 2», сценарий смены вопроса.

`codegraph impact createAttemptLifecycle`: 22 символа — `use-attempt-lifecycle.ts` (`createBrowserAttemptLifecycle`, `useAttemptLifecycle`), `testing.ts` (`setupLifecycle`), `lifecycle-outcomes.test.ts`, `lifecycle-restore.test.ts`, `lifecycle-submit.test.ts` и др.; все в наборе web-тестов `yarn verify`.

`codegraph affected` по `lifecycle.ts`, `TestRunner.tsx`, `PhotoBlock.tsx`, `use-answer-photos.ts`:

```
Affected test files (4):

  app/web/components/tests/TestRunner.tsx
  app/web/components/tests/answer-photos/PhotoBlock.tsx
  app/web/components/tests/answer-photos/use-answer-photos.ts
  app/web/components/tests/attempt-lifecycle/lifecycle.ts
```

В worktree нет `.codegraph/`, CLI отвечает по индексу основного checkout и повторяет вход; фактическое покрытие — e2e выше и web-тесты в `yarn verify`.

## Снимки экрана

Из прогона Playwright (тест «семь фото разом»), скопированы из `test-results/` (каталог перезаписывается следующим прогоном):

- desktop: `/private/tmp/claude-501/-Users-kdvornichenko-bio-exam/08198ba1-f338-437e-94f3-da2b9638176f/scratchpad/12-09-photo-block-desktop.png`
- 375 px (mobile): `/private/tmp/claude-501/-Users-kdvornichenko-bio-exam/08198ba1-f338-437e-94f3-da2b9638176f/scratchpad/12-09-photo-block-375.png`

Просмотрены: пять строк с миниатюрами и «Удалить», сводка лишних фото с текстом лимита и «Не добавлено фото: 2», «Добавить фото» приглушена, «5 из 5»; на 375 px кнопка выбора на всю ширину, «Убрать» сводки уходит на вторую строку, переполнения нет.

## Files Created/Modified

- `app/web/components/tests/attempt-lifecycle/lifecycle.ts` — `sessionId` в снимке.
- `app/web/components/tests/answer-photos/use-answer-photos.ts` — реестр очередей и хук блока.
- `app/web/components/tests/answer-photos/PhotoBlock.tsx` — блок фото.
- `app/web/components/tests/TestRunner.tsx` — реестр и блок в карточке вопроса.
- `e2e/fixtures/seed.json` — аккаунты и тесты фото обоих проектов.
- `e2e/tests/answer-photos.spec.ts` — спек.

## Deviations from Plan

1. **Пропсы `PhotoBlock`:** `{ photos: AnswerPhotoQueueHandle; disabled; sources? }` вместо `{ target; disabled; sources? }` из `<interfaces>`: шаг 4 Task 1 отдаёт блоку `photosFor(question.id)`, очередь принадлежит сессии (D1/C1); `target` лежит в handle.
2. **`useAnswerPhotos`:** возвращает `loadFailure` (12-UI-SPEC 12-09 №6) вместо `loadError` и дополнительно `listing` (`loading`/`ready`/`failed`) для «— из 5», `Skeleton` и неактивных кнопок.
3. **[Rule 1] Отложенное освобождение реестра:** `useEffect` с `retain`/`release` и `setTimeout(0)`; без этого StrictMode в dev (монтирование → очистка → монтирование) уничтожил бы очереди сессии сразу после создания.
4. **e2e:** вместо «шесть JPEG разом» — семь (12-UI-SPEC №11: проверяет и сводку «Не добавлено фото: 2»); группа serial работает в одном контексте ученика из `beforeAll`, чтобы сессия и фото переходили между тестами; локаторы «Назад»/«Далее» ограничены `section[id^="question-"]` — в шапке страницы есть вторая кнопка «Назад» (`aria-label`).
5. **Желательное №9 UI-SPEC** выполнено: битая миниатюра → `ImageOff` с `aria-label` «Фото {n}».
6. **Существующие спеки** (`review`, `attempt-review-pending`, `deadline-finalised`, `timed-attempt`) не менялись — зелёные с блоком.

## Известный остаток

- «Завершить» при идущей загрузке не ждёт очередь фото (12-UI-SPEC 12-09 №12, UI Considerations unresolved); решение — фаза 14.

## Не проверено

- Живая проверка на dev-сервере (делает ведущая сессия); проверка в браузере — через e2e-прогон Playwright (production-сборка) и снимки.
- Уменьшение реального снимка с телефона, EXIF-поворот, HEIC в Safari — шаги пользователя фазы.
- Отказ окна (`UPLOAD_WINDOW_CLOSED`) в UI e2e не воспроизводился: тест без лимита времени; тексты покрыты юнитами 12-06.
- Типы `e2e/tests/answer-photos.spec.ts` не проверялись: у `e2e/` нет tsconfig и шага typecheck ни в `yarn verify`, ни в CI; Playwright только транспилирует.

## Команды для ведущей сессии

Нет: план не требует записей через gsd-tools.

## Заметки для 12-10 и фазы 13

- Камера и галерея: `<PhotoBlock photos={...} disabled={...} sources={['camera', 'gallery']} />` — компонент готов.
- `AttemptSnapshot.sessionId` доступен для других потребителей.
- Тестовые данные фото: аккаунты `photo-student-*`, тест `answer-photos-*`; спек оставляет 0 фото в конце.

## Предлагаемое сообщение коммита

`feat: Блок фото к ответу в раннере для открытого вопроса: выбор, миниатюры и «N из 5», удаление, «Повторить», отказы текстом сервера, лишние фото одной строкой; очереди фото принадлежат сессии и не обрываются при смене вопроса; e2e answer-photos на desktop и mobile`

---
*Phase: 12-photos-on-session-authentication*
*Completed: 2026-10-16*

## Self-Check: PASSED

- FOUND: app/web/components/tests/answer-photos/PhotoBlock.tsx
- FOUND: app/web/components/tests/answer-photos/use-answer-photos.ts
- FOUND: e2e/tests/answer-photos.spec.ts
- Коммиты: не закоммичено (по правилу)
