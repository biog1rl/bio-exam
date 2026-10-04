import type { MemoryStorageAdapter } from '../services/storage/adapters/memory.js'

export async function memoryStorage(): Promise<MemoryStorageAdapter> {
	const module = await import('../services/storage/adapters/memory.js')
	return module.memoryStorage
}
