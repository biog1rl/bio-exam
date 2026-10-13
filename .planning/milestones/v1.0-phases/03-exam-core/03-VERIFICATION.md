---
phase: 03-exam-core
verified: 2026-10-04T03:30:48Z
status: passed
human_verification_confirmed: "2026-10-05, пользователь"
score: "104/107 must-haves verified (5/5 критериев ROADMAP, 99/102 truths планов); 1 present-behavior-unverified, 2 backstop insufficient_spec"
covered_files: [".github/workflows/ci.yml", ".planning/phases/03-exam-core/03-01-PLAN.md", ".planning/phases/03-exam-core/03-01-SUMMARY.md", ".planning/phases/03-exam-core/03-02-PLAN.md", ".planning/phases/03-exam-core/03-02-SUMMARY.md", ".planning/phases/03-exam-core/03-03-PLAN.md", ".planning/phases/03-exam-core/03-03-SUMMARY.md", ".planning/phases/03-exam-core/03-04-PLAN.md", ".planning/phases/03-exam-core/03-04-SUMMARY.md", ".planning/phases/03-exam-core/03-05-PLAN.md", ".planning/phases/03-exam-core/03-05-SUMMARY.md", ".planning/phases/03-exam-core/03-06-PLAN.md", ".planning/phases/03-exam-core/03-06-SUMMARY.md", ".planning/phases/03-exam-core/03-07-PLAN.md", ".planning/phases/03-exam-core/03-07-SUMMARY.md", ".planning/phases/03-exam-core/03-08-PLAN.md", ".planning/phases/03-exam-core/03-08-SUMMARY.md", ".planning/phases/03-exam-core/03-09-PLAN.md", ".planning/phases/03-exam-core/03-09-SUMMARY.md", ".planning/phases/03-exam-core/03-10-PLAN.md", ".planning/phases/03-exam-core/03-10-SUMMARY.md", ".planning/phases/03-exam-core/03-11-PLAN.md", ".planning/phases/03-exam-core/03-11-SUMMARY.md", ".planning/phases/03-exam-core/03-12-PLAN.md", ".planning/phases/03-exam-core/03-12-SUMMARY.md", ".planning/phases/03-exam-core/03-13-PLAN.md", ".planning/phases/03-exam-core/03-13-SUMMARY.md", "AGENTS.md", "README.md", "app/server/README.md", "app/server/package.json", "app/server/src/db/answer-keys-jsonb.test.ts", "app/server/src/db/schema.ts", "app/server/src/lib/tests/question-type-resolver.test.ts", "app/server/src/lib/tests/question-type-resolver.ts", "app/server/src/lib/tests/scoring.ts", "app/server/src/routes/tests/exam-flow.test.ts", "app/server/src/routes/tests/index.ts", "app/server/src/routes/tests/public.ts", "app/server/src/schemas/tests.test.ts", "app/server/src/schemas/tests.ts", "app/server/src/scripts/e2e-seed.ts", "app/server/vercel-build.cjs", "app/server/vercel-build.sh", "app/web/app/(internal)/(protected)/admin/tests/[topicSlug]/[testSlug]/questions/QuestionEditorPageClient.tsx", "app/web/app/(internal)/(protected)/admin/tests/components/QuestionEditor.tsx", "app/web/app/(internal)/(protected)/admin/tests/components/test-editor/test-editor-utils.ts", "app/web/app/(internal)/(protected)/admin/tests/components/test-editor/useTestEditorModel.ts", "app/web/app/(internal)/(protected)/admin/tests/question-validation.test.ts", "app/web/app/(internal)/(protected)/admin/tests/question-validation.ts", "app/web/app/(internal)/(protected)/admin/tests/types/index.ts", "app/web/components/tests/TestRunner.tsx", "app/web/components/tests/attempt-review/QuestionAnswerReview.tsx", "app/web/components/tests/attempt-review/attempt-review-utils.test.ts", "app/web/components/tests/attempt-review/attempt-review-utils.ts", "app/web/components/tests/telemetry.ts", "app/web/lib/tests/types.ts", "app/web/package.json", "app/web/vercel.json", "e2e/tests/authoring.spec.ts", "e2e/tests/review.spec.ts", "packages/exam-core/package.json", "packages/exam-core/src/adapters/authoring-rules.ts", "packages/exam-core/src/adapters/index.ts", "packages/exam-core/src/adapters/matching.ts", "packages/exam-core/src/adapters/multi-choice.ts", "packages/exam-core/src/adapters/sequence-digits.ts", "packages/exam-core/src/adapters/short-text.ts", "packages/exam-core/src/adapters/single-choice.ts", "packages/exam-core/src/adapters/types.ts", "packages/exam-core/src/adapters/verdicts.ts", "packages/exam-core/src/answer.test.ts", "packages/exam-core/src/attempt-result.test.ts", "packages/exam-core/src/attempt-result.ts", "packages/exam-core/src/authoring-messages.ts", "packages/exam-core/src/authoring.test.ts", "packages/exam-core/src/authoring.ts", "packages/exam-core/src/boundaries.test.ts", "packages/exam-core/src/cases/answer.cases.ts", "packages/exam-core/src/cases/authoring.cases.ts", "packages/exam-core/src/cases/review.cases.ts", "packages/exam-core/src/cases/scoring.cases.ts", "packages/exam-core/src/content.test.ts", "packages/exam-core/src/content.ts", "packages/exam-core/src/index.ts", "packages/exam-core/src/invariants.test.ts", "packages/exam-core/src/normalize.ts", "packages/exam-core/src/plural.test.ts", "packages/exam-core/src/plural.ts", "packages/exam-core/src/registry.test.ts", "packages/exam-core/src/registry.ts", "packages/exam-core/src/review.test.ts", "packages/exam-core/src/review.ts", "packages/exam-core/src/scoring.test.ts", "packages/exam-core/src/scoring.ts", "packages/exam-core/src/telemetry.test.ts", "packages/exam-core/src/telemetry.ts", "packages/exam-core/tsconfig.json", "packages/exam-core/tsdown.config.ts", "packages/exam-core/vitest.config.ts", "scripts/check-ci-workflow.mjs", "scripts/check-exam-core-dist.mjs", "scripts/e2e.mjs", "scripts/exam-core-no-private-copies.test.mjs", "yarn.lock"]
covered_digest: "v2:sha256:1c959f5dd316a22957a663284c6db5c322395ba1e9bb41fa8815a47deb1511dd"
behavior_unverified: 1
overrides_applied: 0
deferred:
  - truth: "D1: разбор администратора старой попытки не меняется после правки ключа (e2e @known-defect остаётся test.fail)"
    addressed_in: "Phase 5"
    evidence: "ROADMAP Phase 5 SC 4: 'After an answer key is corrected, the admin review of earlier attempts is unchanged (D1)'"
  - truth: "N1 (ревью безопасности): нет проверки назначения в /start, /submit, PATCH черновика; пустой submit отдаёт ключи при showCorrectAnswer=true (было до фазы)"
    addressed_in: "Phase 5"
    evidence: "ROADMAP Phase 5 SC 1: 'An unassigned user gets 403 on reading, starting, drafting and submitting an attempt' (ATT-01)"
  - truth: "Удаление legacy TestScoringRules и маршрутов /api/tests/scoring-rules/* (D-19)"
    addressed_in: "решение пользователя (CONTEXT <deferred>)"
    evidence: "D-19 пересмотрен оркестратором: в фазе 3 не удаляется; PROJECT.md Out of Scope и REQUIREMENTS.md:165"
behavior_unverified_items:
  - truth: "03-10: ошибка проверки в редакторе показывается одним toast.error, запрос сохранения не уходит, введённые варианты, ключ и порядок не сбрасываются (UI-SPEC: error)"
    test: "В редакторе вопроса выбрать тип «Один вариант», оставить один вариант и нажать «Сохранить»; затем тип пользовательский с minOptions 3 и два варианта"
    expected: "Один toast с текстом пакета ('Добавьте минимум 2 варианта ответа' / 'Добавьте минимум 3 варианта ответа'); в Network нет POST/PATCH вопроса; варианты, ключ и порядок на форме остались"
    why_human: "Путь validateQuestion → toast.error → return в handleSaveQuestion присутствует и подключён, но ни один e2e и ни один Vitest не проходит ветку ошибки через страницу; e2e D5 и flow4 покрывают только успешное сохранение"
human_verification:
  - test: "Коммиты фазы 3 по границам планов, push, PR и зелёный CI на запушенном HEAD (Linux)"
    expected: "Все job CI зелёные, включая build со шагами Build exam-core и Check exam-core dist; формат-only изменения отдельным коммитом"
    why_human: "Правило пользователя: агенты не коммитят и не пушят; HEAD 7a6f95a, все изменения фаз 2 и 3 лежат в рабочем дереве, CI на них не запускался"
  - test: "Preview-деплой Vercel (web и server) под Node 24; /healthz, вход, прохождение теста со всеми пятью шаблонами, разбор последовательности"
    expected: "Оба деплоя Ready; server собирает rbac → exam-core → server; web buildCommand собирает exam-core до yarn build:dev; сабмит и разбор работают"
    why_human: "Доступ к Vercel только у пользователя; локально обе прод-сборки воспроизведены (см. Behavioral Spot-Checks), но среда Vercel может отличаться. Объединяется с отложенным preview фазы 2"
  - test: "Read-only SQL на проде по D-11: SELECT jsonb_typeof(correct_answer), count(*) FROM answer_keys GROUP BY 1; и подсчёт short_text-ключей, похожих на JSON-литерал (запрос в 03-CONTEXT.md <specifics> п. 3)"
    expected: "Решение по ключам вида '1.50', '1e3', 'true': если второй запрос > 0 — выгрузить ключи и решить по ним до деплоя"
    why_human: "Прод-база недоступна агенту; после D-11 балл новых сабмитов в таких вопросах меняется ('1.50' засчитывает '1.50', а не '1.5'; 'true' начинает засчитываться)"
  - test: "Read-only SQL на проде: число попыток sequence_digits до деплоя 04c621c с 0 баллов и длиной ответа > 3 (запрос в 03-CONTEXT.md <specifics> п. 1)"
    expected: "Пользователь знает, сколько старых разборов покажет «Ошибок: 1» при 0 баллах; политика — SCORE-05 (Phase 5)"
    why_human: "Нужна дата деплоя 04c621c и доступ к проду"
  - test: "Подтвердить правило метрики последовательности (D-05): соседняя перестановка = одна ошибка только при длине > 3, несоседняя = две"
    expected: "Пользователь подтверждает, что правило совпадает с принятым для экзамена"
    why_human: "Решение принято автономно; изменение правила — изменение правил оценки вне фазы"
  - test: "Подтвердить тексты D-08: «Ошибок: N» вместо «Совпало позиций: X / N», подсказка «Соседняя перестановка считается одной ошибкой.», дополненное описание hamming_digits в админке"
    expected: "Тексты приняты или пользователь даёт формулировки"
    why_human: "Видимое студентам и преподавателям изменение, решение автономное (CONTEXT <specifics> п. 2)"
  - test: "Подтвердить D-13: редактор отклоняет вопросы вне validationSchema типа до отправки, сервер отклоняет пустые тексты вариантов и элементов сопоставления и формулировку из пробелов"
    expected: "Пользователь принимает более строгую проверку при сохранении"
    why_human: "Меняет поведение API и редактора (CONTEXT <specifics> п. 4)"
  - test: "Визуальная проверка разбора последовательности на ширине 375px: ответ из 20+ цифр на ключ из 4 (ячейки extra)"
    expected: "Ячейки переносятся в несколько рядов, нет горизонтальной прокрутки, строка «Ошибок: N» не перекрыта"
    why_human: "Backstop-truth 03-11 (UI-SPEC overflow): классы flex flex-wrap gap-2 и size-10 есть, но вёрстку тесты без DOM не видят"
  - test: "Ошибка проверки в редакторе: один toast, запрос не уходит, форма не сбрасывается"
    expected: "См. behavior_unverified_items"
    why_human: "Ветка ошибки не покрыта ни одним тестом"
  - test: "Backstop 03-08: параллельные submit не влияют друг на друга через exam-core"
    expected: "Пакет без изменяемого состояния модуля; оценка — чистая функция (конфиг типа, ключ, ответ, запасные баллы)"
    why_human: "Truth помечена verification: backstop; есть только presence-доказательство (в src нет let/var верхнего уровня, Map/Set модуля), held-out/property-теста на параллельность нет"
  - test: "Перенесено из 02-VERIFICATION.md: сравнение реальных текстов преподавателей на preview и на проде (02-08 Task 3, D-10)"
    expected: "Тексты рендерятся одинаково"
    why_human: "Тексты в Storage, доступ только у пользователя; тот же HEAD, пункт фазы 2 не закрыт"
  - test: "Ревью prohibitions уровня judgment: 03-08 (сохранённые results не пересчитываются), 03-09 (сохранённые вопросы и ключи не перепроверяются), 03-11 (разбор не подменяет сохранённые баллы и статус)"
    expected: "Пользователь соглашается с вердиктом агента (см. раздел Prohibitions)"
    why_human: "unverified-prohibition — human review recommended: вердикт агента не авторитетен для judgment-уровня"
---

# Phase 3: Exam core — отчёт верификации

**Цель фазы:** One package decides how each of the five question templates is validated, answered, normalized and scored, and the web and server both use it.
**Проверено:** 2026-10-04T03:30:48Z
**Статус:** human_needed
**Повторная верификация:** нет, первичная

Итог: цель фазы в коде достигнута. Пакет `@bio-exam/exam-core` существует, зависит только от `zod`, держит адаптер на каждый из пяти шаблонов (форма ключа и проверка при сохранении, форма ответа, «отвечено ли», нормализация, число ошибок, вердикты по частям). Сервер оценивает submit и проверяет сохранение через пакет. Редактор, `TestRunner` и оба разбора тоже работают через пакет. D2 и D5 закрыты, это подтверждают пакетные таблицы, HTTP-тесты на `test_*` и e2e на двух проектах. Блокирующих пробелов нет. Статус `human_needed`: остались шаги, которые выполняет только пользователь (коммит, CI, Vercel, прод-SQL, подтверждение текстов), две backstop-truth и одна ветка ошибки в редакторе, которую не проходит ни один тест.

Рабочее дерево: HEAD 7a6f95a, изменения фаз 2 и 3 не закоммичены. Поэтому prohibitions вида «план X не меняет код приложений» (03-01, 03-03) по одному дереву не проверить: изолировать дифф одного плана нельзя. Конечное состояние проверено, промежуточное — нет.

## Достижение цели

### Критерии успеха ROADMAP

| # | Критерий | Статус | Доказательство |
|---|----------|--------|----------------|
| SC1 | Учитель сохраняет `short_text` с несколькими вариантами (D5), сначала воспроизведено падающим тестом | ✓ VERIFIED | Red-first в закоммиченном HEAD: `git show HEAD:e2e/tests/authoring.spec.ts` — блок `known defect D5` (test.fail, 01-11). Сейчас: e2e `D5: a short answer with two accepted variants saves` — обычный тест, зелёный на `chromium-desktop` и `chromium-mobile` (сохранение, перезагрузка, `correct` = `['эксперимент','моделирование']`, поля Вариант 1/2 восстановлены). Vitest `question-validation.test.ts` (33 теста) без `KNOWN_DEFECTS`. Пакет: `validateQuestionForSave(short_text, compact_text_in_set, ['эксперимент','моделирование'])` → `null` (проверено на dist). Сервер: `exam-flow.test.ts` принимает этот ключ |
| SC2 | Для ключа `1243` и ответа `1234` число ошибок сервера и вердикты разбора совпадают, «Совпало позиций» удалено (D2) | ✓ VERIFIED | dist: `scoreQuestionByType` → `{maxPoints:2, earnedPoints:1, isCorrect:false, mistakesCount:1}`; `computeVerdicts` → `correct,correct,swapped,swapped`, `mistakes 1`, `errorUnits 1`. Разбор (`getSequenceReview`) зовёт тот же `computeVerdicts`, а тот — `countMistakes` той же метрики. `QuestionAnswerReview` рендерят и `TestRunner.tsx:756`, и `AttemptQuestionsList.tsx:73`. `rg 'Совпало позиций'` в app/e2e находит только assert отсутствия в `attempt-review-utils.test.ts:110`. e2e `D2: review error count equals the server error count` — обычный тест, зелёный на обоих проектах |
| SC3 | `exam-core` зависит только от `zod`; табличные тесты по пяти шаблонам ((ключ, ответ) → баллы и вердикты) и инвариант «все части верны ⇔ ошибок 0» | ✓ VERIFIED | `package.json`: `dependencies` = только `zod ^3.24.3`; в `yarn.lock` одна запись `zod@npm:^3.24.3` → 3.25.76. `boundaries.test.ts` (3 теста): импортируются только `zod` и относительные пути, нет react/lexical/drizzle-orm/@tiptap. Таблицы `*_SCORING_CASES` по пяти шаблонам, `*_REVIEW_CASES`; `invariants.test.ts` проходит все строки (не меньше 80, у каждого шаблона есть строки с ошибками и без). `yarn workspace @bio-exam/exam-core test`: 11 файлов, 498 тестов, всё зелёное (прогон верификатора) |
| SC4 | Редактор, test runner, разбор, сохранение и submit на сервере берут логику шаблона из `exam-core`; частных копий в `app/web` и `app/server` нет | ✓ VERIFIED | Поимённый обход D-17 ниже: 19 позиций удалены или стали импортом, позиция 20 (legacy) исключена по D-19. Защита в `yarn verify`: `scripts/exam-core-no-private-copies.test.mjs` (шаг `script-tests`) |
| SC5 | Схема результата попытки и слияние телеметрии объявлены один раз в пакете, оба приложения их импортируют | ✓ VERIFIED | `packages/exam-core/src/attempt-result.ts`, `telemetry.ts`. Server `public.ts:4-10` импортирует `SubmitResultSchema`, `mergeTelemetryMaps`, `AnswerValueSchema`, `TelemetryMapSchema`; `lib/tests/telemetry.ts`, `telemetry.test.ts`, `submit-result.ts` удалены. Web: `components/tests/telemetry.ts` реэкспортирует `mergeTelemetryMaps` из пакета, `TestRunner.tsx:207,317` его вызывает; `lib/tests/types.ts` берёт `SubmitResult*`, `QuestionTelemetry`, `AnswerValue` из пакета. Web импортирует типы, выведенные из схемы, а не саму zod-схему: web раньше держал только типы с пометкой «Keep in sync manually» |

### Truths планов (сводка по планам)

| План | Truths | Итог | Примечания |
|------|--------|------|-----------|
| 03-01 | 9 | 9 ✓ | `exam-flow.test.ts` (73 теста) через `import('../../app.js')` на `test_*`; D2 1/2 и 123/132 → 0/2; неотвеченный вопрос; идемпотентность по `clientAttemptId` (`повторный submit с тем же clientAttemptId…`, одна строка `test_attempts`); скрытие ключа (`showCorrectAnswer=false и неверный ответ: correctAnswer null`); отклонённое сохранение проверяется по числу строк. Случаи D-13 и `KNOWN_DEFECTS` в DB-тесте переключены, как задумано, в 03-09 и 03-08 |
| 03-02 | 5 | 5 ✓ | `question-validation.ts` вынесен, страница импортирует `../../../question-validation`; red D5 в Vitest переключён в 03-10 |
| 03-03 | 9 | 9 ✓ | Пакет, exports как у rbac, dist `index.js/.cjs/.d.ts/.d.cts`; `check-exam-core-dist.mjs` → `57 экспортов в ESM и CJS`; тесты слияния телеметрии (пусто, максимум, порядок) и числовых id в схемах содержимого |
| 03-04 | 6 | 6 ✓ | `app/web/package.json` `workspace:*`; `schema.ts:1` — только `import type`; шаг `migrations` зелёный; AGENTS.md:46, README.md:5,72,95,105 называют пакет; прод-сборка web воспроизведена |
| 03-05 | 7 | 7 ✓ | `registry.ts`, пять адаптеров с `answerSchema`/`normalizeAnswer`/`countMistakes`, `TEMPLATE_ADAPTERS: Record<QuestionUiTemplate, TemplateAdapter>`; `hamming_digits` перенесена без изменений (`sequence-digits.ts`); строка D2. Паритет со старой серверной оценкой удалён вместе с копией в 03-08 (как задумано); его заменяют таблицы, перенесённые из `scoring.test.ts` |
| 03-06 | 9 | 9 ✓ | `review.ts`: `computeVerdicts`, `isAnswered`, `readKey`, `errorUnits`, `allPartsCorrect`, `normalizeKeyValue`, `answerIdList`; `review.test.ts` (134 теста), `invariants.test.ts`; `mistakes` берётся из `countMistakes` (`resolveMistakes`) |
| 03-07 | 9 | 9 ✓ | `authoring.ts`: `validateQuestionForSave`, `AUTHORING_MESSAGES`, `keyShapeFor`, `toCanonicalKey`; `plural.ts`; `authoring.test.ts` (135 тестов), граница min/max/exactChoiceCount и порядок проверок |
| 03-08 | 7 | 6 ✓, 1 backstop | Submit через `scoreQuestionByType` пакета (`public.ts:781`); `lib/tests/scoring.ts` — 61 строка, только legacy; `question-types.ts` удалён; D-11 через `customType` `jsonbParsedByDriver` (`schema.ts:25-35`, `:442`), `answer-keys-jsonb.test.ts` (20 тестов) без `KNOWN_DEFECTS`; HTTP-строки `'1.50'` ↔ `'1.5'`. Backstop «нет изменяемого состояния модуля» — human |
| 03-09 | 7 | 7 ✓ | `validateQuestionWithType` = проверки «неизвестный тип», «тип отключён» + `validateQuestionForSave`; `schemas/tests.ts` без ветвления по ключу типа (superRefine остался только в `SaveTestSchema` (публикация) и `ReorderQuestionsSchema`); D-13 POST/PATCH//save → 400; порядок: `radio с одним вариантом и ключом ''` → `minOptionsMessage(2)`; `z.enum(QUESTION_UI_TEMPLATES)` (`index.ts:99,108`); `/save` на глобальной карте (`:1399`), POST/PATCH на карте теста (`:1727,:1867`) |
| 03-10 | 8 | 7 ✓, 1 ⚠️ | `validateQuestion(question, questionTypes)` через пакет; `undefined` → `null`, неизвестный тип → `'Тип вопроса не настроен в БД'` (строки теста); minOptions 3 → `'Добавьте минимум 3 варианта ответа'`; `getCreateQuestionsValidationError` с префиксом `Вопрос N: ` и глобальной картой (`useTestEditorModel.ts`); `keyShapeFor` в `QuestionEditor.tsx`; реестр в `admin/tests/types/index.ts` — реэкспорт. ⚠️ toast-ветка ошибки без теста |
| 03-11 | 13 | 12 ✓, 1 backstop | `getSequenceReview` → `summaryText` `Ошибок: N`; ячейки `role=list aria-label="Разбор по позициям"`, `size-10`, sr-only, иконки Check/X/ArrowLeftRight/Minus; цифры ключа в sr-only только при `correctAnswer != null` (`sequencePositionLabel(part, keyVisible)`); статус и баллы из сохранённых results; `TestRunner` через `isAnswered` пакета; `AttemptQuestionsList.test.ts` без изменений в `git status` и зелёный; `yarn e2e` зелёный. Backstop overflow 375px — human |
| 03-12 | 5 | 5 ✓ | Сервер `workspace:*`; конверты `SubmitAnswersSchema`/`SaveDraftAnswerSchema` той же формы; сборка exam-core после rbac в `vercel-build.cjs:42-43`, `vercel-build.sh:12`, `app/web/vercel.json`, `scripts/e2e.mjs:144`, `ci.yml:77-80` + `JOB_ORDER` в `check-ci-workflow.mjs:57-63` (шаг `ci-workflow` в `yarn verify` зелёный) |
| 03-13 | 8 | 8 ✓ | `cases/scoring.cases.ts` (`*_SCORING_CASES`), `cases/answer.cases.ts` (`ANSWER_SHAPE_CASES`), `scoring.test.ts` (108), `answer.test.ts` (22), `registry.test.ts` (15); строки D-12, порогов правил, `'1.50'`/`'1.5'`, границы перестановки. Паритет удалён в 03-08 вместе с копией (как задумано) |

**Score:** 104/107 truths verified (1 present, behavior-unverified; 2 backstop insufficient_spec).

### Поимённая проверка D-17 (20 позиций CONTEXT)

| # | Копия | Состояние |
|---|-------|-----------|
| 1 | `app/server/src/lib/tests/scoring.ts:72-313` | Удалена; файл 61 строка, только legacy `TestScoringRules` (D-19) |
| 2 | `app/server/src/lib/tests/question-types.ts` | Удалён (`git status`: D) |
| 3 | `question-type-resolver.ts:152-300` (`validateByTemplate`) | Удалено; `validateQuestionWithType` вызывает `validateQuestionForSave` из пакета |
| 4 | `schemas/tests.ts:9-199, 250-279` (`IdSchema`, `CorrectAnswerSchema`, superRefine по ключу типа) | Удалено; `OptionSchema`, `MatchingPairsSchema`, `QuestionKeyPayloadSchema` из пакета |
| 5 | `routes/tests/index.ts:96,105,117-125` | `z.enum(QUESTION_UI_TEMPLATES)`, `isMistakeMetricAllowedForTemplate` из пакета |
| 6 | `lib/tests/submit-result.ts` | Удалён |
| 7 | `lib/tests/telemetry.ts` | Удалён (и `telemetry.test.ts`) |
| 8 | `public.ts:34-43` | Удалены `SubmitAnswerValueSchema`, `TelemetrySchema`; импорт из пакета |
| 9 | `db/schema.ts:20-28` | `import type { QuestionTypeScoringRule, QuestionUiTemplate, TelemetryMap }` из пакета, локальных определений нет |
| 10 | `app/web/lib/tests/types.ts` | Типы шаблона, ответа, результата, телеметрии из пакета; пометок о ручной синхронизации нет |
| 11 | `admin/tests/types/index.ts:5-125, 273-324` | Реэкспорт реестра; `normalizeQuestionForSave` через `toCanonicalKey`; `normalize*CorrectValue` удалены. Legacy `TestScoringRules` / `createDefaultScoringRules` оставлены (D-19) |
| 12 | `QuestionEditorPageClient.tsx` (`normalizeDraftCorrect`, `validateQuestion`) | `normalizeKeyValue` из пакета; `validateQuestion` в `question-validation.ts` через пакет |
| 13 | `test-editor-utils.ts:64-110` | Через `validateQuestion` → пакет |
| 14 | `QuestionEditor.tsx:52-54` | `keyShapeFor(...) === 'text_variants'` (и в `handleTypeChange`) |
| 15 | `TestRunner.tsx:65-83` (`isAnswered`) | Удалено; `isAnswered` из пакета |
| 16 | `attempt-review-utils.ts:29-96` | `answerIds` через `answerIdList`, `getChoiceOptionReviewRows` через `computeVerdicts`, `formatAnswerLines` через `normalizeIdValue`/`normalizeIdRecord`/`answerIdList` |
| 17 | `QuestionAnswerReview.tsx:24-195` | Matching и последовательность через `computeVerdicts`; выбор — через `getChoiceOptionReviewRows` |
| 18 | `app/web/components/tests/telemetry.ts:1-27` | Реэкспорт из пакета; редьюсеры остались (Phase 6) |
| 19 | `QuestionTypeScoringRuleEditor.tsx` | Импортирует `getAllowedMistakeMetricsForTemplate`, `isMetricAllowedForTemplate` через `../types` (реэкспорт пакета) |
| 20 | `ScoringRulesEditor.tsx` | Не тронут, legacy (D-19 отложен) |

### Требуемые артефакты

| Артефакт | Статус | Детали |
|----------|--------|--------|
| `packages/exam-core/{package.json,tsdown.config.ts,tsconfig.json,vitest.config.ts}` | ✓ VERIFIED | Сборка tsdown, dist 4 файла, `check-exam-core-dist.mjs` OK |
| `packages/exam-core/src/{registry,normalize,scoring,review,authoring,authoring-messages,plural,telemetry,attempt-result,content}.ts` | ✓ VERIFIED | Содержательные, экспортируются из `index.ts`, используются обоими приложениями |
| `packages/exam-core/src/adapters/*.ts` (5 адаптеров, types, index, verdicts, authoring-rules) | ✓ VERIFIED | `TEMPLATE_ADAPTERS` диспетчеризует `countMistakes`, `computeVerdicts`, `validateQuestionForSave` |
| `packages/exam-core/src/cases/*.cases.ts`, `*.test.ts` | ✓ VERIFIED | 498 тестов |
| `app/server/src/routes/tests/exam-flow.test.ts` | ✓ VERIFIED | 73 теста, через `app.js` на `test_*` |
| `app/server/src/db/answer-keys-jsonb.test.ts` | ✓ VERIFIED | 20 тестов, `jsonb_typeof`, без `KNOWN_DEFECTS` |
| `app/web/app/(internal)/(protected)/admin/tests/question-validation{,.test}.ts` | ✓ VERIFIED | 33 теста |
| `scripts/check-exam-core-dist.mjs`, `scripts/exam-core-no-private-copies.test.mjs` | ✓ VERIFIED | Первый — в CI job build, второй — в `yarn verify` (`script-tests`) |

### Ключевые связи

| Откуда | Куда | Через | Статус |
|--------|------|-------|--------|
| `public.ts` | пакет `scoring.ts` | `scoreQuestionByType` (`:781`) | ✓ WIRED |
| `public.ts` | пакет `telemetry.ts`, `attempt-result.ts` | `mergeTelemetryMaps` (`:670, :821`), `SubmitResultSchema.parse` (`:859, :884`) | ✓ WIRED |
| `question-type-resolver.ts` | пакет `authoring.ts` | `validateQuestionForSave` | ✓ WIRED |
| `routes/tests/index.ts` | `validateQuestionWithType` | `/save :1399`, POST `:1727`, PATCH `:1867` | ✓ WIRED |
| `routes/tests/index.ts` | пакет `registry.ts` | `z.enum(QUESTION_UI_TEMPLATES)` | ✓ WIRED |
| `schema.ts` | пакет | `import type` (drizzle-kit, шаг `migrations` зелёный) | ✓ WIRED |
| `QuestionEditorPageClient.tsx` | `question-validation.ts` | `validateQuestion(nextQuestion, questionTypesData?.questionTypes)` | ✓ WIRED |
| `useTestEditorModel.ts` | `getCreateQuestionsValidationError` | SWR `/api/tests/question-types?includeInactive=true` | ✓ WIRED |
| `QuestionEditor.tsx` | пакет `authoring.ts` | `keyShapeFor` | ✓ WIRED |
| `TestRunner.tsx` | пакет `review.ts` | `isAnswered` (`:342, :842`), `mergeTelemetryMaps` | ✓ WIRED |
| `QuestionAnswerReview.tsx` | `attempt-review-utils.ts` → пакет | `getSequenceReview` → `computeVerdicts` | ✓ WIRED |
| `ci.yml` | `check-ci-workflow.mjs` | `Build exam-core`, `Check exam-core dist` в `JOB_ORDER.build` | ✓ WIRED |

### Поток данных (уровень 4)

| Артефакт | Значение | Источник | Реальные данные | Статус |
|----------|----------|----------|-----------------|--------|
| `QuestionAnswerReview` (последовательность) | «Ошибок: N», ячейки | `results[].userAnswer`, `results[].correctAnswer` из сохранённой попытки → `computeVerdicts` | Да (e2e читает «Ошибок: 1» из реального разбора) | ✓ FLOWING |
| `TestRunner` счётчик отвеченных | `answeredCount` | `answers` state → `isAnswered` пакета | Да (flow2 e2e) | ✓ FLOWING |
| Submit `earnedPoints` | баллы | `answer_keys.correct_answer` (Drizzle, без второго `JSON.parse`) + `getQuestionTypeMapForTest` → `scoreQuestionByType` | Да (HTTP-тесты на `test_*`) | ✓ FLOWING |

### Поведенческие проверки

| Поведение | Команда | Результат | Статус |
|-----------|---------|-----------|--------|
| Репозиторный гейт | `yarn verify` | `yarn verify: OK`, 8 шагов passed. Тесты прошли заново (exam-core 498, web 190, server 242, rbac 2, script-tests 134); lint, typecheck и build — cache hit turbo на тех же входах | ✓ PASS |
| E2E | `yarn e2e` | `108 passed`, EXIT 0; единственный ✘ — D1 `@known-defect` (test.fail) на обоих проектах; D2 и D5 — обычные тесты, зелёные | ✓ PASS |
| Тесты пакета | `yarn workspace @bio-exam/exam-core test` | 11 файлов, 498 тестов | ✓ PASS |
| D2 на dist | `node -e` + `scoreQuestionByType`/`computeVerdicts` | `mistakesCount 1, earnedPoints 1/2`; части `correct,correct,swapped,swapped`, `errorUnits 1` | ✓ PASS |
| D5 на dist | `validateQuestionForSave(short_text, compact_text_in_set, [...])` | `null` | ✓ PASS |
| Проверка dist | `node scripts/check-exam-core-dist.mjs` | `exam-core dist OK … 57 экспортов в ESM и CJS` | ✓ PASS |
| Прод-сборка server | `cd app/server && node vercel-build.cjs` | rbac → exam-core → server, `Build completed successfully`; `dist/routes/tests/public.js` импортирует пакет; в `dist/lib/tests` нет удалённых модулей | ✓ PASS |
| Прод-сборка web | `buildCommand` из `app/web/vercel.json` с плейсхолдерами env | EXIT 0, `✓ Compiled successfully`, список маршрутов собран | ✓ PASS |

### Выполнение probe

Фаза не объявляет `scripts/*/tests/probe-*.sh`; проб нет. Роль проверок выполняют `yarn verify` и `yarn e2e` (выше).

### Покрытие требований

| Требование | Планы | Описание | Статус | Доказательство |
|------------|-------|----------|--------|----------------|
| EXAM-01 | 03-03, 03-04, 03-12 | Пакет на чистом TS, только `zod`, сборка как у rbac, без React/Lexical/Drizzle/Tiptap | ✓ SATISFIED | `package.json`, `boundaries.test.ts`, dist-проверка |
| EXAM-02 | 03-05, 03-06, 03-07, 03-13 | Адаптер на шаблон: ключ и проверка при сохранении, ответ, «отвечено ли», нормализация, ошибки, вердикты | ✓ SATISFIED | `TemplateAdapter` с 10 членами, пять реализаций |
| EXAM-03 | 03-05, 03-06, 03-07, 03-13 | Табличные тесты (ключ, ответ) → баллы и вердикты + инвариант | ✓ SATISFIED | `cases/*`, `invariants.test.ts` |
| EXAM-04 | 03-01, 03-08, 03-09, 03-10, 03-11 | Редактор, runner, разбор, сохранение и submit через пакет; копии удалены | ✓ SATISFIED | D-17 таблица; guard `exam-core-no-private-copies.test.mjs` |
| EXAM-05 | 03-03, 03-04, 03-12 | Схема результата и слияние телеметрии в пакете, копии удалены | ✓ SATISFIED | SC5 |
| EXAM-06 | 03-01, 03-05, 03-06, 03-08, 03-11, 03-13 | D2: одна метрика, ошибки сервера = вердикты разбора | ✓ SATISFIED | SC2; оставлена `hamming_digits` (D-05), подтверждение правила — human |
| EXAM-07 | 03-02, 03-07, 03-09, 03-10 | D5: редактор сохраняет `short_text` с несколькими вариантами, сначала падающий тест | ✓ SATISFIED | SC1 |

Все семь ID заявлены планами и отображены на Phase 3 в `REQUIREMENTS.md:196-202`. Осиротевших требований нет. Статус `Pending` в таблице `REQUIREMENTS.md` обновляет оркестратор.

### Prohibitions

| План | Запрет | Уровень | Вердикт | Доказательство |
|------|--------|---------|---------|----------------|
| 03-01 | Только два новых тестовых файла, код приложения не меняется | test | не проверяемо по одному дереву | Все 13 планов в одном незакоммиченном дереве; конечное состояние согласовано с последующими планами |
| 03-01 | Тесты только на `test_*`, `DATABASE_URL` не читается | test | ✓ | `env.isolation.test.ts`, `test-database-url.test.ts` (41) в `yarn verify` |
| 03-02 | Вынос `validateQuestion` без изменения поведения | test | ✓ (для 03-02); тело затем заменено пакетом в 03-10, как задумано | Таблица текстов в `question-validation.test.ts` |
| 03-03 | Новых зависимостей кроме zod нет, версия zod не меняется | test | ✓ | одна запись zod 3.25.76 в `yarn.lock`; шаг `lockfile` зелёный |
| 03-03 | Форма результата, ответа, содержимого не меняется | test | ✓ | `attempt-result.ts` совпадает с удалённым `submit-result.ts`/`public.ts:34` (диф `public.ts`); `attempt-result.test.ts` |
| 03-03 | План не меняет приложения, CI, прод-сборку | test | не проверяемо по одному дереву | см. 03-01 |
| 03-04 | `schema.ts` без runtime-импорта из пакета | test | ✓ | `schema.ts:1` `import type`; шаг `migrations` зелёный |
| 03-05, 03-13 | Перенос не меняет баллы и isCorrect | test | ✓ | Таблицы, перенесённые из `scoring.test.ts`; HTTP-характеризация 03-01 зелёная после переключения |
| 03-05, 03-13 | Legacy `TestScoringRules` не переносится | test | ✓ | `rg TestScoringRules packages/exam-core` пусто; legacy в `scoring.ts` |
| 03-06 | Вердикты не меняют число ошибок | test | ✓ | `resolveMistakes(countMistakes(...))`; `invariants.test.ts` сверяет `verdicts.mistakes === countMistakes` |
| 03-07 | Проверка при сохранении не ослабляет серверные правила | test | ✓ | `SERVER_AUTHORING_RULES` в `authoring.cases.ts`; `exam-flow.test.ts` отклонения → 400 |
| 03-08 | Сохранённые results не пересчитываются, нет `UPDATE test_attempts` | judgment | ✓ (не авторитетно) — **unverified-prohibition — human review recommended** | `git diff HEAD -- app/server/src` не добавляет `update(testAttempts` |
| 03-08 | Правило скрытия ключа не меняется | test | ✓ | `public.ts:814` без изменений; тесты скрытия ключа в `exam-flow.test.ts` |
| 03-08 | Legacy и `/scoring-rules/*` не трогаются | test | ✓ | Диф `index.ts` не трогает `scoring-rules`/`scoringRules`; `LEGACY_D19_EXEMPTIONS` |
| 03-09 | Каждый маршрут сохранения вызывает `validateQuestionWithType` до записи | test | ✓ | `index.ts:1399, 1727, 1867`; 400 без новых строк в `exam-flow.test.ts` |
| 03-09 | Сохранённые вопросы и ключи не перепроверяются (D-12) | judgment | ✓ (не авторитетно) — **unverified-prohibition — human review recommended** | Проверка вызывается только в маршрутах записи; чтение ключа терпимо (`readKey`) |
| 03-10 | Web-проверка не заменяет серверную | test | ✓ | Сервер проверяет тем же пакетом (03-09); `undefined` типов → web пропускает, решает сервер |
| 03-10 | Legacy web не трогается | test | ✓ | `ScoringRulesEditor.tsx` без изменений; `TestScoringRules`, `createDefaultScoringRules` на месте |
| 03-11 | Разбор не показывает цифры ключа без `correctAnswer` | test | ✓ | `sequencePositionLabel(part, keyVisible)`, `showCells` требует `correctAnswer != null`; строки `attempt-review-utils.test.ts` |
| 03-11 | Разбор не подменяет сохранённые баллы и статус | judgment | ✓ (не авторитетно) — **unverified-prohibition — human review recommended** | Статус и баллы из `results` (`isCorrect`, `earnedPoints`, `points`); `AttemptQuestionsList.test.ts` без правок |
| 03-12 | Форма конвертов и результата не меняется | test | ✓ | Диф `public.ts`: схемы заменены дословными копиями из пакета |
| 03-12 | Новых пакетов из реестра нет | test | ✓ | `yarn.lock`: ссылка на воркспейс, zod прежний |

### Найденные антипаттерны

| Файл | Строка | Что | Серьёзность | Влияние |
|------|--------|-----|-------------|---------|
| — | — | `TBD`/`FIXME`/`XXX`/`TODO`/`HACK` в изменённых файлах фазы | нет | Скан чистый |
| `admin/tests/question-types/QuestionTypesPageClient.tsx` | 238 | Пять `<SelectItem value="single_choice">…` вручную вместо обхода `QUESTION_UI_TEMPLATES` | ℹ️ Info | Перечисление шаблонов в UI, не логика проверки/оценки; D-04 оставляет компонентам ветвление по id шаблона; guard D-17 такие литералы не ловит |
| `admin/tests/question-types/[key]/QuestionTypeDetailsPageClient.tsx` | 319 | То же | ℹ️ Info | То же |
| `admin/tests/components/QuestionCard.tsx` | 23-41 | `typeLabels` по ключу типа (подписи и иконки) и литеральный union шаблонов вместо `QuestionUiTemplate` | ℹ️ Info | Только отображение; не входит в D-17 |
| `app/server/src/db/schema.ts`, `public.ts`, `scripts/e2e.mjs` | 442, 40, 142 | Изменённые строки сохранили или расширили существующие комментарии | ℹ️ Info | Правило пользователя «без комментариев»; новых комментариев в новых файлах нет |

### Требует проверки человеком

1. **Коммиты, push, CI.** Закоммитить фазы 2 и 3 по границам планов, запушить и получить зелёный CI на запушенном HEAD.
2. **Vercel preview** web и server под Node 24: `/healthz`, вход, прохождение теста со всеми пятью шаблонами, разбор последовательности. Объединяется с preview фазы 2.
3. **Прод-SQL D-11** (read-only, `03-CONTEXT.md` `<specifics>` п. 3): распределение `jsonb_typeof(correct_answer)` и `short_text`-ключи, похожие на JSON-литерал. Если второй запрос > 0 — до деплоя выгрузить ключи и решить по ним.
4. **Прод-SQL для старых попыток последовательности** (п. 1): число попыток до деплоя `04c621c` с 0 баллов и длиной ответа > 3.
5. **Подтвердить правило D-05**: соседняя перестановка при длине > 3 — одна ошибка.
6. **Подтвердить тексты D-08**: «Ошибок: N», «Соседняя перестановка считается одной ошибкой.», описание `hamming_digits`.
7. **Подтвердить D-13**: более строгая проверка при сохранении на web и server.
8. **375px overflow**: ответ из 20+ цифр на ключ из 4, ячейки переносятся, прокрутки нет.
9. **Ошибка в редакторе**: один toast, запрос не уходит, форма не сбрасывается (ветку не покрывает ни один тест).
10. **Backstop 03-08**: параллельные submit через exam-core независимы (есть только presence-доказательство: нет изменяемого состояния модуля).
11. **Из фазы 2**: сравнение текстов преподавателей на preview и на проде (02-08, D-10).
12. **Judgment-prohibitions 03-08, 03-09, 03-11**: подтвердить вердикт агента.

Открытое решение (не проверка): D-19 — удалять ли legacy `TestScoringRules` и `/api/tests/scoring-rules/*`.

### Пробелы

Блокирующих пробелов нет. Все пять критериев ROADMAP и все семь требований EXAM подтверждены кодом, тестами в `yarn verify` и e2e. Три truth не засчитаны: две backstop (параллельность, overflow 375px) и ветка ошибки редактора без теста. Они вместе с пользовательскими шагами (коммит/CI, Vercel, прод-SQL, подтверждение D-05, D-08, D-13) ведут к статусу `human_needed`. D1 и N1 отложены на Phase 5, legacy D-19 ждёт решения пользователя.

---

_Проверено: 2026-10-04T03:30:48Z_
_Верификатор: Claude (gsd-verifier)_

## Закрытие

2026-10-05. Код фазы работает на проде (`bio-exam.ru`, свой сервер, ветка `master`). Пункты раздела «Человеческая проверка» пользователь подтвердил как выполненные; пункты про preview Vercel заменены работой на своём сервере.

`covered_digest` пересчитан на `dev` 41f580a (файлы фазы менялись следующими фазами). Верификатор заново не запускался: на этом коде проходят `yarn verify` и e2e.

`covered_digest` пересчитан на `dev` 1962edd после тестов покрытия, уборки web-тестов и удаления мёртвого кода (b720f21, 3513919, 65f04e5).
