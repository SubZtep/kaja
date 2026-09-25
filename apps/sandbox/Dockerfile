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
# One executable with Bun inside, so the runtime image needs no Bun of its own.
RUN bun run --filter @kaja/sandbox build

# chrome-devtools-mcp and the Chrome for Testing headless shell its Puppeteer is tested with (amd64 only: no Linux arm64 builds).
FROM node:22-trixie-slim AS mcp
ARG CHROME_DEVTOOLS_MCP_VERSION=1.10.1
ARG CHROME_HEADLESS_SHELL_VERSION=153.0.8010.36
ARG PUPPETEER_BROWSERS_VERSION=3.2.3
RUN apt-get update && apt-get install -y --no-install-recommends unzip && rm -rf /var/lib/apt/lists/*
WORKDIR /opt/mcp
RUN npm install --omit=dev --no-audit --no-fund chrome-devtools-mcp@${CHROME_DEVTOOLS_MCP_VERSION} \
  && npx -y @puppeteer/browsers@${PUPPETEER_BROWSERS_VERSION} install chrome-headless-shell@${CHROME_HEADLESS_SHELL_VERSION} --path /tmp/chrome \
  && mv /tmp/chrome/chrome-headless-shell/linux-${CHROME_HEADLESS_SHELL_VERSION}/chrome-headless-shell-linux64 /opt/chrome
# The headless shell links libgbm but renders with its bundled SwiftShader, so libgbm's GPU backends (Mesa, ~190 MB with LLVM) never load: take the one library.
RUN cd /tmp && apt-get update && apt-get download libgbm1 && dpkg -x libgbm1_*.deb gbm \
  && mkdir -p /opt/lib && cp -a gbm/usr/lib/x86_64-linux-gnu/libgbm.so.1* /opt/lib/

# The stdio MCP servers are Node programs, so the runtime is Node; only the headless shell's libraries and fonts are added.
FROM node:22-trixie-slim AS runner
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    libasound2t64 libatk-bridge2.0-0t64 libatk1.0-0t64 libatspi2.0-0t64 libdbus-1-3 libdrm2 libexpat1 libglib2.0-0t64 \
    libnspr4 libnss3 libx11-6 libxcb1 libxcomposite1 libxdamage1 libxext6 libxfixes3 libxkbcommon0 libxrandr2 \
    fonts-liberation fonts-noto-color-emoji \
  && rm -rf /var/lib/apt/lists/*
COPY --from=mcp /opt/mcp /opt/mcp
COPY --from=mcp /opt/chrome /opt/chrome
COPY --from=mcp /opt/lib/ /usr/local/lib/
RUN ldconfig

WORKDIR /home/node/app
ENV NODE_ENV=production
ENV MARKETPLACE_DIR=/home/node/app/marketplace
ENV SANDBOX_OVERRIDES=/home/node/app/overrides.json
# Chrome refuses to start as root.
USER node
COPY --from=builder /home/bun/app/apps/sandbox/dist/sandbox /usr/local/bin/sandbox
COPY --chown=node:node marketplace/mcp ./marketplace/mcp
COPY --chown=node:node apps/sandbox/overrides.json ./overrides.json

EXPOSE 3002
CMD ["sandbox"]
