import type { AdminImage, AdminImagesResponse, ImageOrigin } from "@kaja/schema/api"
import { adminImagesResponseSchema, describeImageResponseSchema, describeImagesResponseSchema } from "@kaja/schema/api"
import { getDateTime } from "@kaja/shared/date"
import { cn } from "@kaja/shared/ui"
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"
import { ExternalLink, Sparkles, Trash2, X } from "lucide-react"
import { useState } from "react"
import { toast } from "react-toastify"
import { Button } from "../../../../components/form/primitives/button"
import { Checkbox } from "../../../../components/form/primitives/checkbox"
import { DebouncedText } from "../../../../components/form/primitives/text"
import { CHANNEL_LABELS } from "../../../../components/stats/channels"
import { ConfirmDialog } from "../../../../components/ui/confirm-dialog"
import { IconButton } from "../../../../components/ui/icon-button"
import { Loader } from "../../../../components/ui/loader"
import { PageHeader } from "../../../../components/ui/page-header"
import { Section } from "../../../../components/ui/section"
import { useAuthClient } from "../../../../hooks/auth-client"
import { useApiFetch } from "../../../../lib/api-fetch"
import { formatBytes } from "../../../../lib/sandbox"
import { seo } from "../../../../lib/seo"
import { m } from "../../../../paraglide/messages.js"

type ImageFilters = { user?: string; site?: string; undescribed?: boolean; origin?: ImageOrigin }

const ORIGINS: ImageOrigin[] = ["url", "file", "none"]

const ORIGIN_LABELS: Record<ImageOrigin, () => string> = {
  url: () => m.admin_images_origin_url(),
  file: () => m.admin_images_origin_file(),
  none: () => m.admin_images_origin_none()
}

// The page's filters live in its URL, so a card can link to a filtered view; anything else in it is dropped.
function imageFilters(search: Record<string, unknown>): ImageFilters {
  const text = (value: unknown) => (typeof value === "string" && value.trim() ? value.trim() : undefined)
  const origin = ORIGINS.find(value => value === search.origin)
  return {
    user: text(search.user),
    site: text(search.site),
    undescribed: search.undescribed === true || search.undescribed === "true" ? true : undefined,
    origin
  }
}

export const Route = createFileRoute("/_portal/admin/images/")({
  validateSearch: imageFilters,
  component: ImagesPage,
  head: () => ({ meta: seo({ title: m.nav_images() }) })
})

function queryString(filters: ImageFilters, cursor?: string) {
  const params = new URLSearchParams()
  if (filters.user) params.set("user", filters.user)
  if (filters.site) params.set("site", filters.site)
  if (filters.undescribed) params.set("undescribed", "true")
  if (filters.origin) params.set("origin", filters.origin)
  if (cursor) params.set("cursor", cursor)
  return params.toString()
}

/** Every stored image matching the filters, newest first, a page at a time. */
function useImages(filters: ImageFilters) {
  const apiFetch = useApiFetch()
  return useInfiniteQuery({
    queryKey: ["admin-images", filters],
    queryFn: ({ pageParam }) =>
      apiFetch<AdminImagesResponse>(`/admin/images?${queryString(filters, pageParam)}`).then(r =>
        adminImagesResponseSchema.parse(r)
      ),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: last => last.next ?? undefined
  })
}

function ImagesPage() {
  const filters = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  const images = useImages(filters)
  // Revealed until the admin leaves the page: nobody's pictures are on show by default
  const [revealed, setRevealed] = useState<Set<string>>(() => new Set())
  const [selected, setSelected] = useState<AdminImage>()
  const all = images.data?.pages.flatMap(page => page.images) ?? []

  const setFilters = (next: Partial<ImageFilters>) => {
    setSelected(undefined)
    void navigate({ search: previous => ({ ...previous, ...next }), replace: true })
  }
  const pick = (image: AdminImage) => {
    setRevealed(previous => new Set(previous).add(keyOf(image)))
    setSelected(image)
  }

  return (
    <>
      <PageHeader title={m.admin_images_title()} description={m.admin_images_description()} />
      <Filters filters={filters} onChange={setFilters} />

      <div className="mt-4 flex flex-col gap-4 lg:flex-row lg:items-start">
        {selected && (
          <ImagePanel
            image={selected}
            onClose={() => setSelected(undefined)}
            onRemoved={() => setSelected(undefined)}
            onDescribed={description => setSelected(previous => previous && { ...previous, description })}
          />
        )}
        <div className="min-w-0 flex-1">
          {images.isError && <p className="m-0 text-sm text-red-400">{m.admin_images_error()}</p>}
          {images.isPending && <Loader slim />}
          {images.data && all.length === 0 && <p className="text-muted m-0 text-sm">{m.admin_images_empty()}</p>}
          <ul className="m-0 grid list-none grid-cols-2 gap-3 p-0 sm:grid-cols-3 xl:grid-cols-5">
            {all.map(image => (
              <li key={keyOf(image)}>
                <button
                  type="button"
                  onClick={() => pick(image)}
                  aria-label={m.admin_images_open({ user: image.user.email })}
                  aria-pressed={selected !== undefined && keyOf(selected) === keyOf(image)}
                  className={cn(
                    "border-border bg-surface-2 block aspect-square w-full cursor-pointer overflow-hidden rounded-md border",
                    selected && keyOf(selected) === keyOf(image) && "border-neon"
                  )}
                >
                  <img
                    src={image.url}
                    alt=""
                    loading="lazy"
                    className={cn(
                      "size-full object-cover transition",
                      !revealed.has(keyOf(image)) && "scale-110 blur-xl"
                    )}
                  />
                </button>
              </li>
            ))}
          </ul>
          {images.hasNextPage && (
            <div className="mt-4 flex justify-center">
              <Button
                variant="secondary"
                size="md"
                disabled={images.isFetchingNextPage}
                onClick={() => void images.fetchNextPage()}
              >
                {m.admin_images_load_more()}
              </Button>
            </div>
          )}
        </div>
      </div>
    </>
  )
}

const keyOf = (image: AdminImage) => `${image.sessionId}/${image.id}`

function Filters({
  filters,
  onChange
}: Readonly<{ filters: ImageFilters; onChange: (next: Partial<ImageFilters>) => void }>) {
  const { admin } = useAuthClient()
  const apiFetch = useApiFetch()
  const queryClient = useQueryClient()
  const describeAll = useMutation({
    mutationFn: () =>
      apiFetch("/admin/images/describe", { user: filters.user, site: filters.site, origin: filters.origin }).then(r =>
        describeImagesResponseSchema.parse(r)
      ),
    onSuccess: ({ queued }) => {
      toast.success(m.admin_images_describe_all_queued({ count: queued }))
      // They're written in the background; a later look picks them up
      void queryClient.invalidateQueries({ queryKey: ["admin-images"] })
    },
    onError: (error: Error) => toast.error(error.message || m.admin_images_describe_failed())
  })
  const users = useQuery({
    queryKey: ["users"],
    queryFn: async () => {
      const { data, error } = await admin.listUsers({ query: {} })
      if (error) throw new Error(error.message)
      return data.users
    }
  })
  const fieldClass =
    "border-border bg-surface-2 text-fg placeholder:text-muted/70 focus:border-neon/50 rounded-md border px-3 py-2 text-sm outline-none"

  return (
    <Section>
      <div className="flex flex-wrap items-center gap-4">
        <select
          aria-label={m.admin_images_filter_user()}
          value={filters.user ?? ""}
          onChange={event => onChange({ user: event.target.value || undefined })}
          className={cn(fieldClass, "min-w-56 dark:scheme-dark")}
        >
          <option value="">{m.admin_images_filter_all_users()}</option>
          {users.data?.map(user => (
            <option key={user.id} value={user.id}>
              {user.email}
            </option>
          ))}
        </select>
        <DebouncedText
          aria-label={m.admin_images_filter_site()}
          placeholder={m.admin_images_filter_site()}
          value={filters.site ?? ""}
          onChange={value => onChange({ site: String(value).trim() || undefined })}
          className={cn(fieldClass, "w-48")}
        />
        <label className="text-fg flex items-center gap-2 text-sm">
          <Checkbox
            checked={filters.undescribed === true}
            onCheckedChange={checked => onChange({ undescribed: checked || undefined })}
          />
          {m.admin_images_filter_undescribed()}
        </label>
        <fieldset className="m-0 flex items-center gap-2 border-0 p-0" aria-label={m.admin_images_filter_origin()}>
          {[undefined, ...ORIGINS].map(origin => (
            <Button
              key={origin ?? "any"}
              variant="chip"
              aria-pressed={filters.origin === origin}
              onClick={() => onChange({ origin })}
              className={cn(filters.origin === origin && "border-neon/60 text-fg")}
            >
              {origin ? ORIGIN_LABELS[origin]() : m.admin_images_origin_any()}
            </Button>
          ))}
        </fieldset>
        <Button
          variant="secondary"
          size="sm"
          loading={describeAll.isPending}
          onClick={() => describeAll.mutate()}
          className="ml-auto gap-1.5"
        >
          <Sparkles size={14} />
          {m.admin_images_describe_all()}
        </Button>
      </div>
    </Section>
  )
}

function ImagePanel({
  image,
  onClose,
  onRemoved,
  onDescribed
}: Readonly<{
  image: AdminImage
  onClose: () => void
  onRemoved: () => void
  onDescribed: (description: string) => void
}>) {
  const apiFetch = useApiFetch()
  const queryClient = useQueryClient()
  const describe = useMutation({
    mutationFn: () =>
      apiFetch(`/admin/images/${image.sessionId}/${image.id}/describe`, undefined, { method: "POST" }).then(r =>
        describeImageResponseSchema.parse(r)
      ),
    onSuccess: ({ description }) => {
      if (!description) {
        toast.warn(m.admin_images_describe_empty())
        return
      }
      onDescribed(description)
      void queryClient.invalidateQueries({ queryKey: ["admin-images"] })
    },
    onError: (error: Error) => toast.error(error.message || m.admin_images_describe_failed())
  })
  const remove = useMutation({
    mutationFn: () => apiFetch(`/admin/images/${image.sessionId}/${image.id}`, undefined, { method: "DELETE" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin-images"] })
      toast.success(m.admin_images_removed())
      onRemoved()
    },
    onError: (error: Error) => toast.error(error.message || m.admin_images_remove_failed())
  })
  const { source } = image
  const rows: [string, React.ReactNode][] = [
    [
      m.admin_images_field_user(),
      <Link key="user" to="/admin/users/$userId" params={{ userId: image.user.id }} className="text-neon underline">
        {image.user.email}
      </Link>
    ],
    [
      m.admin_images_field_session(),
      image.session ? `${image.session.title} (${CHANNEL_LABELS[image.session.channel]()})` : m.admin_images_unsaved()
    ],
    [
      m.admin_images_field_source(),
      source.url ? (
        <a
          key="url"
          href={source.url}
          target="_blank"
          rel="noreferrer noopener"
          className="text-neon inline-flex items-center gap-1 break-all underline"
        >
          {source.url}
          <ExternalLink size={12} />
        </a>
      ) : undefined
    ],
    [m.admin_images_field_alt(), source.alt],
    [m.admin_images_field_title(), source.title],
    [m.admin_images_field_file(), source.fileName],
    [m.admin_images_field_description(), image.description ?? m.admin_images_no_description()],
    [
      m.admin_images_field_described_by(),
      image.descriptionModel && image.describedAt
        ? `${image.descriptionModel}, ${getDateTime(image.describedAt, "long")}`
        : undefined
    ],
    [m.admin_images_field_size(), `${image.width}×${image.height}, ${formatBytes(image.bytes)}, ${image.mimeType}`],
    [m.admin_images_field_created(), getDateTime(image.createdAt, "long")]
  ]

  return (
    <Section className="order-first w-full lg:sticky lg:top-4 lg:order-last lg:w-96 lg:shrink-0">
      <div className="mb-3 flex items-center justify-between gap-2">
        <span className="text-muted font-mono text-[11px] tracking-wider uppercase">{image.id}</span>
        <IconButton variant="neutral" aria-label={m.admin_images_close()} onClick={onClose}>
          <X size={16} />
        </IconButton>
      </div>
      <a href={image.url} target="_blank" rel="noreferrer noopener">
        <img
          src={image.url}
          alt={source.alt ?? image.description ?? ""}
          className="border-border w-full rounded-md border"
        />
      </a>
      <dl className="mt-4 mb-0 grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 text-sm">
        {rows
          .filter(([, value]) => value !== undefined)
          .map(([label, value]) => (
            <div key={label} className="contents">
              <dt className="text-muted font-mono text-[11px] tracking-wider uppercase">{label}</dt>
              <dd className="text-fg m-0 min-w-0 wrap-break-word">{value}</dd>
            </div>
          ))}
      </dl>
      <div className="mt-5 flex justify-end gap-2">
        <Button
          variant="secondary"
          size="sm"
          loading={describe.isPending}
          onClick={() => describe.mutate()}
          className="gap-1.5"
        >
          <Sparkles size={14} />
          {m.admin_images_describe()}
        </Button>
        <ConfirmDialog
          title={m.admin_images_remove_title()}
          description={m.admin_images_remove_description()}
          confirm={m.admin_images_remove()}
          onConfirm={() => remove.mutate()}
        >
          <Button variant="secondary" size="sm" disabled={remove.isPending} className="gap-1.5 text-red-400">
            <Trash2 size={14} />
            {m.admin_images_remove()}
          </Button>
        </ConfirmDialog>
      </div>
    </Section>
  )
}
