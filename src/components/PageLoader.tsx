export function PageLoader() {
	return (
		<div className="flex h-[50vh] flex-col justify-center items-center w-full">
			<div className="relative flex h-16 w-16">
				<span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand-400 opacity-75" />
				<span className="relative inline-flex rounded-full h-16 w-16 bg-brand-500 opacity-20" />
			</div>
		</div>
	);
}
