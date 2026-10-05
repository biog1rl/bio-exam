export type SpeechRecognitionLike = {
	start(): void
	abort(): void
	addEventListener(type: string, fn: (event: unknown) => void): void
	removeEventListener(type: string, fn: (event: unknown) => void): void
}

export type SpeechSession = {
	start(): void
	dispose(): void
}

export type SpeechSessionOptions = {
	create: () => SpeechRecognitionLike
	onText: (text: string, isFinal: boolean) => void
	onStop: () => void
}

type ResultEventLike = {
	resultIndex: number
	results: { item(index: number): { isFinal: boolean; item(index: number): { transcript: string } } }
}

type RecognitionConstructor = new () => SpeechRecognitionLike & { continuous: boolean; interimResults: boolean }

function recognitionConstructor(): RecognitionConstructor | null {
	if (typeof window === 'undefined') return null
	const scope = window as unknown as {
		SpeechRecognition?: RecognitionConstructor
		webkitSpeechRecognition?: RecognitionConstructor
	}
	return scope.SpeechRecognition ?? scope.webkitSpeechRecognition ?? null
}

export function speechRecognitionSupported(): boolean {
	return recognitionConstructor() !== null
}

export function createBrowserSpeechRecognition(): SpeechRecognitionLike {
	const Recognition = recognitionConstructor()
	if (!Recognition) throw new Error('SpeechRecognition is not supported')
	const recognition = new Recognition()
	recognition.continuous = true
	recognition.interimResults = true
	return recognition
}

function readResult(event: unknown): { text: string; isFinal: boolean } | null {
	const { resultIndex, results } = event as ResultEventLike
	const result = results?.item(resultIndex)
	const alternative = result?.item(0)
	if (!result || !alternative) return null
	return { text: alternative.transcript, isFinal: result.isFinal }
}

export function createSpeechSession({ create, onText, onStop }: SpeechSessionOptions): SpeechSession {
	let recognition: SpeechRecognitionLike | null = null
	let disposed = false

	const onResult = (event: unknown) => {
		if (disposed || !recognition) return
		const result = readResult(event)
		if (result) onText(result.text, result.isFinal)
	}

	const onFinish = () => {
		if (disposed || !recognition) return
		detach()
		onStop()
	}

	function detach(): SpeechRecognitionLike | null {
		const current = recognition
		recognition = null
		if (!current) return null
		current.removeEventListener('result', onResult)
		current.removeEventListener('end', onFinish)
		current.removeEventListener('error', onFinish)
		return current
	}

	return {
		start() {
			if (disposed || recognition) return
			const created = create()
			created.addEventListener('result', onResult)
			created.addEventListener('end', onFinish)
			created.addEventListener('error', onFinish)
			recognition = created
			created.start()
		},
		dispose() {
			if (disposed) return
			disposed = true
			detach()?.abort()
		},
	}
}
