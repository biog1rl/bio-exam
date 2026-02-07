// =============================================================================
// Types for Test Management
// =============================================================================

export type QuestionType = 'radio' | 'checkbox' | 'matching'

export interface Option {
	id: string
	text: string
}

export interface MatchingPairs {
	left: Option[]
	right: Option[]
}

export interface Topic {
	id: string
	slug: string
	title: string
	description: string | null
	order: number
	isActive: boolean
	createdAt: string
	testsCount?: number
}

export interface Test {
	id: string
	topicId: string
	slug: string
	title: string
	description: string | null
	version: number
	isPublished: boolean
	showCorrectAnswer: boolean
	timeLimitMinutes: number | null
	passingScore: number | null
	order: number
	createdAt: string
	updatedAt: string
	topicSlug?: string
	topicTitle?: string
	questionsCount?: number
}

export interface Question {
	id?: string
	type: QuestionType
	order: number
	points: number
	options: Option[] | null
	matchingPairs: MatchingPairs | null
	promptText: string
	explanationText: string | null
	correct: string | string[] | Record<string, string>
}

export interface TestWithQuestions extends Test {
	questions: Question[]
}

// Form data types
export interface TopicFormData {
	slug: string
	title: string
	description: string
	order: number
	isActive: boolean
}

export interface TestFormData {
	topicId: string
	title: string
	slug: string
	description: string
	isPublished: boolean
	showCorrectAnswer: boolean
	timeLimitMinutes: number | null
	passingScore: number | null
	order: number
	questions: Question[]
}

// API response types
export interface TopicsResponse {
	topics: Topic[]
}

export interface TestsResponse {
	tests: Test[]
}

export interface TestDetailResponse {
	test: Test
	questions: Question[]
}

// Helper function to generate UUID
export function generateId(): string {
	return crypto.randomUUID()
}

// Default values
export function createDefaultQuestion(order: number): Question {
	return {
		type: 'radio',
		order,
		points: 1,
		options: [
			{ id: generateId(), text: '' },
			{ id: generateId(), text: '' },
		],
		matchingPairs: null,
		promptText: '',
		explanationText: null,
		correct: '',
	}
}

export function createDefaultMatchingPairs(): MatchingPairs {
	return {
		left: [
			{ id: generateId(), text: '' },
			{ id: generateId(), text: '' },
		],
		right: [
			{ id: generateId(), text: '' },
			{ id: generateId(), text: '' },
		],
	}
}
