# PRD, Portal do Cliente reutilizável

Revisão 2. Escopo aprovado para execução local pelo usuário em 2026-10-08: “quero isso pronto e funcional” e “você se decide com outro agente”. Decisões técnicas foram registradas como escolhas do CTO sob essa autorização. Revisão externa, merge, configuração de OAuth/serviços e publicação ainda são gates específicos. Briefing: [contexto](../briefing/briefing.md). Especificação completa: [MOD-001](../specs/mod-001/product-spec.md). Planejamento interno: [JSON](../planejamento/plano-de-execucao.json) e [Markdown](../planejamento/plano-de-execucao.md).

## Objetivo e fronteiras

Entregar um template estático de portal para cada projeto, compatível com GitHub Pages e integrado a uma API privada. O pacote inclui frontend utilizável, backend de referência com banco/migrações, integração de identidade/acesso, feed/dash, comentários, likes, atenção, anexos privados, conteúdo de Issues explicitamente aprovado, observabilidade, preparação/upgrade seguro, build Pages e documentação. A stack da referência não obriga clientes: contrato HTTP é a fronteira de adaptação; backend, banco e storage existentes devem ser reaproveitados quando compatíveis.

GitHub Pages publica apenas `dist/`, nunca conteúdo privado, backend, Issue interna ou anexos. A API é a autoridade de autenticação, autorização e persistência. OAuth GitHub autentica, mas cada pessoa só acessa o projeto após membership explícita por GitHub ID e papel.

Fora do escopo: portal SaaS multi-cliente, instalação em plugin, domínio próprio, alteração do site Vercel, vídeo, métrica de vulnerabilidade/horas/tokens sem medição e autorização, conteúdo interno em estático, publicar automaticamente Issues sem aprovação, converter feedback em requisito/prazo/prioridade automaticamente, ou mutação externa sem autorização do destino.

## Módulo funcional único

| ID | Escopo | Atores | Resultado |
| --- | --- | --- | --- |
| MOD-001 | Shell Pages + API/DB de referência + GitHub OAuth/ACL + feed e dashboard + sincronização inbound de comentário/Issue aprovado + feedback e moderação do owner + reação, comentários, anexos + observabilidade + preparar/atualizar via diff + build Pages + QA, security e docs | Cliente autorizado, responsável, GitHub, DevOps do projeto | Uma task ponta a ponta. Sem fragmentar por camada. |

## Histórias principais e regras

### Cliente

- Abre o shell estático; só metadata pública é embutida. Faz login pelo GitHub.
- Só recebe sessão se o GitHub ID estiver autorizado naquele projeto. O backend revalida papel/projeto/revogação em cada leitura, escrita e download.
- Visualiza checkpoints/capturas cuja publicação foi aprovada; feed identifica pessoa, data, módulo/task e Issue fonte.
- Comenta checkpoints/tasks, curte, sinaliza “Precisa de atenção” e submete feedback. Feedback novo fica pendente de triagem; não altera escopo, tarefa, prioridade ou previsão. Comentários e uploads permanecem ligados ao contexto após a conclusão do módulo.
- Upload exige descrição, formato de imagem permitido e autorização por objeto. Arquivo é lido por fetch autenticado e nunca tem URL pública permanente.

### Responsável

- Bootstrap inicial de papéis no ambiente server-side; após isso, API owner gerencia membresia, revogação e triagem/publicação. Login não aprova ninguém.
- Publica tarefa/etapa com URL de Issue real e status observável. Revisão explícita publica ou rejeita feedback.
- Importa comentário de Issue só quando a identidade da Issue/comment é estável e o comentário tem marca `<!-- portal:client-approved -->`. Sync repetido atualiza a mesma publicação; retirar marca ou apagar origem despublica a projeção e preserva comentários vinculados. O body interno e conversa em torno não são copiados.
- Registra estimativa somente com fonte, responsável e data de revisão. Se faltar, o portal mostra “não disponível”.

### Dashboard

- Etapas, tasks elegíveis/concluídas/em andamento/bloqueadas e links refletem registro persistido ligado às Issues.
- Fórmula é `done / eligible`; backlog e fora do escopo não entram no denominador. Denominador zero vira não disponível; número sem fonte nunca é estimado.
- Retrabalho/correção só aparece se a evidência tiver sido registrada; correção de aceite e mudança de escopo são tipos diferentes.

## Arquitetura e decisões técnicas

| ID | Decisão | Regra de produto |
| --- | --- | --- |
| D-01 | Vite + React + TypeScript, build estático Pages configurável por `VITE_BASE_PATH` | Sem SSR/API no site publicado |
| D-02 | Node 22 + Fastify + PostgreSQL na implementação de referência; OpenAPI v1 separado da stack cliente | Contrato HTTP adaptável, nenhuma stack universal imposta |
| D-03 | GitHub OAuth server-side, state, PKCE de provedor e browser-to-API | Segredo nunca chega ao cliente; grant é one-time e browser-bound |
| D-04 | Bearer opaco de duração limitada em memória; reload pede novo login | Não depende de third-party cookie, localStorage ou refresh persistente |
| D-05 | ACL deny-by-default por GitHub ID, projeto, papel e revogação por endpoint | Membership explícita obrigatória |
| D-06 | API de gestão owner no v1, sem novo painel administrativo | Aplicar escopo com menor superfície |
| D-07 | Checkpoints importados por identidade GitHub issue+comment; marcador de publicação exigido | Nenhum conteúdo internal é inferido como client-safe |
| D-08 | Storage de referência privado local e interface substituível | produção exige storage durável privado, quotas, retenção e validação/re-encode |
| D-09 | Logs JSON Pino, request ID, métricas Prometheus com labels limitados, live/ready, auditoria sem payload | Tokens/conteúdo nunca viram sinal de diagnóstico |
| D-10 | Instalação em `docs/portal/`, allowlist e manifest hash | Dry-run, preserva customizações, conflito não é sobrescrito, não apaga arquivo |
| D-11 | Workflow Pages reutilizável acionado por `workflow_call`, artifact de `dist/` apenas | Não habilita publicação nem executa ação no repositório de destino |

## Requisitos de qualidade e aceite

| ID | Resultado verificável |
| --- | --- |
| AC-01 | UI com direção visual adaptada de `guilhermedemorais.vercel.app`, legível e responsiva em desktop/celular, com estados de setup/login/loading/vazio/erro/negação, foco visível e movimento reduzido |
| AC-02 | OAuth real, exchange one-time+PKCE, logout, expiração e acesso não autorizado funcionam; se OAuth real não foi configurado, declarar não validado |
| AC-03 | API impede leitura/escrita/download fora do projeto e fora da visibilidade do post, inclusive cliente contra feedback pendente de outro cliente |
| AC-04 | Feed, feedback triável, comentário, reação, atenção e imagens persistem em PostgreSQL; download é privado e autorização ocorre por objeto |
| AC-05 | Comentário marcado explicitamente é importado para o feed com origem idempotente; repetição/edit/retirada de marca/delete não duplica e não expõe comentário não marcado |
| AC-06 | Dashboard/progresso/última atualização usam dados rastreáveis; ETA ausente é não disponível |
| AC-07 | Métricas, request logs, health/readiness e auditoria ajudam diagnosticar falhas e nunca registram conteúdo/segredos; alerta/retention são documentados por destino |
| AC-08 | Build Pages contém só shell/assets/config pública e caminhos base corretos; workflow artifact só `dist/` |
| AC-09 | Preparar/atualizar `docs/portal/` inventaria e mostra diff; não copia `.git`, dados, uploads, segredo, `node_modules` ou `dist`; preserva arquivo personalizado e sinaliza conflito |
| AC-10 | Backend local, migrações idempotentes, documentação e testes permitem outro dev reproduzir setup sem segredo real |

## Referência visual e execução

Site público e origem Vercel foram inspecionados e capturados em desktop e mobile. Deployment `6866585404`, revisão `7dd4fd340c025812c2b7dfe668b3d52d41962864`; evidências originais em `output/playwright/reference-*.png`. Preservar fundo escuro, tipografia mono, perfil/bio, divisores, cards e tabs. Não copiar conteúdo pessoal, console decorativo, animações de digitação ou scanlines que prejudiquem legibilidade.

Catálogo navegável: [`docs/design/catalog.html`](../design/catalog.html). Regras/tokens: [`docs/design/design-guide.md`](../design/design-guide.md). Segurança: [`docs/specs/mod-001/security-model.md`](../specs/mod-001/security-model.md). Contrato: [`backend/openapi.yaml`](../../backend/openapi.yaml). Operação/observabilidade: [`docs/specs/mod-001/observability.md`](../specs/mod-001/observability.md).

Status de implementação, comandos executados, findings independentes e gates externos pertencem ao task mirror/relatório, não à especificação do produto. OAuth, GitHub, host TLS, Pages do cliente, backup/alert routing e storage de produção não foram autorizados nem configurados por esta revisão.
