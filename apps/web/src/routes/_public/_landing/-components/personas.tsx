const PERSONAS = [
  { id: "default", label: "Helpful assistant", when: "no other persona clearly fits the conversation" },
  { id: "barkochba", label: "Barkochba guesser", when: "the user wants to play a guessing game / twenty questions" },
  {
    id: "care",
    label: "Self-care companion",
    when: "the user talks about their day, feelings, mood, or personal struggles"
  },
  {
    id: "onboarding",
    label: "Onboarding assistant",
    when: "a new user should be walked through the initial getting-to-know-you questions"
  }
]

export function Personas() {
  return (
    <section>
      <div className="mx-auto max-w-280 px-6 py-18">
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="m-0 font-bold text-fg text-[26px]">Personas</h2>
          <span className="font-mono text-[#6e7681] text-xs">~/.config/kaja/personas/*.toml</span>
        </div>
        <p className="mb-7 max-w-160 text-[14.5px] text-muted">
          Each persona is a <code className="rounded bg-surface px-1.5 py-0.5 font-mono text-muted">.toml</code> file: a
          label, its system-prompt instructions, and an optional{" "}
          <code className="rounded bg-surface px-1.5 py-0.5 font-mono text-muted">when</code> clause. Kaja reads the
          room and switches personas mid-conversation on its own &mdash; no command needed.
        </p>
        <div className="grid grid-cols-2 gap-4">
          {PERSONAS.map(p => (
            <div key={p.id} className="rounded-xl border border-border bg-surface px-5.5 py-5">
              <div className="mb-2.5 flex items-center justify-between">
                <div className="font-semibold text-fg text-[15px]">{p.label}</div>
                <span className="font-mono text-[#6e7681] text-[11px]">{p.id}.toml</span>
              </div>
              <div className="rounded-md border border-border bg-surface-2 px-3 py-2.5 font-mono text-[12.5px] text-muted leading-relaxed">
                when = <span className="text-neon-hi">"{p.when}"</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
