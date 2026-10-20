import Link from "next/link";
import type { ReactNode } from "react";

export type DataTableColumn<Row> = {
  key: string;
  header: string;
  cell: (row: Row) => ReactNode;
};

export type DataTableProps<Row> = {
  caption: string;
  columns: readonly DataTableColumn<Row>[];
  rows: readonly Row[];
  rowKey: (row: Row) => string | number;
  action?: { label?: string; href: (row: Row) => string };
  emptyMessage?: string;
};

export function DataTable<Row>({ caption, columns, rows, rowKey, action, emptyMessage = "Nenhum item para mostrar." }: DataTableProps<Row>) {
  return (
    <div className="ui-table-scroll" role="region" aria-label={caption} tabIndex={0}>
      <table className="ui-table">
        <caption className="sr-only">{caption}</caption>
        <thead><tr>{columns.map((column) => <th key={column.key} scope="col">{column.header}</th>)}{action && <th scope="col">Ação</th>}</tr></thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={columns.length + (action ? 1 : 0)} className="text-text-muted">{emptyMessage}</td></tr>
          ) : rows.map((row) => (
            <tr key={rowKey(row)}>
              {columns.map((column) => <td key={column.key}>{column.cell(row)}</td>)}
              {action && <td><Link className="ui-table__action" href={action.href(row)}>{action.label ?? "Raio-X →"}</Link></td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
