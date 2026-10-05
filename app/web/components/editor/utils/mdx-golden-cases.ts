export type MdxGoldenCase = { name: string; input: string; output: string; idempotent?: false }

export const MDX_GOLDEN_CASES: readonly MdxGoldenCase[] = [
	{
		name: 'heading-emoji',
		input: '# Заголовок\n\nПривет :smile:',
		output: '# Заголовок\n\nПривет 😄',
	},
	{
		name: 'emoji-aliases',
		input: 'Реакции :heart::fire: :thumbsup: :rocket: и :nope:',
		output: 'Реакции ❤️🔥 👍 🚀 и :nope:',
	},
	{
		name: 'image-markdown',
		input: 'Рисунок\n\n![Клетка под микроскопом](/uploads/cell.png)',
		output: 'Рисунок\n\n![Клетка под микроскопом](/uploads/cell.png)',
	},
	{
		name: 'image-html-sized',
		input: '<img src="/uploads/leaf.png" alt="Лист" width="320" height="240" />',
		output: '<img src="/uploads/leaf.png" alt="Лист" width="320" height="240" />',
	},
	{
		name: 'table',
		input:
			'| Орган | Функция | Примечание |\n| :--- | :---: | ---: |\n| Сердце | Насос |  |\n| Лёгкие | Газообмен | Парный |',
		output:
			'|  Орган |  Функция |  Примечание |\n| --- | --- | --- |\n|  Сердце |  Насос |  |\n|  Лёгкие |  Газообмен |  Парный |',
		idempotent: false,
	},
	{
		name: 'code-block',
		input: '```python\nprint("ДНК")\nx = 1\n```',
		output: '```python\nprint("ДНК")\nx = 1\n```',
	},
	{
		name: 'check-list',
		input: '- [x] Прочитать параграф\n- [ ] Решить задачи',
		output: '- [x] Прочитать параграф\n- [ ] Решить задачи',
	},
	{
		name: 'horizontal-rule',
		input: 'Выше линии\n\n---\n\nНиже линии',
		output: 'Выше линии\n\n***\n\nНиже линии',
	},
	{
		name: 'tweet',
		input: '<tweet id="1234567890" />',
		output: '<tweet id="1234567890" />',
	},
	{
		name: 'headings-quote',
		input: '# Первый\n\n## Второй\n\n### Третий\n\n> Цитата о клетке',
		output: '# Первый\n\n## Второй\n\n### Третий\n\n> Цитата о клетке',
	},
	{
		name: 'lists',
		input: '1. Первый\n2. Второй\n    - Вложенный\n    - Ещё вложенный\n3. Третий\n\n- Маркер один\n- Маркер два',
		output: '1. Первый\n2. Второй\n    - Вложенный\n    - Ещё вложенный\n3. Третий\n\n- Маркер один\n- Маркер два',
	},
	{
		name: 'link',
		input: 'Подробнее в [учебнике](https://example.com/biology) по теме',
		output: 'Подробнее в [учебнике](https://example.com/biology) по теме',
	},
	{
		name: 'inline-formats',
		input: 'Слово **жирное**, *курсивное*, ~~зачёркнутое~~ и `код`',
		output: 'Слово **жирное**, *курсивное*, ~~зачёркнутое~~ и `код`',
	},
	{
		name: 'multi-paragraph',
		input: 'Первый абзац\n\nВторой абзац\n\n\n\nТретий абзац после пустых строк',
		output: 'Первый абзац\n\nВторой абзац\n\n\n\nТретий абзац после пустых строк',
	},
]
