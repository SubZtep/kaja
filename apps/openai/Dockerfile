FROM oven/bun:1.3.14-slim

WORKDIR /app
COPY apps/openai/index.ts .

EXPOSE 6669

CMD ["bun", "run", "index.ts"]
