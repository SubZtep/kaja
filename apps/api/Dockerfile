# Pin specific Bun version for reproducibility and security (matches package.json)
FROM oven/bun:1.3.11 AS builder

WORKDIR /home/bun/app

# Copy dependency files (builder runs as root for compatibility)
COPY package.json bun.lock tsconfig.json ./
COPY apps/api/package.json ./apps/api/package.json
COPY apps/web/package.json ./apps/web/package.json
COPY apps/cli/package.json ./apps/cli/package.json
COPY packages ./packages

# Install dependencies
# Note: Use --frozen-lockfile in production for reproducible builds
# Requires running 'bun install' locally first to update lockfile
RUN bun install --frozen-lockfile

# Copy application code
COPY apps/api ./apps/api

# Build application and install production dependencies
RUN bun run --filter @kaja/api build
RUN bun install --production --frozen-lockfile

# Final stage - minimal alpine image
FROM oven/bun:1.3.11-alpine AS runner

# Security labels
LABEL security.non-root=true
LABEL maintainer="kaja"

WORKDIR /home/bun/app

# Set production environment
ENV NODE_ENV=production

# Run as non-root user
USER bun

# Copy only necessary files from builder
COPY --chown=bun:bun --from=builder /home/bun/app/apps/api/dist ./dist
COPY --chown=bun:bun --from=builder /home/bun/app/node_modules ./node_modules

# Set secure file permissions (read-only for application files)
USER root
RUN chmod -R 555 /home/bun/app/dist && \
    chmod -R 555 /home/bun/app/node_modules && \
    chown -R bun:bun /home/bun/app
USER bun

# Expose application port
EXPOSE 3001

# Health check using existing /health endpoint
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD bun run -e "fetch('http://localhost:3001/health').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"

# Run application
CMD ["bun", "run", "dist/server.js"]
