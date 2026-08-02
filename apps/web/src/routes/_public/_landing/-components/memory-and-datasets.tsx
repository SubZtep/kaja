export function MemoryAndDatasets() {
  return (
    <section className="border-border border-y bg-surface-2">
      <div className="mx-auto max-w-280 px-6 py-18">
        <h2 className="mb-2 font-bold text-fg text-[26px]">Memory &amp; datasets</h2>
        <p className="mb-7 max-w-160 text-[14.5px] text-muted">
          Two ways Kaja carries context across a conversation &mdash; and across sessions.
        </p>
        <div className="grid grid-cols-2 gap-4">
          <div className="rounded-xl border border-border bg-surface p-5.5">
            <div className="mb-2 font-semibold text-fg text-[15px]">Persistent memory</div>
            <p className="text-[13.5px] text-muted">
              Kaja remembers durable facts about you or your project across sessions, and quietly recalls them later.
              The important ones are marked sticky, so they ride along in every conversation without you having to
              repeat yourself.
            </p>
          </div>
          <div className="rounded-xl border border-border bg-surface p-5.5">
            <div className="mb-2 font-semibold text-fg text-[15px]">Dataset collection</div>
            <p className="text-[13.5px] text-muted">
              Some personas gently gather a set of facts over the course of a conversation &mdash; the onboarding
              assistant, for example, gets to know a new user one question at a time.
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}
