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
routes/v1/                          # none yet — add here as /feature creates them
[Example: routes/v1/repository.route.ts — POST /repository/ingest, GET /repository/:id]

## Services (add one line per service as features are built)
services/                           # none yet — add here as /feature creates them
[Example: services/repository.service.ts — createRepository, getRepositoryStatus]

## DB Models / Schema
prisma/schema.prisma — models added per docs/PLAN.md Section 3 (Repository, CodeChunk, RepositoryOverview, ChatMessage)
# none yet — add here as /feature creates them

## Interfaces
src/interfaces/                     # none yet — add here as /feature creates them

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
