import { redirect } from 'next/navigation'

export default function Home() {
	redirect('/dashboard')

	return (
		<div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
			{/* Left Column - Main Content */}
			<div className="space-y-6 lg:col-span-2">
				{/* Top Row - Upcoming Tests and Performance */}
				<div className="grid grid-cols-1 gap-6 md:grid-cols-2"></div>
			</div>

			{/* Right Column - Sidebar Content */}
			<div className="space-y-6"></div>
		</div>
	)
}
