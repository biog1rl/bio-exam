'use client'

import { ANSWER_PHOTO_FORBIDDEN_MESSAGE, type UploadLinkContext } from '@bio-exam/exam-core'

import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type MouseEvent, type ReactNode } from 'react'

import { Check, Copy, ImageOff, Link2Off, TimerOff, WifiOff, type LucideIcon } from 'lucide-react'

import { LoadErrorAlert } from '@/components/feedback/LoadErrorAlert'
import { PhotoBlock } from '@/components/tests/answer-photos/PhotoBlock'
import { linkPhotoTransport, type PhotoTransport } from '@/components/tests/answer-photos/transport'
import {
	createPhotoHandle,
	usePhotoListSync,
	type AnswerPhotoQueueHandle,
} from '@/components/tests/answer-photos/use-answer-photos'
import { useUploadWindowView } from '@/components/tests/attempt-result/UploadWindowLine'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { RequestError, type RequestFailure, type RequestOutcome } from '@/lib/http/request'
import { mdxFallbackText } from '@/lib/mdx/fallback-text'
import { closedMoment } from '@/lib/tests/upload-window'
import { readUploadContext } from '@/lib/upload-link/api'
import { isInAppBrowser, phoneRefusalOf, readPhoneToken, type PhoneRefusal } from '@/lib/upload-link/phone-link'
import { cn } from '@/lib/utils/cn'

const POLL_INTERVAL_MS = 2500
const STALLED_PICK_MS = 30_000
const COPIED_MS = 3000
const PICK_LABELS: ReadonlySet<string> = new Set(['Сделать фото', 'Выбрать из галереи'])
const PHONE_SOURCES = ['camera', 'gallery'] as const

type Ready = { kind: 'ready'; token: string; context: UploadLinkContext; serverOffsetMs: number }

type Refused = { kind: 'refused'; refusal: PhoneRefusal; seenAtMs: number }

type Screen = { kind: 'loading' } | { kind: 'failed'; failure: RequestFailure } | Ready | Refused

function refused(refusal: PhoneRefusal): Refused {
	return { kind: 'refused', refusal, seenAtMs: Date.now() }
}

const COLUMN =
	'mx-auto flex w-full max-w-xl flex-col gap-4 pt-[max(1rem,env(safe-area-inset-top))] pr-[max(1rem,env(safe-area-inset-right))] pb-[max(1.5rem,env(safe-area-inset-bottom))] pl-[max(1rem,env(safe-area-inset-left))]'

function PhoneMain({ children }: { children: ReactNode }) {
	return <main className="h-dvh overflow-y-auto overscroll-contain bg-background">{children}</main>
}

function FocusHeading({ className, children }: { className: string; children: ReactNode }) {
	const ref = useRef<HTMLHeadingElement>(null)
	useEffect(() => {
		ref.current?.focus()
	}, [])
	return (
		<h1 ref={ref} tabIndex={-1} className={cn('font-serif text-2xl leading-tight outline-none', className)}>
			{children}
		</h1>
	)
}

function StateScreen({ Icon, title, text, note }: { Icon: LucideIcon; title: string; text: string; note: string }) {
	return (
		<PhoneMain>
			<div className="mx-auto flex min-h-dvh max-w-sm flex-col items-center justify-center gap-4 p-4 text-center">
				<div className="flex size-12 items-center justify-center rounded-full bg-muted">
					<Icon aria-hidden="true" className="size-6 text-muted-foreground" />
				</div>
				<FocusHeading className="text-foreground">{title}</FocusHeading>
				<p className="text-sm text-foreground">{text}</p>
				<p className="text-sm text-muted-foreground">{note}</p>
			</div>
		</PhoneMain>
	)
}

function RefusalScreen({ refusal, seenAtMs }: { refusal: PhoneRefusal; seenAtMs: number }) {
	if (refusal.kind === 'invalid') {
		return (
			<StateScreen
				Icon={Link2Off}
				title="Ссылка недействительна"
				text="Эта ссылка больше не работает или скопирована не полностью."
				note="Отсканируйте QR-код на экране компьютера ещё раз. Если QR-кода на экране нет, продолжите на компьютере."
			/>
		)
	}
	if (refusal.kind === 'closed') {
		const closesMs = refusal.uploadClosesAt === null ? Number.NaN : Date.parse(refusal.uploadClosesAt)
		const moment = Number.isNaN(closesMs) ? '' : ` ${closedMoment(new Date(closesMs), seenAtMs)}`
		return (
			<StateScreen
				Icon={TimerOff}
				title="Время для фото закончилось"
				text={`Окно для добавления фото закрылось${moment}. Фото, которые вы уже загрузили, остались в вашем ответе. Фото, которое не успело загрузиться, не сохранено.`}
				note="Эту страницу можно закрыть. Если нужно добавить фото, сообщите учителю."
			/>
		)
	}
	if (refusal.kind === 'none') {
		return (
			<StateScreen
				Icon={ImageOff}
				title="Фото к этому тесту больше не принимаются"
				text="Тест уже сдан, а времени на добавление фото после сдачи для него не предусмотрено. Фото, которые вы загрузили до сдачи, остались в вашем ответе."
				note="Эту страницу можно закрыть. Если вы не успели добавить фото, сообщите учителю."
			/>
		)
	}
	return (
		<StateScreen
			Icon={ImageOff}
			title="Фото к этому вопросу не принимаются"
			text={`${ANSWER_PHOTO_FORBIDDEN_MESSAGE}.`}
			note="Эту страницу можно закрыть и продолжить тест на компьютере."
		/>
	)
}

function LoadingScreen() {
	return (
		<PhoneMain>
			<div className={COLUMN}>
				<Skeleton aria-hidden="true" className="h-8 w-32" />
				<Skeleton aria-hidden="true" className="h-4 w-48" />
				<Skeleton aria-hidden="true" className="h-24 rounded-lg" />
				<Skeleton aria-hidden="true" className="h-48 rounded-lg" />
				<p role="status" className="sr-only">
					Загрузка…
				</p>
			</div>
		</PhoneMain>
	)
}

function subscribeOnline(listener: () => void): () => void {
	window.addEventListener('online', listener)
	window.addEventListener('offline', listener)
	return () => {
		window.removeEventListener('online', listener)
		window.removeEventListener('offline', listener)
	}
}

function subscribeNothing(): () => void {
	return () => {}
}

function useOnline(): boolean {
	return useSyncExternalStore(
		subscribeOnline,
		() => navigator.onLine,
		() => true
	)
}

function useInAppBrowser(): boolean {
	return useSyncExternalStore(
		subscribeNothing,
		() => isInAppBrowser(navigator.userAgent),
		() => false
	)
}

function copyWithSelection(text: string): boolean {
	const area = document.createElement('textarea')
	area.value = text
	area.setAttribute('readonly', '')
	area.style.position = 'fixed'
	area.style.top = '0'
	area.style.opacity = '0'
	document.body.append(area)
	area.select()
	area.setSelectionRange(0, text.length)
	let copied = false
	try {
		copied = document.execCommand('copy')
	} catch {
		copied = false
	}
	area.remove()
	return copied
}

async function copyText(text: string): Promise<boolean> {
	try {
		if (navigator.clipboard?.writeText) {
			await navigator.clipboard.writeText(text)
			return true
		}
	} catch {
		return copyWithSelection(text)
	}
	return copyWithSelection(text)
}

function InAppHint() {
	const [copy, setCopy] = useState<'idle' | 'copied' | 'failed'>('idle')
	const resetRef = useRef<ReturnType<typeof setTimeout> | null>(null)

	useEffect(
		() => () => {
			if (resetRef.current !== null) clearTimeout(resetRef.current)
		},
		[]
	)

	const onCopy = async () => {
		const copied = await copyText(window.location.href)
		if (resetRef.current !== null) clearTimeout(resetRef.current)
		setCopy(copied ? 'copied' : 'failed')
		if (copied) resetRef.current = setTimeout(() => setCopy('idle'), COPIED_MS)
	}

	return (
		<Alert role="status">
			<AlertTitle>Откройте страницу в браузере</AlertTitle>
			<AlertDescription>
				<p>
					Во встроенном браузере Telegram, VK и других приложений камера и галерея могут не работать. Откройте меню «⋯»
					и выберите «Открыть в браузере» или скопируйте ссылку.
				</p>
				<Button type="button" variant="outline" className="mt-2 h-11 w-full mob:w-auto" onClick={onCopy}>
					{copy === 'copied' ? (
						<Check aria-hidden="true" className="size-4" />
					) : (
						<Copy aria-hidden="true" className="size-4" />
					)}
					{copy === 'copied' ? 'Ссылка скопирована' : 'Скопировать ссылку'}
				</Button>
				{copy === 'failed' ? (
					<p role="status" className="mt-2 text-sm text-destructive">
						Не удалось скопировать. Откройте меню браузера и выберите «Открыть в браузере».
					</p>
				) : null}
			</AlertDescription>
		</Alert>
	)
}

function WindowLine({ uploadClosesAt, serverOffsetMs }: { uploadClosesAt: string | null; serverOffsetMs: number }) {
	const view = useUploadWindowView(uploadClosesAt, serverOffsetMs)
	if (view.state === 'none' || view.state === 'closed') return null
	const soon = view.state === 'closing' || view.state === 'last-minute'
	return (
		<>
			<p
				aria-hidden="true"
				className={cn('text-sm tabular-nums', soon ? 'font-medium text-foreground' : 'text-muted-foreground')}
			>
				{view.until} · {view.countdown}
			</p>
			<p role="status" className="sr-only">
				{view.liveText ?? view.srText}
			</p>
		</>
	)
}

function observedTransport(transport: PhotoTransport, report: (failure: RequestFailure) => void): PhotoTransport {
	async function watch<T>(pending: Promise<RequestOutcome<T>>): Promise<RequestOutcome<T>> {
		const outcome = await pending
		if (!outcome.ok) report(outcome)
		return outcome
	}
	return {
		...transport,
		list: () => watch(transport.list()),
		upload: (photoId, blob, fileName) => watch(transport.upload(photoId, blob, fileName)),
		remove: (photoId) => watch(transport.remove(photoId)),
	}
}

function Workspace({ ready, onRefusal }: { ready: Ready; onRefusal: (refusal: PhoneRefusal) => void }) {
	const { token, context, serverOffsetMs } = ready
	const [handle] = useState<AnswerPhotoQueueHandle>(() =>
		createPhotoHandle(
			observedTransport(linkPhotoTransport(token), (failure) => {
				const refusal = phoneRefusalOf(failure)
				if (refusal) onRefusal(refusal)
			}),
			context.maxPhotos
		)
	)
	const { failures } = usePhotoListSync(handle, { intervalMs: POLL_INTERVAL_MS, enabled: true })
	const online = useOnline()
	const inAppBrowser = useInAppBrowser()
	const [stalled, setStalled] = useState(false)
	const stallTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

	const clearStall = () => {
		if (stallTimer.current !== null) clearTimeout(stallTimer.current)
		stallTimer.current = null
	}

	useEffect(
		() => () => {
			if (stallTimer.current !== null) clearTimeout(stallTimer.current)
		},
		[]
	)

	const onPickClick = (event: MouseEvent<HTMLDivElement>) => {
		const label = (event.target as HTMLElement).closest('button')?.textContent?.trim() ?? ''
		if (!PICK_LABELS.has(label)) return
		clearStall()
		stallTimer.current = setTimeout(() => setStalled(true), STALLED_PICK_MS)
	}

	const promptText = mdxFallbackText(context.promptText).trim()

	return (
		<PhoneMain>
			<div className={COLUMN}>
				<div>
					<FocusHeading className="text-foreground">Вопрос {context.questionNumber}</FocusHeading>
					<p className="text-sm break-words text-muted-foreground">{context.testTitle}</p>
				</div>
				<section aria-label="Текст вопроса" className="rounded-lg border border-border bg-card p-4">
					<p className="text-sm break-words whitespace-pre-line text-foreground">
						{promptText || 'В вопросе только рисунок. Откройте вопрос на компьютере.'}
					</p>
				</section>
				{context.uploadClosesAt !== null ? (
					<WindowLine uploadClosesAt={context.uploadClosesAt} serverOffsetMs={serverOffsetMs} />
				) : null}
				{!online || failures >= 2 ? (
					<Alert role="status">
						<WifiOff aria-hidden="true" className="size-4" />
						<AlertTitle>Нет связи с интернетом</AlertTitle>
						<AlertDescription>
							Уже загруженные фото сохранены. Когда связь вернётся, страница обновится сама. Фото, которое не
							загрузилось, повторите кнопкой «Повторить».
						</AlertDescription>
					</Alert>
				) : null}
				{inAppBrowser || stalled ? <InAppHint /> : null}
				<div onClickCapture={onPickClick} onChangeCapture={clearStall}>
					<PhotoBlock photos={handle} disabled={false} sources={PHONE_SOURCES} touch />
				</div>
			</div>
		</PhoneMain>
	)
}

async function openScreen(token: string | null): Promise<Screen> {
	if (token === null) return refused({ kind: 'invalid' })
	const outcome = await readUploadContext(token)
	if (!outcome.ok) {
		const refusal = phoneRefusalOf(outcome)
		return refusal ? refused(refusal) : { kind: 'failed', failure: outcome }
	}
	if (!outcome.data.allowPhotos) return refused({ kind: 'forbidden' })
	const serverMs = Date.parse(outcome.data.serverNow)
	return {
		kind: 'ready',
		token,
		context: outcome.data,
		serverOffsetMs: Number.isNaN(serverMs) ? 0 : serverMs - Date.now(),
	}
}

export default function PhotoUploadClient() {
	const [screen, setScreen] = useState<Screen>({ kind: 'loading' })

	useEffect(() => {
		let alive = true
		void openScreen(readPhoneToken()).then((next) => {
			if (alive) setScreen(next)
		})
		return () => {
			alive = false
		}
	}, [])

	const onRefusal = useCallback((refusal: PhoneRefusal) => setScreen(refused(refusal)), [])

	const retry = useCallback(async () => {
		setScreen({ kind: 'loading' })
		setScreen(await openScreen(readPhoneToken()))
	}, [])

	if (screen.kind === 'loading') return <LoadingScreen />
	if (screen.kind === 'failed') {
		return (
			<PhoneMain>
				<div className={COLUMN}>
					<LoadErrorAlert
						title="Не удалось открыть страницу"
						error={new RequestError(screen.failure)}
						onRetry={retry}
					/>
				</div>
			</PhoneMain>
		)
	}
	if (screen.kind === 'ready') return <Workspace ready={screen} onRefusal={onRefusal} />
	return <RefusalScreen refusal={screen.refusal} seenAtMs={screen.seenAtMs} />
}
