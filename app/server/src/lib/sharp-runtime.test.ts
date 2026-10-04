import assert from 'node:assert/strict'
import sharp from 'sharp'
import { describe, test } from 'vitest'

function blank() {
	return sharp({ create: { width: 4, height: 4, channels: 3, background: '#ffffff' } })
}

describe('Sharp на Node 24', () => {
	test('процесс работает на Node 24', () => {
		assert.equal(Number(process.versions.node.split('.')[0]), 24)
	})

	test('libvips загружена и сообщает версию', () => {
		assert.equal(typeof sharp.versions.vips, 'string')
		assert.ok(sharp.versions.vips.length > 0)
	})

	test('rotate, resize и webp на картинке 4x4 дают WebP 2x2', async () => {
		const out = await blank().rotate(90).resize(2, 2).webp().toBuffer()
		const meta = await sharp(out).metadata()
		assert.equal(meta.format, 'webp')
		assert.equal(meta.width, 2)
		assert.equal(meta.height, 2)
	})

	test('rotate, resize и png на картинке 4x4 дают PNG 2x2', async () => {
		const out = await blank().rotate(90).resize(2, 2).png().toBuffer()
		const meta = await sharp(out).metadata()
		assert.equal(meta.format, 'png')
		assert.equal(meta.width, 2)
		assert.equal(meta.height, 2)
	})
})
