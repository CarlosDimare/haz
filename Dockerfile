FROM oven/bun:latest

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    ripgrep \
    git \
    && rm -rf /var/lib/apt/lists/*

COPY . .

RUN bun install --frozen-lockfile

RUN ln -sf /app/haz /usr/local/bin/haz

ENV BUN_RUNTIME_TRANSPILER_CACHE_PATH=0

ENTRYPOINT ["haz"]
CMD ["--help"]
