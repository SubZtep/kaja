import type { PartialMessage as PartialMessageData } from "../../hooks/use-agent"
import Markdown from "./markdown"
import { ReasoningBox } from "./reasoning-box"

/**
 * The in-flight streaming message: reasoning (if shown) plus content, both as markdown. Rendering is block by block and
 * cached, so each update only re-renders the last block; a half-typed marker (`**bol`) shows as typed until it closes.
 */
export function PartialMessage({
  partial,
  thinking
}: Readonly<{ partial: PartialMessageData | null; thinking: boolean }>) {
  if (!partial) return null
  return (
    <>
      {thinking && partial.reasoning !== "" && <ReasoningBox>{partial.reasoning}</ReasoningBox>}
      {partial.content !== "" && <Markdown>{partial.content}</Markdown>}
    </>
  )
}
