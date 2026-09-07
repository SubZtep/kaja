export function ErrorNotice({ error }: Readonly<{ error?: { message: string } | null }>) {
  if (!error) return null
  return <p className="mb-6 text-red-400 text-sm">{error.message}</p>
}
