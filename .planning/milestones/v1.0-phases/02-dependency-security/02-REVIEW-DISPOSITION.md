---
phase: 02-dependency-security
review: 02-REVIEW.md
fix_report: 02-REVIEW-FIX.md
updated: 2026-10-04
---

# Phase 2: распоряжение по находкам ревью

Ревью кода фазы шло отрядом по правилу пользователя: gsd-code-reviewer (`02-REVIEW.md`), gsd-security-auditor (прогон в headless Chromium), gsd-nyquist-auditor (покрытие тестами), затем devils-advocate. Исправлялись только подтверждённые находки, одним исполнителем (`02-REVIEW-FIX.md`). В таблице id ревьюера; в скобках id сводного списка devils-advocate.

| id | severity | статус | где / почему |
|---|---|---|---|
| CR-01 (S3) | BLOCKER | fixed | `app/web/lib/mdx/remarkMdxAllowlist.ts`: `base`, `meta`, `link`, `head`, `title` удаляются; Vitest-инвариант по SSR-HTML и браузерный стенд (97 пейлоадов чисто) |
| — (S1) `svg:script` | BLOCKER | fixed | белый список элементов; имена с `:`/`.`, `svg`, `math`, `script` удаляются с содержимым |
| — (S2) `iframe SRC=javascript:` | BLOCKER | fixed | имена тегов и атрибутов приводятся к нижнему регистру и записываются обратно; `iframe/object/embed` удаляются |
| — (S4) `HREF/ACTION/formaction` | high | fixed | белый список атрибутов, проверка схем URL после удаления управляющих символов; `form`, `button` разворачиваются |
| WR-01 (S5) | medium | fixed | `meta`, `link`, `style`, `iframe`, `object`, `embed` удаляются; фильтр style (`url(`, `position`, CSS-функции вне списка), `srcset`, `target`, `id`, `class` не пропускаются |
| WR-02 (S6) | medium | fixed | `MdxErrorBoundary` в `MdxRenderer.tsx` с текстовым запасным выводом; пустой style удаляется в `remarkMdxStyleToEstree.ts`; дети у void-элементов удаляются |
| WR-03 (S7) | low | deferred | тесты 02-02 намеренно закрепляют 500 по D-11; «клиентские ошибки multer отдаются как 500» записано в `deferred-items.md` |
| WR-04 (S8) | low | fixed | две формулировки в `docs/security/dependency-audit.md` |
| IN-01 | info | open | типизация `remarkMdxStyleToEstree` под mdast при работе в `rehypePlugins`; поведение проверено тестами, правка типов не делалась |
| IN-02 | info | fixed | регулярные проверки заменены инвариантом по разобранному SSR-HTML |
| IN-03 | info | open | smoke-тест Sharp не различает rotate на однотонной квадратной картинке; характеризационный тест 02-02, его sha256 сверялся по фазе, не менялся |
| IN-04 | info | open | неиспользуемые `prosemirror-model`, `tiptap-extension-auto-joiner`, `bcrypt`, `webpack` в `app/web` вне D-06; остаток advisory по ним записан в `docs/security/dependency-audit.md`, удаление — решение пользователя |
| IN-05 | info | open | устаревший комментарий в `app/web/vitest.config.ts` существовал до фазы; не трогался |
| — (S9) | low | deferred | статическая проверка полов версий в `yarn.lock` внутри `yarn verify` — идея в `deferred-items.md` |
| — (S10) | info | fixed | в тест «не исполняется» добавлена проверка `compiled` |
| — (S11) | low | fixed | строка про пять `YN0008 bcrypt@5.1.1` в разделе YN0007 `02-05-SUMMARY.md` |
| — CSP `base-uri 'self'` | medium | deferred | защита в глубину вне фазы, записана в `deferred-items.md` |
| — `class` больше не пропускается | info | accepted | отступление от кандидата devils-advocate: классы Tailwind дают оверлей в обход фильтра `position`; старые тексты с `class` его теряют — проверить на preview D-10 |
