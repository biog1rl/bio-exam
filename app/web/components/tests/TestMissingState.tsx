import { SearchX } from 'lucide-react'

import { AccessDeniedState } from '@/components/auth/AccessDeniedState'

export function TestMissingState() {
	return (
		<AccessDeniedState
			kicker="не найдено"
			icon={SearchX}
			title="Тест не найден"
			description="Тест удалён, снят с публикации или не назначен вам."
			backHref="/tests"
			backLabel="Ко всем тестам"
		/>
	)
}
