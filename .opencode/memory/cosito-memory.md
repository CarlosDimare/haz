# Cosito

Cosito (formerly OpenCode) is an open-source AI coding assistant.

## Key points

- **Name**: Cosito
- **Former name**: OpenCode
- **Binary**: `cosito` (alias `opencode` for backward compatibility)
- **Type**: AI coding assistant (terminal-based)
- **Primary language**: Spanish (UI/UX), English (internal code)
- **Repository scope**: This is the Cosito monorepo

## Project identity

- All user-facing text should use "Cosito" instead of "OpenCode"
- Internal package names, imports, and paths remain as `@opencode-ai/*` for now
- The `.opencode/` directories remain as-is (no rename to `.cosito/`)

## Development commands

- `bun dev` from `packages/opencode` starts the live interactive TUI
- Type checking: `bun typecheck` from `packages/opencode`
- Tests run from package directories (not repo root)
