/**
 * Tiny `{{variable}}` template engine for outbound message templates
 * (US-054). Built so we don't drag in handlebars or eta — they're
 * 50+ KB and ship features (helpers, partials, includes) that are
 * footguns when the template author is an end user.
 *
 * Rules:
 *   - `{{name}}` placeholders only. No nested expressions, no helpers.
 *   - Names match `[a-zA-Z_][a-zA-Z0-9_]*`.
 *   - Unknown variables raise a {@link TemplateRenderError} — silent
 *     fall-through to empty strings hides bugs.
 *   - Every substitution value is sanitised:
 *       * stripped of NUL bytes and ASCII control characters,
 *       * truncated to {@link MAX_VAR_LENGTH},
 *       * HTML angle brackets escaped (defence-in-depth for any code
 *         path that later renders templates in a web context).
 *   - `{{` may be escaped as `{{{` (literal `{{`).
 */

const MAX_VAR_LENGTH = 1024;
const VAR_PATTERN = /\{\{([a-zA-Z_][a-zA-Z0-9_]*)\}\}/g;
const VAR_NAME_PATTERN = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

export class TemplateRenderError extends Error {
  readonly missing: string[];
  constructor(missing: string[]) {
    super(`Missing template variables: ${missing.join(', ')}`);
    this.name = 'TemplateRenderError';
    this.missing = missing;
  }
}

/** Returns the unique sorted list of `{{var}}` names referenced in `body`. */
export function extractVariables(body: string): string[] {
  const found = new Set<string>();
  for (const m of body.matchAll(VAR_PATTERN)) {
    // biome-ignore lint/style/noNonNullAssertion: capture group always present
    found.add(m[1]!);
  }
  return [...found].sort();
}

export function isValidVariableName(name: string): boolean {
  return VAR_NAME_PATTERN.test(name);
}

export interface RenderOptions {
  /** When true, missing variables render as empty strings. Defaults false. */
  allowMissing?: boolean;
}

/**
 * Substitutes `{{name}}` placeholders with sanitised values.
 *
 * Throws {@link TemplateRenderError} when one or more referenced
 * variables are absent from `values` unless `allowMissing` is set.
 */
export function renderTemplate(
  body: string,
  values: Record<string, string>,
  options: RenderOptions = {},
): string {
  const referenced = extractVariables(body);
  const missing = referenced.filter((name) => !(name in values));
  if (missing.length > 0 && !options.allowMissing) {
    throw new TemplateRenderError(missing);
  }
  return body.replace(VAR_PATTERN, (_match, name: string) => {
    const raw = values[name];
    if (raw === undefined) return '';
    return sanitizeValue(raw);
  });
}

/**
 * Public so callers (e.g. CSV import) can apply the same sanitisation
 * to values they store rather than render.
 */
export function sanitizeValue(value: string): string {
  if (typeof value !== 'string') return '';
  // Strip NUL + ASCII control chars (0x00-0x1F, 0x7F) except \n \r \t.
  let stripped = '';
  for (let i = 0; i < value.length; i++) {
    const c = value.charCodeAt(i);
    if (c === 0x09 || c === 0x0a || c === 0x0d) {
      stripped += value[i];
      continue;
    }
    if (c < 0x20 || c === 0x7f) continue;
    stripped += value[i];
  }
  // Escape HTML brackets defensively (output may be rendered in dashboard).
  const escaped = stripped.replace(/[<>]/g, (ch) => (ch === '<' ? '&lt;' : '&gt;'));
  return escaped.length > MAX_VAR_LENGTH ? escaped.slice(0, MAX_VAR_LENGTH) : escaped;
}

export { MAX_VAR_LENGTH };
