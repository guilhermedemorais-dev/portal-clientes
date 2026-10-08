import { describe, expect, it, vi } from 'vitest';
import { ApiError, requestJson } from './api';

describe('requestJson', () => {
  it('sends the in-memory access token only as a bearer header', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    await expect(requestJson('https://api.example.test', '/v1/projects/aurora/feed', 'short-lived-token', fetcher))
      .resolves.toEqual({ ok: true });
    expect(fetcher).toHaveBeenCalledWith('https://api.example.test/v1/projects/aurora/feed', expect.objectContaining({
      credentials: 'omit',
      headers: expect.objectContaining({ Authorization: 'Bearer short-lived-token' }),
    }));
  });

  it('distinguishes expired and forbidden sessions without returning private response text', async () => {
    const expired = vi.fn().mockResolvedValue(new Response('private details', { status: 401 }));
    await expect(requestJson('https://api.example.test', '/private', 'token', expired)).rejects.toMatchObject({ status: 401 });
    const denied = vi.fn().mockResolvedValue(new Response('private details', { status: 403 }));
    await expect(requestJson('https://api.example.test', '/private', 'token', denied)).rejects.toMatchObject({ status: 403 });
    try { await requestJson('https://api.example.test', '/private', 'token', denied); }
    catch (error) { expect(error).toBeInstanceOf(ApiError); expect((error as Error).message).not.toContain('private details'); }
  });
});
