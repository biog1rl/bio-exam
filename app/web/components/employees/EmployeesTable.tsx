'use client'

import { useCallback, useMemo, useState } from 'react'

import { Search } from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'

import { useAuth } from '@/components/providers/AuthProvider'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { highlightText } from '@/lib/search/highlight'
import type { UserRow } from '@/types/users'

import { Button } from '../ui/button'

type Props = {
	rows: UserRow[]
	isLoading: boolean
}

export function EmployeesTable({ rows, isLoading }: Props) {
	const { can } = useAuth()
	const isAdmin = can('rbac', 'write')
	const [searchQuery, setSearchQuery] = useState('')

	const formatBirthdate = useCallback(
		(birthdate: string | null) => {
			if (!birthdate) return null
			const date = new Date(birthdate)
			const day = String(date.getDate()).padStart(2, '0')
			const month = String(date.getMonth() + 1).padStart(2, '0')
			const year = date.getFullYear()

			return isAdmin ? `${day}.${month}.${year}` : `${day}.${month}`
		},
		[isAdmin]
	)

	const formatTelegram = (telegram: string | null) => {
		if (!telegram) return '—'
		const username = telegram.startsWith('@') ? telegram.slice(1) : telegram
		return { username, link: `https://t.me/${username}` }
	}

	// Фильтрация сотрудников по поисковому запросу
	const filteredRows = useMemo(() => {
		if (!searchQuery.trim()) return rows

		const query = searchQuery.toLowerCase().trim()
		return rows.filter((employee) => {
			const login = (employee.login ?? '').toLowerCase()
			const firstName = (employee.firstName ?? '').toLowerCase()
			const lastName = (employee.lastName ?? '').toLowerCase()
			const fullName = `${firstName} ${lastName}`.trim()

			return login.includes(query) || fullName.includes(query) || firstName.includes(query) || lastName.includes(query)
		})
	}, [rows, searchQuery])

	const body = useMemo(() => {
		if (isLoading) {
			return Array.from({ length: 5 }).map((_, i) => (
				<TableRow key={`sk-${i}`} className="h-14">
					<TableCell>
						<Skeleton className="h-10 w-10 rounded-full" />
					</TableCell>
					<TableCell>
						<Skeleton className="h-4 w-[70%]" />
					</TableCell>
					<TableCell>
						<Skeleton className="h-4 w-[70%]" />
					</TableCell>
					<TableCell>
						<Skeleton className="h-4 w-[60%]" />
					</TableCell>
					<TableCell>
						<Skeleton className="h-4 w-[50%]" />
					</TableCell>
					<TableCell>
						<Skeleton className="h-4 w-[60%]" />
					</TableCell>
					<TableCell>
						<Skeleton className="h-4 w-[70%]" />
					</TableCell>
					<TableCell>
						<Skeleton className="h-4 w-[70%]" />
					</TableCell>
				</TableRow>
			))
		}

		if (!filteredRows.length) {
			return (
				<TableRow>
					<TableCell colSpan={8} className="text-muted-foreground h-24 text-center">
						{searchQuery ? 'Сотрудники не найдены' : 'Нет сотрудников'}
					</TableCell>
				</TableRow>
			)
		}

		return filteredRows.map((employee) => {
			const telegramData = formatTelegram(employee.telegram)
			const firstName = employee.firstName || '—'
			const lastName = employee.lastName || '—'
			const position = employee.position || '—'

			const highlightedFirstName = searchQuery ? highlightText(firstName, searchQuery) : firstName
			const highlightedLastName = searchQuery ? highlightText(lastName, searchQuery) : lastName

			return (
				<TableRow key={employee.id}>
					<TableCell>
						{employee.avatar ? (
							<Image
								width={40}
								height={40}
								src={employee.avatar}
								alt={employee.name || employee.login}
								className="h-10 w-10 rounded-full"
								quality={100}
								loading="lazy"
							/>
						) : (
							<div
								className="flex h-10 w-10 items-center justify-center rounded-full text-sm font-medium text-white"
								style={{ backgroundColor: employee.avatarColor || '#94a3b8' }}
							>
								{employee.initials || employee.login.slice(0, 2).toUpperCase()}
							</div>
						)}
					</TableCell>
					<TableCell>
						<span dangerouslySetInnerHTML={{ __html: highlightedFirstName }} />
					</TableCell>
					<TableCell>
						<span dangerouslySetInnerHTML={{ __html: highlightedLastName }} />
					</TableCell>
					<TableCell>{position}</TableCell>
					<TableCell>{formatBirthdate(employee.birthdate) || '—'}</TableCell>
					<TableCell>
						{typeof telegramData === 'string' ? (
							telegramData
						) : (
							<Button asChild variant="link" className="p-0">
								<Link href={telegramData.link} target="_blank" rel="noopener noreferrer">
									@{telegramData.username}
								</Link>
							</Button>
						)}
					</TableCell>
					<TableCell>{employee.phone || '—'}</TableCell>
					<TableCell>{employee.email || '—'}</TableCell>
				</TableRow>
			)
		})
	}, [isLoading, filteredRows, searchQuery, formatBirthdate])

	return (
		<>
			<div className="mb-4">
				<div className="relative">
					<Search className="text-muted-foreground absolute left-3 top-1/2 size-4 -translate-y-1/2" />
					<Input
						type="text"
						placeholder="Поиск по логину, имени или фамилии..."
						value={searchQuery}
						onChange={(e) => setSearchQuery(e.target.value)}
						className="pl-9"
					/>
				</div>
			</div>

			<div className="overflow-hidden rounded-xl border">
				<div className="overflow-auto">
					<Table className="min-w-[1200px]">
						<TableHeader className="bg-muted/50">
							<TableRow>
								<TableHead className="w-[60px]">Аватар</TableHead>
								<TableHead className="w-[15%]">Имя</TableHead>
								<TableHead className="w-[15%]">Фамилия</TableHead>
								<TableHead className="w-[15%]">Должность</TableHead>
								<TableHead className="w-[10%]">Дата рождения</TableHead>
								<TableHead className="w-[12%]">Telegram</TableHead>
								<TableHead className="w-[12%]">Телефон</TableHead>
								<TableHead className="w-[15%]">Email</TableHead>
							</TableRow>
						</TableHeader>

						<TableBody>{body}</TableBody>
					</Table>
				</div>
			</div>
		</>
	)
}
