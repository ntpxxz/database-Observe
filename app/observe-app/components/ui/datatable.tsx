import React from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { PerformanceInsight } from "@/types";

interface DataTableProps {
  data: PerformanceInsight[];
  onKillSession?: (sessionId: string) => Promise<void>;
}

export const DataTable: React.FC<DataTableProps> = ({ data, onKillSession }) => {
  const columns: ColumnDef<PerformanceInsight>[] = [
    {
      accessorKey: "type",
      header: "Type",
      cell: info => info.getValue(),
    },
    {
      accessorFn: row => row.query_text || row.query || row.sql_text || row.details?.query_text || "[N/A]",
      header: "Query",
      cell: info => (
        <div className="truncate max-w-[400px] font-mono text-xs text-slate-300">
          {info.getValue()}
        </div>
      ),
    },
    {
      header: "Duration (ms)",
      accessorFn: row =>
        row.mean_exec_time_ms ??
        row.total_elapsed_time ??
        row.duration_ms ??
        row.duration ??
        0,
      cell: info => info.getValue(),
      sortingFn: 'basic',
    },
    {
      header: "Calls",
      accessorFn: row => row.execution_count ?? row.calls ?? "-",
      cell: info => info.getValue(),
    },
    {
      id: "actions",
      header: "Actions",
      cell: ({ row }) => {
        const sessionId = row.original.session_id || row.original.spid;
        return sessionId && onKillSession ? (
          <Button
            variant="destructive"
            size="sm"
            onClick={() => onKillSession(sessionId)}
          >
            Kill
          </Button>
        ) : null;
      },
    },
  ];

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    state: {
      sorting: [],
    },
  });

  return (
    <Table>
      <TableHeader>
        {table.getHeaderGroups().map(headerGroup => (
          <TableRow key={headerGroup.id}>
            {headerGroup.headers.map(header => (
              <TableHead
                key={header.id}
                onClick={header.column.getToggleSortingHandler()}
                className="cursor-pointer"
              >
                {flexRender(header.column.columnDef.header, header.getContext())}
                {header.column.getIsSorted() === "asc" && " ⬆️"}
                {header.column.getIsSorted() === "desc" && " ⬇️"}
              </TableHead>
            ))}
          </TableRow>
        ))}
      </TableHeader>
      <TableBody>
        {table.getRowModel().rows.map(row => (
          <TableRow key={row.id}>
            {row.getVisibleCells().map(cell => (
              <TableCell key={cell.id}>
                {flexRender(cell.column.columnDef.cell, cell.getContext())}
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
};
