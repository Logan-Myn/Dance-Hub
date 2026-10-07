'use client';

import { Fragment, type ReactNode, useEffect, useId, useRef, useState } from 'react';
import {
  type ColumnDef,
  type ExpandedState,
  type SortingState,
  flexRender,
  getCoreRowModel,
  getExpandedRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronDown, ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { FIELD_INPUT } from '@/components/ds/app-dialog';
import { BTN_SECONDARY } from '@/components/community-feed/feed-header';
import { Card } from '@/components/community-admin/ui';
import { cn } from '@/lib/utils';

interface AdminDataTableProps<T> {
  columns: ColumnDef<T, unknown>[];
  data: T[];
  /** Placeholder for the search field. Without it there is no search. */
  searchPlaceholder?: string;
  /** Rows per page. Without it, every row is on one page. */
  pageSize?: number;
  /** What the rows are, for the count under the table: ["user", "users"]. */
  noun?: [string, string];
  emptyMessage?: string;
  /** Makes rows expandable, showing this under the row. */
  renderSubComponent?: (rowData: T) => ReactNode;
  /** Names a row for the expand button's label. */
  rowLabel?: (rowData: T) => string;
}

export function AdminDataTable<T>({
  columns,
  data,
  searchPlaceholder,
  pageSize,
  noun = ['row', 'rows'],
  emptyMessage = 'Nothing here yet.',
  renderSubComponent,
  rowLabel,
}: AdminDataTableProps<T>) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState('');
  const [expanded, setExpanded] = useState<ExpandedState>({});
  const searchId = useId();
  // The visible width of the table, so an expanded row's panel stays in view
  // (pinned to the left) when the table is wider than its card.
  const scroller = useRef<HTMLDivElement>(null);
  const [visibleWidth, setVisibleWidth] = useState<number | null>(null);
  useEffect(() => {
    const el = scroller.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([entry]) => setVisibleWidth(Math.round(entry.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const usePagination = typeof pageSize === 'number' && pageSize > 0;
  const expandable = Boolean(renderSubComponent);

  const table = useReactTable({
    data,
    columns,
    state: { sorting, globalFilter, expanded },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    onExpandedChange: setExpanded,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    ...(expandable ? { getExpandedRowModel: getExpandedRowModel(), getRowCanExpand: () => true } : {}),
    ...(usePagination
      ? { getPaginationRowModel: getPaginationRowModel(), initialState: { pagination: { pageSize } } }
      : {}),
  });

  const rows = table.getRowModel().rows;
  const matching = table.getFilteredRowModel().rows.length;
  const colSpan = columns.length + (expandable ? 1 : 0);

  return (
    <div className="flex flex-col gap-3">
      {searchPlaceholder && (
        <div className="relative w-full sm:max-w-[380px]">
          <label htmlFor={searchId} className="sr-only">
            {searchPlaceholder}
          </label>
          <Search aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" />
          <input
            id={searchId}
            type="search"
            placeholder={searchPlaceholder}
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
            autoComplete="off"
            className={cn(FIELD_INPUT, 'pl-10')}
          />
        </div>
      )}

      <Card className="overflow-hidden">
        {/* Wide tables scroll here, inside the card, not the whole page. */}
        <div ref={scroller} className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              {table.getHeaderGroups().map((hg) => (
                <tr key={hg.id} className="border-b border-line">
                  {expandable && <th scope="col" className="w-10" aria-label="Details" />}
                  {hg.headers.map((header) => {
                    const canSort = header.column.getCanSort();
                    const dir = header.column.getIsSorted();
                    const label = header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext());
                    return (
                      <th
                        key={header.id}
                        scope="col"
                        aria-sort={canSort ? (dir === 'asc' ? 'ascending' : dir === 'desc' ? 'descending' : 'none') : undefined}
                        className="whitespace-nowrap px-4 py-3 text-[13px] font-semibold text-ink-3"
                      >
                        {canSort ? (
                          <button
                            type="button"
                            onClick={header.column.getToggleSortingHandler()}
                            className="-mx-1 inline-flex items-center gap-1 rounded-md px-1 py-0.5 transition-colors hover:text-ink"
                          >
                            {label}
                            {dir === 'asc' ? (
                              <ArrowUp className="h-3.5 w-3.5 text-ink-2" aria-hidden="true" />
                            ) : dir === 'desc' ? (
                              <ArrowDown className="h-3.5 w-3.5 text-ink-2" aria-hidden="true" />
                            ) : (
                              <ArrowUpDown className="h-3.5 w-3.5 opacity-40" aria-hidden="true" />
                            )}
                          </button>
                        ) : (
                          label
                        )}
                      </th>
                    );
                  })}
                </tr>
              ))}
            </thead>
            <tbody>
              {rows.length ? (
                rows.map((row) => {
                  const isExpanded = row.getIsExpanded();
                  return (
                    <Fragment key={row.id}>
                      <tr
                        className={cn(
                          'border-b border-line transition-colors last:border-b-0 hover:bg-surface-2/60',
                          expandable && 'cursor-pointer',
                          isExpanded && 'bg-surface-2/60'
                        )}
                        onClick={
                          expandable
                            ? (e) => {
                                // Links, buttons and menus inside the row keep their own click.
                                const target = e.target as HTMLElement;
                                if (target.closest('a, button, input, [role="menuitem"], [role="dialog"]')) return;
                                row.toggleExpanded();
                              }
                            : undefined
                        }
                      >
                        {expandable && (
                          <td className="w-10 pl-3">
                            <button
                              type="button"
                              onClick={() => row.toggleExpanded()}
                              aria-expanded={isExpanded}
                              aria-label={`${isExpanded ? 'Hide' : 'Show'} details${rowLabel ? ` for ${rowLabel(row.original)}` : ''}`}
                              className="grid h-7 w-7 place-items-center rounded-md text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink"
                            >
                              <ChevronDown className={cn('h-4 w-4 transition-transform', isExpanded && 'rotate-180')} aria-hidden="true" />
                            </button>
                          </td>
                        )}
                        {row.getVisibleCells().map((cell) => (
                          <td key={cell.id} className="px-4 py-3 align-middle text-[14px] text-ink">
                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                          </td>
                        ))}
                      </tr>
                      {expandable && isExpanded && (
                        <tr className="border-b border-line bg-surface-2/40 last:border-b-0">
                          <td colSpan={colSpan} className="p-0">
                            <div className="sticky left-0" style={visibleWidth ? { width: visibleWidth } : undefined}>
                              {renderSubComponent!(row.original)}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={colSpan} className="px-4 py-10 text-center text-[14.5px] text-ink-2">
                    {globalFilter ? `Nothing matches "${globalFilter}".` : emptyMessage}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {usePagination && table.getPageCount() > 1 && (
        <div className="flex flex-wrap items-center justify-between gap-3 text-[13.5px] text-ink-3">
          <span>
            {matching} {matching === 1 ? noun[0] : noun[1]}, page {table.getState().pagination.pageIndex + 1} of {table.getPageCount()}
          </span>
          <div className="flex gap-2">
            <button type="button" className={cn(BTN_SECONDARY, 'h-9')} onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()}>
              <ChevronLeft aria-hidden="true" />
              Previous
            </button>
            <button type="button" className={cn(BTN_SECONDARY, 'h-9')} onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}>
              Next
              <ChevronRight aria-hidden="true" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
