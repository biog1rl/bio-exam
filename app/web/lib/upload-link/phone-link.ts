import {
	ANSWER_PHOTO_FORBIDDEN_MESSAGE,
	UPLOAD_WINDOW_ERROR_CODES,
	UploadWindowRefusalSchema,
} from '@bio-exam/exam-core'

import { readApiError } from '@/lib/http/errors'
import type { RequestFailure } from '@/lib/http/request'

export const PHONE_UPLOAD_PATH = '/photo-upload'

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/

const TOKEN_STORAGE_KEY = 'photo-upload-token'

type TokenStorage = Pick<Storage, 'getItem' | 'setItem'>

export function phoneUploadUrl(origin: string, token: string): string {
	return `${origin}${PHONE_UPLOAD_PATH}#${token}`
}

function browserStorage(): TokenStorage | null {
	try {
		return typeof window === 'undefined' ? null : window.sessionStorage
	} catch {
		return null
	}
}

export function readPhoneToken(
	hash: string = typeof window === 'undefined' ? '' : window.location.hash,
	storage: TokenStorage | null = browserStorage()
): string | null {
	const fromHash = hash.startsWith('#') ? hash.slice(1) : hash
	if (fromHash !== '') {
		if (!TOKEN_PATTERN.test(fromHash)) return null
		try {
			storage?.setItem(TOKEN_STORAGE_KEY, fromHash)
		} catch {
			return fromHash
		}
		return fromHash
	}
	try {
		const stored = storage?.getItem(TOKEN_STORAGE_KEY) ?? null
		return stored !== null && TOKEN_PATTERN.test(stored) ? stored : null
	} catch {
		return null
	}
}

export type PhoneRefusal =
	| { kind: 'invalid' }
	| { kind: 'closed'; uploadClosesAt: string | null }
	| { kind: 'none' }
	| { kind: 'forbidden' }

export function phoneRefusalOf(failure: RequestFailure): PhoneRefusal | null {
	if (failure.kind !== 'http') return null
	if (failure.status === 404) return { kind: 'invalid' }
	if (failure.status === 422) {
		const refusal = UploadWindowRefusalSchema.safeParse(failure.body)
		if (!refusal.success) return null
		if (refusal.data.error === UPLOAD_WINDOW_ERROR_CODES.closed) {
			return { kind: 'closed', uploadClosesAt: refusal.data.uploadClosesAt }
		}
		return { kind: 'none' }
	}
	if (failure.status === 409 && readApiError(failure.body) === ANSWER_PHOTO_FORBIDDEN_MESSAGE) {
		return { kind: 'forbidden' }
	}
	return null
}

const IN_APP_BROWSERS: readonly RegExp[] = [
	/Telegram/i,
	/VKAndroidApp|VKClient|com\.vkontakte/i,
	/Instagram/i,
	/FBAN|FBAV|FB_IAB|FBIOS/,
	/YaApp_|YaSearchBrowser|YandexSearch/,
]

export function isInAppBrowser(userAgent: string): boolean {
	return IN_APP_BROWSERS.some((pattern) => pattern.test(userAgent))
}
