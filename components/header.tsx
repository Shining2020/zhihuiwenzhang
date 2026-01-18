export default function Header() {
  return (
    <header className="border-b border-border bg-card sticky top-0 z-50">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between">
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-accent flex items-center justify-center shrink-0">
            <span className="text-accent-foreground font-bold text-base sm:text-lg">✨</span>
          </div>
          <h1 className="text-lg sm:text-xl font-bold text-primary hidden sm:block">知乎长文生成</h1>
        </div>

        <nav className="flex gap-3 sm:gap-6 text-xs sm:text-sm">
          <a href="#" className="text-foreground hover:text-accent transition whitespace-nowrap">
            关于
          </a>
          <a href="#" className="text-foreground hover:text-accent transition whitespace-nowrap">
            帮助
          </a>
        </nav>
      </div>
    </header>
  )
}
