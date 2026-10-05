export const NEW_TEST_PATH = '/admin/tests/new'

export function newTestHref(topicSlug?: string | null): string {
	return topicSlug ? `${NEW_TEST_PATH}?topic=${encodeURIComponent(topicSlug)}` : NEW_TEST_PATH
}
