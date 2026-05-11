import { createFileRoute, Link } from "@tanstack/react-router"
import { Logo } from "#/components/layout/Logo"
import { Menu } from "#/components/layout/Menu"
import { Section } from "#/components/ui/Section"

export const Route = createFileRoute("/_public/")({ component: App })

function App() {
  return (
    <Section className="m-4 max-w-md group flex flex-col gap-4 opacity-80 hover:opacity-100 transform-[perspective(900px)_rotateY(10deg)_rotateX(4deg)] hover:transform-none hover:shadow-purple-800/69 transition-[transform, opacity] duration-600 ease-[cubic-bezier(0.87,0,0.13,1)]">
      <Menu className="pb-2 opacity-60 hover:opacity-100 transition-opacity ease-in-out duration-150" />
      <h1 className="flex items-center gap-3 mb-0">
        <Logo />
        Hello, World!
      </h1>

      <p className="blur-xs">
        Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore
        magna aliqua.
      </p>

      <p>
        <span className="text-blue-500 mr-2 text-lg">🛈</span>
        <Link to="/signup" className="text-neon hover:text-neon-hi underline">
          Create
        </Link>{" "}
        an account, then install{" "}
        <a
          href="https://openclaw.ai/"
          target="_blank"
          rel="noreferrer"
          className="text-neon hover:text-neon-hi underline"
        >
          OpenClaw
        </a>{" "}
        and{" "}
        <a
          href="https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/installation/"
          target="_blank"
          rel="noreferrer"
          className="text-neon hover:text-neon-hi underline"
        >
          Cloudflare Tunnel
        </a>{" "}
        to get started.
      </p>

      <h2>Installation</h2>

      <ul>
        <li className="mb-3">
          Linux / macOS / Raspberry Pi (bash):{" "}
          <pre className="text-base! mt-1 cursor-text">curl -fsSL https://kaja.io/setup.sh | bash</pre>
        </li>
        <li>
          Windows (PowerShell): <pre className="text-base! mt-1 cursor-text">irm https://kaja.io/setup.ps1 | iex</pre>
        </li>
      </ul>

      <div className="flex justify-end text-sm gap-1 items-center text-gray-500">
        <div>© 2026</div>
        <div>•</div>
        <a
          href="https://docs.kaja.io/privacy"
          title="Privacy Policy"
          target="_blank"
          rel="noreferrer"
          className="text-gray-500 underline"
        >
          Privacy
        </a>
        <div className="scale-140 translate-y-0.5">&amp;</div>
        <a
          href="https://docs.kaja.io/terms"
          title="Terms of Service"
          target="_blank"
          rel="noreferrer"
          className="text-gray-500 underline"
        >
          Terms
        </a>
        <GitHub />
      </div>
    </Section>
  )
}

function GitHub() {
  return (
    <a
      href="https://github.com/SubZtep/kaja"
      target="_blank"
      rel="noreferrer"
      className="rounded-xl p-2 text-inherit transition hover:bg-surface"
      title="Go to GitHub project"
    >
      <span className="sr-only">Go to GitHub project</span>
      <svg viewBox="0 0 16 16" aria-hidden="true" width="32" height="32">
        <path
          fill="currentColor"
          d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.012 8.012 0 0 0 16 8c0-4.42-3.58-8-8-8z"
        />
      </svg>
    </a>
  )
}
