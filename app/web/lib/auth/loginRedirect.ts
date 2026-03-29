export function buildLoginRedirectPath(callbackUrl: string): string {
	const searchParams = new URLSearchParams({ callbackUrl })
	return `/login?${searchParams.toString()}`
}
