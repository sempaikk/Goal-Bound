# Goal Bound — Conceito visual e UX

> Documento permanente. Qualquer chat/agente que mexer no bot **deve** ler isto antes de alterar mensagens, comandos ou layouts.

Atualizado: 2026-08-24  
Idioma do bot: **português do Brasil (PT-BR) em tudo** — zero inglês na UI.

---

## Norte visual (não negociável)

O Goal Bound **não é minimalista**.

Referência de qualidade: bots como **Blue Lock Arena** — mensagens densas, organizadas, com hierarquia clara, markdown forte e Components V2 usados de verdade (não só “embed antigo disfarçado”).

Objetivo: ao abrir qualquer resposta do bot, a pessoa deve pensar **“bonito / profissional / completo”**, não “mensagem de bot genérico”.

### O que isso significa na prática

1. **Components V2 sempre** nas telas principais (`MessageFlags.IsComponentsV2`).
2. **Container** com barra de accent color = “card” principal da tela.
3. **Section + Thumbnail** quando houver arte (carta, avatar, item) — texto à esquerda, mini-arte à direita.
4. **Separator** entre blocos (header / lista / ações).
5. **Markdown agressivo** em TextDisplay:
   - `#` / `##` títulos
   - `**negrito**` nomes e números importantes
   - `` `código` `` para OVR, nível, IDs, saldos
   - listas e `·` como separadores visuais
   - `-#` para notas secundárias
6. **Emojis com função** no corpo da mensagem (rótulos, raridade, status) — não enfeite vazio.
7. **Sem emoji na description dos slash commands** (só texto claro em PT-BR).
8. Layout **denso e legível**, não “espaçado demais / vazio”.

### O que evitar

- Mensagens só com embed clássico quando der pra usar V2
- Telas “magras” com pouco conteúdo e muito espaço morto
- Misturar EN/PT na UI
- User-select / “ver perfil de outra pessoa” **dentro** de painéis onde não precisa (ex.: collection) — isso fica **só na option do slash** (`/collection user:`)
- Descrições de comando com emoji no começo

---

## Kit Components V2 (Discord)

Flag obrigatória: `MessageFlags.IsComponentsV2` (`1 << 15`).

| Componente | Uso no Goal Bound |
|---|---|
| **Container** | Envelope da tela (accent color, agrupa tudo) |
| **TextDisplay** | Todo texto (markdown completo) |
| **Section** | Linha “texto + acessório” (1–3 TextDisplays + Thumbnail ou Button) |
| **Thumbnail** | Mini carta / avatar / ícone à direita da Section |
| **Separator** | Divisor entre header, lista e botões |
| **MediaGallery** | Vitrine de pacotes / múltiplas artes (ex.: loja) |
| **ActionRow** | Botões e selects **dentro** do Container |

Limites importantes:

- ~40 componentes por mensagem (incluindo aninhados)
- ≤ 4000 caracteres somando todos os TextDisplays
- Section: 1–3 TextDisplays + **obrigatório** 1 accessory (Thumbnail **ou** Button)
- Sem accessory → não use Section; use TextDisplay direto no Container

Padrão ouro (já validado no `/collection`):

```
Container (accent)
├─ TextDisplay  → título + progresso
├─ TextDisplay  → meta / breakdown
├─ Separator
├─ Section × N  → "1. Nome" + OVR/Lv  |  Thumbnail carta
├─ Separator
└─ ActionRows   → filtros, paginação (sem user-select redundante)
```

---

## Idioma e copy

- **Tudo PT-BR**: nomes de comandos podem ser EN técnicos (`/collection`) se já existirem, mas **description, labels, placeholders, embeds, erros, tooltips** = português.
- Description dos slash: **texto detalhado, sem emoji**.
  - Ex.: `Veja e filtre o binder de cartas — raridade, posicao, busca e ordem`
- Tom: claro, direto, um pouco “arena / esportivo”, sem ser infantil.

---

## Qualidade de vida (QoL)

1. **Não duplicar seleção de usuário** dentro do painel se o slash já tem `user:`.
2. Paginação e filtros só quando a lista for grande.
3. Estados vazios com CTA claro (ex.: binder vazio → sugerir summon).
4. Feedback de erro em PT-BR, curto e acionável.
5. Mobile: testar densidade (texto não pode virar parede ilegível).

---

## Prioridade de trabalho (ordem)

1. Visual V2 das telas existentes (collection, profile, team, leaderboard, daily, banners/summon…)
2. Unificar idioma PT-BR + limpar descriptions dos commands
3. QoL (remover user-selects redundantes, etc.)
4. Depois retomar expansão de cartas / economia / features novas

---

## Checklist antes de mergear UI

- [ ] Mensagem usa Components V2 (flag + Container/Section onde faz sentido)
- [ ] Markdown (negrito, code, títulos) usado de propósito
- [ ] Texto 100% PT-BR na UI
- [ ] Description do slash sem emoji
- [ ] Sem controle redundante (user select se o slash já cobre)
- [ ] Accent color coerente com o estado (completo / aviso / padrão)
- [ ] Thumbnail/alt text quando houver arte

---

## Referência mental

Blue Lock Arena (carteira, catálogo, ranking, loja, perfil):  
header com título + thumbnail do usuário, blocos separados, listas numeradas com mini-arte à direita, selects só onde agregam, densidade alta sem bagunça.

Nós queremos o **mesmo nível de acabamento**, com identidade Goal Bound.
