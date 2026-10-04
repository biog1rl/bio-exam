'use client'

import { isAnswered } from '@bio-exam/exam-core'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { toast } from 'sonner'
import { useDebouncedCallback } from 'use-debounce'

import { useAuth } from '@/components/providers/AuthProvider'
import MdxRenderer from '@/components/tests/MdxRenderer'
import { QuestionInput } from '@/components/tests/QuestionInput'
import { QuestionAnswerReview } from '@/components/tests/attempt-review/QuestionAnswerReview'
import { runnerResultCard } from '@/components/tests/runner-result-card'
import { prefetchSignedUrls, resolvesViaApi } from '@/lib/image-signed-url-cache'
import { saveAnswer, saveSessionTelemetry, startTestSession, submitPublicTestAnswers } from '@/lib/tests/api'
import { formatPercent } from '@/lib/tests/format'
import type {
	AttemptQuestionView,
	AttemptView,
	PublicTestDetail,
	PublicTestQuestion,
	SessionInfo,
	TestAnswerValue,
	TestAttemptSummary,
} from '@/lib/tests/types'
import { cn } from '@/lib/utils'

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '../ui/accordion'
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from '../ui/alert-dialog'
import { Button } from '../ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../ui/dialog'
import {
	type AttemptBanner,
	type AttemptStorageEvent,
	bannerFor,
	blocksInteraction,
	classifyStartFailure,
	classifySubmitFailure,
	isClientExpired,
	storageKeysToClear,
	SUBMIT_FLOW_TEXT,
} from './attempt-submit-flow'
import { clientAttemptIdKey, forgetClientAttemptId, resolveClientAttemptId } from './client-attempt-id'
import {
	appendQuestionTime,
	incrementQuestionFocusLoss,
	incrementQuestionVisit,
	mergeTelemetryMaps,
	type TelemetryMap,
} from './telemetry'

type Props = {
	test: PublicTestDetail
	questions: PublicTestQuestion[]
	initialAttempts?: TestAttemptSummary[]
	attemptsLoading?: boolean
}

function resolveTemplate(question: PublicTestQuestion): NonNullable<PublicTestQuestion['questionUiTemplate']> | null {
	return question.questionUiTemplate
}

function formatDate(value: string): string {
	return new Date(value).toLocaleString('ru-RU', {
		day: '2-digit',
		month: '2-digit',
		year: 'numeric',
		hour: '2-digit',
		minute: '2-digit',
	})
}

/**
 * Рекурсивно извлекает все image src из Lexical JSON документа.
 * ImageNode хранит src как ключ хранилища или URL; URL для показа выдаёт API.
 */
function extractImagePaths(lexicalJson: unknown): string[] {
	const paths: string[] = []
	function walk(node: Record<string, unknown> | null | undefined) {
		if (!node) return
		if (node.type === 'image' && typeof node.src === 'string' && resolvesViaApi(node.src)) {
			paths.push(node.src)
		}
		if (Array.isArray(node.children)) {
			for (const child of node.children as unknown[]) walk(child as Record<string, unknown>)
		}
	}
	if (typeof lexicalJson === 'object' && lexicalJson !== null) {
		walk(lexicalJson as Record<string, unknown>)
		if ('root' in (lexicalJson as Record<string, unknown>)) {
			walk((lexicalJson as Record<string, unknown>).root as Record<string, unknown>)
		}
	}
	return paths
}

const RED_THRESHOLD_SECONDS_DEFAULT = 5 * 60 // 300 seconds = 5 minutes

function useCountdown(startedAt: string | null, limitMinutes: number | null): number | null {
	const [secondsLeft, setSecondsLeft] = useState<number | null>(null)

	useEffect(() => {
		if (!startedAt || !limitMinutes) return
		const endMs = new Date(startedAt).getTime() + limitMinutes * 60 * 1000

		const tick = () => {
			const remaining = Math.max(0, Math.floor((endMs - Date.now()) / 1000))
			setSecondsLeft(remaining)
		}
		tick()

		const id = setInterval(tick, 1000)
		return () => clearInterval(id)
	}, [startedAt, limitMinutes])

	return secondsLeft
}

function formatTime(seconds: number, showHours: boolean): string {
	const h = Math.floor(seconds / 3600)
	const m = Math.floor((seconds % 3600) / 60)
	const s = seconds % 60
	if (showHours) {
		return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
	}
	return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export default function TestRunner({ test, questions, initialAttempts = [], attemptsLoading = false }: Props) {
	const { me } = useAuth()
	const userId = me?.id ?? 'anonymous'
	const orderedQuestions = useMemo(() => [...questions].sort((a, b) => a.order - b.order), [questions])
	const [answers, setAnswers] = useState<Record<string, TestAnswerValue>>({})
	const [submitting, setSubmitting] = useState(false)
	const [submitResult, setSubmitResult] = useState<AttemptView | null>(null)
	const [banner, setBanner] = useState<AttemptBanner | null>(null)
	const [attempts, setAttempts] = useState<TestAttemptSummary[]>(initialAttempts)
	useEffect(() => {
		if (initialAttempts.length === 0) return
		setAttempts((prev) => {
			const knownIds = new Set(prev.map((attempt) => attempt.id))
			const added = initialAttempts.filter((attempt) => !knownIds.has(attempt.id))
			return added.length > 0 ? [...prev, ...added] : prev
		})
	}, [initialAttempts])
	const [currentQuestionId, setCurrentQuestionId] = useState<string | null>(() => orderedQuestions[0]?.id ?? null)
	const [showUnansweredDialog, setShowUnansweredDialog] = useState(false)
	const [session, setSession] = useState<SessionInfo | null>(null)
	const [frozen, setFrozen] = useState(false)
	const [showTimeUp, setShowTimeUp] = useState(false)
	const [alreadySubmitted, setAlreadySubmitted] = useState<{ open: boolean; attemptId: string | null }>({
		open: false,
		attemptId: null,
	})
	const [timeExpiredOpen, setTimeExpiredOpen] = useState(false)
	const [awaitingStart, setAwaitingStart] = useState(false)
	const [sessionStarting, setSessionStarting] = useState(false)
	const telemetryRef = useRef<TelemetryMap>({})
	const enterTimeRef = useRef<number | null>(null)
	const warningFiredRef = useRef(false)
	const sessionInitRef = useRef(false)
	const autoSubmitFiredRef = useRef(false)
	const frozenKey = `test-frozen-${test.id}-${userId}`
	const walKey = `test-answers-wal-${test.id}-${userId}`
	const sessionKey = `test-session-${test.id}-${userId}`
	const clientAttemptKey = clientAttemptIdKey(test.id, userId)

	const clearAttemptStorage = (event: AttemptStorageEvent) => {
		for (const key of storageKeysToClear(event)) {
			if (key === 'session') localStorage.removeItem(sessionKey)
			else if (key === 'wal') localStorage.removeItem(walKey)
			else if (key === 'frozen') localStorage.removeItem(frozenKey)
			else forgetClientAttemptId(localStorage, clientAttemptKey)
		}
	}

	const showStartNotAssigned = () => {
		clearAttemptStorage('start-not-assigned')
		setBanner('start-not-assigned')
	}

	const replaceTelemetry = useCallback(
		(next: TelemetryMap) => {
			telemetryRef.current = next

			try {
				const raw = localStorage.getItem(walKey)
				const parsed = raw ? (JSON.parse(raw) as Record<string, unknown>) : {}
				const hasWrappedAnswers = parsed.answers && typeof parsed.answers === 'object' && !Array.isArray(parsed.answers)
				const wal = hasWrappedAnswers
					? { ...parsed, telemetry: next }
					: {
							answers: parsed,
							lastQuestionId: null,
							telemetry: next,
						}
				localStorage.setItem(walKey, JSON.stringify(wal))
			} catch {
				/* localStorage is best-effort; the server draft remains the fallback */
			}
		},
		[walKey]
	)

	const hydrateFromServerSession = useCallback(
		(serverSession: SessionInfo) => {
			setSession(serverSession)
			localStorage.setItem(sessionKey, JSON.stringify(serverSession))
			replaceTelemetry(mergeTelemetryMaps(telemetryRef.current, serverSession.draftTelemetry))

			// Server draft has priority over stale WAL values.
			if (serverSession.draftAnswers && Object.keys(serverSession.draftAnswers).length > 0) {
				setAnswers((prev) => ({ ...prev, ...serverSession.draftAnswers }))
			}
			if (serverSession.draftLastQuestionId) {
				const idx = orderedQuestions.findIndex((q) => q.id === serverSession.draftLastQuestionId)
				if (idx !== -1) {
					setCurrentQuestionId(serverSession.draftLastQuestionId)
				}
			}
		},
		[orderedQuestions, replaceTelemetry, sessionKey]
	)

	const replaceWithNewSession = (serverSession: SessionInfo) => {
		clearAttemptStorage('session-replaced')
		setFrozen(false)
		telemetryRef.current = {}
		replaceTelemetry(serverSession.draftTelemetry ?? {})
		setSession(serverSession)
		localStorage.setItem(sessionKey, JSON.stringify(serverSession))
		setAnswers(serverSession.draftAnswers ?? {})
		const lastQuestionId = serverSession.draftLastQuestionId
		const hasLastQuestion = !!lastQuestionId && orderedQuestions.some((q) => q.id === lastQuestionId)
		setCurrentQuestionId(hasLastQuestion ? lastQuestionId : (orderedQuestions[0]?.id ?? null))
	}

	const secondsLeft = useCountdown(session?.startedAt ?? null, test.timeLimitMinutes ?? null)
	const redThresholdSeconds = RED_THRESHOLD_SECONDS_DEFAULT
	const showHours = (test.timeLimitMinutes ?? 0) > 60

	// Session start effect: restore frozen state and start/restore timer session
	useEffect(() => {
		// Restore frozen state from localStorage (user returned after auto-submit)
		if (localStorage.getItem(frozenKey)) {
			setFrozen(true)
		}

		// Guard against React StrictMode double-invoke
		if (sessionInitRef.current) return
		sessionInitRef.current = true

		const cached = localStorage.getItem(sessionKey)
		if (cached) {
			// Existing session — restore silently without confirmation
			async function restoreSession(raw: string) {
				let cachedSession: SessionInfo | null = null
				try {
					cachedSession = JSON.parse(raw) as SessionInfo
				} catch {
					localStorage.removeItem(sessionKey)
				}
				if (
					cachedSession &&
					isClientExpired({
						startedAt: cachedSession.startedAt,
						timeLimitMinutes: test.timeLimitMinutes ?? null,
						nowMs: Date.now(),
					})
				) {
					clearAttemptStorage('time-expired')
					setTimeExpiredOpen(true)
					return
				}
				if (cachedSession) setSession(cachedSession)
				try {
					setSessionStarting(true)
					const serverSession = await startTestSession(test.id)
					if (cachedSession && serverSession.sessionId !== cachedSession.sessionId) {
						replaceWithNewSession(serverSession)
						toast.info(SUBMIT_FLOW_TEXT.sessionReplaced)
					} else {
						hydrateFromServerSession(serverSession)
						if (cachedSession) {
							toast.info('Сессия восстановлена')
						}
					}
				} catch (error) {
					if (classifyStartFailure(error) === 'not-assigned') {
						setSession(null)
						showStartNotAssigned()
					}
				} finally {
					setSessionStarting(false)
				}
			}
			void restoreSession(cached)
		} else {
			if (test.timeLimitMinutes) {
				// Timed tests: explicit confirmation before timer starts.
				setAwaitingStart(true)
			} else {
				// Untimed tests: start session silently to persist draft progress in DB.
				async function startUntimedSession() {
					try {
						setSessionStarting(true)
						const serverSession = await startTestSession(test.id)
						hydrateFromServerSession(serverSession)
					} catch (error) {
						if (classifyStartFailure(error) === 'not-assigned') showStartNotAssigned()
					} finally {
						setSessionStarting(false)
					}
				}
				void startUntimedSession()
			}
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [])

	// WAL restore effect: restore answers and last position from localStorage on mount
	useEffect(() => {
		const raw = localStorage.getItem(walKey)
		if (raw) {
			try {
				// Support both old format (plain answers map) and new format ({answers, lastQuestionId, telemetry})
				const parsed = JSON.parse(raw) as Record<string, unknown>
				let restoredAnswers: Record<string, TestAnswerValue> = {}
				let lastQuestionId: string | null = null

				if (parsed.answers && typeof parsed.answers === 'object' && !Array.isArray(parsed.answers)) {
					// New format
					restoredAnswers = parsed.answers as Record<string, TestAnswerValue>
					lastQuestionId = typeof parsed.lastQuestionId === 'string' ? parsed.lastQuestionId : null
				} else {
					// Old format (plain answers map) — backward compat
					restoredAnswers = parsed as Record<string, TestAnswerValue>
				}

				if (Object.keys(restoredAnswers).length > 0) {
					setAnswers((prev) => ({ ...prev, ...restoredAnswers }))
				}
				// Restore position: navigate to last answered question
				if (lastQuestionId) {
					const idx = orderedQuestions.findIndex((q) => q.id === lastQuestionId)
					if (idx !== -1) {
						setCurrentQuestionId(lastQuestionId)
					}
				}
				if (parsed.telemetry && typeof parsed.telemetry === 'object') {
					replaceTelemetry(mergeTelemetryMaps(telemetryRef.current, parsed.telemetry as TelemetryMap))
				}
			} catch {
				/* ignore */
			}
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [replaceTelemetry])

	const resultByQuestion = useMemo<Record<string, AttemptQuestionView>>(() => {
		const map: Record<string, AttemptQuestionView> = {}
		for (const item of submitResult?.results ?? []) {
			map[item.questionId] = item
		}
		return map
	}, [submitResult])

	const answeredCount = useMemo(
		() =>
			orderedQuestions.filter((question) =>
				isAnswered({
					template: question.questionUiTemplate,
					answer: answers[question.id],
					content: { options: question.options, matchingPairs: question.matchingPairs },
				})
			).length,
		[answers, orderedQuestions]
	)

	const debouncedSaveAnswer = useDebouncedCallback(
		useCallback(
			async (questionId: string, value: TestAnswerValue) => {
				if (!session) return
				// Write to localStorage WAL before server send
				try {
					const existing = localStorage.getItem(walKey)
					let currentAnswers: Record<string, TestAnswerValue> = {}
					if (existing) {
						const parsed = JSON.parse(existing) as Record<string, unknown>
						if (parsed.answers && typeof parsed.answers === 'object' && !Array.isArray(parsed.answers)) {
							currentAnswers = parsed.answers as Record<string, TestAnswerValue>
						} else {
							currentAnswers = parsed as Record<string, TestAnswerValue>
						}
					}
					currentAnswers[questionId] = value
					const wal = {
						answers: currentAnswers,
						lastQuestionId: currentQuestionId,
						telemetry: telemetryRef.current,
					}
					localStorage.setItem(walKey, JSON.stringify(wal))
				} catch {
					/* ignore */
				}
				try {
					await saveAnswer(test.id, session.sessionId, questionId, value, telemetryRef.current)
				} catch {
					// localStorage already has value; silently ignore server errors
				}
			},
			[session, walKey, test.id, currentQuestionId]
		),
		600
	)

	const onSelectRadio = (questionId: string, optionId: string) => {
		setAnswers((prev) => ({ ...prev, [questionId]: optionId }))
		void debouncedSaveAnswer(questionId, optionId)
	}

	const onToggleCheckbox = (questionId: string, optionId: string) => {
		setAnswers((prev) => {
			const current = Array.isArray(prev[questionId]) ? [...(prev[questionId] as string[])] : []
			const next = current.includes(optionId) ? current.filter((id) => id !== optionId) : [...current, optionId]
			void debouncedSaveAnswer(questionId, next)
			return { ...prev, [questionId]: next }
		})
	}

	const onSelectMatching = (questionId: string, leftId: string, rightId: string) => {
		setAnswers((prev) => {
			const current =
				prev[questionId] && typeof prev[questionId] === 'object' && !Array.isArray(prev[questionId])
					? { ...(prev[questionId] as Record<string, string>) }
					: {}
			current[leftId] = rightId
			void debouncedSaveAnswer(questionId, current)
			return { ...prev, [questionId]: current }
		})
	}

	const onInputTextAnswer = (questionId: string, value: string) => {
		setAnswers((prev) => ({ ...prev, [questionId]: value }))
		void debouncedSaveAnswer(questionId, value)
	}

	const currentIndex = useMemo(
		() => orderedQuestions.findIndex((q) => q.id === currentQuestionId),
		[orderedQuestions, currentQuestionId]
	)

	const applyTelemetry = useCallback(
		(updater: (previous: TelemetryMap) => TelemetryMap) => {
			const next = updater(telemetryRef.current)
			replaceTelemetry(next)
			return next
		},
		[replaceTelemetry]
	)

	const flushQuestionTime = useCallback(
		(questionId: string | null) => {
			if (!questionId || enterTimeRef.current === null) return telemetryRef.current
			const elapsed = Date.now() - enterTimeRef.current
			const next = applyTelemetry((prev) => appendQuestionTime(prev, questionId, elapsed))
			enterTimeRef.current = null
			return next
		},
		[applyTelemetry]
	)

	const goToQuestion = useCallback(
		(index: number) => {
			const q = orderedQuestions[index]
			if (!q) return
			// Flush time spent on current question
			const nextTelemetry = flushQuestionTime(currentQuestionId)
			if (session) {
				void saveSessionTelemetry(test.id, session.sessionId, nextTelemetry)
			}
			setCurrentQuestionId(q.id)
		},
		[orderedQuestions, currentQuestionId, flushQuestionTime, session, test.id]
	)

	const goPrev = useCallback(() => goToQuestion(currentIndex - 1), [goToQuestion, currentIndex])
	const goNext = useCallback(() => goToQuestion(currentIndex + 1), [goToQuestion, currentIndex])

	const unfreezeAfterAutoSubmit = (isAutoSubmit: boolean) => {
		if (!isAutoSubmit) return
		setFrozen(false)
		localStorage.removeItem(frozenKey)
	}

	const doSubmit = async ({ isAutoSubmit = false }: { isAutoSubmit?: boolean } = {}) => {
		setSubmitting(true)
		setBanner(null)
		// Flush any pending question time before submitting
		const finalTelemetry = flushQuestionTime(currentQuestionId)
		try {
			let activeSession = session
			if (!activeSession) {
				try {
					activeSession = await startTestSession(test.id)
				} catch (error) {
					if (classifyStartFailure(error) === 'not-assigned') {
						showStartNotAssigned()
						unfreezeAfterAutoSubmit(isAutoSubmit)
						return
					}
					throw new Error('start failed', { cause: error })
				}
				setSession(activeSession)
				localStorage.setItem(sessionKey, JSON.stringify(activeSession))
			}
			const clientAttemptId = resolveClientAttemptId(localStorage, clientAttemptKey, activeSession.sessionId)
			const result = await submitPublicTestAnswers(test.id, {
				sessionId: activeSession.sessionId,
				clientAttemptId,
				answers,
				telemetry: finalTelemetry,
			})
			debouncedSaveAnswer.cancel()
			clearAttemptStorage('success')
			if (isAutoSubmit) {
				setShowTimeUp(true)
				// Brief delay to show "Время вышло" screen before transitioning to results
				await new Promise((resolve) => setTimeout(resolve, 1500))
				setShowTimeUp(false)
			}
			setSubmitResult(result)
			setAttempts((prev) => [
				{
					id: result.attemptId,
					earnedPoints: result.earnedPoints,
					totalPoints: result.totalPoints,
					scorePercentage: result.scorePercentage,
					passed: result.passed,
					submittedAt: result.submittedAt,
				},
				...prev,
			])
			// The completed session must never be reused by a retake.
			setSession(null)
		} catch (error) {
			const failure = classifySubmitFailure(error)
			if (failure.kind === 'already-submitted') {
				debouncedSaveAnswer.cancel()
				setSession(null)
				clearAttemptStorage('already-submitted')
				setAlreadySubmitted({ open: true, attemptId: failure.attemptId })
				return
			}
			if (failure.kind === 'time-expired') {
				debouncedSaveAnswer.cancel()
				setSession(null)
				clearAttemptStorage('time-expired')
				setTimeExpiredOpen(true)
				return
			}
			if (failure.kind === 'not-assigned') {
				clearAttemptStorage('submit-not-assigned')
				setBanner('submit-not-assigned')
			} else if (failure.kind === 'not-found') {
				clearAttemptStorage('not-found')
				setBanner('not-found')
			} else {
				console.error('Failed to submit test answers:', error)
				setBanner('retry')
			}
			// On auto-submit failure: unfreeze so user can retry manually
			unfreezeAfterAutoSubmit(isAutoSubmit)
		} finally {
			setSubmitting(false)
		}
	}

	// Auto-submit effect: fires 1-minute warning toast and auto-submits at zero
	useEffect(() => {
		if (secondsLeft === null) return

		// 1-minute warning toast
		const warningThresholdSeconds = 60
		if (secondsLeft === warningThresholdSeconds && !warningFiredRef.current) {
			warningFiredRef.current = true
			toast.warning('Осталась 1 минута — тест будет сдан автоматически', { duration: 8000 })
		}

		// Auto-submit at zero (fire once per component lifecycle — ref prevents loop on unfreeze)
		if (secondsLeft === 0 && !frozen && !submitResult && !autoSubmitFiredRef.current) {
			autoSubmitFiredRef.current = true
			setFrozen(true)
			localStorage.setItem(frozenKey, '1')
			void doSubmit({ isAutoSubmit: true })
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [secondsLeft, frozen, submitResult])

	// Telemetry: track tab visibility changes (pause/resume timer, count focus loss)
	useEffect(() => {
		const handler = () => {
			if (awaitingStart || sessionStarting) return
			if (document.hidden) {
				// Tab hidden: flush time + count focus loss
				let nextTelemetry = flushQuestionTime(currentQuestionId)
				if (currentQuestionId) {
					nextTelemetry = applyTelemetry((prev) => incrementQuestionFocusLoss(prev, currentQuestionId))
				}
				if (session) {
					void saveSessionTelemetry(test.id, session.sessionId, nextTelemetry)
				}
			} else {
				// Tab visible again: restart timer
				if (!submitResult && !frozen) {
					enterTimeRef.current = Date.now()
				}
			}
		}
		document.addEventListener('visibilitychange', handler)
		return () => document.removeEventListener('visibilitychange', handler)
	}, [
		applyTelemetry,
		awaitingStart,
		currentQuestionId,
		flushQuestionTime,
		frozen,
		session,
		sessionStarting,
		submitResult,
		test.id,
	])

	// Prefetch signed URLs for all images in all questions on mount
	useEffect(() => {
		const allPaths: string[] = []
		for (const question of orderedQuestions) {
			if (question.promptText) {
				try {
					const json: unknown =
						typeof question.promptText === 'string' ? JSON.parse(question.promptText) : question.promptText
					allPaths.push(...extractImagePaths(json))
				} catch {
					// Not JSON — skip
				}
			}
		}
		if (allPaths.length > 0) {
			prefetchSignedUrls(allPaths).catch(() => {})
		}
	}, [orderedQuestions])

	// Telemetry: track the active question, including positions restored from a draft.
	useEffect(() => {
		if (!currentQuestionId || submitResult || frozen || awaitingStart || sessionStarting || document.hidden) return
		enterTimeRef.current = Date.now()
		applyTelemetry((prev) => incrementQuestionVisit(prev, currentQuestionId))
		return () => {
			flushQuestionTime(currentQuestionId)
		}
	}, [applyTelemetry, awaitingStart, currentQuestionId, flushQuestionTime, frozen, sessionStarting, submitResult])

	const handleSubmit = () => {
		if (answeredCount < orderedQuestions.length) {
			setShowUnansweredDialog(true)
		} else {
			void doSubmit()
		}
	}

	const handleConfirmStart = async () => {
		setAwaitingStart(false)
		setSessionStarting(true)
		try {
			const serverSession = await startTestSession(test.id)
			hydrateFromServerSession(serverSession)
		} catch (error) {
			if (classifyStartFailure(error) === 'not-assigned') {
				showStartNotAssigned()
			} else {
				toast.error('Не удалось начать тест. Попробуйте ещё раз.')
				setAwaitingStart(true)
			}
		} finally {
			setSessionStarting(false)
		}
	}

	const handleRetake = () => {
		debouncedSaveAnswer.cancel()
		enterTimeRef.current = null
		telemetryRef.current = {}
		warningFiredRef.current = false
		autoSubmitFiredRef.current = false
		setSession(null)
		setSubmitResult(null)
		setAnswers({})
		setBanner(null)
		setFrozen(false)
		setShowTimeUp(false)
		setAlreadySubmitted({ open: false, attemptId: null })
		setTimeExpiredOpen(false)
		setCurrentQuestionId(orderedQuestions[0]?.id ?? null)
		localStorage.removeItem(frozenKey)
		localStorage.removeItem(walKey)
		localStorage.removeItem(sessionKey)
		forgetClientAttemptId(localStorage, clientAttemptKey)

		if (test.timeLimitMinutes) {
			setAwaitingStart(true)
			return
		}

		setSessionStarting(true)
		void startTestSession(test.id)
			.then(hydrateFromServerSession)
			.catch((error: unknown) => {
				if (classifyStartFailure(error) === 'not-assigned') {
					showStartNotAssigned()
					return
				}
				toast.error('Не удалось начать новую попытку. Попробуйте ещё раз.')
			})
			.finally(() => {
				setSessionStarting(false)
			})
	}

	const closeAlreadySubmitted = () => {
		setAlreadySubmitted((prev) => ({ ...prev, open: false }))
		setBanner('already-submitted')
	}

	const bannerView = banner ? bannerFor(banner) : null

	const interactionDisabled =
		frozen ||
		!!submitResult ||
		awaitingStart ||
		sessionStarting ||
		timeExpiredOpen ||
		alreadySubmitted.open ||
		(banner !== null && blocksInteraction(banner))

	return (
		<div className="flex min-w-0 flex-col gap-4 tab:flex-row">
			<div className="min-w-0 flex-1">
				<div className="space-y-2">
					<h1 className="text-2xl font-semibold">{test.title}</h1>
					{test.description ? <p className="whitespace-pre-wrap text-muted-foreground">{test.description}</p> : null}
					<div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
						<span>Тема: {test.topicTitle}</span>
						{test.timeLimitMinutes ? <span>Лимит: {test.timeLimitMinutes} мин</span> : null}
						{test.passingScore != null ? <span>Проходной балл: {formatPercent(test.passingScore)}</span> : null}
					</div>
				</div>

				{submitResult ? (
					<section className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
						<h2 className="mb-2 text-lg font-semibold">Результат</h2>
						<p>
							Баллы: {submitResult.earnedPoints} / {submitResult.totalPoints}
						</p>
						<p>Процент: {formatPercent(submitResult.scorePercentage)}</p>
						<p>{submitResult.passed ? 'Статус: пройден' : 'Статус: не пройден'}</p>
						<Button type="button" variant="outline" className="mt-3" onClick={handleRetake}>
							Пройти ещё раз
						</Button>
					</section>
				) : null}

				{bannerView ? (
					<section className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-rose-200 bg-rose-50 p-4">
						<span role="alert" className="text-sm">
							{bannerView.message}
						</span>
						{bannerView.action === 'retry' ? (
							<Button variant="outline" size="sm" onClick={() => void doSubmit()}>
								{SUBMIT_FLOW_TEXT.retryAction}
							</Button>
						) : bannerView.action === 'reload' ? (
							<Button variant="outline" size="sm" onClick={() => window.location.reload()}>
								{SUBMIT_FLOW_TEXT.reloadAction}
							</Button>
						) : null}
					</section>
				) : null}

				{showTimeUp ? (
					<section className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
						<div className="mx-4 rounded-lg bg-white p-6 text-center shadow-xl tab-sm:p-8">
							<p className="text-2xl font-semibold">Время вышло</p>
							<p className="mt-2 text-sm text-muted-foreground">Отправка ответов...</p>
						</div>
					</section>
				) : null}

				{(() => {
					const question = orderedQuestions[currentIndex]
					if (!question) return null
					const questionResult = resultByQuestion[question.id]
					const card = questionResult ? runnerResultCard(questionResult.status) : null
					const template = resolveTemplate(question)

					return (
						<section
							key={question.id}
							id={`question-${question.id}`}
							className="grid scroll-mt-24 gap-unit-mob tab:gap-unit"
						>
							<p className="text-lg font-medium">{currentIndex + 1}.</p>
							<div className="flex-1 space-y-4 rounded-lg border bg-secondary p-4">
								<div className="space-y-2">
									<MdxRenderer source={question.promptText} className="prose max-w-none text-sm select-none" />
								</div>

								{!questionResult ? (
									<QuestionInput
										question={question}
										answer={answers[question.id]}
										disabled={interactionDisabled}
										onSelectRadio={onSelectRadio}
										onToggleCheckbox={onToggleCheckbox}
										onInputTextAnswer={onInputTextAnswer}
										onSelectMatching={onSelectMatching}
									/>
								) : null}
								{template == null ? (
									<p className="text-sm text-amber-600">Тип этого вопроса не настроен. Обратитесь к администратору.</p>
								) : null}

								{questionResult && card ? (
									<div className={card.className}>
										<p>{card.label}</p>
										<p className="mt-0.5 text-xs text-muted-foreground">
											{questionResult.earnedPoints} / {questionResult.points} баллов
										</p>
										<QuestionAnswerReview
											question={question}
											studentAnswer={questionResult.userAnswer}
											view={questionResult}
										/>
										{questionResult.explanationText ? (
											<MdxRenderer
												source={questionResult.explanationText}
												className="prose mt-2 max-w-none text-sm whitespace-normal"
											/>
										) : null}
									</div>
								) : null}
							</div>

							{/* Navigation buttons */}
							<div className="mt-6 flex flex-wrap items-center justify-between gap-2">
								<Button variant="outline" onClick={goPrev} disabled={currentIndex <= 0 || interactionDisabled}>
									Назад
								</Button>
								{currentIndex < orderedQuestions.length - 1 ? (
									<Button variant="outline" onClick={goNext} disabled={interactionDisabled}>
										Далее
									</Button>
								) : (
									<Button onClick={handleSubmit} disabled={submitting || interactionDisabled}>
										{submitting ? 'Отправка...' : 'Завершить'}
									</Button>
								)}
							</div>
						</section>
					)
				})()}

				{attemptsLoading ? (
					<p role="status">Загрузка истории попыток...</p>
				) : attempts.length > 0 ? (
					<Accordion type="single" collapsible className="mt-8 max-w-lg rounded-lg bg-secondary px-4">
						<AccordionItem className="border-none" value="score">
							<AccordionTrigger className="cursor-pointer">Мои попытки</AccordionTrigger>
							<AccordionContent>
								<ul className="space-y-2 text-sm">
									{attempts.map((attempt) => (
										<li key={attempt.id} className="rounded border bg-muted/30 p-2">
											{formatDate(attempt.submittedAt)} / {attempt.earnedPoints}/{attempt.totalPoints} /{' '}
											{formatPercent(attempt.scorePercentage)} / {attempt.passed ? 'пройден' : 'не пройден'}
										</li>
									))}
								</ul>
							</AccordionContent>
						</AccordionItem>
					</Accordion>
				) : null}
			</div>

			{/* Панель навигации по вопросам и прогресс */}
			<section className="h-fit w-full shrink-0 space-y-4 rounded-lg border bg-white p-4 tab:sticky tab:top-4 tab:w-48">
				{secondsLeft !== null && !submitResult && (
					<div
						className={cn(
							'text-right font-mono text-sm font-medium',
							secondsLeft < redThresholdSeconds ? 'text-red-600' : 'text-muted-foreground'
						)}
					>
						{formatTime(secondsLeft, showHours)}
					</div>
				)}
				<div className="space-y-1.5">
					<p className="text-xs text-muted-foreground">
						Отвечено: {answeredCount} / {orderedQuestions.length}
					</p>
					<div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-200">
						<div
							className="h-full rounded-full bg-green-500 transition-all duration-300"
							style={{
								width: orderedQuestions.length > 0 ? `${(answeredCount / orderedQuestions.length) * 100}%` : '0%',
							}}
						/>
					</div>
				</div>

				<div className="grid grid-cols-5 gap-1">
					{orderedQuestions.map((question, index) => {
						const answered = isAnswered({
							template: question.questionUiTemplate,
							answer: answers[question.id],
							content: { options: question.options, matchingPairs: question.matchingPairs },
						})
						const isCurrent = question.id === currentQuestionId
						return (
							<button
								key={question.id}
								type="button"
								onClick={() => goToQuestion(index)}
								className={cn(
									'flex aspect-square items-center justify-center rounded text-xs font-medium transition-colors',
									answered
										? 'bg-green-500 text-white'
										: 'border border-gray-200 bg-white text-gray-700 hover:bg-gray-50',
									isCurrent && 'ring-2 ring-green-500 ring-offset-1'
								)}
							>
								{index + 1}
							</button>
						)
					})}
				</div>

				<Button type="button" onClick={handleSubmit} disabled={submitting || interactionDisabled} className="w-full">
					{submitting ? 'Отправка...' : 'Завершить'}
				</Button>
			</section>

			<AlertDialog open={awaitingStart}>
				<AlertDialogContent overlayClassName="bg-black/60 backdrop-blur-xl">
					<AlertDialogHeader>
						<AlertDialogTitle>Начать тест?</AlertDialogTitle>
						<AlertDialogDescription>
							После подтверждения запустится таймер на {test.timeLimitMinutes} мин. Таймер не останавливается при
							перезагрузке страницы.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel onClick={() => window.history.back()}>Назад</AlertDialogCancel>
						<AlertDialogAction onClick={() => void handleConfirmStart()}>Начать</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>

			<AlertDialog open={timeExpiredOpen}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle className="font-medium">{SUBMIT_FLOW_TEXT.timeExpiredTitle}</AlertDialogTitle>
						<AlertDialogDescription>{SUBMIT_FLOW_TEXT.timeExpiredDescription}</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogAction onClick={handleRetake}>{SUBMIT_FLOW_TEXT.timeExpiredAction}</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>

			<AlertDialog open={showUnansweredDialog} onOpenChange={setShowUnansweredDialog}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Есть неотвеченные вопросы</AlertDialogTitle>
						<AlertDialogDescription>
							{orderedQuestions.length - answeredCount} вопр.{' '}
							{orderedQuestions.length - answeredCount === 1 ? 'остался' : 'осталось'} без ответа. Всё равно завершить?
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Вернуться</AlertDialogCancel>
						<AlertDialogAction
							onClick={() => {
								setShowUnansweredDialog(false)
								void doSubmit()
							}}
						>
							Всё равно завершить
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>

			<Dialog
				open={alreadySubmitted.open}
				onOpenChange={(open) => {
					if (!open) closeAlreadySubmitted()
				}}
			>
				<DialogContent>
					<DialogHeader>
						<DialogTitle className="font-medium">{SUBMIT_FLOW_TEXT.alreadySubmittedTitle}</DialogTitle>
						<DialogDescription>{SUBMIT_FLOW_TEXT.alreadySubmittedDescription}</DialogDescription>
					</DialogHeader>
					<DialogFooter>
						{alreadySubmitted.attemptId ? (
							<Button onClick={() => window.location.reload()}>{SUBMIT_FLOW_TEXT.alreadySubmittedOpenResults}</Button>
						) : (
							<Button onClick={closeAlreadySubmitted}>{SUBMIT_FLOW_TEXT.alreadySubmittedClose}</Button>
						)}
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	)
}
