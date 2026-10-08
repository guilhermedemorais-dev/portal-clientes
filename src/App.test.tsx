import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import App from './App';

afterEach(() => { cleanup(); delete window.PORTAL_CONFIG; sessionStorage.clear(); vi.restoreAllMocks(); });

describe('Portal', () => {
  it('does not show private project content until a session exists', async () => {
    window.PORTAL_CONFIG = { projectName: 'Portal Aurora', projectId: 'aurora', apiBaseUrl: 'https://api.example.test' };
    render(<App />);
    expect(await screen.findByRole('heading', { name: /entre para acompanhar o projeto/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /entrar com github/i })).toBeInTheDocument();
    expect(screen.queryByText(/nenhuma atualização publicada/i)).not.toBeInTheDocument();
  });

  it('shows a clear setup state when no public configuration exists', async () => {
    window.PORTAL_CONFIG = null;
    render(<App />);
    expect(await screen.findByRole('heading', { name: /configuração necessária/i })).toBeInTheDocument();
    expect(screen.getByText(/nenhum dado fictício será exibido/i)).toBeInTheDocument();
  });

  it('exchanges the callback grant and renders fixture API data without persisting the bearer', async () => {
    window.PORTAL_CONFIG = { projectName: 'Portal Aurora', projectId: 'aurora', apiBaseUrl: 'https://api.example.test' };
    window.history.pushState({}, '', '/?grant=one-time-grant');
    sessionStorage.setItem('portal_pkce_verifier', 'v'.repeat(43));
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith('/v1/auth/exchange')) return new Response(JSON.stringify({ accessToken: 'memory-only-token' }), { status: 200 });
      if (url.endsWith('/v1/me')) return new Response(JSON.stringify({ user: { id: 'github:1', login: 'client', displayName: 'Cliente' }, projectId: 'aurora', role: 'client' }), { status: 200 });
      if (url.includes('/feed')) return new Response(JSON.stringify({ items: [{ id: 'p1', body: 'Entrega aprovada para validação.', status: 'published', createdAt: '2026-10-08T10:00:00Z', author: { id: 'owner', name: 'Responsável' }, likes: 2, likedByMe: false, attentionByMe: false, moduleTitle: 'Fundação', taskNumber: 'TASK-01', issueUrl: 'https://github.com/org/repo/issues/1' }, { id: 'p2', body: 'Feedback aguardando análise.', status: 'pending', createdAt: '2026-10-08T10:01:00Z', author: { id: 'github:1', name: 'Cliente' }, likes: 0, likedByMe: false, attentionByMe: false }] }), { status: 200 });
      if (url.includes('/dashboard')) return new Response(JSON.stringify({ stages: [{ id: 's1', title: 'Fundação', status: 'done' }], tasks: { done: 0, inProgress: 0, blocked: 0, eligible: 0 }, progress: { numerator: 0, denominator: 0, formula: 'done / eligible', source: 'Issues do projeto' }, estimate: null, lastUpdated: '2026-10-08T10:00:00Z' }), { status: 200 });
      throw new Error(`Unexpected API call: ${url}`);
    });
    render(<App />);
    expect(await screen.findByText('Entrega aprovada para validação.')).toBeInTheDocument();
    expect(screen.getByText('PENDENTE DE TRIAGEM')).toBeInTheDocument();
    expect(window.location.search).toBe('');
    expect(sessionStorage.getItem('portal_pkce_verifier')).toBeNull();
    expect(screen.getByLabelText(/comentário/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: /dashboard/i }));
    expect(screen.getByRole('heading', { name: /etapas e tarefas/i })).toBeInTheDocument();
    expect(screen.getAllByText('Não disponível').length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    expect(screen.getAllByText(/fonte: issues do projeto/i)).toHaveLength(2);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(sessionStorage.getItem('portal_access_token')).toBeNull();
  });

  it('resumes a pending feedback upload without creating duplicate feedback', async () => {
    window.PORTAL_CONFIG = { projectName: 'Portal Aurora', projectId: 'aurora', apiBaseUrl: 'https://api.example.test' };
    window.history.pushState({}, '', '/?grant=one-time-grant');
    sessionStorage.setItem('portal_pkce_verifier', 'v'.repeat(43));
    let createdPosts = 0; let uploadCalls = 0; let uploadUrl = '';
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith('/v1/auth/exchange')) return new Response(JSON.stringify({ accessToken: 'memory-only-token' }), { status: 200 });
      if (url.endsWith('/v1/me')) return new Response(JSON.stringify({ user: { id: 'github:1', login: 'client', displayName: 'Cliente' }, projectId: 'aurora', role: 'client' }), { status: 200 });
      if (url.includes('/feed')) return new Response(JSON.stringify({ items: [] }), { status: 200 });
      if (url.includes('/dashboard')) return new Response(JSON.stringify({ stages: [], tasks: { done: 0, inProgress: 0, blocked: 0, eligible: 0 }, progress: { numerator: 0, denominator: 0, formula: 'done / eligible', source: 'Issues' }, estimate: null }), { status: 200 });
      if (url.endsWith('/posts') && url.startsWith('https://api.example.test')) { createdPosts += 1; return new Response(JSON.stringify({ post: { id: 'pending-post-1' } }), { status: 201 }); }
      if (url.includes('/uploads?')) { uploadCalls += 1; uploadUrl = url; return uploadCalls === 1 ? new Response(JSON.stringify({ error: 'invalid_image' }), { status: 415 }) : new Response(JSON.stringify({ id: 'upload-1', url: '/v1/projects/aurora/uploads/upload-1', mime: 'image/png', size: 200, description: 'Falha na tela de pagamento' }), { status: 201 }); }
      throw new Error(`Unexpected API call: ${url}`);
    });
    render(<App />);
    await screen.findByLabelText(/compartilhe uma dúvida/i);
    fireEvent.change(screen.getByLabelText(/compartilhe uma dúvida/i), { target: { value: 'Não consigo finalizar o pagamento.' } });
    fireEvent.change(screen.getByLabelText(/descrição da imagem/i), { target: { value: 'Falha na tela de pagamento' } });
    fireEvent.change(screen.getByLabelText(/anexar imagem ao feedback/i), { target: { files: [new File(['synthetic image'], 'screen.png', { type: 'image/png' })] } });
    fireEvent.click(screen.getByRole('button', { name: /enviar para triagem/i }));
    expect(await screen.findByText(/não foi possível anexar esta imagem/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /retomar envio/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /retomar envio/i }));
    expect(await screen.findByText(/feedback enviado para triagem/i)).toBeInTheDocument();
    expect(createdPosts).toBe(1);
    expect(uploadCalls).toBe(2);
    expect(uploadUrl).toContain('postId=pending-post-1');
    expect(uploadUrl).toContain('description=Falha+na+tela+de+pagamento');
  });
});
