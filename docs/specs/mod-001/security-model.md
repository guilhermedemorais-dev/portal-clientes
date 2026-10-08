# Modelo de segurança, MOD-001

## Ativos e fronteiras

- Dados privados: checkpoint ainda não publicado, feedback cliente, comentários, ACL, anexos, auditoria e credenciais do backend.
- Superfícies: arquivo estático público Pages, API pública com ACL, PostgreSQL privado, armazenamento privado, GitHub OAuth/API e runtime/monitor interno.
- Papéis: visitante anônimo, cliente autorizado, responsável (owner), operador do backend e provedor GitHub.
- Regra central: autenticação por GitHub identifica a conta; não concede acesso. Cada query usa usuário, projeto e membership ativa.

## Controles obrigatórios

- OAuth secrets e DB/GitHub credentials exclusivamente em secret manager de servidor. State+PKCE provedor, browser PKCE para grant de callback, allowlist de callbacks/origens, token bearer expirável em memória, sem cookie third-party ou persistência longa.
- Nenhum conteúdo privado em HTML/JS/config pública; saída Pages só contém shell/assets e metadata público.
- CORS na lista exata da origem Pages, TLS no deploy, CSP headers, rate limits e validação de schema/limites. Renderizar comentário como texto escapado.
- Verificar role/projeto/revogação em cada leitura/escrita/download, sem URL pública de anexo. Upload PNG/JPEG/WebP/GIF validado MIME + magic e tamanho; SVG/script/arquivo ZIP negado; armazenamento privado 0700/0600 em referência local. Produção deve decodificar/re-encodar por biblioteca segura e/quota.
- Status de publicação explícito. Feedback do cliente começa pendente e exige triagem owner. Sync owner-only aceita apenas `{issueNumber,commentId}`, busca a fonte com token read-only e importa somente body marcado `<!-- portal:client-approved -->`; a identidade repo+Issue+comment é estável e idempotente. Nunca escrever no GitHub nem projetar body de Issue/comentário não aprovado no portal.
- Logs e traces não carregam cabeçalhos, query tokens, corpo, comentário, issue body, filename ou conteúdo binário. Retenção de auditoria configurada no serviço cliente.

## Casos negativos de validação

1. Sem bearer, bearer vencido, bearer revogado.
2. Conta GitHub válida sem allowlist; cliente tentando projeto diferente; owner de projeto A tentando administrar projeto B.
3. Membro revogado tentando ler post ou baixar upload com ID válido de outro projeto.
4. Grant reutilizado, expirado ou trocado por verifier/challenge divergente; OAuth state reutilizado.
5. Issue/comment não aprovado, source key repetida com issue diferente, conteúdo HTML/script.
6. Upload de SVG, MIME forjado, magic inválido, tamanho > limite, upload de arquivo de outro usuário.
7. CORS de origem não configurada e excesso de chamadas.

## Risco residual

Validação por magic bytes não substitui parsing/re-encode; deploy local não demonstra secret manager/TLS/CORS real; sessões/grants em memória não suportam múltiplas réplicas; fornecimento/rotação/revogação do token do GitHub e backup/retention precisam de operação por projeto. Cobertura de security final depende de receipt separado e testes HTTP/DB/browse.
