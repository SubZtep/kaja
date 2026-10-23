import { createContext, useContext } from "react"

/** True under a {@link ModalHost} while a modal is open: everything outside the modal must ignore keys and the mouse. */
export const InputBlockedContext = createContext(false)

export const useInputBlocked = () => useContext(InputBlockedContext)
