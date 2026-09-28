import { getTimeAgo } from "@kaja/shared/date"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useLoaderData } from "@tanstack/react-router"
import { toast } from "react-toastify"
import { useAuthClient } from "../../hooks/auth-client"
import { describeUserAgent } from "../../lib/device"
import { m } from "../../paraglide/messages.js"
import { getLocale } from "../../paraglide/runtime.js"
import { ConfirmDialog } from "../ui/ConfirmDialog"
import { ErrorNotice } from "../ui/ErrorNotice"
import { Loader } from "../ui/Loader"

const SESSIONS_QUERY_KEY = ["auth", "sessions"]

/** Every place the account is signed in (browsers and the terminal's device login), latest first; any but this one can be signed out. */
export function SignedInDevices() {
  const authClient = useAuthClient()
  const queryClient = useQueryClient()
  const currentId = useLoaderData({ from: "__root__" })?.session?.session.id
  const locale = getLocale()

  const sessions = useQuery({
    queryKey: SESSIONS_QUERY_KEY,
    queryFn: async () => {
      const { data, error } = await authClient.listSessions()
      if (error) throw new Error(error.message || m.devices_error())
      return [...data].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    }
  })

  const revoke = useMutation({
    mutationFn: async (token: string) => {
      const { error } = await authClient.revokeSession({ token })
      if (error) throw new Error(error.message || m.devices_revoke_error())
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: SESSIONS_QUERY_KEY })
      toast.success(m.devices_revoked())
    },
    onError: (err: Error) => toast.error(err.message)
  })

  const revokeOthers = useMutation({
    mutationFn: async () => {
      const { error } = await authClient.revokeOtherSessions()
      if (error) throw new Error(error.message || m.devices_revoke_error())
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: SESSIONS_QUERY_KEY })
      toast.success(m.devices_revoked_others())
    },
    onError: (err: Error) => toast.error(err.message)
  })

  if (sessions.isLoading) return <Loader slim />
  if (sessions.error) return <ErrorNotice error={sessions.error} />

  const others = (sessions.data ?? []).filter(session => session.id !== currentId).length

  return (
    <>
      <ul className="m-0 grid list-none gap-3 p-0">
        {(sessions.data ?? []).map(session => {
          const device = describeUserAgent(session.userAgent)
          const current = session.id === currentId
          return (
            <li
              key={session.id}
              className="flex items-start gap-3 border-border border-t border-dashed pt-3 first:border-t-0 first:pt-0"
            >
              <device.icon className="mt-0.5 size-5 shrink-0 text-muted" aria-hidden />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-fg text-sm">{device.label}</span>
                  {current && (
                    <span
                      className="sticker sticker-neon text-[9px]"
                      style={{ "--sticker-rot": "-3deg" } as React.CSSProperties}
                    >
                      {m.devices_this_device()}
                    </span>
                  )}
                </div>
                <p className="m-0 font-mono text-muted text-xs">
                  {m.devices_active({ ago: getTimeAgo(new Date(session.updatedAt), new Date(), locale) })}
                  {" · "}
                  {m.devices_since({ ago: getTimeAgo(new Date(session.createdAt), new Date(), locale) })}
                  {session.ipAddress ? ` · ${session.ipAddress}` : ""}
                </p>
              </div>
              {!current && (
                <button
                  type="button"
                  className="shrink-0 cursor-pointer text-muted text-xs underline-offset-2 hover:text-fg hover:underline"
                  disabled={revoke.isPending}
                  onClick={() => revoke.mutate(session.token)}
                >
                  {m.devices_sign_out()}
                </button>
              )}
            </li>
          )
        })}
      </ul>
      {others > 0 && (
        <ConfirmDialog
          title={m.devices_revoke_others_confirm_title()}
          description={m.devices_revoke_others_confirm_description({ count: others })}
          confirm={m.devices_revoke_others()}
          onConfirm={() => revokeOthers.mutate()}
        >
          <button
            type="button"
            disabled={revokeOthers.isPending}
            className="mt-4 cursor-pointer text-muted text-xs underline-offset-2 hover:text-fg hover:underline"
          >
            {m.devices_revoke_others()}
          </button>
        </ConfirmDialog>
      )}
    </>
  )
}
