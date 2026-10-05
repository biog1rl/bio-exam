/**
 * Типизированный доступ к e2e/fixtures/seed.json для Playwright (D-15, D-16).
 *
 * seed.json — единственный источник детерминированных данных: его же читает
 * app/server/src/scripts/e2e-seed.ts. Пароль и логины только тестовые (T-1-27).
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export type ProjectKey = 'desktop' | 'mobile'
export type RoleKey = 'user' | 'admin' | 'teacher'

export type SeedAccount = {
	login: string
	role: RoleKey
	name: string
	/** Входит один раз в auth.setup.ts и сохраняет storageState */
	storageState: boolean
}

export type SeedQuestion = {
	key: string
	template: 'single_choice' | 'multi_choice' | 'matching' | 'short_text' | 'sequence_digits'
	type: string
	prompt: string
	options?: { id: string; text: string }[]
	matchingPairs?: { left: { id: string; text: string }[]; right: { id: string; text: string }[] }
	correct: string | string[] | Record<string, string>
}

export type SeedTest = {
	slug: string
	title: string
	topic?: string
	published: boolean
	assignedTo: string[]
	questions: SeedQuestion[]
}

export type SeedGroup = {
	name: string
	owner: string
	members: string[]
}

export type SeedProject = {
	accounts: SeedAccount[]
	tests: SeedTest[]
	groups?: SeedGroup[]
}

export type SeedTopic = {
	slug: string
	title: string
	description: string
	teachers?: string[]
}

export type SeedFile = {
	password: string
	topic: SeedTopic
	topics?: SeedTopic[]
	projects: Record<ProjectKey, SeedProject>
}

const E2E_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

export const SEED_FILE = path.join(E2E_DIR, 'fixtures', 'seed.json')
export const AUTH_DIR = path.join(E2E_DIR, '.auth')

export const seed: SeedFile = JSON.parse(fs.readFileSync(SEED_FILE, 'utf8'))

/** Тестовый пароль всех e2e-аккаунтов */
export const E2E_PASSWORD = seed.password

export const PROJECT_KEYS: ProjectKey[] = ['desktop', 'mobile']

/** Ключ данных по имени проекта Playwright: chromium-desktop -> desktop, chromium-mobile -> mobile */
export function projectKeyFromName(projectName: string): ProjectKey {
	if (projectName.endsWith('-desktop')) return 'desktop'
	if (projectName.endsWith('-mobile')) return 'mobile'
	throw new Error(`no e2e data for Playwright project ${projectName}`)
}

/** Путь к сохранённому storageState аккаунта */
export function storageStatePath(login: string): string {
	return path.join(AUTH_DIR, `${login}.json`)
}

/** Аккаунты, которые auth.setup.ts логинит один раз за прогон */
export function storageStateAccounts(): SeedAccount[] {
	return PROJECT_KEYS.flatMap((key) => seed.projects[key].accounts.filter((account) => account.storageState))
}

/** Аккаунт со storageState для проекта и роли (student-<p> или admin-<p>) */
export function sessionAccount(projectKey: ProjectKey, role: RoleKey): SeedAccount {
	const account = seed.projects[projectKey].accounts.find((item) => item.storageState && item.role === role)
	if (!account) throw new Error(`no ${role} session account for ${projectKey}`)
	return account
}

export function sessionAccountByPrefix(projectKey: ProjectKey, prefix: string): SeedAccount {
	const login = `${prefix}-${projectKey}`
	const account = seed.projects[projectKey].accounts.find((item) => item.storageState && item.login === login)
	if (!account) throw new Error(`no session account ${login}`)
	return account
}

export function seedTopic(slug: string): SeedTopic {
	const topic = [seed.topic, ...(seed.topics ?? [])].find((item) => item.slug === slug)
	if (!topic) throw new Error(`no seed topic ${slug}`)
	return topic
}

/** Аккаунт только для явных тестов входа и выхода (login-student-<p> или login-admin-<p>) */
export function loginAccount(projectKey: ProjectKey, role: RoleKey): SeedAccount {
	const account = seed.projects[projectKey].accounts.find((item) => !item.storageState && item.role === role)
	if (!account) throw new Error(`no ${role} login account for ${projectKey}`)
	return account
}

/** Тест проекта по префиксу slug (all-templates, review-d1, seq-d2, authoring) */
export function seedTest(projectKey: ProjectKey, prefix: string): SeedTest {
	const test = seed.projects[projectKey].tests.find((item) => item.slug === `${prefix}-${projectKey}`)
	if (!test) throw new Error(`no seed test ${prefix}-${projectKey}`)
	return test
}
