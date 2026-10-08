import { useCallback, useEffect, useMemo, useState } from 'react';
import { Activity, ArrowUpRight, Check, CircleAlert, ExternalLink, FileImage, Heart, LoaderCircle, LockKeyhole, LogOut, MessageCircle, RefreshCw, Send, ShieldCheck, ThumbsUp } from 'lucide-react';
import { ApiError, requestJson, sendJson } from './api';
import { parsePortalConfig, type PortalConfig } from './portal-config';
import './styles.css';

declare global { interface Window { PORTAL_CONFIG?: unknown } }

type Person = { id: string; name: string; avatarUrl?: string };
type Attachment = { id: string; url?: string; name?: string; description?: string; mime?: string; size?: number };
type Post = { id: string; body: string; status?: string; createdAt: string; author: Person; likes: number; likedByMe: boolean; attentionByMe: boolean; moduleTitle?: string; taskNumber?: string; issueUrl?: string; attachments?: Attachment[] };
type Feed = { items: Post[]; nextCursor?: string | null };
type Comment = { id: string; body: string; createdAt: string; author: Person };
type Dashboard = { stages: Array<{ id: string; title: string; status: string; issueUrl?: string }>; tasks: { done: number; inProgress: number; blocked: number; eligible: number }; progress: { numerator: number; denominator: number; formula: string; source: string }; estimate?: { date: string; updatedAt: string; owner: string; source: string } | null; lastUpdated?: string };
type Identity = { id: string; login: string; name: string; avatarUrl?: string; projectId: string; role: 'owner' | 'client' };
type MeResponse = { user: { id: string; login: string; displayName: string; avatarUrl?: string }; projectId: string; role: 'owner' | 'client' };

function configFromWindow(): PortalConfig | null {
  try { return parsePortalConfig(window.PORTAL_CONFIG); } catch { return null; }
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Data indisponível' : new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

function humanStatus(status: string) {
  const labels: Record<string, string> = { done: 'concluída', completed: 'concluída', in_progress: 'em andamento', blocked: 'bloqueada', review: 'em revisão', pending: 'a fazer' };
  return labels[status.toLowerCase()] ?? 'não disponível';
}

function bytesLabel(bytes?: number) { return bytes ? `${Math.max(1, Math.round(bytes / 1024))} KB` : 'anexo privado'; }

async function pkcePair() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const verifier = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  const challenge = btoa(String.fromCharCode(...new Uint8Array(digest))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return { verifier, challenge };
}

export default function App() {
  const config = useMemo(configFromWindow, []);
  const [token, setToken] = useState<string | null>(null);
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [tab, setTab] = useState<'feed' | 'dashboard'>('feed');
  const [feed, setFeed] = useState<Feed | null>(null);
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [comments, setComments] = useState<Record<string, Comment[]>>({});
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});
  const [openComments, setOpenComments] = useState<string | null>(null);
  const [pageState, setPageState] = useState<'config' | 'checking' | 'signed_out' | 'loading' | 'ready' | 'denied' | 'error'>('checking');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [feedbackDraft, setFeedbackDraft] = useState('');
  const [feedbackImage, setFeedbackImage] = useState<File | null>(null);
  const [pendingFeedbackId, setPendingFeedbackId] = useState<string | null>(null);
  const [attachmentDescriptions, setAttachmentDescriptions] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState('');

  const loadProject = useCallback(async (accessToken: string) => {
    if (!config) return;
    setPageState('loading'); setError('');
    try {
      const [me, nextFeed, nextDashboard] = await Promise.all([
        requestJson<MeResponse>(config.apiBaseUrl, '/v1/me', accessToken),
        requestJson<Feed>(config.apiBaseUrl, `/v1/projects/${encodeURIComponent(config.projectId)}/feed`, accessToken),
        requestJson<Dashboard>(config.apiBaseUrl, `/v1/projects/${encodeURIComponent(config.projectId)}/dashboard`, accessToken),
      ]);
      if (me.projectId !== config.projectId || !['owner', 'client'].includes(me.role)) {
        setToken(null); setIdentity(null); setPageState('denied'); return;
      }
      setIdentity({ id: me.user.id, login: me.user.login, name: me.user.displayName, avatarUrl: me.user.avatarUrl, projectId: me.projectId, role: me.role });
      setFeed({ ...nextFeed, items: nextFeed.items.map((post) => ({ ...post, attachments: post.attachments?.map((item) => ({ ...item, url: item.url?.startsWith('http') ? item.url : `${config.apiBaseUrl}${item.url || `/v1/projects/${encodeURIComponent(config.projectId)}/uploads/${encodeURIComponent(item.id)}`}` })) })) });
      setDashboard(nextDashboard); setPageState('ready');
    } catch (cause) {
      setToken(null); setIdentity(null);
      if (cause instanceof ApiError && cause.status === 401) { setPageState('signed_out'); setError('Sua sessão expirou. Entre novamente.'); }
      else if (cause instanceof ApiError && cause.status === 403) { setPageState('denied'); setError(cause.message); }
      else { setPageState('error'); setError(cause instanceof Error ? cause.message : 'Falha ao carregar os dados do projeto.'); }
    }
  }, [config]);

  useEffect(() => {
    if (!config) { setPageState('config'); return; }
    const query = new URLSearchParams(window.location.search);
    const grant = query.get('grant');
    if (grant) {
      window.history.replaceState({}, document.title, `${window.location.pathname}${window.location.hash}`);
      const verifier = sessionStorage.getItem('portal_pkce_verifier');
      sessionStorage.removeItem('portal_pkce_verifier');
      if (!verifier) { setPageState('signed_out'); setError('O fluxo seguro expirou. Entre novamente.'); return; }
      void fetch(`${config.apiBaseUrl}/v1/auth/exchange`, {
        method: 'POST', credentials: 'omit', cache: 'no-store', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ grant, verifier }),
      }).then(async (response) => {
        if (!response.ok) throw new Error('Não foi possível concluir o login. Entre novamente.');
        const result = await response.json() as { accessToken: string };
        setToken(result.accessToken); void loadProject(result.accessToken);
      }).catch((cause: unknown) => { setError(cause instanceof Error ? cause.message : 'Falha no login.'); setPageState('signed_out'); });
      return;
    }
    const url = new URL(window.location.href);
    if (url.searchParams.has('error')) { url.searchParams.delete('error'); window.history.replaceState({}, document.title, url.pathname); setError('O GitHub não concluiu o login.'); setPageState('signed_out'); return; }
    setPageState('signed_out');
  }, [config, loadProject]);

  async function signIn() {
    if (!config) return;
    setBusy('login'); setError('');
    try {
      const { verifier, challenge } = await pkcePair();
      sessionStorage.setItem('portal_pkce_verifier', verifier);
      const loginUrl = new URL(`${config.apiBaseUrl}/v1/auth/github`);
      loginUrl.searchParams.set('challenge', challenge);
      window.location.assign(loginUrl.toString());
    } catch { sessionStorage.removeItem('portal_pkce_verifier'); setError('Não foi possível iniciar o login seguro.'); setBusy(null); }
  }

  async function refresh() { if (token) await loadProject(token); }
  function signOut() { if (config && token) void sendJson(config.apiBaseUrl, '/v1/auth/logout', token, 'POST').catch(() => undefined); setToken(null); setIdentity(null); setFeed(null); setDashboard(null); setComments({}); setPageState('signed_out'); setNotice('Você saiu do portal.'); }

  async function downloadAttachment(attachment: Attachment) {
    if (!config || !token) return;
    setBusy(`download:${attachment.id}`);
    try {
      const response = await fetch(`${config.apiBaseUrl}/v1/projects/${encodeURIComponent(config.projectId)}/uploads/${encodeURIComponent(attachment.id)}`, { credentials: 'omit', cache: 'no-store', headers: { Authorization: `Bearer ${token}` } });
      if (!response.ok) throw new ApiError(response.status, response.status === 403 ? 'Acesso ao anexo não autorizado.' : 'Não foi possível abrir o anexo.');
      const blob = await response.blob();
      if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(blob.type)) throw new Error('O servidor retornou um tipo de arquivo inválido.');
      const objectUrl = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = objectUrl; link.download = attachment.name || `captura-${attachment.id}`; link.click();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 30_000);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível abrir o anexo.'); }
    finally { setBusy(null); }
  }

  async function togglePostAction(post: Post, action: 'like' | 'attention') {
    if (!config || !token) return;
    const key = `${post.id}:${action}`; setBusy(key); setNotice('');
    const active = action === 'like' ? post.likedByMe : post.attentionByMe;
    const path = `/v1/projects/${encodeURIComponent(config.projectId)}/posts/${encodeURIComponent(post.id)}/${action}`;
    try {
      await sendJson(config.apiBaseUrl, path, token, active ? 'DELETE' : 'POST');
      setFeed((current) => current ? { ...current, items: current.items.map((item) => item.id !== post.id ? item : action === 'like' ? { ...item, likedByMe: !active, likes: Math.max(0, item.likes + (active ? -1 : 1)) } : { ...item, attentionByMe: !active }) } : current);
      setNotice(action === 'attention' && !active ? 'A sinalização foi enviada ao responsável. Ela não altera a prioridade técnica.' : 'Atualizado.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível salvar.'); }
    finally { setBusy(null); }
  }

  async function loadComments(postId: string) {
    if (!config || !token) return;
    setOpenComments((current) => current === postId ? null : postId);
    if (comments[postId]) return;
    try { const result = await requestJson<{ comments: Comment[] }>(config.apiBaseUrl, `/v1/projects/${encodeURIComponent(config.projectId)}/posts/${encodeURIComponent(postId)}/comments`, token); setComments((current) => ({ ...current, [postId]: result.comments })); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível carregar os comentários.'); }
  }

  async function submitComment(postId: string) {
    if (!config || !token) return;
    const body = commentDrafts[postId]?.trim(); if (!body) return;
    setBusy(`comment:${postId}`);
    try {
      const result = await sendJson<{ comment: Comment }>(config.apiBaseUrl, `/v1/projects/${encodeURIComponent(config.projectId)}/posts/${encodeURIComponent(postId)}/comments`, token, 'POST', { body });
      const saved = result.comment;
      setComments((current) => ({ ...current, [postId]: [...(current[postId] ?? []), saved] })); setCommentDrafts((current) => ({ ...current, [postId]: '' })); setNotice('Comentário enviado para triagem do responsável.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível enviar o comentário.'); }
    finally { setBusy(null); }
  }

  async function uploadImage(postId: string, file?: File, description?: string): Promise<boolean> {
    if (!config || !token || !file) return false;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 5_000_000) { setError('Escolha PNG, JPEG ou WebP de até 5 MB.'); return false; }
    if (!description?.trim()) { setError('Descreva a imagem antes de anexá-la.'); return false; }
    setBusy(`upload:${postId}`);
    try {
      const data = new FormData(); data.append('file', file); data.append('description', description.trim());
      const params = new URLSearchParams({ postId, description: description.trim() });
      const response = await fetch(`${config.apiBaseUrl}/v1/projects/${encodeURIComponent(config.projectId)}/uploads?${params}`, { method: 'POST', credentials: 'omit', headers: { Authorization: `Bearer ${token}` }, body: data });
      if (!response.ok) throw new ApiError(response.status, response.status === 413 ? 'O anexo excede o limite permitido.' : 'Não foi possível anexar esta imagem.');
      const attachment = await response.json() as Attachment;
      setFeed((current) => current ? { ...current, items: current.items.map((item) => item.id === postId ? { ...item, attachments: [...(item.attachments ?? []), { ...attachment, name: file.name, description: description.trim(), url: `${config.apiBaseUrl}${attachment.url || `/v1/projects/${encodeURIComponent(config.projectId)}/uploads/${encodeURIComponent(attachment.id)}`}` }] } : item) } : current);
      setAttachmentDescriptions((current) => ({ ...current, [postId]: '' }));
      setNotice('Imagem anexada ao contexto desta publicação.');
      return true;
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Falha no envio do anexo.'); return false; }
    finally { setBusy(null); }
  }

  async function submitFeedback(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!config || !token || !feedbackDraft.trim()) return;
    setBusy('feedback'); setError('');
    try {
      let postId = pendingFeedbackId;
      if (!postId) {
        const result = await sendJson<{ post: { id: string } }>(config.apiBaseUrl, `/v1/projects/${encodeURIComponent(config.projectId)}/posts`, token, 'POST', { body: feedbackDraft.trim() });
        postId = result.post.id; setPendingFeedbackId(postId);
      }
      if (feedbackImage && !(await uploadImage(postId, feedbackImage, attachmentDescriptions.newFeedback))) return;
      setPendingFeedbackId(null); setFeedbackDraft(''); setFeedbackImage(null); setAttachmentDescriptions((current) => ({ ...current, newFeedback: '' }));
      await loadProject(token); setNotice('Feedback enviado para triagem do responsável.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível enviar o feedback.'); }
    finally { setBusy(null); }
  }

  const projectHeader = <header className="project-header">
    <div className="project-identity">
      {config?.logoUrl ? <img className="project-avatar" src={config.logoUrl} alt="" /> : <div className="project-avatar fallback" aria-hidden="true">{(config?.projectName || 'P').slice(0, 1).toUpperCase()}</div>}
      <div><p className="eyebrow">PORTAL DO PROJETO / {config?.projectId || 'CONFIGURAÇÃO'}</p><h1>{config?.projectName || 'Portal do projeto'}</h1><p className="project-bio">{config?.projectBio || 'Acompanhe etapas, entregas e próximos passos do projeto.'}</p></div>
    </div>
    <div className="header-actions">
      {identity && <span className="identity-chip"><ShieldCheck size={14} aria-hidden="true" />{identity.login} · {identity.role === 'owner' ? 'responsável' : 'cliente'}</span>}
      {config?.boardUrl && <a className="board-link" href={config.boardUrl} target="_blank" rel="noreferrer">Board <ExternalLink size={14} aria-hidden="true" /></a>}
      {identity && <button className="icon-button" type="button" onClick={signOut} aria-label="Sair do portal"><LogOut size={16} /></button>}
    </div>
    {dashboard && <div className="progress-line"><div className="progress-meta"><span>PROGRESSO · {dashboard.progress.numerator}/{dashboard.progress.denominator}</span><span>{dashboard.progress.denominator ? `${Math.round(100 * dashboard.progress.numerator / dashboard.progress.denominator)}%` : 'Não disponível'}</span></div>{dashboard.progress.denominator > 0 && <div className="progress-track" role="progressbar" aria-label="Progresso calculado a partir das tarefas elegíveis" aria-valuenow={Math.round(100 * dashboard.progress.numerator / dashboard.progress.denominator)} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${Math.round(100 * dashboard.progress.numerator / dashboard.progress.denominator)}%` }} /></div>}<small>{dashboard.progress.formula} · Fonte: {dashboard.progress.source}</small></div>}
  </header>;

  return <div className="app-shell">
    <div className="terminal-bar"><span>&gt; portal-cliente / status: {pageState === 'ready' ? 'autorizado' : pageState === 'denied' ? 'negado' : 'aguardando'}</span><span>ACESSO PRIVADO</span></div>
    <main className="container">
      {projectHeader}
      {pageState === 'ready' && <nav className="tabs" role="tablist" aria-label="Seções do projeto">
        <button type="button" role="tab" aria-selected={tab === 'feed'} onClick={() => setTab('feed')}><Activity size={15} /> Feed</button>
        <button type="button" role="tab" aria-selected={tab === 'dashboard'} onClick={() => setTab('dashboard')}><ArrowUpRight size={15} /> Dashboard</button>
        <span className="tab-spacer" />
        {token && <button type="button" className="refresh-button" onClick={() => void refresh()} aria-label="Atualizar"><RefreshCw size={15} /></button>}
      </nav>}

      {notice && <div className="notice" role="status"><Check size={15} />{notice}<button type="button" className="dismiss" onClick={() => setNotice('')} aria-label="Fechar aviso">×</button></div>}
      {error && <div className="alert" role="alert"><CircleAlert size={17} />{error}<button type="button" className="dismiss" onClick={() => setError('')} aria-label="Fechar erro">×</button></div>}

      {(pageState === 'config' || pageState === 'checking' || pageState === 'signed_out' || pageState === 'denied' || pageState === 'error' || pageState === 'loading') && <section className="gate-card" aria-live="polite">
        {pageState === 'config' && <><div className="gate-icon"><CircleAlert /></div><h2>Configuração necessária</h2><p>Defina nome, identificador e URL pública da API para conectar este projeto. Nenhum dado fictício será exibido.</p></>}
        {pageState === 'checking' && <><LoaderCircle className="spin" /><h2>Verificando sessão segura</h2><p>Aguardando retorno do provedor de identidade.</p></>}
        {pageState === 'loading' && <><LoaderCircle className="spin" /><h2>Carregando o projeto</h2><p>O backend está validando seu acesso antes de retornar qualquer dado.</p></>}
        {pageState === 'signed_out' && <><div className="gate-icon"><LockKeyhole /></div><h2>Entre para acompanhar o projeto</h2><p>A conta GitHub identifica você. O responsável pelo projeto precisa autorizar seu acesso.</p><button className="primary-button" type="button" onClick={() => void signIn()} disabled={busy === 'login'}>{busy === 'login' ? 'Preparando…' : 'Entrar com GitHub'}</button></>}
        {pageState === 'denied' && <><div className="gate-icon denied"><LockKeyhole /></div><h2>Acesso não autorizado</h2><p>Esta conta não possui acesso a este projeto. Peça ao responsável para autorizar seu usuário GitHub.</p></>}
        {pageState === 'error' && <><div className="gate-icon denied"><CircleAlert /></div><h2>Não foi possível carregar o projeto</h2><p>Verifique a API e a conexão. O portal não armazena os dados privados no navegador.</p><button type="button" className="secondary-button" onClick={() => token ? void refresh() : setPageState('signed_out')}>Tentar novamente</button></>}
      </section>}

      {pageState === 'ready' && token && identity && <>
        {tab === 'feed' && <section className="feed-section" aria-label="Atualizações do projeto">
          <div className="section-heading"><div><p className="eyebrow">/ ATUALIZAÇÕES</p><h2>Feed do projeto</h2></div><span className="live-dot"><i /> DADOS DO BACKEND</span></div>
          {identity.role === 'client' && <form className="feedback-composer" onSubmit={(event) => void submitFeedback(event)}><label htmlFor="feedback-draft">Compartilhe uma dúvida ou comentário para triagem</label><textarea id="feedback-draft" value={feedbackDraft} onChange={(event) => setFeedbackDraft(event.target.value)} maxLength={5000} placeholder="Escreva seu comentário…" required={!pendingFeedbackId} /><div className="composer-attachment"><label htmlFor="feedback-image-description">Descrição da imagem, se houver anexo</label><input id="feedback-image-description" value={attachmentDescriptions.newFeedback ?? ''} onChange={(event) => setAttachmentDescriptions((current) => ({ ...current, newFeedback: event.target.value }))} maxLength={240} placeholder="Ex.: erro mostrado na tela de pagamento" /><input type="file" accept="image/png,image/jpeg,image/webp" aria-label="Anexar imagem ao feedback" onChange={(event) => setFeedbackImage(event.currentTarget.files?.[0] ?? null)} /></div><button type="submit" className="primary-button" disabled={(!feedbackDraft.trim() && !pendingFeedbackId) || busy === 'feedback'}><Send size={15} />{pendingFeedbackId ? 'Retomar envio' : 'Enviar para triagem'}</button><small>Feedback não cria uma task nem muda prioridade ou prazo automaticamente. Se o anexo falhar, o mesmo envio pode ser retomado sem duplicar o comentário.</small></form>}
          {feed?.items.length ? feed.items.map((post) => <article className="post-card" key={post.id}>
            <div className="post-top"><div className="author-avatar">{post.author.avatarUrl ? <img src={post.author.avatarUrl} alt="" /> : post.author.name.slice(0, 1).toUpperCase()}</div><div className="author-info"><strong>{post.author.name}</strong><span>{formatDate(post.createdAt)}</span></div><span className="source-chip">{post.status === 'pending' ? 'PENDENTE DE TRIAGEM' : post.issueUrl ? 'ISSUE APROVADA' : 'CHECKPOINT'}</span></div>
            <p className="post-body">{post.body}</p>
            {(post.moduleTitle || post.taskNumber || post.issueUrl) && <div className="post-context"><span>{post.moduleTitle || 'Projeto'}{post.taskNumber ? ` · ${post.taskNumber}` : ''}</span>{post.issueUrl && <a href={post.issueUrl} target="_blank" rel="noreferrer">Issue <ExternalLink size={13} /></a>}</div>}
            {post.attachments?.length ? <div className="attachments">{post.attachments.map((file) => <button type="button" className="attachment" key={file.id} onClick={() => void downloadAttachment(file)} disabled={busy === `download:${file.id}`}><FileImage size={16} /><span>{file.name || file.description || 'Captura de tela'}<small>{file.description && file.name ? `${file.description} · ` : ''}{bytesLabel(file.size)}</small></span><ExternalLink size={13} /></button>)}</div> : null}
            <div className="post-actions"><button type="button" onClick={() => void togglePostAction(post, 'like')} disabled={busy === `${post.id}:like`} aria-pressed={post.likedByMe} className={post.likedByMe ? 'pressed' : ''}><Heart size={16} />{post.likes} curtidas</button><button type="button" onClick={() => void loadComments(post.id)} aria-expanded={openComments === post.id}><MessageCircle size={16} />Comentários</button><button type="button" onClick={() => void togglePostAction(post, 'attention')} disabled={busy === `${post.id}:attention`} aria-pressed={post.attentionByMe} className={post.attentionByMe ? 'attention-active' : ''}><ThumbsUp size={15} />Precisa de atenção</button>
              {identity.role === 'owner' && <label className="upload-button"><FileImage size={15} />Anexar imagem<input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => { void uploadImage(post.id, event.currentTarget.files?.[0], attachmentDescriptions[post.id]); event.currentTarget.value = ''; }} disabled={busy === `upload:${post.id}`} /></label>}
            </div>
            {identity.role === 'owner' && <input className="attachment-description" aria-label={`Descrição do anexo para ${post.body.slice(0, 30)}`} value={attachmentDescriptions[post.id] ?? ''} onChange={(event) => setAttachmentDescriptions((current) => ({ ...current, [post.id]: event.target.value }))} placeholder="Descreva a imagem antes de anexar" maxLength={240} />}
            {openComments === post.id && <div className="comments-panel"><h3>Conversa deste checkpoint</h3>{comments[post.id]?.length ? comments[post.id].map((comment) => <div className="comment" key={comment.id}><div className="comment-meta"><strong>{comment.author.name}</strong><time>{formatDate(comment.createdAt)}</time></div><p>{comment.body}</p></div>) : <p className="empty-comments">Nenhum comentário ainda.</p>}<form onSubmit={(event) => { event.preventDefault(); void submitComment(post.id); }}><label className="sr-only" htmlFor={`comment-${post.id}`}>Escreva um comentário para triagem</label><input id={`comment-${post.id}`} value={commentDrafts[post.id] ?? ''} onChange={(event) => setCommentDrafts((current) => ({ ...current, [post.id]: event.target.value }))} maxLength={2000} placeholder="Escreva um comentário…" /><button type="submit" aria-label="Enviar comentário" disabled={!commentDrafts[post.id]?.trim() || busy === `comment:${post.id}`}><Send size={16} /></button></form><small>Feedback não cria tarefa nem altera prazo automaticamente.</small></div>}
          </article>) : <div className="empty-state"><Activity size={21} /><strong>Nenhuma atualização publicada</strong><p>Quando o responsável aprovar um checkpoint, ele aparecerá aqui.</p></div>}
        </section>}

        {tab === 'dashboard' && <section className="dashboard-section" aria-label="Etapas do projeto">
          <div className="section-heading"><div><p className="eyebrow">/ VISÃO GERAL</p><h2>Etapas e tarefas</h2></div><span className="live-dot"><i /> FONTE VERIFICÁVEL</span></div>
          {dashboard && <><div className="stats-grid"><div className="stat-card"><span>CONCLUÍDAS</span><strong>{dashboard.tasks.done}</strong></div><div className="stat-card"><span>EM ANDAMENTO</span><strong>{dashboard.tasks.inProgress}</strong></div><div className="stat-card"><span>BLOQUEADAS</span><strong>{dashboard.tasks.blocked}</strong></div><div className="stat-card"><span>ELEGÍVEIS</span><strong>{dashboard.tasks.eligible}</strong></div></div>
            <p className="formula-note">Progresso = tarefas concluídas ÷ tarefas elegíveis. {dashboard.progress.formula} · Fonte: {dashboard.progress.source}</p>
            {dashboard.estimate ? <div className="estimate-note"><span>PREVISÃO · REVISADA POR {dashboard.estimate.owner}</span><strong>{dashboard.estimate.date}</strong><small>Fonte: {dashboard.estimate.source} · revisão {formatDate(dashboard.estimate.updatedAt)}</small></div> : <div className="estimate-note"><span>PREVISÃO</span><strong>Não disponível</strong><small>O responsável ainda não registrou uma estimativa válida e revisada.</small></div>}
            {dashboard.stages?.length ? <div className="stages-list">{dashboard.stages.map((stage, index) => <article className="stage-card" key={stage.id}><span className="stage-index">{String(index + 1).padStart(2, '0')}</span><div><h3>{stage.title}</h3><span className={`status status-${stage.status}`}>{humanStatus(stage.status)}</span></div>{stage.issueUrl && <a href={stage.issueUrl} target="_blank" rel="noreferrer" aria-label={`Abrir issue da etapa ${stage.title}`}><ExternalLink size={16} /></a>}</article>)}</div> : <div className="empty-state"><Activity size={21} /><strong>Etapas não disponíveis</strong><p>O backend ainda não recebeu marcos vinculados a Issues.</p></div>}
          </>}
        </section>}
        <footer className="portal-footer"><ShieldCheck size={14} /><span>Autorização validada pelo backend a cada operação.</span><span>Última atualização {dashboard?.lastUpdated ? formatDate(dashboard.lastUpdated) : 'não disponível'}</span></footer>
      </>}
    </main>
  </div>;
}
