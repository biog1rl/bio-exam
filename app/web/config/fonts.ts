import { Fira_Code as FontMono, Lora as FontSerif, Nunito_Sans as FontSans } from 'next/font/google'

export const fontSans = FontSans({
	subsets: ['latin', 'cyrillic'],
	variable: '--font-sans',
})

export const fontSerif = FontSerif({
	subsets: ['latin', 'cyrillic'],
	variable: '--font-serif',
})

export const fontMono = FontMono({
	subsets: ['latin'],
	variable: '--font-mono',
})
