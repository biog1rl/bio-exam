export function versionedUrl(url: string, version: string | number): string {
	if (url.startsWith('blob:') || url.startsWith('data:')) return url
	const hashAt = url.indexOf('#')
	const base = hashAt === -1 ? url : url.slice(0, hashAt)
	const hash = hashAt === -1 ? '' : url.slice(hashAt)
	const separator = base.includes('?') ? '&' : '?'
	return `${base}${separator}v=${encodeURIComponent(String(version))}${hash}`
}
