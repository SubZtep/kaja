FROM oven/bun:1.4.2 AS builder
WORKDIR /home/bun/app
COPY package.json bun.lock tsconfig.json ./
COPY apps/api/package.json ./apps/api/package.json
COPY apps/web/package.json ./apps/web/package.json
COPY apps/tui/package.json ./apps/tui/package.json
COPY apps/sandbox/package.json ./apps/sandbox/package.json
COPY packages ./packages
RUN bun install --frozen-lockfile --ignore-scripts
COPY apps/sandbox ./apps/sandbox
# One bundled file, run by the runtime's own bun.
RUN bun run --filter @kaja/sandbox build

# The Chrome for Testing headless shell chrome-devtools-mcp's Puppeteer is tested with (amd64 only: no Linux arm64 builds; 149+ for overrides.json's URL allowlist).
FROM node:22-trixie-slim AS chrome
ARG CHROME_HEADLESS_SHELL_VERSION=153.0.8010.36
ARG PUPPETEER_BROWSERS_VERSION=3.2.3
RUN apt-get update && apt-get install -y --no-install-recommends unzip && rm -rf /var/lib/apt/lists/*
# No install scripts; the browsers CLI stays in /tmp, only the shell is kept.
RUN npm install --prefix /tmp/browsers --ignore-scripts --no-audit --no-fund \
    "@puppeteer/browsers@${PUPPETEER_BROWSERS_VERSION}" \
  && /tmp/browsers/node_modules/.bin/browsers install \
    "chrome-headless-shell@${CHROME_HEADLESS_SHELL_VERSION}" --path /tmp/chrome \
  && mv "/tmp/chrome/chrome-headless-shell/linux-${CHROME_HEADLESS_SHELL_VERSION}/chrome-headless-shell-linux64" /opt/chrome
# The headless shell links libgbm but renders with its bundled SwiftShader, so libgbm's GPU backends (Mesa, ~190 MB with LLVM) never load: take the one library.
WORKDIR /tmp
RUN apt-get update && apt-get download libgbm1 && dpkg -x libgbm1_*.deb gbm \
  && mkdir -p /opt/lib && cp -a gbm/usr/lib/x86_64-linux-gnu/libgbm.so.1* /opt/lib/

# One runtime for every stdio MCP server, so manifests run as written: node/npx, bun/bunx, uv/uvx with python3.
FROM node:22-trixie-slim AS runner
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ca-certificates python3 \
    fonts-liberation fonts-noto-color-emoji \
    libasound2t64 libatk-bridge2.0-0t64 libatk1.0-0t64 libatspi2.0-0t64 libdbus-1-3 libdrm2 libexpat1 libglib2.0-0t64 \
    libnspr4 libnss3 libx11-6 libxcb1 libxcomposite1 libxdamage1 libxext6 libxfixes3 libxkbcommon0 libxrandr2 \
  && rm -rf /var/lib/apt/lists/*
COPY --from=builder /usr/local/bin/bun /usr/local/bin/bun
COPY --from=ghcr.io/astral-sh/uv:0.12.19 /uv /uvx /usr/local/bin/
COPY --from=chrome /opt/chrome /opt/chrome
COPY --from=chrome /opt/lib/ /usr/local/lib/
RUN ln -s bun /usr/local/bin/bunx && ldconfig

WORKDIR /home/node/app
ENV NODE_ENV=production
ENV MARKETPLACE_DIR=/home/node/app/marketplace
ENV SANDBOX_OVERRIDES=/home/node/app/overrides.json
ENV SANDBOX_CACHE_DIR=/home/node/.cache/mcp
# Chrome refuses to start as root.
USER node
# Fetch the shipped servers once, into the same caches the sandbox hands them, so the first start needs no download.
# bunx keeps packages in /tmp/bunx-<uid>-<pkg>@<version>; the version must match overrides.json (bump with CHROME_HEADLESS_SHELL_VERSION).
ARG CHROME_DEVTOOLS_MCP_VERSION=1.10.1
RUN bunx "chrome-devtools-mcp@${CHROME_DEVTOOLS_MCP_VERSION}" --version \
  && UV_CACHE_DIR="$SANDBOX_CACHE_DIR/uv" UV_PYTHON_INSTALL_DIR="$SANDBOX_CACHE_DIR/python" uvx mcp-server-time --help >/dev/null \
  && rm -rf ~/.bun
COPY --from=builder /home/bun/app/apps/sandbox/dist/sandbox.js ./sandbox.js
COPY --chown=node:node marketplace/mcp ./marketplace/mcp
COPY --chown=node:node apps/sandbox/overrides.json ./overrides.json

EXPOSE 3002
CMD ["bun", "sandbox.js"]
