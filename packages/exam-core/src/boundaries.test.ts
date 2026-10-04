import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { test } from 'vitest'

const SRC_DIR = fileURLToPath(new URL('.', import.meta.url))
const FORBIDDEN = ['react', 'lexical', 'drizzle-orm', '@tiptap']

function listTsFiles(dir: string): string[] {
	const files: string[] = []
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const full = `${dir}${entry.name}`
		if (entry.isDirectory()) files.push(...listTsFiles(`${full}/`))
		else if (entry.name.endsWith('.ts')) files.push(full)
	}
	return files
}

function extractSpecifiers(source: string): string[] {
	const specifiers: string[] = []
	for (const match of source.matchAll(/\bfrom\s+['"]([^'"]+)['"]/g)) specifiers.push(match[1])
	for (const match of source.matchAll(/\bimport\(\s*['"]([^'"]+)['"]\s*\)/g)) specifiers.push(match[1])
	for (const match of source.matchAll(/^\s*import\s+['"]([^'"]+)['"]/gm)) specifiers.push(match[1])
	for (const match of source.matchAll(/\brequire\(\s*['"]([^'"]+)['"]\s*\)/g)) specifiers.push(match[1])
	return specifiers
}

function isAllowed(specifier: string, isTest: boolean): boolean {
	if (specifier === 'zod') return true
	if (specifier.startsWith('./') || specifier.startsWith('../')) return true
	if (isTest && (specifier === 'vitest' || specifier.startsWith('node:'))) return true
	return false
}

test('exam-core: единственная runtime-зависимость — zod', () => {
	const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
		dependencies?: Record<string, string>
	}
	assert.deepEqual(Object.keys(manifest.dependencies ?? {}), ['zod'])
})

test('exam-core: исходники импортируют только zod и относительные модули', () => {
	const violations: string[] = []
	for (const file of listTsFiles(SRC_DIR)) {
		const isTest = file.endsWith('.test.ts')
		for (const specifier of extractSpecifiers(readFileSync(file, 'utf8'))) {
			if (!isAllowed(specifier, isTest)) violations.push(`${file.slice(SRC_DIR.length)}: ${specifier}`)
		}
	}
	assert.deepEqual(violations, [])
})

test('exam-core: запрещённые библиотеки не импортируются', () => {
	const violations: string[] = []
	for (const file of listTsFiles(SRC_DIR)) {
		if (file.endsWith('boundaries.test.ts')) continue
		for (const specifier of extractSpecifiers(readFileSync(file, 'utf8'))) {
			if (FORBIDDEN.some((name) => specifier === name || specifier.startsWith(`${name}/`))) {
				violations.push(`${file.slice(SRC_DIR.length)}: ${specifier}`)
			}
		}
	}
	assert.deepEqual(violations, [])
})
