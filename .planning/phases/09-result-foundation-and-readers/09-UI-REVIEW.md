# Фаза 9 — UI-ревью

**Дата:** 2026-10-06
**Эталон:** 09-UI-SPEC.md (approved)
**Скриншоты:** не снимались (аудит по коду; вычисленный контраст и переполнение на 375/768/1280 покрыты `e2e/tests/attempt-review-pending.spec.ts`, 09-UAT.md пп. 2–3)
**Снимки взаимодействий:** off (`workflow.ui_interaction_capture` не включён); выводы по взаимодействию взяты из кода

---

## Оценки по столпам

| Столп | Оценка | Главное |
|-------|--------|---------|
| 1. Тексты | 3/4 | Все тексты контракта на месте дословно; добавлен вне контракта баннер `answer_shape_invalid` с противоречивой инструкцией |
| 2. Визуал | 3/4 | Метки общие, без копий разметки; у соседних плиток «показано» и «на проверке» одна пиктограмма `Clock3` |
| 3. Цвет | 3/4 | Акцент только в двух местах по контракту; метка `bg-secondary` стоит на фоне `bg-secondary` (панель TestRunner, карточки дашборда) |
| 4. Типографика | 4/4 | Размеры 12/14/30/36 и веса 400/500 как в контракте, `font-semibold` Badge переопределён |
| 5. Отступы | 3/4 | Шкала соблюдена; метка `py-1` внутри текстовой строки «Мои попытки» делает строки разной высоты |
| 6. Опыт | 3/4 | Состояния pending/graded/none, пустые, фильтр, `aria-pressed` реализованы; выключенная плитка без пояснения, `sequence_digits` молча обрезается на 200 вопреки контракту |

**Итого: 19/24**

---

## Три главных исправления

1. **WARNING — баннер `answer_shape_invalid` вне контракта и противоречив** — `app/web/components/tests/attempt-submit-flow.ts:86-89`: «Обновите страницу, проверьте ответы и отправьте снова» с действием `reload`; ученик не знает, сохранятся ли ответы после перезагрузки, и в UI-SPEC (Поверхность 8) этой причины нет. Исправление: внести текст в UI-SPEC / Copywriting Contract и сформулировать одно действие, например «Один из ответов сохранён в неверном виде. Обновите страницу: ответы восстановятся, проверьте их и отправьте снова.» (если восстановление действительно гарантировано WAL).
2. **WARNING — одинаковая пиктограмма у соседних плиток** — `AdminAttemptsClient.tsx:372` (`StatTile «показано» icon={Clock3}`) рядом с новой `ReviewTile` (`:102`, тоже `Clock3`): в ряду из пяти плиток две выглядят одинаково, а `Clock3` по контракту — знак «На проверке». Исправление: сменить пиктограмму «показано» на `Eye`/`ListFilter`.
3. **WARNING — метка «На проверке» сливается с фоном** — `TestRunner.tsx:282` (панель `bg-secondary`) и `DashboardClient.tsx:483,539` (карточки `bg-secondary/70`): `ReviewStatusChip` тоже `bg-secondary`, отделяет его только пунктир `border-secondary-foreground/40`. Текст AA проходит (e2e), но метка теряет форму плашки. Исправление: на этих двух фонах дать метке `bg-card` через проп `className` или поставить панели TestRunner `bg-card` с рамкой `border-border`.

Дополнительно (WARNING):
4. `QuestionInput.tsx:79-88` — `maxLength={SHORT_TEXT_MAX_LENGTH}` стоит и у `sequence_digits`, а UI-SPEC Поверхность 8 говорит «Поле `sequence_digits` не меняется». Решение принято в 3be6c16, но контракт не обновлён; баннер `short_text_too_long` («Краткий ответ…») для поля цифр звучит неточно. Исправление: обновить UI-SPEC и, если сервер шлёт ту же причину для `sequence_digits`, сделать текст нейтральным («Ответ не может быть длиннее 200 знаков…»).
5. `AdminAttemptsClient.tsx:93-96` — выключенная плитка при `N = 0` (`disabled:opacity-60`) не объясняет, почему не нажимается; подпись `muted-foreground` при 60% непрозрачности опускается ниже 4,5:1 (WCAG допускает для disabled, но правило проекта меряет весь текст). Исправление: оставить непрозрачность 100% и обойтись `cursor-default`, либо добавить `title`/`aria-describedby` «Попыток на проверке нет».
6. `TestRunner.tsx:428-441` — в строке «Мои попытки» метка (`py-1`, 24px) и `TeacherCheckedMark` вставлены в текст `text-sm` через ` / `; строки pending/graded выше строк none, и метка выравнивается по базовой линии без `items-center`. Исправление: обернуть содержимое `li` в `flex flex-wrap items-center gap-x-1`.
7. `AttemptQuestionsList`/`TestRunner.tsx:378` — «до {points} балл.» рядом с «{earned} / {points} баллов» (TestRunner) — два написания единицы в одном списке. Контракт задаёт «балл.» только для pending, поэтому это INFO, но в TestRunner стоит выровнять с «баллов».

---

## Подробно

### Столп 1: Тексты (3/4)
Сверено дословно с Copywriting Contract:
- «На проверке» — `ReviewStatusChip.tsx:12`; «проверено учителем» — `TeacherCheckedMark.tsx:7`; «предварительно X из Y» / «авто X из Y» — `AttemptReviewLine.tsx:23,28`, `DashboardClient.tsx:132`, `UserProfileAssignmentsPage.tsx:786`, `AdminAttemptsClient.tsx:191`.
- Фильтр: «Проверка: все» / «На проверке» / «Проверено», пункты «Все/На проверке/Проверено», `aria-label="Проверка"` — `AdminAttemptsClient.tsx:42-46,391-402`.
- Пустые состояния (три пары) — `:118-134` дословно; «без попыток на проверке» — `:365`.
- Шапка: «Процент и итог появятся после проверки.» — `AttemptReviewHero.tsx:56`; «баллов автопроверки» — `:80`. Экран ученика: «Процент и итог появятся после проверки учителем.» — `TestRunner.tsx:289`.
- Баннеры 422: четыре текста из контракта, числа из констант через `Intl ru-RU` — `attempt-submit-flow.ts:67-85`.
- Тип open: «Открытые вопросы пока недоступны.», «Баллы за открытый вопрос выставляет учитель: от 0 до 3.» — `QuestionTypeDetailsPageClient.tsx:449,473`.
- Отклонения: пятая причина `answer_shape_invalid` (`:86-89`) не в контракте и с двойственной инструкцией; «Краткий ответ…» применяется к полю цифр (см. п. 4).

### Столп 2: Визуал (3/4)
- Плюс: все читатели берут метки из трёх общих компонентов; четвёртого стиля плашки нет (grep по `На проверке` вне `attempt-result/` находит только тексты фильтра/навигации/статуса вопроса, как требует контракт).
- Плюс: в строке списка pending нет процента и вердикта, `Clock3 text-muted-foreground` вместо `CheckCircle2` — `AdminAttemptsClient.tsx:186-194`.
- Минус: `Clock3` у «показано» и «на проверке» (п. 2); в шапке разбора `Clock3` и у пиктограммы pending (`AttemptReviewHero.tsx:49`), и у метрики «время» (`:92`) — тот же конфликт значения.
- Минус: метка на фоне своего цвета (п. 3).

### Столп 3: Цвет (3/4)
- Акцент: новых мест с `primary` два, как в контракте — `text-primary` у `Clock3` плитки (`:102`) и `border-primary` нажатой плитки (`:97`); hover `border-primary/45` унаследован (отмечено чекером).
- Метки на непрозрачных парах `secondary`/`accent`; контраст по вычисленным стилям проверен e2e (UAT п. 2).
- Панель pending в TestRunner `border-border bg-secondary` вместо зелёной — верно (`TestRunner.tsx:282`).
- Минусы: метка `bg-secondary` на `bg-secondary`/`bg-secondary/70` (п. 3); `opacity-60` у выключенной плитки снижает контраст подписи (п. 5). Жёстко заданные `green-*/red-*/emerald-*` — существующие плашки, вне фазы.

### Столп 4: Типографика (4/4)
- Метка: `Badge` `text-xs` + `font-medium` переопределяет `font-semibold` — `ReviewStatusChip.tsx:9`; подписи `text-xs text-muted-foreground`; плитка `font-serif text-3xl leading-none`; шапка `font-serif text-4xl leading-none break-words` одинаково для pending и final — `AttemptReviewHero.tsx:50`. Новых размеров/весов вне контракта не найдено.

### Столп 5: Отступы (3/4)
- `px-2 py-1 gap-1` у обеих меток, `gap-x-2 gap-y-1` у строки, `p-4`/`mt-2` у плитки, `mt-1` у отметки, `mb-3 flex flex-wrap gap-2` ряда фильтров, колонки `10.625rem` — всё по контракту.
- Минус: строки «Мои попытки» разной высоты из-за меток внутри текста (п. 6). Pending-шапка использует `mt-6` перед словом (`AttemptReviewHero.tsx:50`) — значение соседнего final, допустимо.

### Столп 6: Опыт (3/4)
- `attemptResultView` — единственное место решения, `null`-итог уходит в `pending`, без `?? 0` (`attempt-result-view.ts:25`); `autoTotalPoints === 0` → `auto: null`, строка «X из Y» скрыта во всех читателях.
- Плитка: `button`, `aria-pressed`, `focus-visible:ring-2 ring-ring`, `disabled` при `N=0` кроме включённого фильтра, снятие повторным нажатием — `AdminAttemptsClient.tsx:90-106,373-378`. Фильтр в URL, `hasFilters` учитывает review (`:293`).
- Разбор: пункт навигации «На проверке» только при наличии (`attempt-review-utils.ts:30`), колонка сводки и `grid-cols-4` по счётчику (`AttemptReviewSummary.tsx:80-94`), «до N балл.» (`:361`).
- Средний: `—` при `null` (`AdminAttemptsClient.tsx:296`); дашборд без полосы у pending.
- Минусы: п. 4 (молчаливая обрезка поля цифр вне контракта), п. 5 (выключенная плитка без объяснения).

Registry audit: сторонние блоки в фазе не использовались (UI-SPEC, Registry Safety), проверок не требуется.

---

## Проверенные файлы
- app/web/components/tests/attempt-result/{ReviewStatusChip,TeacherCheckedMark,AttemptReviewLine}.tsx
- app/web/lib/tests/attempt-result-view.ts
- app/web/app/(internal)/(protected)/admin/attempts/AdminAttemptsClient.tsx
- app/web/app/(internal)/(protected)/dashboard/DashboardClient.tsx
- app/web/app/(internal)/(protected)/tests/[topicSlug]/[testSlug]/TestLandingPageClient.tsx
- app/web/components/tests/TestRunner.tsx, QuestionInput.tsx, attempt-submit-flow.ts
- app/web/components/users/UserProfileAssignmentsPage.tsx
- app/web/components/tests/attempt-review/{AttemptReviewHero,AttemptReviewSummary,AttemptQuestionsList,AttemptReviewNav}.tsx, attempt-review-utils.ts
- app/web/app/(internal)/(protected)/admin/tests/question-types/[key]/QuestionTypeDetailsPageClient.tsx

## Исправлено после ревью

- 9bfc67a: пункты 1, 2, 3, 4, 6 (баннер `answer_shape_invalid` и нейтральный текст предела занесены в UI-SPEC, пиктограммы `Eye`/`Timer`, `bg-card` у метки на серых панелях, выравнивание строк «Мои попытки»). Пункты 5 (выключенная плитка, допускается WCAG) и 7 (INFO) оставлены.
