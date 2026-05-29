import { describe, expect, test } from 'bun:test';
import { parseCsv, sanitizeCell, writeCsv } from '../src/lib/csv.js';

describe('parseCsv', () => {
  test('parses simple CSV with header', () => {
    const { headers, rows } = parseCsv('a,b,c\n1,2,3\n4,5,6');
    expect(headers).toEqual(['a', 'b', 'c']);
    expect(rows).toEqual([
      { a: '1', b: '2', c: '3' },
      { a: '4', b: '5', c: '6' },
    ]);
  });

  test('handles quoted fields with commas and escaped quotes', () => {
    const { rows } = parseCsv('name,note\n"Doe, John","She said ""hi"""');
    expect(rows[0]).toEqual({ name: 'Doe, John', note: 'She said "hi"' });
  });

  test('handles CRLF line endings', () => {
    const { rows } = parseCsv('a,b\r\n1,2\r\n3,4');
    expect(rows).toEqual([
      { a: '1', b: '2' },
      { a: '3', b: '4' },
    ]);
  });

  test('strips BOM', () => {
    const { headers } = parseCsv('\uFEFFa,b\n1,2');
    expect(headers).toEqual(['a', 'b']);
  });

  test('skips trailing empty row', () => {
    const { rows } = parseCsv('a\n1\n');
    expect(rows).toEqual([{ a: '1' }]);
  });
});

describe('writeCsv', () => {
  test('quotes cells containing commas, quotes, newlines', () => {
    const out = writeCsv([{ a: 'hi, there', b: 'line\nbreak', c: 'she said "x"' }]);
    expect(out).toBe('a,b,c\r\n"hi, there","line\nbreak","she said ""x"""');
  });

  test('round-trips through parseCsv', () => {
    const rows = [
      { name: 'Alice', phone: '+12025550101' },
      { name: 'Bob, Jr.', phone: '+447400000000' },
    ];
    const csv = writeCsv(rows, ['name', 'phone']);
    const parsed = parseCsv(csv);
    expect(parsed.headers).toEqual(['name', 'phone']);
    expect(parsed.rows).toEqual(rows);
  });
});

describe('sanitizeCell (formula injection)', () => {
  test('prefixes dangerous leading chars with single quote', () => {
    expect(sanitizeCell('=SUM(A1)')).toBe("'=SUM(A1)");
    expect(sanitizeCell('+1234')).toBe("'+1234");
    expect(sanitizeCell('-2')).toBe("'-2");
    expect(sanitizeCell('@cmd')).toBe("'@cmd");
    expect(sanitizeCell('\tcmd')).toBe("'\tcmd");
  });

  test('leaves benign values untouched', () => {
    expect(sanitizeCell('hello')).toBe('hello');
    expect(sanitizeCell('')).toBe('');
  });
});
