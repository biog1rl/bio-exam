---
phase: "9"
slug: "result-foundation-and-readers"
status: verified
threats_open: 0
asvs_level: 2
created: "2026-10-06"
---

# Phase 9 — Security

> Реестр угроз фазы 9, принятые риски и журнал аудита. Аудит: gsd-security-auditor (L2), опровержение devils-advocate, исправление 3be6c16.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| Ученик → API сдачи и черновика | `POST …/submit`, `PATCH …/answers` | ответы, телеметрия (недоверенный ввод) |
| API → ученик | вопросы теста, вид попытки | содержимое вопросов без ключей и критериев |
| Проверяющий → API | список попыток, дашборд, разбор, профиль, поиск | результаты в пределах зоны видимости |
| Приложение → test_attempts | единственный писатель проекции | факты сдачи (неизменяемы триггером) |
| Выкатка → прод | миграция 0026 | схема, данные попыток |

---

## Threat Register

| Threat ID | Component | Severity | Disposition | Mitigation / evidence | Status |
|-----------|-----------|----------|-------------|------------------------|--------|
| T-09-01…T-09-03 | удаление пользователя | — | mitigate | каталог FK `user-deletion-rule.test.ts`, ADR-0007, `SET NULL` для авторства | closed |
| T-09-04, T-09-05 | характеризация читателей | — | mitigate | временная база, литералы не менялись (d862a67) | closed |
| T-09-06…T-09-09 | exam-core итог и `manual` | — | mitigate | ранний выход `manual`, одна `computeAttemptOutcome`, RangeError на оценку вне 0..points | closed |
| T-09-10 | пределы длины | medium | mitigate | 3be6c16: форма и размер по `answerSchema` для всех шаблонов | closed |
| T-09-11 | мегабайтный ответ | low | mitigate | 3be6c16 (тот же вектор, что T-09-21) | closed |
| T-09-12…T-09-19 | миграция 0026, писатель, читатели | — | mitigate | триггер `test_attempts_facts_immutable`, CHECK после UPDATE, `lock_timeout`, `ON CONFLICT`, `attemptResultColumns`/`attemptResultSql`, `reconcileOutcomes` | closed |
| T-09-20 | чужой вопрос | — | mitigate | `foreign_question` на сдаче и черновике, тесты `attempt-submit.test.ts`, `attempt-time-limit.test.ts` | closed |
| T-09-21 | ответ в мегабайты | high | mitigate | 3be6c16: `findAnswerViolation` проверяет форму по адаптеру, длину строк (200/5000), элементы ≤ 200 знаков и ≤ 50 штук, причина `answer_shape_invalid` (422 сдача, 400 черновик), серверные тесты обоих путей | closed |
| T-09-22…T-09-24 | ответы об ошибках, payload ученика | — | mitigate | 422 без текста исключения, `studentQuestionView` по белому списку, черновик 400 без повтора | closed |
| T-09-25…T-09-27 | тип `open` в админке | — | mitigate | запреты включения, правки правила и кастомного шаблона, `admin-open-type.test.ts` | closed |
| T-09-28…T-09-32, T-09-50 | список попыток, поиск, chart-data | — | mitigate | `review` внутри `visible`, `z.enum`, среднее без pending, параметры `$1…$n` | closed |
| T-09-33…T-09-38, T-09-40…T-09-47 | web: отказ сдачи, вид результата | — | mitigate | без автоповтора, `attemptResultView` как единственное решение показа, nullable-контракт с superRefine | closed |
| T-09-39 | показ предварительных баллов | low | accept | D-02 | closed |
| T-09-48, T-09-49 | сид e2e, документы | — | mitigate | `assertE2eEnvironment` до импорта базы, в документах нет секретов | closed |
| T-09-51 | `users_created_by_fk` | — | mitigate | `ON DELETE SET NULL` в 0026 | closed |
| T-09-52 | откат образа после 0026 | high | transfer | шаг пользователя: правило и запросы сверки в профиле сервера (раздел «Ловушки», 0026) и в «Шагах пользователя» 09-19-SUMMARY; `deploy.sh` правит пользователь | closed |
| T-09-SC | установка пакетов | — | mitigate | `package.json` и `yarn.lock` не менялись | closed |
| T-09-53 | телеметрия черновика | minor | defer | ключи телеметрии не проверяются на принадлежность тесту и копятся (до фазы 9); deferred-items.md | open — below high threshold (non-blocking) |

*Status: open · closed · open — below high threshold (non-blocking)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-09-01 | T-09-39 | ученик видит предварительные автобаллы до проверки (решение D-02) | discuss-phase 9 (D-02) | 2026-10-06 |

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-10-06 | 53 | 48 | 3 (T-09-10, T-09-21, T-09-52) + 1 незарегистрированная | gsd-security-auditor |
| 2026-10-06 | 54 | 53 | 1 (T-09-53, ниже порога) | ведущая сессия после 3be6c16 и записи правила 0026 в профиль сервера |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-10-06
