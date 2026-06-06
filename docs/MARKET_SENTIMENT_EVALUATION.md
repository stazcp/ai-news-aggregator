# Market Sentiment Pivot — Feasibility & Reuse Evaluation

**Status:** Evaluation only. No code changes proposed here — this document answers one
question before any are made: *can the existing AI News Aggregator engine be reused to
build a long-term market-sentiment / investing-edge product, and is that a problem worth
solving?*

**Date:** 2026-06-06
**Author:** Engineering evaluation (requested investigation)

---

## 1. The Problem You're Trying to Solve

Stated goal, in plain terms:

> Turn this app into a more *generic* signal engine that ingests **all available channels**
> (news today; X/Twitter, Reddit, filings, etc. later), and produces a **long-term market
> sentiment read** for retail investors — "what's the general mood on X, is it trending up
> or down, what should I watch, what should I investigate."

Explicit constraints you set yourself (and they're the right ones):

- **Not** a short-term trading signal. You can't beat Wall Street on speed, latency, or data.
- The hypothesis is a **long-horizon edge**: aggregate the *general sentiment of everything*
  better than a distracted individual can, and surface what to dig into.
- This is a multi-year build, not a weekend pivot. Likely needs dedicated compute / a real
  model, possibly a Bloomberg-style data feed and an agent that keeps the picture current.

This document evaluates that honestly — both the **engineering reuse** question and the
**is-this-real** question — because the second one determines whether the first one matters.

---

## 2. Does a Document Already Exist That Solves This?

**No.** The repo has two markdown specs:

| File | What it actually covers | Solves your purpose? |
|------|------------------------|----------------------|
| `README.md` | Describes the current product: AI news clustering + summaries. | No — it's the *current* app. |
| `Tech_spec.md` | A pivot plan toward **"Narrative Intelligence"**: detecting how different outlets cover the *same story* differently (bias/divergence, à la Ground News). | **No.** Different product. It's about *news framing*, not *market sentiment / investing*. |

So the market-sentiment idea is **undocumented**. The closest existing direction (`Tech_spec.md`)
is a *sibling* pivot, not the same one — it shares the ingestion + clustering substrate but
points at journalism/media-bias, not finance. Worth knowing, because it means there are now
**two competing futures** for the same engine and they shouldn't be conflated.

---

## 3. What the Engine Actually Is (grounded in the code)

Not the marketing description — what's really in `src/`:

| Capability | Where | Reusable for finance? |
|---|---|---|
| **Multi-source ingestion** (173 feed entries, ~88 sources) | `src/lib/news/rss-feeds.json`, `newsService.ts` | ✅ **Directly.** Already includes Bloomberg, WSJ, Yahoo Finance, MarketWatch, CNBC, Fox Business, and a full Crypto category. |
| **TF-IDF + cosine pre-clustering** | `textCluster.ts` | ✅ Generic text grouping — transfers. |
| **Entity extraction** | `textCluster.ts::extractEntities` | ⚠️ **Generic regex only** (proper nouns, acronyms). No tickers, no company→ticker mapping, no index normalization. Useful scaffolding, not finance-grade. |
| **LLM refinement / merge / split / expand** | `groq.ts`, `clusterService.ts` | ✅ Transfers. Groq is cheap and fast. |
| **Severity scoring** | `severity.ts` (+ `categoryMeta` has `Economy/Markets`) | ⚠️ Concept transfers; "severity" would need to become "market relevance / impact." |
| **Caching** (Upstash Redis + in-memory) | `src/lib/cache/` | ✅ For hot data. ❌ Not a time-series store. |
| **Next.js/React UI, summaries, image collages** | `src/components/`, `src/app/` | ⚠️ Partially — a finance UI is a different surface (tickers, charts, watchlists). |
| **Persistence / database** | — | ❌ **Does not exist.** 12-hour ephemeral cache only. |
| **User accounts / auth** | `validate-token` only | ❌ Effectively none. |

**Bottom line on reuse:** Your instinct ("probably not") is *half right*. The
**ingestion + clustering + summarization pipeline is genuinely reusable** and would save you
months — that's the hard, mature part. But everything that makes it a *market* product, and
especially a *long-term* one, is missing.

---

## 4. The Critical Gap: "Long-Term" Requires Memory the App Doesn't Have

This is the single most important finding.

The current app is **stateless by design**. Every refresh is a fresh snapshot; data lives in
a ~12-hour cache and is then gone. `Tech_spec.md` itself flags this repeatedly ("everything is
currently ephemeral," "this is where the compounding data moat lives").

**Long-term sentiment is, by definition, a time series.** "Is sentiment on semiconductors
trending up or down over the last 6 weeks?" is unanswerable without storing sentiment readings
over time. So the very first thing this pivot needs is the thing the app most lacks:

> **A persistent datastore (Postgres/Timescale or similar) that records, per
> entity/sector/asset, a sentiment + volume + divergence reading at every refresh.**

Until that exists, you don't have a long-term product — you have a daily mood ring. This is
not a small add; it changes the architecture from "fetch → cluster → render → discard" to
"fetch → cluster → score → **persist** → aggregate-over-time → render."

---

## 5. The Harder Question: Is the *Edge* Real?

Reuse is the easy question. The one that decides whether to build at all:

### 5a. What's genuinely defensible
- **You're explicitly not competing on speed.** Correct. The HFT / news-latency game is lost
  before it starts; pros co-locate and parse headlines in microseconds.
- **A long-horizon "narrative drift" read is a real, under-served niche** for retail. Most
  individuals *cannot* read 88 sources daily. A faithful aggregate of "where is attention and
  mood moving over weeks" is a legitimately useful lens — closer to a *research-prioritization*
  tool than a *signal*.
- **The compounding-history moat is real** (per `Tech_spec.md` §7): nobody can retroactively
  reconstruct a sentiment time series you started recording two years ago.

### 5b. What you must be honest about
- **"News sentiment → returns" is one of the most arbitraged signals on Earth.** Academic and
  hedge-fund literature on news/social sentiment alpha is enormous, and most edge decays fast
  or was never real after costs. Assume the *obvious* version of this is already priced in.
- **RSS is not a great financial data source.** It's delayed, incomplete, deduped poorly, and
  has no volume/price ground truth. Real sentiment products pair text with **market data**
  (price, volume, options flow) to label and validate. You have none of that today.
- **Sentiment ≠ direction.** Extreme positive sentiment is frequently a *contrarian top*
  signal. A naive "mood up = buy" product would actively mislead users — and that's a
  liability concern, not just an accuracy one.
- **X/Twitter, Reddit ingestion is now expensive and rate-limited** (paid API tiers, anti-scraping).
  The "just add social later" assumption has a real cost line.
- **Regulatory surface:** the moment you tell users *how to invest* / *what to buy*, you're
  near investment-advice territory. Framing must stay "here's what to **investigate**," with
  disclaimers — which, notably, is exactly how you phrased the goal. Keep it there.

### 5c. Honest verdict on the premise
The **"surface what to research" framing is viable**; the **"gives me an investing edge over
everyone" framing is mostly not**, at least not from news-sentiment alone, and not without
market data to validate against. The defensible product is a **long-horizon narrative-and-mood
research dashboard**, not an alpha signal. If you build the former and *measure* whether it
ever predicts anything (§6, Phase 3), you can discover an edge empirically instead of assuming
one. Build to *learn whether the edge exists*, not on faith that it does.

---

## 6. If You Proceed: The Minimum Honest Path

Reuse the pipeline; add the three things it lacks (memory, finance-grade entities, validation).

**Phase 0 — Decide the fork.** Market-sentiment **or** `Tech_spec.md`'s narrative-divergence —
not both at once on a paused side project. They share ingestion but diverge after that. (See §7.)

**Phase 1 — Persistence (unblocks everything).**
- Add Postgres/Timescale. Store per-refresh: entity, sector, sentiment score, article volume,
  source spread, timestamp. *This is the moat and the prerequisite for "long-term."*

**Phase 2 — Finance-grade entity layer.**
- Replace/augment regex `extractEntities` with a **ticker + company + index dictionary**
  (e.g. map "Nvidia"/"NVDA", "S&P 500"/"SPX"). Cluster and score *by asset/sector*, not by
  generic proper noun.
- Add a sentiment scorer (Groq LLM classification is fine to start; cheap).

**Phase 3 — Validation before any "edge" claim.**
- Pull **free market data** (e.g. daily OHLCV) and, retrospectively, check whether your stored
  sentiment series leads/lags/correlates with price *at all*. **No user-facing "edge"
  language until this shows something.** This is the gate that keeps the product honest.

**Phase 4 — UI + agent.**
- Watchlist view: per-ticker/sector sentiment trend, volume, "notable shift since last week,"
  "what to investigate." An agent (your "Bloomberg helper") summarizes changes — but grounded
  in the stored series, not vibes.

**Phase 5 — Expansion (only if Phases 1–3 paid off):** X/Reddit/filings ingestion, paid data.

Rough order-of-magnitude: Phases 1–3 are the real work and the real spend (storage + compute +
market data), exactly as you anticipated ("dedicated CPU / Bloomberg feed / an agent").

---

## 7. Recommendation

1. **Yes, reuse the engine — but only the front half.** Ingestion, clustering, summarization,
   caching, and the finance feeds already present save you the months-long unglamorous part.
   Discarding it to start fresh would be a mistake.
2. **No, the engine as-is does not solve the purpose**, because the purpose is *temporal*
   ("long-term") and the engine is *stateless*. Persistence is the make-or-break addition.
3. **Reframe the product honestly:** a long-horizon *narrative & sentiment research dashboard*
   that tells you **what to investigate**, not a system that beats Wall Street. Build it to
   *measure* whether an edge exists (Phase 3) rather than to assume one.
4. **Pick one fork** (this idea vs. `Tech_spec.md`'s divergence detection) before writing code.
   They are not the same product even though they share plumbing.
5. Given `PROJECT_PAUSED=true` and the multi-year scope: treat Phases 1–3 as the real
   feasibility test. If a stored sentiment series shows *no* relationship to anything after a
   few months, that's a cheap, honest "no" — far cheaper than building Phases 4–5 on faith.

---

*This is an evaluation, not a commitment. It deliberately pushes back on the "edge over
everyone" premise because the strongest version of this product is the honest one: help a
human decide what to research, and let the data prove or disprove the edge over time.*
