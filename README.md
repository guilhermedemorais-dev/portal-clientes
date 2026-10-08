# Portal do Cliente

Template reutilizável de portal privado por projeto. A interface é um site estático para GitHub Pages; dados, identidade e anexos privados passam pela API e pelo banco do projeto. O frontend não recebe segredos e não inclui dados de exemplo em produção.

## Rodar localmente

Requisitos: Node.js 22+, npm e Docker Compose (para PostgreSQL local).

```sh
cd backend
cp .env.example .env
# Edite ACCESS_MAP_JSON com IDs numéricos sintéticos/autorizações locais; não use credenciais reais em fixture.
docker compose up -d postgres
npm ci
set -a; . ./.env; set +a
npm run db:migrate
npm run dev
```

Em outro terminal, na raiz:

```sh
npm ci
npm run dev
```

Abra `http://localhost:5173`. O template inicial mostra “Configuração necessária” até que `public/portal-config.js` contenha os metadados públicos do projeto. O fluxo GitHub real só funcionará após configurar o OAuth App no backend, a URL pública/callback, os membros autorizados e a origem CORS. Nenhum login simulado é incluído no build.

## Validar e gerar o artefato estático

```sh
npm run typecheck
npm test
npm run test:template
npm run build
```

Para o repositório cliente `OWNER/REPO`, faça o build com o caminho Pages do repositório:

```sh
VITE_BASE_PATH=/REPO/ npm run build
```

O único diretório de publicação é `dist/`. O workflow reutilizável em `.github/workflows/pages-build.yml` constrói e envia apenas esse diretório como artifact. Ele é acionado somente por `workflow_call`; não habilita Pages, não publica sozinho e não faz deploy deste repositório.

## Configuração pública do frontend

Edite `public/portal-config.js` no projeto instalado:

```js
window.PORTAL_CONFIG = {
  projectName: 'Portal Aurora',
  projectId: 'aurora',
  projectBio: 'Acompanhe etapas, entregas e próximos passos.',
  apiBaseUrl: 'https://api.example.com',
  boardUrl: 'https://github.com/OWNER/REPO/projects/1',
  logoUrl: 'https://assets.example.com/aurora-mark.svg'
};
```

`projectName`, `projectId` e `apiBaseUrl` são obrigatórios. A configuração rejeita campos desconhecidos e campos com nome de credencial; API remota precisa usar HTTPS. Tudo nesse arquivo é público. A logo também deve ser um asset publicável, não um arquivo privado.

## Referência de arquitetura

- `src/`: UI React + TypeScript compilada como arquivos estáticos; token de acesso fica somente no estado da página.
- `backend/`: implementação de referência Node 22 + Fastify + PostgreSQL e migração SQL. Não impõe essa stack aos projetos clientes.
- `backend/openapi.yaml`: contrato HTTP v1.
- `backend/.env.example`: nomes das configurações server-side, sem segredo.
- `docs/specs/`: regras de produto, segurança, operação e observabilidade.
- `docs/design/`: Design Guide e catálogo HTML.
- `output/playwright/`: captura original Vercel e evidências locais; não são parte do artifact.
- `.github/workflows/pages-build.yml`: workflow reutilizável que cria artifact somente a partir de `dist/`.

GitHub OAuth usa state contra CSRF, PKCE do servidor e um challenge/verifier PKCE do navegador. A API retorna grant de uso único e curta duração ao callback estático. O frontend troca o grant por um bearer curto, mantido em memória; ao recarregar, o cliente autentica novamente. Isso evita cookies de terceiros e credenciais duráveis no browser.

O backend verifica membership ativa em cada rota do projeto, inclusive reações, comentários e download. Cliente autenticado não ganha acesso por padrão. O mapa inicial `ACCESS_MAP_JSON` provisiona IDs e papel owner/client; o responsável pode depois administrar membros pela API owner. Checkpoints publicados precisam de estado aprovado; feedback é enviado para triagem e não muda automaticamente tarefa, prioridade ou previsão.

## Preparar e atualizar em outro projeto

No checkout do projeto cliente, rode primeiro o plano sem gravar:

```sh
node /caminho/para/portal-clientes/scripts/sync-template.mjs --project=/caminho/do/projeto-cliente
```

Leia o diff/plan. Para adicionar os arquivos ausentes e atualizar apenas arquivos cuja cópia cliente continua idêntica à base anterior:

```sh
node /caminho/para/portal-clientes/scripts/sync-template.mjs --project=/caminho/do/projeto-cliente --apply
```

O comando exige um checkout Git existente, escreve apenas em `docs/portal/` e usa allowlist. Não copia `.git`, `node_modules`, `dist`, `.env`, uploads privados, banco ou `output/`. `.template-baseline.json` registra hashes da origem, não dados de runtime. Customizações locais são mantidas; mudanças concorrentes na mesma linha de arquivo aparecem como conflito e nunca são sobrescritas. Revise os conflitos e faça o merge manualmente. Arquivos obsoletos não são apagados automaticamente.

## Instalação do backend de referência

Leia [`backend/README.md`](backend/README.md), configure o segredo OAuth e um token GitHub com acesso somente leitura às Issues no gerenciador de segredos do servidor, restrinja `FRONTEND_ORIGINS`, configure URL HTTPS fixa do serviço e provisionamento real de membros. O diretório de upload deve ser privado, durável e fora da raiz servida pelo web server. Use o banco do projeto cliente e adapte armazenamento, retenção, operação de sessão e observabilidade à plataforma existente. Nenhuma credencial deve entrar em `public/`, em `dist/` ou neste repositório.

## Limites verificados desta entrega

O código e o PostgreSQL local podem ser iniciados e testados. A conta/app OAuth, servidor HTTPS, token GitHub de Issues, configuração Pages em cliente real, domínio API, backup, alertas e storage durável ainda dependem de dados/serviços reais e autorização do respectivo destino. Métricas de referência são de processo; `/metrics` deve permanecer acessível só pela rede interna de monitoramento. Isso não equivale a deploy ou validação de produção.
