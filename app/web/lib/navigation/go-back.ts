import { backAction } from './paths'

type BackRouter = { back(): void; push(href: string): void }

export function goBack(router: BackRouter, pathname: string): void {
	const navigation = (window as { navigation?: { canGoBack?: boolean } }).navigation
	const action = backAction(pathname, navigation?.canGoBack ?? window.history.length > 1)
	if (action.kind === 'history') router.back()
	else router.push(action.href)
}
