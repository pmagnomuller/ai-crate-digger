# Infrastructure

This document describes how the app is run locally, packaged, and how CI/CD is set up. Secrets and exact Azure names live in your environment or GitHub; see **`.env.example`** for variable names.

## Local runtime

- **API** — `npm run start:dev` (NestJS, default port from `PORT`, usually `3000`).
- **MongoDB** — `docker compose up -d` starts `mongo:7` on port `27017` with a named volume for data. Set `MONGODB_URI=mongodb://localhost:27017/ai-crate-digger` in `.env`.
- **Seed** — `npm run seed:discogs` needs `DISCOGS_USER_TOKEN` and uses `DISCOGS_SEED_TARGET` / `DISCOGS_SKIP_EMBEDDINGS` for cost control.
- **Optional UI** — `npm run dev:client` runs the Vite dev server pointed at the API.

## Container image

**`Dockerfile`** (multi-stage):

1. **Builder** — `npm ci`, copy sources, `npm run build` (Nest `dist/`).
2. **Runner** — production `npm ci --omit=dev`, copy `dist/`, `CMD ["node", "dist/main.js"]`, expose `3000`.

Build and run are standard Docker workflows; compose in this repo is Mongo-only, not the API (run the API on the host or add a service if you want an all-in-one stack).

## CI/CD

**`.github/workflows/ci-cd.yml`** runs on pushes and PRs to `main`:

- Checkout, Node 22, `npm ci`, `lint`, `build`, `test`.

A **`docker-deploy`** job is **commented out** but documented in-repo: it would log into Azure, build/push to **Azure Container Registry**, and update an **Azure Container Apps** app image. Turning it on requires GitHub secrets such as `AZURE_CREDENTIALS`, `ACR_NAME`, `ACR_LOGIN_SERVER`, `ACA_APP_NAME`, and `ACA_RESOURCE_GROUP`, plus the same runtime secrets you use locally (Mongo URI, Azure OpenAI keys, etc.) configured on the container app.

## External services

- **Azure OpenAI** — Chat, embeddings, and optional TTS; endpoints and deployments are configured via `AZURE_OPENAI_*` variables in `.env`.
- **Discogs API** — Used only for seeding, via `DISCOGS_USER_TOKEN`.

## Operations notes

- After **rewriting git history** or rotating secrets, force-push branches and re-clone collaborators as needed; GitHub Actions and Container Apps should pick up new images from the pipeline once deploy is enabled.
- **MongoDB backups** for production are not defined in this repo; use Atlas, managed disk snapshots, or your platform’s backup story if you move beyond local Docker.
