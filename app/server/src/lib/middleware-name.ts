export function nameMiddleware<T extends (...args: never[]) => unknown>(fn: T, name: string): T {
	Object.defineProperty(fn, 'name', { value: name, configurable: true })
	return fn
}
