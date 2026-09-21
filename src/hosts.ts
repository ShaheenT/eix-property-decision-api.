const HOSTS = (process.env.ALLOWED_HOSTS ?? 'property24.com,privateproperty.co.za,property.mg.co.za,chaseveritt.co.za,pamgolding.co.za,seeff.com,remax.co.za,rawson.co.za,greeff.co.za').split(',');
/** SSRF guard: http(s) only, default port, no credentials, host must be on the allowlist (exact or subdomain). */
export function allowedUrl(raw: string): URL | null {
  try {
    const u = new URL(raw);
    const ok = ['http:', 'https:'].includes(u.protocol) && !u.port && !u.username && HOSTS.some(h => u.hostname === h || u.hostname.endsWith('.' + h));
    return ok ? u : null;
  } catch { return null; }
}

