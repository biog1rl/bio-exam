import { expect, test, type APIRequestContext, type APIResponse } from '@playwright/test'

const LOGIN_REDIRECT_STATUS = 307
const NORMALIZE_REDIRECT_STATUS = 308
const UUID = '00000000-0000-4000-8000-000000000001'

function expectLoginRedirect(res: APIResponse, baseURL: string | undefined, expectedCallback: string): void {
	expect(res.status()).toBe(LOGIN_REDIRECT_STATUS)
	const location = res.headers()['location']
	expect(location, 'redirect carries a Location header').toBeTruthy()
	const target = new URL(location, baseURL)
	expect(target.pathname).toBe('/login')
	expect(target.searchParams.get('callbackUrl')).toBe(expectedCallback)
}

function expectNotServed(res: APIResponse): void {
	expect(Math.floor(res.status() / 100), 'a protected page is not served without a session').not.toBe(2)
}

async function expectNormalizedToLogin(
	request: APIRequestContext,
	res: APIResponse,
	baseURL: string | undefined,
	normalizedPath: string
): Promise<void> {
	expect(res.status()).toBe(NORMALIZE_REDIRECT_STATUS)
	const location = res.headers()['location']
	expect(new URL(location, baseURL).pathname).toBe(normalizedPath)
	const next = await request.get(location, { maxRedirects: 0 })
	expectLoginRedirect(next, baseURL, normalizedPath)
}

test('anonymous GET /dashboard redirects to /login with callbackUrl @proxy', async ({ request, baseURL }) => {
	const res = await request.get('/dashboard', { maxRedirects: 0 })
	expectLoginRedirect(res, baseURL, '/dashboard')
})

const ROUTER_STATE_TREE = encodeURIComponent(JSON.stringify(['', { children: ['__PAGE__', {}] }, null, null, true]))

const HEADER_VARIANTS: { name: string; headers: Record<string, string> }[] = [
	{ name: 'RSC', headers: { RSC: '1' } },
	{ name: 'RSC + Next-Router-Prefetch', headers: { RSC: '1', 'Next-Router-Prefetch': '1' } },
	{ name: 'RSC + Next-Router-Segment-Prefetch', headers: { RSC: '1', 'Next-Router-Segment-Prefetch': '/_tree' } },
	{ name: 'RSC + Next-Router-State-Tree', headers: { RSC: '1', 'Next-Router-State-Tree': ROUTER_STATE_TREE } },
	{ name: 'Next-Url', headers: { 'Next-Url': '/dashboard' } },
	{ name: 'x-middleware-subrequest proxy', headers: { 'x-middleware-subrequest': 'proxy:proxy:proxy:proxy:proxy' } },
	{
		name: 'x-middleware-subrequest middleware',
		headers: { 'x-middleware-subrequest': 'middleware:middleware:middleware:middleware:middleware' },
	},
]

for (const path of ['/dashboard', '/tests/biology/cell']) {
	for (const variant of HEADER_VARIANTS) {
		test(`anonymous GET ${path} with ${variant.name} redirects to /login @proxy`, async ({ request, baseURL }) => {
			const res = await request.get(path, { headers: variant.headers, maxRedirects: 0 })
			expectLoginRedirect(res, baseURL, path)
		})
	}

	test(`anonymous GET ${path}?_rsc=abc redirects to /login without _rsc in callbackUrl @proxy`, async ({
		request,
		baseURL,
	}) => {
		const res = await request.get(`${path}?_rsc=abc`, { maxRedirects: 0 })
		expectLoginRedirect(res, baseURL, path)
	})
}

const DYNAMIC_ROUTES = [
	'/tests/biology',
	'/tests/biology/cell',
	'/tests/biology/cell?attempt=1',
	`/profile/${UUID}`,
	'/admin',
	`/admin/users/${UUID}`,
	`/admin/attempts/${UUID}`,
	`/admin/tests/biology/cell/questions/${UUID}`,
	`/admin/tests/biology/cell/questions/drafts/${UUID}`,
	'/admin/tests/question-types/single_choice',
]

for (const path of DYNAMIC_ROUTES) {
	test(`anonymous GET dynamic route ${path} redirects to /login @proxy`, async ({ request, baseURL }) => {
		const res = await request.get(path, { maxRedirects: 0 })
		expectLoginRedirect(res, baseURL, path)
	})
}

const PATH_FORMS_TO_LOGIN = [
	{ name: 'percent-encoded letter', path: '/%64ashboard' },
	{ name: 'upper case', path: '/DASHBOARD' },
	{ name: 'literal [param] template', path: '/tests/%5BtopicSlug%5D/%5BtestSlug%5D' },
]

for (const form of PATH_FORMS_TO_LOGIN) {
	test(`anonymous GET path form ${form.name} ${form.path} redirects to /login @proxy`, async ({ request, baseURL }) => {
		const res = await request.get(form.path, { maxRedirects: 0 })
		expectNotServed(res)
		expectLoginRedirect(res, baseURL, form.path)
	})
}

test('anonymous GET path form trailing slash /dashboard/ is normalized and redirects to /login @proxy', async ({
	request,
	baseURL,
}) => {
	const res = await request.get('/dashboard/', { maxRedirects: 0 })
	expectNotServed(res)
	await expectNormalizedToLogin(request, res, baseURL, '/dashboard')
})

test('anonymous GET path form double slash //dashboard is normalized and redirects to /login @proxy', async ({
	request,
	baseURL,
}) => {
	const res = await request.get(`${baseURL}//dashboard`, { maxRedirects: 0 })
	expectNotServed(res)
	await expectNormalizedToLogin(request, res, baseURL, '/dashboard')
})

test('anonymous GET /login is served @proxy', async ({ request }) => {
	const res = await request.get('/login', { maxRedirects: 0 })
	expect(res.status()).toBe(200)
})

test('anonymous GET /invite/some-token is not redirected to /login @proxy', async ({ request }) => {
	const res = await request.get('/invite/some-token', { maxRedirects: 0 })
	expect(res.status()).toBe(200)
	expect(res.headers()['location']).toBeUndefined()
})
