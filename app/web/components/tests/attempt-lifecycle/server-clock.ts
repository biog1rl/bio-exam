export type ServerClock = {
	observe(serverNow: string | null | undefined): void
	now(): number
	offsetMs(): number
}

export function createServerClock(deviceNow: () => number): ServerClock {
	let offset = 0
	return {
		observe(serverNow) {
			if (typeof serverNow !== 'string') return
			const serverMs = Date.parse(serverNow)
			if (Number.isNaN(serverMs)) return
			offset = serverMs - deviceNow()
		},
		now() {
			return deviceNow() + offset
		},
		offsetMs() {
			return offset
		},
	}
}
