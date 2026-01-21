import { ComponentPropsWithoutRef, createElement, ElementType } from 'react'

import DOMPurify from 'isomorphic-dompurify'

type HtmlTextProps<C extends ElementType = 'span'> = {
	text: string
	as?: C
} & Omit<ComponentPropsWithoutRef<C>, 'children' | 'dangerouslySetInnerHTML'>

export default function HtmlText<C extends ElementType = 'span'>({ text, as, ...rest }: HtmlTextProps<C>) {
	const Component = (as || 'span') as ElementType
	const clean = DOMPurify.sanitize(text, {
		ALLOWED_TAGS: ['b', 'i', 'sup', 'sub', 'br', 'strong', 'em', 'span'],
	})

	return createElement(Component, {
		dangerouslySetInnerHTML: { __html: clean },
		...rest,
	})
}
