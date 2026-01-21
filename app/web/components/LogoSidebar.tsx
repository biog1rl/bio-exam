const LogoSidebar = ({ className }: { className?: string }) => {
	return (
		<svg
			className={className}
			width="92"
			height="92"
			viewBox="0 0 92 92"
			fill="none"
			xmlns="http://www.w3.org/2000/svg"
		>
			<path
				d="M0 61.3333C0 41.4429 0 31.4977 3.45818 23.7305C7.47867 14.7004 14.7004 7.47867 23.7305 3.45818C31.4977 0 41.4429 0 61.3333 0C71.2785 0 76.2511 0 80.1347 1.72909C84.6498 3.73934 88.2607 7.35018 90.2709 11.8653C92 15.7489 92 20.7215 92 30.6667C92 50.5571 92 60.5023 88.5418 68.2695C84.5213 77.2996 77.2996 84.5213 68.2695 88.5418C60.5023 92 50.5571 92 30.6667 92C20.7215 92 15.7489 92 11.8653 90.2709C7.35018 88.2607 3.73934 84.6498 1.72909 80.1347C0 76.2511 0 71.2785 0 61.3333Z"
				fill="currentColor"
				className="dark:fill-sidebar-accent fill-black transition-colors hover:fill-black/50"
			/>
			<path
				d="M20 26H72V32.4948H20V26Z"
				fill="currentColor"
				className="dark:fill-sidebar-foreground pointer-events-none fill-white"
			/>
			<path
				d="M20 67H28.6675L45.99 43.9197L63.3125 67H71.98L50.2859 38.196L41.694 38.1959L20 67Z"
				fill="currentColor"
				className="dark:fill-sidebar-foreground pointer-events-none fill-white"
			/>
		</svg>
	)
}

export default LogoSidebar
