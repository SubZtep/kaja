import { Box, type DOMElement, Text, useWindowSize } from "ink"
import {
  type ComponentType,
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useRef,
  useState
} from "react"
import { useClick } from "../../hooks/use-click"
import { InputBlockedContext } from "../../hooks/use-input-blocked"
import { useKey } from "../../hooks/use-key"
import { t } from "../../lib/i18n"
import { mix, paint, useKajaTheme, usePalette } from "../theme"

type ModalState = { open: boolean; register: () => () => void }

const ModalContext = createContext<ModalState>({ open: false, register: () => () => {} })

// How far the background's text fades toward its background colour while a modal is open
const PALE = 0.6

// An emoji (flags and keycaps included): terminals draw some in one cell where Ink counts two, which would shift the rest of
// its row, and the modal over it, a cell sideways
const EMOJI =
  /\p{Extended_Pictographic}[\p{Emoji_Modifier}\u{FE0F}\u{200D}\p{Extended_Pictographic}]*|\p{Regional_Indicator}{2}|[#*0-9]\u{FE0F}?\u{20E3}/gu

/** A line of the screen behind a modal: one pale colour, its emoji blanked out to spaces of the width Ink gave them. */
export function paleLine(line: string, pale: (text: string) => string) {
  return pale(Bun.stripANSI(line).replace(EMOJI, emoji => " ".repeat(Bun.stringWidth(emoji))))
}

// Box has no way to take a text transform, but Ink applies an `ink-box`'s transform to every text under it
type TransformBoxProps = {
  style: Record<string, unknown>
  internal_transform?: (line: string) => string
  children?: ReactNode
}
const TransformBox = "ink-box" as unknown as ComponentType<TransformBoxProps>

/**
 * Above the chat: while a {@link Modal} is mounted below it, `children` (the rest of the screen) stops taking keys and
 * clicks (see `useKey`) and {@link Backdrop} paints it pale. Without a host a modal still shows, but blocks nothing.
 */
export function ModalHost({ children }: Readonly<{ children: ReactNode }>) {
  const [count, setCount] = useState(0)
  const register = useCallback(() => {
    setCount(n => n + 1)
    return () => setCount(n => n - 1)
  }, [])
  const open = count > 0
  const value = useMemo(() => ({ open, register }), [open, register])
  return (
    <ModalContext value={value}>
      <InputBlockedContext value={open}>{children}</InputBlockedContext>
    </ModalContext>
  )
}

/** Wraps the screen a {@link Modal} covers; while one is open its text is repainted in a single pale colour. */
export function Backdrop({ children }: Readonly<{ children: ReactNode }>) {
  const { open } = useContext(ModalContext)
  const { foreground, background } = usePalette()
  const pale = paint(mix(background, foreground, 1 - PALE))
  return (
    <TransformBox
      style={{ flexDirection: "column", flexGrow: 1, flexShrink: 1 }}
      internal_transform={open ? line => paleLine(line, pale) : undefined}
    >
      {children}
    </TransformBox>
  )
}

function ModalFrame({
  title,
  width,
  footer,
  onClose,
  children
}: Readonly<{ title: string; width: number; footer?: ReactNode; onClose: () => void; children: ReactNode }>) {
  const { columns } = useWindowSize()
  const { modal, accent, keyCap } = useKajaTheme()
  const closeRef = useRef<DOMElement>(null)
  useKey((_input, key) => {
    if (key.escape) onClose()
  })
  useClick(closeRef, onClose)

  return (
    <Box position="absolute" width="100%" height="100%" alignItems="center" justifyContent="center">
      <Box
        {...modal()}
        borderStyle="round"
        flexDirection="column"
        paddingX={2}
        paddingY={1}
        gap={1}
        width={Math.min(width, columns)}
      >
        <Text bold {...accent()}>
          {title}
        </Text>
        <Box flexDirection="column">{children}</Box>
        <Box gap={3}>
          <Box ref={closeRef} columnGap={1}>
            <Text {...keyCap()}>Esc</Text>
            <Text>{t("keybar.close")}</Text>
          </Box>
          {footer}
        </Box>
      </Box>
    </Box>
  )
}

/**
 * A window centred over the screen. It owns the keys and the mouse while mounted (the rest of the screen, wrapped in
 * {@link Backdrop}, is inert and pale) and Esc, or a click on "Close", calls `onClose`; mount it only while it is open.
 * Anything inside may use `useKey` as usual, e.g. a menu.
 */
export function Modal({
  title,
  width = 64,
  footer,
  onClose,
  children
}: Readonly<{
  title: string
  /** Outer width in columns, less on a narrower terminal. */
  width?: number
  /** Extra hints beside "Esc Close". */
  footer?: ReactNode
  onClose: () => void
  children: ReactNode
}>) {
  const { register } = useContext(ModalContext)
  // Before paint, so the screen never shows the modal over a background that still takes keys
  useLayoutEffect(() => register(), [register])
  return (
    <InputBlockedContext value={false}>
      <ModalFrame title={title} width={width} footer={footer} onClose={onClose}>
        {children}
      </ModalFrame>
    </InputBlockedContext>
  )
}
