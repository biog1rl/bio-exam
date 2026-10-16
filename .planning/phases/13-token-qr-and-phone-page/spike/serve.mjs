import fs from 'node:fs'
import http from 'node:http'
import https from 'node:https'
import os from 'node:os'
import path from 'node:path'

const DUMMY_TOKEN = 'Spike13-Token_ABCDEFGHIJKLMNOPQRSTUVWXYZabc'
const SPIKE_FILE = path.join(import.meta.dirname, 'spike.html')

function parseArgs(argv) {
	const options = { port: 8080, cert: null, key: null, check: false }
	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i]
		if (arg === '--check') options.check = true
		else if (arg === '--port') options.port = Number(argv[++i])
		else if (arg === '--cert') options.cert = argv[++i]
		else if (arg === '--key') options.key = argv[++i]
		else throw new Error(`неизвестный флаг: ${arg}`)
	}
	if (!Number.isInteger(options.port) || options.port < 0 || options.port > 65535) {
		throw new Error('--port: нужен номер порта 0–65535')
	}
	if (Boolean(options.cert) !== Boolean(options.key)) {
		throw new Error('--cert и --key задаются вместе')
	}
	return options
}

function lanAddresses() {
	const found = []
	for (const list of Object.values(os.networkInterfaces())) {
		for (const item of list ?? []) {
			if (item.family === 'IPv4' && !item.internal) found.push(item.address)
		}
	}
	return found
}

const BASE_HEADERS = {
	'Referrer-Policy': 'no-referrer',
	'Cache-Control': 'no-store',
	'X-Robots-Tag': 'noindex, nofollow',
}

function send(res, status, type, body) {
	res.writeHead(status, { ...BASE_HEADERS, 'Content-Type': type, 'Content-Length': Buffer.byteLength(body) })
	res.end(body)
}

function createHandler(scheme) {
	return async (req, res) => {
		const pathname = new URL(req.url ?? '/', 'http://stand').pathname
		try {
			if (req.method !== 'GET' && req.method !== 'HEAD') {
				send(res, 405, 'text/plain; charset=utf-8', 'method not allowed')
				return
			}
			if (pathname === '/spike.html') {
				send(res, 200, 'text/html; charset=utf-8', fs.readFileSync(SPIKE_FILE, 'utf8'))
				return
			}
			if (pathname === '/qr.html') {
				const { renderQrPage } = await import('./qr-render.mjs')
				const host = req.headers.host || 'localhost'
				send(res, 200, 'text/html; charset=utf-8', renderQrPage(`${scheme}://${host}`, DUMMY_TOKEN))
				return
			}
			send(res, 404, 'text/plain; charset=utf-8', 'not found')
		} catch (error) {
			console.error(`ошибка на ${pathname}:`, error)
			send(res, 500, 'text/plain; charset=utf-8', 'internal error')
		}
	}
}

function createServer(options) {
	if (options.cert) {
		const tls = { cert: fs.readFileSync(options.cert), key: fs.readFileSync(options.key) }
		return { scheme: 'https', server: https.createServer(tls, createHandler('https')) }
	}
	return { scheme: 'http', server: http.createServer(createHandler('http')) }
}

function listen(server, port, host) {
	return new Promise((resolve, reject) => {
		server.once('error', reject)
		server.listen(port, host, () => resolve(server.address().port))
	})
}

function fetchLocal(scheme, port, pathname) {
	const client = scheme === 'https' ? https : http
	return new Promise((resolve, reject) => {
		const req = client.get(
			{ host: '127.0.0.1', port, path: pathname, rejectUnauthorized: false, headers: { Host: `127.0.0.1:${port}` } },
			(res) => {
				const chunks = []
				res.on('data', (chunk) => chunks.push(chunk))
				res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString('utf8') }))
			},
		)
		req.on('error', reject)
	})
}

function printAddresses(scheme, port) {
	const hosts = lanAddresses()
	if (hosts.length === 0) console.log('LAN-адресов IPv4 не найдено: телефон стенд не откроет')
	for (const host of hosts) {
		console.log(`телефон: ${scheme}://${host}:${port}/spike.html#${DUMMY_TOKEN}`)
		console.log(`QR-лист: ${scheme}://${host}:${port}/qr.html`)
	}
}

async function runCheck(options) {
	const { scheme, server } = createServer(options)
	const port = await listen(server, 0, '127.0.0.1')
	const problems = []
	try {
		const spike = await fetchLocal(scheme, port, '/spike.html')
		if (spike.status !== 200) problems.push(`/spike.html: статус ${spike.status}, ожидался 200`)
		if (spike.headers['referrer-policy'] !== 'no-referrer') problems.push('/spike.html: нет Referrer-Policy: no-referrer')
		if (spike.headers['cache-control'] !== 'no-store') problems.push('/spike.html: нет Cache-Control: no-store')
		const missing = await fetchLocal(scheme, port, '/nope')
		if (missing.status !== 404) problems.push(`/nope: статус ${missing.status}, ожидался 404`)
		if (missing.headers['referrer-policy'] !== 'no-referrer') problems.push('/nope: нет Referrer-Policy: no-referrer')
		const qr = await fetchLocal(scheme, port, '/qr.html')
		const svgCount = qr.body.split('<svg').length - 1
		if (qr.status !== 200) problems.push(`/qr.html: статус ${qr.status}, ожидался 200`)
		if (svgCount < 6) problems.push(`/qr.html: <svg ${svgCount}, ожидалось не меньше 6`)
		if (!qr.body.includes('#4b6b38')) problems.push('/qr.html: нет цвета глазков #4b6b38')
		if (!qr.body.includes(`/spike.html#${DUMMY_TOKEN}`)) problems.push('/qr.html: нет адреса стенда с пустышкой')
	} catch (error) {
		problems.push(`запрос к стенду не прошёл: ${error.message}`)
	} finally {
		server.close()
	}
	printAddresses(scheme, options.port)
	if (problems.length > 0) {
		for (const problem of problems) console.log(`spike stand: FAIL ${problem}`)
		process.exit(1)
	}
	console.log('spike stand: OK')
	process.exit(0)
}

async function runServer(options) {
	const { scheme, server } = createServer(options)
	const port = await listen(server, options.port, '0.0.0.0')
	console.log(`стенд спайка слушает ${scheme} на порту ${port}`)
	printAddresses(scheme, port)
	if (scheme === 'http') {
		console.log('режим HTTP: буфер обмена и защищённый контекст недоступны, это артефакт стенда, не отказ устройства')
	}
}

let options
try {
	options = parseArgs(process.argv.slice(2))
} catch (error) {
	console.error(error.message)
	process.exit(1)
}

if (options.check) await runCheck(options)
else await runServer(options)
