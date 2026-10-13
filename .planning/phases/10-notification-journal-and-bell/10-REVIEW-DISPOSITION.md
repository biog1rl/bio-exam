---
phase: 10
review: 10-REVIEW.md
titles: json
findings:
  - id: WR-01
    severity: warning
    disposition: fixed
    title: "`isInternalHref` пропускает адрес, который браузер разбирает как внешний"
  - id: WR-02
    severity: warning
    disposition: fixed
    title: "Публикация теряет событие `test.assigned`, если параллельно сняли публикацию"
  - id: IN-01
    severity: info
    disposition: skipped
    title: "Неиспользуемые экспорты из входа модуля"
  - id: IN-02
    severity: info
    disposition: deferred
    title: "Оркестрация «назначение + событие» живёт в файле маршрута"
  - id: IN-03
    severity: info
    disposition: skipped
    title: "Префикс вкладки снимает законное начало заголовка вида «(N) »"
  - id: IN-04
    severity: info
    disposition: skipped
    title: "«Прочитать все» зависит только от числа, а не от списка"
  - id: IN-05
    severity: info
    disposition: skipped
    title: "Догрузка теряется при перезапросе первой страницы во время запроса"
open: 0
total: 7
---

# Phase 10: Code Review Disposition

| Finding | Severity | Disposition | Source |
|---------|----------|-------------|--------|
| WR-01 | warning | fixed | 3cdc44c: `INTERNAL_HREF = /^\/(?![/\\])[^\u0000-\u001F\u007F]*$/`, строки с TAB/LF/CR в `format.test.ts` (devils-advocate F1 DOWNGRADED → MINOR: сервер строит `href` из slug `^[a-z0-9-]+$` через `encodeURIComponent`) |
| WR-02 | warning | fixed | 3cdc44c: `eq(tests.isPublished, existingTest.isPublished)` в UPDATE без переноса, `is_published` в `lockTest` и сравнение в `lockPlannedTest` — гонка даёт 409 «Содержимое изменилось» (devils-advocate F2 DOWNGRADED → MINOR: окно — время одного запроса) |
| IN-01 | info | skipped | Экспорты модуля — его публичный вход; лишнего поведения нет |
| IN-02 | info | deferred | `addAssignments` в файле маршрута, его импортирует `routes/users`; перенос в сервис назначений — при следующей правке назначений |
| IN-03 | info | skipped | Заголовки страниц приложения не начинаются с «(N) »; совпадение только с собственным префиксом |
| IN-04 | info | skipped | По UI-SPEC кнопка привязана к числу; число перезапрашивается при открытии поповера (devils-advocate F4 REFUTED) |
| IN-05 | info | skipped | Сброс догрузки при смене первой страницы задан в UI-SPEC (devils-advocate F5 REFUTED) |

Dispositions: `open` (recorded, not yet triaged), `fixed`, `skipped`, `deferred`.
Set `deferred` by hand and put the reason in the Source cell; both are preserved. A `|` in the reason is kept as prose and escaped on the next run.
Re-running the gate keeps every row it can. A row the current review no longer reports is kept and its Source cell flagged, so a finding does not leave this record silently. ONE exception: when a finding id is REUSED by a different finding, the earlier decision cannot keep a row — the id is taken — and it is dropped. A RECORDED decision (anything but `open`) is named on the console when that happens; a row still at `open` is replaced silently, because `open` records no decision to lose.
