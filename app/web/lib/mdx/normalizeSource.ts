type Fence = {
	character: string
	length: number
}

export function normalizeMdxSource(source: string): string {
	let fence: Fence | null = null

	return source
		.split('\n')
		.map((line) => {
			const fenceMatch = line.match(/^\s*(`{3,}|~{3,})/)
			if (fenceMatch) {
				const marker = fenceMatch[1]
				if (!fence) {
					fence = { character: marker[0], length: marker.length }
				} else if (marker[0] === fence.character && marker.length >= fence.length) {
					fence = null
				}
				return line
			}

			if (fence) return line
			return line.replace(/^([ \t]{0,3}\d+)\)([ \t\p{Zs}]+)/u, '$1\\)$2')
		})
		.join('\n')
}
