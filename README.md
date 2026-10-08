# 가자⛲

![GitHub code size in bytes](https://img.shields.io/github/languages/code-size/kajaio/kaja)
![Continuous integration](https://github.com/kajaio/kaja/actions/workflows/ci.yaml/badge.svg)
[![Quality Gate Status](https://sonarcloud.io/api/project_badges/measure?project=kajaio_kaja&metric=alert_status)](https://sonarcloud.io/summary/new_code?id=kajaio_kaja)

> [!IMPORTANT]
> Kaja is still evolving :speaker::godmode::loudspeaker:

Kaja is an AI agentic harness. Give it a task and it keeps looping with an LLM, using tools and switching personas as needed, until the job is done. Point it at a local model or a cloud-based one, chat with it in the terminal, on Telegram, or through a widget on your own website.

Under the hood it is a full-stack playground: a **Hono API** secured by **Better Auth**, a **TanStack Start** web app, and a **React Ink** terminal agent.

## What’s inside

**Apps**

- [`api`](./apps/api/) ― REST API, cloud agent loop, auth, emails, and the [widget](./apps/api/widgets/) bundle
- [`tui`](./apps/tui/) ― Terminal UI and Telegram bot
- [`web`](./apps/web/) ― Public homepage and admin portal
- [`sandbox`](./apps/sandbox/) ― Runs stdio MCP servers (and headless Chrome) for cloud turns

**Packages**

- [`nasi`](./packages/nasi/) ― The agent brain: the loop, tools, and memory
- [`schema`](./packages/schema/) ― Shared Zod schemas and types
- [`shared`](./packages/shared/) ― Small pure utilities

## Run from the source

Make sure [Bun](https://bun.com/docs/installation), [Docker Compose](https://docs.docker.com/compose/install/), and [Git](https://git-scm.com/install/) are installed. Run the commands below in sequence.

```bash
# Get the source
git clone https://github.com/kajaio/kaja.git
cd kaja

# Install dependencies
bun i

# Start services
docker compose up -d

# Create config for local run
cp apps/tui/.env.example apps/tui/.env

# Run the terminal UI
bun dev:tui
```

The first run starts a short setup wizard: sign in to Kaja Cloud, or point it at your own LLM provider(s) and it writes `~/.config/kaja/` for you.

> [!TIP]
> If you want to look around **inside the sandbox** container, open a shell:
> ```bash
> docker compose exec sandbox bash
> ```

## Documentation

Want more? 🐓 Visit [**docs.kaja.io**/development](https://docs.kaja.io/development/).
