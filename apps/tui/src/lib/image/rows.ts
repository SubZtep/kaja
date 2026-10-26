/** The timeline with image `ref`'s rows showing its description (it's written after the image is shown). */
export function withDescription<T extends { type: string; ref?: string }>(
  events: T[],
  ref: string,
  description: string
): T[] {
  return events.map(event => (event.type === "tool_image" && event.ref === ref ? { ...event, description } : event))
}
