'use client'

import { useState } from 'react'

export function useProjectModal() {
	const [projectModal, setProjectModal] = useState<{
		open: boolean
		employeeId?: string
		dayStr?: string
		selectedProjectIds?: string[]
	}>({
		open: false,
	})

	const openProjectModal = (employeeId: string, dayStr: string, selectedProjectIds: string[] = []) => {
		setProjectModal({
			open: true,
			employeeId,
			dayStr,
			selectedProjectIds,
		})
	}

	const closeProjectModal = () => {
		setProjectModal({ open: false })
	}

	const handleProjectCreated = (newProjectId: string) => {
		// После создания проекта автоматически выбираем его
		setProjectModal((prev) => ({
			...prev,
			selectedProjectIds: [...(prev.selectedProjectIds || []), newProjectId],
		}))
	}

	return {
		projectModal,
		openProjectModal,
		closeProjectModal,
		handleProjectCreated,
	}
}
