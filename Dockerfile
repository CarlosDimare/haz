FROM oven/bun:latest AS build

WORKDIR /app

COPY package.json bun.lock bunfig.toml turbo.json tsconfig.json ./
COPY packages/core/package.json packages/core/
COPY packages/opencode/package.json packages/opencode/
COPY packages/sdk/package.json packages/sdk/
COPY patches/ patches/

RUN bun install --frozen-lockfile

COPY . .

RUN bun run --cwd packages/opencode --conditions=browser src/index.ts --version

FROM oven/bun:latest

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    ripgrep \
    git \
    && rm -rf /var/lib/apt/lists/*

COPY --from=build /app /app

COPY haz /usr/local/bin/haz
RUN chmod +x /usr/local/bin/haz

ENV BUN_RUNTIME_TRANSPILER_CACHE_PATH=0

ENTRYPOINT ["haz"]
CMD ["--help"]
