# DevDoc AI — Server

Express + TypeScript API and worker for DevDoc AI: ingests a codebase (GitHub URL or ZIP upload), chunks and embeds it, and answers questions about it via RAG with source citations.

See [`SUBMISSION.md`](./SUBMISSION.md) for architecture, RAG/LLM decisions, and productionization notes. See [`CLAUDE.md`](./CLAUDE.md) for the full project map (routes, services, models).

## Prerequisites

- Node.js 20+
- PostgreSQL 16 with the [pgvector](https://github.com/pgvector/pgvector) extension available
- Redis (for the BullMQ ingestion job queue)
- A [Groq](https://console.groq.com) API key (generation) and a [Google AI Studio](https://aistudio.google.com) API key (embeddings)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy the env file and fill in your values:
   ```bash
   cp .env.example .env
   ```
   Required: `DATABASE_URL`, `REDIS_URL`, `GEMINI_API_KEY` (embeddings), `GROQ_API_KEY` (generation). Everything else has a working default.

3. Create the database and enable pgvector, then push the schema:
   ```bash
   psql "$DATABASE_URL" -c "CREATE EXTENSION IF NOT EXISTS vector;"
   npx prisma db push
   ```
   If `CREATE EXTENSION vector` fails with "extension is not available," pgvector isn't installed against your Postgres build — install it via your platform's package manager (e.g. `brew install pgvector` on macOS) and rebuild against the Postgres version you're running.

## Running

The API and the ingestion worker are **separate processes** — both must be running for ingestion to complete (the API enqueues jobs; the worker processes them).

```bash
# Terminal 1 — API server
npm run dev

# Terminal 2 — ingestion worker
npm run worker
```

The API listens on `http://localhost:5050` by default (`PORT` in `.env`). Health check:

```bash
curl http://localhost:5050/api/v1/health
```

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | API server, hot-reload via nodemon |
| `npm run worker` | Ingestion worker, hot-reload via nodemon |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start` | Run the compiled server (`dist/index.js`) — production |

## Notes

- Uploaded ZIPs and cloned repos are extracted to `tmp/uploads` / `tmp/repos` on local disk — the API and worker must currently share a filesystem (a known limitation; see `SUBMISSION.md` section c for the production fix).
- Set `ENABLE_CHUNKING_EMBEDDING=false` to skip chunking/embedding entirely and answer chat questions from the repository overview alone — useful for testing chat without spending embedding API quota.
- No Docker setup is included in this submission (see `SUBMISSION.md` section f).
