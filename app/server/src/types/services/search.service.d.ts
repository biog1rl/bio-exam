/**
 * Shared search service types.
 *
 * DocRecord represents a markdown document prepared for indexing.
 * SearchHit describes the payload returned to the frontend.
 */
export type DocRecord = {
	/** POSIX relative id (without extension), unique across docs. */
	id: string
	/** POSIX relative path without extension. */
	rel: string
	/** Human readable title resolved from frontmatter/H1/slug. */
	title: string
	/** Markdown headings (#2+ levels) extracted for boosting. */
	headings: string[]
	/** Plain text body without markdown syntax. */
	text: string
	/** Lowercased ascii-folded text used for fallback matching. */
	textFold: string
	/** Public href generated from transliterated slug. */
	href: string
	/** Aggregate token bag used to prime MiniSearch. */
	tokens: string
	/** File name or parent folder (for index files). */
	name: string
	/** Lowercased ascii-folded version of name. */
	nameFold: string
	/** Transliteration of the name, lower-cased. */
	nameAlt: string
}

export type SearchHit = {
	id: string
	rel: string
	href: string
	title: string
	score: number
	/** HTML snippet highlighting the first textual match. */
	snippet: string
}

