'use client'

import type { PermissionDomain } from '@bio-exam/rbac'

import { Lock } from 'lucide-react'

import { badgeVariants } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Skeleton } from '@/components/ui/skeleton'
import {
	StackedAccordion,
	StackedAccordionContent,
	StackedAccordionItem,
	StackedAccordionTrigger,
} from '@/components/ui/stacked-accordion'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import type { RbacRoleRow } from '@/lib/rbac/api'
import { PERMISSION_VIEWS, type PermissionActionView, type PermissionDomainView } from '@/lib/rbac/labels'
import { cn } from '@/lib/utils/cn'

import { IMMUTABLE_ROLE_KEY, permissionKey } from './grants'

type RolesMode = {
	kind: 'roles'
	roles: readonly RbacRoleRow[]
	allows: (role: RbacRoleRow, domain: PermissionDomain, action: string) => boolean
	onToggle: (role: RbacRoleRow, domain: PermissionDomain, action: string, next: boolean) => void
}

type UserMode = {
	kind: 'user'
	userName: string
	loading: boolean
	effective: ReadonlySet<string>
	overridden: ReadonlySet<string>
	onToggle: (domain: PermissionDomain, action: string, next: boolean) => void
}

export type PermissionsMode = RolesMode | UserMode

type PermissionsAccordionProps = {
	mode: PermissionsMode
	canWrite: boolean
}

const CHECKBOX_CELL = '[&:has([role=checkbox])]:pr-2'

function ChangedBadge() {
	return (
		<span
			title="Изменено для пользователя"
			className={cn(
				badgeVariants({ variant: 'outline' }),
				'rounded-full border-destructive/50 px-1.5 py-0 text-[11px] leading-4 font-medium text-destructive'
			)}
		>
			изм.
		</span>
	)
}

function ActionCell({ item, changed }: { item: PermissionActionView; changed: boolean }) {
	return (
		<TableCell className="min-w-40 py-3 pl-4">
			<span className="flex flex-wrap items-center gap-1.5 font-medium">
				{item.label}
				{changed ? <ChangedBadge /> : null}
			</span>
			<span className="block text-xs text-muted-foreground">{item.description}</span>
		</TableCell>
	)
}

function RolesTable({ view, mode, canWrite }: { view: PermissionDomainView; mode: RolesMode; canWrite: boolean }) {
	return (
		<Table>
			<TableHeader>
				<TableRow className="hover:bg-transparent">
					<TableHead className="pl-4 text-xs">Действие</TableHead>
					{mode.roles.map((role) => {
						const locked = role.key === IMMUTABLE_ROLE_KEY
						return (
							<TableHead
								key={role.key}
								className={cn(
									'w-12 text-center text-xs tab:w-28',
									locked && 'hidden font-medium text-muted-foreground tab-sm:table-cell'
								)}
							>
								{locked ? (
									<span className="inline-flex items-center gap-1.5">
										<Lock className="size-3" aria-hidden="true" />
										{role.name}
									</span>
								) : (
									role.name
								)}
							</TableHead>
						)
					})}
				</TableRow>
			</TableHeader>
			<TableBody>
				{view.actions.map((item) => (
					<TableRow key={item.action}>
						<ActionCell item={item} changed={false} />
						{mode.roles.map((role) => {
							const locked = role.key === IMMUTABLE_ROLE_KEY
							return (
								<TableCell
									key={role.key}
									className={cn('w-12 tab:w-28', CHECKBOX_CELL, locked && 'hidden tab-sm:table-cell')}
								>
									<div className="flex justify-center">
										<Checkbox
											checked={mode.allows(role, view.domain, item.action)}
											disabled={locked || !canWrite}
											aria-label={`${role.name}: ${view.label} — ${item.label}`}
											onCheckedChange={(value) => mode.onToggle(role, view.domain, item.action, value === true)}
										/>
									</div>
								</TableCell>
							)
						})}
					</TableRow>
				))}
			</TableBody>
		</Table>
	)
}

function UserTable({ view, mode, canWrite }: { view: PermissionDomainView; mode: UserMode; canWrite: boolean }) {
	return (
		<Table>
			<TableBody>
				{view.actions.map((item) => {
					const key = permissionKey(view.domain, item.action)
					return (
						<TableRow key={item.action}>
							<ActionCell item={item} changed={mode.overridden.has(key)} />
							<TableCell className={cn('w-14', CHECKBOX_CELL)}>
								<div className="flex justify-end pr-2">
									{mode.loading ? (
										<Skeleton className="size-4 rounded-sm" />
									) : (
										<Checkbox
											checked={mode.effective.has(key)}
											disabled={!canWrite}
											aria-label={`${mode.userName}: ${view.label} — ${item.label}`}
											onCheckedChange={(value) => mode.onToggle(view.domain, item.action, value === true)}
										/>
									)}
								</div>
							</TableCell>
						</TableRow>
					)
				})}
			</TableBody>
		</Table>
	)
}

export function PermissionsAccordion({ mode, canWrite }: PermissionsAccordionProps) {
	return (
		<StackedAccordion type="multiple" className="min-w-0">
			{PERMISSION_VIEWS.map((view) => {
				const changed =
					mode.kind === 'user' &&
					view.actions.some((item) => mode.overridden.has(permissionKey(view.domain, item.action)))
				return (
					<StackedAccordionItem key={view.domain} value={view.domain} className="border-border/80 bg-card">
						<StackedAccordionTrigger className="gap-3 px-4 py-3 text-base hover:bg-muted/40 data-[state=open]:bg-muted/40">
							<span className="min-w-0 flex-1 text-left">
								<span className="flex flex-wrap items-center gap-1.5 font-medium">
									{view.label}
									{changed ? <ChangedBadge /> : null}
								</span>
								<span className="block text-xs font-normal text-muted-foreground">{view.description}</span>
							</span>
						</StackedAccordionTrigger>
						<StackedAccordionContent className="px-0 pb-0">
							{mode.kind === 'roles' ? (
								<RolesTable view={view} mode={mode} canWrite={canWrite} />
							) : (
								<UserTable view={view} mode={mode} canWrite={canWrite} />
							)}
						</StackedAccordionContent>
					</StackedAccordionItem>
				)
			})}
		</StackedAccordion>
	)
}

export function PermissionsSkeleton() {
	return (
		<div className="divide-y divide-border/80 rounded-lg border border-border/80 bg-card" aria-hidden="true">
			{PERMISSION_VIEWS.map((view) => (
				<div key={view.domain} className="flex items-center justify-between gap-4 px-4 py-3">
					<div className="min-w-0 space-y-1.5">
						<Skeleton className="h-4 w-32" />
						<Skeleton className="h-3 w-48 max-w-full" />
					</div>
					<Skeleton className="size-4 shrink-0 rounded-sm" />
				</div>
			))}
		</div>
	)
}
