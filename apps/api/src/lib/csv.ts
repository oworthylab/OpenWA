/**
 * RFC 4180-ish CSV parser + writer for the CRM contact import/export
 * flow (US-051). Hand-rolled (~70 LOC) because the npm `csv-parse`
 * + `csv-stringify` pair add ~80 KB and stream APIs that don't help
 * on Workers' single-request lifecycle.
 *
 * Supports:
 *   - Double-quoted fields with `""` escaping.
 *   - LF and CRLF row terminators.
 *   - Header row → object map (the default `parseCsv` behaviour).
 *
 * Does NOT support: streaming, alternate delimiters, BOM stripping
 * beyond a single leading U+FEFF, or excel-flavoured `=SUM(A1)`
 * formula injection (use {@link sanitizeCell} when writing untrusted
 * data to a downloaded CSV).
 */

const MAX_CELLS = 200_000;

export type CsvRow = Record<string, string>;

export interface ParsedCsv {
  headers: string[];
  rows: CsvRow[];
}

/** Parses a CSV into a list of header → value objects. */
export function parseCsv(input: string): ParsedCsv {
  const raw = stripBom(input);
  const grid = parseGrid(raw);
  if (grid.length === 0) return { headers: [], rows: [] };
  const headers = (grid[0] ?? []).map((h) => h.trim());
  const rows: CsvRow[] = [];
  for (let i = 1; i < grid.length; i++) {
    const row = grid[i];
    if (!row) continue;
    // Skip rows that are completely empty (trailing blank line).
    if (row.length === 1 && row[0]?.length === 0) continue;
    const obj: CsvRow = {};
    for (let j = 0; j < headers.length; j++) {
      // biome-ignore lint/style/noNonNullAssertion: bounded by headers.length
      obj[headers[j]!] = row[j] ?? '';
    }
    rows.push(obj);
  }
  return { headers, rows };
}

/** Serialises rows to CSV. Headers default to the union of all row keys. */
export function writeCsv(rows: CsvRow[], headers?: string[]): string {
  if (rows.length === 0) return (headers ?? []).map(escapeCell).join(',');
  const hdrs = headers ?? unionKeys(rows);
  const lines: string[] = [];
  lines.push(hdrs.map(escapeCell).join(','));
  for (const row of rows) {
    lines.push(hdrs.map((h) => escapeCell(row[h] ?? '')).join(','));
  }
  return lines.join('\r\n');
}

/**
 * Defensive guard against CSV formula injection — any cell beginning
 * with `=`, `+`, `-`, `@`, or tab is prefixed with a single quote.
 * Use this on every untrusted cell before passing to {@link writeCsv}.
 */
export function sanitizeCell(value: string): string {
  if (value.length === 0) return value;
  const first = value.charCodeAt(0);
  // = 0x3D, + 0x2B, - 0x2D, @ 0x40, TAB 0x09
  if (first === 0x3d || first === 0x2b || first === 0x2d || first === 0x40 || first === 0x09) {
    return `'${value}`;
  }
  return value;
}

// -------------------- internals --------------------

function stripBom(s: string): string {
  return s.charCodeAt(0) === 0xfeff ? s.slice(1) : s;
}

function parseGrid(text: string): string[][] {
  const out: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;
  let cells = 0;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cell += ch;
      }
      continue;
    }
    if (ch === '"' && cell.length === 0) {
      inQuotes = true;
      continue;
    }
    if (ch === ',') {
      row.push(cell);
      cell = '';
      if (++cells > MAX_CELLS) throw new Error('CSV too large');
      continue;
    }
    if (ch === '\n') {
      row.push(cell);
      out.push(row);
      row = [];
      cell = '';
      cells++;
      continue;
    }
    if (ch === '\r') {
      // swallow \r in \r\n; lonely \r treated as terminator too
      if (text[i + 1] === '\n') continue;
      row.push(cell);
      out.push(row);
      row = [];
      cell = '';
      cells++;
      continue;
    }
    cell += ch;
  }
  // Flush trailing cell/row.
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    out.push(row);
  }
  return out;
}

function escapeCell(value: string): string {
  if (value === undefined || value === null) return '';
  const s = String(value);
  if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function unionKeys(rows: CsvRow[]): string[] {
  const set = new Set<string>();
  for (const r of rows) for (const k of Object.keys(r)) set.add(k);
  return [...set];
}
