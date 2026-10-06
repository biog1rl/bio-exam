import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const roadmapPath = path.resolve(here, '../ROADMAP.md')
const htmlPath = path.join(here, 'plan.html')
const overridesPath = path.join(here, 'overrides.json')

const STATUSES = new Set(['done', 'review', 'work', 'plan'])
const MONTHS = [
	'января',
	'февраля',
	'марта',
	'апреля',
	'мая',
	'июня',
	'июля',
	'августа',
	'сентября',
	'октября',
	'ноября',
	'декабря',
]
const DATA_RE = /(<script type="application\/json" id="plan-data">\n)([\s\S]*?)(\n<\/script>)/

function readOverrides() {
	if (!fs.existsSync(overridesPath)) return {}
	return JSON.parse(fs.readFileSync(overridesPath, 'utf8'))
}

function statusFromRow(planCell, statusCell) {
	if (/complete/i.test(statusCell)) return 'done'
	const match = planCell.match(/(\d+)\s*\/\s*(\d+)/)
	if (match) {
		const done = Number(match[1])
		const total = Number(match[2])
		if (total > 0 && done === total) return 'review'
		if (total > 0) return 'work'
	}
	return 'plan'
}

function readStatuses() {
	const roadmap = fs.readFileSync(roadmapPath, 'utf8')
	const statuses = {}
	for (const line of roadmap.split('\n')) {
		const row = line.match(/^\|\s*(\d+(?:\.\d+)?)\.\s[^|]+\|\s*([^|]+)\|\s*([^|]+)\|/)
		if (!row) continue
		statuses[row[1]] = statusFromRow(row[2], row[3])
	}
	return statuses
}

const statuses = { ...readStatuses(), ...readOverrides() }
const html = fs.readFileSync(htmlPath, 'utf8')
const match = html.match(DATA_RE)
if (!match) throw new Error('в plan.html нет блока plan-data')
const data = JSON.parse(match[2])

for (const item of [...data.stages, ...data.milestones]) {
	const status = statuses[item.id]
	if (!STATUSES.has(status)) throw new Error(`нет статуса для этапа ${item.id}`)
	item.status = status
}

if (![...data.stages, ...data.milestones].some((item) => item.status === 'work')) {
	throw new Error('блок «Сейчас» пуст: перенеси в работу следующий этап через overrides.json')
}

const now = new Date()
data.asOf = `Состояние на ${now.getDate()} ${MONTHS[now.getMonth()]} ${now.getFullYear()} года.`

const lines = [
	'{',
	`  "asOf": ${JSON.stringify(data.asOf)},`,
	'  "stages": [',
	data.stages.map((stage) => `    ${JSON.stringify(stage)}`).join(',\n'),
	'  ],',
	'  "milestones": [',
	data.milestones.map((item) => `    ${JSON.stringify(item)}`).join(',\n'),
	'  ],',
	`  "deps": ${JSON.stringify(data.deps)},`,
	'  "areas": [',
	data.areas.map((area) => `    ${JSON.stringify(area)}`).join(',\n'),
	'  ]',
	'}',
]

fs.writeFileSync(htmlPath, html.replace(DATA_RE, (whole, open, body, close) => `${open}${lines.join('\n')}${close}`))
console.log(JSON.stringify({ statuses: Object.fromEntries([...data.stages, ...data.milestones].map((s) => [s.id, s.status])), asOf: data.asOf }))
