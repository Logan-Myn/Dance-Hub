'use client';

import { Fragment, type ReactNode, useState } from 'react';
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ArrowUpDown, ArrowUp, ArrowDown, ChevronLeft, ChevronRight, Search, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AdminDataTableProps<T> {
  columns: ColumnDef<T, unknown>[];
  data: T[];
  // Placeholder text for the search input. If not provided, search is disabled.
  searchPlaceholder?: string;
  // Number of rows per page. If 0 or undefined, pagination is disabled
  // (single page, no controls).
  pageSize?: number;
  // Empty-state message when no rows match the current filter.
  emptyMessage?: string;
  // When provided, rows become expandable: clicking a row toggles an inline
  // panel below it that renders this function's output. Adds a chevron
  // affordance on the leading cell. Pass undefined to keep rows static.
  renderSubComponent?: (rowData: T) => ReactNode;
}

export function AdminDataTable<T>({
  columns,
  data,
  searchPlaceholder,
  pageSize,
  emptyMessage = 'No results.',
  renderSubComponent,
}: AdminDataTableProps<T>) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState('');
  const [expanded, setExpanded] = useState<ExpandedState>({});

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
    ...(expandable
      ? {
          getExpandedRowModel: getExpandedRowModel(),
          getRowCanExpand: () => true,
        }
      : {}),
    ...(usePagination
      ? {
          getPaginationRowModel: getPaginationRowModel(),
          initialState: { pagination: { pageSize } },
        }
      : {}),
  });

  return (
    <div className="space-y-4">
      {searchPlaceholder ? (
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            placeholder={searchPlaceholder}
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
            className="pl-9"
          />
        </div>
      ) : null}

      <div className="bg-card rounded-2xl border border-border/50 overflow-hidden">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id} className="border-border/50 hover:bg-transparent">
                {expandable ? <TableHead className="w-8" /> : null}
                {hg.headers.map((header) => {
                  const canSort = header.column.getCanSort();
                  const sortState = header.column.getIsSorted();
                  return (
                    <TableHead
                      key={header.id}
                      className={cn(
                        'text-xs font-medium uppercase tracking-wider text-muted-foreground',
                        canSort && 'cursor-pointer select-none hover:text-foreground transition-colors'
                      )}
                      onClick={canSort ? header.column.getToggleSortingHandler() : undefined}
                    >
                      <div className="flex items-center gap-1.5">
                        {header.isPlaceholder
                          ? null
                          : flexRender(header.column.columnDef.header, header.getContext())}
                        {canSort ? (
                          sortState === 'asc' ? (
                            <ArrowUp className="h-3 w-3" />
                          ) : sortState === 'desc' ? (
                            <ArrowDown className="h-3 w-3" />
                          ) : (
                            <ArrowUpDown className="h-3 w-3 opacity-40" />
                          )
                        ) : null}
                      </div>
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length ? (
              table.getRowModel().rows.map((row) => {
                const isExpanded = row.getIsExpanded();
                return (
                  <Fragment key={row.id}>
                    <TableRow
                      className={cn(
                        'border-border/50 transition-colors',
                        expandable && 'cursor-pointer hover:bg-muted/40',
                        !expandable && 'hover:bg-muted/40',
                        isExpanded && 'bg-muted/30'
                      )}
                      onClick={
                        expandable
                          ? (e) => {
                              // Don't toggle when clicking inside an interactive
                              // element (link, button, dropdown, etc.) inside
                              // the row.
                              const target = e.target as HTMLElement;
                              if (target.closest('a, button, [role="menuitem"], [role="dialog"]')) {
                                return;
                              }
                              row.toggleExpanded();
                            }
                          : undefined
                      }
                    >
                      {expandable ? (
                        <TableCell className="w-8 p-0 pl-3">
                          <ChevronDown
                            className={cn(
                              'h-4 w-4 text-muted-foreground transition-transform',
                              isExpanded && 'rotate-180'
                            )}
                          />
                        </TableCell>
                      ) : null}
                      {row.getVisibleCells().map((cell) => (
                        <TableCell key={cell.id}>
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </TableCell>
                      ))}
                    </TableRow>
                    {expandable && isExpanded ? (
                      <TableRow className="border-border/50 bg-muted/10 hover:bg-muted/10">
                        <TableCell
                          colSpan={row.getVisibleCells().length + 1}
                          className="p-0"
                        >
                          {renderSubComponent!(row.original)}
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </Fragment>
                );
              })
            ) : (
              <TableRow>
                <TableCell
                  colSpan={columns.length + (expandable ? 1 : 0)}
                  className="h-24 text-center text-muted-foreground"
                >
                  {emptyMessage}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {usePagination && table.getPageCount() > 1 ? (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount()}
            {' · '}
            {table.getFilteredRowModel().rows.length} {table.getFilteredRowModel().rows.length === 1 ? 'row' : 'rows'}
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
            >
              <ChevronLeft className="h-4 w-4" />
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
