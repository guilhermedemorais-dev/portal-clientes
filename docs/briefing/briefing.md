# Briefing do projeto

Revisão: 1. Estado: DRAFT, aprovação pendente. Projeto existente como repositório, produto ainda não implementado.

## Objetivo e limites

Criar neste repositório um template reutilizável e revisável do Portal do Cliente. Cada projeto cliente prepara sua própria cópia em `docs/portal/` por meio do Engineering Harness; o portal não é instalado no plugin nem centraliza vários clientes. O resultado esperado é um portal utilizável com frontend estático para GitHub Pages e um contrato de integração backend, acompanhado de uma implementação de referência testável.

O GitHub Pages entrega somente a casca pública e assets sem dados privados. Autenticação, autorização, API, persistência e acesso a anexos privados dependem de backend. O backend controla a associação usuário/projeto, e possuir conta GitHub não concede acesso. Reutilizar backend, identidade e armazenamento já existentes em cada cliente quando houver compatibilidade; não impor stack universal.

Exclusões expressas: domínio próprio; mudança do site pessoal na Vercel; instalação no Engineering Harness; portal central multi-cliente; vídeo; indicador de vulnerabilidades; métricas fictícias de horas, percentual ou tokens; exposição de comentários internos, logs, credenciais, PRD completo ou contratos de execução. Feedback não aprova requisito, tarefa ou prazo automaticamente. Sem evidência, mostrar vazio ou não disponível.

## Atores e jornadas

| ID | Ator | Objetivo | Permissões e dados | Jornada/cenários | Resultado e aceite |
| --- | --- | --- | --- | --- | --- |
| A-01 | Cliente autorizado | Acompanhar projeto e dar feedback | Ler um projeto ao qual foi explicitamente autorizado; comentar, curtir e anexar imagens segundo política do backend | Abrir portal GitHub Pages; autenticar com GitHub; backend identifica conta, verifica vínculo ao projeto, entrega feed e dashboard; cliente comenta/reage/anexa; em acesso expirado ou negado recebe estado apropriado | Só enxerga projeto autorizado; dados e anexos persistem no backend; bloqueio nega leitura e escrita |
| A-02 | Responsável pelo projeto | Publicar atualizações e triar feedback | Gerenciar membros/autorização, conteúdo visível ao cliente, anexos, estado do projeto e previsões com evidência. Superfície de gestão (portal, API ou ferramenta existente) ainda a decidir | Aprovar publicação explícita, revisar progresso/origem e previsão, receber feedback, classificá-lo sem alteração automática do escopo | Conteúdo interno não aparece; decisões de escopo e prazo continuam sob triagem humana |
| A-03 | GitHub e backend do projeto | Fornecer identidade, Issues/checkpoints autorizados e API restrita | GitHub OAuth e leitura no servidor com permissões mínimas; backend aplica autorização por projeto | Callback OAuth; sincronização idempotente de checkpoints aprovados das Issues; tratamento de revogação, indisponibilidade ou repetição | Nenhum segredo no frontend; conteúdo não explicitamente aprovado não é publicado; repetição não duplica posts |
| A-04 | Harness/DevOps consumidor | Preparar cópia do template e publicar somente portal | Ler revisão identificada e arquivos de template; nunca incluir arquivos privados do cliente no artefato Pages | Inspecionar origem/revisão; preparar ou atualizar `docs/portal/` por diff; configurar build e artefato dedicado | Cópia preserva customizações e omite `.git`, banco, uploads, segredos e `node_modules`; Pages publica apenas saída do portal |

## Inventário existente e referências

| Capacidade | Fonte e revisão | Evidência observada | Não verificado | Recomendação | Decisão |
| --- | --- | --- | --- | --- | --- |
| Template do portal | Repositório `portal-clientes`, commit `90ec1ed91e121efcad6b39fd72e9e1a9f4c351a3` | Somente `README.md`, sem código de aplicação, configuração de build, backend, migrações ou testes | Uso anterior, sistema instalado, contratos ou personalizações fora do clone examinado | COMPLETAR, sem substituir conteúdo existente | Escopo deste projeto, sujeito à aprovação do PRD |
| Direção visual | `guilhermedemorais.dev`, commit `7dd4fd340c025812c2b7dfe668b3d52d41962864`; arquivos `app/page.tsx`, `app/globals.css` | Código e página Vercel publicada examinados em 1440x1000 e 390x844, painéis Sobre e Portfólio; capturas em `output/playwright/`; confirma fundo escuro, mono, linhas, perfil, cards e tabs responsivas | Outros painéis e estados interativos não percorridos; um 404 de `favicon.ico` no console, sem impedir renderização | Reaproveitar linguagem visual e padrões estruturais, sem copiar conteúdo pessoal, integrações ou efeitos que prejudiquem leitura/acessibilidade | Direção de alto nível explicitada no pedido; desktop/mobile observados; catálogo e aprovação final seguem gates do PRD/SDD |
| Backend/identidade/dados de clientes | Nenhuma fonte fornecida | Pedido determina banco existente do cliente acessado pelo backend | Stack, API, hospedagem, esquema, identidade/RBAC, storage e disponibilidade de serviços em cada projeto | Definir contrato neutro e escolher somente uma stack para referência após decisão do usuário; reusar capacidade cliente compatível | UNKNOWN por projeto; stack de referência aguarda resposta |

Referências detalhadas e limites da inspeção: [biblioteca de referências](../biblioteca-referencias/README.md).

## Regras globais e necessidades profissionais

- A chave estável do usuário GitHub, a autorização para o projeto e o papel de cliente/responsável são dimensões distintas. A autorização é verificada no backend em toda leitura e escrita.
- O identificador do projeto deve estar no escopo de toda consulta/mutação. A API não pode confiar em IDs recebidos do frontend sem vínculo verificado.
- Publicações importadas do GitHub precisam de chave de origem estável e sincronização idempotente. Apenas comentários/checkpoints marcados e aprovados para o cliente podem ser publicados.
- Progresso deve informar fórmula e fonte rastreável. Previsão de entrega requer data válida, responsável, contexto e revisão. Sem essas fontes, usar estado vazio/não disponível.
- Comentários continuam vinculados à publicação e à task após conclusão da task. Curtidas devem identificar usuário e publicação de forma persistente e idempotente.
- Uploads de imagem exigem validação de tipo real e declarado, tamanho configurável, autorização, armazenamento privado e entrega autenticada. Sem vídeo.
- Validar entradas e renderizar conteúdo inserido de forma segura; aplicar limites de abuso, CORS restrito, sessão/expiração/logout e logs sem segredos nem conteúdo privado desnecessário.
- Estados de carregamento, vazio, erro, acesso negado, sucesso, desabilitado e sessão expirada precisam de cobertura visual e funcional.
- O bundle Pages contém apenas configuração pública por projeto e código estático. Segredos, tokens, credenciais de banco, usuários e payload privado ficam fora.
- Atualização do template é um diff revisável; preparação repetida não pode duplicar arquivos nem sobrescrever customizações sem resolução explícita.

## Prioridades e capacidade

Ordem solicitada: template reutilizável completo, contrato e implementação de referência testável; validação independente de segurança, comportamento e interface; instruções de consumo futuro pelo Harness/DevOps. Não foi indicada data de entrega nem capacidade semanal. Esforço e duração ficam desconhecidos até decisão de stack, especificação SDD e análise dos testes/integradores.

## Decisões e próxima rodada

| ID | Assunto | Estado | Fonte | Razão e impacto |
| --- | --- | --- | --- | --- |
| D-01 | Hospedagem estática `github.io`, sem domínio próprio | APPROVED | Pedido do usuário | Limita frontend a artefato estático; exige API/backend externo |
| D-02 | Persistência no banco do projeto cliente via backend | APPROVED | Pedido do usuário | Impede acesso direto ao banco pelo browser; implementação deve preservar integração variável |
| D-03 | GitHub como identidade, autorização explícita no backend | APPROVED | Pedido do usuário | Login não equivale a permissão; exige ACL por projeto e teste negativo |
| D-04 | Nenhum segredo no frontend, repo ou artefato Pages | APPROVED | Pedido do usuário | Requisito de segurança e inspeção do bundle |
| D-05 | Reusar identidade visual do site pessoal sem conteúdo pessoal/efeitos prejudiciais | APPROVED | Pedido do usuário, código e referência Vercel renderizada | Evidências desktop/mobile coletadas; aprovação do catálogo/mockup adaptado continua gate antes da implementação |
| D-06 | Stack da implementação de referência | UNKNOWN, recomendação pendente de aprovação | Repositório não contém backend; prompt proíbe assumir stack universal | Foi proposta Node.js + Fastify + PostgreSQL apenas para referência; não prosseguir com essa escolha sem resposta |
| D-07 | Referência renderizada em desktop/mobile | APPROVED | Alias Vercel público confirmada pelo GitHub homepage URL e deployment `6866585404` com status success e SHA idêntico ao código inspecionado; capturas em `output/playwright/` | Inspeção visual concluída para os painéis Sobre e Portfólio; concluir catálogo/mockup adaptado durante UI/UX antes da implementação |
| D-08 | Destino e autorização de operações externas | APPROVED como limite | Pedido do usuário | Não fazer commit/push, merge, Pages, OAuth ou mudança de serviço do cliente sem aprovação específica posterior |
| D-09 | Superfície de gestão do responsável | UNKNOWN | Pedido separa permissões de cliente e responsável, sem requerer explicitamente uma tela administrativa | Define se o responsável administra ACL/publicações pelo próprio portal ou por API/ferramenta já existente; não presumir painel administrativo |

Perguntas pendentes desta rodada: aprovação/alternativa da stack de referência; superfície de gestão do responsável. A inspeção da referência visual já ocorreu em Vercel; o escopo funcional e as exclusões acima vêm do pedido e seguem sujeitos à aprovação formal do PRD antes da especificação de execução.
