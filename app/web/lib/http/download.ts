const ZIP_END_OF_CENTRAL_DIRECTORY_SIZE = 22
const ZIP_END_OF_CENTRAL_DIRECTORY_SEARCH_BYTES = 65557

export function saveBlob(blob: Blob, filename: string): void {
	const url = URL.createObjectURL(blob)
	const link = document.createElement('a')
	link.href = url
	link.download = filename
	document.body.appendChild(link)
	link.click()
	link.remove()
	URL.revokeObjectURL(url)
}

export async function hasZipEndOfCentralDirectory(blob: Blob): Promise<boolean> {
	if (blob.size < ZIP_END_OF_CENTRAL_DIRECTORY_SIZE) return false
	const tail = blob.slice(Math.max(0, blob.size - ZIP_END_OF_CENTRAL_DIRECTORY_SEARCH_BYTES))
	const bytes = new Uint8Array(await tail.arrayBuffer())
	for (let index = bytes.length - ZIP_END_OF_CENTRAL_DIRECTORY_SIZE; index >= 0; index--) {
		if (bytes[index] === 0x50 && bytes[index + 1] === 0x4b && bytes[index + 2] === 0x05 && bytes[index + 3] === 0x06) {
			return true
		}
	}
	return false
}
