# Recibo de execução local, MOD-001

Data: 2026-10-08. Checkout: `/home/guimp/Documentos/ChatGPT/Portal cliente`, branch `main`, base `90ec1ed91e121efcad6b39fd72e9e1a9f4c351a3`. Alterações locais ainda não commitadas. Nenhuma mutação remota foi feita.

## Resultado

Template local implementado: frontend estático Vite/React/TypeScript, API Fastify/PostgreSQL, migrações, OAuth GitHub server-side/PKCE, membership por projeto, feed/dashboard, triagem owner, comentários/reações, anexos privados, sync read-only de comentário marcado, logs/métricas/auditoria e rotina allowlist/diff. A documentação mantém uma única Task funcional MOD-001. A Vercel foi inspecionada como referência visual; o destino do template continua GitHub Pages conforme o briefing.

## Validação local executada pelo executor

- `npm run typecheck`: passou.
- `npm test -- --reporter=dot`: **8/8** passou, incluindo feedback com retry de upload, status pending, progresso sem denominador e sessão em memória.
- `npm run build`: passou.
- `npm run test:template`: **3/3** passou, dry-run, allowlist/exclusão e conflito preservador.
- `VITE_BASE_PATH=/portal-clientes/ npm run build`: passou; asset paths têm o prefixo correto. Vite mostra aviso de que o script clássico público `portal-config.js` não é empacotado, comportamento esperado.
- PostgreSQL de teste isolado em loopback `127.0.0.1:5443`: migrações 001–004 aplicadas, `npm run build --prefix backend` passou e testes backend **12/12**, zero skips. Incluiu teste final de que `GET /feed` retorna `status=pending`; stub do provider impede chamadas GitHub reais. Container temporário foi removido após o teste.
- Contrato `docs/execution/TASK-PORTAL-001.json`: JSON válido, revisão 2, dez setores e nove listas de execução.

## Browser local

Playwright abriu a aplicação local em desktop e viewport mobile 390×844. O estado de configuração sem API mostra claramente que não há configuração/dado fictício; capturas finais estão em `output/playwright/portal-config-final-desktop.png` e `output/playwright/portal-config-final-mobile.png`. Console: zero erros e zero warnings. A sessão autenticada usa fixtures nos testes de UI; OAuth/browser contra API real não foi tentado.

## PostgreSQL e QA independente

- QA independente observou `npm run build --prefix backend` e **11/11** testes do backend com PostgreSQL 16 local e GitHub stub; frontend 8/8, template 3/3 e Pages base-path também passaram. Reportou QA funcional local PASS, sem browser, OAuth real ou deploy.
- O implementador backend reportou a última rodada após mudanças de telemetria/backlog com migrações 001–004, build e **12/12** testes PostgreSQL, sem skip; incluiu arquivo de 1,1 MB, SVG, bearer incorreto em `/metrics`, OAuth/ACL failures, sync/IDOR e backlog. O GitHub foi stubbed. Security independente rodou uma base temporária e **11/11** antes dessas últimas adições, removeu só a base que criou e não encontrou vulnerabilidade confirmada.
- O container anterior `portal-client-backend-verify-postgres-1` estava **parado** (inspeção read-only mostrou `Exited (255)` e uma publicação antiga `0.0.0.0:5432`). Não o iniciei nem recriei. Para finalizar a consulta `p.status` da feed, subi outro Postgres descartável em `127.0.0.1:5443`, executei as migrações e todos os 12 testes, e removi somente esse container temporário.

## Segurança e observabilidade

- Anexo de post pendente: autor e owner podem baixar; outro cliente recebe 404; após publicar, cliente do projeto pode baixar. Teste local reportado por QA/Security.
- Sync: owner chama `{issueNumber,commentId}`; servidor lê comentário e Issue via token somente leitura; associa marker literal, tira o marker do texto, não aceita body/approved do caller nem chama endpoint de escrita; ID de origem por repo+issue+comment; update/upsert e unpublish mantêm replies.
- OAuth grants/state/sessions usam expiração/limites; métrica unknown method é `OTHER`. `/metrics` exige bearer constante e dá 404 se token não configurado. Pino redige URL/auth/cookie e não registra objeto de erro OAuth. Labels não incluem projeto, usuário, Issue ou conteúdo.
- `/ready` testa PostgreSQL; `/live` testa processo. Métricas são locais ao processo e zeram ao restart. Sem exporter, scrape, alertas, dashboard, retenção automatizada ou store compartilhado de sessão configurados. Aplicação multi-réplica exige store compartilhado.
- Revisão Security: `SECURITY_STATUS: PARTIAL`, sem finding confirmado. Restam cobertura direta cross-project e confirmação independente depois da última adição; OAuth live não foi testado.

## Gates que permanecem externos

OAuth App/conta real, token GitHub real read-only, callback/API HTTPS, storage durável privado, banco de destino cliente, Pages habilitado/publicado, collector/retention/alert routing e aceite humano não foram configurados. O workflow Pages reutilizável foi inspecionado, não invocado. Issue GitHub/PR/commit/push/merge/deploy não foram criados. Nenhum token secreto foi solicitado no chat.

Medição de tokens: `NOT_AVAILABLE` neste recibo.
