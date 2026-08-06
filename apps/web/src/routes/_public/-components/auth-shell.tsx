import type { ReactNode } from "react"

/** Centers form pages under the shared public Header/Footer shell. */
export function AuthShell({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <main className="relative flex flex-1 flex-col items-center justify-center overflow-hidden px-4 py-10 sm:px-6 sm:py-16">
      <div
        className="pointer-events-none absolute -top-45 left-1/2 h-125 w-225 -translate-x-1/2"
        style={{
          background:
            "radial-gradient(closest-side,color-mix(in srgb, var(--color-neon) 16%, transparent),transparent 70%)"
        }}
      />
      <div className="relative w-full max-w-md">{children}</div>
    </main>
  )
}
