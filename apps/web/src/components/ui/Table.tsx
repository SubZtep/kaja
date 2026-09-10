import { capitalized, cn } from "@kaja/shared"
import { type Column, type ColumnFiltersState, flexRender, useTable } from "@tanstack/react-table"
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react"
import { type ReactNode, useState } from "react"
import { tableFeaturesConfig } from "../../lib/table"
import { m } from "../../paraglide/messages.js"
import { DebouncedText } from "../form/primitives/Text"

type PeriodFilter = [Date | undefined, Date | undefined]

const USER_ROLES = ["admin", "user"] as const

const PAGE_SIZES = [10, 25, 50, 100]

export function Table({
  columns,
  data,
  showFilters = true
}: Readonly<{ columns: any[]; data: any[]; showFilters?: boolean }>) {
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])

  const table = useTable({
    features: tableFeaturesConfig,
    columns,
    data: data,
    initialState: {
      sorting: [
        {
          id: "createdAt",
          desc: true
        }
      ],
      pagination: {
        pageIndex: 0,
        pageSize: 25
      }
    },
    state: {
      columnFilters
    },
    onColumnFiltersChange: setColumnFilters
  })

  const toggleSorting = (columnId: string) => {
    const currentSort = table.state.sorting.find(sort => sort.id === columnId)
    const desc = currentSort ? !currentSort.desc : false
    table.setSorting([{ id: columnId, desc }])
  }

  const { rows } = table.getRowModel()

  return (
    <div className="flex flex-col gap-4">
      {showFilters && (
        <div className="flex gap-1 flex-wrap">
          {table.getHeaderGroups().map(headerGroup =>
            headerGroup.headers.map(header =>
              header.column.getCanFilter() ? (
                <div key={header.id} className="flex flex-row gap-4 bg-surface/90 px-4 py-2 items-center rounded-md">
                  {flexRender(header.column.columnDef.header, header.getContext())}:
                  <Filter column={header.column} />
                </div>
              ) : null
            )
          )}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full table-auto">
          <thead>
            {table.getHeaderGroups().map(headerGroup => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map(header => (
                  <TableHeaderCell key={header.id} header={header} onToggleSort={toggleSorting} />
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {rows.map(row => (
              <tr key={row.id}>
                {row.getAllCells().map(cell => (
                  <td key={cell.id} className="border-border border-b p-3">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Pagination table={table} />
    </div>
  )
}

const ARIA_SORT_BY_STATE = { asc: "ascending", desc: "descending" } as const

function TableHeaderCell({
  header,
  onToggleSort
}: Readonly<{ header: any; onToggleSort: (columnId: string) => void }>) {
  const sorted = header.column.getIsSorted()
  const label = String(header.column.columnDef.header ?? "")
  const canSort = header.column.getCanSort()
  const ariaSort = canSort ? (ARIA_SORT_BY_STATE[sorted as keyof typeof ARIA_SORT_BY_STATE] ?? "none") : undefined

  const sortLabelByState = {
    asc: m.table_sort_ascending({ column: label }),
    desc: m.table_sort_descending({ column: label }),
    none: m.table_sort_none({ column: label })
  } as const

  const headerContent = flexRender(header.column.columnDef.header, header.getContext())

  let cellContent: ReactNode = headerContent
  if (!header.isPlaceholder && canSort) {
    cellContent = (
      <button
        type="button"
        aria-label={sortLabelByState[sorted as keyof typeof sortLabelByState] ?? sortLabelByState.none}
        className={cn("flex gap-2 items-center cursor-pointer", sorted && "select-none", !sorted && "mr-7.25")}
        onClick={() => onToggleSort(header.column.id)}
      >
        {headerContent}
        {{
          asc: <ArrowUp size={21} className="text-muted" />,
          desc: <ArrowDown size={21} className="text-muted" />
        }[sorted as string] ?? null}
      </button>
    )
  } else if (header.isPlaceholder) {
    cellContent = null
  }

  return (
    <th
      aria-sort={ariaSort}
      className="border-border border-b p-3 text-left align-top text-muted text-xs font-mono uppercase tracking-wider"
    >
      {cellContent}
    </th>
  )
}

function Pagination({ table }: Readonly<{ table: any }>) {
  const pageIndex = table.state.pagination.pageIndex
  const pageCount = table.getPageCount()
  const pageSize = table.state.pagination.pageSize
  const totalRows = table.getFilteredRowModel().rows.length

  const getPageNumbers = () => {
    const pages: Array<{ type: "page" | "ellipsis"; value: number | string; key: string }> = []
    const maxVisible = 7

    if (pageCount <= maxVisible) {
      for (let i = 0; i < pageCount; i++) {
        pages.push({ type: "page", value: i, key: `page-${i}` })
      }
    } else if (pageIndex < 3) {
      for (let i = 0; i < 5; i++) pages.push({ type: "page", value: i, key: `page-${i}` })
      pages.push(
        { type: "ellipsis", value: "...", key: "ellipsis-end" },
        { type: "page", value: pageCount - 1, key: `page-${pageCount - 1}` }
      )
    } else if (pageIndex > pageCount - 4) {
      pages.push({ type: "page", value: 0, key: "page-0" }, { type: "ellipsis", value: "...", key: "ellipsis-start" })
      for (let i = pageCount - 5; i < pageCount; i++) pages.push({ type: "page", value: i, key: `page-${i}` })
    } else {
      pages.push({ type: "page", value: 0, key: "page-0" }, { type: "ellipsis", value: "...", key: "ellipsis-start" })
      for (let i = pageIndex - 1; i <= pageIndex + 1; i++) pages.push({ type: "page", value: i, key: `page-${i}` })
      pages.push(
        { type: "ellipsis", value: "...", key: "ellipsis-end" },
        { type: "page", value: pageCount - 1, key: `page-${pageCount - 1}` }
      )
    }
    return pages
  }

  const startRow = pageIndex * pageSize + 1
  const endRow = Math.min((pageIndex + 1) * pageSize, totalRows)

  if (totalRows === 0) return null

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-4 px-2">
      <div className="flex items-center gap-2 text-sm text-muted">
        <span>{m.table_showing_entries({ startRow, endRow, totalRows })}</span>
        <select
          value={pageSize}
          onChange={e => table.setPageSize(Number(e.target.value))}
          aria-label={m.table_select_page_size()}
          className="ml-2 rounded-lg bg-surface-2 px-3 py-1 text-fg outline-none transition-all focus:ring-1 focus:ring-neon"
        >
          {PAGE_SIZES.map(size => (
            <option key={size} value={size}>
              {m.table_per_page({ size })}
            </option>
          ))}
        </select>
      </div>

      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => table.setPageIndex(0)}
          disabled={!table.getCanPreviousPage()}
          aria-label={m.table_first_page()}
          className={cn(
            "p-2 rounded-lg transition-all",
            table.getCanPreviousPage()
              ? "text-fg hover:bg-surface-2 hover:text-neon"
              : "text-muted/50 cursor-not-allowed"
          )}
        >
          <ChevronsLeft size={18} />
        </button>
        <button
          type="button"
          onClick={() => table.previousPage()}
          disabled={!table.getCanPreviousPage()}
          aria-label={m.table_previous_page()}
          className={cn(
            "p-2 rounded-lg transition-all",
            table.getCanPreviousPage()
              ? "text-fg hover:bg-surface-2 hover:text-neon"
              : "text-muted/50 cursor-not-allowed"
          )}
        >
          <ChevronLeft size={18} />
        </button>

        {getPageNumbers().map(item =>
          item.type === "page" ? (
            <button
              key={item.key}
              type="button"
              onClick={() => table.setPageIndex(item.value as number)}
              className={cn(
                "min-w-10 px-3 py-2 rounded-lg text-sm font-medium transition-all",
                pageIndex === item.value ? "bg-neon text-bg" : "text-fg hover:bg-surface-2 hover:text-neon"
              )}
            >
              {(item.value as number) + 1}
            </button>
          ) : (
            <span key={item.key} className="px-2 text-muted">
              {item.value}
            </span>
          )
        )}

        <button
          type="button"
          onClick={() => table.nextPage()}
          disabled={!table.getCanNextPage()}
          aria-label={m.table_next_page()}
          className={cn(
            "p-2 rounded-lg transition-all",
            table.getCanNextPage() ? "text-fg hover:bg-surface-2 hover:text-neon" : "text-muted/50 cursor-not-allowed"
          )}
        >
          <ChevronRight size={18} />
        </button>
        <button
          type="button"
          onClick={() => table.setPageIndex(table.getPageCount() - 1)}
          disabled={!table.getCanNextPage()}
          aria-label={m.table_last_page()}
          className={cn(
            "p-2 rounded-lg transition-all",
            table.getCanNextPage() ? "text-fg hover:bg-surface-2 hover:text-neon" : "text-muted/50 cursor-not-allowed"
          )}
        >
          <ChevronsRight size={18} />
        </button>
      </div>
    </div>
  )
}

function Filter({ column }: Readonly<{ column: Column<typeof tableFeaturesConfig, any, unknown> }>) {
  const columnFilterValue = column.getFilterValue()
  const { filterVariant } = column.columnDef.meta ?? {}

  switch (filterVariant) {
    case "role":
      return (
        <select
          name="role[]"
          multiple
          size={USER_ROLES.length}
          onChange={ev => {
            const values = [...ev.target.selectedOptions].map(o => o.value)
            column.setFilterValue(values.length < USER_ROLES.length ? values : [])
          }}
        >
          {USER_ROLES.map(role => (
            <option key={role} value={role}>
              {capitalized(role)}
            </option>
          ))}
        </select>
      )

    case "period": {
      const values = (columnFilterValue ? (columnFilterValue as PeriodFilter) : [undefined, undefined]).map(
        // Date inputs are calendar days in UTC (API stores timestamps in UTC)
        (v: any) => (typeof v === "object" ? v.toISOString().slice(0, 10) : undefined)
      )
      return (
        <div className="flex flex-col gap-0.5">
          <DebouncedText
            type="date"
            placeholder={m.table_date_from()}
            variant="simple"
            className="w-34"
            value={values[0] ?? ""}
            onChange={value => {
              column.setFilterValue((old: PeriodFilter) => [
                value ? new Date(`${value} 00:00:00`) : undefined,
                old?.[1]
              ])
            }}
          />
          <DebouncedText
            type="date"
            placeholder={m.table_date_to()}
            variant="simple"
            className="w-34"
            value={values[1] ?? ""}
            onChange={value =>
              column.setFilterValue((old: PeriodFilter) => [
                old?.[0],
                value ? new Date(`${value} 23:59:59`) : undefined
              ])
            }
          />
        </div>
      )
    }

    case "text":
    default:
      return (
        <DebouncedText
          placeholder={m.table_search_placeholder()}
          className="w-32"
          variant="simple"
          onChange={value => column.setFilterValue(value)}
          value={(columnFilterValue ?? "") as string}
          debounce={500}
        />
      )
  }
}
