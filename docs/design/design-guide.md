# Design Guide do Portal do Cliente

Revisão 1. Baseado na inspeção do site público `guilhermedemorais.vercel.app` (produção, 2026-10-08), no código público relacionado e nas capturas desktop/mobile em `output/playwright/`. O catálogo vivo correspondente está em [`catalog.html`](catalog.html).

## Princípio

Adaptar o vocabulário visual terminal/editorial da referência ao acompanhamento de projeto: fundo quase preto, alto contraste, mono para navegação e metadados, títulos tipográficos grandes, divisores finos, chips de contorno e cards sem sombra pesada. Usar estrutura e hierarquia semelhantes, não copiar conteúdo pessoal nem animação que atrapalhe leitura.

## Tokens

| Token | Valor | Uso |
| --- | --- | --- |
| `--bg` | `#090909` | fundo da aplicação |
| `--surface` | `#111111` | cards, painel e superfícies |
| `--surface-raised` | `#171717` | controles ativos |
| `--text` | `#f1f1ef` | texto principal |
| `--muted` | `#92928f` | metadados e texto secundário |
| `--line` | `#30302e` | bordas e separadores |
| `--accent` | `#d8ff3e` | foco de progresso e atenção, com texto escuro |
| `--danger` | `#ff8278` | erro e bloqueio |
| `--font-mono` | `ui-monospace, SFMono-Regular, Menlo, monospace` | navegação, labels, timestamps |
| `--font-body` | `Inter, ui-sans-serif, system-ui, sans-serif` | leitura corrida |
| `--content-width` | `1080px` | largura de leitura |

## Componentes

IDs estáveis: `PRJ-HEADER`, `PROJECT-TABS`, `FEED-POST`, `STATUS-BADGE`, `PROGRESS-METER`, `EMPTY-STATE`, `SESSION-BANNER`, `DASHBOARD-MODULE`, `PRIVATE-ATTACHMENT`. As props e regras de teclado/contraste são demonstradas no catálogo HTML.

## Comportamento visual e acessibilidade

- Desktop: identificação do projeto compacta no topo, navegação horizontal; coluna de leitura limitada; status e metadados alinhados em grade.
- Mobile: perfil alinhado à esquerda, abas em trilho horizontal com overflow; ações em alvo de pelo menos 44px; texto não depende de hover.
- Texto inserido por usuário nunca é interpretado como HTML. Foco visível com `:focus-visible`; abas usam controles semânticos, setas opcionais e `aria-selected`.
- Respeitar `prefers-reduced-motion`. Sem scanlines permanentes, cursor piscante, typewriter ou texto escondido; legibilidade prevalece.
- Progresso sempre mostra unidade/fórmula e quantidade observada. Não animar um dado vazio para parecer ativo.
- Estados de loading, vazio, erro e acesso negado precisam de texto e ícone/estrutura; cor não é o único sinal.

## Fontes e referência

As capturas são evidência do layout público consultado, não aprovação de qualquer pessoa para mudança no site de origem. O código final será avaliado em navegador com viewports desktop e mobile.
