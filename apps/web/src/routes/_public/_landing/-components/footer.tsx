import { Link } from "@tanstack/react-router"

export function Footer() {
  return (
    <section className="border-t border-[#21262d]">
      <div className="max-w-280 mx-auto px-6 py-14 flex items-center justify-between flex-wrap gap-4">
        <div>
          <div className="font-mono text-[15px] font-semibold text-[#e6edf3] mb-1">&gt; kaja</div>
          <div className="text-[13px] text-[#6e7681]">
            MIT License &middot; built with Bun + TypeScript &middot; Sign{" "}
            <Link to="/signin" className="text-[#c9d1d9bb]">
              In
            </Link>
            /
            <Link to="/signup" className="text-[#c9d1d9bb]">
              Up
            </Link>{" "}
            &middot; by{" "}
            <a href="https://x.com/SubZtep" target="_blank" rel="noopener" className="text-[#c9d1d9cc]">
              SubZtep
            </a>{" "}
            &middot; {new Date().getFullYear()}
          </div>
        </div>
        <a
          href="https://github.com/SubZtep/kaja/stargazers"
          target="_blank"
          rel="noopener"
          className="inline-flex items-center gap-1.5 bg-[#161b22] border border-[#30363d] text-[#e6edf3] text-[13px] px-4 py-2 rounded-md"
        >
          ★ Star on GitHub
        </a>
      </div>
    </section>
  )
}
