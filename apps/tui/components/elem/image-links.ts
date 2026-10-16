import { createContext, useContext } from "react"

/** Where a reply's `kaja-image:` link is drawn from (the local session's stored file); undefined when it can't be placed. */
export const ImageLinkContext = createContext<(ref: string) => string | undefined>(() => undefined)

export const useImageLink = () => useContext(ImageLinkContext)
