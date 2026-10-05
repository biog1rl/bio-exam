import { MalformedBodyError, request, requestJson, type RequestOutcome } from '@/lib/http/request'
import type { AssetsListResponse, UploadAssetResponse } from '@/types/assets'

export type AssetsPage = AssetsListResponse

export type UploadedAsset = UploadAssetResponse

export type DeleteAssetBody = { path: string }

const ASSETS_PATH = '/api/docs/assets'

export const UPLOAD_FAILED_MESSAGE = 'Не удалось загрузить изображение'

export const assetsKeys = {
	page: (limit: number, offset: number) => `${ASSETS_PATH}?limit=${limit}&offset=${offset}`,
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

export function parseAssetsPage(body: unknown): AssetsPage {
	if (!isRecord(body) || !Array.isArray(body.assets) || typeof body.total !== 'number') {
		throw new MalformedBodyError()
	}
	return body as AssetsPage
}

export function parseUploadedAsset(body: unknown): UploadedAsset {
	if (!isRecord(body) || typeof body.path !== 'string' || typeof body.filename !== 'string') {
		throw new MalformedBodyError()
	}
	return body as UploadedAsset
}

export function parseSignedUrl(body: unknown): string {
	if (!isRecord(body) || typeof body.signedUrl !== 'string') throw new MalformedBodyError()
	return body.signedUrl
}

export function listAssets(limit: number, offset: number): Promise<RequestOutcome<AssetsPage>> {
	return request(assetsKeys.page(limit, offset), { parse: parseAssetsPage })
}

export function uploadAsset(form: FormData): Promise<RequestOutcome<UploadedAsset>> {
	return request(ASSETS_PATH, {
		method: 'POST',
		body: form,
		parse: parseUploadedAsset,
		fallbackMessage: UPLOAD_FAILED_MESSAGE,
	})
}

export function deleteAsset(body: DeleteAssetBody): Promise<RequestOutcome<unknown>> {
	return request(ASSETS_PATH, { method: 'DELETE', json: body })
}

export function fetchSignedUrl(src: string): Promise<string> {
	return requestJson(`${ASSETS_PATH}/signed?path=${encodeURIComponent(src)}`, { parse: parseSignedUrl })
}
