import { LOCALE_LABELS } from "@kaja/shared/locale"
import { useMatch } from "@tanstack/react-router"
import { ArrowBigDown, ChevronsUpDown, Languages } from "lucide-react"
import { useEffect, useRef } from "react"
import { toast, Zoom } from "react-toastify"
import { cn } from "../../lib/cn"
import { loadAuthClient } from "../../lib/load-auth-client"
import { m } from "../../paraglide/messages.js"
import { extractLocaleFromCookie, getLocale, type Locale, locales, setLocale } from "../../paraglide/runtime.js"

/** Capture the cookie state before any hydration-triggered locale resolution can write it. */
const hadLocaleCookieBeforeHydration = Boolean(extractLocaleFromCookie())

/**
 * SetLocale reloads the page, so a pick's outcome waits here and is toasted, in the new language, once the page is
 * back.
 */
const PICKED_KEY = "language-select-picked"
type Picked = "saved" | "switched"

function rememberPick(picked: Picked) {
  try {
    sessionStorage.setItem(PICKED_KEY, picked)
  } catch {
    // sessionStorage can be blocked
  }
}

function takePick(): Picked | null {
  try {
    const picked = sessionStorage.getItem(PICKED_KEY) as Picked | null
    sessionStorage.removeItem(PICKED_KEY)
    return picked
  } catch {
    return null
  }
}

export function LanguageSelect({ className }: Readonly<{ className?: string }> = {}) {
  const selectRef = useRef<HTMLSelectElement>(null)
  const rootData = useMatch({ from: "__root__", shouldThrow: false })?.loaderData
  const signedIn = Boolean(rootData?.session)

  // A signed-in pick is saved first: LocaleSync switches the page back to the saved language after the reload.
  async function pick(locale: Locale) {
    if (signedIn) {
      // A network failure (offline) throws rather than coming back as `error`.
      const saved = await loadAuthClient(rootData?.apiUrl ?? "")
        .then(authClient => authClient.updateUser({ locale }))
        .then(({ error }) => !error)
        .catch(() => false)
      if (!saved) {
        toast.error(m.language_select_save_error())
        return
      }
    }
    rememberPick(signedIn ? "saved" : "switched")
    setLocale(locale)
  }

  useEffect(() => {
    const picked = takePick()
    if (picked) {
      const message = picked === "saved" ? m.language_select_saved() : m.language_select_switched()
      toast.success(message, { toastId: "language-select-picked" })
    }
  }, [])

  useEffect(() => {
    if (!hadLocaleCookieBeforeHydration)
      toast.info(m.language_select_toast_hint(), {
        ariaLabel: m.language_select_toast_hint(),
        autoClose: 10_000,
        closeButton: false,
        closeOnClick: true,
        hideProgressBar: true,
        icon: <ArrowBigDown strokeWidth={3} color="green" className="animate-bounce" />,
        pauseOnHover: false,
        position: "bottom-left",
        theme: "dark",
        toastId: "language-select-hint",
        transition: Zoom,
        onClick: () => {
          const select = selectRef.current
          select?.scrollIntoView({ behavior: "smooth", block: "center" })
          select?.focus()
          try {
            select?.showPicker()
          } catch {
            // showPicker is missing in older browsers, focus is enough there
          }
        }
      })
  }, [])

  // Native, so phones get the OS picker and the box is always as wide as its longest option
  return (
    <span
      className={cn(
        "border-border bg-surface text-muted focus-within:text-fg hover:text-fg relative inline-flex items-center rounded-md border font-mono text-xs",
        className
      )}
    >
      <Languages size={14} aria-hidden className="pointer-events-none absolute left-2.5" />
      <select
        ref={selectRef}
        aria-label={m.language_select_label()}
        value={getLocale()}
        onChange={event => void pick(event.target.value as Locale)}
        className="cursor-pointer appearance-none bg-transparent py-1.5 pr-7 pl-7 text-inherit outline-none"
      >
        {locales.map(locale => (
          <option key={locale} value={locale} lang={locale} className="bg-surface text-fg">
            {LOCALE_LABELS[locale]}
          </option>
        ))}
      </select>
      <ChevronsUpDown size={12} aria-hidden className="pointer-events-none absolute right-2.5" />
    </span>
  )
}
