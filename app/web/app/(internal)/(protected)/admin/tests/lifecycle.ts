export function resolveInitialCreateModePersistence(params: {
	questionCount: number
	requestedPublicationState: boolean
}) {
	const shouldForceDraft = params.requestedPublicationState && params.questionCount === 0
	return {
		shouldForceDraft,
		persistedPublicationState: shouldForceDraft ? false : params.requestedPublicationState,
	}
}
