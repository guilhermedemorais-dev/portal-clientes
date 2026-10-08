# `docs/portal/` no projeto cliente

Esse diretório contém o código do template, não é por si só o site publicado. Revise `docs/portal/src/`, `backend/`, configuração, docs e diff antes de integrar. O build é executado nesse diretório e gera somente `docs/portal/dist/`.

## Configurar

1. Ajuste `public/portal-config.js` com metadata público, `projectId`, API HTTPS, board e logo publicável.
2. Configure uma instância backend por projeto conforme `backend/README.md`, usando o banco/armazenamento autorizado já existente quando compatível.
3. Inclua exatamente a origem Pages em `FRONTEND_ORIGINS`; defina o callback fixo em `FRONTEND_CALLBACK_URL`; guarde OAuth/database/GitHub secrets só no servidor.
4. Cadastre no servidor os IDs GitHub owner/client autorizados. Login sem ACL não acessa conteúdo.
5. Rode testes, build e revise bundle `dist/` antes de habilitar publicação no repositório cliente.

## Consumir o build reutilizável

O workflow de build mora na origem do template, em `.github/workflows/pages-build.yml`, e só aceita `workflow_call`. No repositório cliente, crie e revise uma chamada sob `.github/workflows/`; escolha o ref/revisão explícito da origem. Passe `source_dir: docs/portal` e `base_path: /NOME_DO_REPOSITORIO/`. O workflow cria artifact somente de `docs/portal/dist`. Permissões Pages e job `deploy-pages` são configuração separada do projeto cliente e precisam de revisão/autorização próprias.

## Atualizar com segurança

Use o plano do `scripts/sync-template.mjs` na origem antes de `--apply`. A aplicação só modifica arquivos novos ou sem customização local detectada. Conflito em arquivo deve ser comparado e resolvido manualmente; o script não o sobrescreve. Arquivos removidos da origem não são removidos do cliente automaticamente. Rode novamente `npm ci`, testes e build depois de integrar o diff.
