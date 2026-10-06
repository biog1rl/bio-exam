---
phase: 09
review: 09-REVIEW.md
titles: json
findings:
  - id: CR-01
    severity: critical
    disposition: fixed
    title: "Предел длины ответа (SEC-04/N3) обходится ответом не-строкой и ответом на вопрос с выбором"
  - id: WR-01
    severity: warning
    disposition: fixed
    title: "`sequence_digits` ограничен на сервере (200), но не на клиенте; отказ черновика не виден, а на дедлайне ответы теряются"
  - id: WR-02
    severity: warning
    disposition: deferred
    title: "Открытый вопрос всегда «На проверке», даже в попытке со статусом `graded`"
  - id: WR-03
    severity: warning
    disposition: fixed
    title: "В разборе проверяющего у открытого вопроса пометка «Ключ на момент сдачи не сохранён»"
  - id: IN-01
    severity: info
    disposition: skipped
    title: "Факты сдачи передаются в `submitAttempt` дважды"
  - id: IN-02
    severity: info
    disposition: deferred
    title: "Профиль ученика пишет «нет попыток», когда в периоде есть попытки на проверке"
  - id: IN-03
    severity: info
    disposition: skipped
    title: "Карточка «На проверке: N» считает всю зону, а список под ней по умолчанию только с активными учениками"
  - id: IN-04
    severity: info
    disposition: skipped
    title: "Черновик проверяет вопрос до проверки сессии: 400 раньше 404 и лишние запросы"
  - id: IN-05
    severity: info
    disposition: skipped
    title: "`chart-data` читает `final_score_percentage` напрямую, а не через `attemptResultColumns`"
  - id: IN-06
    severity: info
    disposition: deferred
    title: "`materializeAttemptOutcome` переписывает `graded_at` при каждом пересчёте, `repairFromFacts` пишет вне транзакции"
  - id: IN-07
    severity: info
    disposition: deferred
    title: "`ON CONFLICT (\"key\") DO NOTHING` молча оставляет свой тип с ключом `open`"
  - id: IN-08
    severity: info
    disposition: skipped
    title: "Длина считается в кодовых единицах UTF-16, а не в знаках"
  - id: IN-09
    severity: info
    disposition: deferred
    title: "В ответе `ANSWERS_INVALID` нет вопроса, который нарушил правило"
open: 0
total: 13
---

# Phase 09: Code Review Disposition

| Finding | Severity | Disposition | Source |
|---------|----------|-------------|--------|
| CR-01 | critical | fixed | 3be6c16: `findAnswerViolation` проверяет форму по `answerSchema` адаптера и размер у всех шаблонов (`ANSWER_ITEM_MAX_LENGTH` 200, `ANSWER_ITEMS_MAX` 50), причина `answer_shape_invalid` на сдаче (422) и черновике (400), баннер в web; devils-advocate F1 CONFIRMED |
| WR-01 | warning | fixed | 3be6c16: `maxLength` 200 у поля последовательности. Невидимый отказ черновика и текст «краткий ответ» с UI больше недостижимы. Возврат к заданиям после автосдачи задуман (lifecycle-submit.test.ts:476), закрытие на дедлайне — фаза 11 (devils-advocate F2d REFUTED) |
| WR-02 | warning | deferred | Фаза 15: в фазе 9 нет оценок по вопросам, `graded` только в тестах и сиде (devils-advocate F3 DOWNGRADED → INFO); deferred-items.md |
| WR-03 | warning | fixed | 3be6c16: `getAdminReviewNote` не даёт `key-unknown` у вопроса `pending` |
| IN-01 | info | skipped | Дублирование без поведенческого эффекта |
| IN-02 | info | deferred | Текст пустого графика профиля при одних попытках на проверке; deferred-items.md |
| IN-03 | info | skipped | По D-10: `pendingTotal` считается по всей зоне видимости |
| IN-04 | info | skipped | Порядок 400/404 не раскрывает чужих данных: вопрос ищется в своём тесте |
| IN-05 | info | skipped | Агрегаты читают `final_*` с фильтром `review_status <> 'pending'`; строки идут через `attemptResultColumns` |
| IN-06 | info | deferred | Условие фазы 11/15: `reconcileOutcomes` с починкой и загрузчиком без оценок вернёт `graded` в `pending`; `graded_at` при пересчёте решается в фазе 15 (devils-advocate F5); deferred-items.md |
| IN-07 | info | deferred | Шаг пользователя перед выкаткой: запрос на строку `open` до и после 0026 (devils-advocate F9) |
| IN-08 | info | skipped | Предел по `String.length` закреплён тестом «эмодзи», запас для текста достаточный |
| IN-09 | info | deferred | `questionId` в ответе `ANSWERS_INVALID` — с фазы открытых ответов; deferred-items.md |

Dispositions: `open` (recorded, not yet triaged), `fixed`, `skipped`, `deferred`.
Set `deferred` by hand and put the reason in the Source cell; both are preserved. A `|` in the reason is kept as prose and escaped on the next run.
Re-running the gate keeps every row it can. A row the current review no longer reports is kept and its Source cell flagged, so a finding does not leave this record silently. ONE exception: when a finding id is REUSED by a different finding, the earlier decision cannot keep a row — the id is taken — and it is dropped. A RECORDED decision (anything but `open`) is named on the console when that happens; a row still at `open` is replaced silently, because `open` records no decision to lose.
