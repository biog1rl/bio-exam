export type ExportZipLimit = { mode: 'buffer'; limitBytes: number } | { mode: 'stream' }

const DEFAULT_LIMIT_BYTES = 4_400_000

export function parseExportZipLimit(raw: string | undefined): ExportZipLimit {
	if (raw === undefined || raw.trim() === '') return { mode: 'buffer', limitBytes: DEFAULT_LIMIT_BYTES }
	const value = /^\d+$/.test(raw) ? Number(raw) : Number.NaN
	if (!Number.isSafeInteger(value)) {
		throw new Error('EXPORT_ZIP_MAX_BYTES must be a non-negative integer number of bytes: 0 streams without a limit')
	}
	return value === 0 ? { mode: 'stream' } : { mode: 'buffer', limitBytes: value }
}

export const EXPORT_ZIP_LIMIT = parseExportZipLimit(process.env.EXPORT_ZIP_MAX_BYTES)
