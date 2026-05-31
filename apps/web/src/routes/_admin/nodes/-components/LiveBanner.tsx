export function LiveBanner() {
  return (
    <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-neon/10 border border-neon/30">
      <div className="relative flex h-2 w-2">
        <div className="animate-ping absolute inline-flex h-full w-full rounded-full bg-neon opacity-75" />
        <div className="relative inline-flex rounded-full h-2 w-2 bg-neon" />
      </div>
      <div className="text-xs font-bold text-neon uppercase tracking-wider">Live</div>
    </div>
  )
}
