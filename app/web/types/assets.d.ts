export type AssetFile = {
	filename: string
	path: string
	size: number
	createdAt: string
}

export type UploadAssetResponse = {
	success: boolean
	path: string
	filename: string
}

export type AssetsListResponse = {
	assets: AssetFile[]
}
