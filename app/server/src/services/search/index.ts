export { searchDatabase } from './database-search.js'
export type {
	SearchCategory,
	SearchResponse,
	SearchResultItem,
	SearchResultType,
	SearchScope,
} from './database-search.js'
export {
	buildQuestionSearchDocument,
	updateQuestionSearchDocumentLocation,
	upsertQuestionSearchDocument,
} from './question-documents.js'
