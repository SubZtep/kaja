/**
 * Whether a `mutateAsync` succeeded; its `onError` already told the user, so a failure isn't left as an unhandled
 * rejection (Sentry noise).
 */
export const succeeded = (promise: Promise<unknown>): Promise<boolean> =>
  promise.then(
    () => true,
    () => false
  )
