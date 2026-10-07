import type { PartialMessage as PartialMessageData } from "../../hooks/use-agent"
import { useKajaTheme } from "../theme"
import { Said } from "../timeline"
import { ReasoningBox } from "./reasoning-box"

/**
 * The in-flight streaming message: reasoning (if shown) plus content, both as markdown. Rendering is block by block and
 * cached, so each update only re-renders the last block; a half-typed marker (`**bol`) shows as typed until it closes.
 */
export function PartialMessage({
  partial,
  thinking
}: Readonly<{ partial: PartialMessageData | null; thinking: boolean }>) {
  const { accent } = useKajaTheme()
  if (!partial) return null
  // The content after a "●", like the timeline's finished message, so it doesn't shift when it lands there
  return (
    <>
      {thinking && partial.reasoning !== "" && <ReasoningBox>{partial.reasoning}</ReasoningBox>}
      {partial.content !== "" && <Said dot={accent()}>{partial.content}</Said>}
    </>
  )
}
