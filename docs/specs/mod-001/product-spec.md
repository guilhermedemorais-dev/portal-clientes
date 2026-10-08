# MOD-001, especificação de produto

Estado: execução autorizada pelo usuário em 2026-10-08. Revisão 2. Fonte do escopo: briefing/pedido inicial e mensagem do usuário solicitando entrega funcional e autonomia técnica. Uma task completa engloba UI, API, dados, segurança, observabilidade, QA, DevOps e documentação.

## Resultado e fronteiras

Entregar um template estático de Portal do Cliente por projeto, com API de referência testável, persistência de banco, acesso GitHub autorizado, feedback persistente e dados/fotos privados. A stack de referência não é regra para clientes; seus backends existentes devem poder consumir o contrato HTTP.

Fora do escopo: SaaS central multi-cliente, instalar portal dentro do plugin, alterar site Vercel, exigir domínio próprio, servir conteúdo privado como arquivo estático, vídeo, mostrar métrica de vulnerabilidade, horas/tokens estimados, publicar automaticamente conteúdo interno, aprovar automaticamente mudança de escopo/prazo, configurar serviço externo sem autorização de destino.

## Decisões técnicas registradas

| ID | Decisão | Motivo |
| --- | --- | --- |
| D-01 | Frontend Vite + React + TypeScript, estático em Pages, base path configurável | Sem runtime servidor no Pages; bundle testável e projetado para forks |
| D-02 | Backend de referência Node 22 + Fastify + PostgreSQL; contrato HTTP/OpenAPI neutro | Separação cliente/backend; stack de referência não imposta a cliente |
| D-03 | GitHub OAuth server-side, state, PKCE de provedor e PKCE browser-to-API | Evita segredo no cliente, CSRF, grant interceptado e cookies third-party |
| D-04 | Grant de troca única; bearer de duração limitada apenas em memória JS; reload reautentica | API e Pages são origens distintas; não depender de cookies cross-site |
| D-05 | ACL explícita por GitHub ID imutável, projeto e papel; negar por padrão; responsável gerido por API v1 | Login identifica; API autoriza; sem painel administrativo extra exigido |
| D-06 | Responsável publica checkpoint com associação explícita à Issue; owner-only sync lê um comentário específico via token read-only e importa somente com `<!-- portal:client-approved -->`; feedback do cliente fica pendente até triagem | Sem escrever comentário no GitHub nem publicar conteúdo interno por inferência |
| D-07 | Progresso calculado por concluídas/elegíveis de Issues publicadas, sem tarefas ignoradas inventadas; previsão não disponível sem revisão real | Número explicável e rastreável |
| D-08 | Arquivo local privado fora do webroot no backend referência, interface adaptável; upload raster limitado e verificação por assinatura | Não expor URL pública/anexo estático |
| D-09 | Pino JSON com request ID, contadores Prometheus sem labels privados, endpoints live/ready e audit trail sem payload | Diagnóstico verificável com dados mínimos |
| D-10 | Template instalado apenas em `docs/portal/`; atualização por dry-run, baseline/hash, preservar alterações e parar em conflitos | Evita sobrescrita silenciosa de customização e cópia de material privado |
| D-11 | Artifact Pages vem somente de `dist/`; workflow reutilizável só roda por `workflow_call` | Não publicar `docs/`, backend, fixtures ou credenciais |

## Jornadas completas

### Acesso

1. Navegador abre shell público de um só projeto, sem dados embutidos privados.
2. Frontend gera verifier e S256 challenge, mantém verifier de uso único em `sessionStorage` só durante o redirect.
3. API inicia OAuth usando origem/callback fixos no servidor e `state`; servidor valida membership, gera grant breve ligado ao challenge do browser.
4. Callback volta ao endereço fixo Pages. Frontend remove `grant` da URL antes de usar/refletir conteúdo e troca `{grant, verifier}`.
5. API consome grant apenas uma vez, verifica PKCE, membership/revogação e emite bearer aleatório curto. Frontend guarda só em memória.
6. Cada endpoint verifica token vivo, papel e projeto. Logout remove sessão do processo e zera estado do browser; recarga exige OAuth novamente.

### Acompanhamento e retorno do cliente

O feed lista apenas publicação autorizada ou feedback próprio pendente e mostra autor, data, contexto módulo/task/Issue, comentários, curtidas e “Precisa de atenção”. Comentários/feedback persistem vinculados ao checkpoint/task, inclusive após conclusão. O responsável faz triagem pela API owner. Curtida e atenção são toggles idempotentes; atenção não altera prioridade. Upload exige tipo raster allowlist, limite e descrição, associa ao post do autor e exige ACL no download autenticado.

Dashboard consome apenas tasks/marcos publicados pelo responsável com Issue URL e status observável. `eligible` exclui backlog/fora de escopo; `done` conta apenas status concluído. Fórmula `100 × done / eligible` (quando elegíveis >0); se denominador 0, mostrar “não disponível”, não um percentual fabricado. Retrabalho somente com registro de evidência. Previsão omitida/indisponível sem data, fonte, owner e revisão.

### Projeto cliente e Pages

Uma origem identificada/revisada é preparada via allowlist no `docs/portal/`, com dry-run antes de escrita. Build config usa `/<repo>/`; workflow reutilizável envia exclusivamente `dist/` como artifact. Nenhum comando habilita Pages ou publica deployment neste repositório.

## Critérios de aceite

- [ ] Shell estático configura por projeto e mostra estados de configuração, login, carregamento, vazio, erro, expiração e negação sem dados falsos.
- [ ] Login GitHub funciona contra OAuth real, grant one-time+browser-PKCE, bearer em memória, logout e revogação.
- [ ] ACL e isolamento bloqueiam leitura/escrita/download cross-project, user sem vínculo e sessão revogada.
- [ ] Posts/feedback pendentes, comentários persistentes, curtidas, atenção e uploads descritos têm comportamento idempotente/seguro documentado.
- [ ] Owner publica checkpoints/tasks ligados à Issue aprovada; sincronização de Issue tem chave estável, reprocessamento seguro e nenhum texto interno automático.
- [ ] Dashboard deriva contagens e progresso de fonte persistida; não calcula previsão sem entrada revisada.
- [ ] Logs, métricas, health/readiness e auditoria não expõem tokens nem conteúdo privado; instrumentação e limites estão documentados. Scrape, retenção, painéis e alertas externos permanecem por validar em cada destino.
- [ ] Imagens privadas são associadas, validadas, armazenadas fora do webroot e entregues somente após autorização.
- [ ] Template sincroniza sem clobber, bloqueia symlink/conflito e não inclui artefato proibido.
- [ ] Build `dist/` funciona com base path Pages; workflow artifact não inclui docs/backend/credenciais.
- [ ] Testes unitários, HTTP com PostgreSQL e QA independente executados; interface observada no browser nos tamanhos móveis e desktop.
- [ ] Outro desenvolvedor consegue configurar a referência sem credenciais no chat e conhece os bloqueios externos restantes.

## Riscos e limites de execução

OAuth real, domínio/API HTTPS, credenciais GitHub, destino Pages de cliente, backup/retention, monitor/alert routing e storage durable não podem ser demonstrados sem configurar contas/serviços externos. A entrega local pode ser exercitada com Postgres e fixtures sintéticas identificadas. Não registrar validação live dessas integrações sem executá-las.
