import { useState } from 'react'

import { Loader2, Trash2, UserPlus } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { UserStatusFilter } from '@/components/users/UserStatusFilter'
import { matchesUserStatus, type UserStatus } from '@/lib/users/status-filter'
import { assignmentAction, studentRowSubtitle } from '@/lib/users/student-card'

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
	const [statusFilter, setStatusFilter] = useState<UserStatus>('active')
	const [assignmentStatus, setAssignmentStatus] = useState<UserStatus>('active')
	const filteredUsers = availableUsers.filter((user) => matchesUserStatus(user.isActive, statusFilter))
	const filteredAssignments = studentAssignments.filter((assignment) =>
		matchesUserStatus(assignment.isActive, assignmentStatus)
	)

	return (
		<div className="grid gap-5 tab:grid-cols-2">
			<AdminTestsSectionCard title="Доступ студентов" headerClassName="pb-3">
				<div className="mb-3">
					<UserStatusFilter
						value={assignmentStatus}
						onChange={setAssignmentStatus}
						label="Статус студентов с доступом"
					/>
				</div>
				{!assignmentsLoaded ? (
					<div className="flex items-center gap-2 text-sm text-muted-foreground">
						<Loader2 className="size-4 animate-spin" />
						Загрузка...
					</div>
				) : filteredAssignments.length === 0 ? (
					<p className="text-sm text-muted-foreground">Нет студентов с доступом и выбранным статусом</p>
				) : (
					<div className="space-y-2">
						{filteredAssignments.map((assignment) => {
							const displayName = assignment.name || assignment.login || assignment.userId
							const subtitle = studentRowSubtitle(assignment)
							return (
								<div
									key={assignment.userId}
									className="flex items-center justify-between gap-2 rounded-2xl border border-border/70 bg-secondary/55 px-3 py-2"
								>
									<div className="min-w-0 flex-1">
										<p className="truncate text-sm font-medium">{displayName}</p>
										{subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
									</div>
									{assignmentAction(assignment) === 'remove' && (
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
									)}
								</div>
							)
						})}
					</div>
				)}
			</AdminTestsSectionCard>

			<AdminTestsSectionCard title="Добавить студента" headerClassName="pb-3">
				<div className="mb-3">
					<UserStatusFilter value={statusFilter} onChange={setStatusFilter} />
				</div>
				{!usersLoaded ? (
					<div className="flex items-center gap-2 text-sm text-muted-foreground">
						<Loader2 className="size-4 animate-spin" />
						Загрузка пользователей...
					</div>
				) : filteredUsers.length === 0 ? (
					<p className="text-sm text-muted-foreground">Нет студентов для добавления с выбранным статусом</p>
				) : (
					<div className="max-h-80 space-y-2 overflow-y-auto">
						{filteredUsers.map((user) => {
							const displayName = getUserDisplayName(user)
							return (
								<div
									key={user.id}
									className="flex items-center justify-between gap-2 rounded-2xl border border-border/70 bg-secondary/55 px-3 py-2"
								>
									<div className="min-w-0 flex-1">
										<p className="truncate text-sm font-medium">{displayName}</p>
										{user.login && displayName !== user.login && (
											<p className="text-xs text-muted-foreground">{user.login}</p>
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
