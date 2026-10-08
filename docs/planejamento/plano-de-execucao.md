# Planejamento interno: Portal do Cliente reutilizável

## Revisão 3, estado VALIDATING

Escopo local autorizado pelo usuário em 2026-10-08. MOD-001 é uma Task ponta a ponta. O usuário delegou ao CTO a decisão técnica e pediu o projeto pronto e funcional. O PRD e os contratos locais registram as escolhas; este documento e o JSON devem evoluir juntos.

## Estado de execução

- Módulos: 1, `MOD-001`, Portal do Cliente reutilizável.
- Task local: `TASK-PORTAL-001`; issue remota ainda não criada nem vinculada.
- Stack de referência: React/TypeScript + Vite no Pages; Node 22/Fastify + PostgreSQL na API. Contrato HTTP neutro para adaptação por projeto.
- Direção visual: referência Vercel inspecionada, capturas desktop/mobile em `output/playwright/`, Design Guide e catálogo HTML registrados.
- Frontend: typecheck, 8 testes de unidade, build e 3 testes de sincronização segura do template passaram. Build com base path `/portal-clientes/` confirmado.
- Backend/API: build passa; implementador reportou integração PostgreSQL com 12/12 testes. QA independente reportou 11/11 na rodada própria. O container local foi encontrado parado na última rodada e não foi recriado. A última seleção de `p.status` na feed ainda carece de execução final com banco.
- QA/security independentes: QA funcional local PASS em testes; Security PARTIAL sem vulnerabilidade confirmada. OAuth real e algumas provas negativas permanecem fora da validação.
- Produção: OAuth real, GitHub, API HTTPS, storage durável, configuração do Pages, métricas coletadas/retidas e alertas ainda não configurados nem validados.

## Decisões técnicas

1. O site do portal é estático e publica somente o `dist/` em GitHub Pages.
2. API controla autenticação, membership, projeto, publicação, feedback e anexos. O login GitHub sozinho não concede acesso.
3. A referência usa Fastify/PostgreSQL; cada projeto pode adaptar o contrato a backend e banco existentes.
4. Comentário de Issue só é importado se o próprio comentário tiver `<!-- portal:client-approved -->`. A origem issue+comment é estável e a sincronização é idempotente.
5. Observabilidade usa Pino estruturado, request IDs, redaction de dados privados, métricas Prometheus com labels controlados, `/live`, `/ready`, `/metrics` protegido e auditoria sem conteúdo. Coletor/retention/alertas dependem do ambiente.
6. ACL e triagem são gerenciadas por endpoints owner da API no v1. Não foi incluído painel administrativo.
7. Não autorizei nem executei commit, push, merge, OAuth real, habilitação de Pages ou alteração de serviços do cliente.

## Gates de saída local

- Integração backend com PostgreSQL, migrações, upload privado, comentário aprovado e métricas foi executada independentemente antes da última seleção `p.status` no feed.
- Frontend (8/8) e template (3/3) passam localmente; QA independente confirmou os mesmos resultados. Security reportou sem finding confirmado, status parcial.
- Capturas desktop/mobile da direção visual existem; revisão visual independente no browser após o último ajuste da interface continua pendente.
- Build de Pages e diff/instalação de `docs/portal/` demonstrados sem segredo nem arquivo privado.
- Task local/JSON e recibos atualizados. Nenhuma conclusão de OAuth/deploy externo sem evidência real.

Detalhes estruturados: [plano JSON](plano-de-execucao.json). Fonte de escopo: [PRD](../prd/PRD.md) e [briefing](../briefing/briefing.md).
