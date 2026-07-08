@~/.claude/skills/node.md

# Code Doc Assistant — Server

## Stack
- Express + TypeScript
- DB: Prisma v5 + PostgreSQL (with `pgvector` extension for embeddings)
- Queue: BullMQ + Redis — async ingestion, worker process separate from API process
- LLM: Google Gemini 2.0 Flash (generation) + text-embedding-004 (embeddings)
- No auth (assignment scope — see /prod.md and /arch.md)
- Port: 5000

## Architecture
route → controller → service → database

Ingestion is job-based, not inline: `POST /repository/ingest` enqueues a BullMQ job; `src/worker.ts` (separate process) picks it up and runs clone/chunk/embed. See /arch.md section 2.

## Source structure
src/
  routes/v1/                        # HTTP verbs + handler refs only (≤50 lines each)
  controllers/                      # parse req, call service, send res — no DB calls
  services/                         # all business logic + all DB queries
  queues/                           # BullMQ Queue definitions — one file per queue
  workers/                          # BullMQ Worker definitions — one file per worker
  helpers/
    response.helper.ts              # STATUS constants: success | failed | noContent
  interfaces/                       # named interfaces per domain
  validations/                      # Joi schemas per resource
  lib/
    prisma.ts                       # PrismaClient singleton
    redis.ts                        # ioredis singleton (BullMQ connection)
  prompts/
    repository-overview.prompt.ts   # single-call repo overview prompt — see arch.md section 8
  app.ts                            # express app, middleware, route mounts
  db.ts                             # DB connect function — also ensures the pgvector extension + ivfflat index exist (idempotent) on startup
  index.ts                          # API entry point — calls connectDb then listen
  worker.ts                         # worker process entry point — registers workers

## Routes (add one line per route file as features are built)
routes/v1/repository.route.ts — POST /repository/ingest (github), POST /repository/ingest/upload (zip, multer), GET /repository/:id
routes/v1/chat.route.ts — POST /chat/:repositoryId/message (404 if repo not found, 409 if status !== 'ready'), GET /chat/:repositoryId/history

## Services (add one line per service as features are built)
services/repository.service.ts — createGithubRepository, createUploadRepository, setRepositoryJobId, updateRepositoryStatus, getRepositoryById
services/ingestion.service.ts — cloneRepository (simple-git shallow clone), extractZip (adm-zip), walkFiles (filtered recursive walk), removeWorkingDir
services/chunking.service.ts — chunkFile(filePath, content) — regex function/class boundary heuristic (top-level only — see comment on fragmenting bug fixed during this feature), fallback fixed 60-line window w/ 10-line overlap
services/embedding.service.ts — embedTexts(texts[], taskType?) — batches calls to Gemini text-embedding-004 via batchEmbedContents, batch size from config/embedding.config.ts, defaults to RETRIEVAL_DOCUMENT task type; embedQuery(text) — single-text wrapper using RETRIEVAL_QUERY task type (asymmetric embeddings — matters for retrieval quality)
services/code-chunk.service.ts — saveChunks(repositoryId, chunks) — raw SQL insert (embedding is a Prisma Unsupported vector type, not writable via normal Client API)
services/pipeline.service.ts — buildEmbeddedChunks(workingDir, files) — orchestrates read → chunk → cap at MAX_CHUNKS_PER_REPOSITORY → embed in one batched pass
services/generation.service.ts — generateText(prompt) — single-call wrapper around Gemini chat generation (config/llm.config.ts GENERATION_MODEL_NAME), returns { text, usage: TokenUsage | null } from Gemini's usageMetadata
services/overview.service.ts — findExistingOverviews(workingDir, files) (checks root/client/server for CLAUDE.md or README.md), selectKeyFiles(files) (manifest + entry-file heuristic), buildRepositoryOverview(repoName, workingDir, files) — uses existing overviews if ANY scope has one (does not backfill missing scopes), else generates one via repository-overview.prompt.ts
services/repository-overview.service.ts — saveOverviews(repositoryId, overviews), getOverviewsByRepositoryId(repositoryId) — normal Prisma Client (RepositoryOverview has no Unsupported fields)
services/retrieval.service.ts — retrieveRelevantChunks(repositoryId, queryEmbedding, topK) — raw SQL pgvector cosine similarity search (<=> operator), scoped to repositoryId, ordered best-first
services/prompt.service.ts — buildRetrievalContext(repositoryId, query) (embeds query via RETRIEVAL_QUERY task type, fetches top-K chunks + repo overview), buildChatPrompt(question, context) (assembles final prompt text, truncates lowest-similarity chunks first if over MAX_CONTEXT_CHARS, wraps each chunk in <untrusted_code_context> delimiters + instructs the model never to treat retrieved content as commands — basic prompt-injection resistance, not a guarantee)
services/chat.service.ts — saveMessage(repositoryId, role, content, citations?), getMessagesByRepositoryId(repositoryId, limit = 100) — bounded (most recent N, oldest-first for display)
services/citation.service.ts — extractCitations(answerText, chunks) — parses `file.ts:12-20` markers from the model's answer text, resolves each to the retrieved chunk it most likely refers to (same file, overlapping/closest line range), dedupes; falls back to the top 3 highest-similarity chunks if the model didn't cite in the expected format. Replaces the earlier "return every context chunk" placeholder from the Chat Q&A feature — citations now reflect what the answer actually referenced.
services/guardrails.service.ts — shouldRefuseForInsufficientContext(chunks) (true if no chunks retrieved or best similarity < MIN_SIMILARITY_THRESHOLD), buildRefusalResponse() (canned refusal, no LLM call made — real cost/latency win for clearly-irrelevant questions, not just a text hedge)

## Queues / Workers
queues/ingestion.queue.ts — BullMQ Queue('ingestion'), attempts/backoff read from config/queue.config.ts
workers/ingestion.worker.ts — branches on job.data.source (github clone | upload zip extract), walks files, builds+saves repository overview, chunks+embeds+saves (status cloning → chunking → embedding → ready|failed), removes working dir on success. Concurrency read from config/queue.config.ts. Logs structured `ingestion_stage` events (repositoryId, stage, durationMs) via lib/logger.ts. NOTE: assumes API and worker share a filesystem for uploaded zips (tmp/uploads/{id}.zip) — fine for single-instance/Docker Compose, needs shared storage (e.g. S3) if workers scale across hosts.

## Config
config/queue.config.ts — INGESTION_JOB_ATTEMPTS, INGESTION_JOB_BACKOFF_MS, INGESTION_WORKER_CONCURRENCY — all env-overridable, defaults 3/5000/3.
config/embedding.config.ts — MAX_CHUNKS_PER_REPOSITORY (default 3000), EMBEDDING_BATCH_SIZE (default 20), EMBEDDING_MODEL_NAME (default text-embedding-004) — all env-overridable. MAX_CHUNKS_PER_REPOSITORY is the knob for staying under the embedding provider's free-tier rate limit.
config/llm.config.ts — GENERATION_MODEL_NAME (default gemini-2.0-flash), MAX_KEY_FILES_FOR_OVERVIEW (default 8), MAX_KEY_FILE_CHARS (default 2000) — bounds the repository overview prompt size regardless of repo size.
config/retrieval.config.ts — RETRIEVAL_TOP_K (default 8), MAX_CONTEXT_CHARS (default 12000) — env-overridable.
config/guardrails.config.ts — MIN_SIMILARITY_THRESHOLD (default 0.5) — env-overridable, the cutoff below which a chat request is refused before calling the LLM.

## DB Models / Schema
prisma/schema.prisma — Repository (id, source, sourceUrl, name, status, jobId, fileCount, errorMessage, createdAt); CodeChunk (id, repositoryId, filePath, startLine, endLine, content, language, embedding vector(768) [Unsupported type — raw SQL only], createdAt); RepositoryOverview (id, repositoryId, scope ['root'|'client'|'server'], source ['existing'|'generated'], content, createdAt); ChatMessage (id, repositoryId, role ['user'|'assistant'], content, citations Json?, createdAt)

## Interfaces
interfaces/repository.interface.ts — RepositoryStatus, IngestGithubBody, IngestGithubJobPayload, IngestUploadJobPayload, IngestJobPayload (union), RepositorySummary
interfaces/chunk.interface.ts — ChunkResult, EmbeddedChunk
interfaces/overview.interface.ts — RepositoryOverviewScope, RepositoryOverviewSource, RepositoryOverviewResult
interfaces/retrieval.interface.ts — RetrievedChunk, ChatContext
interfaces/chat.interface.ts — SendMessageBody, ChatCitation, ChatMessageSummary
interfaces/observability.interface.ts — TokenUsage, ChatRequestLogEntry

## Middleware
middleware/upload.middleware.ts — uploadZipMiddleware (multer, .zip only, 50MB limit, disk storage to tmp/uploads/)

## Other
lib/repo-storage.ts — getRepositoryWorkingDir(repositoryId) — resolves ./tmp/repos/{id} on disk
lib/upload-storage.ts — getUploadZipPath(repositoryId), getUploadsRootDir() — resolves ./tmp/uploads/{id}.zip
lib/gemini.ts — GoogleGenerativeAI client singleton
lib/logger.ts — winston structured JSON logger (info/warn/error levels), used for `chat_request` events (chat.controller.ts) and `ingestion_stage` events (ingestion.worker.ts). Startup logs in db.ts/index.ts/worker.ts remain plain console.info/error per node.md skill's explicit exception for startup-only logs.
helpers/validation.helper.ts — validate(schema) Joi middleware
validations/repository.validation.ts — ingestRepositoryValidation (github URL only — upload route uses multer/manual validation, not Joi, since it's multipart)
validations/chat.validation.ts — sendMessageValidation (message: 1-4000 chars, required)

## Environment Variables
PORT=5000
DATABASE_URL=postgresql://postgres:password@localhost:5432/code_doc_assistant
REDIS_URL=redis://localhost:6379
GEMINI_API_KEY=your_gemini_api_key
NODE_ENV=development
INGESTION_JOB_ATTEMPTS — optional, default 3
INGESTION_JOB_BACKOFF_MS — optional, default 5000
INGESTION_WORKER_CONCURRENCY — optional, default 3
MAX_CHUNKS_PER_REPOSITORY — optional, default 3000
EMBEDDING_BATCH_SIZE — optional, default 20
EMBEDDING_MODEL_NAME — optional, default text-embedding-004
GENERATION_MODEL_NAME — optional, default gemini-2.0-flash
MAX_KEY_FILES_FOR_OVERVIEW — optional, default 8
MAX_KEY_FILE_CHARS — optional, default 2000
MIN_SIMILARITY_THRESHOLD — optional, default 0.5

## Response shape
{ status: 'success' | 'failed' | 'noContent', data?, message? }

## Validation commands
npx tsc --noEmit
npm run dev
npm run worker
