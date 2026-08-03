import { capitalized, cn } from "@kaja/shared"
import {
  type Column,
  type ColumnFiltersState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  type RowData,
  useReactTable
} from "@tanstack/react-table"
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react"
import { useState } from "react"
import { DebouncedText } from "../form/primitives/Text"

declare module "@tanstack/react-table" {
  interface ColumnMeta<TData extends RowData, TValue> {
    filterVariant?: "text" | "role" | "period"
  }
}

type PeriodFilter = [Date | undefined, Date | undefined]

const USER_ROLES = ["admin", "user"] as const

const PAGE_SIZES = [10, 25, 50, 100]

export function Table({
  columns,
  data,
  showFilters = true
}: Readonly<{ columns: any[]; data: any[]; showFilters?: boolean }>) {
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])

  const table = useReactTable({
    columns,
    data: data,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
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
    const currentSort = table.getState().sorting.find(sort => sort.id === columnId)
    table.setSorting([currentSort && !currentSort.desc ? { id: columnId, desc: true } : { id: columnId, desc: false }])
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
                  <th key={header.id} className="p-4 text-left border-b border-border/40 align-top">
                    {header.isPlaceholder ? null : (
                      <button
                        type="button"
                        className={cn(
                          "flex gap-2 items-center",
                          header.column.getCanSort() && "cursor-pointer",
                          header.column.getIsSorted() && "select-none",
                          header.column.getCanSort() && !header.column.getIsSorted() && "mr-7.25"
                        )}
                        onClick={() => header.column.getCanSort() && toggleSorting(header.column.id)}
                      >
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {{
                          asc: <ArrowDown size={21} className="text-muted" />,
                          desc: <ArrowUp size={21} className="text-muted" />
                        }[header.column.getIsSorted() as string] ?? null}
                      </button>
                    )}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {rows.map(row => (
              <tr key={row.id}>
                {row.getVisibleCells().map(cell => (
                  <td key={cell.id} className="p-4 border-b border-border/40">
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

function Pagination({ table }: Readonly<{ table: any }>) {
  const pageIndex = table.getState().pagination.pageIndex
  const pageCount = table.getPageCount()
  const pageSize = table.getState().pagination.pageSize
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
        <span>
          Showing {startRow} to {endRow} of {totalRows} entries
        </span>
        <select
          value={pageSize}
          onChange={e => table.setPageSize(Number(e.target.value))}
          aria-label="Select page size"
          className="ml-2 rounded-lg bg-surface-2 px-3 py-1 text-fg outline-none transition-all focus:ring-1 focus:ring-neon"
        >
          {PAGE_SIZES.map(size => (
            <option key={size} value={size}>
              {size} per page
            </option>
          ))}
        </select>
      </div>

      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => table.setPageIndex(0)}
          disabled={!table.getCanPreviousPage()}
          aria-label="Go to first page"
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
          aria-label="Go to previous page"
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
                pageIndex === item.value
                  ? "bg-neon text-bg shadow-[0_0_12px_rgba(255,63,181,0.5)]"
                  : "text-fg hover:bg-surface-2 hover:text-neon"
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
          aria-label="Go to next page"
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
          aria-label="Go to last page"
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

function Filter({ column }: Readonly<{ column: Column<any, unknown> }>) {
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
            placeholder="From"
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
            placeholder="To"
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
          placeholder="Search..."
          className="w-32"
          variant="simple"
          onChange={value => column.setFilterValue(value)}
          value={(columnFilterValue ?? "") as string}
          debounce={500}
        />
      )
  }
}
