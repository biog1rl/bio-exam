# Архитектурный обзор фазы 11: находки A и B

- Источник: архитектурный обзор кода `dev` 2026-10-06 (соседняя сессия, чтение при HEAD 26efcdb; номера строк могли сдвинуться после 11-07…11-15).
- Решения пользователя 2026-10-06: находки делаются в фазе 11 тремя планами до заключительного 11-18 — 11-19 (A, сервер), 11-20 (B, клиент), 11-21 (C, форма настроек теста). Поведение для ученика, учителя и API не меняется; это углубление модулей по ADR-0005 под защитой существующих тестов (ADR-0003).

## A. Сервер: модуль «сессия попытки» (сила Strong)

Уже хорошо: какой исход побеждает, решается в одном месте — все пути сходятся в `finalizeOnce`; гонку решают `FOR UPDATE` в `submitAttempt` и повтор по `draft_changed` (`deadline.ts`, `submit.ts`).

Чего нет в одном месте:

1. **Правило «когда запускать финализацию» размазано по шести точкам.**
   - `/start` финализирует дважды: `finalizeExpiredOpenSession` и затем `catch SessionNeedsFinalizationError` с финализацией и повтором старта (`public.ts`).
   - PATCH черновика сам проверяет `timeLimitMinutes != null`, финализирует и выбрасывает исход (`public.ts`).
   - `/submit` финализирует при `precheck.expired` (`public.ts`).
   - GET `sessions/:sessionId` финализирует через `readSessionFate` (`deadline.ts`).
   - Фоновая задача `finalize-deadlines` (`background-jobs/jobs.ts`).
   Каждый новый вход (фото в фазах 12–13, «Готово, фото загружены» в фазе 14) должен сам повторить порядок «сначала финализировать, потом писать».

2. **Словарь состояний одной сессии — пять объединений.** `SaveSessionDraftResult` (3), `PrecheckSubmitResult` (5), `SubmitAttemptOutcome` (6), `FinalizeOutcome` (6), `SessionFateRead` (4), плюс `SessionFateSchema` в ответе. Маршрут переводит их в HTTP несколькими блоками; невозможный для клиента `draft_changed` уходит через `throw`.

Дубли, которые убираются и без перестройки:
- ответ «сдано по дедлайну» (409 с видом попытки) собирается в двух местах `public.ts`; `serverNow` читается отдельным запросом уже после решения;
- «закрыть сессию как истёкшую» записано трижды (`submit.ts`, `deadline.ts`, `sessions.ts`);
- «сессия принадлежит тесту и ученику» — три предиката: `sessionWhere`, `sessionOfPair`, `openSessionOf`;
- перевод `ScoreSubmissionResult` → `ScoredAttemptFacts` (литерал `resultsVersion: 2`, `hasOpenQuestion`) склеен трижды: `public.ts` (`/submit`), `deadline.ts`, `app/server/src/scripts/e2e-seed.ts`; в сиде уже расхождение — нет `uploadWindowMinutes` и `hasOpenQuestion`;
- поля `earnedPoints`/`totalPoints`/`scorePercentage`/`passed` в `ScoredAttemptFacts` `submitAttempt` не читает, а берёт из `outcome.submitted.*`.

Тесты: `attempt-deadline` (~30+), `attempt-submit` (16), `attempt-time-limit` (14), `attempt-races` (6), `background-jobs` (10); почти все через HTTP (`test-support/attempt-world.ts`), время сдвигает `shiftStartedAt`. Цикл `MAX_DRAFT_ROUNDS` не покрыт; `draft_changed` проверен одним прямым вызовом; правило «какой путь победил» проверяется только связкой HTTP и база.

Направление (по ADR-0005, как «оценённая попытка»): модуль «сессия попытки» сам решает, когда финализировать, и отдаёт один словарь исходов; маршрут переводит его в HTTP один раз. Интерфейсы не спроектированы — это задача плана.

Из находки №8 обзора («вопросы теста с шаблоном», сила Speculative) в A входит только часть внутри модуля сессии попытки: проверка ответов черновика по шаблону вопроса собрана дважды — при сохранении черновика (`saveSessionDraft` в `sessions.ts`) и в фильтре финализации (`keepScorableAnswers` и соседи в `deadline.ts`); `getQuestionTypeMapForTest` вызывается в обоих путях. Одно правило «какие ответы черновика допустимы» — в модуле. Читатели вопросов учителя и ученика, редактор и оценка (`scored-attempt/facts.ts`) — вне фазы 11.

## B. Клиент: «исход сдачи» (сила Worth exploring)

Ядро глубокое: `classifySubmitFailure` (`attempt-submit-flow.ts`) и `applySubmitFailure` (`lifecycle.ts`), покрыто `lifecycle-submit.test.ts`.

Утечки:
- `TestRunner.tsx` — вложенный тернарник заново сочетает `blockReason`, локальный `alreadySubmittedClosed`, `submitFailed`, `deadlinePassed` и `submitRejection`, чтобы выбрать плашку; в Vitest это не проверить, только e2e. После 11-11…11-14 добавились панель дедлайна, запасная панель «Ответ принят» (`outcomeShown`) и пометка о недошедшем тексте.
- Что стирается при каждом исходе, решается в двух местах: таблица `STORAGE_KEYS_BY_EVENT` и императивные `removeFrozen()` в нескольких ветках, `detachWal` и условное удаление WAL в `keepUnsent`/`keepExpiredUnsent`.
- `toSaveOutcome` (`lifecycle.ts`) переводит 404 на PATCH в `stop`; сервер после 11-06 отвечает 404 на PATCH после льготы. Практического вреда не видно (после дедлайна поля только для чтения, сдачу ведёт автосдача), но правило должно быть в одном месте и проверено.

Направление: выбор плашки (что показать ученику) и решение «что стереть» — в модуле попытки (`attempt-lifecycle`), а не в React; `TestRunner` остаётся рисующим компонентом (охранник `draft-durability-guards`).

## C. Web: настройки теста — один модуль формы (находка №4, сила Strong)

Файлы: `app/web/app/(internal)/(protected)/admin/tests/components/test-editor/useTestEditorModel.ts` (эффект синхронизации, сохранение), `test-editor-view.ts`, `test-editor-utils.ts`, `test-editor-api.ts` (тело PATCH), `photo-window.ts` (11-10), `app/web/app/(internal)/(protected)/admin/tests/types/index.ts`, `app/web/lib/http/request.ts` (`json?: unknown`).

Проблема: список полей настроек теста повторён в семи местах — `TestFormData`, `createInitialTestForm`, `SettingsFields`, `SavedTestSettings` и `savedSettings`/`settingsOf`, эффект синхронизации в `useTestEditorModel.ts` поле за полем, тело PATCH в `test-editor-api.ts`, проверки — зеркало серверной zod-схемы. Тело запроса не типизировано (`json: unknown`), поэтому забытое поле ломает «изменено ли» или тихо не уходит на сервер. Поле окна для фото (11-10, `12139cb`) задело 7 файлов.

Направление: один модуль без React владеет формой настроек теста — из сохранённого в форму, из формы в тело запроса, проверки (включая поле окна для фото) и сравнение «изменено ли»; хук редактора только вызывает модуль; новое поле — одна правка, а там, где его забыли, ошибка typecheck. Интерфейс проверяется в Vitest без DOM. Серверная схема остаётся в `app/server/src/schemas/tests.ts`; перенос её в общий пакет — отдельное решение (не в 11-21). Бюджет первой загрузки редактора (`yarn editor:budget`) не растёт.

## Отчёт обзора

Полный отчёт с диаграммами (8 находок): `/private/tmp/claude-501/-Users-kdvornichenko-bio-exam/e4997ed5-f5fe-4ebf-affb-7991303d1079/scratchpad/architecture-review-20261006-1700.html` — находки №3 (A и B), часть №8 (в A) и №4 (C) касаются фазы 11.

## Вне фазы 11 (не брать в 11-19…11-21)

Каталог типов вопросов (фаза 11.1, ADR-0008), правила оценивания, история попыток, назначение, «Показать ещё», вопросы с шаблоном, авторизация по построению (ADR-0006, Proposed) — отдельно.

## Отложено после исполнения 11-19…11-21

- C (11-21): первая загрузка редактора вопроса выросла на 1785 Б raw и 582 Б gzip. Бюджет `yarn editor:budget` не превышен, но обзор ждал «не растёт». Причина: `QuestionEditorPageClient.tsx` импортирует `test-editor-api.ts`, который теперь тянет модуль формы. Исправление — разделить `test-editor-api.ts` на запросы редактора теста и запросы редактора вопроса.
- A (11-19): строка 41 `.agents/skills/bio-exam-api/SKILL.md` называет удалённую `closeExpiredSession`; навыки обновляет 11-18 по 11-19-SUMMARY и 11-22-SUMMARY.
