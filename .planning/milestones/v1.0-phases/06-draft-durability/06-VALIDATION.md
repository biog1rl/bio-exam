---
phase: "6"
slug: "draft-durability"
status: validated
nyquist_compliant: true
wave_0_complete: true
created: "2026-10-06"
---

# Phase 6 — Validation Strategy

> Контракт проверки фазы: требования LIFE-01..LIFE-05, VER-08 и критерии успеха SC1..SC5 из ROADMAP.

---

## Test Infrastructure

| Свойство | Значение |
|----------|----------|
| **Фреймворки** | Vitest (web, фальшивые часы и порты storage, API, clock, visibility), `node:test` для проверок репозитория в `scripts/`, Playwright (e2e) |
| **Конфиги** | `app/web/vitest.config.ts`, `e2e/playwright.config.ts` |
| **Полный набор** | `yarn verify` (без e2e, сам поднимает одноразовый PostgreSQL 17), затем `yarn e2e` |
| **Время** | один воркспейс до 10 с; `yarn verify` 60–120 с; `yarn e2e` несколько минут |

Команды запуска; `<файл>` берётся из колонки «Файл теста»:

| Алиас | Команда |
|-------|---------|
| WEB | `yarn workspace @bio-exam/web vitest run <файл>` |
| GUARD | `node --test scripts/<файл>` |
| E2E | `yarn e2e tests/<файл>.spec.ts` |

---

## Per-Requirement Verification Map

Статус: ✅ есть автотест; ✅ + manual есть автотест и ручной остаток из Manual-Only; manual автотеста нет.

| Требование | Что проверяется | Тип | Файл теста | Команда | Статус |
|------------|-----------------|-----|------------|---------|--------|
| LIFE-01 (SC4) | Модуль жизненного цикла попытки ведёт фазы по событиям (старт, ответ, навигация, вкладка скрыта и видна, тик таймера, сдача, повтор) за швами storage, API, clock и visibility; `TestRunner` только рисует, модули не импортируют React | unit (фальшивые часы) + static | `app/web/components/tests/attempt-lifecycle/lifecycle.test.ts`, `app/web/components/tests/attempt-lifecycle/lifecycle-restore.test.ts`, `app/web/components/tests/attempt-lifecycle/lifecycle-submit.test.ts`, `app/web/components/tests/attempt-lifecycle/lifecycle-time.test.ts`, `app/web/components/tests/attempt-lifecycle/restore.test.ts`, `app/web/components/tests/attempt-lifecycle/answer-edits.test.ts`, `scripts/draft-durability-guards.test.mjs` | WEB `components/tests/attempt-lifecycle`; GUARD `draft-durability-guards.test.mjs` | ✅ |
| LIFE-02 (SC1) | WAL ответов пишется синхронно на каждую правку; ответ на Q2 внутри окна дебаунса не теряется ни при перезагрузке, ни при размонтировании; в сеть уходит только дебаунс | unit + e2e (`@life02`) | `app/web/components/tests/attempt-lifecycle/lifecycle.test.ts`, `app/web/components/tests/attempt-lifecycle/wal.test.ts`, `e2e/tests/answer-durability.spec.ts` | WEB `components/tests/attempt-lifecycle/lifecycle.test.ts components/tests/attempt-lifecycle/wal.test.ts`; E2E `answer-durability` | ✅ |
| LIFE-03 (SC2) | Повтор теста сбрасывает всё состояние в одном месте; скрытая вкладка не копит время; таймер, тост за минуту, «Время вышло» и автосдача в браузере с подменёнными часами | unit (фальшивые часы) + e2e (`@timed`) | `app/web/components/tests/attempt-lifecycle/lifecycle-submit.test.ts`, `app/web/components/tests/attempt-lifecycle/lifecycle-time.test.ts`, `e2e/tests/timed-attempt.spec.ts` | WEB `components/tests/attempt-lifecycle/lifecycle-submit.test.ts components/tests/attempt-lifecycle/lifecycle-time.test.ts`; E2E `timed-attempt` | ✅ + manual |
| LIFE-04 (SC3) | Черновик вопроса сбрасывается до управляемой навигации («Назад», «Отмена»), показаны состояния ожидания и ошибки, `beforeunload` взведён только пока есть несохранённая запись, повторного сохранения после сброса нет | unit | `app/web/lib/drafts/question-draft-autosave.test.ts`, `app/web/store/unsavedChanges.store.test.ts`, `app/web/lib/drafts/before-unload.test.ts` | WEB `lib/drafts/question-draft-autosave.test.ts store/unsavedChanges.store.test.ts lib/drafts/before-unload.test.ts` | ✅ + manual |
| LIFE-04 (SC3) | Защита правок существующего вопроса; учитель без сети жмёт «Отмена» и видит диалог ухода; закрытие вкладки во время «Сохранение…» спрашивает подтверждение, после «Сохранено» нет | e2e (`@life04`) | `e2e/tests/question-draft-durability.spec.ts`, `e2e/tests/teacher-draft-durability.spec.ts` | E2E `question-draft-durability`; E2E `teacher-draft-durability` | ✅ |
| LIFE-05 (SC4) | Быстрые правки между вопросами, перезагрузка и размонтирование внутри дебаунса, повтор после сбоя, немедленный «Назад» и «Отмена», отсутствие повторного сохранения после сброса | unit | `app/web/components/tests/attempt-lifecycle/lifecycle.test.ts`, `app/web/components/tests/attempt-lifecycle/lifecycle-restore.test.ts`, `app/web/lib/drafts/question-draft-autosave.test.ts`, `app/web/lib/drafts/save-queue.test.ts` | WEB `components/tests/attempt-lifecycle lib/drafts/question-draft-autosave.test.ts lib/drafts/save-queue.test.ts` | ✅ + manual |
| LIFE-05 (SC4) | Ответы на вопросы 1 и 2 под задержанным PATCH черновика переживают перезагрузку; ответ и сразу уход и возврат показывают ответ | e2e (`@life05`) | `e2e/tests/attempt-slow-network.spec.ts` | E2E `attempt-slow-network` | ✅ |
| LIFE-05 (SC4) | «Завершить» без сети, затем сеть и перезагрузка дают одну попытку с одним `clientAttemptId` | e2e (`@life05`) | `e2e/tests/submit-retry.spec.ts` | E2E `submit-retry` | ✅ |
| LIFE-05 (SC4) | Страница прохождения на 375 px без горизонтальной прокрутки на каждом вопросе | e2e (`@layout375`) | `e2e/tests/mobile-layout.spec.ts` | E2E `mobile-layout` | ✅ |
| VER-08 (SC5) | Три навыка `.agents/skills/bio-exam-*`: имя равно каталогу, во frontmatter только `name` и `description`, пути существуют, маршрутизация в `AGENTS.md` описана; команды `yarn ...` в документах существуют | static (node:test) | `scripts/check-docs-structure.test.mjs`, `scripts/check-docs-commands.test.mjs` | GUARD `check-docs-structure.test.mjs check-docs-commands.test.mjs` | ✅ + manual |

Критерии ROADMAP: SC1 = LIFE-02; SC2 = LIFE-03; SC3 = LIFE-04; SC4 = LIFE-01 и LIFE-05; SC5 = VER-08.

---

## Manual-Only Verifications

| Что проверяется | Требование | Почему не автоматизируется | Как проверено |
|-----------------|------------|----------------------------|---------------|
| `quick_validate.py` проходит для трёх навыков `bio-exam-web`, `bio-exam-api`, `bio-exam-data` | VER-08 | Валидатор живёт во внешнем плагине вне репозитория, дублировать его правила в тесте хрупко | Прогнан вручную |
| Сдача по клиентским часам после лимита: серверный дедлайн отвечает 422 по реальному времени, диалоги 409 и 422 | LIFE-03 | `page.clock` подменяет часы браузера, сервер считает по реальному времени | Подтверждено пользователем 2026-10-05 |
| Ответ и немедленный уход кликом по крошке под профилем медленной сети (Slow 3G) | LIFE-05 | Требование прямо предписывает ручную проверку под троттлингом сети; e2e задерживает PATCH и уходит через `page.goto`, что слабее клика по крошке | Подтверждено пользователем 2026-10-05 |
| Два устройства учителя правят один черновик: тост «Черновик изменён в другом месте» (409) | LIFE-04 | Нужны две независимые сессии с реальным расхождением версий | Проверено вручную при выкатке |
| Вёрстка на 375 px и в колонке 160 px: строка состояния ученика, строка автосохранения черновика, диалог ухода, перенос по словам | LIFE-04, LIFE-05 | Визуальная оценка; автоматически проверяется только отсутствие горизонтальной прокрутки на 375 px | Проверено вручную при выкатке |

---

## Validation Audit 2026-10-06

Пробел: пункт раздела «Пробелы» карты покрытия, которому нужен тест. Закрыт: для пробела есть автотест, новый или существующий. Manual-only: пробел закрыт ручной проверкой.

| Метрика | Число |
|---------|-------|
| Gaps found | 6 |
| Resolved | 5 |
| Manual-only | 1 |

Закрыто: G1 (медленная сеть, ученик) — `e2e/tests/attempt-slow-network.spec.ts`; G2 («Завершить» без сети, одна попытка) — `e2e/tests/submit-retry.spec.ts`; G3 (тест с лимитом в браузере) — `e2e/tests/timed-attempt.spec.ts`; G4 (учитель: офлайн, «Отмена», `beforeunload`) — `e2e/tests/teacher-draft-durability.spec.ts`; G6 (375 px) — `e2e/tests/mobile-layout.spec.ts`. Ручной: G5 (`quick_validate.py`). У G3, G4 и G6 остаётся ручной остаток, он записан в Manual-Only. Нового тестового кода: три файла (`attempt-slow-network`, `timed-attempt`, `teacher-draft-durability`); `submit-retry.spec.ts` общий с фазой 5, `mobile-layout.spec.ts` с фазами 3 и 7. Действия пользователя (preview, выкатка, решение по `use-debounce`) в счёт пробелов не входят.

---

## Validation Sign-Off

- [x] У каждого требования есть автотест или обоснованная ручная проверка в Manual-Only
- [x] Все названные файлы тестов существуют
- [x] Ручной остаток каждого требования записан в Manual-Only
- [x] Режима watch нет
- [x] `nyquist_compliant: true` в frontmatter

**Approval:** validated 2026-10-06 (требований 6: автоматизировано 6, из них с ручным остатком 4, только ручных 0)
