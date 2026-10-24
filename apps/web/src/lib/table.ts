import {
  columnFilteringFeature,
  createColumnHelper,
  createFilteredRowModel,
  createPaginatedRowModel,
  createSortedRowModel,
  filterFn_arrIncludes,
  filterFn_equals,
  filterFn_includesString,
  filterFn_inDateRange,
  filterFn_inNumberRange,
  filterFn_weakEquals,
  metaHelper,
  type RowData,
  rowPaginationFeature,
  rowSortingFeature,
  sortFn_alphanumeric,
  sortFn_datetime,
  sortFn_text,
  tableFeatures
} from "@tanstack/react-table"

type ColumnMeta = {
  /** `task` is a select of model tasks, matched against an array of them (`filterFn: "arrIncludes"`). */
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
  // The ones `'auto'` picks by value type; without them a column filter or sort silently does nothing.
  filterFns: {
    includesString: filterFn_includesString,
    inNumberRange: filterFn_inNumberRange,
    equals: filterFn_equals,
    arrIncludes: filterFn_arrIncludes,
    inDateRange: filterFn_inDateRange,
    weakEquals: filterFn_weakEquals
  },
  sortFns: { alphanumeric: sortFn_alphanumeric, text: sortFn_text, datetime: sortFn_datetime },
  columnMeta: metaHelper<ColumnMeta>()
})

export function tableColumnHelper<TData extends RowData>() {
  return createColumnHelper<typeof tableFeaturesConfig, TData>()
}

/** The `meta.actions` a column passed its cell renderer; every column that renders one sets it. */
export function cellActions<TActions>(meta: { actions?: unknown } | undefined): TActions {
  return (meta?.actions ?? {}) as TActions
}
