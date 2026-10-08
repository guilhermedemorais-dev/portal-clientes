import test from 'node:test';
import assert from 'node:assert/strict';
import { OneTimeGrantStore, canReadProject, validateImage, canSyncIssueComment } from '../src/domain.js';

test('one-time grants are consumed exactly once and expire', () => {
  let now = 1000;
  const grants = new OneTimeGrantStore(() => now, 100);
  const grant = grants.issue({ userId: 'u1', projectId: 'p1', role: 'client', revoked: false });
  assert.deepEqual(grants.consume(grant), { userId: 'u1', projectId: 'p1', role: 'client', revoked: false });
  assert.equal(grants.consume(grant), null);
  const expired = grants.issue({ userId: 'u1', projectId: 'p1', role: 'client', revoked: false });
  now += 101;
  assert.equal(grants.consume(expired), null);
});

test('project ACL scopes client and owner access explicitly', () => {
  assert.equal(canReadProject({ userId: 'u1', projectId: 'p1', role: 'client', revoked: false }, 'p1'), true);
  assert.equal(canReadProject({ userId: 'u1', projectId: 'p1', role: 'client', revoked: false }, 'p2'), false);
  assert.equal(canReadProject({ userId: 'u1', projectId: 'p1', role: 'owner', revoked: true }, 'p1'), false);
});

test('image validation rejects SVG and oversized files', () => {
  assert.equal(validateImage({ mime: 'image/png', size: 20, maxBytes: 100 }).ok, true);
  assert.equal(validateImage({ mime: 'image/svg+xml', size: 20, maxBytes: 100 }).ok, false);
  assert.equal(validateImage({ mime: 'image/png', size: 101, maxBytes: 100 }).ok, false);
});

test('only explicitly approved issue comments are syncable', () => {
  assert.equal(canSyncIssueComment({ id: '1', body: 'private', approvedForClient: false }), false);
  assert.equal(canSyncIssueComment({ id: '1', body: 'safe', approvedForClient: true }), true);
});

test('one-time grant is bound to the browser PKCE verifier', async () => {
  const { createHash } = await import('node:crypto');
  const verifier = 'a'.repeat(43);
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  const grants = new OneTimeGrantStore(Date.now, 60_000);
  const grant = grants.issue({ userId:'u', projectId:'p', role:'client', revoked:false }, challenge);
  assert.equal(grants.consume(grant, 'b'.repeat(43)), null);
});

test('expiring stores discard stale entries and enforce a hard size limit', async () => {
  const { pruneExpiringMap } = await import('../src/domain.js');
  const entries = new Map<string, { expiresAt: number }>([['old', { expiresAt: 5 }], ['first', { expiresAt: 20 }], ['second', { expiresAt: 30 }]]);
  pruneExpiringMap(entries, 10, 2);
  assert.deepEqual([...entries.keys()], ['second']);
});

test('unknown HTTP methods collapse to a finite metrics label', async () => {
  const { normalizeMetricMethod } = await import('../src/domain.js');
  assert.equal(normalizeMetricMethod('GET'), 'GET');
  assert.equal(normalizeMetricMethod('BREW_AND_CARDINALITY'), 'OTHER');
});
