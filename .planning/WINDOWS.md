---
schema_version: 1
open_count: 1
waived_count: 0
fixed_count: 2
total_count: 3
last_updated: 2026-10-13T16:09:50.109Z
---

# Broken Windows Ledger

> Cross-phase defect register. With `workflow.windows_enforce` enabled, `/gsd-ship` blocks while `open_count > 0`.
> Waive with `gsd-tools windows waive <id> "<reason>"` (reason required).
> Mark fixed with `gsd-tools windows fixed <id>`.

| id | phase | kind | file | line | description | status | reason | recorded_at | resolved_at |
|----|-------|------|------|------|-------------|--------|--------|-------------|-------------|
| 1 | 04 | deviation | app/server/src/lib/logger.ts |  | Заголовок Cookie (bio_exam_session, refresh_token) попадает в лог ошибок запроса: pinoHttp без redact; найдено в 04-06, см. deferred-items.md | fixed |  | 2026-10-04T07:23:28.334Z | 2026-10-06T15:46:11.767Z |
| 2 | 04 | deviation | app/web/components/AppLayout/AppLayout.tsx |  | Два Toaster (root layout и AppLayout): каждый тост показывается дважды | fixed |  | 2026-10-04T09:06:52.366Z | 2026-10-06T15:46:11.856Z |
| 3 | 12 | deviation | app/web/components/editor/plugins/images-plugin/MediaLibrary.tsx |  | Клиент MediaLibrary дублирует лимит и список MIME из-за 500: отложено, см. 12-ARCH-REVIEW.md | open |  | 2026-10-13T16:09:50.109Z |  |

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
    "status": "open",
    "reason": "",
    "recorded_at": "2026-10-13T16:09:50.109Z",
    "resolved_at": null,
    "milestone": "v3.0"
  }
]
````
