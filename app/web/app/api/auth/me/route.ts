import { NextResponse } from 'next/server'

import { getMeData } from '@/lib/auth/server/getMeData'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(): Promise<NextResponse> {
	try {
		const me = await getMeData()
		if (!me) return NextResponse.json({ ok: false })
		return NextResponse.json({ ok: true, user: me })
	} catch {
		return NextResponse.json({ ok: false }, { status: 500 })
	}
}
