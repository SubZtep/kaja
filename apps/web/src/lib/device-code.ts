import { redirect } from "@tanstack/react-router"
import { createServerFn } from "@tanstack/react-start"
import { deleteCookie, getCookie, setCookie } from "@tanstack/react-start/server"

const DEVICE_CODE_COOKIE = "kaja_device_code"

/** Stashes the device user_code in a short-lived cookie, then redirects to /device/approve without it in the URL. */
export const stashDeviceCodeAndRedirect = createServerFn({ method: "GET" })
  .inputValidator((userCode: string) => userCode)
  .handler(({ data: userCode }) => {
    setCookie(DEVICE_CODE_COOKIE, userCode, {
      httpOnly: true,
      sameSite: "lax",
      maxAge: 1800, // matches the device code's own expiry
      path: "/"
    })
    throw redirect({ to: "/device/approve" })
  })

export const getStashedDeviceCode = createServerFn({ method: "GET" }).handler(() => {
  return getCookie(DEVICE_CODE_COOKIE) ?? null
})

export const clearStashedDeviceCode = createServerFn({ method: "POST" }).handler(() => {
  deleteCookie(DEVICE_CODE_COOKIE, { path: "/" })
})
