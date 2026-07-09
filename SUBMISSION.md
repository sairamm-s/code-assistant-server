# DevDoc AI — Submission Writeup

This doc answers the assignment's required sections (b–h). Setup instructions live in each repo's own `README.md` (`server/README.md`, `client/README.md`) — this file is duplicated in both repos so it's visible regardless of which one a reviewer opens first.

Two companion docs go deeper on specific decisions and are worth skimming alongside this: `arch.md` (one section per architectural decision, alternatives considered, why rejected) and `prod.md` (what the brief is actually grading, and the reasoning behind scope cuts). Both are referenced inline below rather than repeated.

---

## b. Architecture overview

```
                    ┌─────────────┐
                    │   Client    │  React + Vite + Redux Toolkit
                    └──────┬──────┘
                           │ REST (/api/v1)
                    ┌──────▼──────┐
                    │  API server │  Express + TypeScript
                    └──┬───────┬──┘
                       │       │ enqueue job
          ┌────────────▼─┐   ┌▼────────────┐
          │  PostgreSQL   │   │    Redis    │
          │  + pgvector   │   │  (BullMQ)   │
          └────────────▲─┘   └┬────────────┘
                        │      │ pick up job
                        │  ┌───▼──────┐
                        └──┤  Worker  │  clone → overview → chunk → embed
                           └────┬─────┘
                                │
                   ┌────────────┴────────────┐
                   │                         │
            ┌──────▼──────┐          ┌───────▼──────┐
            │  Groq API   │          │  Gemini API   │
            │ (generation)│          │ (embeddings)  │
            └─────────────┘          └───────────────┘
```

**Five deployable units:** `client` (static SPA), `api` (Express, stateless, horizontally scalable), `worker` (BullMQ consumer, separate process from `api` so a long-running ingestion job never blocks HTTP request handling), `postgres` (relational data + vector search via pgvector, one database for both), `redis` (BullMQ's job queue backing store).

**Request flow:**
1. `POST /repository/ingest` (GitHub URL) or `POST /repository/ingest/upload` (ZIP) — API creates a `Repository` row (`status: queued`), enqueues a BullMQ job, returns immediately. The client polls `GET /repository/:id` for status.
2. The **worker** (separate process) picks up the job: clones/extracts → walks every file → generates or reuses a repository overview (`CLAUDE.md`/`README.md` if present, else one LLM call) → chunks source files (structure-aware heuristic) → embeds chunks in batches → stores everything in Postgres. Status transitions `queued → cloning → chunking → embedding → ready | failed`.
3. `POST /chat/:repositoryId/message` — embeds the question, does a pgvector cosine-similarity search for the top-K relevant chunks, assembles a prompt (repository overview + retrieved chunks + guardrail instructions), calls the generation model, extracts citations from the answer text, persists both messages, returns `{ answer, citations }`.

**Why this shape, briefly** (full reasoning in `arch.md`): ingestion is job-based rather than inline in the HTTP request because indexing a real repo means potentially hundreds of embedding calls — doing that synchronously would tie up a request thread, have no retry on a transient failure, and lose all progress on a process restart. pgvector inside Postgres (rather than a dedicated vector DB) avoids a second stateful service for a workload that doesn't need one at this scale. No auth, no multi-tenancy — out of scope for this assignment, called out explicitly rather than silently skipped (see `arch.md` §4).

---

## c. Productionizing on a hyperscaler (AWS/GCP/Azure/Cloudflare)

What exists today is deliberately scoped for a local/single-instance demo. Here's what's actually required to make it production-grade, roughly in the order I'd tackle it:

**Compute & deployment**
- Containerize all three Node processes (`api`, `worker`, and the client build) with a `Dockerfile` each — not done in this submission due to time, called out in section (f).
- Run `api` and `worker` as separate services on ECS Fargate / Cloud Run / Azure Container Apps — both are stateless (all state is in Postgres/Redis), so both scale horizontally by just adding instances. The worker's BullMQ concurrency setting (`INGESTION_WORKER_CONCURRENCY`) already controls how many jobs one instance processes in parallel; running multiple worker instances scales job throughput linearly.
- Client ships as a static build behind a CDN (CloudFront / Cloud CDN / Cloudflare Pages) — no server-side rendering needed for this app.

**Data layer**
- Managed Postgres with the pgvector extension available (RDS supports it; Cloud SQL and Azure Database for PostgreSQL do too) instead of a local Homebrew install. At real scale, watch pgvector's `ivfflat` index limits (capped around 2000 dimensions, which is why embeddings are truncated to 768 in this build — see `arch.md` §1) and consider `hnsw` indexing for better recall/latency trade-offs as chunk volume grows.
- Managed Redis (ElastiCache / Memorystore / Azure Cache for Redis) for BullMQ.
- **Uploaded/cloned repo storage needs to move off local disk.** Right now the worker reads/writes `tmp/repos/` and `tmp/uploads/` on local disk, which only works because the API and worker currently share a filesystem (documented as a known limitation in `server/CLAUDE.md`). In production this becomes S3/GCS/Azure Blob — the API uploads the ZIP there, the worker downloads from there, and neither process needs local disk continuity.

**Reliability & ops**
- Secrets (`GEMINI_API_KEY`, `GROQ_API_KEY`, `DATABASE_URL`) into a real secrets manager (AWS Secrets Manager, GCP Secret Manager, Azure Key Vault) instead of a `.env` file.
- Structured logs (already JSON via `winston`, see section d) shipped to a real aggregator — CloudWatch Logs, Cloud Logging, or Datadog — instead of stdout. The `chat_request` and `ingestion_stage` log events are already structured for this; they just need a sink.
- Health checks (`GET /api/v1/health` already exists) wired into the load balancer/orchestrator for automatic unhealthy-instance replacement.
- A dead-letter queue or alerting on repeatedly-failed BullMQ jobs, so a systematically broken ingestion (bad repo, exhausted quota) surfaces to an operator instead of silently retrying forever.
- CI/CD: type-check + lint on every PR, build and push container images, deploy via the orchestrator's rolling-update mechanism.

**Product-level gaps for real multi-user use**
- Auth (currently none — single-tenant, anyone with the URL can ingest/chat). Would need session/JWT auth plus a `userId` column scoping `Repository`/`ChatMessage` rows, per `arch.md` §4.
- Rate limiting per user/IP on ingestion (currently only the free-tier LLM quota implicitly limits this).
- The repo-size caps (`MAX_CHUNKS_PER_REPOSITORY=200`) exist specifically to survive a free-tier LLM quota during this assignment — a paid tier would raise or remove this ceiling entirely.

---

## d. RAG/LLM approach & decisions

**Vector database: pgvector inside Postgres**, not a dedicated vector DB (Pinecone/Weaviate/Chroma). One database for both relational data and vectors avoids split-brain between a chunk's metadata and its embedding, and is a legitimate choice at this scale (Supabase runs on the same extension in production). Full reasoning and the honest scaling ceiling: `arch.md` §1.

**Embedding model:** started with `text-embedding-004`, which turned out to be retired/unavailable for this API key (a real `404` hit mid-build, not a hypothetical). Moved to `gemini-embedding-001`, which defaults to 3072-dim output — exceeding pgvector's `ivfflat` index limit (~2000 dims) — so embeddings are explicitly requested at 768 dimensions via the `outputDimensionality` parameter to fit both the index and the fixed schema column. Embeddings also use Gemini's `taskType` parameter (`RETRIEVAL_DOCUMENT` for indexed chunks, `RETRIEVAL_QUERY` for the search query) since Gemini's embeddings are asymmetric per task type — a small, easy win for retrieval quality once discovered.

**Generation model: Groq (Llama 3.3 70B)**, not Gemini, despite Gemini being the original plan. During testing, Gemini's `generateContent` free-tier quota reported a hard `0` limit across multiple separately-created API keys/projects — not a rate limit, an outright unavailable tier for this account. Rather than blocking the assignment on Google Cloud billing/account provisioning, generation was moved to Groq, which has a genuinely free tier with no billing card required. The code keeps both paths behind one interface (`GENERATION_PROVIDER` env var, `generation.service.ts`), so switching back is a one-line config change, not a rewrite.

**Chunking: heuristic, not AST-based.** Regex-based function/class boundary detection (anchored to non-indented lines — an early version fragmented classes from their own methods by matching indented method signatures as independent boundaries; caught via a manual sanity check, not a test, since TDD was off), falling back to fixed 60-line windows with overlap when no boundary is found. True AST parsing (tree-sitter per language) is the correct long-term answer but was judged not worth the multi-day investment for this scope. Full reasoning: `arch.md` §9.

**Orchestration: hand-rolled, no LangChain/LlamaIndex.** One retrieval pattern (embed query → top-K similarity search → assemble prompt → generate), used once, with no multi-step agentic behavior. A framework earns its keep composing several such patterns or doing tool-use/agentic branching — this app does neither, so hand-rolling keeps the retrieval logic fully visible for review instead of hidden behind framework internals. Full reasoning: `arch.md` §7.

**Prompt & context management:**
- A "repository overview" (either an existing `CLAUDE.md`/`README.md` in the ingested repo, or a single LLM-generated summary if none exists) is always injected into the chat prompt, separately from retrieved chunks. This exists specifically so broad questions ("what does this app do") don't have to be reconstructed from vector search over code fragments — they're answered directly from a purpose-built summary. See `arch.md` §8 for why this is a single-call design rather than agentic multi-turn exploration (the ingestion pipeline already has the full file tree in memory from the chunking walk, so re-discovering it via tool-use round-trips would be redundant).
- Retrieved chunks are truncated to a fixed character budget (`MAX_CONTEXT_CHARS`), dropping the lowest-similarity chunks first if the full set wouldn't fit — verified via a manual test that the *higher*-similarity chunk survives truncation, not the lower one (an easy off-by-reasoning bug to introduce silently).
- Retrieved code is wrapped in explicit `<untrusted_code_context>` delimiters with an instruction never to treat its contents as commands — basic prompt-injection resistance against a comment in someone's ingested repo reading "ignore previous instructions..." Not a guarantee, documented as such.

**Guardrails:**
- No-context refusal: if no chunks are retrieved and no repository overview exists, the request is refused *before* calling the LLM at all — a real cost/latency win, not just a prompt-level hedge. This logic needed a real fix mid-session: it originally only checked retrieved chunks, so a demo mode running on overview-only context (chunking intentionally disabled) got refused on every single question even with a perfectly good overview available. Fixed to treat a present overview as sufficient context on its own.
- Chat responses are single request/response, not streamed — a deliberate choice specific to this app, not a default. Full reasoning in `arch.md` §3: this is a code-verification tool where an answer is read *together with* its citations, so a partial streamed answer arriving before citations exist doesn't serve the actual workflow, and streaming markdown code blocks incrementally is a real source of rendering bugs for comparatively little UX benefit here.

**Quality controls:** citations are extracted from the model's own answer text (parsing `file.ts:12-20`-style markers the prompt instructs it to produce), resolved back to the actual retrieved chunk by file + line-range overlap, deduplicated, with a similarity-ranked fallback if the model doesn't follow the citation format. This is a cheap hallucination check by construction: if the model can't point to a specific file/line, the UI has nothing to show for that claim.

**Observability:** structured JSON logs (`winston`) for two event types — `chat_request` (query, retrieved chunk paths + similarity scores, refused flag, latency breakdown between retrieval and generation, token usage) and `ingestion_stage` (per-stage duration through cloning/chunking/embedding). No external tracing platform wired in for this scope; these are designed to be sink-agnostic (just JSON to stdout) so plugging in CloudWatch/Datadog later is a transport change, not a rewrite.

---

## e. Key technical decisions and why

The single most load-bearing decision across this build was **built-in vendor flexibility for LLM calls** — not because it was planned upfront, but because it was needed twice, for real, mid-build: once when `text-embedding-004` turned out to be retired, and once when Gemini's `generateContent` free tier turned out to be gated shut on this account. Both times, the fix was a config/service-layer change (`EMBEDDING_MODEL_NAME`, `GENERATION_PROVIDER`), not an architectural rewrite, specifically because generation and embeddings were already isolated behind their own service modules from the start.

Other decisions, each with fuller reasoning in `arch.md`:
- **BullMQ + Redis for ingestion**, not inline processing — a repo with hundreds of chunks means hundreds of embedding calls; doing that inside an HTTP request risks timeouts, has no retry, and loses all progress on a crash.
- **Redux Toolkit on the client** — genuine cross-screen shared state (ingestion status read by two different screens, chat history surviving re-renders), not reflexive boilerplate; initially scoped out, then added back once the actual state-sharing need was clear.
- **No filtering during ZIP extraction, minimal filtering during chunking** (`node_modules`/`dist`/`build`/`.next` only) — extraction is always a strict 1:1 unzip; the only filtering happens at chunking time, and only for directories that are unambiguously not source code. This went through several iterations based on real test runs surfacing macOS `__MACOSX` zip metadata and AppleDouble sidecar files, and was ultimately narrowed back down per explicit direction to keep the pipeline's behavior simple and predictable rather than accumulating heuristics.
- **`ENABLE_CHUNKING_EMBEDDING` as an explicit toggle** — added specifically to let chat be verified end-to-end (using the repository overview alone) without spending embedding API quota, once free-tier limits became the binding constraint on iteration speed.
- **Demo mode relies on the repository overview (`CLAUDE.md`/`README.md` or a single generated summary) as the sole context source, not chunk retrieval** — a direct consequence of the free-tier quota issues in section (d). With `ENABLE_CHUNKING_EMBEDDING=false`, no chunks are embedded or stored at all; chat answers come entirely from whatever overview was found or generated during ingestion. This is honestly a materially weaker retrieval story than the full pipeline — an overview can't answer "show me the exact function that does X" the way a chunk-level citation can — but it kept the app demoable and testable end-to-end without being blocked on quota. **In production, this toggle would simply always be `true`**: on a paid tier (or with the free-tier request caps this build already tunes for — `MAX_CHUNKS_PER_REPOSITORY`, `EMBEDDING_BATCH_SIZE`), full chunk-level embedding and retrieval runs for every ingestion, and the repository overview becomes what it was originally designed to be — a supplement for broad "what does this app do" questions, not a fallback for everything.
- **GitHub URL ingestion is implemented end-to-end on the backend (`POST /repository/ingest`, clone via `simple-git`) but hidden from the client UI** — the ingest screen currently only exposes ZIP upload. This is a deliberate demo-scope narrowing, not a removal: cloning an arbitrary public GitHub repo means an unpredictable, uncapped file count going into the same quota-constrained embedding pipeline described above, which made it a much harder case to keep reliably demoable than a ZIP the user has already sized/curated themselves. The route, service, and job-payload handling for GitHub ingestion are untouched — re-exposing it in the client is a UI-only change (restore the tabs and `repo-url-form` component on the ingest screen), not new backend work.

---

## f. Engineering standards followed (and some skipped)

**Followed:**
- Layered backend architecture throughout: `route → controller → service → database`, no DB calls in controllers.
- Typed, versioned API contracts (`/api/v1`), a consistent response envelope (`{ status, data?, message? }`) everywhere.
- Structured logging via a real logger (`winston`), not scattered `console.log` — with one deliberate exception: startup logs (`Database connected`, `Server on port X`) stay as plain `console.info` per this project's own convention that startup-only logging doesn't need the structured-logger overhead.
- Never sending raw upstream errors to the client — a real bug found and fixed mid-session: a Gemini rate-limit error (a large raw JSON blob) was initially leaking straight into the `errorMessage` field returned to the client; fixed to truncate/sanitize while still logging the full error server-side.
- Env-var configuration with sane defaults for every tunable (batch sizes, caps, thresholds) — nothing hardcoded that plausibly needs adjusting per environment.

**Explicitly skipped, not silently omitted:**
- **TDD was off for this project** (a documented, deliberate scope decision for the assignment timeline, not an oversight) — meaning most logic went in without a test-first cycle. This had a real cost: several bugs (the chunking boundary-fragmentation bug, the chat-message-lost-on-failure bug, the guardrails-refusing-overview-only-context bug) were only caught by manual verification (ad-hoc `ts-node` scripts, or live testing through the actual app) rather than an automated suite catching them at write-time. Where the logic was non-trivial enough to worry about, I ran a manual sanity check before moving on rather than trusting it blind — but this is a materially weaker safety net than real tests, and is the top item in "what I'd do differently" below.
- **No Docker/containerization** in this submission, despite it being in the original build plan (`docs/PLAN.md` build order item 18) — cut for time. Section (c) above describes what containerizing would look like.
- **No automated CI** (lint/typecheck/test on push) — the same time trade-off.
- **AST-based chunking, real dependency-graph analysis, structured API-endpoint extraction** — all considered, all documented as deliberately out of scope in `arch.md`/`docs/PLAN.md`, not things I ran out of time on mid-attempt.

---

## g. How I used AI tools in this development process

*(Note: personalize this section before submitting — the brief specifically asks for your own judgment here, not an AI-generated account of it. What follows is an accurate description of the actual workflow used, written to be a solid starting draft, not a substitute for your own reflection.)*

I used **Claude Code** as the primary development tool, structured around a small set of custom slash commands rather than freeform prompting, specifically to keep the AI-generated code consistent and reviewable rather than ad-hoc. For the UI specifically, I used **Stitch** (Google's AI UI design tool) to generate the initial screen mockups and design system ("Forge Protocol" — dark theme, tokens, component layout) from a description of the app, then handed those mockups to Claude Code as a design reference to actually build and wire up — the visuals in `design/` were a generation starting point, not the shipped code; every screen was then implemented as real React components against the backend's actual API, not a static export.

- **`/plan`** — turned the assignment brief into `docs/PLAN.md`: a full spec (screens, schema, endpoints, build order) before any code, so every later `/feature` call had a concrete contract to build against instead of improvising per-session.
- **`/scaffold`** — generated the initial project skeleton (folder structure, TypeScript config, base `Express`/`Vite` setup) once, establishing conventions (`route → controller → service`, `.component.tsx`/`.screen.tsx` naming, etc.) that every subsequent feature had to follow.
- **`/feature`** — one call per feature (ingestion, chunking, retrieval, chat, guardrails, observability, each client screen), each time reading the existing `CLAUDE.md` project map first rather than re-scanning the whole codebase, proposing a plan, waiting for my confirmation before writing code.
- **`/ship-feature`** — commit, push, and merge each feature into `main` once it was verified working, keeping git history legible (one feature per commit, in the normal case).

**Where I pushed back or redirected**, rather than accepting the first output:
- Rejected the default TDD-on workflow for this project explicitly, given the assignment's time constraints — chose manual verification at logic-heavy points instead, and I own that this is a real trade-off, not a free lunch (see section f).
- When Claude proposed removing all file/directory filtering during ingestion, I let that run, observed real problems it caused (processing `__MACOSX` junk, burning quota on `node_modules`), and then explicitly scoped the filtering back down myself rather than accepting the first "fix everything" proposal — twice, once for macOS zip artifacts, once to reintroduce `node_modules`/build-output exclusion after confirming it was safe to add back.
- When Gemini's free tier turned out to be unusable for generation, I didn't accept "wait and retry" as the answer — asked directly "what can be done so this assignment can be submitted," which is what drove the Groq fallback rather than more quota troubleshooting.
- Caught and called out cases where a "fix" claimed to work but hadn't actually been verified against the real running app (e.g. insisting on an actual restart + log check rather than trusting a code diff alone) — several bugs in this build (the nodemon watch-storm, the wrong-Node-version-in-a-subshell issue, the client/server upload-limit mismatch) were only found because the app was actually run and observed, not because the code read correctly in isolation.

**What I'd flag as do's and don'ts for using an AI coding assistant, based on this project specifically:**
- Do make it show its reasoning for non-obvious calls (vendor choice, chunking strategy) before writing code — catching a bad assumption in a plan is far cheaper than catching it in a diff.
- Do insist on real verification (running the app, hitting real APIs, checking actual DB state) instead of accepting "this should work now" — several real bugs in this session only surfaced that way.
- Don't accept a broad instruction like "remove all filtering" without watching what it actually does in practice first — the right scope for that kind of change often only becomes clear after seeing a real failure mode, not in the abstract.
- Don't skip tests silently — if you're going to skip TDD for time, know explicitly what you're trading away (this doc's section f says exactly what that cost was).

---

## h. What I'd do differently with more time

1. **Turn TDD back on, or at least backfill tests for the logic that had real bugs slip through** — chunking boundary detection, citation extraction, guardrails, and the chat-message persistence path all had genuine bugs caught only by manual testing this session. That's exactly the kind of logic automated tests are for.
2. **Verify model/provider availability before building around it, not after** — both the embedding model retirement and the generation quota gate were discovered mid-build and cost real time. A five-minute "does this model actually work with this key" check up front would have caught both before any code was written against them.
3. **AST-based chunking** (tree-sitter) instead of the regex heuristic — the heuristic is fine for common cases but is a known, accepted limitation, not a design I'd defend as ideal.
4. **A real vendor-fallback strategy from day one**, not reactively — e.g. try Gemini, fall back to Groq automatically on a quota error, rather than a manual env-var switch discovered under deadline pressure.
5. **Retry/backoff on LLM calls generally** — right now a `429` just fails the request; a short backoff-and-retry (respecting the API's own `Retry-After`) would smooth over exactly the kind of transient quota blips that repeatedly interrupted testing in this session.
6. **Containerize and add CI** — both cut for time, both described concretely in section (c).
7. **The deferred screens** (Repository Dashboard, API Explorer, Dependency Graph) — designed but not built, since each implies real new capability (structured endpoint extraction, dependency graph construction) beyond RAG chat, not just UI work.
8. **Auth and multi-tenancy** — the single clearest gap between "assignment demo" and "real product," and the most involved one to add properly.
