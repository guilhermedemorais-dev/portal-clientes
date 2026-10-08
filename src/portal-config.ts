export type PortalConfig = {
  projectName: string;
  projectId: string;
  projectBio?: string;
  apiBaseUrl: string;
  boardUrl?: string;
  logoUrl?: string;
};

export function parsePortalConfig(input: unknown): PortalConfig {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid public portal configuration');
  const value = input as Record<string, unknown>;
  const allowed = new Set(['projectName', 'projectId', 'projectBio', 'apiBaseUrl', 'boardUrl', 'logoUrl']);
  const credential = Object.keys(value).find((key) => /secret|token|password|credential|private.?key/i.test(key));
  if (credential) throw new Error(`Public configuration cannot contain credential field: ${credential}`);
  const extra = Object.keys(value).find((key) => !allowed.has(key));
  if (extra) throw new Error(`Unknown public configuration field: ${extra}`);
  const text = (key: string, required = false): string | undefined => {
    const candidate = value[key];
    if (candidate === undefined && !required) return undefined;
    if (typeof candidate !== 'string' || (required && !candidate.trim())) throw new Error(`Invalid ${key}`);
    return candidate.trim();
  };
  const projectName = text('projectName', true)!;
  const projectId = text('projectId', true)!;
  const apiBaseUrl = text('apiBaseUrl', true)!;
  let apiUrl: URL;
  try { apiUrl = new URL(apiBaseUrl); } catch { throw new Error('apiBaseUrl must be a valid HTTPS URL'); }
  if (apiUrl.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(apiUrl.hostname)) {
    throw new Error('Remote API must use HTTPS');
  }
  const boardUrl = text('boardUrl');
  const logoUrl = text('logoUrl');
  for (const [key, url] of [['boardUrl', boardUrl], ['logoUrl', logoUrl]] as const) {
    if (url) {
      let parsed: URL;
      try { parsed = new URL(url); } catch { throw new Error(`${key} must be a valid URL`); }
      if (!['https:', 'http:'].includes(parsed.protocol)) throw new Error(`${key} must use HTTP(S)`);
    }
  }
  return { projectName, projectId, apiBaseUrl: apiUrl.toString().replace(/\/$/, ''), projectBio: text('projectBio'), boardUrl, logoUrl };
}
