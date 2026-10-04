import { inflateRawSync } from 'node:zlib'

const END_OF_CENTRAL_DIRECTORY = 0x06054b50
const CENTRAL_DIRECTORY_ENTRY = 0x02014b50
const LOCAL_FILE_HEADER = 0x04034b50
const END_RECORD_SIZE = 22
const MAX_COMMENT_SIZE = 0xffff
const ZIP64_MARKER = 0xffffffff

function findEndOfCentralDirectory(buffer: Buffer): number {
	const lowest = Math.max(0, buffer.length - END_RECORD_SIZE - MAX_COMMENT_SIZE)
	for (let offset = buffer.length - END_RECORD_SIZE; offset >= lowest; offset -= 1) {
		if (buffer.readUInt32LE(offset) === END_OF_CENTRAL_DIRECTORY) return offset
	}
	throw new Error('readZipEntries: end of central directory not found')
}

export function readZipEntries(buffer: Buffer): Map<string, Buffer> {
	if (buffer.length < END_RECORD_SIZE) throw new Error('readZipEntries: buffer is too small')
	const end = findEndOfCentralDirectory(buffer)
	const total = buffer.readUInt16LE(end + 10)
	const directoryOffset = buffer.readUInt32LE(end + 16)
	if (directoryOffset === ZIP64_MARKER) throw new Error('readZipEntries: ZIP64 is not supported')
	const entries = new Map<string, Buffer>()
	let cursor = directoryOffset
	for (let index = 0; index < total; index += 1) {
		if (buffer.readUInt32LE(cursor) !== CENTRAL_DIRECTORY_ENTRY) {
			throw new Error(`readZipEntries: bad central directory entry at ${cursor}`)
		}
		const method = buffer.readUInt16LE(cursor + 10)
		const compressedSize = buffer.readUInt32LE(cursor + 20)
		const size = buffer.readUInt32LE(cursor + 24)
		const nameLength = buffer.readUInt16LE(cursor + 28)
		const extraLength = buffer.readUInt16LE(cursor + 30)
		const commentLength = buffer.readUInt16LE(cursor + 32)
		const localOffset = buffer.readUInt32LE(cursor + 42)
		const name = buffer.toString('utf8', cursor + 46, cursor + 46 + nameLength)
		if (compressedSize === ZIP64_MARKER || size === ZIP64_MARKER || localOffset === ZIP64_MARKER) {
			throw new Error(`readZipEntries: ZIP64 entry ${name} is not supported`)
		}
		if (buffer.readUInt32LE(localOffset) !== LOCAL_FILE_HEADER) {
			throw new Error(`readZipEntries: bad local header for ${name}`)
		}
		const dataStart = localOffset + 30 + buffer.readUInt16LE(localOffset + 26) + buffer.readUInt16LE(localOffset + 28)
		const raw = buffer.subarray(dataStart, dataStart + compressedSize)
		let data: Buffer
		if (method === 0) data = Buffer.from(raw)
		else if (method === 8) data = inflateRawSync(raw)
		else throw new Error(`readZipEntries: unsupported compression method ${method} for ${name}`)
		if (data.length !== size) throw new Error(`readZipEntries: size mismatch for ${name}`)
		if (!name.endsWith('/')) entries.set(name, data)
		cursor += 46 + nameLength + extraLength + commentLength
	}
	return entries
}
