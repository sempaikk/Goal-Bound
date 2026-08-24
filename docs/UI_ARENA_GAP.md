# UI — Arena vs Goal Bound (o que mudar)

Referências:
- Screenshot **Blue Lock Arena** `/catalogo` (2026-08-24)
- Nosso `/ui-lab` + `docs/VISUAL.md`
- Discord Components V2 (flag `IsComponentsV2`, Container, Section, Thumbnail…)

---

## O que o Arena acerta (e nós ainda não)

| Arena | Goal Bound hoje | Correção |
|-------|-----------------|----------|
| **Um** Container com barra lateral | Às vezes texto solto / selects empilhados | Sempre 1 Container + accent |
| Header: **título + 1 linha de ajuda** + thumb de destaque | Header com barra de progresso + breakdown longo | Header curto; progresso em `-#` |
| Controles: **Filtrar** · **Ordenar** (2 ações claras) | UserSelect + 2 selects + busca = 4 rows | Máx. 2–3 rows de controle |
| Linha de estado: `Filtro: X · Ordenação: Y` | Meta misturada no header | Linha dedicada sob os controles |
| Lista: `**N. Nome**` / `POS · OVR · ID` | Linha mais “chatty” | Padrão `listRow` do `arenaV2` |
| Thumb **à direita** de cada item | Já temos Section+Thumbnail | Manter; arte FUT se existir |
| Footer: `Página 1/150 — N no catálogo` em muted | Botão disabled com página | `-#` + botões « ‹ › » |
| Sem User Select no painel | User Select ocupa 1 row | Só option slash `user:` |

---

## Kit Discord V2 (o que existe e usamos)

| Componente | Uso |
|------------|-----|
| **Container** + accent | Caixa principal (substitui embed) |
| **TextDisplay** | Títulos `#` / `##`, negrito, `` `code` ``, `-#` muted |
| **Section** + **Thumbnail** | Lista item / header com arte |
| **Section** + **Button** | Ação colada no bloco (perfil) |
| **Separator** | Ritmo entre header / lista / ações |
| **MediaGallery** | Vitrine (perfil / loja futura) |
| **ActionRow** | Selects e botões **dentro** do Container |
| **Modal** | Busca por nome |
| **String Select** | Filtro / ordem |

Limites: ~40 componentes/msg · ≤4000 chars em TextDisplays · Section exige accessory.

**Não** misturar `content`/`embeds` com flag V2.

---

## Padrão ouro (copiar do Arena + ui-lab)

```
Container (accent)
├─ Section          → # Título + 1 frase · Thumbnail destaque
├─ Separator
├─ TextDisplay     → -# progresso / filtro ativo
├─ ActionRow        → Select Filtrar  (ou botão + modal)
├─ ActionRow        → Select Ordenar
├─ ActionRow        → Buscar / Limpar  (só se precisar)
├─ Separator
├─ Section × 4–5    → **N. Nome** + POS · OVR · Lv | Thumb
├─ Separator
├─ TextDisplay     → -# Página x/y · N itens
└─ ActionRow        → «  ‹  ›  »
```

Helpers: `src/utils/arenaV2.js` (`headerSection`, `listRow`, `muted`, `separator`).

---

## Ordem de migração

1. **`/collection`** — catálogo (esta análise)
2. **`/profile`** — já V2; densificar como Arena
3. **`/banners`** — tirar embed clássico
4. **`/team`** — pitch + V2 controles
5. **`/daily` · `/help` · `/stats`**

`/ui-lab` continua como sandbox; não é a UI de produção.
