import { Effect } from "effect"
import type { DatabaseMigration } from "../migration"

export default {
  id: "20260604000001_create_circuit_tables",
  up(tx) {
    return Effect.gen(function* () {
      // ── Circuit ──────────────────────────────────────────────────────
      yield* tx.run(`
        CREATE TABLE \`circuit\` (
          \`id\` text PRIMARY KEY,
          \`project_id\` text NOT NULL REFERENCES \`project\`(\`id\`) ON DELETE CASCADE,
          \`name\` text NOT NULL,
          \`description\` text,
          \`time_created\` integer NOT NULL,
          \`time_updated\` integer NOT NULL
        );
      `)
      yield* tx.run(`CREATE INDEX \`circuit_project_idx\` ON \`circuit\` (\`project_id\`);`)

      // ── Circuit Node (a step / subagent within a circuit) ────────────
      yield* tx.run(`
        CREATE TABLE \`circuit_node\` (
          \`id\` text PRIMARY KEY,
          \`circuit_id\` text NOT NULL REFERENCES \`circuit\`(\`id\`) ON DELETE CASCADE,
          \`label\` text NOT NULL,
          \`agent_id\` text,
          \`tasks\` text NOT NULL DEFAULT '',
          \`cron\` text,
          \`enabled\` integer NOT NULL DEFAULT 1,
          \`color\` text,
          \`input_mapping\` text,
          \`output_mapping\` text,
          \`position\` integer NOT NULL DEFAULT 0,
          \`timeout\` integer,
          \`max_retries\` integer NOT NULL DEFAULT 0,
          \`time_created\` integer NOT NULL,
          \`time_updated\` integer NOT NULL
        );
      `)
      yield* tx.run(`CREATE INDEX \`circuit_node_circuit_idx\` ON \`circuit_node\` (\`circuit_id\`);`)

      // ── Circuit Edge (connection between nodes) ──────────────────────
      yield* tx.run(`
        CREATE TABLE \`circuit_edge\` (
          \`id\` text PRIMARY KEY,
          \`circuit_id\` text NOT NULL REFERENCES \`circuit\`(\`id\`) ON DELETE CASCADE,
          \`from_node_id\` text NOT NULL,
          \`to_node_id\` text NOT NULL,
          \`condition\` text,
          \`time_created\` integer NOT NULL,
          \`time_updated\` integer NOT NULL
        );
      `)
      yield* tx.run(`CREATE INDEX \`circuit_edge_circuit_idx\` ON \`circuit_edge\` (\`circuit_id\`);`)

      // ── Circuit Execution (runtime state) ───────────────────────────
      yield* tx.run(`
        CREATE TABLE \`circuit_execution\` (
          \`id\` text PRIMARY KEY,
          \`circuit_id\` text REFERENCES \`circuit\`(\`id\`),
          \`project_id\` text NOT NULL REFERENCES \`project\`(\`id\`) ON DELETE CASCADE,
          \`status\` text NOT NULL DEFAULT 'queued',
          \`trigger\` text NOT NULL DEFAULT 'manual',
          \`started_at\` integer,
          \`completed_at\` integer,
          \`error\` text,
          \`time_created\` integer NOT NULL,
          \`time_updated\` integer NOT NULL
        );
      `)
      yield* tx.run(`CREATE INDEX \`circuit_execution_circuit_idx\` ON \`circuit_execution\` (\`circuit_id\`);`)
      yield* tx.run(`CREATE INDEX \`circuit_execution_project_idx\` ON \`circuit_execution\` (\`project_id\`);`)

      // ── Node Execution (per-node execution record) ───────────────────
      yield* tx.run(`
        CREATE TABLE \`node_execution\` (
          \`id\` text PRIMARY KEY,
          \`execution_id\` text NOT NULL REFERENCES \`circuit_execution\`(\`id\`) ON DELETE CASCADE,
          \`node_id\` text NOT NULL,
          \`status\` text NOT NULL DEFAULT 'pending',
          \`input\` text,
          \`output\` text,
          \`error\` text,
          \`started_at\` integer,
          \`completed_at\` integer,
          \`retry_count\` integer NOT NULL DEFAULT 0,
          \`session_id\` text,
          \`time_created\` integer NOT NULL,
          \`time_updated\` integer NOT NULL
        );
      `)
      yield* tx.run(`CREATE INDEX \`node_execution_execution_idx\` ON \`node_execution\` (\`execution_id\`);`)
    })
  },
} satisfies DatabaseMigration.Migration
