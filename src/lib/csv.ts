/**
 * Minimal CSV exporter with proper escaping (RFC 4180 subset).
 * Generates a string and triggers a browser download.
 */

export interface CsvColumn<T> {
  key: string;
  header: string;
  getValue: (row: T) => string | number | null | undefined;
}

function escapeCell(value: string | number | null | undefined): string {
  if (value == null) return "";
  const s = String(value);
  if (/[",\n\r]/u.test(s)) {
    return `"${s.replace(/"/gu, '""')}"`;
  }
  return s;
}

export function toCsv<T>(rows: T[], columns: CsvColumn<T>[], delimiter = ","): string {
  const header = columns.map((c) => escapeCell(c.header)).join(delimiter);
  const body = rows
    .map((r) => columns.map((c) => escapeCell(c.getValue(r))).join(delimiter))
    .join("\r\n");
  return `${header}\r\n${body}`;
}

export function downloadCsv(filename: string, csvContent: string): void {
  // BOM so Excel detects UTF-8 properly
  const blob = new Blob(["﻿" + csvContent], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
