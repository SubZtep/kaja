import { Select } from "@base-ui/react/select"
import { cn, LOCALE_LABELS } from "@kaja/shared"
import { ArrowBigDown, ChevronsUpDown, Languages } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { toast, Zoom } from "react-toastify"
import { m } from "../../paraglide/messages.js"
import { extractLocaleFromCookie, getLocale, type Locale, locales, setLocale } from "../../paraglide/runtime.js"

/** Capture the cookie state before any hydration-triggered locale resolution can write it. */
const hadLocaleCookieBeforeHydration = Boolean(extractLocaleFromCookie())

export function LanguageSelect({ className }: Readonly<{ className?: string }> = {}) {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)

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
          triggerRef.current?.scrollIntoView({ behavior: "smooth", block: "center" })
          triggerRef.current?.focus()
          setOpen(true)
        }
      })
  }, [])

  return (
    <Select.Root
      items={locales.map(locale => ({ label: LOCALE_LABELS[locale], value: locale }))}
      value={getLocale()}
      onValueChange={value => setLocale(value as Locale)}
      open={open}
      onOpenChange={setOpen}
    >
      <Select.Trigger
        ref={triggerRef}
        aria-label={`${m.language_select_label()}: ${LOCALE_LABELS[getLocale()]}`}
        className={cn(
          "inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-border bg-surface px-2.5 py-1.5 font-mono text-muted text-xs hover:text-fg",
          className
        )}
      >
        <Languages size={14} />
        <Select.Value />
        <Select.Icon>
          <ChevronsUpDown size={12} />
        </Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Positioner className="z-20 outline-none select-none" sideOffset={4}>
          <Select.Popup className="min-w-(--anchor-width) rounded-md border border-border bg-surface py-1 text-fg text-sm shadow-lg outline-none transition-all duration-150 data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0">
            {locales.map(locale => (
              <Select.Item
                key={locale}
                value={locale}
                className="cursor-pointer px-3 py-1.5 outline-none data-highlighted:bg-surface-2"
              >
                <Select.ItemText>
                  {LOCALE_LABELS[locale]} — {locale}
                </Select.ItemText>
              </Select.Item>
            ))}
          </Select.Popup>
        </Select.Positioner>
      </Select.Portal>
    </Select.Root>
  )
}
