import type { BaseIssue } from 'valibot';

export interface FormattedIssue {
  path: string;
  message: string;
  expected?: string;
  received?: string;
}

export interface FormattedValidationError {
  code: 'VALIDATION_ERROR';
  message: string;
  issues: FormattedIssue[];
}

export function formatIssues(issues: readonly BaseIssue<unknown>[]): FormattedValidationError {
  return {
    code: 'VALIDATION_ERROR',
    message: 'Request validation failed',
    issues: issues.map((i) => ({
      path: (i.path ?? []).map((p) => String((p as { key?: unknown }).key ?? '')).join('.'),
      message: i.message,
      expected: i.expected ?? undefined,
      received: i.received ?? undefined,
    })),
  };
}
