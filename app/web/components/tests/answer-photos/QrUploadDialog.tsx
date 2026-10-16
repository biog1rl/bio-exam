'use client'

import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'

import { Check, Clock3, Copy, ImageOff, Images, Loader2, Smartphone, TimerOff, type LucideIcon } from 'lucide-react'
import dynamic from 'next/dynamic'

import { LoadErrorAlert } from '@/components/feedback/LoadErrorAlert'
import { useUploadWindowView } from '@/components/tests/attempt-result/UploadWindowLine'
import { Button } from '@/components/ui/button'
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogTitle,
	DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { RequestError, type RequestFailure } from '@/lib/http/request'
import type { AnswerPhotoTarget } from '@/lib/tests/answer-photos-api'
import { closedMoment } from '@/lib/tests/upload-window'
import { issueUploadLink, readUploadContext } from '@/lib/upload-link/api'
import { dropCachedLink, readCachedLink, storeCachedLink } from '@/lib/upload-link/link-cache'
import { phoneRefusalOf, phoneUploadUrl, type PhoneRefusal } from '@/lib/upload-link/phone-link'
import { cn } from '@/lib/utils/cn'

import { usePhotoListSync, type SessionPhotoHandle } from './use-answer-photos'

const POLL_INTERVAL_MS = 2500
const COPIED_MS = 3000
const FORBIDDEN_TEXT = 'Недостаточно прав для этого действия. Обратитесь к администратору.'
const QR_BOX = 'size-56 rounded-md mob:size-60'

function QrSkeleton() {
	return <Skeleton aria-hidden="true" className={QR_BOX} />
}

const QrCode = dynamic(() => import('./QrCode'), { ssr: false, loading: QrSkeleton })

type WindowRefusal = Exclude<PhoneRefusal, { kind: 'invalid' }>

type LinkState =
	| { kind: 'preparing' }
	| { kind: 'ready'; url: string; uploadClosesAt: string | null; serverOffsetMs: number }
	| { kind: 'failed'; failure: RequestFailure }
	| { kind: 'refused'; refusal: WindowRefusal; seenAtMs: number }

function offsetOf(serverNow: string): number {
	const serverMs = Date.parse(serverNow)
	return Number.isNaN(serverMs) ? 0 : serverMs - Date.now()
}

function windowRefusal(failure: RequestFailure): LinkState | null {
	const refusal = phoneRefusalOf(failure)
	if (!refusal || refusal.kind === 'invalid') return null
	return { kind: 'refused', refusal, seenAtMs: Date.now() }
}

async function prepareLink(target: AnswerPhotoTarget): Promise<LinkState> {
	const cached = readCachedLink(target.sessionId, target.questionId)
	if (cached) {
		const context = await readUploadContext(cached.token)
		if (context.ok) {
			if (!context.data.allowPhotos) return { kind: 'refused', refusal: { kind: 'forbidden' }, seenAtMs: Date.now() }
			return {
				kind: 'ready',
				url: cached.url,
				uploadClosesAt: context.data.uploadClosesAt,
				serverOffsetMs: offsetOf(context.data.serverNow),
			}
		}
		const refused = windowRefusal(context)
		if (refused) return refused
		if (!(context.kind === 'http' && context.status === 404)) return { kind: 'failed', failure: context }
		dropCachedLink(target.sessionId, target.questionId)
	}
	const issued = await issueUploadLink(target)
	if (issued.ok) {
		const url = phoneUploadUrl(window.location.origin, issued.data.token)
		storeCachedLink(target.sessionId, target.questionId, url)
		return {
			kind: 'ready',
			url,
			uploadClosesAt: issued.data.uploadClosesAt,
			serverOffsetMs: offsetOf(issued.data.serverNow),
		}
	}
	const refused = windowRefusal(issued)
	if (refused) return refused
	if (issued.kind === 'http' && issued.status === 403) {
		return { kind: 'failed', failure: { ...issued, message: FORBIDDEN_TEXT } }
	}
	return { kind: 'failed', failure: issued }
}

function copyWithSelection(input: HTMLInputElement | null): boolean {
	if (!input) return false
	input.focus()
	input.select()
	try {
		return document.execCommand('copy')
	} catch {
		return false
	}
}

async function copyLink(url: string, input: HTMLInputElement | null): Promise<boolean> {
	try {
		if (navigator.clipboard?.writeText) {
			await navigator.clipboard.writeText(url)
			return true
		}
	} catch {
		return copyWithSelection(input)
	}
	return copyWithSelection(input)
}

function Counter({ count, max }: { count: number; max: number }) {
	return (
		<p
			aria-live="polite"
			aria-atomic="true"
			className="flex items-center justify-center gap-1.5 text-sm font-medium tabular-nums"
		>
			<Images aria-hidden="true" className="size-4" />
			{count} из {max} фото
		</p>
	)
}

function StateMark({ Icon, text }: { Icon: LucideIcon; text: string }) {
	return (
		<div className="flex flex-col items-center gap-3 text-center">
			<div className="flex size-12 items-center justify-center rounded-full bg-muted">
				<Icon aria-hidden="true" className="size-5 text-muted-foreground" />
			</div>
			<p className="text-sm text-foreground">{text}</p>
		</div>
	)
}

function closedText(link: LinkState, viewClosedText: string | null, uploadClosesAt: string | null): string {
	if (link.kind !== 'refused' && viewClosedText) return `${viewClosedText}. QR-код больше не работает.`
	const closesMs = uploadClosesAt === null ? Number.NaN : Date.parse(uploadClosesAt)
	const seenAtMs = link.kind === 'refused' ? link.seenAtMs : closesMs
	const moment = Number.isNaN(closesMs) ? '' : ` ${closedMoment(new Date(closesMs), seenAtMs)}`
	return `Время для добавления фото закончилось${moment}. QR-код больше не работает.`
}

type Props = { photos: SessionPhotoHandle; questionNumber: number }

export function QrUploadDialog({ photos, questionNumber }: Props) {
	const { queue, target } = photos
	const state = useSyncExternalStore(queue.subscribe, queue.snapshot, queue.snapshot)
	const [open, setOpen] = useState(false)
	const [link, setLink] = useState<LinkState>({ kind: 'preparing' })
	const [copy, setCopy] = useState<'idle' | 'copied' | 'failed'>('idle')
	const runRef = useRef(0)
	const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
	const closeRef = useRef<HTMLButtonElement>(null)
	const copyRef = useRef<HTMLButtonElement>(null)
	const inputRef = useRef<HTMLInputElement>(null)

	const ready = link.kind === 'ready' ? link : null
	const view = useUploadWindowView(ready?.uploadClosesAt ?? null, ready?.serverOffsetMs ?? 0)
	const windowOpen = ready !== null && view.state !== 'closed'
	const { failures } = usePhotoListSync(photos, { intervalMs: POLL_INTERVAL_MS, enabled: open && windowOpen })

	const start = useCallback(() => {
		runRef.current += 1
		const run = runRef.current
		setLink({ kind: 'preparing' })
		void prepareLink(target).then((next) => {
			if (runRef.current === run) setLink(next)
		})
	}, [target])

	const onOpenChange = (next: boolean) => {
		setOpen(next)
		setCopy('idle')
		if (next) start()
		else runRef.current += 1
	}

	useEffect(() => {
		if (link.kind === 'ready' && document.activeElement === closeRef.current) copyRef.current?.focus()
	}, [link.kind])

	useEffect(
		() => () => {
			if (copyTimer.current !== null) clearTimeout(copyTimer.current)
		},
		[]
	)

	const onCopy = async () => {
		if (!ready) return
		const copied = await copyLink(ready.url, inputRef.current)
		if (copyTimer.current !== null) clearTimeout(copyTimer.current)
		setCopy(copied ? 'copied' : 'failed')
		if (copied) copyTimer.current = setTimeout(() => setCopy('idle'), COPIED_MS)
	}

	const soon = view.state === 'closing' || view.state === 'last-minute'
	const atLimit = state.count >= state.max

	let body: ReactNode
	if (link.kind === 'failed') {
		body = <LoadErrorAlert title="Не удалось создать ссылку" error={new RequestError(link.failure)} onRetry={start} />
	} else if (link.kind === 'refused' || (ready && view.state === 'closed')) {
		const refusal: WindowRefusal =
			link.kind === 'refused' ? link.refusal : { kind: 'closed', uploadClosesAt: ready?.uploadClosesAt ?? null }
		let mark: ReactNode
		if (refusal.kind === 'forbidden') {
			mark = <StateMark Icon={ImageOff} text="К ответу на этот вопрос нельзя прикрепить фото. QR-код не нужен." />
		} else if (refusal.kind === 'none') {
			mark = <StateMark Icon={TimerOff} text="К этой попытке фото добавить нельзя. QR-код не нужен." />
		} else {
			mark = <StateMark Icon={TimerOff} text={closedText(link, view.closedText, refusal.uploadClosesAt)} />
		}
		body = (
			<div className="flex flex-col items-center gap-4">
				{mark}
				<div className="space-y-1 text-center">
					<Counter count={state.count} max={state.max} />
					{refusal.kind === 'closed' ? (
						<p className="text-sm text-muted-foreground">Загруженные фото остались в ответе.</p>
					) : null}
				</div>
			</div>
		)
	} else {
		body = (
			<div className="flex flex-col gap-4">
				<div className="flex justify-center">
					{ready ? (
						<QrCode value={ready.url} />
					) : (
						<div className="flex flex-col items-center gap-3">
							<QrSkeleton />
							<p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
								<Loader2 aria-hidden="true" className="size-4 animate-spin motion-reduce:animate-none" />
								Создаём ссылку…
							</p>
						</div>
					)}
				</div>
				<div className="space-y-1 text-center">
					<Counter count={state.count} max={state.max} />
					{atLimit ? (
						<p className="text-sm text-muted-foreground">Чтобы добавить другое фото, удалите одно из прикреплённых.</p>
					) : null}
					{ready && view.state !== 'none' ? (
						<p
							className={cn(
								'flex items-center justify-center gap-1 text-sm tabular-nums',
								soon ? 'font-medium text-foreground' : 'text-muted-foreground'
							)}
						>
							{soon ? <Clock3 aria-hidden="true" className="size-4" /> : null}
							{view.until} · {view.countdown}
						</p>
					) : null}
					{ready && failures >= 2 ? (
						<p role="status" className="text-xs text-muted-foreground">
							Нет связи с сервером. Фото с телефона появятся, когда связь вернётся.
						</p>
					) : null}
				</div>
				<div className="space-y-2">
					<label htmlFor={`upload-link-${target.questionId}`} className="text-xs text-muted-foreground">
						Ссылка для телефона
					</label>
					<div className="flex items-center gap-2">
						<Input
							ref={inputRef}
							id={`upload-link-${target.questionId}`}
							readOnly
							value={ready?.url ?? ''}
							data-testid="upload-link"
							className="truncate bg-card font-mono text-xs"
							onFocus={(event) => event.currentTarget.select()}
						/>
						<Button
							ref={copyRef}
							type="button"
							variant="outline"
							size="sm"
							className="shrink-0 rounded-full"
							aria-label="Скопировать ссылку"
							disabled={!ready}
							onClick={onCopy}
						>
							{copy === 'copied' ? (
								<Check aria-hidden="true" className="size-4" />
							) : (
								<Copy aria-hidden="true" className="size-4" />
							)}
							{copy === 'copied' ? 'Скопировано' : 'Скопировать'}
						</Button>
					</div>
					<span className="sr-only" aria-live="polite">
						{copy === 'copied' ? 'Скопировано' : ''}
					</span>
					{copy === 'failed' ? (
						<p role="status" className="text-xs text-destructive">
							Не удалось скопировать. Выделите ссылку и скопируйте её вручную.
						</p>
					) : null}
					<p className="text-xs text-muted-foreground">
						Ссылка работает только для этого вопроса, пока открыто время для фото. Не отправляйте её другим: по ней
						можно добавлять и удалять фото вашего ответа.
					</p>
				</div>
			</div>
		)
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogTrigger asChild>
				<Button
					type="button"
					variant="outline"
					size="sm"
					className="rounded-full"
					aria-label="Добавить фото с телефона"
				>
					<Smartphone aria-hidden="true" className="size-4" />С телефона
				</Button>
			</DialogTrigger>
			<DialogContent
				className="max-w-md bg-popover"
				onOpenAutoFocus={(event) => {
					event.preventDefault()
					closeRef.current?.focus()
				}}
			>
				<div className="space-y-1.5">
					<DialogTitle className="text-lg font-semibold">Добавить фото с телефона</DialogTitle>
					<DialogDescription className="text-sm text-muted-foreground">
						Наведите камеру телефона на QR-код и откройте ссылку. Фото сразу появятся в ответе к вопросу{' '}
						{questionNumber}.
					</DialogDescription>
				</div>
				{body}
				<DialogFooter>
					<DialogClose asChild>
						<Button ref={closeRef} type="button" variant="outline">
							Закрыть
						</Button>
					</DialogClose>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}
