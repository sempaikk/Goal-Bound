# Discord — o que um bot pode fazer (mapa completo)

> Leitura obrigatória para quem mexer no Goal Bound.  
> Base: Discord API v10 + Components V2 (docs oficiais 2025–2026).  
> Objetivo: não reinventar a roda nem inventar feature impossível.

Atualizado: 2026-08-24

---

## 1. Arquitetura em duas vias

| Via | Para quê |
|---|---|
| **Gateway (WebSocket)** | Eventos em tempo real (mensagem, membro entrou, reação, interaction…) |
| **REST HTTP** | Ações pontuais (enviar msg, editar, registrar comando, ban, criar canal…) |

Bot moderno típico = Gateway ligado + REST para agir.  
Alternativa: só **Interactions Endpoint** (HTTP) para slash/botões, sem Gateway — serve para bots simples; Goal Bound usa Gateway (discord.js Client).

---

## 2. Como o usuário invoca o bot

### Application Commands (padrão 2026)

| Tipo | Onde aparece | Limites |
|---|---|---|
| **CHAT_INPUT** (slash `/`) | Campo de texto / picker | até 100 global + 100 por guild |
| **USER** (context menu) | Clique direito no usuário | 5 global (docs atuais ~5–15) |
| **MESSAGE** (context menu) | Clique direito na mensagem | 5 global |
| **PRIMARY_ENTRY_POINT** | Atividades / entry | apps com Activity |

Opções de slash: até **25** options; tipos STRING, INTEGER, NUMBER, BOOLEAN, USER, CHANNEL, ROLE, MENTIONABLE, ATTACHMENT; subcomandos e grupos; **autocomplete** em STRING/INTEGER/NUMBER; choices até 25; localization (`name_localizations`, `description_localizations`).

Permissões:
- `default_member_permissions` (bitfield)
- overwrites por usuário/role/canal (até 100) via Bearer token
- `contexts` (guild / bot DM / private channel)
- `integration_types` (guild install / user install)

### Prefix messages (legado)
Só com **Message Content Intent** (privilegiado). Goal Bound **não** depende disso — slash-first.

### Interactions (ciclo de vida)

Tipos recebidos:
1. PING  
2. APPLICATION_COMMAND  
3. MESSAGE_COMPONENT (botão / select)  
4. APPLICATION_COMMAND_AUTOCOMPLETE  
5. MODAL_SUBMIT  

Respostas possíveis:
- mensagem imediata  
- **defer** + edit depois (trabalho lento)  
- update da mensagem do componente  
- abrir **Modal**  
- resultado de autocomplete  
- ephemeral (só o usuário vê)  

Token da interaction expira (~15 min para follow-ups). Sempre defer se for passar de ~3s.

---

## 3. Mensagens e layout (Components V2)

Flag: `MessageFlags.IsComponentsV2` (`1 << 15`).  
Com a flag: **não** usa `content`/`embeds` clássicos — tudo vira componentes.

### Layout
- **Container** — caixa com accent color (substitui feeling de embed)
- **Section** — 1–3 TextDisplay + accessory obrigatório (Thumbnail **ou** Button)
- **Separator** — espaço / linha divisória
- **Action Row** — botões e selects

### Conteúdo
- **TextDisplay** — markdown completo (negrito, code, títulos, menções, emoji)
- **Thumbnail** — mini imagem (attachment:// ou URL)
- **MediaGallery** — até 10 mídias
- **File** — arquivo anexado referenciado

### Interativo (mensagem)
- Button (primary/secondary/success/danger/link)
- String Select, User Select, Role Select, Mentionable Select, Channel Select

### Modal
- Text Input (short/paragraph)
- selects em modal (versões recentes)
- File Upload em modal (recurso mais novo)
- Label / Radio Group (docs recentes)

**Limites críticos**
- ~40 componentes por mensagem (aninhados contam)
- ≤ 4000 chars somando TextDisplays
- Section: 1–3 textos + 1 accessory
- MediaGallery: 10 itens
- 5 botões por Action Row; várias rows

Padrão Goal Bound: ver `docs/VISUAL.md`.

---

## 4. Gateway Intents (o que o bot “ouve”)

Intents = assinatura de pacotes de eventos.

**Comuns (não privilegiados)**  
GUILDS, GUILD_MESSAGES, GUILD_MESSAGE_REACTIONS, GUILD_MODERATION, GUILD_EMOJIS_AND_STICKERS, GUILD_INVITES, GUILD_VOICE_STATES, GUILD_SCHEDULED_EVENTS, GUILD_INTEGRATIONS, AUTO_MODERATION_*, DIRECT_MESSAGES, etc.

**Privilegiados** (portal + aprovação se 100+ servers)
- **Guild Members** — join/leave/update, lista de membros
- **Guild Presences** — online/offline/atividade
- **Message Content** — texto das mensagens (exceto DM / menção ao bot)

Goal Bound (coleção de cartas): em geral **não** precisa de Message Content nem Presence. Members só se for welcome/ranking por member events.

---

## 5. O que o bot pode **fazer** (REST / permissões)

Depende das permissões no servidor e da hierarquia de cargos.

| Área | Exemplos |
|---|---|
| **Mensagens** | enviar, editar, deletar, pin, threads, reações, polls |
| **Canais** | criar/editar/deletar, permissões overwrite, webhooks |
| **Membros** | kick, ban, timeout, nick, adicionar/remover cargo |
| **Cargos** | criar/editar (abaixo do cargo do bot) |
| **Guild** | nome, ícone, audit log (ler), auto-mod rules |
| **Emoji/Sticker/Soundboard** | gerenciar se tiver perm |
| **Voz** | conectar, mover, mute/deaf server-side |
| **Eventos** | scheduled events |
| **Invites** | criar/listar/deletar |
| **Webhooks** | criar e postar |
| **Commands** | registrar/atualizar/deletar slash |
| **Monetização** | SKUs, entitlements, subscriptions (se habilitado no app) |
| **Activities** | Embedded App / entry point (outro produto) |

Hierarquia: bot só age em alvos com cargo **abaixo** do cargo mais alto do bot.

---

## 6. Eventos Gateway (amostra útil para jogos/bots de progresso)

- Interaction Create (núcleo do Goal Bound)
- Message Create/Update/Delete (+ reactions)
- Guild Member Add/Remove/Update
- Presence Update
- Voice State Update
- Channel / Thread / Role create-update-delete
- Guild Ban Add/Remove
- Invite Create/Delete
- Message Poll Vote Add/Remove
- Entitlement Create/Update/Delete (loja paga)
- Auto Moderation Action Execution

---

## 7. Combinações úteis (e o que Goal Bound já usa / pode usar)

| Combinação | Uso |
|---|---|
| Slash + options + autocomplete | `/collection filter:` |
| Slash → Container V2 + Sections + Thumbnails | catálogo / perfil |
| Botão → Modal → submit | busca por nome |
| Select String → update message | filtro raridade / ordenação |
| User option no slash | ver binder de outro (sem select interno) |
| Ephemeral | erros, confirmações privadas |
| Defer → edit | renders pesados |
| Context menu USER | “Ver perfil Goal Bound” no clique direito |
| Context menu MESSAGE | pouco uso no nosso jogo |
| Poll | enquetes de temporada / votação de carta |
| MediaGallery | vitrine da loja / pacotes |
| Attachment + Thumbnail attachment:// | arte local das cartas |
| Presence do bot | status “Jogando Goal Bound · N binders” |
| DM | hints / recompensas (com cuidado anti-spam) |

---

## 8. O que um bot **não** pode (limites reais)

- Ler conteúdo de mensagem sem Message Content Intent (exceto DM/menção)
- Bypass hierarquia de cargos / admin
- Enviar DM se o usuário bloqueou DMs de membros do server
- Nested Containers
- Section sem accessory
- Components V2 + embeds clássicos na mesma mensagem
- Responder interaction depois do token expirar sem ter deferido/follow-up a tempo
- Rate limits: respeitar ou a API 429 / ban temporário
- Ver canais sem permissão de View Channel

---

## 9. Monetização e “além do bot de texto”

- **SKU / Entitlements / Subscriptions** — venda de itens premium in-app (Discord Monetization)
- **Activities** — app embutido (jogo/canvas), entry point command
- **App Directory / Discovery** — listagem pública
- **Role Connections** — linked roles com metadata

Para Goal Bound hoje: foco em Components V2 + economia interna (iene). Monetização Discord é fase futura se quiserem.

---

## 10. Diretrizes deste projeto (do owner)

Registrado a pedido do dono do bot:

1. Visual **não minimalista** — ver `docs/VISUAL.md`
2. UI **100% PT-BR**; descriptions de slash **sem emoji**
3. QoL: não duplicar seleção de usuário dentro do painel se o slash já tem option
4. Prioridade atual: **acabamento visual V2** antes de expandir features de carta
5. Estudar capacidades oficiais antes de concluir “não dá” ou “só assim”
6. Registrar decisões de produto em `docs/` para qualquer chat futuro

---

## 11. Checklist rápido ao inventar feature

1. É interaction (slash/button/modal) ou precisa de Gateway event?
2. Precisa de intent privilegiado?
3. Cabe em Components V2 com os limites de 40 componentes / 4000 chars?
4. Copy em PT-BR? Description sem emoji?
5. Hierarquia/permissões do bot no server cobrem a ação?
6. Defer se demorar > ~3s?
7. Atualiza `docs/VISUAL.md` se mudar padrão de layout?
