# Phase 3: Exam core - Context

**Gathered:** 2026-10-04
**Status:** Ready for planning
**Mode:** автономный smart discuss. Пользователь недоступен; все решения ниже приняты автономно по рекомендованному варианту. Альтернативы — в `03-DISCUSSION-LOG.md`. Решения, которые меняют видимое поведение, API или прод-сборку, перечислены в `<specifics>` → «Требует подтверждения пользователя»; фазу они не блокируют.

<domain>
## Phase Boundary

Пакет `packages/exam-core` (`@bio-exam/exam-core`) решает для пяти шаблонов вопроса (`single_choice`, `multi_choice`, `matching`, `short_text`, `sequence_digits`): форму ключа и его проверку при сохранении, форму ответа, «отвечено ли», нормализацию, число ошибок, баллы по правилу и вердикты по частям для разбора. В пакете объявлены схема результата попытки (в текущей форме) и слияние телеметрии. Редактор вопросов, прохождение теста, разбор попытки, валидация при сохранении и оценка при submit на сервере берут эту логику из пакета; частные копии в `app/web` и `app/server` удаляются.

Требования: EXAM-01 … EXAM-07 (`.planning/REQUIREMENTS.md:37-43`). Источник: ADR-0002, `plans/011-architecture-deepening.md` §2 C1, дефекты D2 и D5.

Видимое поведение меняется в трёх местах:
- D5: редактор сохраняет `short_text` с несколькими вариантами.
- D2: в разборе последовательности строка «Совпало позиций: X / N» заменяется числом ошибок той же метрики, что у сервера.
- Правила проверки ключа при сохранении одинаковы на web и server (D-13).

Что НЕ входит:
- Хранение фактов оценки, вид попытки для трёх зрителей, правило скрытия ключа, статус вопроса, чтение результатов по схеме без `unknown[]`, D1 — Phase 5 (SCORE-01…05).
- Конверт submit/черновика (`sessionId`, `clientAttemptId`, транзакция) — Phase 5 (`plans/README.md:47`: «004 owns the server/client submission contract»).
- Редьюсеры телеметрии и черновик ответов на клиенте — Phase 6 (LIFE-01).
- Миграции БД. Ни одно решение фазы 3 не требует новой миграции.
- Изменения правил оценки, кроме унификации метрики последовательности (PROJECT.md Out of Scope; `REQUIREMENTS.md:165`).

</domain>

<decisions>
## Implementation Decisions

Все решения D-01 … D-19 приняты автономно (пользователь недоступен), рекомендованный вариант. У каждого стоит пометка **[авто]**.

Перенесено из предыдущих фаз (не переспрашивалось):
- **ADR-0002 (PROJECT D-02, locked).** Чистый TypeScript, из зависимостей только `zod`, сборка как у `@bio-exam/rbac`, адаптер на шаблон, табличные тесты и инвариант «все части верны ⇔ ошибок 0».
- **ADR-0003.** Характеризационные тесты через интерфейс модуля до изменений. `yarn verify` зелёный перед закрытием фазы, нулевой прогон тестов — провал.
- **Phase 1 D-09.** `packages/exam-core` начинается на той же сборке `tsdown`, что и rbac.
- **Phase 1 (01-11).** D2 и D5 закреплены в e2e как `test.fail()`; фаза, которая их чинит, переключает их в обычные тесты. D1 остаётся `test.fail()` до Phase 5.
- **Phase 2 (02-01).** Образец ожидаемо падающих Vitest-проверок — константа `KNOWN_HOLES` с `test.fails` (`app/web/lib/mdx/untrusted.test.ts`).
- **Общие правила.** Агенты не коммитят; границы планов — границы коммитов пользователя. БД-тесты только через `node scripts/with-test-db.mjs` (`test_*`, `BIO_EXAM_ISOLATED_ENV=1`). Web-тесты Vitest в Node без DOM. Комментарии в коде не пишутся. Доки по-русски.

### Форма пакета и границы
- **D-01 [авто]: имя, сборка, зависимости.** `packages/exam-core`, имя `@bio-exam/exam-core`, `private`, одна точка входа `.` и карта `exports` как у rbac (ESM, CJS, `.d.ts`; `tsdown.config.ts` с `fixedExtension: false`). Скрипты `build`, `clean`, `watch`, `typecheck`, `test`, `lint` и devDependencies — как в `packages/rbac/package.json`. Единственная runtime-зависимость — `zod` с диапазоном `^3.24.3`, как у обоих приложений; в `yarn.lock` должна остаться одна версия zod (сейчас 3.25.76), иначе схемы из двух копий не компонуются. Supply-chain checkpoint фазы 2 не нужен: все devDependencies (tsdown 0.23.0, vitest 5.0.3, oxlint 1.86.0, vite 8.3.2, typescript, rimraf) и zod уже в lockfile. Переход на zod 4 в фазу не входит.
- **D-02 [авто]: подключение и проводка сборки.** Оба приложения подключают пакет как `"@bio-exam/exam-core": "workspace:*"` и импортируют собранный `dist` (turbo `^build` уже стоит у `build`, `dev`, `typecheck`, `test`). Сборка пакета добавляется во все места, где сейчас явно собирается rbac:
  - `app/web/vercel.json` (`buildCommand`) и `app/server/vercel-build.cjs` — прод-сборка Vercel;
  - `scripts/e2e.mjs` (шаг 1: сид импортирует server lib, которая начнёт импортировать exam-core);
  - job `build` в `.github/workflows/ci.yml` вместе с `JOB_ORDER` в `scripts/check-ci-workflow.mjs` (шаг `ci-workflow` в `yarn verify` падает, если они расходятся);
  - проверка `dist` по образцу `scripts/check-rbac-dist.mjs`.
  `app/server/src/db/schema.ts` берёт типы `QuestionUiTemplate`, `QuestionTypeScoringRule`, `TelemetryMap` из пакета только через `import type` (drizzle-kit загружает `schema.ts`; шаг `migrations` в `yarn verify` должен остаться зелёным).
  Документация обновляется в той же фазе: строка «Exam domain» в таблице Routing `AGENTS.md:46` получает `packages/exam-core`; `README.md` (список пакетов `:5`, `:104`, шаг `lint-typecheck-test` `:72`, сборка в `yarn e2e` `:95`); `app/server/README.md:37` ссылается на `src/lib/tests/question-types.ts` — ссылка переводится на пакет, пять идентификаторов шаблонов в файле остаются (их требует `scripts/check-docs-structure.test.mjs:48-53`). Команды `yarn ...` в README и `AGENTS.md` проверяет `scripts/check-docs-commands.mjs`.
- **D-03 [авто]: что входит в пакет.**
  - Реестр: 5 шаблонов, 6 метрик (имена без изменений: они хранятся в `question_types.scoring_rule` и `test_question_type_overrides.scoring_rule_override`), разрешённые метрики по шаблону, схема правила баллов (`exact_match`, `one_mistake_partial`, `tiers`), схема `validationSchema`, схема определения типа вопроса, встроенные типы (`BUILTIN_QUESTION_TYPES`).
  - Адаптер на шаблон (D-07, D-09 … D-12): схема ключа и проверка при сохранении, схема ответа, «отвечено ли», нормализация, число ошибок, вердикты по частям.
  - Чистая оценка: ошибки → баллы по правилу; оценка вопроса по (конфиг типа, ключ, ответ, запасные баллы).
  - Схема содержимого вопроса, которое относится к шаблону (`options`, `matchingPairs`, `correct`), и схема значения ответа.
  - Схема результата попытки в текущей форме `SubmitResultSchema` (`app/server/src/lib/tests/submit-result.ts`), без новых полей.
  - Схема записи и карты телеметрии и `mergeTelemetryMaps`.
- **D-04 [авто]: что остаётся в приложениях.**
  - Server: загрузка типов и переопределений из БД (DB-часть `question-type-resolver.ts`), маршруты, транзакция submit, правило `correctAnswer: null` (`public.ts:820`), конверты запросов `SubmitAnswersSchema` и `SaveDraftAnswerSchema` (`public.ts:45-49`, `622-632`) — их форму меняет Phase 5; в пакет из `public.ts:34-43` уходят только схема значения ответа и схема телеметрии.
  - Web: React-компоненты по шаблонам (`QuestionInput`, `QuestionAnswerReview`, редакторы) с ветвлением по идентификатору шаблона из пакета; редьюсеры телеметрии `appendQuestionTime`, `incrementQuestionVisit`, `incrementQuestionFocusLoss` (Phase 6); `getQuestionStatus` и `AttemptReviewData.results: unknown[]` (Phase 5, SCORE-04).
  - HTTP-контракты вне домена экзамена (темы, настройки теста, пользователи, группы) в пакет не переносятся (Phase 8, HTTP-*).

### D2: метрика последовательности
- **D-05 [авто]: остаётся серверная метрика `hamming_digits` в текущем виде** (`app/server/src/lib/tests/scoring.ts:145-170`): ошибки = разница длин + число несовпавших позиций; исключение — при равной длине больше 3 и ровно двух несовпадениях, образующих одну перестановку соседних элементов, ошибка одна. Этой метрикой оценены все сабмиты после деплоя `04c621c` (коммит 2026-07-25; дата деплоя неизвестна); её закрепляют `scoring.test.ts:122-255`. Новые сабмиты оцениваются так же, как сейчас; меняется только разбор. Имя `hamming_digits` не меняется (хранимые данные).
- **D-06 [авто]: сохранённые баллы не пересчитываются.** Статус вопроса и баллы во всех видах разбора берутся из сохранённых `results` (`isCorrect`, `earnedPoints`, `points`) и ответа submit, как сейчас. Exam-core пересчитывает только вердикты по частям и число ошибок для показа. Попытки до деплоя `04c621c` оценены чисто позиционной метрикой: у ответа с одной соседней перестановкой там 0 баллов, а разбор после фазы покажет «Ошибок: 1». Их число считает пользователь (`<specifics>`), политика для старых попыток — SCORE-05 (Phase 5).
- **D-07 [авто]: модель вердиктов и согласие с числом ошибок.**
  - `sequence_digits`: вердикт по позиции — `correct`, `wrong`, `missing`, `extra` или `swapped`; пара соседних переставленных позиций — одна единица ошибки. Число единиц ошибки в вердиктах равно числу ошибок адаптера.
  - `matching`: вердикт по левому элементу; число неверных пар равно числу ошибок.
  - `single_choice`, `multi_choice`: вердикт по варианту (выбран верно, выбран неверно, пропущен, нейтрален); число ошибок `multi_choice` остаётся `set_distance` = max(пропущено, лишних), равенства с числом неверных вариантов не требуется.
  - `short_text`: одна часть.
  - Для всех шаблонов в таблицах проверяется инвариант «все части верны ⇔ ошибок 0».
- **D-08 [авто]: разбор.** В `QuestionAnswerReview.tsx` строка «Совпало позиций: X / N» (`:151-156`, `:179-183`) заменяется строкой «Ошибок: N», где N — число ошибок адаптера (та же функция, что оценивает submit), и подсветкой позиций по вердиктам. Показывается при тех же условиях, что сейчас: ключ виден зрителю или ответ верен. Текст «Верных пар: X / N» для `matching` и сводка для выбора не меняются. Вердикты считаются на web через exam-core из видимых зрителю ключа и ответа; форма результата попытки не меняется (сохранённые вердикты — Phase 5). Описание метрики `hamming_digits` в админке (`admin/tests/types/index.ts:91`, `:100`) дополняется правилом соседней перестановки.

### D5 и форма ключей
- **D-09 [авто]: одна проверка ключа при сохранении.** Адаптер получает разрешённый конфиг типа (`uiTemplate`, `scoringRule.mistakeMetric`, `validationSchema`) и решает форму ключа сам; для `short_text` форма зависит от метрики. Сервер: zod в `schemas/tests.ts` проверяет только форму payload (`CorrectAnswerSchema`), ветвление `QuestionSchema.superRefine` по ключу типа (`schemas/tests.ts:47-199`, кастомные ключи типов его минуют) и `validateByTemplate` (`question-type-resolver.ts:182-277`) заменяются одним вызовом адаптера. Web: `validateQuestion` (`QuestionEditorPageClient.tsx:114`, D5 в `:155-159`), `getCreateQuestionsValidationError` (`test-editor-utils.ts:64-110`, та же ошибка в `:99-104`), `normalizeQuestionForSave` и `normalize*CorrectValue` (`admin/tests/types/index.ts:277-324`), `normalizeDraftCorrect` (`QuestionEditorPageClient.tsx:75-81`) и `acceptsMultipleShortAnswers` (`QuestionEditor.tsx:52-54`) идут через тот же адаптер. Для `compact_text_in_set` ключ — массив минимум из двух непустых вариантов без повторов после нормализации пробелов и регистра (текущее серверное правило).
- **D-10 [авто]: каноничная форма ключа.** `single_choice` — строка (id варианта); `multi_choice` — массив строк; `matching` — объект строка → строка; `short_text` с `compact_text_equal` — строка; `short_text` с `compact_text_in_set` — массив строк; `sequence_digits` — строка цифр. API отдаёт ключи строками.
- **D-11 [авто]: числовые ключи — артефакт чтения, миграция данных не нужна.** По чтению кода: `PgJsonb.mapFromDriverValue` в drizzle-orm 0.45.3 повторно вызывает `JSON.parse` для строки, которую `pg` уже разобрал из jsonb (`node_modules/drizzle-orm/pg-core/columns/jsonb.js:24-31`), поэтому верхнеуровневая строка `"3142"` читается как число 3142, а `"1.50"` — как 1.5. Запись идёт через `JSON.stringify`, в БД лежат JSON-строки. Затронуты jsonb-колонки, где на верхнем уровне бывает строка: `answer_keys.correct_answer`. Вложенные значения (`test_attempts.answers`, `results`, черновики) не затронуты. Исправление без миграции:
  1. сервер читает `answer_keys.correct_answer` без второго разбора (способ — на усмотрение планировщика);
  2. разбор ключа в exam-core принимает число на месте строки и числовые id в массивах и объектах и приводит их к строке (защита на случай старых строк).
  Первый план фазы подтверждает причину DB-тестом на `test_*` (D-14).
- **D-12 [авто]: строго при записи, терпимо при чтении.** Сохранённые ключи повторно не проверяются и не переписываются. Чтение принимает старые числовые формы. Если форма ключа не совпадает с метрикой (строка при `compact_text_in_set`, массив при `compact_text_equal`), результат остаётся текущим (максимум ошибок, 0 баллов) и закрепляется строкой таблицы; изменение этого поведения — правка правил оценки, вне фазы.
- **D-13 [авто]: правила проверки при сохранении — объединение текущих правил web и server, одинаковые с обеих сторон.** Web начинает применять `validationSchema` типа (`minOptions`, `maxOptions`, `exactChoiceCount`) до отправки; сервер начинает отклонять то, что сейчас отсекает только клиент (пустые тексты вариантов и элементов сопоставления). Тексты ошибок берутся из одного источника — адаптера.

### Порядок миграции и тесты
- **D-14 [авто]: тесты до изменений.**
  - D5: красный Vitest-тест на проверку редактора (через функцию, которую вызывает сохранение; тип «Краткий ответ (несколько вариантов)», ключ `['эксперимент', 'моделирование']` → ошибки нет). Помечается ожидаемо падающим константой по образцу `KNOWN_HOLES` и переключается в плане, который чинит D5. Если для теста нужно вынести `validateQuestion` из `QuestionEditorPageClient.tsx` в чистый модуль или заранее дать ей конфиг типа, это делается без изменения поведения. Через UI D5 уже воспроизведён в 01-11 (`01-11-SUMMARY.md:155`: запрос сохранения не уходит).
  - Ключи ответов: DB-тест на `test_*` — `jsonb_typeof(correct_answer) = 'string'` и чтение через Drizzle ключей `"3142"`, `"1.50"`, `"true"`, `"митоз"` как строк; чтение сейчас красное, помечается ожидаемо падающим до D-11.
  - Сервер: характеризация сохранения вопроса (POST, PATCH, `/save`) и оценки submit для пяти шаблонов через `app.ts` на `test_*` (`app/server/src/test-support/http.ts`, `test-database.ts`); зелёная до и после переключения.
  - D2: красное доказательство — существующий e2e `test.fail` (`review.spec.ts:226`); перед переключением web `yarn e2e` подтверждает, что он по-прежнему ожидаемо падает.
- **D-15 [авто]: таблицы пакета — точка отсчёта (EXAM-03).** `test.each` по шаблону: (конфиг типа, ключ, ответ) → ошибки, баллы по встроенному правилу, вердикты. Строки переносятся из `scoring.test.ts`, `question-type-resolver.test.ts`, `schemas/tests.test.ts`, `AttemptQuestionsList.test.ts`, `attempt-review-utils.test.ts`, обоих `telemetry.test.ts`; добавляется строка D2: ключ `1243`, ответ `1234` → 1 ошибка, одна единица `swapped`. Инвариант проверяется по всем строкам всех таблиц. До удаления серверной копии в `app/server` живёт тест паритета: старая `scoreQuestionByType` против exam-core на сгенерированных входах (все перестановки длиной 2–5, числовые и строковые id, пустые и `null` ответы); он удаляется вместе с копией.
- **D-16 [авто]: порядок.**
  1. Тесты до изменений (D-14).
  2. Каркас пакета, проводка сборки (D-01, D-02), реестр шаблонов, схема результата попытки, телеметрия.
  3. Адаптеры и таблицы (D-07, D-09 … D-12, D-15), паритет с сервером.
  4. Переключение сервера: сохранение, submit, черновик, CRUD типов вопросов, типы в `schema.ts`, чтение ключа (D-11). Поведение не меняется, кроме D-11 и D-13.
  5. Переключение web: редактор (D5), `TestRunner`, разбор (D2), типы результата и телеметрии; переключение красных тестов и e2e (D-18).
  6. Legacy `TestScoringRules` (D-19) — не в этой фазе (Deferred).
  Планы 4 и 5 зависят от 3 и друг от друга не зависят.
- **D-17 [авто]: удаление копий.** Для каждой копии из списка в `<code_context>`: `codegraph impact` → перенос её тестов в таблицы пакета → переключение вызовов → удаление → `codegraph affected` → `yarn verify`. Верификатор фазы проверяет список поимённо: каждая позиция удалена или стала импортом из `@bio-exam/exam-core`.
- **D-18 [авто]: e2e.** D2 и D5 переходят из `test.fail` в обычные тесты в плане, который их чинит. В `review.spec.ts` ожидание `'Совпало позиций: 4 / 4'` (`:103`) и помощник `positionsMatched` (`:164-168`) заменяются чтением «Ошибок: N»; проверка D2 сравнивает N из разбора с ошибками, выведенными из баллов сервера (`serverMistakesFromPoints`, `:175-179`). D5 (`authoring.spec.ts:234-242`) проверяет сохранение и вопрос в списке после перезагрузки. D1 остаётся `test.fail`. Перед закрытием фазы `yarn e2e` зелёный на `chromium-desktop` и `chromium-mobile` (вне `yarn verify`).
- **D-19 [авто, пересмотрено оркестратором 2026-10-04]: legacy `TestScoringRules` в фазе 3 НЕ удаляется — перенесено в Deferred.** Причина: PROJECT.md Out of Scope и `REQUIREMENTS.md:165` исключают изменения правил оценки кроме D2, а удаление публичных маршрутов без пользователя необратимо для внешних вызовов. В фазе 3 legacy не трогается; адаптеры exam-core его не используют. Исходная рекомендация (для решения пользователя): Проверено: `ScoringSettingsPageClient.tsx` ходит только в `/api/tests/question-types` (`:119-190`), не в `/scoring-rules`; оценка legacy-правила не читает; `ScoringRulesEditor` только реэкспортирован из `admin/tests/components/index.ts:5`. Удаляется: `scoring.ts:12-70`, четыре маршрута `/scoring-rules/*` (`routes/tests/index.ts:839-966`), `ensureGlobalScoringRules`, `GlobalScoringRulesPayloadSchema`, `TestScoringRulesPayloadSchema`, поле `scoringRules` в `SaveTestSchema` и `UpdateTestSettingsSchema`, поля `scoringRules` и `useGlobalScoringRules` в `settings.json`, перенос `scoringRules` при копировании теста (`routes/tests/index.ts:2094`), на web — `ScoringRulesEditor`, тип `TestScoringRules`, `createDefaultScoringRules`, `form.scoringRules` (`test-editor-api.ts:72`). Колонка `tests.scoring_rules` и таблица `test_scoring_settings` остаются в схеме и данных; `$type<TestScoringRules>` на них (`db/schema.ts:259`, `:312`) заменяется нейтральным типом. Сам `settings.json` — QCON-05 (Phase 7).

### Claude's Discretion
- Раскладка `packages/exam-core/src`, имена функций адаптера, форма типов вердиктов.
- Обобщить `scripts/check-rbac-dist.mjs` на оба пакета или завести второй скрипт.
- Способ убрать второй `JSON.parse` для `answer_keys.correct_answer` (свой тип колонки, `::text` в выборке или другой); условие — DB-тест D-14 зелёный, `drizzle-kit` не предлагает миграцию. Починка ограничена этой колонкой, глобальная замена типа `jsonb` не делается (остальные jsonb-колонки хранят на верхнем уровне объект или массив). Через неё проходят все места чтения ключа: `public.ts:761-766`, `routes/tests/index.ts:1008-1014`, `:1313-1319`, `:2381-2392`, `:2428-2439`, `:2697-2708`.
- Оформление подсветки позиций в разборе и точная формулировка строки числа ошибок; после выбора e2e читает её дословно.
- Источник текстов ошибок проверки: рекомендуется формулировка web-редактора, её видят преподаватели.
- Где живут подписи (`TEMPLATE_META`, `MISTAKE_METRIC_LABELS`, `MISTAKE_METRIC_DESCRIPTIONS`): в web или в пакете.
- Перевести `@bio-exam/rbac` в `app/web/package.json` с `"*"` на `workspace:*` для единообразия.
- `/save` проверяет вопросы по глобальной карте типов (`routes/tests/index.ts:1396`), а POST и PATCH вопроса — по карте теста с переопределениями (`:1724`, `:1864`): выровнять в фазе или оставить и записать.
- Насколько глубоко характеризовать маршруты сохранения и submit (D-14).
- UI-SPEC: меняется один компонент (`QuestionAnswerReview`, ветка `TextAnswerReview`), отдельный `gsd-ui-phase` не обязателен.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Решения и охват
- `docs/adr/0002-shared-exam-core-package.md` — решение о пакете (обязательно).
- `docs/adr/0003-verification-before-refactoring.md` — тесты через интерфейс до изменений.
- `docs/adr/0005-decompose-by-concept.md` — граница со scored attempt (Phase 5) и lifecycle (Phase 6).
- `plans/011-architecture-deepening.md` — §1 D2, D5; §2 C1 (файлы, проблема, тесты); §3 legacy `TestScoringRules`; §4 порядок.
- `plans/004-attempt-session-integrity.md` — scope: «scoring rules» вне 004; submit-контракт принадлежит 004 (Phase 5).
- `plans/README.md` — порядок планов, строка 47.
- `.planning/ROADMAP.md` — Phase 3: цель и 5 критериев успеха.
- `.planning/REQUIREMENTS.md` — EXAM-01 … EXAM-07 (`:37-43`), SCORE-01 … 05 (`:71-75`, граница), строка `:165`.
- `.planning/PROJECT.md` — locked D-01 … D-14, Out of Scope, открытые вопросы (a) и (b).
- `.planning/STATE.md` — Blockers/Concerns по Phase 3.
- `.planning/phases/01-verification-baseline/01-11-SUMMARY.md` — как закреплены D1, D2, D5 в e2e; находка про числовые ключи.
- `.planning/phases/01-verification-baseline/deferred-items.md` — «Digit-only answer keys…».
- `.planning/phases/02-dependency-security/02-CONTEXT.md` — образец `KNOWN_HOLES`, стиль решений.

### Образец пакета и проводка сборки
- `packages/rbac/package.json`, `packages/rbac/tsdown.config.ts`, `packages/rbac/tsconfig.json`, `packages/rbac/vitest.config.ts`.
- `turbo.json`, корневой `package.json` (workspaces `packages/*`).
- `app/web/vercel.json`, `app/server/vercel-build.cjs`, `scripts/e2e.mjs`, `.github/workflows/ci.yml`, `scripts/check-ci-workflow.mjs`, `scripts/check-rbac-dist.mjs`, `scripts/verify.mjs`.
- `AGENTS.md` (Routing), `README.md`, `app/server/README.md`, `scripts/check-docs-structure.test.mjs`, `scripts/check-docs-commands.mjs` — документация, которую меняет D-02.

### Server
- `app/server/src/lib/tests/scoring.ts`, `scoring.test.ts`.
- `app/server/src/lib/tests/question-types.ts`.
- `app/server/src/lib/tests/question-type-resolver.ts`, `question-type-resolver.test.ts`.
- `app/server/src/lib/tests/submit-result.ts`, `telemetry.ts`, `telemetry.test.ts`.
- `app/server/src/schemas/tests.ts`, `schemas/tests.test.ts`.
- `app/server/src/routes/tests/index.ts` — CRUD типов (`:66-125`, `:462-837`), legacy scoring (`:127-146`, `:839-966`), `/save` (`:1378-1541`), POST вопроса (`:1699-1829`), PATCH вопроса (`:1831-1952`), `settings.json` (`:161-190`).
- `app/server/src/routes/tests/public.ts` — схемы тела (`:34-49`, `:622-632`), черновик (`:676`), submit (`:695-903`, оценка `:787`, скрытие ключа `:820`).
- `app/server/src/db/schema.ts` — `:20-28`, `answer_keys` (`:427-445`), `test_attempts` (`:448-470`), `question_types` (`:322-345`), `test_question_type_overrides` (`:347-370`).
- `app/server/src/scripts/e2e-seed.ts` — `getBuiltinQuestionTypeByKey` (`:71`, `:135`).
- `app/server/src/test-support/http.ts`, `app/server/src/test-support/test-database.ts`, `app/server/src/app.ts`.
- `node_modules/drizzle-orm/pg-core/columns/jsonb.js` — причина D-11.

### Web
- `app/web/lib/tests/types.ts`, `app/web/lib/tests/api.ts`.
- `app/web/app/(internal)/(protected)/admin/tests/types/index.ts`.
- `app/web/app/(internal)/(protected)/admin/tests/[topicSlug]/[testSlug]/questions/QuestionEditorPageClient.tsx`.
- `app/web/app/(internal)/(protected)/admin/tests/components/QuestionEditor.tsx`, `QuestionCard.tsx`, `QuestionTypeScoringRuleEditor.tsx`, `ScoringRulesEditor.tsx`, `components/index.ts`.
- `app/web/app/(internal)/(protected)/admin/tests/components/test-editor/test-editor-utils.ts`, `test-editor-api.ts`, `useTestEditorModel.ts`.
- `app/web/app/(internal)/(protected)/admin/tests/scoring/ScoringSettingsPageClient.tsx`, `admin/tests/question-types/QuestionTypesPageClient.tsx`, `admin/tests/question-types/[key]/QuestionTypeDetailsPageClient.tsx`.
- `app/web/components/tests/TestRunner.tsx`, `QuestionInput.tsx`, `telemetry.ts`, `telemetry.test.ts`, `AttemptReview.tsx`.
- `app/web/components/tests/attempt-review/QuestionAnswerReview.tsx`, `attempt-review-utils.ts`, `attempt-review-utils.test.ts`, `AttemptQuestionsList.tsx`, `AttemptQuestionsList.test.ts`.
- `app/web/lib/mdx/untrusted.test.ts` — образец `KNOWN_HOLES`.

### E2E
- `e2e/tests/review.spec.ts` — flow 3 (`:103`), `positionsMatched` (`:164-168`), D2 (`:181-232`), D1 (`:234-…`).
- `e2e/tests/authoring.spec.ts` — D5 (`:202-242`).
- `e2e/fixtures/seed.json` (тест `seq-d2`, ключ `1243`), `e2e/fixtures/exam.ts`.

### Карта кода
- `.planning/codebase/ARCHITECTURE.md`, `CONVENTIONS.md`, `TESTING.md` — сняты на `29563ff`, частично устарели (TESTING не знает про Vitest и `yarn verify`); номера строк сверять с кодом.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `packages/rbac` — готовый образец пакета: `tsdown` (ESM + CJS + d.ts, `fixedExtension: false`), Vitest в Node, oxlint с корневым `.oxlintrc.json`.
- `scripts/check-rbac-dist.mjs` — проверка, что файлы `exports` есть и ESM/CJS экспортируют одно и то же.
- Серверные тесты оценки и проверки (`scoring.test.ts` 428 строк, `question-type-resolver.test.ts`, `schemas/tests.test.ts`) — готовые строки таблиц.
- `app/server/src/app.ts` (default export), `test-support/test-database.ts`, `test-support/http.ts` (фаза 2) — тесты маршрутов на `test_*`.
- e2e-стек с сидом `e2e/fixtures/seed.json`; тест `seq-d2` с ключом `1243` уже есть.

### Established Patterns
- Конфиг оценки берётся из БД: `question_types` + `test_question_type_overrides` → `RuntimeQuestionType` (`question-type-resolver.ts:100-150`). Метрика нормализуется: неразрешённая для шаблона заменяется метрикой по умолчанию (`:47-53`).
- Нормализация уже терпит числа: `normalizeIdValue`, `normalizeDigitsSequence`, `normalizeCompactString` (`scoring.ts:72-118`), web — `answerIds`, `formatAnswerLines`, `normalize*CorrectValue`.
- Результат submit хранит по вопросу `isCorrect`, `points`, `earnedPoints`, `userAnswer`, `correctAnswer` (`null`, если ответ верен или ключ скрыт), `explanationText`; числа ошибок и вердиктов нет (`public.ts:770-823`).
- Тесты: Vitest, `node:assert/strict`, названия по-русски; web-тесты без DOM.

### Integration Points
- Сохранение вопроса: `/save` (`routes/tests/index.ts:1396`), POST (`:1724`), PATCH (`:1864`) — `validateQuestionWithType` после zod.
- Оценка: `public.ts:787` (`scoreQuestionByType`), слияние телеметрии `public.ts:676`, `:827`.
- CRUD типов вопросов: `routes/tests/index.ts:96`, `:105` (литералы шаблонов в `z.enum`), `:117-125`.
- Web: редактор (`QuestionEditorPageClient`, `QuestionEditor`, `useTestEditorModel`), страницы типов и оценивания, `TestRunner` (прохождение и разбор студента сразу после submit, `:745-770`), `AttemptReview` и `attempt-review/*` (разбор администратора).
- Прод-сборка Vercel (`app/web/vercel.json`, `app/server/vercel-build.cjs`) и CI `build` (D-02).

### Копии логики шаблона (поимённый список для D-17 и критерия успеха 4)
Server:
1. `app/server/src/lib/tests/scoring.ts:72-313` — нормализация, счётчики ошибок, правило баллов; `:12-70` legacy (D-19).
2. `app/server/src/lib/tests/question-types.ts` — шаблоны, метрики, схема правила, схема типа, встроенные типы.
3. `app/server/src/lib/tests/question-type-resolver.ts:152-300` — проверка ключа по шаблону и метрике (DB-часть остаётся).
4. `app/server/src/schemas/tests.ts:9-199`, `:250-279` — `IdSchema`, `CorrectAnswerSchema`, проверка ключа по ключу типа.
5. `app/server/src/routes/tests/index.ts:96`, `:105`, `:117-125` — литералы шаблонов и проверка совместимости метрики.
6. `app/server/src/lib/tests/submit-result.ts` — схема результата попытки.
7. `app/server/src/lib/tests/telemetry.ts` — слияние телеметрии.
8. `app/server/src/routes/tests/public.ts:34-43` — схема значения ответа и схема телеметрии.
9. `app/server/src/db/schema.ts:20-28` — типы шаблона, правила, телеметрии.

Web:
10. `app/web/lib/tests/types.ts` — `QuestionUiTemplate`, `TestAnswerValue`, `SubmitResult*` («Keep in sync manually», `:54-67`), `QuestionTelemetry`.
11. `admin/tests/types/index.ts:5-125`, `:273-324` — шаблоны, метрики, правила, разрешённые метрики, нормализация и проверка ключа; `:23-29`, `:346-354` legacy (D-19).
12. `QuestionEditorPageClient.tsx:75-81`, `:114-166` — `normalizeDraftCorrect`, `validateQuestion` (D5).
13. `test-editor-utils.ts:64-110` — `getCreateQuestionsValidationError` (D5).
14. `QuestionEditor.tsx:52-54` — форма ключа по метрике.
15. `TestRunner.tsx:65-83` — `isAnswered`.
16. `attempt-review-utils.ts:29-96` — `answerIds`, `getChoiceOptionReviewRows`, `formatAnswerLines`.
17. `QuestionAnswerReview.tsx:24-195` — вердикты по частям (D2 в `:151-156`, `:179-183`).
18. `app/web/components/tests/telemetry.ts:1-27` — типы и слияние (редьюсеры `:29-76` остаются, Phase 6).
19. `QuestionTypeScoringRuleEditor.tsx` — правила и разрешённые метрики через `admin/tests/types`.
20. `ScoringRulesEditor.tsx` — legacy, мёртвый код (D-19).

### Риски, найденные при разведке
- Метрика `short_text` задаётся типом и может быть переопределена для теста (`test_question_type_overrides`): строковый ключ под `compact_text_in_set` сейчас даёт максимум ошибок (`scoring.ts:133-143`). Поведение сохраняется (D-12).
- `normalizeDraftCorrect` теряет числовой ключ (возвращает `''`), что усиливает D-10/D-11.

</code_context>

<specifics>
## Specific Ideas

### Требует подтверждения пользователя (фазу не блокирует)
1. **Метрика последовательности (D-05, D-06).** Соседняя перестановка считается одной ошибкой только при длине больше 3; несоседняя перестановка — две ошибки. Нужно подтвердить, что это правило совпадает с принятым для экзамена. Отдельно: попытки до деплоя `04c621c` (2026-07-25) оценены без исключения для перестановки; их разбор покажет «Ошибок: 1» при 0 баллах. Оценка сверху, read-only на проде (дату деплоя подставляет пользователь):
   ```sql
   SELECT count(*)
   FROM test_attempts ta
   CROSS JOIN LATERAL jsonb_array_elements(ta.results) r
   JOIN questions q ON q.id = (r->>'questionId')::uuid
   JOIN question_types qt ON qt.key = q.type
   WHERE qt.ui_template = 'sequence_digits'
     AND ta.submitted_at < '<дата деплоя 04c621c>'
     AND (r->>'earnedPoints')::numeric = 0
     AND length(regexp_replace(r->>'userAnswer', '\s', '', 'g')) > 3;
   ```
2. **Текст разбора (D-08).** Студенты и администраторы видят «Ошибок: N» с подсветкой позиций вместо «Совпало позиций: X / N»; меняется описание метрики `hamming_digits` в админке.
3. **Чтение ключей (D-11).** После починки ключи `short_text`, похожие на JSON-литерал (`"1.50"`, `"1e3"`, `"true"`), сравниваются как написаны; для новых сабмитов балл в таких вопросах может измениться. Сейчас `"1.50"` читается как `1.5`: ответ «1.5» засчитывается, ответ «1.50» нет. После D-11 наоборот: засчитывается «1.50», а «1.5» перестаёт (то же для `"10.0"` и `"1e3"`). Ключи `"true"`, `"false"`, `"null"` сейчас читаются как boolean или null и не засчитываются никогда, после D-11 засчитываются как текст. Read-only на проде:
   ```sql
   SELECT jsonb_typeof(correct_answer) AS kind, count(*) FROM answer_keys GROUP BY 1;

   SELECT count(*)
   FROM answer_keys ak
   JOIN questions q ON q.id = ak.question_id
   JOIN question_types qt ON qt.key = q.type
   WHERE qt.ui_template = 'short_text'
     AND jsonb_typeof(ak.correct_answer) = 'string'
     AND (ak.correct_answer #>> '{}') ~ '^(-?(0|[1-9][0-9]*)(\.[0-9]+)?([eE][+-]?[0-9]+)?|true|false|null)$';
   ```
   Если первый запрос покажет `number`, в данных есть настоящие числовые ключи: их покрывает разбор exam-core (D-11, п. 2), миграция по-прежнему не нужна. Если второй запрос вернёт больше нуля, до деплоя нужно выгрузить сами ключи (тот же `WHERE`, вместо `count(*)` — `q.id, ak.correct_answer #>> '{}'`) и решить по ним, а не по числу.
4. **Строже при сохранении (D-13).** Web начинает отклонять вопросы вне `validationSchema` типа до отправки; сервер начинает отклонять пустые тексты вариантов. Сохранённые вопросы не трогаются.
5. **Legacy `TestScoringRules` (D-19).** Пропадают 4 маршрута `/api/tests/scoring-rules/*` и поле `scoringRules` в сохранении теста; `tests.scoring_rules` и `test_scoring_settings` остаются, но перестают обновляться. Контраргумент: PROJECT.md Out of Scope и `REQUIREMENTS.md:165` исключают изменения правил оценки кроме D2; legacy-правила оценку не читают, поэтому баллы не меняются. План отдельный и снимаемый: без него фаза закрывается, а legacy остаётся до отдельного решения.
6. **Прод-сборка (D-02).** Меняются `app/web/vercel.json` и `app/server/vercel-build.cjs`. Нужен preview-деплой Vercel (web и server Ready, `/healthz`, прохождение теста). Его удобно объединить с отложенным preview фазы 2 (`STATE.md`, Deferred Verification).

### Прочее
- Рабочее дерево ветки `phase-1-verification` содержит незакоммиченные изменения фазы 2 (три `package.json`, `yarn.lock`, MDX, новые тесты). До исполнения фазы 3 их нужно закоммитить по границам из `.planning/commit-snapshots/README.md`, иначе диффы фаз смешаются.
- Запись в `STATE.md` «D5 is known by code reading only» устарела: 01-11 воспроизвёл D5 через UI на обоих проектах (`01-11-SUMMARY.md:155`). В фазе 3 добавляется проверка внутри `yarn verify` (D-14).
- Причина числовых ключей установлена чтением кода drizzle-orm 0.45.3 (D-11); первый план подтверждает её тестом.

</specifics>

<deferred>
## Deferred Ideas

- Хранение фактов оценки (ключ, ошибки, вердикты) при submit, вид для трёх зрителей, правило скрытия ключа, единый статус вопроса при `points === 0`, чтение результатов по схеме без `unknown[]`, политика для старых попыток (включая попытки до деплоя `04c621c`), D1 — Phase 5 (SCORE-01 … 05).
- Конверты `SubmitAnswersSchema` и `SaveDraftAnswerSchema`, обязательный `sessionId`, постоянный `clientAttemptId`, атомарное слияние черновика — Phase 5 (ATT-02, ATT-04, ATT-05).
- Редьюсеры телеметрии и формат черновика на клиенте — Phase 6 (LIFE-01).
- `settings.json` (пишется, не читается) — Phase 7 (QCON-05).
- Типизированные запросы и DTO вне домена экзамена — Phase 8 (HTTP-01 … 04); снимок маршрутов DECOMP-01 снимается после D-19.
- Миграция, удаляющая `tests.scoring_rules` и `test_scoring_settings` — отдельное решение с миграцией после D-19.
- Уточнение правила последовательности (перестановка при длине ≤ 3, несоседняя перестановка), иной счёт ошибок для `multi_choice`, обработка ключа `short_text`, не совпадающего с метрикой, — изменения правил оценки вне D2.
- Переименование метрики `hamming_digits` — требует миграции хранимых правил.
- Переход на zod 4.

- Удаление legacy `TestScoringRules` и маршрутов `/api/tests/scoring-rules/*` (D-19) — после решения пользователя; полный перечень удаляемого кода в D-19 выше.

</deferred>

---

*Phase: 3-Exam core*
*Context gathered: 2026-10-04 (autonomous smart discuss)*
