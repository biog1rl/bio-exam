# Architecture Patterns: открытые задания с фото и ручной проверкой (v3.0)

**Домен:** встраивание открытых вопросов, фото-ответов, QR-загрузки, ручной проверки и журнала уведомлений в действующую платформу bio-exam
**Исследовано:** 2026-10-06
**Общая уверенность:** HIGH по точкам интеграции (весь код читался напрямую, номера строк на коммите `1962edd`), MEDIUM по самим проектным решениям (это рекомендации, их нужно подтвердить в требованиях), LOW по оценкам объёма фото на диске.

Согласовано с `.planning/research/FEATURES.md` и `STACK.md` и не повторяет их. Отличия от STACK названы явно в разделах 3.3 и 3.5, причины там же.

## 0. Главное

1. **Шаблон `open` встаёт в `exam-core` как шестой шаблон, но ряби больше, чем «ещё один адаптер»** (раздел 3.1): новая метрика `manual`, значение `none` у `KeyShape`, статус вопроса `pending`, строка в `question_types`, правка `scoreSubmission`. Факт открытого вопроса пишется в тот же `results_version = 2` (аддитивно), версия не повышается.
2. **Неизменяемость сохраняется так:** `results`, `answers` и четыре существующих столбца оценки остаются фактами автопроверки на момент сдачи и больше не пишутся. Проверки живут в отдельной append-only таблице. Для списков, графиков и агрегатов SQL добавляется **пересчитываемая проекция** на `test_attempts` (`review_status`, `final_*`), которую пишет только транзакция проверки. Это компромисс, он назван в разделе 3.1.
3. **У ответа на открытый вопрос есть собственная сущность «открытый ответ» (`open_answers`)** с ключом `(session_id, question_id)`, а не `(attempt_id, question_id)`: попытка появляется только при сдаче, а QR и фото нужны во время прохождения (раздел 3.2). `attempt_id` проставляется при сдаче.
4. **Принудительная сдача по таймеру — самое трудное изменение**, и оно задевает клиентский модуль жизненного цикла, а не только сервер (раздел 3.2). Делается лениво при любом обращении плюс фоновым проходом. Выполняется раньше QR, потому что у окна загрузки после таймера без неё нет опоры.
5. **Токен телефонной ссылки:** непрозрачный токен, в БД `sha256`, область `(session, question)`, срок и отзыв считаются по текущему состоянию БД на каждом запросе. Отличие от STACK: допускается несколько активных ссылок на вопрос, иначе перезагрузка страницы на компьютере убивает открытую страницу на телефоне (раздел 3.3).
6. **Фото-пространство `answers/` в хранилище не попадает в `isServableImageKey`**: общий прокси `/api/docs/assets/proxy` проверяет только сессию (`routes/docs/assets.ts:72`) и отдал бы фото любому вошедшему (раздел 3.4).
7. **Живое обновление в v3.0 — опрос с `revision`**, SSE откладывается до v4.0; шов под шину событий закладывается как пустой `publishAfterCommit` (раздел 3.5).
8. **Журнал уведомлений** — общий модуль `services/notifications` с функцией `recordNotification(tx, …)`, вызываемой внутри транзакции проверки (раздел 3.6).
9. **Очередь проверки — отдельный маршрут `/api/reviews/queue`**, фильтр `status` существующего списка попыток («пользователь активен») не трогается; в список попыток добавляется параметр `review` (раздел 3.7).
10. **Тип `open` в `question_types` засеивается неактивным** (`is_active = false`) и включается последним шагом, когда проверка уже работает: готового флага функций в проекте нет, этот переключатель не требует нового механизма.

## 1. Рекомендуемая архитектура

```
Телефон (без входа)                      Компьютер ученика (cookie-сессия)
/photo-upload/<token>  ──X-Upload-Token──▶ /api/upload/*   (uploadTokenRequired, НЕ sessionRequired)
                                           /api/tests/public/sessions/:sid/questions/:qid/*  (sessionRequired)
                                                        │
                       ┌────────────────────────────────┴───────────────────────────────┐
                       ▼                                                                ▼
          services/upload-links (НОВЫЙ)                                   services/open-answers (НОВЫЙ)
          выпуск, хеш, проверка по БД, отзыв                              слоты, версии, фото, проверки,
                       │                                                  автомат состояний, очередь,
                       │                                                  проекция результата в test_attempts
                       ▼                                                          │
          services/image-pipeline (НОВЫЙ)  ───▶ services/storage (ИЗМЕНЁН: +answers)
          file-type → sharp → full+thumb                                          │
                                                                                  ├──▶ services/notifications (НОВЫЙ)
 services/attempt-sessions (ИЗМЕНЁН) ──── финализация по дедлайну ───────────────┤     журнал, inbox
 services/scored-attempt   (ИЗМЕНЁН) ──── факты open, вид с проверкой ───────────┘
 services/access-policy    (ИЗМЕНЁН слегка) ── canReviewAttempt, testScope, groupScope
 services/background-jobs  (НОВЫЙ, запуск из index.ts) ── финализация, окна, сироты, retention
                       │
 packages/exam-core (ИЗМЕНЁН) ── шаблон open, computeAttemptOutcome, схемы вида и проверки
```

Принципы (не пересматриваются, ADR-0001...0005):

- Доступ решает Express по текущему состоянию БД (ADR-0001). Телефонная ссылка — единственное исключение из «cookie-сессии», и она тоже проверяется по текущей БД.
- Всё, что пересекает HTTP между web и server и относится к экзамену (форма ответа, факт открытого вопроса, вид попытки с проверкой, формула итога), объявляется в `packages/exam-core` (ADR-0002).
- Изменение модулей `scored-attempt`, `attempt-sessions`, `storage`, `access-policy`, клиентского `attempt-lifecycle` начинается с характеризационных тестов через интерфейс модуля (ADR-0003).
- Делим по понятиям (ADR-0005): «открытый ответ», «ссылка-способность», «журнал уведомлений», «фоновые задачи», «обработка изображений» — пять новых глубоких модулей, а не новые обработчики в `routes/tests/public.ts`.

### Границы компонентов

| Компонент | Ответственность | Общается с |
|-----------|-----------------|------------|
| `packages/exam-core` (ИЗМЕНЁН) | Шаблон `open`, форма ответа, `computeAttemptOutcome`, схемы факта, вида и проверки | server, web |
| `services/open-answers` (НОВЫЙ) | Слот ответа `(session, question)`, версии, фото-членство, проверки, автомат состояний, очередь, запись проекции в `test_attempts` | storage, image-pipeline, notifications, scored-attempt, access-policy |
| `services/upload-links` (НОВЫЙ) | Выпуск токена, `sha256`, проверка по БД, отзыв, middleware `uploadTokenRequired` | open-answers |
| `services/image-pipeline` (НОВЫЙ) | `file-type` → `sharp` (`autoOrient`, ресайз, миниатюра) → буферы и метаданные; без знаний о БД. Переиспользуется чатами v4.0 | storage |
| `services/notifications` (НОВЫЙ) | Таблицы журнала, `recordNotification(tx, …)`, список, счётчик, отметки прочитанного | open-answers (производитель), позже чаты и push |
| `services/background-jobs` (НОВЫЙ) | Планировщик в процессе API: таймер, `pg_try_advisory_xact_lock`, реестр задач | attempt-sessions, open-answers |
| `services/attempt-sessions` (ИЗМЕНЁН) | Окно загрузки, заморозка черновика по дедлайну, `finalizeSessionByDeadline`, ленивая финализация | scored-attempt, open-answers |
| `services/scored-attempt` (ИЗМЕНЁН) | Факт `open`, чтение вида «факты + проверки», общий набор колонок результата | exam-core, open-answers |
| `services/storage` (ИЗМЕНЁН) | Пространство `answers` | image-pipeline, open-answers |
| `services/question-content` (ИЗМЕНЁН) | Третий файл вопроса `criteria.md` | storage |
| `services/access-policy` (почти без изменений) | `canReviewAttempt`, `testScope`, `groupScope` для очереди и проверки | open-answers |
| web `components/tests/attempt-lifecycle` (ИЗМЕНЁН) | Состояния после дедлайна для тестов с открытыми вопросами | API |
| web `/photo-upload/[token]` (НОВЫЙ) | Страница телефона без входа | `/api/upload/*` |

## 2. Точки интеграции: новое и изменяемое

### 2.1. Сервер: изменяемые места

| Файл:строка | Что там сейчас | Что меняется |
|-------------|----------------|--------------|
| `app/server/src/db/schema.ts:256-285` (`tests`) | `timeLimitMinutes` (:270), нет окна загрузки | `+ photo_upload_window_minutes` |
| `schema.ts:381-404` (`questions`) | `promptPath`, `explanationPath` (:393-394) | `+ criteria_path` (эталонный ответ и критерии, виден только проверяющему) |
| `schema.ts:477-520` (`testAttempts`) | четыре NOT NULL столбца оценки, `resultsVersion IN (1, 2)` (:506) | `+ review_status`, `final_*`, `graded_at`, `passing_score`, `submit_source`; CHECK-инвариант проекции |
| `schema.ts:523-551` (`testSessions`) | чёрновик, `closedAt`, `closeReason IN ('expired','superseded')` (:548) | `+ upload_closes_at` |
| `services/attempt-sessions/sessions.ts:49-51` | `sessionExpired(timeLimitMinutes)` = дедлайн + `ATTEMPT_GRACE_PERIOD_MINUTES` | выделяется `deadlineAt`; добавляется окно загрузки |
| `sessions.ts:77-119` (`startAttemptSession`), особенно :93-98 | ленивое закрытие просроченной сессии как `expired` при `/start` | для тестов с открытыми вопросами вместо закрытия вызывается финализация |
| `sessions.ts:121-151` (`saveSessionDraft`), :133 | `openSessionOf` не смотрит на время: черновик пишется и после дедлайна | для тестов с открытыми вопросами добавляется охранное условие «до дедлайна + grace» |
| `services/attempt-sessions/submit.ts:66-97` (`precheckSubmit`) | `pastDeadline` → `{ kind: 'expired' }` | для таких тестов `expired` превращается в финализацию, а не в 422 |
| `submit.ts:99-104` (`closeExpiredSession`) | закрывает сессию как `expired`, черновик теряется | для тестов с открытыми вопросами не вызывается |
| `submit.ts:106-189` (`submitAttempt`), вставка :143-161, обновление сессии :172-182 | один транзакционный путь сдачи | в ту же транзакцию: слоты, версия 1, `review_status`, `final_*`, `passing_score`, `upload_closes_at`; для источника `deadline` клиент `clientAttemptId` не передаёт, сервер подставляет `deadline:<sessionId>` |
| `app/server/src/routes/tests/public.ts:560-636` (submit) | :591-594 `expired` → `timeExpired(res)`; :596 `scoreSubmission`; :620 `submitAttempt` | проверка «открытый ответ не пуст»; ветка `expired` → финализация и 409 `ATTEMPT_ALREADY_SUBMITTED` с `attemptId`; факты и итог через `computeAttemptOutcome` |
| `public.ts:405-440` (`attempts/me`), `:447-495` (`chart-data`, строка :488 `a.scorePercentage ?? 0`) | читают `scorePercentage` и `passed` | читают проекцию; **строка :488 превратила бы «на проверке» в ноль**, обязательно фильтр `review_status <> 'pending'` |
| `public.ts:505` (`start`), `:519` (PATCH answers) | старт и черновик | старт считает `upload_closes_at`; PATCH отдаёт 404 после заморозки |
| `services/scored-attempt/facts.ts:66-69` | `type_not_configured`, если нет строки `question_types` | нужна строка `open`; ветка `open` пропускает ключ и вердикты; :139-142 формула итога заменяется общей `computeAttemptOutcome` |
| `scored-attempt/view.ts:23-85` (`buildAttemptView`, `discloseKey` :52-55) | вид строится из фактов | слой проверок; критерии открыты только админу и проверяющему |
| `scored-attempt/read.ts:27-31` (`parseResults`), :102-119 | чтение фактов версии 1 и 2 | читает проекцию и слой проверок |
| `packages/exam-core/src/registry.ts:3-10, 12-20, 22-28` | закрытые списки шаблонов и метрик | `+ open`, `+ manual`, `ALLOWED_MISTAKE_METRICS_BY_TEMPLATE.open = ['manual']`, `BUILTIN_QUESTION_TYPES` и `createDefaultScoringRuleForTemplate` с `correctPoints: 3` |
| `exam-core/src/adapters/types.ts:61, 69-80`; `adapters/index.ts:9-15` | `KeyShape`, `TemplateAdapter`, `TEMPLATE_ADAPTERS: Record<QuestionUiTemplate, …>` | `+ 'none'` в `KeyShape`; адаптер `open` |
| `exam-core/src/attempt-result.ts:83-92, 94-107, 139-147` | `questionStatus`, `ScoredQuestionFactSchema`, `AttemptViewSchema` | `+ 'pending'`, аддитивные поля факта, `reviewStatus` и блок открытых ответов в виде |
| `exam-core/src/scoring.ts:128-154` (`scoreQuestionFacts`) | всегда считает ошибки по метрике | ранний выход для `open` |
| `services/storage/keys.ts:3` | `STORAGE_NAMESPACES = ['images','topics','avatars']` | `+ 'answers'` |
| `keys.ts:75-82` (`isServableImageKey`) | белый список раздачи через общий прокси | **не меняется** (намеренно) |
| `routes/tests/admin/attempts.ts:20-23` | `studentAttemptsInScope` локален в файле | выносится в общий модуль и используется очередью |
| `admin/attempts.ts:43, :54` | `status` = `users.isActive` | **не трогается**; добавляется `review` |
| `admin/attempts.ts:81-90, 116-126, 173-183` | агрегаты `avg(score_percentage)`, `count(*) filter (where passed)` | читают проекцию, фильтр `review_status <> 'pending'` |
| `admin/attempts.ts:191-215, 254-328` | строки списка и деталь | `reviewStatus` в строке; деталь отдаёт слой проверок |
| `routes/users/index.ts:340-356` | попытки в профиле ученика | проекция |
| `services/search/database-search.ts:407-430` | `case when ta.passed then 'Сдано' else 'Не сдано'` | «на проверке» не может называться «Не сдано» |
| `services/question-content/remove.ts:179-184` | отказ удалять тест с попытками | не меняется; **добавляется чистка файлов `answers/` при удалении теста и пользователя** (раздел 3.4) |
| `services/question-content/write.ts:74,103`, `relocate.ts:73,178,257`, `remove.ts:73-89`, `reconcile.ts:104-189`, `asset-index.ts:167` и экспорт ZIP | знают файлы `prompt.md`, `explanation.md` | знают и `criteria.md` |
| `app/server/src/app.ts:86` (`sessionOptional()` глобально), `:93` | `req.authUser` заполняется для всех | middleware токена игнорирует `req.authUser`, регистрируется в `routes/index.ts:20-31` |
| `app/server/route-inventory.txt` + `routes/route-inventory.snapshot.test.ts` | снимок всех маршрутов | перегенерируется; новый класс защиты `uploadTokenRequired` |
| `app/server/src/index.ts:12-46` | `app.listen`, `gracefulShutdown`, :31 `pgPool.end()` | запуск и остановка планировщика до `pgPool.end()` |
| `app/web/proxy.ts:11-16` | `PUBLIC_PREFIXES = ['/invite']`, проверка `startsWith` | `+ '/photo-upload/'` (с косой чертой: префикс `/u` совпал бы с `/users…`) |
| `app/web/components/tests/attempt-lifecycle/lifecycle.ts:329-345, 483, 493-505, 647-672` | таймер, `resubmit(…, true)`, `applySubmitFailure`: `already-submitted` и `time-expired` очищают ключи и ставят `blocked` | для тестов с открытыми вопросами `already-submitted` ведёт к виду попытки |
| `app/web/components/tests/attempt-submit-flow.ts:35-38, 75` | тексты «Время вышло, ответы не засчитаны» | другой текст и другое состояние |
| Читатели процента и `passed` в web | `lib/progress/attempt-chart.ts:14,107`, `lib/progress/my-attempts.ts:25-26`, `lib/tests/types.ts:66`, `dashboard/DashboardClient.tsx:77,221-233,271,341-521`, `components/tests/TestRunner.tsx:133-134,272-273,391`, `attempt-review/AttemptReviewHero.tsx:31-47`, `users/UserProfileAssignmentsPage.tsx:746-751`, `tests/[topicSlug]/[testSlug]/TestLandingPageClient.tsx:209`, `admin/attempts/AdminAttemptsClient.tsx:83-117`, `attempts-types.ts` | тип процента `number | null`, состояние «на проверке» |

### 2.2. Новое

| Что | Где |
|-----|-----|
| Адаптер `open`, `computeAttemptOutcome`, схемы | `packages/exam-core/src/adapters/open.ts`, `outcome.ts`, `open-answer.ts` |
| Модуль открытых ответов | `app/server/src/services/open-answers/` |
| Модуль ссылок-способностей и middleware | `app/server/src/services/upload-links/`, `app/server/src/middleware/auth/uploadToken.ts` |
| Обработка изображений | `app/server/src/services/image-pipeline/` |
| Журнал уведомлений | `app/server/src/services/notifications/` |
| Фоновые задачи | `app/server/src/services/background-jobs/`, скрипт `scripts/jobs-run.ts` |
| Маршруты | `routes/upload/` (`/api/upload/*`), `routes/reviews/` (`/api/reviews/*`), `routes/notifications.ts`, подмаршруты открытых ответов в `routes/tests/public.ts` или отдельный файл |
| Web | `app/(internal)/photo-upload/[token]/`, экран очереди и экран проверки, колокольчик, форма исправления, QR-панель |
| Миграции | 0026 и далее (список в разделе 4) |

### 2.3. Рекомендуемая структура новых каталогов

```
packages/exam-core/src/
├── adapters/open.ts            # адаптер шаблона open, isOpenAnswered
├── outcome.ts                  # computeAttemptOutcome (единая формула итога)
└── open-answer.ts              # схемы: ответ, версия, проверка, вид с проверкой
app/server/src/
├── services/open-answers/      # слоты, версии, фото-членство, проверки, очередь, materializeAttemptOutcome
├── services/upload-links/      # токен, loadUploadContext, отзыв
├── services/image-pipeline/    # processPhoto(buffer): file-type, sharp, миниатюра
├── services/notifications/     # recordNotification(tx, …), список, счётчик
├── services/background-jobs/   # планировщик и задачи
├── middleware/auth/uploadToken.ts
├── routes/upload/              # /api/upload/*
├── routes/reviews/             # /api/reviews/*
└── routes/notifications.ts
app/web/app/(internal)/photo-upload/[token]/
```

Структура следует ADR-0005: каталог на понятие, интерфейс модуля узкий, маршруты тонкие.

## 3. Решения по восьми вопросам

### 3.1. Шаблон `open` и неизменяемость (вопрос 1)

**Шаблон в `exam-core`.** Нужно сделать все пять действий; иначе TypeScript не соберётся или семантика поплывёт:

1. `QUESTION_UI_TEMPLATES` (`registry.ts:3-10`) `+ 'open'`; `MISTAKE_METRICS` (`:12-20`) `+ 'manual'`; `ALLOWED_MISTAKE_METRICS_BY_TEMPLATE.open = ['manual']`. Иначе ломается `TEMPLATE_BY_METRIC` и `Record<QuestionUiTemplate, TemplateAdapter>` (`adapters/index.ts:9`).
2. Адаптер `open` реализует `TemplateAdapter` (`adapters/types.ts:69-80`): `answerSchema: z.string()` (текст; фото **не** часть `AnswerValue`, они лежат на сервере), `countMistakes` отдаёт `MISTAKES_UNSCORABLE`, `verdicts` не вызывается, `isAnswered` смотрит только на текст, а «непусто с учётом фото» считает отдельная функция `isOpenAnswered({ text, photoCount })`, `keyShape` — новое значение `'none'`.
3. `scoreQuestionFacts` (`scoring.ts:128-154`): ранний выход для `open` с `points = rule.correctPoints = 3`, `earnedPoints = 0`, `isCorrect = false`, `mistakes = null`, `key = null`, `verdicts = null`.
4. **`questionStatus` (`attempt-result.ts:87-92`) вернул бы `wrong` для такого факта.** Добавляется `'pending'` в `QuestionStatusSchema` (:83), статус становится зависимым от шаблона; правило «вес 0 → `ungraded`» остаётся.
5. **`scoreSubmission` (`facts.ts:66-69`) вернёт `type_not_configured`, если нет строки `question_types` с `uiTemplate = 'open'`.** Нужны запись в `BUILTIN_QUESTION_TYPES` и **миграция-посев** строки (`key = 'open'`, `isSystem = true`, `isActive = false` до включения, правило `{ formula: 'exact_match', mistakeMetric: 'manual', correctPoints: 3 }`). Переопределение правила для `open` через `testQuestionTypeOverrides` запрещается авторингом: максимум всегда 3 (решение пользователя: шкала 0–3).

Факт открытого вопроса остаётся в **`results_version = 2`**: схема `ScoredQuestionFactSchema` (`attempt-result.ts:94-107`) расширяется аддитивно (`template` и `metric` получают новые значения, добавляются необязательные `criteriaText` и `promptText`). Старые строки разбираются как раньше. Повышать версию до 3 не нужно. Оговорка: откат кода после появления первой попытки с `open` невозможен без потери чтения этих попыток (старый zod не знает шаблон), это допустимо.

**Эталон и критерии.** Новый файл вопроса `criteria.md` рядом с `explanation.md` (путь `criteria_path` в `questions`), редактируется тем же Lexical-редактором и тем же модулем `question-content`, поэтому картинки в критериях получают индексацию ассетов бесплатно. **Версионирование не нужно: текст критериев снимается в факт при сдаче** (`criteriaText`), как уже снимается `explanationText` (`facts.ts:92-116`). Вместе с `promptText` (формулировка на момент сдачи) это закрывает риск «проверяющий видит уже изменённый вопрос» (тот же класс дефекта, что D1). Критерии видны админу и проверяющему и никогда ученику (через `discloseKey`, `view.ts:52-55`); показ ученику после оценки — отдельное решение в требованиях.

**Слой проверок вместо изменения попытки.** Три таблицы (раздел 4): `open_answers` (слот, изменяемый указатель состояния), `open_answer_versions` (версия ответа, после запечатывания неизменяема), `open_answer_reviews` (append-only). `test_attempts.results` и `answers` после сдачи не пишутся никем.

**Компромисс, который нужно назвать прямо.** Агрегаты считаются в SQL по `score_percentage` и `passed`: `admin/attempts.ts:85, 120, 177`, `public.ts:488`, `users/index.ts:349`, `database-search.ts:407-430`. Вычислять «последняя проверка каждого открытого ответа» внутри каждого агрегата нереалистично. Поэтому на `test_attempts` добавляется **пересчитываемая проекция**:

| Столбец | Смысл |
|---------|-------|
| `review_status` | `none` (нет открытых вопросов, весь старый массив), `pending` (есть непроверенный открытый ответ), `graded` |
| `final_earned_points`, `final_score_percentage`, `final_passed` | итог «автофакты + последняя проверка каждого открытого ответа»; `NULL`, пока `pending` |
| `graded_at` | когда проекция получила значение |
| `passing_score` | порог теста **на момент сдачи** (иначе правка порога между сдачей и проверкой меняет `passed`) |
| `submit_source` | `client` или `deadline` (принудительная сдача по таймеру); проверяющий видит, что сдано сервером |

Правила проекции:

- Четыре старых столбца (`earned_points`, `total_points`, `score_percentage`, `passed`) остаются **фактами автопроверки на момент сдачи**, `total_points` включает 3 балла за каждый открытый вопрос. Для попыток с открытыми вопросами `score_percentage` и `passed` там предварительные и нигде не читаются. Для попыток без открытых вопросов они совпадают с итогом.
- Единственный писатель проекции — функция `materializeAttemptOutcome(tx, attemptId)` в `open-answers`; она вызывается в транзакции сдачи (для попыток без открытых вопросов: `review_status = 'none'`, `final_*` равны автостолбцам) и в транзакции каждой проверки. Формула — чистая функция `computeAttemptOutcome({ facts, finalScores, passingScore })` в `exam-core`: ровно одна формула вместо копии в `facts.ts:139-142`. Таблица-тест с инвариантом «проекция равна пересчёту из слоёв» вместо россыпи юнит-тестов.
- CHECK на таблице: `(review_status = 'pending') = (final_score_percentage IS NULL AND final_passed IS NULL AND final_earned_points IS NULL)`. База не даст записать процент в попытку «на проверке».
- Миграция делает `UPDATE test_attempts SET final_* = <автостолбцы>, review_status = 'none'` для 265 существующих попыток и только потом включает CHECK.
- Скрипт `jobs:run reconcile-outcomes` пересчитывает проекцию из слоёв и сообщает расхождения (страховка от ручных правок БД).
- Все читатели из таблицы 2.1 переходят на проекцию через **один экспортируемый набор колонок** `attemptResultColumns` из `scored-attempt`, а не на россыпь прямых обращений к столбцам; это единственная защита от забытого читателя, не требующая структурных тестов. Поведенческий тест: попытка «на проверке» не попадает в `summary`, `chart-data`, `attempts/me`, профиль и поисковый подзаголовок как «Не сдано».

Отвергнуто: (а) обновлять существующие столбцы после проверки: противоречит Core Value и ADR-0005; (б) сделать старые столбцы nullable: заставляет трогать `NOT NULL` и все типы и оставляет «предварительные» значения невидимыми для проверки типов, тогда как отдельная проекция даёт фильтр `review_status <> 'pending'` явным в запросе.

**Как проценты, дашборды и графики обращаются с «на проверке».**

| Место | Поведение |
|-------|-----------|
| Агрегаты SQL (`avg`, `count filter`) | читают `final_*`; `NULL` отбрасывается `avg`, но фильтр `review_status <> 'pending'` пишется явно, `count(*)` попыток остаётся |
| График и средние ученика | «на проверке» не рисуется и не входит в среднее; на дату `submittedAt` встаёт после проверки; рядом подпись «на проверке: N» |
| `chart-data` (`public.ts:447-495`) | `WHERE review_status <> 'pending'`; иначе `?? 0` в :488 даст нулевой столбец |
| Поиск попыток (`database-search.ts:407-430`) | подзаголовок «На проверке» |
| Списки | `scorePercentage: number | null`, `reviewStatus`; чип «На проверке» вместо процента |
| Дашборд учителя и админа | плитка «Ждут проверки: N» из очереди (раздел 3.7) |

### 3.2. Жизненный цикл, фото до попытки, окно и дедлайн (вопрос 2)

**Три часовых механизма.** Все сравнения идут по часам БД (`now()`), как уже сделано в `sessionExpired` (`sessions.ts:49-51`).

| Часы | Где хранятся | Что закрывают |
|------|--------------|---------------|
| Дедлайн текста: `started_at + time_limit` (приём сдачи ещё `+ ATTEMPT_GRACE_PERIOD_MINUTES`, `attempt-result.ts:9`) | `tests.time_limit_minutes`, вычисляется | запись черновика и сдачу текста |
| `test_sessions.upload_closes_at` | столбец, снимается при `start`: `started_at + limit + photo_upload_window_minutes`; при сдаче уменьшается до `now() + окно`, если сдано раньше; в тесте без таймера задаётся при сдаче; «Закончить загрузку» ставит `now()` | загрузку и удаление фото версии 1, срок токена |
| `open_answers.pending_since` | столбец слота | момент, с которого ответ виден в очереди проверки |

`pending_since` для версии 1 известен уже при сдаче (это `upload_closes_at`, возможно в будущем): очередь сравнивает его с `now()`, фоновый переход «окно закрылось» не нужен. Окно версии 1 запечатывается временем, версий 2 и далее: действием ученика «отправить исправление».

**Состояния.**

```
Сессия (testSessions)
  open ──сдача учеником──────────────▶ submitted (submit_source = client)
  open ──дедлайн, финализация────────▶ submitted (submit_source = deadline, для тестов с открытыми вопросами)
  open ──дедлайн, тест без открытых──▶ closed(expired)   (как сейчас, не меняется)

Слот открытого ответа (open_answers.status)
  draft ──сдача──▶ pending ──возврат──▶ returned ──ученик отправил──▶ pending
                      │                    │
                      └──оценка 0..3───────┴──оценить без исправления──▶ graded
                                                                          │  правка оценки: новая проверка, статус тот же

Попытка (test_attempts.review_status)
  none (нет открытых) | pending (есть слот не в graded) ──последний слот graded──▶ graded
```

**Фото до попытки.** Слот `open_answers` привязан к `test_sessions` (`UNIQUE (session_id, question_id)`), `attempt_id` пуст до сдачи и проставляется в транзакции `submitAttempt`. Одна сессия порождает ровно одну попытку (`test_attempts_session_id_uniq`, `schema.ts:503-505`), повторное прохождение — новая сессия, поэтому область токена и ключи файлов не пересекаются между попытками. Слот создаётся лениво при первой загрузке или выпуске ссылки, а при сдаче — для всех открытых вопросов теста (в том числе без фото).

**Фото и версии.** Физический файл (`open_answer_photos`) отделён от членства в версии (`open_answer_version_photos`). «Удалить фото» в версии — удалить строку членства. Если фото нигде не состоит и не запечатано, его удаляет фоновая очистка сирот через сутки; запечатанное фото живёт до срока хранения. Это снимает подсчёт ссылок, о котором предупреждал FEATURES (§5.2): исправление копирует членство, а не файлы.

**Принудительная сдача по таймеру.** Сейчас её нет; сессию с просроченным дедлайном `startAttemptSession` закрывает как `expired` (`sessions.ts:93-98`), и черновик пропадает. Для тестов с открытыми вопросами нужны оба механизма:

1. **Ленивая финализация.** Функция `finalizeSessionByDeadline(sessionId)` вызывается при любом обращении после дедлайна: загрузка фото и выпуск ссылки, опрос списка фото, `start`, чтение вида попытки, сдача от клиента (`public.ts:591-594`), запрос очереди. Она идемпотентна: берёт `FOR UPDATE` на строку сессии (как `submit.ts:117-127`), вызывает `scoreSubmission` на `draft_answers` и вставляет попытку с `submit_source = 'deadline'`, `submittedAt = started_at + limit`.
2. **Фоновый проход** из `services/background-jobs`, раз в 30-60 с: находит открытые сессии тестов с открытыми вопросами и просроченным дедлайном и вызывает ту же функцию. Нужен для случая «ученик закрыл вкладку, никто ничего не трогает».
3. **`clientAttemptId` детерминированный: `deadline:<sessionId>`.** Индекс `test_attempts_user_client_attempt_idx` (`schema.ts:500-502`) делает двойную финализацию (ленивую и фоновую) безопасной: второй вызов получает `ClientAttemptConflict` и возвращает существующую попытку (`submit.ts:162-170, 185-188`).
4. **Заморозка текста.** `saveSessionDraft` (`sessions.ts:121-151`) для таких тестов отклоняет запись после дедлайна с `not_found` (клиент уже обрабатывает этот исход). Иначе «текст замораживается» обеспечивает только клиент.

**Гонка с клиентом (нужно решить в клиентском модуле).** Автосдача на таймере (`lifecycle.ts:329-345`, `resubmit(…, true)` на :483, :493-505) теперь встречает попытку, которую сервер уже мог создать. `applySubmitFailure` (`lifecycle.ts:647-672`) трактует `already-submitted` как `blocked` и чистит ключи, а `attempt-submit-flow.ts:35-38` показывает «Время вышло, ответы не засчитаны». Для тестов с открытыми вопросами это неверно: ответ принят. Нужна ветка «загрузить вид попытки и показать состояние “ответ принят, фото можно добавить до ЧЧ:ММ”». Это изменение модуля ADR-0005 «жизненный цикл попытки»: сначала характеризационные тесты `lifecycle-submit.test.ts` и `lifecycle-time.test.ts`, потом правка.

**Сдача открытых вопросов.** Проверка «не пусто» (решение пользователя) выполняется в `routes/tests/public.ts:560-636` перед `scoreSubmission`: для каждого открытого вопроса нужен непустой текст или хотя бы одно фото, иначе 422 с кодом `OPEN_ANSWER_EMPTY` и списком вопросов (код добавляется в `SUBMIT_ERROR_CODES`, `attempt-result.ts:11-14`). Для принудительной сдачи пустой ответ допустим (фото ещё могут прийти в окне); если к закрытию окна текста и фото нет, фоновая задача `resolveEmptyOpenAnswers` ставит 0 системной проверкой (`kind = 'auto_empty'`, `score = 0`, `reviewer_id` пуст; слот переходит в `graded`), чтобы попытка не зависла в «на проверке». Решение подлежит подтверждению пользователя; запасной вариант: пустой ответ идёт в очередь как есть.

**Исправления.** Возврат: `status = 'returned'`, `returns_used + 1` (CHECK `<= 3`, проверяется на сервере, не только скрытой кнопкой), `link_epoch + 1` (старые ссылки перестают действовать, на раунд нужна новая). Ученик правит новую несозданную версию `n + 1` (текст и членство фото копируются из `n`), отправляет `POST …/open-answers/:id/resubmit` с номером ожидаемой версии; версия запечатывается, `pending_since = now()`. Черновик текста исправления хранится в `open_answer_versions.text` и автосохраняется собственным PATCH: общий WAL клиентского модуля работает на уровне сессии, а сессия уже сдана. Срок раунда исправления в требованиях не определён (FEATURES §8, вопрос 4); пока возвращённый ответ открыт, пока учитель не оценит без исправления или ученик не отправит.

### 3.3. Токен телефонной ссылки (вопрос 3)

Паттерн как у приглашений (`routes/auth/invites.ts`: `randomBytes`, в БД `sha256`), с тремя отличиями от STACK §4.

**Выпуск.** `POST /api/tests/public/sessions/:sid/questions/:qid/upload-link` (`sessionRequired`; владелец сессии; `checkAttemptAccess`; окно открыто). `randomBytes(32).toString('base64url')`, URL `…/photo-upload/<token>`. В БД `answer_upload_links(token_hash UNIQUE, open_answer_id, created_at, revoked_at, last_used_at)`.

**Отличие 1: область — слот `(session, question)`, а не `(attempt, question)`.** Попытки на момент выпуска нет (FEATURES §5.1, пункт 4); `attempt_id` у слота появится при сдаче, токен остаётся рабочим.

**Отличие 2: допускаются несколько активных ссылок на слот (не больше 3), старые не отзываются при повторной выдаче.** Страница компьютера кэширует URL в `sessionStorage` по ключу слота, чтобы QR оставался тем же при перезагрузке (требование FEATURES §6: «QR тот же, токен стабилен»), а при потере кэша выпускает новую ссылку без отзыва прежних: иначе перезагрузка вкладки компьютера убивала бы открытую страницу телефона посреди загрузки (сессионные черновики и WAL существуют именно потому, что перезагрузки случаются). Альтернатива: токен как HMAC от `(slot, epoch)` без хранения; отвергнута, потому что нужен новый секрет в контракте окружения (`scripts/check-env-contract.mjs`) и теряется отзыв по одной ссылке.

**Отличие 3: срок не хранится, он считается по состоянию.** Каждый запрос выполняет одну проверку: токен найден по `sha256`, `revoked_at IS NULL`, слот и сессия живы, `now() < test_sessions.upload_closes_at` (для версии 1) либо слот в `returned` (для исправления), пользователь `is_active`, назначение `test_assignments` существует. Отзыв происходит «сам»: сдача раньше срока, «Закончить загрузку», возврат (`link_epoch`), отзыв назначения, блокировка ученика (принцип ADR-0001: решение по текущему состоянию БД). Явный отзыв: `revoked_at` у всех ссылок слота при `epoch`-смене.

**Сосуществование с cookie-сессией и access-policy.**

- `sessionOptional()` выполняется глобально (`app.ts:86`). Middleware `uploadTokenRequired()` (в стиле `nameMiddleware`, чтобы попасть в `route-inventory.txt`) **полностью игнорирует `req.authUser`**, читает заголовок `X-Upload-Token` (не путь: токен не попадает в журналы запросов к API), кладёт в `req.uploadScope = { openAnswerId, sessionId, questionId }` и не вызывает `requestAccess`: `requestAccess` (`access-policy/index.ts:30-38`) без `authUser` отвечает ошибкой, поэтому ни `canReviewAttempt`, ни `testScope` из такого обработчика недостижимы по конструкции.
- Маршруты `/api/upload/*` отдельны: `GET /context` (название теста, номер вопроса, счётчик, срок, состояние), `PUT /photos/:photoId` (multipart, один файл), `DELETE /photos/:photoId`, `GET /photos/:photoId/thumb`. Идентификаторы вопроса и слота берутся **только** из `req.uploadScope`.
- Охранный тест в духе `attempt-access-matrix.test.ts`: по инвентарю маршрутов каждый маршрут вне `/api/upload/*` отвечает 401 при одном лишь заголовке токена; токен не читает чужой слот и не работает после сдачи/срока/отзыва.
- Все причины отказа неотличимы для телефона: 404 «ссылка недействительна» (токен не должен служить оракулом).
- Ограничение частоты: существующий `rateLimiter({ keyPrefix, clientKey })` (`middleware/rateLimiter.ts:60`, in-memory, это допустимо для одного процесса API): ключ по IP на неудачные проверки (защита от перебора, энтропия 256 бит) и отдельный ключ по хешу токена на загрузки. Лимит числа фото проверяется в той же транзакции, что вставка, с `FOR UPDATE` на слот.
- Web: страница `/photo-upload/[token]` не использует `AuthProvider` и не вызывает `/api/auth/me`; ответ с `Referrer-Policy: no-referrer` и `noindex`. Префикс добавляется в `PUBLIC_PREFIXES` (`proxy.ts:11`) **с косой чертой в конце**: проверка `startsWith` (`proxy.ts:15`) для `'/u'` совпала бы с `/users…`. Миниатюры на телефоне загружаются через `fetch` с заголовком и `URL.createObjectURL`: `<img src>` не умеет передавать заголовок.
- Журнал: заголовок `x-upload-token` обязан попасть в `redact` pino (`lib/logger.ts`); отложенная задача 04-06 уже просит `redact` для `cookie`, правки объединяются (раздел 5).

### 3.4. Хранение, раздача и обработка фото (вопрос 4)

**Ключи.** `STORAGE_NAMESPACES` (`keys.ts:3`) `+ 'answers'`; ключ `answers/<sessionId>/<questionId>/<photoId>/{full,thumb}.webp`. STACK §5 писал `<attemptId>`: попытки на момент загрузки нет, сессия стабильна от старта до удаления. `photoId` генерирует клиент (идемпотентность повтора, как `clientAttemptId`).

**Раздача только через API с проверкой владельца.** `isServableImageKey` (`keys.ts:75-82`) остаётся закрытым для `answers/`: общий прокси (`routes/docs/assets.ts:72`) проверяет лишь сессию, а аудит v1.0 уже называет «картинки `images/` читает любой вошедший» техдолгом. Маршруты:

- `GET /api/tests/public/open-answers/:id/photos/:photoId/{full|thumb}`: владелец слота (`session.userId = req.authUser.id`) либо `canReviewAttempt(req, slot.attempt_id)` (`scope-rules.ts:128`; до сдачи, когда `attempt_id` пуст, проверяющий фото не видит, это нужное свойство). Заголовки: `Cache-Control: private, max-age=31536000, immutable` (ключ неизменяем), `X-Content-Type-Options: nosniff`.
- Охранный тест: любой вошедший, запрашивающий `answers/...` через `/api/docs/assets/proxy` и `/signed`, получает отказ.

**Обработка при загрузке** (модуль `image-pipeline`, одна функция `processPhoto(buffer)`): `fileTypeFromBuffer` (белый список JPEG, PNG, WebP; HEIC по решению STACK: сначала 415 с понятным текстом, `heic-decode` позже) → `sharp(buf, { limitInputPixels: 100_000_000, failOn: 'error' }).autoOrient().resize(2560, 2560, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 82 })` → миниатюра 400 px. `keepMetadata()` и `withMetadata()` не вызываются: EXIF и GPS удаляются. Время загрузки пишет сервер (`uploaded_at DEFAULT now()`), не EXIF и не телефон.

**Порядок записи при загрузке.** Сначала файлы (`storage().write`, ключ детерминирован `photoId`, повтор перезапишет), затем транзакция: `FOR UPDATE` на слот, проверка окна по `now()`, проверка `count < 5`, вставка `open_answer_photos` и членства, `photos_revision + 1`. Если транзакция отказала, файлы удаляются «по возможности», остаток подбирает очистка сирот. Для `multer` ошибки клиента (`LIMIT_FILE_SIZE` и т.п.) сегодня отдаются как 500 (отложенный S7 фазы 02); на телефоне нужны 413 и 415, это входит в объём (раздел 5).

**Срок хранения.** `expires_at = uploaded_at + 1 год` хранится в строке (продление спорных работ без миграции). Очистка (`background-jobs`, `retention`): пачками по 100 `WHERE expires_at < now() AND purged_at IS NULL` → `storage().remove(keys)` → `UPDATE … SET purged_at = now()`. Файлы удаляются раньше строки, повтор безопасен. **Строка фото и членство в версиях не удаляются**: история проверок ссылается на них, на месте файла просмотр показывает заглушку «фото удалены по сроку хранения». STACK §7 предлагал удалять строки; это неверно при версиях и истории (отличие намеренное). Исключение: фото несоставленных черновиков и сироты старше 24 часов удаляются целиком. Оговорка: фото слота, ещё не оценённого к сроку, очисткой пропускается.

**Каскады.** `testSessions` и слоты удаляются каскадом при удалении теста или пользователя, файлы остаются сиротами и нарушают срок хранения. `deleteTest` (`question-content/remove.ts`) и удаление пользователя обязаны сначала вызвать `open-answers.purgeFilesForSessions`. `scripts/storage-reconcile.ts` и `question-content/reconcile.ts` знают только `topics/*`, поэтому для `answers/` нужен собственный отчёт о сиротах и пропавших файлах (`jobs:run reconcile-answers`).

### 3.5. Живое обновление телефон → компьютер (вопрос 5)

В v3.0 решение STACK §3 остаётся: опрос.

- `open_answers.photos_revision bigint`: растёт в той же транзакции, что вставка и удаление фото, под блокировкой слота. Это монотонный счётчик без «дыр глобального курсора» (то же рассуждение, что у `version_seq` в `chat/TRANSPORT-STORAGE.md` §6.3).
- `GET /api/tests/public/sessions/:sid/questions/:qid/photos` отвечает `ETag: W/"<revision>"`, 304 на `If-None-Match`. Клиент: `useSWR(..., { refreshInterval: 2500, refreshWhenHidden: false, revalidateOnFocus: true })`, только пока панель QR открыта.
- **Шов под шину v4.0:** после COMMIT транзакции вызывается `publishAfterCommit({ type: 'photos', slotId, revision })` из `services/background-jobs` или `services/events`; в v3.0 функция пуста. Когда в v4.0 появится шина событий в процессе и SSE, поток только будит клиента, а источником правды остаётся тот же эндпоинт с `revision` (правило `chat/SUMMARY.md` §2: «сначала открыть поток, затем `sync`»). Переделывать схему не придётся.
- SSE через Next rewrites и сброс буферов Caddy не проверялись (открытый вопрос чат-исследования); в v3.0 это не блокирует.

### 3.6. Журнал уведомлений (вопрос 6)

Схема общая для проверки, чатов и push (`chat/SUMMARY.md` §2, §6):

```
notification_events
  id uuid PK, recipient_id uuid NOT NULL (FK users, cascade),
  kind text NOT NULL,                 -- 'open_answer.returned' | 'open_answer.graded' | 'attempt.review_complete' (v3.0)
  subject_type text NOT NULL,         -- 'open_answer' | позже 'chat'
  subject_id uuid NOT NULL,           -- тип и идентификатор объекта, не готовый URL: доступ проверяется при открытии
  payload jsonb NOT NULL DEFAULT '{}',-- параметры заголовка (название теста, номер вопроса); без текста комментария
  dedupe_key text NOT NULL,           -- например 'review:<reviewId>', 'complete:<attemptId>'
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz,
  UNIQUE (recipient_id, dedupe_key)
  INDEX (recipient_id, created_at DESC); partial INDEX (recipient_id) WHERE read_at IS NULL

notification_deliveries
  id uuid PK, event_id FK cascade, channel text CHECK IN ('inbox','webpush'),
  status text CHECK IN ('pending','sent','failed','skipped'), attempts int, scheduled_at, sent_at, error text
  UNIQUE (event_id, channel)
```

Паттерн записи в транзакции (**единственный способ создать событие**):

```ts
await db.transaction(async (tx) => {
  const review = await insertReview(tx, input)
  await transitionSlot(tx, slot, review)
  const outcome = await materializeAttemptOutcome(tx, attemptId)
  await recordNotification(tx, { recipientId, kind, subjectType: 'open_answer', subjectId: slot.id, dedupeKey: `review:${review.id}`, payload })
})
publishAfterCommit(...)
```

- `recordNotification(tx, …)` принимает Drizzle-транзакцию и делает `INSERT … ON CONFLICT (recipient_id, dedupe_key) DO NOTHING`; одновременно вставляется строка доставки `inbox` со статусом `sent` (в v3.0 канал один и доставка мгновенная). Откат проверки откатывает и событие; событие нельзя увидеть раньше COMMIT.
- «Один тип события на объект без потока дублей»: ключ дедупликации строится от версии ответа и вида (`review:<reviewId>` для возврата и оценки, `complete:<attemptId>` для «тест полностью проверен»; правка итоговой оценки порождает новый `reviewId`, это допустимо и редко).
- Событие «тест проверен» создаётся в той же транзакции, в которой последний слот перешёл в `graded` и записана проекция.
- API: `GET /api/notifications` (курсор), `GET /api/notifications/unread-count` (потолок «9+» на клиенте), `POST /api/notifications/:id/read`, `POST /api/notifications/read-all`. Только `sessionRequired`, получатель — `req.authUser.id`; access-policy не участвует. Глубокая ссылка разрешается web по `(subject_type, subject_id)` через эндпоинт «найти куда вести», в котором доступ проверяется заново; удалённый объект даёт «не найдено».
- Очередь проверки у учителя **не** событие журнала (FEATURES §2.6): производный запрос.
- Журнал не получает `UPDATE` содержимого; хранение событий сроком не ограничивается в v3.0 (архив отложен).

### 3.7. Очередь проверки через access-policy (вопрос 7)

**Единица очереди — открытый ответ (слот) в статусе `pending`, у которого `pending_since <= now()`**:

```sql
SELECT oa.id, oa.question_id, oa.attempt_id, ta.user_id, t.id AS test_id, tp.slug, oa.pending_since, …
FROM open_answers oa
JOIN test_attempts ta ON ta.id = oa.attempt_id
JOIN tests t ON t.id = ta.test_id
JOIN topics tp ON tp.id = t.topic_id
JOIN users u ON u.id = ta.user_id
WHERE oa.status = 'pending' AND oa.pending_since <= now()
  AND <studentAttemptsInScope(scope)>                       -- topic IN scope.topicIds и не staff
  [AND tp.slug = :topic]
  [AND EXISTS (SELECT 1 FROM user_groups ug WHERE ug.user_id = ta.user_id AND ug.group_id = :group)]
ORDER BY oa.pending_since, oa.id
```

- Область — `testScope(req)` (`scope-rules.ts:134`): `{ all }` у админа, `topicIds` у учителя. Условие `studentAttemptsInScope` (`admin/attempts.ts:20-23`) выносится в общий модуль и используется и списком, и очередью: одна и та же граница видимости. Пустая область (`isEmptyScope`, :31) возвращает пустую очередь без запроса.
- **Группа — только фильтр**, зона проверки по разделам (ответ клиента 6). Список групп для фильтра берётся из `groupScope(req)` (`scope.ts:27`), чтобы учитель не видел чужих групп; фильтр по произвольному `groupId` безопасен, потому что видимость строк уже ограничена разделами.
- Права на единичные операции: `canReviewAttempt(req, attemptId)` (`scope-rules.ts:128`, использует `topicOfAttempt`, `zone-loader.ts:91`, поэтому проверять можно только ответ, уже привязанный к попытке: финализация это гарантирует). Отдельное право `tests.review` не вводится (правка словаря rbac вне объёма): «проверяет учитель зоны или админ» совпадает с `tests.read` в зоне. Дополнительно запрещается проверять собственную попытку (`reviewerId <> attempt.user_id`).
- **Имя параметра.** Новая очередь — отдельный маршрут `GET /api/reviews/queue` (+ `/count`, `/next`), он не пересекается с `status` в `AttemptsQuerySchema` (`admin/attempts.ts:43`, смысл «пользователь активен»). В список попыток добавляется параметр **`review`** (`pending | graded | none`), `status` не трогается.
- «Сохранить и следующий» — `GET /api/reviews/queue/next?after=<slotId>&topic=&group=`: следующий в тех же фильтрах.
- Запись проверки: `POST /api/reviews/open-answers/:id/reviews` с `{ kind: 'score' | 'return', score?, comment, expectedVersionNo }`. В транзакции: `FOR UPDATE` слота; отказ 409, если статус не `pending` или номер версии не совпал (учитель и админ одновременно, учитель и исправление ученика); `kind = 'return'` только пока `returns_used < 3`, обязателен комментарий; `review_no` выдаётся под блокировкой слота.
- Индекс: частичный `open_answers (pending_since, id) WHERE status = 'pending'`. Счётчик в боковой панели — `count(*)` по тому же условию.

### 3.8. Где задеваются фаза техдолга и фаза удаления Supabase и Vercel (вопрос 8)

**Техдолг v1.0 (из `v1.0-MILESTONE-AUDIT.md` и `deferred-items.md`), пересекающийся с новыми модулями, переносить в фазы этих модулей, а не в общую «уборку»:**

| Пункт | Пересечение | Куда |
|-------|-------------|------|
| S7 фазы 02: клиентские ошибки `multer` отдаются как 500 (`routes/uploads.test.ts`) | путь загрузки фото ученика и телефона | фаза фото (413/415 обязательны) |
| 04-06 / 04-07: `req.headers.cookie` в логах, `redact` pino | заголовок `X-Upload-Token` и cookie в тех же строках | фаза ссылки-способности, вместе с токеном |
| SEC-04/N3: фильтр сырых `answers` по вопросам теста и предел размера | свободный текст ответа и новый тип в `answers` | фаза сдачи открытых вопросов |
| CR-05 (повтор `/start` без сессии), CR-03 (bfcache), SEC-02 (чистка ключей WAL при выходе) | клиентский модуль жизненного цикла, который меняется ради дедлайна | фаза финализации по дедлайну |
| 04-13: два `Toaster` | каждое сообщение загрузки показывается дважды | фаза QR и телефонной страницы |
| Неиспользуемые переменные `DashboardClient.tsx` (oxlint) | файл читает процент и меняется ради «на проверке» | фаза читателей процента |
| «Картинки `images/` читает любой вошедший» | тот же прокси, граница для `answers/` | фиксируется записью в ADR-0004 вместе с фазой фото |
| `users.invite` у учителя, `readAdminTest` отдаёт `correct`, `/api/users/directory`, NQ-* и прочее | не пересекаются | отдельная фаза техдолга |
| Мобильная кнопка меню | исключена из объёма (делается в работе над навигацией) | не входит |

**Фаза удаления Supabase и Vercel (не раньше 2026-10-12; последняя).** Что она трогает в новых и изменённых модулях:

- `services/storage/index.ts:55-80` (`resolveStorageDriver`, дефолтный драйвер при пустом `STORAGE_DRIVER`), `adapters/supabase.ts`, импорт `@supabase/supabase-js` (`index.ts:1`), `STORAGE_DRIVER=supabase`. Новый код обязан работать только через порт: пространство `answers/` тестируется на адаптерах `local` и `memory` (контрактный набор `storage.contract.test.ts`), веток под Supabase не добавлять.
- `services/storage/links.ts:10-65`: разбор URL Supabase (`SUPABASE_OBJECT_PATH`, `SUPABASE_URL`, бакет). Перед удалением проверить, что в сохранённом контенте вопросов, аватарах и `answers/` нет ссылок на Supabase.
- `routes/docs/assets.ts:85` (`/signed`), если он остался только ради Supabase.
- `app/server/api/index.ts`, `app/server/vercel.json`, `vercel-build.cjs` и `.sh`, `@vercel/node`, `app/web/vercel.json`: **фоновые задачи запускаются из `index.ts`, а обёртка Vercel их никогда не запускала**, поэтому планировщик безопасно строить до удаления Vercel, но до удаления прод-трафик через Vercel не должен получать открытые вопросы.
- `denyDirectAccessPolicy()` (`schema.ts:45-54`) и `.enableRLS()` на каждой таблице: наследие Supabase. Новые таблицы **получают их по соглашению**, чтобы дамп и сравнение схем (`compare-schema-dump`) оставались единообразными; решение «снять политики со всех таблиц разом» принимает фаза удаления отдельной миграцией, а не частями.
- `.env.example` обоих приложений и `scripts/check-env-contract.mjs`: удаляются ключи Supabase и Vercel; новые ключи (при появлении) добавляются в примеры.
- Runbook сервера: том `answers/` входит в почасовые зашифрованные бэкапы в S3 (рост объёма, см. раздел 8), планировщик в процессе API (`jobs:run` для ручного запуска), порядок отключения старых провайдеров.

## 4. Набросок модели данных (не миграция)

```sql
-- изменения существующих таблиц
ALTER TABLE tests          ADD COLUMN photo_upload_window_minutes integer NOT NULL DEFAULT 0
                             CHECK (photo_upload_window_minutes BETWEEN 0 AND 240);
ALTER TABLE questions      ADD COLUMN criteria_path text;
ALTER TABLE test_sessions  ADD COLUMN upload_closes_at timestamptz;
ALTER TABLE test_attempts
  ADD COLUMN review_status text NOT NULL DEFAULT 'none' CHECK (review_status IN ('none','pending','graded')),
  ADD COLUMN final_earned_points real, ADD COLUMN final_score_percentage real, ADD COLUMN final_passed boolean,
  ADD COLUMN graded_at timestamptz, ADD COLUMN passing_score real,
  ADD COLUMN submit_source text NOT NULL DEFAULT 'client' CHECK (submit_source IN ('client','deadline'));
-- затем: UPDATE test_attempts SET final_* = автостолбцы; затем CHECK-инвариант проекции
-- посев: INSERT INTO question_types (key='open', ui_template='open', is_system=true, is_active=false, scoring_rule=…)

CREATE TABLE open_answers (
  id uuid PK, session_id uuid NOT NULL REFERENCES test_sessions ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES questions ON DELETE CASCADE,
  attempt_id uuid REFERENCES test_attempts ON DELETE CASCADE,           -- NULL до сдачи
  status text NOT NULL CHECK (status IN ('draft','pending','returned','graded')),
  current_version_no smallint NOT NULL DEFAULT 1,
  returns_used smallint NOT NULL DEFAULT 0 CHECK (returns_used BETWEEN 0 AND 3),
  link_epoch int NOT NULL DEFAULT 0,
  photos_revision bigint NOT NULL DEFAULT 0,
  pending_since timestamptz,
  final_score smallint CHECK (final_score BETWEEN 0 AND 3),              -- кэш последней оценки, пересчитываем
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, question_id), UNIQUE (attempt_id, question_id)
);
CREATE INDEX open_answers_queue_idx ON open_answers (pending_since, id) WHERE status = 'pending';

CREATE TABLE open_answer_versions (
  id uuid PK, open_answer_id uuid NOT NULL REFERENCES open_answers ON DELETE CASCADE,
  version_no smallint NOT NULL CHECK (version_no BETWEEN 1 AND 4),
  text text, sealed_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (open_answer_id, version_no)
);

CREATE TABLE open_answer_photos (                                          -- физические файлы, неизменяемы
  id uuid PK,                                                              -- задаёт клиент (идемпотентный повтор)
  open_answer_id uuid NOT NULL REFERENCES open_answers ON DELETE CASCADE,
  uploaded_via text NOT NULL CHECK (uploaded_via IN ('desktop','phone')),
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  mime text NOT NULL, bytes integer NOT NULL, width integer, height integer, sha256 text NOT NULL,
  expires_at timestamptz NOT NULL, purged_at timestamptz
);
CREATE TABLE open_answer_version_photos (
  version_id uuid REFERENCES open_answer_versions ON DELETE CASCADE,
  photo_id uuid REFERENCES open_answer_photos ON DELETE CASCADE,
  position smallint NOT NULL, PRIMARY KEY (version_id, photo_id)
);

CREATE TABLE open_answer_reviews (                                         -- append-only
  id uuid PK, open_answer_id uuid NOT NULL REFERENCES open_answers ON DELETE CASCADE,
  version_id uuid NOT NULL REFERENCES open_answer_versions,
  review_no smallint NOT NULL, kind text NOT NULL CHECK (kind IN ('score','return','auto_empty')),
  score smallint CHECK (score BETWEEN 0 AND 3), comment text, reviewer_id uuid REFERENCES users ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (open_answer_id, review_no),
  CHECK ((kind IN ('score','auto_empty')) = (score IS NOT NULL)),
  CHECK (kind <> 'auto_empty' OR (score = 0 AND reviewer_id IS NULL))
);                                                                          -- + триггер BEFORE UPDATE: запретить изменение

CREATE TABLE answer_upload_links (
  id uuid PK, open_answer_id uuid NOT NULL REFERENCES open_answers ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE, epoch int NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), revoked_at timestamptz, last_used_at timestamptz
);

-- notification_events, notification_deliveries: раздел 3.6
```

Замечания:

- Новые таблицы получают `denyDirectAccessPolicy()` и `.enableRLS()` по соглашению `schema.ts` (раздел 3.8).
- Метки времени новых таблиц `timestamptz` (в старой схеме смесь `timestamp` и `timestamptz`).
- Итог открытого ответа читается как последняя по `review_no` запись `open_answer_reviews`, у которой `score IS NOT NULL` (то есть `kind = 'score'` или системная `auto_empty` с нулём); возврат (`return`) оценки не несёт и итог не меняет. `open_answers.final_score` — кэш для очереди и проекции, проверяется тестом на равенство пересчёту.
- Триггер запрещает `UPDATE` проверок; `DELETE` разрешён только каскадом (удаление теста или пользователя).
- Применённые миграции не правятся (AGENTS.md); все изменения идут новыми файлами с 0026, миграция с `UPDATE` проекции и CHECK идёт отдельным шагом после добавления столбцов.

## 5. Поток данных

**A. Прохождение и фото.**

1. `POST /tests/public/tests/:id/start` (`public.ts:505`) → `startAttemptSession` считает `upload_closes_at`.
2. Текст: существующий PATCH черновика (`public.ts:519`); после дедлайна 404.
3. QR: `POST …/upload-link` → ссылка, URL кэшируется на компьютере; `QRCodeSVG`.
4. Телефон: `GET /api/upload/context`, затем `PUT /api/upload/photos/:photoId` → `image-pipeline` → `storage` → транзакция слота (`FOR UPDATE`, окно, лимит 5, `photos_revision + 1`).
5. Компьютер: опрос списка фото с `ETag` каждые 2,5 с, пока панель открыта.

**B. Сдача.** `POST /submit` (`public.ts:560`): доступ → `precheckSubmit` → проверка непустых открытых ответов → `scoreSubmission` (факты, `open` как `pending`) → `submitAttempt` в одной транзакции: вставка попытки (`results_version = 2`, `review_status`, `final_*`, `passing_score`), слоты, версия 1 с текстом, `pending_since = upload_closes_at`, обновление сессии. Ответ: вид попытки со статусом «на проверке».

**C. Дедлайн.** Таймер клиента сдаёт как обычно; если клиента нет, ленивая или фоновая `finalizeSessionByDeadline` делает то же с `draft_answers` и `submit_source = 'deadline'`.

**D. Проверка.** Очередь → экран проверки (фото, текст, критерии, время загрузки каждого фото, пометка «после окончания времени») → транзакция проверки (раздел 3.6) → проекция при последнем слоте → уведомления.

**E. Исправление.** Ученик видит комментарий, правит текст и фото в версии `n + 1` (новая ссылка с новой `link_epoch`), `resubmit` → снова `pending`.

**F. Фоновые задачи** (один таймер в `index.ts`, advisory lock `pg_try_advisory_xact_lock` на пачку): `finalizeExpiredSessions` (30-60 с), `resolveEmptyOpenAnswers`, `purgeOrphanPhotos` (24 ч), `purgeExpiredPhotos` (1 год). Останов до `pgPool.end()` в `gracefulShutdown` (`index.ts:17-31`); ручной запуск скриптом `jobs:run`, как `storage:reconcile`.

## 6. Паттерны

### Паттерн 1: слой проверок и пересчитываемая проекция

**Что:** факты автопроверки и версии ответов неизменяемы, проверки добавляются записями, итог для списков — кэш, который пишет одна функция.
**Когда:** любое последующее изменение, добавляющее данные «после сдачи» (чаты, повторная проверка).
**Компромисс:** второй источник итога в строке попытки (кэш) и обязанность держать его равным пересчёту; взамен агрегаты SQL остаются простыми, а Core Value не нарушается.
**Пример:**
```ts
export async function materializeAttemptOutcome(tx: Tx, attemptId: string): Promise<AttemptOutcome> {
  const { facts, passingScore } = await loadFactsAndSnapshot(tx, attemptId)
  const finalScores = await latestScoresByQuestion(tx, attemptId)
  const outcome = computeAttemptOutcome({ facts, finalScores, passingScore })
  await tx.update(testAttempts).set(projectionOf(outcome)).where(eq(testAttempts.id, attemptId))
  return outcome
}
```

### Паттерн 2: событие в транзакции, публикация после COMMIT

`recordNotification(tx, …)` внутри транзакции бизнес-операции; `publishAfterCommit(…)` после её завершения; в v3.0 публикация пуста.
**Компромисс:** событие появляется только вместе с бизнес-операцией, но доставка вне кабинета (push) потребует отдельного исполнителя доставок v5.0.

### Паттерн 3: капабилити по состоянию

Токен не несёт прав; права и срок вычисляются из БД на каждом запросе одним запросом `loadUploadContext(tokenHash)`; все идентификаторы обработчика берутся из `req.uploadScope`.
**Компромисс:** один запрос к БД на каждый вызов с телефона (для нагрузки школы пренебрежимо), зато мгновенный отзыв и срок без копий.

### Паттерн 4: идемпотентность по клиентскому UUID

`photoId` (загрузка), `clientAttemptId` (`deadline:<sessionId>` у сервера), `dedupe_key` (уведомления): повтор безопасен.

### Паттерн 5: проверка версии при сохранении

Проверяющий отправляет `expectedVersionNo`; сервер отвечает 409 при несовпадении. Единственная защита от гонки без блокировок на уровне интерфейса (FEATURES §4: блокировка работы не нужна).

## 7. Антипаттерны

### Антипаттерн 1: обновлять `score_percentage` и `passed` после проверки
**Почему плохо:** ломает «разбор остаётся таким, как был оценён» и ADR-0005. **Вместо этого:** проекция `final_*`.

### Антипаттерн 2: ноль по умолчанию для непроверенного
**Почему плохо:** `public.ts:488` (`?? 0`) уже превратил бы попытку в нулевой столбец графика; ЯКласс страдает тем же. **Вместо этого:** `review_status <> 'pending'` в каждом агрегате.

### Антипаттерн 3: ключ слота `(attempt_id, question_id)`
**Почему плохо:** попытка появляется при сдаче, QR работает до неё. **Вместо этого:** `(session_id, question_id)`.

### Антипаттерн 4: выдавать `answers/` через общий прокси
**Почему плохо:** `routes/docs/assets.ts:72` проверяет только сессию. **Вместо этого:** отдельный маршрут с владельцем или `canReviewAttempt`.

### Антипаттерн 5: хранить фото в `answers` jsonb или в локальном черновике
**Почему плохо:** фото приходят с другого устройства, источник правды на сервере; `AnswerValue` и формат WAL клиентского модуля остаются прежними. **Вместо этого:** текст в `answers[qid]` как строка, фото в таблицах.

### Антипаттерн 6: удалять строку фото при очистке по сроку
**Почему плохо:** история версий и проверок ссылается на неё. **Вместо этого:** `purged_at` и заглушка.

### Антипаттерн 7: доверять `Content-Type` и расширению клиента, не вызывать `autoOrient()`
**Почему плохо:** `fileFilter` в `avatar.ts` сверяет `file.mimetype`; без `autoOrient()` фото с iPhone уйдёт боком (STACK, проверено запуском). **Вместо этого:** `fileTypeFromBuffer` и `autoOrient()` в `image-pipeline`.

### Антипаттерн 8: префикс в `PUBLIC_PREFIXES` без косой черты
`startsWith('/u')` открыл бы `/users…`. **Вместо этого:** `'/photo-upload/'`.

## 8. Масштабируемость

| Забота | Сейчас (31 пользователь) | 100 пользователей | 10 тыс. | 1 млн |
|--------|--------------------------|-------------------|---------|-------|
| Обработка фото `sharp` | в запросе, один процесс | в запросе; HEIC по одному (очередь на промисе) | отдельная очередь заданий | вне проектного объёма |
| Опрос списка фото | единицы одновременных панелей | десятки, один индексный запрос на опрос, 304 по `ETag` | SSE на шине (v4.0), опрос запасной | вне объёма |
| Очередь проверки | десятки ответов | частичный индекс по `pending_since` | пагинация по курсору, счётчик по индексу | вне объёма |
| Диск под фото | оценка: 30 учеников × 3 открытых вопроса × 5 фото ≈ 450 файлов на прогон теста ≈ 0,4 ГБ (LOW) | порядка 1,5 ГБ на прогон | лимит на пользователя в сутки, пересмотр срока хранения | вне объёма |
| Бэкапы | почасовые зашифрованные в S3 дедупликацией, том `answers/` растёт | следить за размером | отдельная политика | вне объёма |
| Планировщик | один процесс API, advisory lock | то же | `LISTEN/NOTIFY` или отдельный воркер | вне объёма |
| Журнал уведомлений | один канал `inbox` | индекс непрочитанных | архив старых, outbox для push | вне объёма |

## 9. Порядок сборки и зависимости

Порядок согласуется с граничными условиями: пока проверка не работает, тип `open` неактивен (`is_active = false`), поэтому в продакшене не может появиться ни одной попытки «на проверке» раньше готовности читателей и экрана проверки.

| № | Блок | Зависит от | Что даёт и почему здесь |
|---|------|-----------|--------------------------|
| 1 | **Основа результата:** характеризационные тесты `scored-attempt`, `submit`, читателей; шаблон `open` и `computeAttemptOutcome` в `exam-core`; миграции (проекция `review_status` и `final_*` с заполнением 265 попыток, посев `question_types` неактивным, `criteria_path`, окно у теста, `upload_closes_at`); читатели списков, графиков, поиска, дашбордов и web-типов переведены на проекцию; `DashboardClient` приведён в порядок | — | Ни одного видимого изменения; проверяется посевом тестовых попыток «на проверке». Делается первым: все следующие блоки опираются на проекцию, а перевод читателей безопасен, пока таких попыток нет |
| 2 | **Журнал уведомлений:** таблицы, `services/notifications`, API, колокольчик, пока без производителей (кроме тестовых) | — (параллельно блоку 1) | Независимый блок; нужен блоку 7 |
| 3 | **Финализация по дедлайну и окна:** `background-jobs`, `finalizeSessionByDeadline` (лениво и фоном), заморозка черновика, правка клиентского `attempt-lifecycle`, плюс CR-05/CR-03/SEC-02 | 1 | Без неё у окна загрузки после таймера нет опоры. Идёт **раньше QR** |
| 4 | **Фото на сессионной аутентификации:** `image-pipeline`, `answers/` в хранилище, слоты, версии, членство, загрузка и удаление с компьютера, раздача, опрос с `revision`, `multer` 4xx, фиксация границы в ADR-0004 | 1, 3 | Даёт рабочий путь «текст плюс фото» без QR и проверяет конвейер до устройств |
| 5 | **Токен, QR и страница телефона:** `upload-links`, `uploadTokenRequired`, `/photo-upload/[token]`, `PUBLIC_PREFIXES`, `redact` pino, охранная матрица маршрутов, перегенерация `route-inventory.txt`, спайк на 2–3 реальных устройствах (HEIC, сжатие, медленная сеть), `Toaster` | 4 | Раньше был бы без опоры; ранний спайк снимает риск устройств |
| 6 | **Сдача и создание открытых вопросов:** редактор (тип, критерии, `criteria.md` в `question-content` и ZIP), раннер (текст, фото, QR-панель, окно после таймера), проверка «не пусто», SEC-04/N3, слоты и версия 1 в `submitAttempt`, статус «на проверке» у ученика | 1, 3, 4 (QR из 5 подключается тут же) | Попытки «на проверке» теперь создаются; тип остаётся неактивным в проде |
| 7 | **Проверка:** очередь, экран проверки (просмотрщик, зум и поворот), оценка и возврат, версии и история, «оценить без исправления», проекция, уведомления в транзакции, форма исправления у ученика, плитка «Ждут проверки», `resolveEmptyOpenAnswers` | 2, 4, 6 | Замыкает цикл |
| 8 | **Retention и сироты фото:** `purgeExpiredPhotos`, `purgeOrphanPhotos`, `reconcile-answers`, чистка при удалении теста и пользователя, текст про срок хранения | 4, 7 | Может идти после запуска; срок в один год даёт время |
| 9 | **Включение:** `is_active = true` у `open`, e2e двух контекстов (компьютер и телефон без cookie), UAT | 1–8 | Переключатель вместо флага функций |
| 10 | **Остаток техдолга v1.0** (всё, что не вошло в блоки 3, 5, 6) | — | Независим |
| 11 | **Удаление Supabase и Vercel и runbook** (не раньше 2026-10-12) | всё | Последним, раздел 3.8 |

Возможный параллелизм: 1 и 2; 8 и 10 после 7.

## 10. Флаги для исследований и решений до требований

| Тема | Что неизвестно | Где решать |
|------|----------------|------------|
| Спайк устройств | HEIC, сжатие canvas, большие снимки, медленная сеть, `accept` на реальных iPhone и Android | блок 5, до проектирования страницы телефона |
| Клиентский жизненный цикл после дедлайна | точное состояние UI «ответ принят, фото можно добавить», гонка автосдачи с ленивой финализацией | блок 3, характеризация сначала |
| Пустой ответ при принудительной сдаче | авто-0 системной проверкой или в очередь как есть | требования, подтверждение пользователя |
| Срок раунда исправления | нужен ли предел и что делать, если ученик не вернулся (кроме «оценить без исправления») | требования (FEATURES §8, п. 4) |
| Максимум открытого вопроса и вес | всегда 3; отношение к существующему весу вопроса и кейсу «вес 0» | требования (FEATURES §8, п. 7) |
| Показ ученику критериев и автобаллов | критерии не показываются; «предварительно X из Y» требует подтверждения клиента | требования (FEATURES §8, п. 1) |
| Изменение типа вопроса, у которого есть ответы | запретить смену типа и удаление открытого вопроса при наличии слотов | блок 6 |
| Тело запроса через Next rewrite | загрузка файла около 1 МБ через rewrites `/api` и лимит тела; в `yarn dev` не проверялось | блок 4 |
| Журнал доступа Caddy | запись пути `/photo-upload/*` с токеном | блок 5, runbook |
| Правовая сторона хранения фото несовершеннолетних | не исследовалась | вне объёма, общий пробел с чатами |

## 11. Источники

Код (HIGH, чтение напрямую, коммит `1962edd`): `app/server/src/db/schema.ts`; `services/attempt-sessions/{submit,sessions,access,index}.ts`; `services/scored-attempt/{facts,view,read,storable-fact,index}.ts`; `services/access-policy/{index,scope,scope-rules,zone-loader}.ts`; `services/storage/{keys,port,links,index}.ts`; `routes/tests/public.ts`; `routes/tests/admin/attempts.ts`; `routes/docs/assets.ts`; `routes/users/index.ts`; `routes/auth/invites.ts`; `routes/route-inventory.snapshot.test.ts`; `middleware/auth/session.ts`; `middleware/rateLimiter.ts`; `app.ts`; `index.ts`; `services/search/database-search.ts`; `packages/exam-core/src/{registry,attempt-result,scoring}.ts`, `adapters/{types,index,short-text}.ts`; `packages/rbac/src/domains.ts`; `app/web/proxy.ts`; `app/web/components/tests/attempt-lifecycle/lifecycle.ts`; `attempt-submit-flow.ts`; читатели процента в web (список в разделе 2.1).

Планирование (HIGH): `.planning/PROJECT.md`; `.planning/research/FEATURES.md` и `STACK.md` (этого milestone); `.planning/research/chat/SUMMARY.md` §2, §6 и `TRANSPORT-STORAGE.md` §6-§8 (журнал, шина, `sync`, очистка сирот); `docs/adr/0001...0005`; `.planning/milestones/v1.0-MILESTONE-AUDIT.md` и `deferred-items.md` по фазам 01, 02, 04-08; `.planning/milestones/v1.0-phases/07.1-teachers-and-responsibility-zones/07.1-CLIENT-ANSWERS.md` (ответы 12–19).

Уровни уверенности по решениям: проекция `final_*`, слой проверок, финализация (ленивая и фоновая), область токена `(session, question)` и закрытие `answers/` для общего прокси: HIGH (прямое следствие прочитанного кода). Несколько активных ссылок на слот, авто-0 для пустого ответа, критерии как `criteria.md` без версионирования: MEDIUM (проектные выборы, нужна проверка пользователем). Оценка диска: LOW.

---
*Исследование архитектуры для: открытые задания с фото и ручной проверкой (bio-exam v3.0)*
*Исследовано: 2026-10-06*
