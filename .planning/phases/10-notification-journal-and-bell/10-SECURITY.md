---
phase: "10"
slug: "notification-journal-and-bell"
status: verified
threats_open: 0
asvs_level: 2
created: "2026-10-06"
---

# Phase 10 — Security

> Реестр угроз фазы 10, принятые риски и журнал аудита. Аудит: gsd-security-auditor (L2), опровержение devils-advocate, исправление 3cdc44c.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| Пользователь → `/api/notifications` | список, число, отметки, открытие | только свои события (`recipient_id = req.authUser.id`) |
| Ссылка уведомления → объект | `open` заново проверяет доступ | `href` на тест или `NO_ACCESS` без данных объекта |
| Причина → журнал | назначение, публикация | событие в транзакции причины |
| Web → переход | `router.replace(href)` | только внутренний путь |

---

## Threat Register

| Threat ID | Component | Severity | Disposition | Mitigation / evidence | Status |
|-----------|-----------|----------|-------------|------------------------|--------|
| T-10-01…T-10-06 | журнал, миграция 0027 | — | mitigate | только примитивы в `params`; UNIQUE + upsert, дедупликация пакета; запись только через `tx`; RLS и `deny_direct_access`; ON DELETE по ADR-0007; `lock_timeout` | closed |
| T-10-07…T-10-11 | производитель `test.assigned` | — | mitigate | `addAssignments` после проверок шва; одна транзакция; события только для видимого теста (D-18); `actor_id`; чтения через `tx` | closed |
| T-10-12, T-10-13, T-10-16 | чтение журнала | — | mitigate | `ownedBy` в каждом запросе, белый список полей, единый 404 | closed |
| T-10-14 | CSRF на POST read/read-all | low | accept | `SameSite=Lax`, CORS со списком origin; эффект только на своих событиях | closed |
| T-10-15 | разбор курсора и параметров | medium | mitigate | zod + параметризованный SQL; 3cdc44c — курсор с несуществующей датой (31 февраля, нулевой год) отвергается 400 | closed |
| T-10-17, T-10-18, T-10-20, T-10-21 | открытие ссылки | — | mitigate | `checkAttemptAccess` при каждом открытии; тело ровно `{ error: 'NO_ACCESS' }`; `href` строит сервер; неизвестный вид — отказ | closed |
| T-10-19 | GET `open` с побочным эффектом | low | accept | D-10: нужен uuid события, эффект — отметка прочтения своего события | closed |
| T-10-22…T-10-27, T-10-29…T-10-32 | web, e2e, документы | — | mitigate | ключ SWR с `userId`; префикс вкладки без зацикливания; текст через React; без предзагрузки; `open` только из клиента; e2e на временной базе; без секретов в документах | closed |
| T-10-28 | открытое перенаправление | medium | mitigate | 3cdc44c: `isInternalHref` отвергает управляющие символы; таблица тестов с TAB/LF/CR | closed |
| T-10-33, T-10-34 | выкатка 0027 | high | transfer | шаг пользователя: правило 0027 и совместная выкатка с 0026 записаны в профиле сервера («Ловушки») и в «Шагах пользователя» 10-08-SUMMARY | closed |
| T-10-35…T-10-37 | публикация (D-18) | — | mitigate | `FOR SHARE` на строке теста; событие в транзакции обеих веток `updateTestSettings`; получатели через `tx`; 3cdc44c — параллельное снятие публикации даёт 409 | closed |
| T-10-SC | пакеты | — | mitigate | `package.json` и `yarn.lock` не менялись | closed |

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-10-01 | T-10-14 | POST `read`/`read-all` защищены `SameSite=Lax` и CORS; эффект — отметка своих событий | план 10-03 (D-10) | 2026-10-06 |
| AR-10-02 | T-10-19 | GET `open` отмечает прочтение; нужен uuid v4 события, эффект только на своём событии | план 10-04 (D-10, D-12) | 2026-10-06 |

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-10-06 | 38 | 36 | 2 (T-10-15, T-10-28, ниже порога) | gsd-security-auditor |
| 2026-10-06 | 38 | 38 | 0 | ведущая сессия после 3cdc44c и записи правила 0027 в профиль сервера |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-10-06
