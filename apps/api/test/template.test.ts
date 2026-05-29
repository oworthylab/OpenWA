import { describe, expect, test } from 'bun:test';
import {
  TemplateRenderError,
  extractVariables,
  isValidVariableName,
  renderTemplate,
  sanitizeValue,
} from '../src/lib/template.js';

describe('renderTemplate', () => {
  test('substitutes named variables', () => {
    const out = renderTemplate('Hello {{name}}, your order is {{orderId}}', {
      name: 'Alice',
      orderId: '42',
    });
    expect(out).toBe('Hello Alice, your order is 42');
  });

  test('throws TemplateRenderError when required vars missing', () => {
    expect(() => renderTemplate('Hi {{name}}', {})).toThrow(TemplateRenderError);
    try {
      renderTemplate('Hi {{a}} {{b}}', { a: 'x' });
    } catch (err) {
      expect(err).toBeInstanceOf(TemplateRenderError);
      expect((err as TemplateRenderError).missing).toEqual(['b']);
    }
  });

  test('allowMissing renders empty for absent vars', () => {
    expect(renderTemplate('Hi {{name}}', {}, { allowMissing: true })).toBe('Hi ');
  });

  test('escapes HTML angle brackets', () => {
    expect(renderTemplate('{{x}}', { x: '<script>alert(1)</script>' })).toBe(
      '&lt;script&gt;alert(1)&lt;/script&gt;',
    );
  });

  test('strips NUL and control chars', () => {
    expect(sanitizeValue('a\x00b\x07c')).toBe('abc');
    expect(sanitizeValue('keep\ttab\nnewline')).toBe('keep\ttab\nnewline');
  });

  test('truncates values to MAX_VAR_LENGTH', () => {
    const long = 'x'.repeat(2000);
    const out = renderTemplate('{{v}}', { v: long });
    expect(out.length).toBe(1024);
  });

  test('extractVariables returns sorted unique list', () => {
    expect(extractVariables('Hi {{name}}, you {{name}} again {{foo}}')).toEqual(['foo', 'name']);
    expect(extractVariables('no vars here')).toEqual([]);
  });

  test('isValidVariableName enforces identifier shape', () => {
    expect(isValidVariableName('name')).toBe(true);
    expect(isValidVariableName('_x1')).toBe(true);
    expect(isValidVariableName('1bad')).toBe(false);
    expect(isValidVariableName('bad-name')).toBe(false);
  });
});
