import { createHash, randomBytes } from 'node:crypto';

export type Principal = { userId: string; projectId: string; role: 'owner' | 'client'; revoked: boolean };
export class OneTimeGrantStore {
  private values = new Map<string, { principal: Principal; expiresAt: number; challenge?: string }>();
  constructor(private now = Date.now, private ttlMs = 60_000) {}
  issue(principal: Principal, challenge?: string): string {
    pruneExpiringMap(this.values, this.now(), 10_000);
    const token = randomBytes(32).toString('base64url');
    this.values.set(token, { principal, expiresAt: this.now() + this.ttlMs, challenge });
    return token;
  }
  consume(token: string, verifier?: string): Principal | null {
    pruneExpiringMap(this.values, this.now(), 10_000);
    const entry = this.values.get(token);
    this.values.delete(token);
    if (!entry || entry.expiresAt <= this.now()) return null;
    if (entry.challenge) {
      if (!verifier || !/^[A-Za-z0-9._~-]{43,128}$/.test(verifier)) return null;
      const actual = createHash('sha256').update(verifier).digest('base64url');
      if (actual !== entry.challenge) return null;
    }
    return entry.principal;
  }
}
export function canReadProject(principal: Principal, projectId: string): boolean {
  return !principal.revoked && principal.projectId === projectId && ['owner', 'client'].includes(principal.role);
}
export function validateImage(input: { mime: string; size: number; maxBytes: number }): { ok: boolean; reason?: string } {
  if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(input.mime)) return { ok: false, reason: 'unsupported_type' };
  if (!Number.isFinite(input.size) || input.size < 1 || input.size > input.maxBytes) return { ok: false, reason: 'invalid_size' };
  return { ok: true };
}
export function canSyncIssueComment(comment: { id: string; body: string; approvedForClient: boolean }): boolean {
  return Boolean(comment.id && comment.approvedForClient && comment.body.trim());
}

export function pruneExpiringMap<T extends {expiresAt:number}>(entries: Map<string,T>, now: number, maxEntries: number): void {
  for (const [key,value] of entries) if (value.expiresAt <= now) entries.delete(key);
  while (entries.size >= maxEntries) {
    const oldest=entries.keys().next().value as string|undefined;
    if (oldest===undefined) break;
    entries.delete(oldest);
  }
}
export function normalizeMetricMethod(method: string): string {
  return ['GET','POST','PUT','PATCH','DELETE','OPTIONS','HEAD'].includes(method) ? method : 'OTHER';
}
