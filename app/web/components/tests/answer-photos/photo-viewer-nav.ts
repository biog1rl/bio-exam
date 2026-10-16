export const SWIPE_MIN_DISTANCE_PX = 60
export const SWIPE_MAX_DURATION_MS = 500

export function stepIndex(index: number, delta: number, count: number): number {
	return Math.min(Math.max(index + delta, 0), count - 1)
}

export function swipeDelta(gesture: { dx: number; dy: number; durationMs: number }): -1 | 0 | 1 {
	const { dx, dy, durationMs } = gesture
	if (durationMs > SWIPE_MAX_DURATION_MS) return 0
	if (Math.abs(dx) <= SWIPE_MIN_DISTANCE_PX || Math.abs(dx) <= Math.abs(dy)) return 0
	return dx < 0 ? 1 : -1
}
