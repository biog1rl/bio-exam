import type { SaveQueueState } from '@/lib/drafts/save-queue'

import type { AttemptPhase, SaveIndicatorKind } from './lifecycle'

export const SAVE_INDICATOR_THRESHOLD_MS = 1500

export type SaveIndicatorTone = 'muted' | 'warning'

export type SaveIndicatorView = { text: string; tone: SaveIndicatorTone }

export type SaveIndicatorInput = {
	phase: AttemptPhase
	queue: SaveQueueState
	now: number
	hasSession: boolean
	walPendingCount: number
}

const VIEWS: Record<SaveIndicatorKind, SaveIndicatorView> = {
	saved: { text: 'Ответы сохранены', tone: 'muted' },
	saving: { text: 'Сохранение…', tone: 'muted' },
	offline: { text: 'Нет связи с сервером. Ответы сохранены на этом устройстве', tone: 'warning' },
	'device-only': { text: 'Ответы сохранены на этом устройстве', tone: 'muted' },
}

export function saveIndicatorKind({
	phase,
	queue,
	now,
	hasSession,
	walPendingCount,
}: SaveIndicatorInput): SaveIndicatorKind | null {
	if (phase !== 'active') return null
	if (!hasSession) return walPendingCount > 0 ? 'offline' : 'saved'
	if (queue.failure?.kind === 'stopped') return 'device-only'
	if (queue.failure?.kind === 'retrying') return 'offline'
	if (queue.pending.length === 0 || queue.oldestPendingSince === null) return 'saved'
	return now - queue.oldestPendingSince >= SAVE_INDICATOR_THRESHOLD_MS ? 'saving' : 'saved'
}

export function saveIndicatorDueAt(input: SaveIndicatorInput): number | null {
	const { phase, queue, now, hasSession } = input
	if (phase !== 'active' || !hasSession || queue.failure !== null) return null
	if (queue.pending.length === 0 || queue.oldestPendingSince === null) return null
	const dueAt = queue.oldestPendingSince + SAVE_INDICATOR_THRESHOLD_MS
	return dueAt > now ? dueAt : null
}

export function saveIndicatorView(kind: SaveIndicatorKind): SaveIndicatorView {
	return VIEWS[kind]
}
