import { Select } from "@base-ui/react/select"
import { ChevronsUpDown, Languages } from "lucide-react"
import { useEffect, useState } from "react"
import { m } from "../../paraglide/messages.js"
import { extractLocaleFromCookie, getLocale, type Locale, locales, setLocale } from "../../paraglide/runtime.js"

const LOCALE_LABELS: Record<Locale, string> = {
  "en-GB": "English",
  hu: "Magyar",
  "nan-TW": "臺語"
}

export function LanguageSelect() {
  const [hasChosenLocale, setHasChosenLocale] = useState(false)

  useEffect(() => {
    setHasChosenLocale(Boolean(extractLocaleFromCookie()))
  }, [])

  return (
    <Select.Root
      items={locales.map(locale => ({ label: LOCALE_LABELS[locale], value: locale }))}
      value={getLocale()}
      onValueChange={value => setLocale(value as Locale)}
    >
      <Select.Trigger
        aria-label={m.language_select_label()}
        title={hasChosenLocale ? LOCALE_LABELS[getLocale()] : undefined}
        className="flex items-center gap-1.5 rounded-md border border-border bg-surface px-2.5 py-1.5 font-mono text-muted text-xs hover:text-fg"
      >
        {hasChosenLocale && <Languages size={14} className="hidden md:block" />}
        <Select.Value className={hasChosenLocale ? "md:hidden" : undefined} />
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
                <Select.ItemText>{LOCALE_LABELS[locale]}</Select.ItemText>
              </Select.Item>
            ))}
          </Select.Popup>
        </Select.Positioner>
      </Select.Portal>
    </Select.Root>
  )
}
