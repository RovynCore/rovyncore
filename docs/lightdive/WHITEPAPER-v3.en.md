# Lightdive Whitepaper v3

> English text of the in-game Whitepaper page. Keep the same sections, blocks, list items and table rows as WHITEPAPER-v3.md (the generator checks). Re-run `node scripts/lightdive-v3-whitepaper.mjs` after editing.

## 1. At a glance

**Lightdive** is RovynCore's first game on Robinhood Chain. Players collect three kinds of NFT — Spires, Resonance Prisms and Seekers — build teams, and send them each day along light bridges into deep space to bring light back, which turns into $RVYN.

A day of play is just three steps:

- **Build a team**: Spire + Prism + Seekers = one team. The higher its Power, the deeper it can go.
- **Dive**: Pick a destination and set out. The voyage takes 5 minutes, its log is written line by line, and you make one decision along the way.
- **Collect**: After the reveal, collect by hand. Rewards go into the Treasury and can be withdrawn to your wallet at any time.

Rewards are not fixed. The Core Light Pool releases only 1% of its balance each day, shared out in proportion to the Lightdust each person brought back that day. The more people dive, the less each one gets; no new $RVYN is ever minted.

| Key numbers | Details |
|---|---|
| Initial Core Light Pool funding | 1,000,000 $RVYN |
| Released per day | 1% of the Core Light Pool balance |
| Per wallet per day | 3 Dive Passes |
| Team limit | 5 at once |
| Team Power | 51–1200 |
| Star map | 6 clusters, 24 destinations |
| Voyage time | 5 minutes |
| Contract status | Unaudited; preview and testnet only for now |

This whitepaper describes rules and design. It is not investment advice and does not guarantee any reward.

## 2. The world

At the centre of the galaxy, ROVYN CORE gave off the first light: the corelight. That light was too bright to hold itself together. It shattered into countless pieces of light and sank into the depths of the galaxy.

Long afterwards, observers found a black plain of steles on the edge of the core and raised the first Spire. Spires draw in the scattered light, Resonance Prisms bend it into light bridges, and Seekers walk those bridges into deep space and bring the light back. This is called diving.

On the Observatory's oldest wall is carved a single line: "Dive into deep space and bring the first light home."

### Characters

- **Rovyn, the Signal Keeper**: the Observatory's guide. Rovyn listens to the signals from deep space, wakes new Seekers, and talks to you when you set out. Rovyn is an NPC, not an NFT.
- **Seekers**: the ones who ride the Spires out. Each carries one of six lights.
- **Observers**: that's you.

The full story is on the in-game Story page.

## 3. How a day works

| Time | What happens |
|---|---|
| 00:00 UTC | A new day: 3 Dive Passes per wallet; the 24 destinations take on today's light; 4 sky events are announced; today's rate is updated. |
| Any time | Use a Dive Pass: choose a team → a cluster → a destination → confirm → set out. |
| Within 5 minutes of setting out | The voyage log writes itself; at 30% a voyage decision appears. |
| 5 minutes after setting out | The result and wear are revealed. |
| After the reveal | Collect by hand; only then do rewards go into the Treasury. A team that hasn't collected can't set out again. |
| Any time | Withdraw from the Treasury to your wallet; the later you withdraw, the lower the fee. |

### Limits

- Each wallet gets 3 Dive Passes a day, and the same team can set out at most 3 times a day.
- Each wallet can have at most 5 teams at once.
- Dive Passes and voyages are counts. They can't be bought or sold, and they are not currency.

These limits keep daily participation steady and predictable, and make the Core Light Pool's sharing fairer for everyone.

## 4. Three kinds of NFT

All three are ERC-721 (symbol RVDIV), with every attribute stored on-chain.

How many can exist at once is capped: 3,000 Spires, 6,000 Prisms and 12,000 Seekers. The caps can only be lowered, and cards that go home free up room.

| | Spire | Resonance Prism | Seeker |
|---|---|---|---|
| Role | The team's base | Sets the risk style | Takes a berth and sets out |
| Power | 41–140 | 10–60 | 10–200 |
| Trait | Rarity sets 1–5 berths | Beam: Wide / Focused / Pinpoint | Light: Dawn / Mist / Crystal / Blaze / Storm / Abyss |
| Voyages | 180 (about 60 days) | 135 (about 45 days) | 45 (about 15 days) |
| Launch price | 50.00 $RVYN | 30.00 $RVYN | 20.00 $RVYN |

### Rarity

Five rarities, shared by all three NFTs. On screen they are told apart by colour and gem shape: each step up adds one point to the gem.

| Rarity | Colour | Gem | Spire chance | Prism chance | Seeker chance |
|---|---|---|---|---|---|
| Glimmer | Grey | Circle | 48% | 50% | 44% |
| Vein | Green | Triangle | 29% | 28% | 35% |
| Crystal | Blue | Four points | 15% | 15% | 15% |
| Prismatic | Purple | Five points | 7% | 6% | 5% |
| Corestar | Orange | Six points | 1% | 1% | 1% |

### Power by rarity

| Rarity | Spire | Prism | Seeker |
|---|---|---|---|
| Glimmer | 41–55 (1 berth) | 10–19 | 10–39 |
| Vein | 56–75 (2 berths) | 20–29 | 40–79 |
| Crystal | 76–95 (3 berths) | 30–39 | 80–119 |
| Prismatic | 96–115 (4 berths) | 40–49 | 120–159 |
| Corestar | 116–140 (5 berths) | 50–60 | 160–200 |

The ranges meet end to end, so a higher rarity always means higher Power.

## 5. Teams and Power

**Team Power = Spire + Prism + all Seekers**.

- Smallest team that can set out: Glimmer Spire 41 + one Seeker 10 = 51 (the Prism is optional).
- Largest team: Corestar Spire 140 + Corestar Prism 60 + 5 Corestar Seekers 1000 = 1200.
- With no Prism fitted, the risk style counts as Focused.
- Docked or listed NFTs can't be put in a team.

## 6. The star map: 6 clusters, 24 destinations

The closer to the core, the higher the threshold and the reward factor, and the higher the empty-handed chance, departure cost and wear.

| Cluster | Power range | Reward factor | Departure cost | Extra wear chance | Risk |
|---|---|---|---|---|---|
| ① The Glimmer Shallows | 51–91 | ×1.000–1.077 | 3% | None | Safe |
| ② The Echolight Reefs | 92–159 | ×1.104–1.189 | 5% | 5% wear 2 | Moderate |
| ③ The Stele Shadows | 160–289 | ×1.218–1.312 | 7% | 10% wear 2 | Risky |
| ④ The Mistlight Gorge | 290–499 | ×1.345–1.448 | 9% | 15% wear 2, 2.5% wear 3 | Perilous |
| ⑤ The Riftlight Expanse | 500–839 | ×1.485–1.599 | 11% | 20% wear 2, 6% wear 3 | Abyss |
| ⑥ The Core Crown | 840–1200 | ×1.639–1.765 | 13% | 25% wear 2, 10% wear 3 | Core |

Each cluster has 4 destinations (A–D), each with its own Power threshold. A team can go to any destination within its threshold; it doesn't have to go to the deepest.

## 7. A dive

### Odds tables

Each cluster has one odds table per Prism beam, 18 in all. Outcomes are Empty-handed, Slight loss, Normal, Good haul, Great haul and Legendary. The outcome is drawn first, then a multiplier is drawn within that outcome's range. **Every table's average multiplier is 1.00**; the beam only changes the spread.

| Cluster | Wide: empty / Great haul or better | Focused: empty / Great haul or better | Pinpoint: empty / Great haul or better | Top multiplier |
|---|---|---|---|---|
| ① | 3% / 1.4% | 5% / 2% | 7% / 2.4% | about ×2.7 |
| ② | 6% / 2.8% | 10% / 4% | 13.5% / 4.8% | about ×2.7 |
| ③ | 9.5% / 3.8% | 16% / 5.5% | 21.5% / 6.8% | about ×6.5 |
| ④ | 14.5% / 4.7% | 24% / 7% | 32.5% / 8.8% | about ×8.0 |
| ⑤ | 19% / 5.7% | 32% / 8.5% | 43% / 10.8% | about ×9.0 |
| ⑥ | 25% / 7.3% | 42% / 11% | 55% / 14% | about ×10.0 |

All 18 tables are on the in-game Rules page, with every chance public.

### What affects the result

- **Attuned light**: when a Seeker's light matches the destination's light today, that Seeker brings back an extra 15% of their own Power, up to +10% for the whole team.
- **Above the threshold**: for every 20% of Power above the destination's threshold, the empty-handed chance drops 1 percentage point, up to 5, moved to Normal.
- **Today's sky events**: 4 destinations get a sky event each day.

| Sky event | Effect |
|---|---|
| Startide | Only 1 voyage of wear today, always |
| Lighttide | Reward factor +5% |
| Thunderstorm | Risk up one level, departure cost −2 percentage points |
| Calm Sea | Risk down one level |

### Voyage decision

Each voyage brings one decision at 30%, open until 1 minute before the reveal; if you don't choose, it counts as Let it ride. The effects are fixed, and you can see how the odds change before you choose.

| Decision | Effect | Average multiplier |
|---|---|---|
| Steady (safety net) | This dive won't come back empty, but tops out at Good haul | ×0.97 |
| Bold (go big) | Empty-handed chance ×1.5 plus 4 percentage points; Great haul chance ×2.5, Legendary ×3 | ×1.03 |
| Detour (protect the team) | Odds unchanged; only 1 voyage of wear this dive, departure cost +2 percentage points | ×1.00 |
| Let it ride | No change | ×1.00 |

The average multipliers differ by only 3% on purpose: everyone shares the same pool, so there must be no "always pick this" answer.

### Order of application

Base odds table (cluster × beam) → today's sky event → deep dive (one risk level up) → stability from overflow, crew bond and a star chart → voyage decision.

### Deep dives

Destinations from cluster ③ on can be deep dives: they use 2 Dive Passes (and count as 2 of the team's dives today), take 15 minutes, carry twice the Lightdust and one risk level up. The voyage decision comes early and closes 10 minutes before the reveal; then comes a second call: from 10 minutes to 1 minute before the reveal you may turn back. A voyage that turns back settles at ×1.00 with 1 wear, and still pays its departure cost.

### Crew bond

Each revealed dive by the same crew (spire, prism and seekers unchanged) adds 1 bond, up to 5. Each point moves 1 percentage point of empty-handed chance to "Normal", together with the overflow stability. Changing any card, or a card docking off the team, resets it to 0.

### Voyage supplies

At departure you may pay $RVYN for one supply, priced as a share of the voyage's ×1.00 reward (before the departure cost):

| Supply | Price | Effect |
|---|---|---|
| Lamp oil | 4% | This voyage wears only 1, whatever the result |
| Star chart fragment | 6% | 3 percentage points less empty-handed chance, moved to "Normal" |

Of the $RVYN paid, 95% goes into the Core Light Pool and 5% is burned, like every other fee.

### Daily commissions

Three commissions a day, set by the date (anyone can compute the same three from the contract); nobody posts them by hand. Take one at a time; a voyage that departs after accepting and meets it, once revealed, completes it for 10% of that voyage's ×1.00 reward from the Core Light Pool, counted against the day's cap. An abandoned commission can't be taken again that day. Kinds: bring back light from a given cluster, Good haul or better, a given voyage decision, an attuned seeker, a destination with a sky event, a deep dive, a supply.

### Wear

Every dive costs at least 1 voyage; deeper down the team may run into trouble on the way and wear 2 or 3 instead. An empty-handed dive brings no reward, so no departure cost is paid, but voyages are still worn.

## 8. How rewards are calculated

### Lightdust

Lightdust brought back per dive = (team Power + attuned bonus) × destination reward factor × outcome multiplier.

### Today's rate

Today's rate = 1% of the Core Light Pool's available balance ÷ everyone's total Lightdust the previous day; in other words, how much $RVYN each point of Lightdust is worth. There is a cap at launch: at most 0.015 $RVYN per point.

The rate is fixed for the whole day by the day's first dive (UTC): the bigger the pool, the higher it is; the more people dived the day before, the lower it is. At the reveal, what you bring back is worked out at this rate straight away and can be collected at once. So that one day can't hand out too much, every dive first reserves its ×1.00 reward; once a day's reservations reach 1.5% of the Core Light Pool, no more dives can set out that day. The game shows today's figure directly, along with how much it rose or fell since yesterday.

### Base reward

**Base reward** = the $RVYN a dive brings back at an outcome multiplier of ×1.00 (after departure cost):

Base reward = (team Power + attuned bonus) × destination reward factor × today's rate × (1 − departure cost)

At the reveal: **actually brought back = base reward × outcome multiplier**. Before you set out, the destination card shows your team's base reward and what each outcome comes to in $RVYN.

Each destination also shows a "benchmark": the base reward of a team exactly at the threshold with no attuned Seekers.

| Destination | Threshold | Benchmark (rate 0.0040) | Benchmark (0.0050) | Benchmark (0.0067) |
|---|---|---|---|---|
| ①A Lantern Reef | 51 | 0.20 | 0.25 | 0.33 |
| ②A Gleaner's Dock | 92 | 0.39 | 0.48 | 0.65 |
| ③A Long Stele Gallery | 160 | 0.72 | 0.91 | 1.21 |
| ④A Mistgate | 290 | 1.42 | 1.77 | 2.38 |
| ⑤A Shattered Mirror Field | 500 | 2.64 | 3.30 | 4.43 |
| ⑥D The First Light | 1180 | 7.25 | 9.06 | 12.14 |

(In $RVYN.) The shallowest and deepest benchmarks differ by about 37 times.

### Collecting and withdrawing

- After the reveal you must **collect by hand** before the reward goes into the Treasury. It's the Observatory's oldest rule: light only truly comes home when it's handed to the one waiting for it.
- Withdrawing to your wallet carries a fee: 15% right after a withdrawal, dropping 1 percentage point a day, free from day 15.

## 9. The $RVYN economy

The game has only one currency, **$RVYN**, and every amount is kept to two decimal places.

### Core Light Pool

- Initial funding of 1,000,000 $RVYN (from the Product & Ecosystem allocation).
- 1% of the balance is released each day and shared among that day's divers.
- No new $RVYN is minted. Rewards come only from the Core Light Pool and the share of player spending that flows back into it.

### Where the money comes from and goes

| Item | Cost | Goes to |
|---|---|---|
| Summon | Launch price 50 / 30 / 20 | 70% Core Light Pool, 15% burned, 15% operations |
| Departure cost | 3%–13% of the reward (taken on return) | 95% Core Light Pool, 5% burned |
| Withdrawal fee | 15%, −1% a day, free from day 15 | 95% Core Light Pool, 5% burned |
| Market trade tax | 5% of the sale price, paid by the seller | 95% Core Light Pool, 5% burned |
| Renewal | 50% of the original price | Same as Summon |
| Voyage supply | 4% / 6% of the voyage's ×1.00 reward | 95% Core Light Pool, 5% burned |

### Summon prices

Launch prices: Spire 50, Prism 30, Seeker 20 $RVYN. Once the liquidity pool opens, prices convert automatically each day from the 24-hour average price of $RVYN, changing by at most 10% a day and staying within 10%–200% of the launch price (Spire 5–100, Prism 3–60, Seeker 2–40).

### How a summon works

Submit a request → wait a few seconds for the random signal to be published → reveal. The request fixes which random signal it will use, and no one (including us) knows that signal's value before it is published, so no one can see the result first and then choose.

### Market

Players buy and sell Spires, Prisms and Seekers with each other for $RVYN. Sellers set their own prices; the Market shows only the current listings, average, lowest and highest price for the same kind of NFT, and never judges whether something is a good deal for anyone. Listed NFTs can't set out.

### Buying $RVYN

The in-game Buy $RVYN page swaps USDT, USDC or ETH on Robinhood Chain for $RVYN. Until the liquidity pool opens, the page only shows the interface and simulated quotes.

## 10. Lifespan: voyages, docking, renewal, going home

| Stage | Details |
|---|---|
| Voyages | Each dive wears 1–3; Spire 180, Prism 135, Seeker 45 |
| Docked | When voyages run out, the NFT docks for 7 days, leaves its team automatically, and can't set out or be listed |
| Renewal | Within the 7 days docked it can be renewed once, for 50% of the original price, refilling its voyages |
| Going home | When it runs out again after renewal, or isn't renewed within 7 days of docking, it goes home (is burned) and its name is carved into the Star Map Roll |

Each NFT can be renewed only once in its life. Going home keeps NFTs from piling up forever, so there is always room for new Seekers.

## 11. Fairness and transparency

- Every chance, odds table, sky event and rate is public and always visible on screen.
- Randomness comes from drand, a public randomness beacon run jointly by many independent organisations, which produces a new value every 3 seconds; the contract verifies its signature. A dive is tied at departure to the value published 5 minutes later, which no one (including us) can know before it is published; decisions close 1 minute before the reveal.
- Should drand stall for more than a day, that dive settles at ×1.00 with 1 voyage of wear.
- The Core Light Pool balance, daily release and burns are all on-chain and can be checked on the website's Transparency page.
- The per-wallet Dive Pass and team limits cap how large a share any big player can take at once.

## 12. Risks

- **The contracts are unaudited.** They are preview and testnet only for now; an independent audit will be completed before going live on-chain.
- Rewards depend on how many people take part, luck, and the price of $RVYN. **Nothing is guaranteed.** Simulations show that the $RVYN all players get back in total may be less than they put in; the difference goes to burns, operations, or stays in the Core Light Pool for a while.
- The price of $RVYN goes up and down. Only use amounts you can afford to lose.
- This whitepaper is not investment advice and must not be promoted as such.

## 13. Roadmap

| Stage | Details |
|---|---|
| Now | Preview: all gameplay simulated in the browser, nothing on-chain |
| Next | v3 contracts: Power and summons, 24 destinations and 18 odds tables, sky events and decisions, collecting, docking and renewal, daily Dive Passes and the 5-team limit, the rate, the 95/5 split of taxes, the Market |
| After that | Full testnet deployment → independent audit → liquidity pool and Buy page → mainnet |
| Ongoing | The novel, four languages, more sky events and encounters, seasons |

Every step will be announced and confirmed before it goes on-chain.

## 14. Glossary

| Term | Meaning |
|---|---|
| Dive | One trip: sending a team out to bring light back |
| Light bridge | The path a Spire and Prism bend out of light, which Seekers walk |
| Lightdust | How much a dive brings back, used to share out the Core Light Pool |
| Core Light Pool | The pool that holds rewards, releasing 1% a day |
| Today's rate | How much $RVYN each point of Lightdust is worth, adjusted daily |
| Base reward | The $RVYN brought back at an outcome multiplier of ×1.00 |
| Dive Pass | One of the 3 departures you get each day |
| Voyages | An NFT's lifespan, counted in dives |
| Docked / Renewal / Going home | The three stages after voyages run out |
| Attuned | A Seeker's light matching the destination's light today |
| Sky event | A special event at 4 destinations each day |
| Voyage decision | Once per dive: Steady, Bold, Detour or Let it ride |
