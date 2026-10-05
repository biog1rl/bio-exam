import assert from 'node:assert/strict'
import { crc32 } from 'node:zlib'
import { describe, test } from 'vitest'

import { hasZipEndOfCentralDirectory } from './download'

function u16(value: number): Buffer {
	const buffer = Buffer.alloc(2)
	buffer.writeUInt16LE(value)
	return buffer
}

function u32(value: number): Buffer {
	const buffer = Buffer.alloc(4)
	buffer.writeUInt32LE(value >>> 0)
	return buffer
}

function storedZip(name: string, content: string): Buffer {
	const fileName = Buffer.from(name)
	const data = Buffer.from(content)
	const crc = crc32(data)
	const local = Buffer.concat([
		u32(0x04034b50),
		u16(20),
		u16(0),
		u16(0),
		u16(0),
		u16(0),
		u32(crc),
		u32(data.length),
		u32(data.length),
		u16(fileName.length),
		u16(0),
		fileName,
		data,
	])
	const central = Buffer.concat([
		u32(0x02014b50),
		u16(20),
		u16(20),
		u16(0),
		u16(0),
		u16(0),
		u16(0),
		u32(crc),
		u32(data.length),
		u32(data.length),
		u16(fileName.length),
		u16(0),
		u16(0),
		u16(0),
		u16(0),
		u32(0),
		u32(0),
		fileName,
	])
	const end = Buffer.concat([
		u32(0x06054b50),
		u16(0),
		u16(0),
		u16(1),
		u16(1),
		u32(central.length),
		u32(local.length),
		u16(0),
	])
	return Buffer.concat([local, central, end])
}

describe('hasZipEndOfCentralDirectory', () => {
	const archive = storedZip('question.json', '{"id":"q-1","text":"Строение клетки"}')

	test('полный архив — конец центрального каталога найден', async () => {
		assert.equal(archive.subarray(archive.length - 22, archive.length - 18).toString('hex'), '504b0506')
		assert.equal(await hasZipEndOfCentralDirectory(new Blob([archive])), true)
	})

	test('архив без последних 30 байт — false', async () => {
		assert.equal(await hasZipEndOfCentralDirectory(new Blob([archive.subarray(0, archive.length - 30)])), false)
	})

	test('пустой Blob — false', async () => {
		assert.equal(await hasZipEndOfCentralDirectory(new Blob([])), false)
	})

	test('архив с комментарием до 65 535 байт — true', async () => {
		const comment = Buffer.alloc(65535, 0x20)
		const withComment = Buffer.concat([archive.subarray(0, archive.length - 2), u16(comment.length), comment])
		assert.equal(await hasZipEndOfCentralDirectory(new Blob([withComment])), true)
	})

	test('сигнатура дальше 65 557 байт от конца — false', async () => {
		const far = Buffer.concat([u32(0x06054b50), Buffer.alloc(18), Buffer.alloc(65557)])
		assert.equal(await hasZipEndOfCentralDirectory(new Blob([far])), false)
	})
})
