# Biblioteca de referências

Revisão do conjunto: 1. Escopo: descoberta inicial; evidência limitada aos commits listados e arquivos examinados.

## Template source

- Repositório: https://github.com/guilhermedemorais-dev/portal-clientes
- Revisão observada: `90ec1ed91e121efcad6b39fd72e9e1a9f4c351a3` (`main` no momento da inspeção).
- Arquivos relevantes: `README.md` (único arquivo de projeto presente).
- Finalidade: identificar estado inicial e origem pretendida do template.
- Resultado: README descreve “portal para monitoramento de projetos”; não há frontend, backend, APIs, schema/migrations, fixtures ou testes.
- Cobertura/limites: o clone raso e limpo prova somente o estado daquele commit; não prova existência de integrações/uso fora deste repositório.

## Referência visual pessoal

- Repositório: https://github.com/guilhermedemorais-dev/guilhermedemorais.dev
- Revisão observada: `7dd4fd340c025812c2b7dfe668b3d52d41962864` (`main` no momento da inspeção).
- Produção Vercel verificada em 2026-10-08: homepage pública do GitHub aponta para `https://guilhermedemorais-dev.vercel.app`; deployment GitHub `6866585404` está `success`, ambiente `Production`, criado em 2026-10-05 18:15:45 UTC, com `sha/ref` iguais à revisão acima. A URL customizada `https://guilhermedemorais.dev` não resolveu nesta sessão, mas o alias `vercel.app` abriu a implantação correta.
- Evidência visual/runtime de referência: [captura desktop 1440x1000](../../output/playwright/reference-desktop.png), [captura mobile 390x844](../../output/playwright/reference-mobile.png), [captura mobile da aba Portfólio](../../output/playwright/reference-mobile-portfolio.png), snapshots DOM via Playwright CLI e título `Guilherme de Morais`. Foram inspecionados os painéis Sobre e Portfólio. A página publicada mostra perfil centralizado no desktop e alinhado à esquerda no celular; tabs horizontais com scroll; cabeçalho e conteúdo escuros, tipografia mono e linhas; projetos/cards com resumos, status e links.
- Observações a adaptar, não copiar automaticamente: scanlines aparecem por toda a página e o cabeçalho/cidade têm elementos animados; avaliar contraste e movimento no catálogo e manter apenas se não reduzirem legibilidade/acessibilidade. Tabs móveis são intencionalmente horizontais.
- Limite de runtime: houve um erro de console, `favicon.ico` retornou 404; não impediu a renderização da página. Esta verificação valida a referência, não o template do portal.
- Stack declarada no README: Next.js, TypeScript, CSS próprio, Vercel e endpoints de atendimento; a stack de publicação conflita com a hospedagem estática do portal e não deve ser copiada como padrão de backend.
- Arquivos relevantes examinados: `app/page.tsx`, `app/globals.css`, `app/layout.tsx`, `data/site.ts`, `package.json`, `next.config.ts`, `README.md`.
- Padrões visíveis pelo código: fundo preto, texto monocromático, fonte mono principal, linhas/bordas finas, perfil e bio, barra de navegação sticky com tabs, área de conteúdo alinhada por largura máxima, cards/linhas e breakpoints móveis/desktop.
- Conteúdo/efeitos expressamente excluídos: identidade/texto pessoal, foto pessoal, SDR/chat, APIs/e-mail, segredos, scanlines/boot/animação incompatível com leitura ou movimento reduzido.
- Limite: a inspeção cobre os painéis Sobre e Portfólio em desktop/mobile e o DOM acessível, não todos os nove painéis nem estados interativos/API do site. O endereço customizado falha em DNS nesta sessão, mas o alias Vercel público serviu a implantação correspondente ao SHA verificado.

## Referência de processo do Harness

- Regra de consumo: `client-portal.md` da versão instalada do Dev Workflow Standard 0.3.0+codex.20260922, consultada na descoberta.
- Uso: confirma que o portal fica em repositório separado e se prepara no projeto consumidor em `docs/portal/`, por diff, com apenas o artefato estático dedicado.
- Limite: a referência trata de adoção do template pelo Harness; não define o aplicativo do template, implementação backend nem autorização para alterar o repositório do Harness.
