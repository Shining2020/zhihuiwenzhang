export default function Header() {
  return (
    <header className="border-b border-border bg-card">
      <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-accent flex items-center justify-center">
            <span className="text-accent-foreground font-bold text-lg">✨</span>
          </div>
          <h1 className="text-xl font-bold text-primary hidden sm:block">知乎长文生成</h1>
        </div>

        <nav className="flex gap-6 text-sm">
          <a href="#" className="text-foreground hover:text-accent transition">
            关于
          </a>
          <a href="#" className="text-foreground hover:text-accent transition">
            帮助
          </a>
        </nav>
      </div>
    </header>
  )
}
