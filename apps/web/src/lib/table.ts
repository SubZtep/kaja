import {
  columnFilteringFeature,
  createColumnHelper,
  createFilteredRowModel,
  createPaginatedRowModel,
  createSortedRowModel,
  metaHelper,
  type RowData,
  rowPaginationFeature,
  rowSortingFeature,
  tableFeatures
} from "@tanstack/react-table"

type ColumnMeta = {
  filterVariant?: "text" | "role" | "period"
  /** Per-row callbacks/data an actions cell needs, so its cell renderer can stay a top-level component. */
  actions?: unknown
}

export const tableFeaturesConfig = tableFeatures({
  columnFilteringFeature,
  rowSortingFeature,
  rowPaginationFeature,
  filteredRowModel: createFilteredRowModel(),
  sortedRowModel: createSortedRowModel(),
  paginatedRowModel: createPaginatedRowModel(),
  columnMeta: metaHelper<ColumnMeta>()
})

export function tableColumnHelper<TData extends RowData>() {
  return createColumnHelper<typeof tableFeaturesConfig, TData>()
}

/** The `meta.actions` a column passed its cell renderer; every column that renders one sets it. */
export function cellActions<TActions>(meta: { actions?: unknown } | undefined): TActions {
  return (meta?.actions ?? {}) as TActions
}
