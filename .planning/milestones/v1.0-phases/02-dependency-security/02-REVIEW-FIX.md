---
phase: 02-dependency-security
fixed_at: 2026-10-03T21:20:00Z
review_path: .planning/phases/02-dependency-security/02-REVIEW.md
findings_in_scope: [S1, S2, S3, S4, S5, S6, Missed, S8, S10, S11]
fixed: [S1, S2, S3, S4, S5, S6, Missed, S8, S10, S11]
deferred: [S7, S9, CSP]
status: all_fixed
commit: не выполнялся (правило пользователя)
---

# Фаза 02: исправления по ревью

Коммит: не выполнялся (правило пользователя). Все изменения лежат в рабочем дереве.

## Итог по id

| id | Что было | Что сделано | Доказательство |
| --- | --- | --- | --- |
| S1 | `<svg><svg:script>` исполнялся без клика, вариант с внешним `href` тоже | Белый список элементов: `svg`, `math`, `script` и любые имена с `:` или `.` удаляются вместе с содержимым | Vitest: 6 новых проверок S1 красные → зелёные; Chromium: `svg-ns-script`, `svg-ns-script-ext` было `__pwn без клика`, стало чисто |
| S2 | `<iframe SRC="javascript:…">` исполнялся без клика (атрибуты доходили до React в исходном регистре) | `iframe`, `object`, `embed` удаляются с содержимым; имена атрибутов приводятся к нижнему регистру и записываются обратно в узел; атрибуты только из белого списка | Vitest: 6 проверок S2 красные → зелёные; Chromium: `iframe-SRC-upper` было `__pwn без клика`, стало чисто |
| S3 | `<base href>` менял `document.baseURI` | `base`, `meta`, `link`, `head`, `title` удаляются | Vitest: проверка S3 красная → зелёная; Chromium: `base-href` было `baseURI изменён`, стало чисто |
| S4 | `HREF`/`ACTION`/`formaction` с `javascript:`, SVG `set`/`animate` по клику | `form`, `button` вне белого списка (разворачиваются, атрибуты пропадают); `href`/`src` проверяются по схеме после удаления управляющих символов и пробелов: `http:`, `https:`, `mailto:`, `tel:`, относительные, для `img src` ещё `data:image/(png|jpe?g|gif|webp);`. Markdown-ссылки, картинки и определения с опасной схемой: ссылка разворачивается в текст, картинка удаляется, у определения `url` очищается | Vitest: 21 проверка S4 красная → зелёная (2 контрольные были зелёными, см. ниже); Chromium: 4 случая `__pwn по клику` и 15 `javascript: заблокирован React` стали чистыми |
| S5 | `meta refresh`, `link stylesheet`, `style` (в том числе с `\{…\}`), внешние `iframe/object/embed/form` | Эти элементы удаляются (`form` разворачивается в текст кнопки) | Vitest: 9 проверок S5 красные → зелёные; Chromium: `meta-refresh` было `навигация без клика`, `link-stylesheet` и `style-escaped*` было `чужой CSS`, внешние фреймы и объекты было `внешний запрос`, стало чисто |
| Missed | маячки через `style="background:url(…)"`, `srcset`; оверлей `position:fixed`; `<A>`, `<Img>`, `<Kbd>` роняли рендер; `target="_blank"` | Фильтр `style`: разбор через `style-to-object`, отбрасываются свойства `position`, `behavior`, `-moz-binding`, пользовательские `--*`, значения с `\`, `<`, `>`, `@`, `/*`, `javascript:`, `expression` и с любыми CSS-функциями вне списка (`rgb`, `rgba`, `hsl`, `hsla`, `hwb`, `lab`, `lch`, `oklab`, `oklch`, `color-mix`, `calc`, `min`, `max`, `clamp`, `var`, градиенты); `srcset`, `ping`, `target`, `id` (кроме цифрового `tweet id`), `class` не пропускаются; имена тегов приводятся к нижнему регистру (`<A>` → `a`) | Vitest: 14 проверок красные → зелёные; Chromium: `ev-img-style-url`, `ev-img-srcset`, `x-style-escaped-url` (`u\72l(`), `x-style-image-set` было `внешний запрос`, `ev-Img-cap`, `ev-A-cap-https`, `ev-kelvin` было `ошибка рендера`, стало чисто |
| S6 | ошибка при рендере роняла страницу ученика | Пустые теги `img`, `br`, `hr`, `col` теряют детей; `dangerouslySetInnerHTML`, неизвестные компоненты и составные имена не доходят до React; `remarkMdxStyleToEstree` удаляет пустой или неразборчивый `style`; граница ошибок в `MdxRenderer` | Vitest: 9 проверок S6 красные → зелёные; Chromium (реальный `MdxRenderer`): со старым конвейером без границы корень пустеет, с границей показывается текстовый запасной вывод |
| S8 | `dependency-audit.md`: «зависимость убрана» для serialize-javascript; путь tar через `@vercel/node` назван build-инструментом | Две формулировки исправлены (см. ниже) | `grep -c "зависимость убрана"` = 0 |
| S10 | тест «${name} не исполняется» мог пройти на текстовом запасном выводе | В тест добавлено `assert.equal(compiled, payload.compiled)` (все 9 пейлоадов компилируются) | зелёный |
| S11 | `02-05-SUMMARY.md` в разделе YN0007 не упоминал пять `YN0008 bcrypt@5.1.1 must be rebuilt` | Добавлена одна строка | см. раздел YN0007 в `02-05-SUMMARY.md` |
| S7, S9, CSP | — | Отложено в `deferred-items.md` | — |

## Изменённые файлы

- `app/web/lib/mdx/remarkMdxAllowlist.ts` (новый, экспорт по умолчанию `remarkMdxAllowlist`): remark-плагин белого списка. Заменяет `remarkStripUnsafeJsx.ts`; старый файл удалён (был новым в этой фазе и не в git).
- `app/web/lib/mdx/options.ts`: `remarkPlugins: [remarkMdxAllowlist, remarkGfm, remarkParagraphPerLine]`; `rehypePlugins` без изменений (`rehypeRaw` → `remarkMdxStyleToEstree` → `rehypeStyleToObject`).
- `app/web/lib/mdx/remarkMdxStyleToEstree.ts`: разбор `style` в `try/catch`; если объявлений нет (пустая строка, пробелы, ошибка разбора), атрибут удаляется.
- `app/web/components/tests/MdxRenderer.tsx`: класс `MdxErrorBoundary` (`getDerivedStateFromError`, `componentDidCatch` пишет в `console.error`) вокруг `MDXRemote`, `key={normalized}`, запасной вывод тот же, что при ошибке `serialize`: `<div className>{normalized}</div>`. Компонент остаётся `'use client'`, компиляция на клиенте.
- `app/web/lib/mdx/untrusted.test.ts`: матрица ATTACKS (S1–S5, Missed), RENDER_SAFETY (S6), проверка белого списка по SSR-HTML для старых PAYLOADS, `compiled` в тесте «не исполняется».
- `docs/security/dependency-audit.md`: строка serialize-javascript и девять строк tar (одна и та же формулировка).
- `.planning/phases/02-dependency-security/02-05-SUMMARY.md`: строка про YN0008 в разделе YN0007.
- `.planning/phases/02-dependency-security/deferred-items.md`: S7, S9, CSP.

Новых пакетов нет: `style-to-object` и `unist-util-visit` уже в зависимостях app/web.

## Плагин белого списка

Работает первым в `remarkPlugins`, на mdast до `remarkGfm` и до `rehypeRaw`:

- элементы: `p span div br b strong i em u s del ins sub sup mark small code pre kbd img a ul ol li table thead tbody tfoot tr th td caption colgroup col blockquote hr h1–h6 tweet`;
- неизвестный тег разворачивается, дети остаются; с содержимым удаляются `script style svg math noscript template iframe frame frameset object embed applet base meta link head title textarea select option audio video source track canvas dialog xmp plaintext listing noembed noframes` и любые имена с `:` или `.`;
- имя тега и имена атрибутов записываются обратно в узел в нижнем регистре (`colspan`/`rowspan` → `colSpan`/`rowSpan`);
- атрибуты: общие `style title align dir lang`; `a[href]`, `img[src alt width height]`, `td/th[colspan rowspan]`, `col[span]`, `ol[start]`, `li[value]`, `tweet[id]` только цифры; пропускаются только строковые значения, выражения и spread отбрасываются;
- узлы `html`, `mdxjsEsm`, `mdxFlowExpression`, `mdxTextExpression` удаляются (защита в глубину поверх `blockJS` next-mdx-remote 6, D-08);
- фрагмент `<>…</>` остаётся без атрибутов.

Отличия от кандидата devils-advocate (`scratchpad/secaudit/v2/remarkAllowlist.ts`):

1. `class`/`className` не пропускается. Через `class` контент мог взять классы Tailwind приложения (`fixed inset-0 z-50`) и сделать тот же оверлей, что закрывает фильтр `position`. Редактор `class` не выдаёт; `LEGIT_FIXTURES` его не содержат. Эталон DA `div-style-class` теперь даёт `<div style="background-color:#eee;padding:4px">блок</div>` без `class="note"`, остальные 17 эталонов DA совпадают байт в байт.
2. Фильтр `style` разбирает объявления через `style-to-object`, а не делит строку по `;` (при делении по `;` значение `url(data:image/png;base64,…)` дало бы обломок без двоеточия, на котором `style-to-object` бросает `property missing ':'`). Дополнительно закрыты `u\72l(` (CSS-экранирование) и `image-set('https://…')`: оба в браузере грузили внешний ресурс.
3. Проверка схем у markdown-узлов `link`, `image`, `definition` (у кандидата их не было, React 19 только блокирует `javascript:` в `href`, а `![x](javascript:…)` в браузере уходил как запрос).
4. Типы как в прежнем плагине (`Root` из mdast, свои type guard), без `as never` и `!`.

## RED → GREEN (Vitest, `yarn workspace @bio-exam/web vitest run lib/mdx/untrusted.test.ts`)

Проверка в новых тестах не регулярным чёрным списком, а инвариантом по SSR-HTML (`renderToString`): разметка разбирается на теги (каждый `<` в выводе должен оказаться тегом, иначе тест падает), каждый тег из белого списка, каждый атрибут из белого списка для тега, `href`/`src` только с разрешёнными схемами, в `style` нет `url(`, `image-set(`, `image(`, `cross-fade(`, `element(`, `expression(`, `@import`, `javascript:`, `\`, `position:`; `tweet id` только цифры; `globalThis.__mdxPwned` и `__pwn` не выставлены. Единственное исключение в разборе: `<link rel="preload" as="image" href>`, который React 19 SSR сам добавляет перед `<img>`; он принимается, только если `href` совпадает с `src` одного из `<img>` в том же выводе. Для S6 дополнительно: `renderUntrusted` не бросает, `compiled === true`, HTML непустой; для `STYLE` в верхнем регистре ожидается `<span style="color:red">x</span>`, для `style="color"` ожидается `<span>x</span>`.

RED снят на прежней реализации (`remarkStripUnsafeJsx` + прежний `remarkMdxStyleToEstree`, временно возвращённые только на время прогона): **114 тестов, 68 красных, 46 зелёных**. После GREEN: **114 passed**.

| Группа | Новых проверок | Красных до правки | Зелёных до правки |
| --- | --- | --- | --- |
| белый список по старым PAYLOADS | 9 | 2 | 7 |
| S1 | 7 | 6 | 1 |
| S2 | 6 | 6 | 0 |
| S3 | 1 | 1 | 0 |
| S4 | 23 | 21 | 2 |
| S5 | 10 | 9 | 1 |
| Missed | 14 | 14 | 0 |
| S6 | 10 | 9 | 1 |

Зелёные до правки проверки не слепые, а контрольные (защита уже была):

- белый список, 7 старых PAYLOADS: выражения и ESM вырезает next-mdx-remote 6 (`blockJS`), `script` и `on*`/`srcdoc` вырезал прежний плагин; красными были `iframe srcdoc` (сам `<iframe>`) и `javascript: в ссылках` (React 19 подставляет `javascript:throw new Error(…)`);
- S1 `Script с заглавной`: прежний плагин сравнивал имя в нижнем регистре;
- S4 `href выражением`, `href через spread`: `blockJS` отбрасывает выражения в атрибутах;
- S5 `style` с `{…}`: выражение внутри `<style>` даёт ошибку компиляции, MdxRenderer показывает текст;
- S6 `фрагмент`: контроль, рендер и так не падал.

Причины красного на прежнем коде (по одной на класс): `тег <svg> вне белого списка: <svg><svg:script>…` (S1), `тег <iframe> вне белого списка: <iframe SRC="javascript:…">` (S2), `тег <base> вне белого списка` (S3), `опасная схема href="javascript:void(…)"` у `a HREF` (S4), `тег <meta>`/`<link>`/`<style>`/`<form>` (S5), `опасный style="background:u\72l(…)"`, `атрибут srcset/target/ping/id/class вне белого списка`, `Expected component \`A\` to be defined` (Missed), React #62 / #137 / #61, `Expected component \`Foo\``, `Expected object \`x\`` (S6).

Прочие правки теста вне `LEGIT_FIXTURES`:

- `STRIPPED_JSX`: подпись `remarkStripUnsafeJsx вырезает…` → `remarkMdxAllowlist вырезает…`; в случае `srcdoc в любом регистре` к пейлоаду добавлен абзац `после` и `kept: 'после'` (весь `<iframe>` теперь удаляется вместе с `title="кадр"`).
- PAYLOADS `iframe srcdoc со скриптом`: к пейлоаду добавлен абзац `после`, чтобы тест «доходит до рендера» проверял непустой рендер (сам `<iframe>` теперь удаляется целиком).

`LEGIT_FIXTURES`: блок `const LEGIT_FIXTURES … ]` байт в байт равен блоку в `baseline/untrusted.test.ts.02-01` (`cmp` без различий, sha256 `e0ae32d5c2a951c5f93ab219ba4839c7965c7899464a37eb699d49d29f8a3256` у обоих), все 9 эталонов зелёные; стили `span`/`p` на месте.

## Браузерный прогон (headless Chromium)

Стенд в `scratchpad/secaudit/v3/`: `entry.mjs` собирается `secaudit/build.cjs` с настоящим `app/web/lib/mdx/options.ts` (в бандле есть `DROPPED_WITH_CONTENT`, нет `remarkStripUnsafeJsx`), компилирует 97 пейлоадов (`payloads.mjs` + `payloads2.mjs`: PAYLOADS, EVASION, S5X, плюс 15 своих в `payloads3.mjs`) и 18 эталонов. `drive.cjs` рендерит каждый скомпилированный код через `MDXRemote` на `https://app.test/`, все внешние хосты перехвачены (`.js` выставляет `window.__pwn`, `.css` красит `body`), проверяет без клика `window.__pwn`, URL страницы, `document.baseURI`, фон `body`, внешние запросы, ошибки страницы; затем кликает первый `a`/`button`/`text` в контенте и снова смотрит `__pwn`. Тот же драйвер прогнан по старому конвейеру (`options-old.ts` с прежними плагинами) для проверки, что он не слепой.

Итог: **после правки 97/97 чисто** (3 пейлоада не компилируются и показываются текстом, как и до правки); **до правки 53 из 97 с нарушением**. Эталоны DA: 17 из 18 совпадают с кандидатом байт в байт, 18-й отличается только отсутствием `class` (см. выше).

Чего этот драйвер не видит: `id`, `target`, `ping`, `class` на странице без Tailwind не дают наблюдаемого эффекта, поэтому в колонке «до правки» у них «чисто»; эти случаи закрыты инвариантом Vitest.

| id | пейлоад | до правки | после правки |
| --- | --- | --- | --- |
| S1 | `svg-ns-script` | __pwn без клика | чисто |
| S1 | `svg-ns-script-ext` | __pwn без клика, внешний запрос | чисто |
| S1 | `html-ns-script` | чисто | чисто |
| S1 | `plain-svg-script` | чисто | чисто |
| S1 | `Script-cap` | чисто | чисто |
| S1 | `member-x.script` | ошибка рендера | чисто |
| S1 | `svg-onload` | чисто | чисто |
| S1 | `svg-animate-onbegin` | чисто | чисто |
| S1 | `script-async-src` | чисто | чисто |
| S1 | `ev-nested-unknown-script` | ошибка рендера | чисто |
| S1 | `ev-nested-svg-in-unknown` | ошибка рендера | чисто |
| S2 | `iframe-SRC-upper` | __pwn без клика | чисто |
| S2 | `iframe-src-lower` | javascript: заблокирован React | чисто |
| S2 | `iframe-src-data` | заблокировано браузером | чисто |
| S2 | `object-data` | чисто | чисто |
| S2 | `object-DATA-upper` | чисто | чисто |
| S2 | `embed-SRC-upper` | чисто | чисто |
| S2 | `iframe-SRC-void` | чисто | чисто |
| S2 | `iframe-srcDoc-camel` | чисто | чисто |
| S2 | `x-iframe-srcdoc-lower` | чисто | чисто |
| S3 | `base-href` | baseURI изменён | чисто |
| S4 | `a-HREF-upper` | чисто | чисто |
| S4 | `a-href-ws` | javascript: заблокирован React | чисто |
| S4 | `a-href-entity` | javascript: заблокирован React | чисто |
| S4 | `a-href-tab` | javascript: заблокирован React | чисто |
| S4 | `form-action` | javascript: заблокирован React | чисто |
| S4 | `form-ACTION-upper` | чисто | чисто |
| S4 | `button-formaction-lower` | чисто | чисто |
| S4 | `svg-animate-href` | чисто | чисто |
| S4 | `svg-xlink-href` | чисто | чисто |
| S4 | `spread` | чисто | чисто |
| S4 | `md-link-js` | javascript: заблокирован React | чисто |
| S4 | `md-img-js` | внешний запрос | чисто |
| S4 | `a-href-void-lower` | javascript: заблокирован React | чисто |
| S4 | `a-HREF-void-upper` | __pwn по клику | чисто |
| S4 | `form-action-void-lower` | javascript: заблокирован React | чисто |
| S4 | `form-ACTION-void-upper` | __pwn по клику | чисто |
| S4 | `button-formaction-void-lower` | __pwn по клику | чисто |
| S4 | `button-formAction-void-camel` | javascript: заблокирован React | чисто |
| S4 | `svg-set-href` | __pwn по клику | чисто |
| S4 | `entity-js-in-img` | внешний запрос | чисто |
| S4 | `ev-A-HREF-mixed` | ошибка рендера | чисто |
| S4 | `ev-a-href-ctrl` | javascript: заблокирован React | чисто |
| S4 | `ev-a-href-entity-dec` | javascript: заблокирован React | чисто |
| S4 | `ev-a-href-newline` | javascript: заблокирован React | чисто |
| S4 | `ev-a-href-vbscript` | чисто | чисто |
| S4 | `ev-a-href-data` | заблокировано браузером | чисто |
| S4 | `ev-spread` | чисто | чисто |
| S4 | `ev-expr-attr` | чисто | чисто |
| S4 | `ev-details-ontoggle` | чисто | чисто |
| S4 | `ev-xmlns-math` | чисто | чисто |
| S4 | `x-md-link-js` | javascript: заблокирован React | чисто |
| S4 | `x-md-link-entity` | javascript: заблокирован React | чисто |
| S4 | `x-md-img-js` | внешний запрос | чисто |
| S4 | `x-md-definition` | javascript: заблокирован React | чисто |
| S4 | `x-href-vbscript` | чисто | чисто |
| S4 | `x-img-onerror` | чисто | чисто |
| S4 | `x-div-onclick` | чисто | чисто |
| S4 | `x-expr-flow` | чисто | чисто |
| S4 | `x-export` | чисто | чисто |
| S5 | `meta-refresh` | навигация без клика, baseURI изменён, внешний запрос | чисто |
| S5 | `link-stylesheet` | чужой CSS, внешний запрос | чисто |
| S5 | `style-import` | чисто | чисто |
| S5 | `raw-html-comment` | текст (не скомпилировано) | текст (не скомпилировано) |
| S5 | `iframe-https` | внешний запрос | чисто |
| S5 | `style-red` | текст (не скомпилировано) | текст (не скомпилировано) |
| S5 | `style-precedence` | текст (не скомпилировано) | текст (не скомпилировано) |
| S5 | `style-escaped` | чужой CSS | чисто |
| S5 | `style-escaped-prec` | чужой CSS | чисто |
| S5 | `style-import-quoted` | чисто | чисто |
| S5 | `s5-object-https` | внешний запрос | чисто |
| S5 | `s5-embed-https` | внешний запрос | чисто |
| S5 | `s5-form-https` | чисто | чисто |
| S5 | `x-style-escaped-url` | внешний запрос | чисто |
| S6 | `s6-empty-style` | ошибка рендера | чисто |
| S6 | `s6-unknown-component` | ошибка рендера | чисто |
| S6 | `s6-member-script` | ошибка рендера | чисто |
| S6 | `s6-img-children` | ошибка рендера | чисто |
| S6 | `s6-dangerously` | ошибка рендера | чисто |
| S6 | `s6-style-badcss` | текст (не скомпилировано) | чисто |
| S6 | `s6-STYLE-upper` | чисто | чисто |
| S6 | `s6-br-children` | ошибка рендера | чисто |
| S6 | `ev-fragment` | чисто | чисто |
| S6 | `x-span-style-ws` | ошибка рендера | чисто |
| S6 | `x-fragment` | чисто | чисто |
| Missed | `a-target-blank` | чисто | чисто |
| Missed | `id-clobber` | чисто | чисто |
| Missed | `ev-img-style-url` | внешний запрос | чисто |
| Missed | `ev-span-style-fixed` | чисто | чисто |
| Missed | `ev-tweet-id` | чисто | чисто |
| Missed | `ev-Img-cap` | ошибка рендера | чисто |
| Missed | `ev-A-cap-https` | ошибка рендера | чисто |
| Missed | `ev-kelvin` | ошибка рендера | чисто |
| Missed | `ev-img-srcset` | внешний запрос | чисто |
| Missed | `ev-a-ping` | чисто | чисто |
| Missed | `x-style-image-set` | внешний запрос | чисто |
| Missed | `x-div-class-overlay` | чисто | чисто |

Граница ошибок, реальный `MdxRenderer.tsx` в браузере (`renderer-entry.jsx`, бандл с алиасом `@/lib/mdx/options`):

| Вариант | `до <Foo /> после` | `<span style="">` | `<img>подпись</img>` | `dangerouslySetInnerHTML="x"` |
| --- | --- | --- | --- | --- |
| новый `MdxRenderer` + новый конвейер | `<p>до  после</p>` | `<span>x</span>` | `<img src="/a.png">` | `<div>y</div>` |
| новый `MdxRenderer` + старый конвейер (рендер бросает) | текст `до <Foo /> после`, без необработанной ошибки | текст исходника | текст исходника | текст исходника |
| `MdxRenderer` из HEAD + старый конвейер | корень пустой, `Expected component \`Foo\`` | пусто, React #62 | пусто, React #137 | пусто, React #61 |

В тех же прогонах S1 (`svg:script`), S2 (`iframe SRC`), S3 (`base`) с новым конвейером чистые, со старым `__pwn` выставлен и `baseURI` меняется; эталон `span style` одинаков во всех вариантах. Граница — защита в глубину: Vitest-проверки S6 зелёные за счёт плагина и `remarkMdxStyleToEstree` (`renderToString` границы ошибок не использует).

## Гейты

| Проверка | Результат |
| --- | --- |
| `yarn install --immutable` | код 0, `yarn.lock` не изменился (sha1 до и после совпадает) |
| `yarn workspace @bio-exam/web typecheck` | код 0 |
| `yarn workspace @bio-exam/web lint` | в изменённых файлах предупреждений нет; `MdxRenderer.tsx:63 react(set-state-in-effect)` есть и в HEAD-версии файла (`MdxImage`, не тронут) |
| `oxfmt --check .` | `All matched files use the correct format.` |
| `yarn verify` | `yarn verify: OK`, все 8 шагов passed; web 147 тестов, 9 файлов |
| Сборка web по `buildCommand` из `app/web/vercel.json` с плейсхолдерами env | код 0, `▲ Next.js 16.3.8 (Turbopack)`, `✓ Compiled successfully`, `ƒ Proxy (Middleware)`; `Failed to compile` / `Invalid server env` нет |
| `yarn e2e` | `108 passed`; 6 ожидаемых падений `@known-defect` (`test.fail`), тот же набор, что в прогоне 02-06 |

## S8: формулировки в `docs/security/dependency-audit.md`

- serialize-javascript, колонка исправления: «зависимость остаётся: в yarn.lock terser-webpack-plugin 5.3.16 с `serialize-javascript ^6.0.2`; terser-webpack-plugin 5.3.17 и выше не зависит от serialize-javascript (код встроен) и входит в диапазон webpack `^5.3.16`. resolutions нет: build-инструмент».
- tar (девять строк с одинаковой формулировкой), колонка достижимости: «путь через bcrypt — build-инструмент: …; путь через @vercel/node — dev-инструмент: @vercel/node в devDependencies app/server». Вывод о недостижимости в production не изменился.

Файл переформатирован `oxfmt` (выравнивание таблицы); он новый в этой фазе, отдельного коммита форматирования не требует.

## Отложено

В `deferred-items.md` записаны S7 (multer отдаёт клиентские ошибки как 500, тесты 02-02 закрепляют это по D-11), S9 (статическая проверка полов версий в `yarn.lock` внутри `yarn verify`) и CSP с `base-uri 'self'`.
