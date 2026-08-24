# Laboratório Visual — Components V2

## Objetivo

Esta branch contém um protótipo isolado para validar a nova linguagem visual do Blue Lock Arena diretamente no Discord antes de migrar comandos de produção.

## Teste

Use `/ui-lab`.

O protótipo valida:

- `Container` como estrutura principal;
- `Text Display` para hierarquia tipográfica;
- `Section` + `Thumbnail` para identidade e mídia contextual;
- `Separator` para ritmo e agrupamento;
- Markdown do Discord para títulos, negrito, código e subtexto;
- `ActionRow` com ações agrupadas;
- composição sem embed tradicional;
- português do Brasil no conteúdo do comando.

## Critério de aprovação

A aprovação deste teste não significa que o layout virou padrão definitivo. O objetivo é avaliar visualmente no Discord:

1. presença e impacto da mensagem;
2. legibilidade em desktop e celular;
3. densidade de informação;
4. equilíbrio entre texto, imagem e controles;
5. se a interface parece um produto nativo do Discord, e não apenas um embed remodelado.

## Próxima etapa após aprovação

Migrar primeiro uma superfície real de alto impacto, preferencialmente `/collection`, mantendo a lógica de dados e navegação existente e substituindo somente a camada visual por componentes V2 compartilhados.
