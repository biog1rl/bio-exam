type MountKey = { name: string | number }

type Handle = ((...args: never[]) => unknown) & { stack?: unknown }

type RouteLayer = { method?: string; handle: Handle }

type StackLayer = {
	name?: string
	regexp: RegExp & { fast_slash?: boolean }
	keys: MountKey[]
	handle: Handle
	route?: { path: unknown; stack: RouteLayer[] }
}

const MOUNT_TAIL = '\\/?(?=\\/|$)'
const PARAM_SEGMENT = '(?:\\/([^/]+?))'
const LITERAL = /^[A-Za-z0-9_~-]$/

function unknownForm(regexp: RegExp): Error {
	return new Error(`route-inventory: unsupported mount regexp ${regexp.source}`)
}

export function decodeMountPath(regexp: RegExp, keys: MountKey[]): string {
	if ((regexp as { fast_slash?: boolean }).fast_slash === true) return '/'
	const source = regexp.source
	if (!source.startsWith('^') || !source.endsWith(MOUNT_TAIL)) throw unknownForm(regexp)
	const body = source.slice(1, source.length - MOUNT_TAIL.length)
	if (body === '') return '/'
	let path = ''
	let keyIndex = 0
	let index = 0
	while (index < body.length) {
		const rest = body.slice(index)
		if (rest.startsWith(PARAM_SEGMENT)) {
			const key = keys[keyIndex]
			if (!key) throw unknownForm(regexp)
			keyIndex += 1
			index += PARAM_SEGMENT.length
			const optional = body[index] === '?'
			if (optional) index += 1
			path += `/:${key.name}${optional ? '?' : ''}`
			continue
		}
		if (rest.startsWith('\\/')) {
			path += '/'
			index += 2
			continue
		}
		if (rest.startsWith('\\.')) {
			path += '.'
			index += 2
			continue
		}
		const char = rest[0] ?? ''
		if (LITERAL.test(char)) {
			path += char
			index += 1
			continue
		}
		throw unknownForm(regexp)
	}
	if (keyIndex !== keys.length || !path.startsWith('/')) throw unknownForm(regexp)
	return path
}

function joinPath(prefix: string, path: string): string {
	if (prefix === '/' || prefix === '') return path === '' ? '/' : path
	if (path === '/' || path === '') return prefix
	return prefix + path
}

function handleName(handle: Handle): string {
	return handle.name === '' ? '<anonymous>' : handle.name
}

function isRouter(handle: Handle): boolean {
	return typeof handle === 'function' && Array.isArray(handle.stack)
}

function walk(stack: StackLayer[], prefix: string, lines: string[]): void {
	for (const layer of stack) {
		if (layer.route) {
			const routePath = layer.route.path
			if (typeof routePath !== 'string') {
				throw new Error(`route-inventory: unsupported route path ${String(routePath)} under ${prefix || '/'}`)
			}
			const fullPath = joinPath(prefix, routePath)
			const chains = new Map<string, string[]>()
			for (const routeLayer of layer.route.stack) {
				const method = (routeLayer.method ?? 'all').toUpperCase()
				const chain = chains.get(method) ?? []
				chain.push(handleName(routeLayer.handle))
				chains.set(method, chain)
			}
			for (const [method, chain] of chains) lines.push(`${method} ${fullPath}  ${chain.join(' > ')}`)
			continue
		}
		const mountPath = joinPath(prefix, decodeMountPath(layer.regexp, layer.keys))
		if (isRouter(layer.handle)) {
			walk(layer.handle.stack as StackLayer[], mountPath === '/' ? '' : mountPath, lines)
			continue
		}
		lines.push(`USE ${mountPath} ${handleName(layer.handle)}`)
	}
}

export function routeInventory(app: unknown): string[] {
	const router = (app as { _router?: { stack?: StackLayer[] } })._router
	if (!router || !Array.isArray(router.stack)) throw new Error('route-inventory: application has no router stack')
	const lines: string[] = []
	walk(router.stack, '', lines)
	return lines
}

export function inventoryText(app: unknown): string {
	return `${routeInventory(app).join('\n')}\n`
}

export function firstDifference(expected: string, actual: string): string | null {
	if (expected === actual) return null
	const left = expected.split('\n')
	const right = actual.split('\n')
	const length = Math.max(left.length, right.length)
	for (let line = 0; line < length; line += 1) {
		if (left[line] !== right[line]) {
			return `line ${line + 1}: expected ${JSON.stringify(left[line] ?? null)}, got ${JSON.stringify(right[line] ?? null)}`
		}
	}
	return 'files differ'
}
