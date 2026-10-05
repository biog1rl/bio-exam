const MARKDOWN_INLINE_IMAGE = /!\[[^\]]*\]\(\s*data:image\/[^)]*\)/g
const HTML_INLINE_IMAGE = /<img\b[^>]*\bsrc\s*=\s*["']data:image\/[^"']*["'][^>]*>/gi
const INLINE_IMAGE_URI = /data:image\/[a-z0-9.+-]+;base64,[A-Za-z0-9+/]+=*/gi

export function withoutInlineImages(source: string): string {
	return source.replace(MARKDOWN_INLINE_IMAGE, '').replace(HTML_INLINE_IMAGE, '').replace(INLINE_IMAGE_URI, '')
}
