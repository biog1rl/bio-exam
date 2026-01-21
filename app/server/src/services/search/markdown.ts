/**
 * Преобразует Markdown/MDX в плоский текст, пригодный для полнотекстового поиска.
 *
 * Алгоритм:
 * 1) Временно сохраняет все варианты кода (фенсы ```/~~~, <pre><code>, <code>, инлайн-бэктики) в плейсхолдеры,
 *    чтобы не повредить содержимое кода при дальнейшей очистке.
 * 2) Заменяет изображения и ссылки на их видимые подписи (alt/label).
 * 3) Удаляет HTML/JSX-теги (включая <span style="…"> и MDX-компоненты), оставляя текст.
 * 4) Снимает Markdown-форматирование (заголовки, списки, цитаты, инлайн-стили).
 * 5) Возвращает сохранённый код обратно, убирая лишь оболочки (фенсы/теги), сохраняя чистый текст кода.
 * 6) Нормализует пробелы (схлопывает последовательности whitespace до одного пробела).
 *
 * @param {string} markdown Исходный Markdown/MDX. Может быть пустой строкой.
 * @returns {string} Плоский текст без разметки, со вставленным «сырьем» кодовых блоков и инлайн-кода.
 *
 * @example
 * stripMarkdownToText('# Заголовок\\nТекст с **жирным** и `кодом`.');
 * // => 'Заголовок Текст с жирным и кодом.'
 *
 * @example
 * stripMarkdownToText('```ts\\nconst x = 1;\\n```\\n<span style="color:red">hi</span>');
 * // => 'const x = 1; hi'
 *
 * @remarks
 * - Переводы строк в итоговом тексте схлопываются в пробелы. Если вам необходимо сохранить переносы
 *   внутри кода, перенесите этап нормализации пробелов до восстановления плейсхолдеров и адаптируйте замену.
 * - Автоссылки вида <https://…> удаляются целиком.
 * - Текст детей MDX-компонентов сохраняется, сами теги — удаляются.
 */
export function stripMarkdownToText(markdown: string): string {
	let input = markdown || ''

	const placeholders: string[] = []
	const save = (chunk: string) => {
		const id = `__CODE_PLACEHOLDER_${placeholders.length}__`
		placeholders.push(chunk)
		return id
	}

	// 1) Сохраняем ВСЕ варианты кода (порядок важен: от длинных к коротким)
	//    Фенсы ```lang\n...\n``` и ~~~
	input = input.replace(/```[^\n]*\n[\s\S]*?```/g, (m) => save(m))
	input = input.replace(/~~~[^\n]*\n[\s\S]*?~~~/g, (m) => save(m))
	//    <pre><code>...</code></pre>
	input = input.replace(/<pre[^>]*>\s*<code[^>]*>[\s\S]*?<\/code>\s*<\/pre>/gi, (m) => save(m))
	//    Отдельные <code>...</code>
	input = input.replace(/<code[^>]*>[\s\S]*?<\/code>/gi, (m) => save(m))
	//    Инлайн-бэктики
	input = input.replace(/`[^`]+`/g, (m) => save(m))

	// 2) Картинки/ссылки — оставляем только их видимый текст (alt/label)
	input = input
		.replace(/!\[([^\]]*)]\([^)]+(?:\s+"[^"]*")?\)/g, ' $1 ')
		.replace(/\[([^\]]+)]\([^)]+(?:\s+"[^"]*")?\)/g, ' $1 ')
		// автоссылки <http://…>
		.replace(/<https?:\/\/[^>\s]+>/g, ' ')

	// 3) Убираем HTML/JSX-теги (включая <span style=…>, компоненты MDX и т.п.), оставляя их текстовое содержимое
	input = input.replace(/<\/?[^>]+>/g, ' ')

	// 4) Снимаем Markdown-форматирование
	input = input
		.replace(/^ {0,3}#{1,6}\s+/gm, ' ') // лиды заголовков
		.replace(/^ {0,3}>\s?/gm, ' ') // цитаты
		.replace(/[*_~`]+/g, ' ') // инлайн-стили
		.replace(/^ {0,3}[-*+]\s+/gm, ' ') // маркеры списков
		.replace(/^\d+\.\s+/gm, ' ') // нумерованные списки
		.replace(/^\s*---+\s*$/gm, ' ') // горизонтальные линии

	// 5) Возвращаем сохранённый код, убрав оболочки (фенсы/теги), но сохраняя содержимое
	let out = input
	placeholders.forEach((raw, i) => {
		const cleaned = raw
			// убираем ограждения для фенсов
			.replace(/^```[^\n]*\n|```$/g, '')
			.replace(/^~~~[^\n]*\n|~~~$/g, '')
			// убираем HTML-обёртки кода
			.replace(/^<pre[^>]*>\s*<code[^>]*>/i, '')
			.replace(/<\/code>\s*<\/pre>$/i, '')
			.replace(/^<code[^>]*>/i, '')
			.replace(/<\/code>$/i, '')
		// точечная замена по плейсхолдеру
		out = out.replace(`__CODE_PLACEHOLDER_${i}__`, cleaned)
	})

	// 6) Нормализуем пробелы
	return out.replace(/\s+/g, ' ').trim()
}

/**
 * Извлекает тексты заголовков уровней H2–H6 из Markdown/MDX.
 *
 * Поддерживаются два формата:
 * 1) Markdown-заголовки с префиксами `##`–`######` в начале строки.
 * 2) HTML/MDX-заголовки `<h2>`–`<h6>` (внутренние теги вроде `<em>` удаляются).
 *
 * @param {string} markdown Исходный Markdown/MDX.
 * @returns {string[]} Список заголовков без символов `#` и без HTML-тегов. Порядок: сначала Markdown-заголовки, затем HTML/MDX-заголовки.
 *
 * @example
 * extractHeadings('# H1\\n## H2 **bold**\\n<h3>Title <em>inside</em></h3>');
 * // => ['H2 bold', 'Title inside']
 *
 * @remarks
 * - Заголовки уровня H1 (`#` или `<h1>`) намеренно игнорируются.
 * - Функция не выполняет дедупликацию и не гарантирует сортировку по уровню — только по порядку обнаружения.
 * - Переносы и множественные пробелы внутри заголовка схлопываются.
 *
 * @see stripMarkdownToText — для получения общего плоского текста из документа.
 */
export function extractHeadings(markdown: string): string[] {
	const src = markdown || ''
	const md = Array.from(src.matchAll(/^(#{2,6})\s+(.+)$/gm)).map((m) => m[2].trim())
	const html = Array.from(src.matchAll(/<h([2-6])[^>]*>([\s\S]*?)<\/h\1>/gi)).map((m) =>
		// вычищаем теги внутри заголовка (на случай <em>…</em> и т.п.)
		m[2]
			.replace(/<\/?[^>]+>/g, ' ')
			.replace(/\s+/g, ' ')
			.trim()
	)
	return [...md, ...html]
}
