---
schema_version: 1
open_count: 8
waived_count: 1
fixed_count: 3
total_count: 12
last_updated: 2026-10-16T13:12:11.624Z
---

# Broken Windows Ledger

> Cross-phase defect register. With `workflow.windows_enforce` enabled, `/gsd-ship` blocks while `open_count > 0`.
> Waive with `gsd-tools windows waive <id> "<reason>"` (reason required).
> Mark fixed with `gsd-tools windows fixed <id>`.

| id | phase | kind | file | line | description | status | reason | recorded_at | resolved_at |
|----|-------|------|------|------|-------------|--------|--------|-------------|-------------|
| 1 | 04 | deviation | app/server/src/lib/logger.ts |  | Заголовок Cookie (bio_exam_session, refresh_token) попадает в лог ошибок запроса: pinoHttp без redact; найдено в 04-06, см. deferred-items.md | fixed |  | 2026-10-04T07:23:28.334Z | 2026-10-06T15:46:11.767Z |
| 2 | 04 | deviation | app/web/components/AppLayout/AppLayout.tsx |  | Два Toaster (root layout и AppLayout): каждый тост показывается дважды | fixed |  | 2026-10-04T09:06:52.366Z | 2026-10-06T15:46:11.856Z |
| 3 | 12 | deviation | app/web/components/editor/plugins/images-plugin/MediaLibrary.tsx |  | Клиент MediaLibrary дублирует лимит и список MIME из-за 500: отложено, см. 12-ARCH-REVIEW.md | waived | D-05: клиент MediaLibrary в фазе 12 не переделывается; после 12-04 сервер отвечает на размер и тип русскими 413/415/400, дубли лимита 5 МБ и списка типов на клиенте исход не меняют, решает сервер | 2026-10-13T16:09:50.109Z | 2026-10-16T11:31:50.429Z |
| 4 | 12 | deviation | app/server/src/routes/tests/session-photos.ts |  | Охрана попытки у входа фото повторяет denyAttemptAccess из public.ts: отложено после исполнения, см. 12-ARCH-REVIEW.md (F2) | open |  | 2026-10-16T12:50:55.859Z |  |
| 5 | 12 | deviation | app/web/components/tests/answer-photos/PhotoBlock.tsx |  | Список форматов, тексты типа и литерал 422 фото ответа не из exam-core: отложено после исполнения, см. 12-ARCH-REVIEW.md (F3) | open |  | 2026-10-16T12:50:55.948Z |  |
| 6 | 12 | deviation | app/server/src/services/assets/image-intake.ts |  | Размер файла не в профиле приёма, литералы 5 МБ в маршрутах: отложено после исполнения, см. 12-ARCH-REVIEW.md (F4) | open |  | 2026-10-16T12:50:56.036Z |  |
| 7 | 12 | deviation | app/server/src/services/answer-photos/index.ts |  | Компенсация записанных объектов скопирована в пятый раз: отложено до фазы 16, см. 12-ARCH-REVIEW.md (F5) | open |  | 2026-10-16T12:50:56.127Z |  |
| 8 | 12 | deviation | app/server/src/services/assets/avatars.ts |  | Кроп аватара (renderCrop, recropAvatar) вне ограничителя памяти sharp, rotate любым числом: отложено, см. 12-SECURITY.md флаг 2 | open |  | 2026-10-16T12:50:56.216Z |  |
| 9 | 12 | deviation | app/server/src/routes/tests/session-photos.ts |  | Число одновременных PUT фото не ограничено до очереди sharp, N x 10 МБ в памяти (WR-01): отложено, поправить строку ADR-0004 про 80 МБ, см. 12-REVIEW.md | fixed |  | 2026-10-16T12:50:56.305Z | 2026-10-16T13:12:11.624Z |
| 10 | 12 | deviation | app/web/components/tests/answer-photos/upload-queue.ts |  | DELETE 404 у записи failed во время работы сервера над PUT оставляет фото (WR-02): отложено, см. 12-REVIEW.md | open |  | 2026-10-16T12:50:56.394Z |  |
| 11 | 12 | deviation | app/web/components/tests/answer-photos/use-answer-photos.ts |  | Сдача теряет очередь фото кроме идущего запроса, UI-SPEC:303 и 12-09-SUMMARY:161 неточны (WR-03): передано в фазу 14, см. 12-REVIEW.md | open |  | 2026-10-16T12:50:56.484Z |  |
| 12 | 12 | deviation | app/web/components/tests/answer-photos/PhotoBlock.tsx |  | У кнопки «Удалить» нет состояния «идёт удаление», на лимите «Добавить фото» гасится opacity-50 без замера контраста, не покрыты e2e скелетон, ошибка списка, ImageOff и отказ окна: передано в фазу 14, см. 12-UI-REVIEW.md | open |  | 2026-10-16T13:02:03.836Z |  |

````json
[
  {
    "id": 1,
    "kind": "deviation",
    "phase": "04",
    "file": "app/server/src/lib/logger.ts",
    "line": null,
    "description": "Заголовок Cookie (bio_exam_session, refresh_token) попадает в лог ошибок запроса: pinoHttp без redact; найдено в 04-06, см. deferred-items.md",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-10-04T07:23:28.334Z",
    "resolved_at": "2026-10-06T15:46:11.767Z",
    "milestone": "v1.0"
  },
  {
    "id": 2,
    "kind": "deviation",
    "phase": "04",
    "file": "app/web/components/AppLayout/AppLayout.tsx",
    "line": null,
    "description": "Два Toaster (root layout и AppLayout): каждый тост показывается дважды",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-10-04T09:06:52.366Z",
    "resolved_at": "2026-10-06T15:46:11.856Z",
    "milestone": "v1.0"
  },
  {
    "id": 3,
    "kind": "deviation",
    "phase": "12",
    "file": "app/web/components/editor/plugins/images-plugin/MediaLibrary.tsx",
    "line": null,
    "description": "Клиент MediaLibrary дублирует лимит и список MIME из-за 500: отложено, см. 12-ARCH-REVIEW.md",
    "status": "waived",
    "reason": "D-05: клиент MediaLibrary в фазе 12 не переделывается; после 12-04 сервер отвечает на размер и тип русскими 413/415/400, дубли лимита 5 МБ и списка типов на клиенте исход не меняют, решает сервер",
    "recorded_at": "2026-10-13T16:09:50.109Z",
    "resolved_at": "2026-10-16T11:31:50.429Z",
    "milestone": "v3.0"
  },
  {
    "id": 4,
    "kind": "deviation",
    "phase": "12",
    "file": "app/server/src/routes/tests/session-photos.ts",
    "line": null,
    "description": "Охрана попытки у входа фото повторяет denyAttemptAccess из public.ts: отложено после исполнения, см. 12-ARCH-REVIEW.md (F2)",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-10-16T12:50:55.859Z",
    "resolved_at": null,
    "milestone": "v3.0"
  },
  {
    "id": 5,
    "kind": "deviation",
    "phase": "12",
    "file": "app/web/components/tests/answer-photos/PhotoBlock.tsx",
    "line": null,
    "description": "Список форматов, тексты типа и литерал 422 фото ответа не из exam-core: отложено после исполнения, см. 12-ARCH-REVIEW.md (F3)",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-10-16T12:50:55.948Z",
    "resolved_at": null,
    "milestone": "v3.0"
  },
  {
    "id": 6,
    "kind": "deviation",
    "phase": "12",
    "file": "app/server/src/services/assets/image-intake.ts",
    "line": null,
    "description": "Размер файла не в профиле приёма, литералы 5 МБ в маршрутах: отложено после исполнения, см. 12-ARCH-REVIEW.md (F4)",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-10-16T12:50:56.036Z",
    "resolved_at": null,
    "milestone": "v3.0"
  },
  {
    "id": 7,
    "kind": "deviation",
    "phase": "12",
    "file": "app/server/src/services/answer-photos/index.ts",
    "line": null,
    "description": "Компенсация записанных объектов скопирована в пятый раз: отложено до фазы 16, см. 12-ARCH-REVIEW.md (F5)",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-10-16T12:50:56.127Z",
    "resolved_at": null,
    "milestone": "v3.0"
  },
  {
    "id": 8,
    "kind": "deviation",
    "phase": "12",
    "file": "app/server/src/services/assets/avatars.ts",
    "line": null,
    "description": "Кроп аватара (renderCrop, recropAvatar) вне ограничителя памяти sharp, rotate любым числом: отложено, см. 12-SECURITY.md флаг 2",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-10-16T12:50:56.216Z",
    "resolved_at": null,
    "milestone": "v3.0"
  },
  {
    "id": 9,
    "kind": "deviation",
    "phase": "12",
    "file": "app/server/src/routes/tests/session-photos.ts",
    "line": null,
    "description": "Число одновременных PUT фото не ограничено до очереди sharp, N x 10 МБ в памяти (WR-01): отложено, поправить строку ADR-0004 про 80 МБ, см. 12-REVIEW.md",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-10-16T12:50:56.305Z",
    "resolved_at": "2026-10-16T13:12:11.624Z",
    "milestone": "v3.0"
  },
  {
    "id": 10,
    "kind": "deviation",
    "phase": "12",
    "file": "app/web/components/tests/answer-photos/upload-queue.ts",
    "line": null,
    "description": "DELETE 404 у записи failed во время работы сервера над PUT оставляет фото (WR-02): отложено, см. 12-REVIEW.md",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-10-16T12:50:56.394Z",
    "resolved_at": null,
    "milestone": "v3.0"
  },
  {
    "id": 11,
    "kind": "deviation",
    "phase": "12",
    "file": "app/web/components/tests/answer-photos/use-answer-photos.ts",
    "line": null,
    "description": "Сдача теряет очередь фото кроме идущего запроса, UI-SPEC:303 и 12-09-SUMMARY:161 неточны (WR-03): передано в фазу 14, см. 12-REVIEW.md",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-10-16T12:50:56.484Z",
    "resolved_at": null,
    "milestone": "v3.0"
  },
  {
    "id": 12,
    "kind": "deviation",
    "phase": "12",
    "file": "app/web/components/tests/answer-photos/PhotoBlock.tsx",
    "line": null,
    "description": "У кнопки «Удалить» нет состояния «идёт удаление», на лимите «Добавить фото» гасится opacity-50 без замера контраста, не покрыты e2e скелетон, ошибка списка, ImageOff и отказ окна: передано в фазу 14, см. 12-UI-REVIEW.md",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-10-16T13:02:03.836Z",
    "resolved_at": null,
    "milestone": "v3.0"
  }
]
````
