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
  db.ts                             # DB connect function
  index.ts                          # API entry point — calls connectDb then listen
  worker.ts                         # worker process entry point — registers workers

## Routes (add one line per route file as features are built)
routes/v1/repository.route.ts — POST /repository/ingest (github), POST /repository/ingest/upload (zip, multer), GET /repository/:id

## Services (add one line per service as features are built)
services/repository.service.ts — createGithubRepository, createUploadRepository, setRepositoryJobId, updateRepositoryStatus, getRepositoryById
services/ingestion.service.ts — cloneRepository (simple-git shallow clone), extractZip (adm-zip), walkFiles (filtered recursive walk), removeWorkingDir

## Queues / Workers
queues/ingestion.queue.ts — BullMQ Queue('ingestion'), 3 attempts + exponential backoff
workers/ingestion.worker.ts — branches on job.data.source (github clone | upload zip extract), walks files, updates Repository.status (cloning → ready|failed); leaves working dir on disk on success for the chunking feature to consume. NOTE: assumes API and worker share a filesystem for uploaded zips (tmp/uploads/{id}.zip) — fine for single-instance/Docker Compose, needs shared storage (e.g. S3) if workers scale across hosts.

## DB Models / Schema
prisma/schema.prisma — Repository (id, source, sourceUrl, name, status, jobId, fileCount, errorMessage, createdAt)
Remaining models (CodeChunk, RepositoryOverview, ChatMessage) — add here as /feature creates them

## Interfaces
interfaces/repository.interface.ts — RepositoryStatus, IngestGithubBody, IngestGithubJobPayload, IngestUploadJobPayload, IngestJobPayload (union), RepositorySummary

## Middleware
middleware/upload.middleware.ts — uploadZipMiddleware (multer, .zip only, 50MB limit, disk storage to tmp/uploads/)

## Other
lib/repo-storage.ts — getRepositoryWorkingDir(repositoryId) — resolves ./tmp/repos/{id} on disk
lib/upload-storage.ts — getUploadZipPath(repositoryId), getUploadsRootDir() — resolves ./tmp/uploads/{id}.zip
helpers/validation.helper.ts — validate(schema) Joi middleware
validations/repository.validation.ts — ingestRepositoryValidation (github URL only — upload route uses multer/manual validation, not Joi, since it's multipart)

## Environment Variables
PORT=5000
DATABASE_URL=postgresql://postgres:password@localhost:5432/code_doc_assistant
REDIS_URL=redis://localhost:6379
GEMINI_API_KEY=your_gemini_api_key
NODE_ENV=development

## Response shape
{ status: 'success' | 'failed' | 'noContent', data?, message? }

## Validation commands
npx tsc --noEmit
npm run dev
npm run worker
