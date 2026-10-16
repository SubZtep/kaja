import { toast } from "react-toastify"
import { useAuthClient } from "../../../hooks/auth-client"
import type { Captcha } from "../../../hooks/turnstile"
import { authErrorMessage } from "../../../lib/error-messages"
import { getLocale } from "../../../paraglide/runtime.js"

/** Emails a sign-in code (Turnstile-gated); true once it's on its way. A new address gets it in the page's language. */
export function useSendCode(captcha: Captcha) {
  const authClient = useAuthClient()
  return async (email: string) => {
    const captchaOptions = await captcha.fetchOptions()
    const { error } = await authClient.emailOtp.sendVerificationOtp({
      email,
      type: "sign-in",
      fetchOptions: { headers: { ...captchaOptions?.headers, "Accept-Language": getLocale() } }
    })
    if (error) toast.error(authErrorMessage(error))
    return !error
  }
}
