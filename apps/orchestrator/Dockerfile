# orchestrator — uv-managed Python, runs the Dapr Workflow host.
FROM ghcr.io/astral-sh/uv:python3.12-bookworm-slim AS base
WORKDIR /app
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy

# Dependencies first (cached), then the project.
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project
COPY src ./src
RUN uv sync --frozen --no-dev

ENV APP_PORT=8080
EXPOSE 8080
CMD ["uv", "run", "--no-dev", "python", "-m", "orchestrator.main"]
