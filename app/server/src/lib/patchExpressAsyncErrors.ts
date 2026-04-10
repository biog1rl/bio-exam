import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

type LayerHandle = (req: unknown, res: unknown, next: (err?: unknown) => void) => unknown

type LayerPrototype = {
	handle: LayerHandle
	handle_request: (req: unknown, res: unknown, next: (err?: unknown) => void) => void
	__bioExamAsyncPatchApplied?: boolean
}

const Layer = require('express/lib/router/layer') as { prototype: LayerPrototype }

if (!Layer.prototype.__bioExamAsyncPatchApplied) {
	const originalHandleRequest = Layer.prototype.handle_request

	Layer.prototype.handle_request = function patchedHandleRequest(req, res, next) {
		const fn = this.handle

		// Keep Express behavior: handlers with arity > 3 are error handlers.
		if (fn.length > 3) {
			return originalHandleRequest.call(this, req, res, next)
		}

		try {
			const result = fn(req, res, next)
			if (result && typeof (result as Promise<unknown>).then === 'function') {
				;(result as Promise<unknown>).catch(next)
			}
		} catch (err) {
			next(err)
		}
	}

	Layer.prototype.__bioExamAsyncPatchApplied = true
}

