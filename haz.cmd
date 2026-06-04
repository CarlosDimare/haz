@echo off
bun run --cwd "%~dp0packages\opencode" --conditions=browser src/index.ts %*
