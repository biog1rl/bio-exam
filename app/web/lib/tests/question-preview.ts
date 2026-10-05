export const QUESTION_PREVIEW_LENGTH = 120

export type QuestionPreview = {
	text: string
	truncated: boolean
	hasImage: boolean
}

const MARKDOWN_IMAGE = /!\[[^\]]*\]\([^)]*\)/
const HTML_IMAGE = /<img\b[^>]*>/i

export function questionPreview(promptText: string, maxLength = QUESTION_PREVIEW_LENGTH): QuestionPreview {
	const hasImage = MARKDOWN_IMAGE.test(promptText) || HTML_IMAGE.test(promptText)
	const plain = promptText
		.replace(new RegExp(MARKDOWN_IMAGE.source, 'g'), ' ')
		.replace(new RegExp(HTML_IMAGE.source, 'gi'), ' ')
		.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
		.replace(/<\/?[a-z][^>]*>/gi, ' ')
		.replace(/[#*_`~[\]]/g, '')
		.replace(/\s+/g, ' ')
		.trim()
	const truncated = plain.length > maxLength
	return { text: truncated ? plain.slice(0, maxLength).trimEnd() : plain, truncated, hasImage }
}
