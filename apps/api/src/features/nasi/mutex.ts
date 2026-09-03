import { withLock } from "../../core/lock"

export async function withUserLock<T>(userId: string, fn: () => Promise<T>): Promise<T> {
  return withLock(userId, fn)
}
