/**
 * Pages Function — proxy /api/* requests from the dashboard to the
 * openwa-api Worker. Adds same-origin convenience so the SPA can keep
 * using relative URLs and we don't need CORS on the worker.
 *
 * The upstream worker base URL is taken from the API_BASE_URL Pages var
 * (set in wrangler.toml or via the Pages dashboard).
 *
 * Path mapping:
 *   /api/<anything>   →   $API_BASE_URL/v1/<anything>
 *   /api/health       →   $API_BASE_URL/health
 *   /api/docs         →   $API_BASE_URL/docs
 */

type Env = { API_BASE_URL?: string };

const TOP_LEVEL = new Set(['health', 'ready', 'live', 'docs', 'openapi.json']);

export const onRequest: PagesFunction<Env> = async (ctx) => {
  const base = ctx.env.API_BASE_URL?.replace(/\/+$/, '');
  if (!base) {
    return new Response(
      JSON.stringify({ error: { code: 'CONFIG_ERROR', message: 'API_BASE_URL not set' } }),
      { status: 500, headers: { 'content-type': 'application/json' } },
    );
  }

  const url = new URL(ctx.request.url);
  // Strip the leading /api/ prefix the SPA uses.
  const rest = url.pathname.replace(/^\/api\/?/, '');
  const first = rest.split('/')[0] ?? '';
  const upstreamPath = TOP_LEVEL.has(first) ? `/${rest}` : `/v1/${rest}`;
  const upstream = `${base}${upstreamPath}${url.search}`;

  const headers = new Headers(ctx.request.headers);
  headers.delete('host');
  headers.delete('cf-connecting-ip');

  const init: RequestInit = {
    method: ctx.request.method,
    headers,
    body: ['GET', 'HEAD'].includes(ctx.request.method) ? undefined : ctx.request.body,
    redirect: 'manual',
  };

  const resp = await fetch(upstream, init);
  // Mirror the response; the body stream is passed through.
  const outHeaders = new Headers(resp.headers);
  outHeaders.set('x-openwa-proxy', 'pages-fn');
  return new Response(resp.body, { status: resp.status, headers: outHeaders });
};
