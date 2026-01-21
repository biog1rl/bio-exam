/**
 * Безопасные операции с путями.
 *
 * resolveSafe — резолвит относительный путь внутри base и запрещает выход наружу.
 * isAllowedFile — проверка допустимых расширений контента (md/mdx).
 */
import path from 'path'

/**
 * Резолвит путь и проверяет, что он остаётся внутри base.
 * @throws Error если попытка выйти за пределы base.
 */
export const resolveSafe = (base: string, p: string) => {
	const abs = path.resolve(base, p)
	if (!abs.startsWith(path.resolve(base))) throw new Error('Path outside DOCS_ROOT')
	return abs
}

/** Разрешены только .md и .mdx файлы. */
export const isAllowedFile = (name: string) => /\.(md|mdx)$/i.test(name)
