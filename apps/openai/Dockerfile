FROM oven/bun:1.3.14-slim
WORKDIR /home/bun/app
USER bun
COPY apps/openai/index.ts .

EXPOSE 6669
CMD ["bun", "run", "index.ts"]
