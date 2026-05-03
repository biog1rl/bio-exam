import { Loader2, Trash2, UserPlus } from 'lucide-react'

import { Button } from '@/components/ui/button'

import { AdminTestsSectionCard } from '../AdminTestsSectionCard'
import type { StudentAssignment, UserItem } from './test-editor-types'

interface StudentAccessPanelProps {
	assignmentsLoaded: boolean
	usersLoaded: boolean
	studentAssignments: StudentAssignment[]
	availableUsers: UserItem[]
	assigningUserId: string | null
	removingUserId: string | null
	onAssignStudent: (userId: string) => void | Promise<void>
	onRemoveStudent: (userId: string) => void | Promise<void>
}

function getUserDisplayName(user: UserItem) {
	const fullName = [user.firstName, user.lastName].filter(Boolean).join(' ')
	return user.name || fullName || user.login || user.id
}

export function StudentAccessPanel({
	assignmentsLoaded,
	usersLoaded,
	studentAssignments,
	availableUsers,
	assigningUserId,
	removingUserId,
	onAssignStudent,
	onRemoveStudent,
}: StudentAccessPanelProps) {
	return (
		<div className="tab:grid-cols-2 grid gap-5">
			<AdminTestsSectionCard title="Доступ студентов" headerClassName="pb-3">
				{!assignmentsLoaded ? (
					<div className="text-muted-foreground flex items-center gap-2 text-sm">
						<Loader2 className="size-4 animate-spin" />
						Загрузка...
					</div>
				) : studentAssignments.length === 0 ? (
					<p className="text-muted-foreground text-sm">Нет студентов с доступом к этому тесту</p>
				) : (
					<div className="space-y-2">
						{studentAssignments.map((assignment) => {
							const displayName = assignment.name || assignment.login || assignment.userId
							return (
								<div
									key={assignment.userId}
									className="border-border/70 bg-secondary/55 flex items-center justify-between gap-2 rounded-2xl border px-3 py-2"
								>
									<div className="min-w-0 flex-1">
										<p className="truncate text-sm font-medium">{displayName}</p>
										{assignment.login && assignment.name && (
											<p className="text-muted-foreground text-xs">{assignment.login}</p>
										)}
									</div>
									<Button
										size="icon"
										variant="ghost"
										aria-label="Удалить доступ"
										onClick={() => onRemoveStudent(assignment.userId)}
										disabled={removingUserId === assignment.userId}
									>
										{removingUserId === assignment.userId ? (
											<Loader2 className="size-4 animate-spin" />
										) : (
											<Trash2 className="size-4" />
										)}
									</Button>
								</div>
							)
						})}
					</div>
				)}
			</AdminTestsSectionCard>

			<AdminTestsSectionCard title="Добавить студента" headerClassName="pb-3">
				{!usersLoaded ? (
					<div className="text-muted-foreground flex items-center gap-2 text-sm">
						<Loader2 className="size-4 animate-spin" />
						Загрузка пользователей...
					</div>
				) : availableUsers.length === 0 ? (
					<p className="text-muted-foreground text-sm">Все пользователи уже имеют доступ</p>
				) : (
					<div className="max-h-80 space-y-2 overflow-y-auto">
						{availableUsers.map((user) => {
							const displayName = getUserDisplayName(user)
							return (
								<div
									key={user.id}
									className="border-border/70 bg-secondary/55 flex items-center justify-between gap-2 rounded-2xl border px-3 py-2"
								>
									<div className="min-w-0 flex-1">
										<p className="truncate text-sm font-medium">{displayName}</p>
										{user.login && displayName !== user.login && (
											<p className="text-muted-foreground text-xs">{user.login}</p>
										)}
									</div>
									<Button
										size="sm"
										variant="outline"
										onClick={() => onAssignStudent(user.id)}
										disabled={assigningUserId === user.id}
									>
										{assigningUserId === user.id ? (
											<Loader2 className="mr-1 size-3 animate-spin" />
										) : (
											<UserPlus className="mr-1 size-3" />
										)}
										Добавить
									</Button>
								</div>
							)
						})}
					</div>
				)}
			</AdminTestsSectionCard>
		</div>
	)
}
