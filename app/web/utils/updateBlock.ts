import { Block } from '@/types/blocks'

export function updateBlock<T extends Block['type']>(
	blocks: Block[],
	index: number,
	type: T,
	patch: Partial<Extract<Block, { type: T }>>
): Block[] {
	return blocks.map((b, i) => (i === index ? ({ ...b, ...patch } as Extract<Block, { type: T }>) : b))
}
