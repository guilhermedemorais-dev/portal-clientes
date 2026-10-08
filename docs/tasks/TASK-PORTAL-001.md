# TASK-PORTAL-001: Portal do Cliente reutilizável

> **Resumo:** template estático com identidade visual adaptada da Vercel, API privada de projeto, login e autorização explícita, feed, dashboard, anexos protegidos e observabilidade.

## Estado da entrega

- Implementação local concluída e em validação final; não commitada.
- Uma única task funcional completa, `MOD-001`, com setores técnicos e de validação no [contrato JSON v2](../execution/TASK-PORTAL-001.json).
- Issue GitHub humana não criada nem vinculada. Equivalência Task/JSON para o Harness permanece **PENDING**.
- PR, commit, push, OAuth live, habilitação Pages, merge e deploy não executados.

## Decisões

O usuário autorizou a conclusão local e delegou as escolhas técnicas em 2026-10-08. Frontend Vite/React/TypeScript estático para Pages; Fastify/PostgreSQL como implementação de referência, com contrato HTTP adaptável. A Vercel indicada foi inspecionada e usada somente como referência visual. Sincronização GitHub lê o comentário exato usando token read-only e só publica quando o body contém `<!-- portal:client-approved -->`; a API não escreve no GitHub.

## Critérios e recibos

- [x] Bundle estático configurável e compatível com base path Pages.
- [x] API/PostgreSQL com auth/ACL, feed, dashboard, feedback, comentários e reações.
- [x] Sync de Issue explícito e idempotente; remoção da aprovação despublica e mantém replies.
- [x] Uploads raster privados, limite de tamanho configurável e autorização por post/autor/status.
- [x] Observabilidade da API: logs Pino redigidos, request IDs, métricas autenticadas/limitadas, liveness/readiness e auditoria.
- [x] Dashboard ignora backlog no denominador e informa indisponível com denominador zero.
- [x] Preparação por allowlist/diff preserva customizações; build local não publica Pages.
- [ ] Revisão visual independente em browser no último estado da UI.
- [ ] OAuth e token read-only contra conta/repositório reais.
- [ ] Coletor, retenção, dashboard/alertas e política de sessão por destino de produção.
- [ ] Criar Issue remota e verificar equivalência da task com JSON após autorização para publicação.

## Matriz por setor

| Setor | Estado | Evidência / limite |
|---|---|---|
| Banco | PASS local | Migrações 001–004 e integração PostgreSQL. |
| Backend | PASS local | Build e 12 testes locais; GitHub é stub nos testes. |
| Frontend | PASS local | typecheck, 8 testes UI e build local. |
| UI/UX | PARTIAL | Site Vercel observado e capturas responsivas guardadas; revisão final independente no browser pendente. |
| QA | PASS funcional local | QA independente passou frontend, template e 11 testes backend; última rodada de backend teve 12/12 no executor. Sem OAuth real/browser QA. |
| Segurança | PARTIAL | Security independente não confirmou vulnerabilidade; 11 testes backend isolados passaram. OAuth live e prova cross-project/token incorreto ainda são limitações de cobertura independente. |
| DevOps | PARTIAL | Build base path e workflow dist-only revisado; workflow não executado nem publicado. |
| Observabilidade | PARTIAL | Instrumentação e auth de `/metrics` testadas; métricas são process-local e não há coleta/retention/alertas externos. |
| Documentação | PASS local | README, OpenAPI e contratos alinhados à implementação; setup externo documentado como pendente. |
| Harness | NOT_VALIDATED | Sem Issue remota ou revisão de equivalência; manter fora de Ready/Done. |

## Limites operacionais

Nenhum OAuth App, token ou serviço externo foi configurado. Em produção, a API exige HTTPS, armazenamento privado durável, estratégia compartilhada de sessão para múltiplas réplicas, coletor e alertas. A métricas locais zeram no restart. O container PostgreSQL de verificação foi encontrado parado na validação final; as revisões independentes executaram testes com Postgres isolado e 0 testes ignorados. Não recriei o container porque seu mapeamento atual expõe `5432` em `0.0.0.0`, enquanto o compose corrigido limita a `127.0.0.1`.

Relatório consolidado: [MOD-001-execution.md](../reports/MOD-001-execution.md).

## Prompts das listas de execução

### MT-01/checklist

Abra o [contrato JSON](../execution/TASK-PORTAL-001.json), selecione `list_id = MT-01/checklist`, valide revisão, owner e equivalência atual, e execute somente essa checklist com evidência. Não publique, commite nem faça deploy sem autorização.

### MT-02/checklist

Abra o [contrato JSON](../execution/TASK-PORTAL-001.json), selecione `list_id = MT-02/checklist`, valide revisão, owner e equivalência atual, e execute somente essa checklist com evidência. Não publique, commite nem faça deploy sem autorização.

### MT-03/checklist

Abra o [contrato JSON](../execution/TASK-PORTAL-001.json), selecione `list_id = MT-03/checklist`, valide revisão, owner e equivalência atual, e execute somente essa checklist com evidência. Não publique, commite nem faça deploy sem autorização.

### MT-04/checklist

Abra o [contrato JSON](../execution/TASK-PORTAL-001.json), selecione `list_id = MT-04/checklist`, valide revisão, owner e equivalência atual, e execute somente essa checklist com evidência. Não publique, commite nem faça deploy sem autorização.

### MT-05/checklist

Abra o [contrato JSON](../execution/TASK-PORTAL-001.json), selecione `list_id = MT-05/checklist`, valide revisão, owner e equivalência atual, e execute somente essa checklist com evidência. Não publique, commite nem faça deploy sem autorização.

### MT-06/checklist

Abra o [contrato JSON](../execution/TASK-PORTAL-001.json), selecione `list_id = MT-06/checklist`, valide revisão, owner e equivalência atual, e execute somente essa checklist com evidência. Não publique, commite nem faça deploy sem autorização.

### MT-07/checklist

Abra o [contrato JSON](../execution/TASK-PORTAL-001.json), selecione `list_id = MT-07/checklist`, valide revisão, owner e equivalência atual, e execute somente essa checklist com evidência. Não publique, commite nem faça deploy sem autorização.

### MT-08/checklist

Abra o [contrato JSON](../execution/TASK-PORTAL-001.json), selecione `list_id = MT-08/checklist`, valide revisão, owner e equivalência atual, e execute somente essa checklist com evidência. Não publique, commite nem faça deploy sem autorização.

### MT-09/checklist

Abra o [contrato JSON](../execution/TASK-PORTAL-001.json), selecione `list_id = MT-09/checklist`, valide revisão, owner e equivalência atual, e execute somente essa checklist com evidência. Não publique, commite nem faça deploy sem autorização.
