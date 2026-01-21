export type CommitResult = {
	success: boolean
	branch: string
	filePath: string
	message: string
	committed: boolean
	output?: string
}

export type CommitRequest = {
	path: string
	commitMessage: string
}
