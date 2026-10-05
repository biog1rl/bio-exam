import type { Request, Response } from 'express'

import { EXPORT_ZIP_LIMIT, type ExportZipLimit } from '../../config/export.js'
import { archiveToBuffer, streamArchive, type PreparedArchive } from '../../services/question-content/index.js'

function setArchiveHeaders(res: Response, filename: string): void {
	res.setHeader('Content-Type', 'application/zip')
	res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
}

function clearArchiveHeaders(res: Response): void {
	res.removeHeader('Content-Type')
	res.removeHeader('Content-Disposition')
}

function exportContext(req: Request, prepared: PreparedArchive) {
	return { testId: req.params.id, topicSlug: req.params.slug, filename: prepared.filename }
}

async function streamToResponse(req: Request, res: Response, prepared: PreparedArchive): Promise<void> {
	const controller = new AbortController()
	const onClose = () => {
		if (!res.writableFinished) controller.abort()
	}
	res.on('close', onClose)
	setArchiveHeaders(res, prepared.filename)
	try {
		await streamArchive(prepared, res, { signal: controller.signal })
	} catch (error) {
		if (controller.signal.aborted) {
			req.log?.info?.({ event: 'export_stream_aborted', ...exportContext(req, prepared) }, 'export stream aborted')
			res.destroy()
			return
		}
		if (!res.headersSent) {
			clearArchiveHeaders(res)
			throw error
		}
		req.log?.error?.(
			{ event: 'export_stream_failed', err: error, ...exportContext(req, prepared) },
			'export stream failed after headers'
		)
		res.destroy()
	} finally {
		res.off('close', onClose)
	}
}

export async function sendArchive(
	req: Request,
	res: Response,
	prepared: PreparedArchive,
	limit: ExportZipLimit = EXPORT_ZIP_LIMIT
): Promise<void> {
	if (limit.mode === 'stream') {
		await streamToResponse(req, res, prepared)
		return
	}
	const buffer = await archiveToBuffer(prepared, limit.limitBytes)
	setArchiveHeaders(res, prepared.filename)
	res.send(buffer)
}
