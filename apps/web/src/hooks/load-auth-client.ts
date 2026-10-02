/** The Better Auth client, downloaded on first use: the landing page only needs it on a click, so it stays out of the first load. */
export const loadAuthClient = (apiUrl: string) => import("./auth-client").then(mod => mod.getAuthClient(apiUrl))
