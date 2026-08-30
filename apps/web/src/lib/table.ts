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
