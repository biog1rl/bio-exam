import type { Page } from '@playwright/test'

/**
 * Текст с контрастом ниже WCAG AA: вычисленный цвет текста против фактического фона
 * с учётом прозрачности предков. Текст поверх картинок и градиентов не проверяется.
 */
export async function lowContrastTexts(page: Page): Promise<string[]> {
	return page.evaluate(() => {
		const canvas = document.createElement('canvas')
		canvas.width = canvas.height = 1
		const ctx = canvas.getContext('2d', { willReadFrequently: true })
		if (!ctx) return ['canvas unavailable']
		const rgba = (color: string): number[] => {
			ctx.clearRect(0, 0, 1, 1)
			ctx.fillStyle = '#000'
			ctx.fillStyle = color
			ctx.fillRect(0, 0, 1, 1)
			const d = ctx.getImageData(0, 0, 1, 1).data
			return [d[0], d[1], d[2], d[3] / 255]
		}
		const over = (top: number[], under: number[]) =>
			[0, 1, 2].map((i) => top[i] * top[3] + under[i] * (1 - top[3])).concat(1)
		const background = (el: Element): number[] => {
			const chain: number[][] = []
			for (let node: Element | null = el; node; node = node.parentElement) {
				const color = rgba(getComputedStyle(node).backgroundColor)
				if (color[3] > 0) chain.push(color)
				if (color[3] >= 1) break
			}
			let acc = [255, 255, 255, 1]
			for (let i = chain.length - 1; i >= 0; i--) acc = over(chain[i], acc)
			return acc
		}
		const luminance = (c: number[]) => {
			const lin = c.slice(0, 3).map((v) => {
				const x = v / 255
				return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4
			})
			return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2]
		}
		const ratio = (a: number[], b: number[]) => {
			const x = luminance(a)
			const y = luminance(b)
			return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)
		}
		const found: string[] = []
		for (const el of document.querySelectorAll('body *')) {
			if (![...el.childNodes].some((n) => n.nodeType === Node.TEXT_NODE && n.textContent?.trim())) continue
			const rect = el.getBoundingClientRect()
			if (rect.width === 0 || rect.height === 0) continue
			const style = getComputedStyle(el)
			if (style.visibility === 'hidden' || Number(style.opacity) === 0) continue
			if (el.closest('nextjs-portal, [data-nextjs-toast], [aria-hidden="true"]')) continue
			const bg = background(el)
			const value = ratio(over(rgba(style.color), bg), bg)
			const size = parseFloat(style.fontSize)
			const large = size >= 24 || (size >= 18.66 && Number(style.fontWeight) >= 700)
			if (value < (large ? 3 : 4.5)) found.push(`${value.toFixed(2)} «${el.textContent?.trim().slice(0, 40)}»`)
		}
		return found
	})
}

/**
 * Элементы шапки и содержимого, которые выходят за правый край экрана.
 * Содержимое внутри блока с горизонтальной прокруткой, который сам помещается в экран, не считается.
 */
export async function horizontalOverflow(page: Page): Promise<string[]> {
	return page.evaluate(() => {
		const width = document.documentElement.clientWidth
		const insideScroller = (el: Element): boolean => {
			for (let node = el.parentElement; node; node = node.parentElement) {
				const overflowX = getComputedStyle(node).overflowX
				if ((overflowX === 'auto' || overflowX === 'scroll') && node.getBoundingClientRect().right <= width + 1)
					return true
			}
			return false
		}
		return [...document.querySelectorAll('main *, header *')]
			.filter((el) => el.getBoundingClientRect().right > width + 1 && !insideScroller(el))
			.map((el) => `${el.tagName.toLowerCase()}.${String(el.getAttribute('class') ?? '').slice(0, 60)}`)
	})
}
