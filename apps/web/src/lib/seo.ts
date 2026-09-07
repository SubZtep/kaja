import { getPageTitle } from "./vars"

export function seo({ title, description }: { title?: string; description?: string }) {
  const resolvedTitle = getPageTitle(title)
  return [
    { title: resolvedTitle },
    ...(description ? [{ name: "description", content: description }] : []),
    { property: "og:title", content: resolvedTitle },
    ...(description ? [{ property: "og:description", content: description }] : []),
    { name: "twitter:title", content: resolvedTitle },
    ...(description ? [{ name: "twitter:description", content: description }] : [])
  ]
}
