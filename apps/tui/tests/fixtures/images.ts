/** A real 1×1 PNG's base64: normalising leaves it as it is. */
export const TINY_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGM4YSMHAALyASNM6jO1AAAAAElFTkSuQmCC"

/** The same as bytes. */
export const TINY_PNG = Buffer.from(TINY_PNG_BASE64, "base64")

/** A real PNG of `width`×`height`, stretched from {@link TINY_PNG}. */
export const png = (width: number, height: number) => new Bun.Image(TINY_PNG).resize(width, height).png().bytes()
