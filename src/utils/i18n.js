/**
 * PT/EN player-facing strings.
 * Preference: qolStore locale (/profile language button).
 * Missing PT keys fall back to EN.
 *
 * Slash command descriptions stay English on purpose (Discord shows
 * description_localizations from the *client* language, not this preference).
 */
const { getLocale } = require('../services/qolStore.js');
const EXTRA = require('../services/i18nKeys.js');

const EN = Object.assign({
  gate_open: 'Gate **open**',
  gate_closed: 'Gate closed',
  next_pull: 'Next pull',
  next_ready: '⏱️ Next: **ready** (unlimited)',
  balance: 'Balance',
  pity: 'Pity',
  soft_pity: '🔥 Soft pity',
  cost_per_roll: 'per roll',
  empty_binder: 'Your binder is empty.',
  empty_binder_cta: 'Open **`/banners`** to recruit, then seat them on **`/team`**.',
  empty_team: 'Vacant pitch.',
  empty_team_cta: 'Pick a role, then a card from your binder.',
  no_iene: 'Not enough Iene.',
  no_iene_cta: 'Claim **`/daily`** or earn Iene from chat/voice with a fielded eleven.',
  master_owned_idle: 'You own a master but none is active — open **Master**.',
  restore_hint: 'You can restore the previous lineup after Clear All.',
  share_hint: 'Profile shared in this channel.',
  lang_set_en: 'Language set to **English**.',
  lang_set_pt: 'Language set to **Portuguese**.',
  rank_ROOKIE: 'Rookie',
  rank_PROSPECT: 'Prospect',
  rank_REGULAR: 'Regular',
  rank_ELITE: 'Elite',
  rank_ACE: 'Ace',
  rank_LEGEND: 'Legend',
  rarity_LOCKED: 'Locked',
  rarity_EGOISTA: 'Egoist',
  rarity_NEW_GEN: 'New Gen',
  profile_full_binder: 'Full binder',
  profile_eleven_ready: 'Eleven ready',
  profile_viewing: 'Viewing',
  profile_overview: 'Overview',
  profile_rank: 'Rank',
  profile_score: 'score',
  profile_next: 'Next',
  profile_max_rank: 'Max rank reached',
  profile_iene: 'Iene',
  profile_eleven: 'Eleven',
  profile_binder: 'Binder',
  profile_left: 'left',
  profile_done: 'complete',
  profile_shape: 'Formation',
  profile_no_master: 'no master',
  profile_vacant: 'Vacant',
  profile_ready: 'ready',
  profile_avg: 'avg',
  profile_pitch: 'Pitch',
  profile_who_xp: 'Closest to level up',
  profile_empty_pitch: 'Empty pitch.\nOpen **`/team`** to seat your eleven — only fielded cards gain XP.',
  profile_no_shape: 'No formation set yet.',
  profile_tiers: 'Tiers',
  profile_last_pulls: 'Recent pulls',
  profile_full_set: 'Full set unlocked',
  profile_masters: 'Masters',
  profile_footer_self: '`/daily` · `/banners` · `/team` · `/stats`',
  profile_footer_other: 'Opened by another viewer',
  profile_compare: 'Compare with a server member…',
  profile_btn_binder: 'Binder',
  profile_btn_eleven: 'Eleven',
  profile_btn_banner: 'Banner',
  profile_btn_share: 'Share',
  profile_btn_lang: 'Language',
  daily_already: 'Already claimed today',
  daily_already_body: 'Come back after **UTC midnight**.\nYour balance: **{bal}** 💰',
  daily_claimed: 'Daily reward claimed',
  daily_claimed_body: 'You received **+{amount}** 💰 Iene.\nBalance: **{bal}**\n\n_Resets at **00:00 UTC** every day._',
  daily_footer: 'Spend on /banners',
  daily_next: 'Next claim',
  daily_cta_spend: 'Spend Iene on **`/banners`**.',
  daily_cta_recruit: 'Open **`/banners`** to recruit.',
  daily_btn_banners: 'Open Banner',
  help_quick: 'Quick start',
  help_full: 'Full guide',
  help_recruit: '**{n}** egoists to recruit.',
  help_quick_body:
    '**Quick start**\n' +
    '0️⃣ **Admin:** **`/setchannel`** in the play channel (once per server)\n' +
    '1️⃣ **`/daily`** — **+{daily}** Iene once per day\n' +
    '2️⃣ **`/banners`** — roll x1 / x5 / x10 *(1 Iene each + 1 min gate)*\n' +
    '3️⃣ **`/team`** — seat eleven · pick a **master**\n' +
    '4️⃣ Chat / voice **anywhere on the server** — XP + Iene for fielded cards\n' +
    '5️⃣ **`/profile`** · **`/collection`** · **`/stats`**\n\n' +
    '_Commands only work in the channel set by `/setchannel`.\nOnly the eleven on `/team` rank up._',
  help_commands: '**Commands**\n`/daily` · `/banners` · `/team` · `/collection` · `/profile` · `/stats` · `/setchannel` · `/help`',
  help_guide: 'Guide',
  help_chars: '**{n}** characters available.',
  help_daily: '### 💰 /daily\nClaim **{daily}** Iene once per day (resets **00:00 UTC**).',
  help_banners:
    '### 🎴 /banners\n' +
    '**Standard** — field players.\n' +
    '**Coaches** — Ego / Noa / Lavinho / Snuffy.\n' +
    '**Cost:** 1 Iene per roll · **x5 / x10** multi (confirm first).\n' +
    '**Gate:** 1 min shared (Owner/Tester free, no CD).\n' +
    '**Pity (Standard):** {pity} rolls without New Gen → next is **guaranteed New Gen**.\n' +
    '**Duplicates:** Locked **+15 XP** · Egoist **+20 XP** · New Gen **+50 XP** (on the owned card).\n' +
    '**Gate DM:** opt-in on the hub when the gate reopens.',
  help_rates: '### 🏟️ Standard rates',
  help_team:
    '### 📋 /team\n' +
    'Shape the eleven. **Master** changes formation.\n' +
    '**Restore last** after Clear All.\n' +
    'Only fielded cards gain XP.',
  help_xp:
    '### 🔺 XP & Iene\n' +
    'Levels **0 → 100**.\n' +
    '• Every **10 messages** (≥ 3s apart) — **any text channel**\n' +
    '• Every **1 min** in voice — **any call**\n' +
    'Each tick: **+10 XP** / fielded card · **+1** Iene.\n' +
    '• **Banner duplicates** grant XP on that card (Locked 15 · Egoist 20 · New Gen 50).\n' +
    '_(Server must be activated with `/setchannel` first.)_\n' +
    'Also: **`/daily`** (+{daily}).',
  help_other:
    '### 📔 /collection · 🧬 /profile · 📊 /stats · 🔒 /setchannel\n' +
    '**Binder** — filter by rarity, search, sort.\n' +
    '**Profile** — rank, pools, recent pulls, who needs XP.\n' +
    '**Stats** — most pulled cards on the server.\n' +
    '**`/setchannel`** — admins set the **command channel** (required once).\n' +
    'Commands only work there · XP/Iene still count from chat & voice server-wide.',
  help_cards_count: '{n} cards',
  help_empty_tier: 'empty tier',
  team_title: "{user}'s Eleven",
  team_no_master: 'No master',
  team_complete: 'Eleven complete',
  team_filled: '**{n}/11** filled',
  team_pick_role: 'Pick a role below to edit · empty slots gain nothing.',
  team_xp_note: 'Only the eleven on the pitch gain XP from chat and voice.',
  team_all_xp: 'All eleven gaining XP from chat and voice.',
  team_who_xp: 'Closest to level up',
  team_footer: 'Only you can use these controls',
  team_sel_role: 'Select a role to edit',
  team_empty_slot: 'Empty — assign a card',
  team_master: 'Master',
  team_master_set: 'Master (set me)',
  team_clear_all: 'Clear All',
  team_restore: 'Restore last eleven',
  team_back: 'Back',
  team_no_masters: 'No masters owned — roll /banners → Coaches',
  team_pick_master: 'Pick a master',
  team_no_master_opt: 'No master (default 4-3-3)',
  team_no_cards: 'No cards yet — use /banners first',
  team_open_self: 'Open **`/team`** yourself.',
  team_card_page: '{page}/{total} · {n}',
  setup_ok_title: 'Channel locked in',
  setup_ok:
    '**Commands** only work in {channel}.\n' +
    '**XP & Iene** still count from chat and voice **anywhere** on this server.\n\n' +
    '_Admins can change this anytime with **`/setchannel`**._',
  setup_cleared_title: 'Bot paused on this server',
  setup_cleared: 'Allowed channel removed.\nUse **`/setchannel`** again to reactivate Goal Bound here.',
  setup_cleared_none: 'No channel was configured yet.',
  setup_denied_title: 'Admins only',
  setup_denied: 'Only the **server owner** or members with **Manage Server** can set the bot channel.',
  setup_guild_only_title: 'Server only',
  setup_guild_only: 'Use **`/setchannel`** inside a Discord server, not in DMs.',
  setup_bad_channel_title: 'Invalid channel',
  setup_bad_channel: 'Pick a **text** or **announcement** channel.',
  gate_not_setup_title: 'Almost ready — one admin step',
  gate_not_setup:
    'Goal Bound is on this server but **not activated** yet.\n\n' +
    'Ask an admin to open the channel where the bot should live and run:\n' +
    '**`/setchannel`**\n\n' +
    '_Until then, commands and rewards stay off so other chats stay clean._',
  gate_wrong_channel_title: 'Wrong channel',
  gate_wrong_channel:
    'Commands only work in {channel}.\n' +
    'Head there to use the bot, or ask an admin to move it with **`/setchannel`**.\n\n' +
    '_Chat and voice still earn XP/Iene anywhere on the server._',
  ban_hub_title: 'Banner',
  ban_hub_pick: 'Pick a pool, then roll.',
  ban_standard: 'Standard Banner',
  ban_coaches: 'Coaches Banner',
  ban_standard_desc: 'field egoists',
  ban_coaches_desc: 'Ego, Noa, Lavinho, Snuffy',
  ban_multi_hint: 'x5 / x10 multi available · Gate DM optional',
  ban_gate_dm_on: 'Gate DM: ON',
  ban_gate_dm_off: 'Gate DM: OFF',
  ban_need_iene: 'Need Iene',
  ban_roll: 'Roll x1',
  ban_all_pools: 'All pools',
  ban_not_enough: 'Not enough Iene',
  ban_gate_closed: 'Gate closed',
  ban_dup: 'Duplicate',
  ban_new: 'New · added to binder',
  ban_dup_short: 'dup',
  ban_dup_xp: 'dup · +{xp} XP',
  ban_dup_xp_up: 'dup · +{xp} XP · Lv.{from}→{to}',
  ban_dup_max: 'dup · MAX',
  ban_new_short: '**NEW**',
  ban_confirm: 'Confirm multi x{n}',
  ban_cancel: 'Cancel',
  ban_rates: 'Rates',
  ban_open_self: 'Open **`/banners**.',
  ban_pool_empty: 'Pool is empty',
  ban_multi_title: 'Multi x{n}',
  ban_footer_left: '{bar} · {n} left',
  ban_footer_done: '{bar} · DONE',
  ban_free_line: '💰 free · **{bal}**',
  ban_cost_line: '💰 −{cost} · **{bal}**',
  teaser_locked_title: '🔒 A presence stirs…',
  teaser_locked_desc: '_Someone steps onto the grass._',
  teaser_ego_title: '👁️ An ego flares…',
  teaser_ego_desc: '_The air gets heavier._',
  teaser_newgen_title: '💫 Something extraordinary…',
  teaser_newgen_desc: '_A New Gen pressure builds._',
  teaser_coach_title: '🎩 A master arrives…',
  teaser_coach_desc: '_The system is about to change._',
  field_role: 'Role',
  field_rarity: 'Rarity',
  field_level: 'Level',
  field_master: '🎩 Master',
  gate_dm_body:
    '⏱️ **Banner gate is open.**\n' +
    'You can roll again with **`/banners`**.\n\n' +
    '_Turn this off anytime with the **Gate DM** button on the Banner hub._',
  missing_tier: '**{n}** missing of {total}',
  stats_title: 'Goal Bound — Server stats',
  stats_total: 'Total recorded pulls',
  stats_7d: 'Pulls (last 7 days)',
  stats_pools: '**Pools:** Standard **{std}** · Coaches **{coach}**',
  stats_top_all: 'Most pulled (all time)',
  stats_top_7d: 'Most pulled (7 days)',
  stats_missing: 'Your binder gaps',
  stats_missing_none: 'No gaps — full tiers or empty binder.',
  stats_no_pulls: '_No pulls recorded yet. Open `/banners` and roll._',
  stats_no_pulls_7d: '_No pulls in the last 7 days._',
  stats_footer: '7d tracking starts from this update',
  col_switch: 'Switch binder — pick a member…',
  col_tier_ph: '🏷️ Tier: {tier}',
  col_tier_all: 'All',
  col_tier_all_opt: 'All tiers',
  col_order_ph: '↕️ Order: {sort}',
  col_sort_rarity: 'Rarity',
  col_sort_level: 'Level',
  col_sort_name: 'Name',
  col_sort_rarity_desc: 'Group by tier',
  col_sort_level_desc: 'Highest first',
  col_sort_name_desc: 'A → Z',
  col_search: 'Search',
  col_filter: 'Filter: {q}',
  col_clear: 'Clear',
  col_prev: '◀ Prev',
  col_next: 'Next ▶',
  col_full_set: '🏁 **FULL SET** · **{owned}/{pool}**',
  col_left: '{bar} · **{n}** left',
  col_filter_tier: '🏷️ Tier: **{tier}** · {n}',
  col_filter_search: '🔍 Search: **{q}** · {n}',
  col_no_match: '_No cards match this filter. Try **Clear** or another tier._',
  col_no_page: '_No cards on this page._',
  col_binder_title: "{user}'s Binder",
  col_viewing: '_Viewing another binder_',
  col_on_pitch: '📌 On pitch **{n}/11** · ↕️ **{sort}**',
  col_empty_title: '🧳 Empty binder',
  col_empty_other: "**{user}** hasn't recruited anyone yet.",
  col_not_yours_title: '🚫 Not your panel',
  col_not_yours: 'Open **`/collection`** yourself.',
  col_pick_human: '🤖 Pick a human',
  col_bots: '🤖 Automated accounts have no binder',
  col_modal_title: 'Search binder',
  col_modal_label: 'Name, role, or rarity',
  col_modal_ph: 'e.g. isagi, FW, egoista',
  col_master_tag: 'Master',
  col_player: 'Player',
  col_n_cards: '{n} cards',
  col_n_matches: '{n} matches',
  lb_title: 'LEADERBOARD',
  lb_hook_1: 'Only the strongest elevens survive.',
  lb_hook_2: 'Your squad. Their ego. One board.',
  lb_hook_3: 'World’s best starts with who you seat.',
  lb_hook_4: 'No mercy on the ranking. Prove it.',
  lb_hook_5: 'Build the eleven. Climb the board.',
  lb_hook_6: 'Egoists don’t ask for rank — they take it.',
  lb_hook_7: 'One hundred slots. Make yours count.',
  lb_hook_8: 'The board doesn’t lie. Your eleven does the talking.',
  lb_board_line: '**{total}** elevens ranked · **{complete}** full XI on the board',
  lb_board_empty: 'The board is waiting for the first eleven.',
  lb_squad_empty:
    '### Your eleven\n' +
    '**Empty pitch.**\n' +
    'Seat players with **`/team`** — only then you enter the board.',
  lb_squad_line:
    '### Your eleven\n' +
    '⚡ **{score}** SP · **{filled}/11** · avg Lv.**{avg}**{master}{ready}\n' +
    '_{formation} · rank lives only on the site_',
  lb_ready: ' · **XI READY**',
  lb_open: 'OPEN LIVE BOARD',
  lb_btn_team: 'Build eleven',
  lb_btn_banners: 'Recruit',
  lb_btn_daily: 'Daily Iene',
  lb_footer: '_Top 100 · climbers of the week · your row opens highlighted · Goal Bound_',
  rate_click_title: '⏱️ Easy there',
  rate_click_body: 'Too many clicks in a short window.\nWait a second, then try again.',
  rate_cmd_title: '⏱️ Slow down',
  rate_cmd_body: 'You can use **/{cmd}** again in **{wait}**.',
  err_loading: 'Something failed on our side. Try again in a few seconds.',
  err_cmd_missing: '❌ This command is not available.',
  err_owner_only: 'That action is reserved for the bot owner.',
  panel_not_yours_title: '🚫 Not your panel',
  panel_not_yours: 'Open the matching command yourself.',
  bots_bench: 'Automated accounts stay on the bench. Pick a human.'
}, EXTRA.EN || {});

const PT = Object.assign({
  gate_open: 'Portão **aberto**',
  gate_closed: 'Portão fechado',
  next_pull: 'Próximo pull',
  next_ready: '⏱️ Próximo: **pronto** (ilimitado)',
  balance: 'Saldo',
  pity: 'Pity',
  soft_pity: '🔥 Soft pity',
  cost_per_roll: 'por pull',
  empty_binder: 'Seu binder ainda está vazio.',
  empty_binder_cta: 'Abre o **`/banners`**, recruta e depois monta o time no **`/team`**.',
  empty_team: 'Ninguém no campo ainda.',
  empty_team_cta: 'Escolhe uma posição e coloca uma carta do binder.',
  no_iene: 'Iene insuficiente.',
  no_iene_cta: 'Pega o **`/daily`** ou ganha Iene no chat/call com o time em campo.',
  master_owned_idle: 'Você já tem master, mas nenhum está ativo — toca em **Master**.',
  restore_hint: 'Dá pra restaurar o último time depois de limpar tudo.',
  share_hint: 'Perfil compartilhado neste canal.',
  lang_set_en: 'Idioma: **English**.',
  lang_set_pt: 'Idioma: **Português (Brasil)**.',
  rank_ROOKIE: 'Novato',
  rank_PROSPECT: 'Promessa',
  rank_REGULAR: 'Regular',
  rank_ELITE: 'Elite',
  rank_ACE: 'Ás',
  rank_LEGEND: 'Lenda',
  rarity_LOCKED: 'Locked',
  rarity_EGOISTA: 'Egoísta',
  rarity_NEW_GEN: 'New Gen',
  profile_full_binder: 'Binder completo',
  profile_eleven_ready: 'Time pronto',
  profile_viewing: 'Vendo',
  profile_overview: 'Resumo',
  profile_rank: 'Rank',
  profile_score: 'pontos',
  profile_next: 'Próximo',
  profile_max_rank: 'Rank no máximo',
  profile_iene: 'Iene',
  profile_eleven: 'Time',
  profile_binder: 'Binder',
  profile_left: 'faltando',
  profile_done: 'completo',
  profile_shape: 'Formação',
  profile_no_master: 'sem master',
  profile_vacant: 'Vazio',
  profile_ready: 'pronto',
  profile_avg: 'média',
  profile_pitch: 'Campo',
  profile_who_xp: 'Quem precisa de XP',
  profile_empty_pitch: 'Campo vazio.\nAbre o **`/team`** e coloca o onze — só quem está em campo ganha XP.',
  profile_no_shape: 'Ainda sem formação.',
  profile_tiers: 'Tiers',
  profile_last_pulls: 'Últimos pulls',
  profile_full_set: 'Coleção completa',
  profile_masters: 'Masters',
  profile_footer_self: '`/daily` · `/banners` · `/team` · `/stats`',
  profile_footer_other: 'Aberto por outro jogador',
  profile_compare: 'Comparar com alguém do servidor…',
  profile_btn_binder: 'Binder',
  profile_btn_eleven: 'Time',
  profile_btn_banner: 'Banner',
  profile_btn_share: 'Compartilhar',
  profile_btn_lang: 'Idioma',
  daily_already: 'Daily já resgatado',
  daily_already_body: 'Volta depois da **meia-noite UTC**.\nSeu saldo: **{bal}** 💰',
  daily_claimed: 'Daily resgatado',
  daily_claimed_body: 'Você ganhou **+{amount}** 💰 Iene.\nSaldo: **{bal}**\n\n_Reseta todo dia às **00:00 UTC**._',
  daily_footer: 'Gasta no /banners',
  daily_next: 'Próximo resgate',
  daily_cta_spend: 'Gasta Iene no **`/banners`**.',
  daily_cta_recruit: 'Abre o **`/banners`** pra recrutar.',
  daily_btn_banners: 'Abrir Banner',
  help_quick: 'Começar rápido',
  help_full: 'Guia completo',
  help_recruit: '**{n}** egoístas pra recrutar.',
  help_quick_body:
    '**Começar rápido**\n' +
    '0️⃣ **Admin:** **`/setchannel`** no canal do bot (uma vez por servidor)\n' +
    '1️⃣ **`/daily`** — **+{daily}** Iene por dia\n' +
    '2️⃣ **`/banners`** — pull x1 / x5 / x10 *(1 Iene cada + portão de 1 min)*\n' +
    '3️⃣ **`/team`** — monta o onze · escolhe um **master**\n' +
    '4️⃣ Chat / call **em qualquer lugar do servidor** — XP + Iene pra quem tá em campo\n' +
    '5️⃣ **`/profile`** · **`/collection`** · **`/stats`**\n\n' +
    '_Comandos só no canal do `/setchannel`.\nSó o onze do `/team` sobe de nível._',
  help_commands: '**Comandos**\n`/daily` · `/banners` · `/team` · `/collection` · `/profile` · `/stats` · `/setchannel` · `/help`',
  help_guide: 'Guia',
  help_chars: '**{n}** personagens no jogo.',
  help_daily: '### 💰 /daily\nResgata **{daily}** Iene uma vez por dia (reseta **00:00 UTC**).',
  help_banners:
    '### 🎴 /banners\n' +
    '**Standard** — jogadores de campo.\n' +
    '**Coaches** — Ego / Noa / Lavinho / Snuffy.\n' +
    '**Custo:** 1 Iene por pull · multi **x5 / x10** (confirma antes).\n' +
    '**Portão:** 1 min pra todo mundo (Owner/Tester grátis, sem CD).\n' +
    '**Pity (Standard):** {pity} pulls sem New Gen → o próximo é **New Gen garantido**.\n' +
    '**Duplicata:** Locked **+15 XP** · Egoísta **+20 XP** · New Gen **+50 XP** (na carta que você já tem).\n' +
    '**Gate DM:** opcional no hub quando o portão reabre.',
  help_rates: '### 🏟️ Taxas do Standard',
  help_team:
    '### 📋 /team\n' +
    'Monta o onze. O **Master** muda a formação.\n' +
    '**Restaurar** depois de limpar tudo.\n' +
    'Só quem está em campo ganha XP.',
  help_xp:
    '### 🔺 XP e Iene\n' +
    'Níveis **0 → 100**.\n' +
    '• A cada **10 mensagens** (intervalo ≥ 3s) — **qualquer canal de texto**\n' +
    '• A cada **1 min** em call — **qualquer call**\n' +
    'Cada tick: **+10 XP** por carta em campo · **+1** Iene.\n' +
    '• **Duplicata no banner** dá XP na carta (Locked 15 · Egoísta 20 · New Gen 50).\n' +
    '_(O servidor precisa do `/setchannel` primeiro.)_\n' +
    'Também: **`/daily`** (+{daily}).',
  help_other:
    '### 📔 /collection · 🧬 /profile · 📊 /stats · 🔒 /setchannel\n' +
    '**Binder** — filtra por raridade, busca e ordena.\n' +
    '**Profile** — rank, pools, últimos pulls, quem precisa de XP.\n' +
    '**Stats** — cartas mais puxadas no servidor.\n' +
    '**`/setchannel`** — admin define o **canal de comandos** (obrigatório uma vez).\n' +
    'Comandos só lá · XP/Iene continuam no chat e na call do servidor inteiro.',
  help_cards_count: '{n} cartas',
  help_empty_tier: 'tier vazio',
  team_title: 'Time de {user}',
  team_no_master: 'Sem master',
  team_complete: 'Onze completo',
  team_filled: '**{n}/11** no campo',
  team_pick_role: 'Escolhe uma posição pra editar · slot vazio não ganha XP.',
  team_xp_note: 'Só o onze em campo ganha XP de chat e call.',
  team_all_xp: 'Os onze estão ganhando XP de chat e call.',
  team_who_xp: 'Quem precisa de XP',
  team_footer: 'Só você usa esses botões',
  team_sel_role: 'Escolhe uma posição',
  team_empty_slot: 'Vazio — coloca uma carta',
  team_master: 'Master',
  team_master_set: 'Master (definir agora)',
  team_clear_all: 'Limpar tudo',
  team_restore: 'Restaurar último time',
  team_back: 'Voltar',
  team_no_masters: 'Sem master ainda — puxa no /banners → Coaches',
  team_pick_master: 'Escolhe um master',
  team_no_master_opt: 'Sem master (padrão 4-3-3)',
  team_no_cards: 'Sem cartas ainda — usa /banners primeiro',
  team_open_self: 'Abre o **`/team`** você mesmo.',
  team_card_page: '{page}/{total} · {n}',
  setup_ok_title: 'Canal definido',
  setup_ok:
    '**Comandos** só funcionam em {channel}.\n' +
    '**XP e Iene** ainda contam no chat e na call **em qualquer lugar** deste servidor.\n\n' +
    '_Admins podem mudar com **`/setchannel`** quando quiser._',
  setup_cleared_title: 'Bot pausado neste servidor',
  setup_cleared: 'Canal permitido removido.\nUse **`/setchannel`** de novo pra reativar o Goal Bound aqui.',
  setup_cleared_none: 'Nenhum canal configurado ainda.',
  setup_denied_title: 'Só admins',
  setup_denied: 'Só o **dono do servidor** ou quem tem **Gerenciar Servidor** pode definir o canal do bot.',
  setup_guild_only_title: 'Só no servidor',
  setup_guild_only: 'Use **`/setchannel`** dentro de um servidor, não no PV.',
  setup_bad_channel_title: 'Canal inválido',
  setup_bad_channel: 'Escolhe um canal de **texto** ou **anúncios**.',
  gate_not_setup_title: 'Quase pronto — falta o admin',
  gate_not_setup:
    'O Goal Bound está no servidor, mas **ainda não foi ativado**.\n\n' +
    'Pede pra um admin abrir o canal onde o bot deve ficar e rodar:\n' +
    '**`/setchannel`**\n\n' +
    '_Até lá, comandos e recompensas ficam desligados pra não sujar outros chats._',
  gate_wrong_channel_title: 'Canal errado',
  gate_wrong_channel:
    'Comandos só funcionam em {channel}.\n' +
    'Vai pra lá ou pede pra um admin mudar com **`/setchannel`**.\n\n' +
    '_Chat e call ainda dão XP/Iene em qualquer lugar do servidor._',
  ban_hub_title: 'Banner',
  ban_hub_pick: 'Escolhe um pool e puxa.',
  ban_standard: 'Banner Standard',
  ban_coaches: 'Banner Coaches',
  ban_standard_desc: 'jogadores de campo',
  ban_coaches_desc: 'Ego, Noa, Lavinho, Snuffy',
  ban_multi_hint: 'multi x5 / x10 disponível · Gate DM opcional',
  ban_gate_dm_on: 'Gate DM: ON',
  ban_gate_dm_off: 'Gate DM: OFF',
  ban_need_iene: 'Falta Iene',
  ban_roll: 'Puxar x1',
  ban_all_pools: 'Todos os pools',
  ban_not_enough: 'Iene insuficiente',
  ban_gate_closed: 'Portão fechado',
  ban_dup: 'Duplicata',
  ban_new: 'Nova · foi pro binder',
  ban_dup_short: 'dup',
  ban_dup_xp: 'dup · +{xp} XP',
  ban_dup_xp_up: 'dup · +{xp} XP · Lv.{from}→{to}',
  ban_dup_max: 'dup · MÁX',
  ban_new_short: '**NOVA**',
  ban_confirm: 'Confirmar multi x{n}',
  ban_cancel: 'Cancelar',
  ban_rates: 'Taxas',
  ban_open_self: 'Abre o **`/banners`**.',
  ban_pool_empty: 'Pool vazio',
  ban_multi_title: 'Multi x{n}',
  ban_footer_left: '{bar} · faltam {n}',
  ban_footer_done: '{bar} · COMPLETO',
  ban_free_line: '💰 grátis · **{bal}**',
  ban_cost_line: '💰 −{cost} · **{bal}**',
  teaser_locked_title: '🔒 Uma presença se move…',
  teaser_locked_desc: '_Alguém entra no gramado._',
  teaser_ego_title: '👁️ Um ego acende…',
  teaser_ego_desc: '_O ar fica mais pesado._',
  teaser_newgen_title: '💫 Algo extraordinário…',
  teaser_newgen_desc: '_A pressão de um New Gen sobe._',
  teaser_coach_title: '🎩 Um master chega…',
  teaser_coach_desc: '_O sistema está prestes a mudar._',
  field_role: 'Posição',
  field_rarity: 'Raridade',
  field_level: 'Nível',
  field_master: '🎩 Master',
  gate_dm_body:
    '⏱️ **O portão do banner abriu.**\n' +
    'Pode puxar de novo com **`/banners`**.\n\n' +
    '_Desliga quando quiser no botão **Gate DM** do hub de Banner._',
  missing_tier: 'faltam **{n}** de {total}',
  stats_title: 'Goal Bound — Stats do servidor',
  stats_total: 'Pulls no total',
  stats_7d: 'Pulls (últimos 7 dias)',
  stats_pools: '**Pools:** Standard **{std}** · Coaches **{coach}**',
  stats_top_all: 'Mais puxadas (geral)',
  stats_top_7d: 'Mais puxadas (7 dias)',
  stats_missing: 'O que falta no seu binder',
  stats_missing_none: 'Nada faltando — tiers completos ou binder vazio.',
  stats_no_pulls: '_Nenhum pull ainda. Abre `/banners` e puxa._',
  stats_no_pulls_7d: '_Nenhum pull nos últimos 7 dias._',
  stats_footer: 'A contagem de 7 dias começa a partir desta atualização',
  col_switch: 'Trocar binder — escolhe um membro…',
  col_tier_ph: '🏷️ Tier: {tier}',
  col_tier_all: 'Todos',
  col_tier_all_opt: 'Todos os tiers',
  col_order_ph: '↕️ Ordem: {sort}',
  col_sort_rarity: 'Raridade',
  col_sort_level: 'Nível',
  col_sort_name: 'Nome',
  col_sort_rarity_desc: 'Agrupar por raridade',
  col_sort_level_desc: 'Maior primeiro',
  col_sort_name_desc: 'A → Z',
  col_search: 'Buscar',
  col_filter: 'Filtro: {q}',
  col_clear: 'Limpar',
  col_prev: '◀ Voltar',
  col_next: 'Próx ▶',
  col_full_set: '🏁 **COMPLETO** · **{owned}/{pool}**',
  col_left: '{bar} · faltam **{n}**',
  col_filter_tier: '🏷️ Tier: **{tier}** · {n}',
  col_filter_search: '🔍 Busca: **{q}** · {n}',
  col_no_match: '_Nenhuma carta nesse filtro. Toca em **Limpar** ou outro tier._',
  col_no_page: '_Nenhuma carta nesta página._',
  col_binder_title: 'Binder de {user}',
  col_viewing: '_Vendo o binder de outra pessoa_',
  col_on_pitch: '📌 Em campo **{n}/11** · ↕️ **{sort}**',
  col_empty_title: '🧳 Binder vazio',
  col_empty_other: '**{user}** ainda não recrutou ninguém.',
  col_not_yours_title: '🚫 Não é seu painel',
  col_not_yours: 'Abre o **`/collection`** você mesmo.',
  col_pick_human: '🤖 Escolhe uma pessoa',
  col_bots: '🤖 Contas automáticas não têm binder',
  col_modal_title: 'Buscar no binder',
  col_modal_label: 'Nome, posição ou raridade',
  col_modal_ph: 'ex: isagi, FW, egoista',
  col_master_tag: 'Master',
  col_player: 'Jogador',
  col_n_cards: '{n} cartas',
  col_n_matches: '{n} resultados',
  lb_title: 'PLACAR',
  lb_hook_1: 'Só os onzes mais fortes sobrevivem.',
  lb_hook_2: 'Seu time. O ego deles. Um placar.',
  lb_hook_3: 'O melhor do mundo começa em quem você coloca em campo.',
  lb_hook_4: 'Sem piedade no ranking. Prova.',
  lb_hook_5: 'Monta o onze. Sobe no placar.',
  lb_hook_6: 'Egoísta não pede rank — toma.',
  lb_hook_7: 'Cem vagas. Faz a sua valer.',
  lb_hook_8: 'O placar não mente. Seu onze fala por você.',
  lb_board_line: '**{total}** times no ranking · **{complete}** XI completo no placar',
  lb_board_empty: 'O placar espera o primeiro onze.',
  lb_squad_empty:
    '### Seu onze\n' +
    '**Campo vazio.**\n' +
    'Coloca jogadores com **`/team`** — só assim você entra no placar.',
  lb_squad_line:
    '### Seu onze\n' +
    '⚡ **{score}** SP · **{filled}/11** · média Lv.**{avg}**{master}{ready}\n' +
    '_{formation} · o rank fica só no site_',
  lb_ready: ' · **XI PRONTO**',
  lb_open: 'ABRIR PLACAR AO VIVO',
  lb_btn_team: 'Montar onze',
  lb_btn_banners: 'Recrutar',
  lb_btn_daily: 'Daily Iene',
  lb_footer: '_Top 100 · subidas da semana · sua linha abre destacada · Goal Bound_',
  rate_click_title: '⏱️ Calma',
  rate_click_body: 'Muitos cliques seguidos.\nEspera um segundo e tenta de novo.',
  rate_cmd_title: '⏱️ Devagar',
  rate_cmd_body: 'Você pode usar **/{cmd}** de novo em **{wait}**.',
  err_loading: 'Algo falhou do nosso lado. Tenta de novo em alguns segundos.',
  err_cmd_missing: '❌ Esse comando não está disponível.',
  err_owner_only: 'Isso é só pro dono do bot.',
  panel_not_yours_title: '🚫 Não é seu painel',
  panel_not_yours: 'Abre o comando correspondente você mesmo.',
  bots_bench: 'Contas automáticas ficam no banco. Escolhe uma pessoa.'
}, EXTRA.PT || {});

const STR = { en: EN, pt: PT };

function t(userId, key, vars) {
  const loc = getLocale(userId) === 'pt' ? 'pt' : 'en';
  let s = (STR[loc] && STR[loc][key]) || STR.en[key] || key;
  if (vars && typeof vars === 'object') {
    for (const [k, v] of Object.entries(vars)) {
      s = s.split(`{${k}}`).join(String(v));
    }
  }
  return s;
}

function localeOf(userId) {
  return getLocale(userId) === 'pt' ? 'pt' : 'en';
}

function rankLabel(userId, key) {
  return t(userId, `rank_${key}`) || key;
}

function rarityLabel(userId, key) {
  return t(userId, `rarity_${key}`) || key;
}

module.exports = { t, localeOf, rankLabel, rarityLabel, STR };
