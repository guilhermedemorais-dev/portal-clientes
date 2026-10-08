export class ApiError extends Error {
  constructor(readonly status: number, message: string) { super(message); this.name = 'ApiError'; }
}

type Fetcher = typeof fetch;

export async function requestJson<T = unknown>(
  apiBaseUrl: string,
  path: string,
  accessToken: string,
  fetcher: Fetcher = fetch,
): Promise<T> {
  const response = await fetcher(`${apiBaseUrl.replace(/\/$/, '')}${path.startsWith('/') ? path : `/${path}`}`, {
    method: 'GET',
    credentials: 'omit',
    cache: 'no-store',
    headers: { Accept: 'application/json', Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    const messages: Record<number, string> = {
      401: 'Sua sessão expirou. Entre novamente para continuar.',
      403: 'Este usuário não tem acesso a este projeto.',
      404: 'Este conteúdo não está disponível.',
    };
    throw new ApiError(response.status, messages[response.status] ?? 'Não foi possível carregar os dados do projeto.');
  }
  return await response.json() as T;
}

export async function sendJson<T = unknown>(
  apiBaseUrl: string,
  path: string,
  accessToken: string,
  method: 'POST' | 'DELETE',
  body?: unknown,
  fetcher: Fetcher = fetch,
): Promise<T> {
  const response = await fetcher(`${apiBaseUrl.replace(/\/$/, '')}${path.startsWith('/') ? path : `/${path}`}`, {
    method,
    credentials: 'omit',
    cache: 'no-store',
    headers: { Accept: 'application/json', Authorization: `Bearer ${accessToken}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (!response.ok) {
    const messages: Record<number, string> = {
      401: 'Sua sessão expirou. Entre novamente para continuar.',
      403: 'Esta ação não está autorizada para este usuário.',
      413: 'O anexo excede o limite permitido.',
      429: 'Muitas tentativas. Aguarde um pouco e tente novamente.',
    };
    throw new ApiError(response.status, messages[response.status] ?? 'Não foi possível salvar esta alteração.');
  }
  if (response.status === 204) return undefined as T;
  return await response.json() as T;
}
