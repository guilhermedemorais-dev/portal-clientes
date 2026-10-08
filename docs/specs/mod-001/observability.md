# Observabilidade operacional

## Instrumentação entregue na implementação de referência

- Fastify/Pino emite logs JSON em stdout. A API devolve `x-request-id`; quando não há ID de entrada, gera um aleatório. Authorization, cookie e URL inteira são redigidos. Bodies e erros brutos do provedor não são registrados.
- `GET /live` valida que o processo responde. `GET /ready` faz `SELECT 1` e retorna 503 quando PostgreSQL não responde.
- `GET /metrics` retorna Prometheus text exposition somente quando configurado `METRICS_BEARER_TOKEN` e recebido `Authorization: Bearer ...` correto; sem token configurado, a rota retorna 404. A comparação de token é feita em tempo constante após validação de tamanho. Restringir também a rede ao coletor.
- Counters: respostas por método/status, duração HTTP em histograma, auditoria por ação, autenticação/login e falhas de grant/OAuth, negações ACL por motivo, uploads criados/rejeitados e outcomes da importação de Issue. Labels usam enums fixos ou métodos normalizados (`OTHER` para métodos desconhecidos); nunca incluem projeto, usuário, Issue, nome/conteúdo de arquivo, texto ou token.
- Auditoria persistida em `audit_events` registra IDs operacionais de ator/projeto/recurso, ação, request ID e data, sem body, comentário ou segredo. Tratar a tabela como dado operacional sensível e definir retenção no destino.
- OAuth state, grants e sessões têm TTL, limpeza de entradas expiradas e limites máximos em memória. Os limites evitam crescimento ilimitado nesta referência de instância única.

## Operação e alarmes propostos

Os limiares abaixo são ponto de partida, não baseline medido. Calibrar no ambiente de cada projeto e encaminhar alertas fora do processo.

| Sinal | Condição inicial para investigar | Ação inicial |
| --- | --- | --- |
| `/ready` 503 | Duas amostras consecutivas | Conferir DB/rede/pool e manter a aplicação degradada, sem mascarar dados |
| Respostas 5xx | >2% por cinco minutos ou >10 consecutivas | Correlacionar `request_id`; comparar rota/status; rollback só com autorização do operador |
| Latência | p95 >1s em leitura ou >3s em upload por dez minutos | Conferir query, pool e tamanho do payload sem imprimir body privado |
| OAuth/ACL | Aumento de falhas fora do baseline do projeto | Revisar rate limit, callback e membership; nunca desabilitar ACL |
| GitHub sync | Série de 5xx ou item que o operador esperava importar permanece ausente | Consultar source Issue/comment, métricas fixas e logs por request ID; repetir sync após confirmar origem |
| Upload | Falhas repetidas ou aumento de rejeições | Conferir MIME, limite, storage e espaço; tratar órfão somente depois de confirmar referências |

## Limites comprovados e integração por destino

As métricas são contadores/histograma em memória do processo. Reinício zera os dados, não há agregação compartilhada entre réplicas, nem alerta, dashboard, retenção ou exporter persistente configurado neste repositório. Operação multi-réplica requer coletor/agregação apropriada e store compartilhado para sessão/grants. `/ready` consulta o banco; não mede health do GitHub nem armazenamento de upload. Os contadores não fornecem p95 por si só até serem raspados e agregados no Prometheus.

Instrumentação no código e recepção operacional não são a mesma prova: o operador do deploy ainda precisa validar scrape, retenção, painéis, alertas, rede privada, backup da tabela de auditoria e resposta em ambiente real. Nenhum serviço externo foi habilitado nesta execução.
