export type BeforeUnloadWindow = {
	addEventListener(type: 'beforeunload' | 'pagehide', listener: (event: Event) => void): void
	removeEventListener(type: 'beforeunload' | 'pagehide', listener: (event: Event) => void): void
}

export type BeforeUnloadGuard = { setActive(active: boolean): void; dispose(): void }

export function createBeforeUnloadGuard(win: BeforeUnloadWindow): BeforeUnloadGuard {
	let attached = false
	let disposed = false

	function preventUnload(event: Event): void {
		const unload = event as BeforeUnloadEvent
		unload.preventDefault()
		unload.returnValue = ''
	}

	function setActive(active: boolean): void {
		if (disposed || active === attached) return
		attached = active
		if (active) win.addEventListener('beforeunload', preventUnload)
		else win.removeEventListener('beforeunload', preventUnload)
	}

	return {
		setActive,
		dispose() {
			setActive(false)
			disposed = true
		},
	}
}
