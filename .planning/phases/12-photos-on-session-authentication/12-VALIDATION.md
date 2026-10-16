---
phase: "12"
slug: "photos-on-session-authentication"
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-10-16"
---

# Phase 12 — Validation Strategy

> Контракт проверки фазы. Источник: раздел «Validation Architecture» в `12-RESEARCH.md`.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 5.0.3 (server, web); `node:test` для `scripts/*.test.mjs`; Playwright для `e2e/` |
| **Config file** | `app/server/vitest.config.ts`, `app/web/vitest.config.ts`, `e2e/playwright.config.ts` |
| **Quick run command** | `node scripts/with-test-db.mjs yarn workspace @bio-exam/server test -- <файл>`; `yarn workspace @bio-exam/web test -- <файл>` |
| **Full suite command** | `yarn verify`, затем отдельно `yarn e2e` |
| **Estimated runtime** | quick ~30 секунд, `yarn verify` несколько минут |

---

## Sampling Rate

- **After every task commit:** точечный файл теста задачи.
- **After every plan wave:** `node scripts/with-test-db.mjs yarn workspace @bio-exam/server test` и `yarn workspace @bio-exam/web test`.
- **Before `/gsd-verify-work`:** `yarn verify` зелёный и полный `yarn e2e`.
- **Max feedback latency:** 120 секунд на задачу.

---

## Per-Task Verification Map

Заполняется планировщиком по таблице «Phase Requirements → Test Map» из `12-RESEARCH.md`.

| Req | Поведение | Тип | Файл | План / задача |
|-----|-----------|-----|------|---------------|
| PHOTO-03 | Сигнатура файла: текст 400, GIF/HEIC/AVIF 415, лишние пиксели 413; Orientation 6 и 8 в вертикальный WebP без EXIF/GPS | unit | `app/server/src/services/assets/image-intake.test.ts` (Wave 0) | 12-01 T1, T2 |
| PHOTO-04 | Семафор обработки и предел очереди (503) | unit | там же (Wave 0) | 12-01 T2 |
| PHOTO-04 | Пик памяти 12 и 48 МП при concurrency 1 и 2 (macOS) | script | `app/server/src/scripts/photo-memory-bench.ts`, запись в ADR-0004 | 12-01 T2, 12-10 T1 |
| DEBT-01 | Русские 413/400/415 на `docs/assets` и `users/avatar`, хранилище пусто | integration | `app/server/src/routes/uploads.test.ts` (переписать) | 12-04 T1, T2 |
| DEBT-07 | `answers/…` недоступны через `/api/docs/assets/proxy` и `/signed` | unit + integration | `services/storage/links.test.ts`, `routes/docs/assets.test.ts` (дописать) | 12-05 T1 |
| PHOTO-02, 06 | Идемпотентность по `photoId`, лимит 5 при параллельных PUT, окно 422, удаление при открытом окне, файлы при удалении ученика | integration | `app/server/src/routes/tests/session-photos.test.ts` (Wave 0) | 12-07 T1–T3 |
| PHOTO-05 | Доступ владельца и проверяющего, одинаковый 404 для чужого, заголовки `private, no-store`, `nosniff`, CORP | integration + unit | `app/server/src/routes/answer-photos.test.ts` (Wave 0), `services/access-policy/scope.test.ts` | 12-08 T1, T2 |
| PHOTO-02 | Очередь загрузки: 3 автоповтора, затем «Повторить»; 4xx без повтора; шестое отклонено | unit (web) | `app/web/components/tests/answer-photos/upload-queue.test.ts` (Wave 0) | 12-06 T1, T2 |
| PHOTO-01, 06 | Раннер: выбор, «N из 5», удаление, шестое отклонено, после перезагрузки на месте | e2e | `e2e/tests/answer-photos.spec.ts` (Wave 0) | 12-09 T1, T2 |
| — | Миграция 0031 с пустой базы, правило удаления пользователя | integration | `node scripts/check-migrations.mjs`, `src/db/user-deletion-rule.test.ts` | 12-03 T1 |
| PHOTO-04 | Пик памяти на Linux-образе API и реальных снимках | manual-only | шаг пользователя, строка «Образ API (Linux)» в ADR-0004 | 12-10 «Шаги пользователя» |

---

## Wave 0 Requirements

- [ ] `app/server/src/services/assets/image-intake.test.ts` — PHOTO-03, PHOTO-04
- [ ] тесты сервиса и маршрутов фото — PHOTO-02, 05, 06
- [ ] `app/web/components/tests/answer-photos/upload-queue.test.ts` — очередь и повторы
- [ ] сид e2e: тест с вопросом `open` для отдельного ученика
- [ ] `e2e/tests/answer-photos.spec.ts`

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Пик памяти обработки на Linux-образе и реальных снимках | PHOTO-04 | glibc-фрагментация не воспроизводится синтетикой на macOS | Спайк D-15, число записать в ADR-0004 или новый ADR |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 120s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
