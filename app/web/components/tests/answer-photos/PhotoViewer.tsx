'use client'

import {
	useEffect,
	useRef,
	useState,
	type KeyboardEvent,
	type PointerEvent,
	type ReactNode,
	type RefObject,
} from 'react'
import { TransformComponent, TransformWrapper, type ReactZoomPanPinchContentRef } from 'react-zoom-pan-pinch'

import { ChevronLeft, ChevronRight, ImageOff, Loader2, RotateCw, X, ZoomIn, ZoomOut } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Separator } from '@/components/ui/separator'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { answerPhotoUrl } from '@/lib/tests/answer-photos-api'
import { cn } from '@/lib/utils/cn'
import { formatShortDateTime } from '@/lib/utils/dates'

import { stepIndex, swipeDelta } from './photo-viewer-nav'

export type ViewerPhoto = { id: string; uploadedAt: string }

type Props = {
	photos: ReadonlyArray<ViewerPhoto>
	openIndex: number | null
	onClose: () => void
}

type ZoomRef = RefObject<ReactZoomPanPinchContentRef | null>

const ANIMATION_MS = 200

function animationTime(): number {
	return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : ANIMATION_MS
}

const HINT = 'Колесо — масштаб, перетаскивание — сдвиг увеличенного фото, ← → — другое фото, Esc — закрыть'

function ToolButton({
	label,
	onClick,
	disabled,
	className,
	children,
}: {
	label: string
	onClick: () => void
	disabled?: boolean
	className?: string
	children: ReactNode
}) {
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<Button
					type="button"
					variant="ghost"
					aria-label={label}
					disabled={disabled}
					onClick={onClick}
					className={cn('rounded-full', className)}
				>
					{children}
				</Button>
			</TooltipTrigger>
			<TooltipContent>{label}</TooltipContent>
		</Tooltip>
	)
}

function PhotoStage({
	photo,
	number,
	rotation,
	scale,
	zoomRef,
	onScale,
}: {
	photo: ViewerPhoto
	number: number
	rotation: number
	scale: number
	zoomRef: ZoomRef
	onScale: (scale: number) => void
}) {
	const [status, setStatus] = useState<'loading' | 'loaded' | 'error'>('loading')
	const [attempt, setAttempt] = useState(0)
	const fullSrc = answerPhotoUrl(photo.id, 'full') + (attempt > 0 ? `?r=${attempt}` : '')

	return (
		<>
			{status === 'loading' ? (
				<>
					{/* eslint-disable-next-line @next/next/no-img-element */}
					<img
						src={answerPhotoUrl(photo.id, 'thumb')}
						alt=""
						className="pointer-events-none absolute inset-0 size-full object-contain opacity-50"
					/>
					<div
						role="status"
						className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 text-sm text-foreground"
					>
						<Loader2 className="size-5 animate-spin" aria-hidden="true" />
						Загрузка фото…
					</div>
				</>
			) : null}
			{status === 'error' ? (
				<div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 text-sm text-foreground">
					<span className="flex size-12 items-center justify-center rounded-full bg-card">
						<ImageOff className="size-5 text-muted-foreground" aria-hidden="true" />
					</span>
					Не удалось загрузить фото
					<Button
						type="button"
						variant="outline"
						className="h-11 rounded-full tab-sm:h-9"
						onClick={() => {
							setStatus('loading')
							setAttempt((value) => value + 1)
						}}
					>
						Повторить
					</Button>
				</div>
			) : null}
			<TransformWrapper
				ref={zoomRef}
				minScale={1}
				maxScale={5}
				initialScale={1}
				centerOnInit
				centerZoomedOut
				limitToBounds
				wheel={{ step: 0.2 }}
				pinch={{ step: 5 }}
				doubleClick={{ mode: 'toggle', step: 1, animationTime: animationTime() }}
				panning={{ disabled: scale <= 1, velocityDisabled: true }}
				keyboard={{ disabled: true }}
				onTransform={(_, state) => onScale(state.scale)}
			>
				<TransformComponent wrapperClass="!size-full" contentClass="!size-full flex items-center justify-center">
					{/* eslint-disable-next-line @next/next/no-img-element */}
					<img
						src={fullSrc}
						alt={`Фото ${number}`}
						draggable={false}
						onLoad={() => setStatus('loaded')}
						onError={() => setStatus('error')}
						className={cn('max-h-full max-w-full object-contain shadow-md', status !== 'loaded' && 'invisible')}
						style={{ transform: `rotate(${rotation}deg)` }}
					/>
				</TransformComponent>
			</TransformWrapper>
		</>
	)
}

export function PhotoViewer({ photos, openIndex, onClose }: Props) {
	const [index, setIndex] = useState(openIndex ?? 0)
	const [shownFor, setShownFor] = useState(openIndex)
	const [rotation, setRotation] = useState(0)
	const [scale, setScale] = useState(1)
	const zoomRef: ZoomRef = useRef(null)
	const contentRef = useRef<HTMLDivElement>(null)
	const gesture = useRef<{ x: number; y: number; t: number } | null>(null)
	const pointers = useRef(new Set<number>())

	if (openIndex !== null && openIndex !== shownFor) {
		setShownFor(openIndex)
		setIndex(openIndex)
		setRotation(0)
		setScale(1)
	}

	const count = photos.length
	const current = Math.min(index, Math.max(count - 1, 0))
	const photo = photos[current]
	const percent = Math.round(scale * 100)

	useEffect(() => {
		const root = contentRef.current
		if (root && !root.contains(document.activeElement)) root.focus()
	}, [current])

	useEffect(() => {
		if (openIndex === null) return
		for (const neighbour of [photos[current - 1], photos[current + 1]]) {
			if (neighbour) new Image().src = answerPhotoUrl(neighbour.id, 'full')
		}
	}, [openIndex, photos, current])

	if (!photo) return null

	const go = (delta: number) => {
		const next = stepIndex(current, delta, count)
		if (next === current) return
		setIndex(next)
		setRotation(0)
		setScale(1)
	}
	const zoomIn = () => void zoomRef.current?.zoomIn(0.5, animationTime())
	const zoomOut = () => void zoomRef.current?.zoomOut(0.5, animationTime())
	const reset = () => void zoomRef.current?.resetTransform(animationTime())
	const rotate = () => setRotation((value) => (value + 90) % 360)

	const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
		const target = event.target as HTMLElement
		if (target.closest('input, textarea, select, [contenteditable="true"]')) return
		if (event.metaKey || event.ctrlKey || event.altKey) return
		switch (event.key) {
			case 'ArrowLeft':
				return go(-1)
			case 'ArrowRight':
				return go(1)
			case '+':
			case '=':
				return zoomIn()
			case '-':
				return zoomOut()
			case '0':
				return reset()
			case 'r':
			case 'R':
			case 'к':
			case 'К':
				return rotate()
		}
	}

	const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
		pointers.current.add(event.pointerId)
		gesture.current = pointers.current.size === 1 ? { x: event.clientX, y: event.clientY, t: event.timeStamp } : null
	}
	const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
		pointers.current.delete(event.pointerId)
		const start = gesture.current
		gesture.current = null
		if (!start || scale > 1) return
		const delta = swipeDelta({
			dx: event.clientX - start.x,
			dy: event.clientY - start.y,
			durationMs: event.timeStamp - start.t,
		})
		if (delta !== 0) go(delta)
	}
	const onPointerCancel = (event: PointerEvent<HTMLDivElement>) => {
		pointers.current.delete(event.pointerId)
		gesture.current = null
	}

	const number = current + 1
	const title = count > 1 ? `Фото ${number} из ${count}` : 'Фото 1'
	const resetLabel = `Сбросить масштаб, сейчас ${percent}%`

	const scaleButton = (className: string) => (
		<ToolButton label={resetLabel} onClick={reset} className={cn('tabular-nums', className)}>
			{percent}%
		</ToolButton>
	)

	return (
		<Dialog
			open={openIndex !== null}
			onOpenChange={(next) => {
				if (!next) onClose()
			}}
		>
			<DialogContent
				ref={contentRef}
				showClose={false}
				tabIndex={-1}
				onKeyDown={onKeyDown}
				onOpenAutoFocus={(event) => {
					event.preventDefault()
					contentRef.current?.focus()
				}}
				className="top-0 left-0 flex h-dvh max-h-none w-screen max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-none border-0 bg-popover p-0 outline-none tab-sm:top-1/2 tab-sm:left-1/2 tab-sm:h-[calc(100dvh-3rem)] tab-sm:w-[min(1120px,calc(100vw-3rem))] tab-sm:-translate-x-1/2 tab-sm:-translate-y-1/2 tab-sm:rounded-lg tab-sm:border tab-sm:p-0"
			>
				<header className="shrink-0 border-b pt-[env(safe-area-inset-top)] tab-sm:pt-0">
					<div className="flex h-14 items-center justify-between pr-2 pl-4 tab-sm:h-16 tab-sm:pr-3 tab-sm:pl-5">
						<div className="min-w-0">
							<DialogTitle className="text-base leading-tight">{title}</DialogTitle>
							<DialogDescription className="text-xs">
								Загружено {formatShortDateTime(photo.uploadedAt)}
							</DialogDescription>
						</div>
						<div className="hidden items-center gap-1 tab-sm:flex">
							<ToolButton label="Уменьшить" onClick={zoomOut} className="size-9">
								<ZoomOut aria-hidden="true" />
							</ToolButton>
							{scaleButton('h-9 min-w-16 px-3')}
							<ToolButton label="Увеличить" onClick={zoomIn} className="size-9">
								<ZoomIn aria-hidden="true" />
							</ToolButton>
							<ToolButton label="Повернуть на 90°" onClick={rotate} className="size-9">
								<RotateCw aria-hidden="true" />
							</ToolButton>
							<Separator orientation="vertical" className="mx-1 h-6" />
							<ToolButton label="Закрыть" onClick={onClose} className="size-9">
								<X aria-hidden="true" />
							</ToolButton>
						</div>
						<ToolButton label="Закрыть" onClick={onClose} className="size-11 tab-sm:hidden">
							<X aria-hidden="true" />
						</ToolButton>
					</div>
				</header>

				<span aria-live="polite" className="sr-only">
					{title}
				</span>

				<div
					className="relative min-h-0 flex-1 touch-none overflow-hidden bg-muted"
					onPointerDown={onPointerDown}
					onPointerUp={onPointerUp}
					onPointerCancel={onPointerCancel}
				>
					<PhotoStage
						key={photo.id}
						photo={photo}
						number={number}
						rotation={rotation}
						scale={scale}
						zoomRef={zoomRef}
						onScale={setScale}
					/>
					{count > 1 ? (
						<>
							<Button
								type="button"
								variant="outline"
								aria-label="Предыдущее фото"
								disabled={current === 0}
								onClick={() => go(-1)}
								className="absolute top-1/2 left-4 z-10 hidden size-10 -translate-y-1/2 rounded-full bg-card tab-sm:inline-flex"
							>
								<ChevronLeft aria-hidden="true" />
							</Button>
							<Button
								type="button"
								variant="outline"
								aria-label="Следующее фото"
								disabled={current === count - 1}
								onClick={() => go(1)}
								className="absolute top-1/2 right-4 z-10 hidden size-10 -translate-y-1/2 rounded-full bg-card tab-sm:inline-flex"
							>
								<ChevronRight aria-hidden="true" />
							</Button>
						</>
					) : null}
				</div>

				<footer className="shrink-0 border-t">
					<p className="hidden h-10 items-center px-5 text-xs text-muted-foreground tab-sm:flex">{HINT}</p>
					<div className="pb-[env(safe-area-inset-bottom)] tab-sm:hidden">
						<div className="flex h-16 items-center justify-between px-2">
							{count > 1 ? (
								<ToolButton label="Предыдущее фото" onClick={() => go(-1)} disabled={current === 0} className="size-11">
									<ChevronLeft aria-hidden="true" />
								</ToolButton>
							) : null}
							<ToolButton label="Уменьшить" onClick={zoomOut} className="size-11">
								<ZoomOut aria-hidden="true" />
							</ToolButton>
							{scaleButton('h-11 min-w-16 px-3')}
							<ToolButton label="Увеличить" onClick={zoomIn} className="size-11">
								<ZoomIn aria-hidden="true" />
							</ToolButton>
							<ToolButton label="Повернуть на 90°" onClick={rotate} className="size-11">
								<RotateCw aria-hidden="true" />
							</ToolButton>
							{count > 1 ? (
								<ToolButton
									label="Следующее фото"
									onClick={() => go(1)}
									disabled={current === count - 1}
									className="size-11"
								>
									<ChevronRight aria-hidden="true" />
								</ToolButton>
							) : null}
						</div>
					</div>
				</footer>
			</DialogContent>
		</Dialog>
	)
}
