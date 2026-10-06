---
phase: 03-exam-core
review: 03-REVIEW.md
fix_report: 03-REVIEW-FIX.md
updated: 2026-10-04
---

# Phase 3: распоряжение по находкам ревью

Ревью кода фазы выполнил отряд: gsd-code-reviewer (`03-REVIEW.md`), gsd-security-auditor (вердикт SECURED, threats_open 0, T-3-14 принят), gsd-nyquist-auditor (покрытие тестами). Затем находки проверил devils-advocate. Исправлено только то, что devils-advocate подтвердил к работе в фазе 3. Правил один исполнитель (`03-REVIEW-FIX.md`). Префиксы id: WR/IN — ревьюер багов, N — аудитор безопасности, G — аудитор покрытия.

| id | severity | статус | где / почему |
|---|---|---|---|
| WR-01 | info (защита в глубину) | fixed | `review.ts`: `isAnswered` → `false`, `readKey` → `null`, `keyShapeFor` → `null` на неизвестном шаблоне; `computeVerdicts` бросает понятную ошибку. Живой путь закрыт раньше: резолвер сервера падает на такой строке `question_types` (поведение HEAD) |
| WR-02 | low | fixed | `computeVerdicts` сам выбирает метрику (разрешённая шаблоном или по умолчанию), части и ошибки считает один адаптер. Остаток: переопределение типа с чужой метрикой, записанное в БД вручную, submit посчитает чужим адаптером; через API такое состояние не создаётся (`03-REVIEW-FIX.md`, раздел 2) |
| WR-03 | low | fixed | `getSequenceReview`: при сохранённом `isCorrect` эталон — ответ студента (D-06); корень D1 закрывает Phase 5 (SCORE-01/03) |
| IN-01 | info | deferred | P7 принят намеренно; `readApiError` не читает `details` и было до фазы |
| IN-02 | low | fixed | `QuestionEditor.handleTypeChange` через `keyShapeFor` (D-09) |
| IN-03 | low | deferred | сервер не канонизирует ключ последовательности с пробелами, было до фазы; оценка и разбор пробел терпят |
| IN-04 | info | deferred | недостижимо через текущий submit |
| IN-05 | trivial | fixed | `review.spec.ts`: строгое `toBe('1')`, устаревший комментарий удалён |
| IN-06 | info | deferred | `check-*-dist` только в CI, как у rbac; новый шаг `yarn verify` меняет документированный список |
| N1 | medium | deferred → Phase 5 | нет проверки назначения в `/start`, `/submit`, PATCH черновика; пустой submit отдаёт ключи при `showCorrectAnswer=true`. Было до фазы, требование ATT-01. Записано в STATE как известная утечка |
| N2 | low | deferred | квадратичная проверка ключа при сохранении (`tests.write`), было до фазы |
| N3 | low | deferred | нет `.max()` на массивах и строках, было до фазы |
| N4 | low | fixed | matching снова отклоняет пустое значение пары (регрессия фазы); пустой id варианта — было до фазы |
| G1/G2 (P3) | low-medium | fixed | `scripts/exam-core-no-private-copies.test.mjs` в шаге `script-tests` |
| G3 | backstop | deferred-human | overflow на 375px: ручная проверка (`03-11-SUMMARY.md`) |
| G4 | low | fixed | строка submit `'эксперимент'` в `exam-flow.test.ts` |
| G5, G6, G8, G9, G10, G11 | — | refuted | покрыто пакетом или паритет по построению; G9 — принятая практика без DOM |
| G7 | low | fixed | проверка, что у каждого шаблона есть строки с ошибками и без |
| — `ui_template` без CHECK | low | deferred | было до фазы; миграций в фазе нет |
