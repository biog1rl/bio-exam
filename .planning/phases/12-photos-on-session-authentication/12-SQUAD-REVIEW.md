# Squad review — phase 12

Дата: 2026-10-16. Проверено планов: 12-01…12-10. Итог: **REVISED** (открытых BLOCKER нет).

Критики: plan-critic (вердикт `gsd-plan-checker`, 0 BLOCKER, 2 WARNING, 3 INFO, засчитан как plan-critic), code-critic, risk-critic, design-critic (opus), затем devils-advocate по всем MAJOR. Правки внесла ведущая сессия, планировщик второго цикла не запускался.

## Surviving findings

| id | severity | verdict | evidence | status |
|----|----------|---------|----------|--------|
| D1 / C1 | MAJOR | CONFIRMED | `TestRunner.tsx:368-376` (`key={question.id}`), `12-09` Task 1 шаг 2: очередь фото умирала вместе с блоком при «Далее» | fixed: реестр очередей `useAnswerPhotoSession` в `TestRunner`, dispose только при смене сессии и уходе со страницы, e2e-сценарий смены вопроса при задержанной загрузке (12-09) |
| R1 | MINOR (было MAJOR) | DOWNGRADED | `12-07` строки 30, 166 | open: проверка окна до тела запроса и счётчик тел в полёте не добавлены (общий долг загрузок, нет rate-limiter) |
| R2 | MINOR (было MAJOR) | DOWNGRADED | прогон devils-advocate: WebP/PNG 48 МП с Orientation 6 дали +72…77 МБ RSS | fixed: случаи добавлены в бенч (12-01); лимит 50 МП не менялся (D-11, D-13) |
| R3 | MINOR (было MAJOR) | DOWNGRADED | клиент шлёт по одному запросу на ученика | fixed частично: фото в минуту пишется в ADR-0004 (12-01); паузы 1/3/9 с зафиксированы D-20 |
| R4 | MINOR (было MAJOR) | DOWNGRADED | `question-content/remove.ts:206-252`, ROADMAP фаза 16 критерий 2 | fixed: отсрочка записывается в ADR-0004 и SUMMARY (12-07) |
| C3 | MINOR | CONFIRMED | `scripts/teacher-zone-guards.test.mjs:528-533` (`INVENTORY.length === 45`) | fixed (12-08) |
| C4 | MINOR | CONFIRMED | `scope.test.ts:62-72` (`failingLoader` без нового метода) | fixed (12-08) |
| C5 | MINOR | CONFIRMED | `storage-no-private-access.test.mjs`, образцы VIOLATING | fixed (12-05) |

Остальные MINOR (R5–R8, D2–D9, C2, C6, C7) в планы не внесены: они не меняют цель фазы; их разбор — на исполнителях и при проверке фазы (C2 о доступности блока в окне догрузки, R5 о файлах при сбое транзакции, D2–D9 о дублировании правил сессии, хранилища и шаблона вопроса).

## Refuted

Нет. Понижены R1–R4 (см. таблицу).

## Revision

Правки в `12-01`, `12-05`, `12-07`, `12-08`, `12-09` (одной строкой каждая, кроме 12-09). Проверка: `verify plan-structure` valid, `plan-budget` ok.
