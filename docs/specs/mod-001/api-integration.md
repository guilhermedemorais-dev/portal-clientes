# Contrato de integração, MOD-001

O OpenAPI canônico da implementação de referência é [`backend/openapi.yaml`](../../../backend/openapi.yaml). Contrato `v1` é independente da stack. Um backend de cliente precisa preservar semântica, não necessariamente o formato interno/tabela de referência.

## Rotas consumidas pelo frontend

| Operação | Método e caminho | Requisito |
| --- | --- | --- |
| OAuth start | `GET /v1/auth/github?challenge=<S256>` | Origem/callback definidos pelo servidor; exige PKCE |
| OAuth exchange | `POST /v1/auth/exchange` `{grant,verifier}` | Uso único, curto, verificação browser PKCE; retorna bearer sem refresh persistente |
| Sessão ativa | `GET /v1/me` | `Authorization: Bearer`; usuário e membership verificados |
| Feed | `GET /v1/projects/{id}/feed` | Só checkpoint publicado e feedback próprio pendente permitido; retorna status de publicação |
| Dashboard | `GET /v1/projects/{id}/dashboard` | Tarefas/marcos persistidos com origem Issue rastreável e fórmula explícita |
| Feedback | `POST /v1/projects/{id}/posts` `{body}` | Submissão cliente fica pendente; não altera prazo, prioridade ou escopo |
| Comentários | `GET/POST /v1/projects/{id}/posts/{postId}/comments` | Persistente e vinculado ao post/Issue |
| Curtida/atenção | `POST/DELETE /v1/projects/{id}/posts/{postId}/{like\|attention}` | Toggle idempotente; atenção não promove prioridade |
| Print | `POST /v1/projects/{id}/uploads?postId=...&description=...` multipart `file` | raster allowlist/limite/MIME+magic; imagem privada anexada a feedback do autor ou publicação do owner |
| Ler print | `GET /v1/projects/{id}/uploads/{uploadId}` | Bearer e autorização por objeto: owner, autor do feedback pendente ou membro após publicação; `private,no-store` |
| Gestão de membros | `GET/POST/DELETE /v1/projects/{id}/members...` | Owner somente, imutável GitHub ID, sem remover último owner |
| Revisão de feedback | `PATCH /v1/projects/{id}/posts/{postId}` | Owner publica/rejeita; publicação configura contexto da Issue |
| Publicar tarefa | `POST /v1/projects/{id}/tasks` | Owner, Issue do repo configurado, status explícito |
| Sync GitHub | `POST /v1/projects/{id}/issues/sync` `{issueNumber,commentId}` | Owner; API busca comentário e Issue no repositório configurado com token somente leitura; importa só o comentário que contém `<!-- portal:client-approved -->`; marcador sai do texto; chave repo+Issue+comment é derivada no servidor; edição atualiza o mesmo post; remover marcador/apagar comentário despublica sem apagar replies. Nunca escreve no GitHub. |

## Erros e requisitos do cliente

`401` significa ausência de sessão/grant válido; `403` significa papel/acesso negado; `404` oculta recurso de outro projeto ou anexo ainda não visível; `413/415` rejeitam upload excessivo ou inseguro; `429` indica rate limit. Sync retorna `503` sem repositório/token, `502` em falha GitHub, `422` se comentário não pertence à Issue indicada, `201` para publicação nova e `200` para atualização, retirada de publicação ou origem não aprovada. Respostas contêm código seguro e `requestId`, nunca conteúdo privado. CORS lista só a origem Pages, sem cookies; frontend usa `credentials: omit`, bearer e `cache: no-store`.

## Fontes de tarefa/progresso

The task registry references exact Issue number and URL, title, stage, status, progress and last update. The numerator is count of eligible tasks at `done`; denominator excludes `backlog` and out-of-scope tasks. A client adapter must supply this set and formula metadata; if it cannot identify the denominator, return no percentage. Estimate requires explicit date, source, responsible person and reviewed timestamp; otherwise null. Rework/corrections require evidence fields and type `acceptance_fix` vs `scope_change`; do not infer them from commits.
