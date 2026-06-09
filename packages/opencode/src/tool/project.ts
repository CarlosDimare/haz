import { Effect, Schema } from "effect"
import * as Tool from "./tool"
import { InstanceState } from "@/effect/instance-state"
import * as Storage from "@/cli/cmd/tui/util/projects-storage"
import DESCRIPTION from "./project.txt"

export const Parameters = Schema.Struct({
  command: Schema.String.annotate({
    description:
      "Action to perform: create-project, list-projects, show-project, add-subagent, update-subagent, remove-subagent, add-circuit, add-connection",
  }),
  name: Schema.optional(Schema.String).annotate({ description: "Name for the new project, sub-agent, or circuit" }),
  projectId: Schema.optional(Schema.String).annotate({
    description: "Project ID (required for sub-agent and circuit operations)",
  }),
  subAgentId: Schema.optional(Schema.String).annotate({ description: "Sub-agent ID (for update/remove)" }),
  tasks: Schema.optional(Schema.String).annotate({ description: "Task description for a sub-agent" }),
  enabled: Schema.optional(Schema.Boolean).annotate({ description: "Whether a sub-agent is enabled" }),
  circuitId: Schema.optional(Schema.String).annotate({ description: "Circuit ID (for adding connections)" }),
  mode: Schema.optional(Schema.String).annotate({
    description: "Circuit mode: pipeline, evaluator, supervisor",
  }),
  from: Schema.optional(Schema.String).annotate({ description: "Source sub-agent ID for a connection" }),
  to: Schema.optional(Schema.String).annotate({ description: "Target sub-agent ID for a connection" }),
  condition: Schema.optional(Schema.String).annotate({
    description: "Optional condition for a connection (contains:text, empty, length>N, match:/regex/, yes, no)",
  }),
})

type Params = Schema.Schema.Type<typeof Parameters>

function formatProject(p: Storage.Project): string {
  const agents = p.subAgents.map((a) =>
    `  ${a.id}: ${a.name}${a.enabled ? "" : " (disabled)"}${a.tasks ? ` - tasks: ${a.tasks.slice(0, 80)}` : ""}`,
  ).join("\n")
  const circuits = p.circuits.map((c) =>
    `  ${c.id}: ${c.name} (${c.mode}) - ${c.connections.length} connections`,
  ).join("\n")
  return [
    `Project: ${p.name} (${p.id})`,
    `Created: ${new Date(p.createdAt).toLocaleString()}`,
    `Sub-agents (${p.subAgents.length}):`,
    agents || "  (none)",
    `Circuits (${p.circuits.length}):`,
    circuits || "  (none)",
  ].join("\n")
}

export const ProjectTool: Tool.Info<typeof Parameters> = {
  id: "project",
  init: () =>
    Effect.succeed({
      description: DESCRIPTION,
      parameters: Parameters,
      execute: (params: Params, ctx: Tool.Context) =>
        Effect.gen(function* () {
          const instance = yield* InstanceState.context
          const directory = instance.directory
          const projects = yield* Effect.promise(() => Storage.loadProjects(directory))

          switch (params.command) {
            case "create-project": {
              const name = params.name || "Untitled"
              const updated = Storage.addProject(projects, name)
              yield* Effect.promise(() => Storage.saveProjects(directory, updated))
              const created = updated[updated.length - 1]
              return {
                title: `Created project: ${name}`,
                output: formatProject(created),
                metadata: { command: "create-project", projectId: created.id, name },
              }
            }

            case "list-projects": {
              if (projects.length === 0) {
                return {
                  title: "No projects",
                  output: "No projects found. Use command=create-project to create one.",
                  metadata: { command: "list-projects" },
                }
              }
              return {
                title: `${projects.length} project(s)`,
                output: projects.map(formatProject).join("\n\n---\n\n"),
                metadata: { command: "list-projects" },
              }
            }

            case "show-project": {
              const project = projects.find((p) => p.id === params.projectId)
              if (!project) {
                return {
                  title: "Project not found",
                  output: `No project found with id: ${params.projectId}`,
                  metadata: { command: "show-project", projectId: params.projectId },
                }
              }
              return {
                title: `Project: ${project.name}`,
                output: formatProject(project),
                metadata: { command: "show-project", projectId: project.id },
              }
            }

            case "add-subagent": {
              if (!params.projectId) {
                return {
                  title: "Missing projectId",
                  output: "projectId is required for add-subagent",
                  metadata: { command: "add-subagent" },
                }
              }
              const projectIndex = projects.findIndex((p) => p.id === params.projectId)
              if (projectIndex === -1) {
                return {
                  title: "Project not found",
                  output: `No project found with id: ${params.projectId}`,
                  metadata: { command: "add-subagent", projectId: params.projectId },
                }
              }
              const projectObj = projects[projectIndex]
              const idx = projectObj.subAgents.length
              const name = params.name || `Agent ${idx + 1}`
              let updated = Storage.addSubAgent(projects, params.projectId, name, idx)
              const updatedProject = updated[projectIndex]
              const added = updatedProject.subAgents[idx]
              if (params.tasks) {
                const withTasks = Storage.updateSubAgent(updated, params.projectId, added.id, { tasks: params.tasks })
                yield* Effect.promise(() => Storage.saveProjects(directory, withTasks))
              } else {
                yield* Effect.promise(() => Storage.saveProjects(directory, updated))
              }
              return {
                title: `Added sub-agent: ${name}`,
                output: `Sub-agent "${name}" created with id: ${added.id}${params.tasks ? "\nTasks: " + params.tasks : ""}`,
                metadata: { command: "add-subagent", projectId: params.projectId, subAgentId: added.id },
              }
            }

            case "update-subagent": {
              if (!params.projectId || !params.subAgentId) {
                return {
                  title: "Missing parameters",
                  output: "projectId and subAgentId are required for update-subagent",
                  metadata: { command: "update-subagent" },
                }
              }
              const project = projects.find((p) => p.id === params.projectId)
              if (!project) {
                return {
                  title: "Project not found",
                  output: `No project found with id: ${params.projectId}`,
                  metadata: { command: "update-subagent", projectId: params.projectId },
                }
              }
              const agent = project.subAgents.find((a) => a.id === params.subAgentId)
              if (!agent) {
                return {
                  title: "Sub-agent not found",
                  output: `No sub-agent found with id: ${params.subAgentId} in project ${project.name}`,
                  metadata: { command: "update-subagent", projectId: params.projectId, subAgentId: params.subAgentId },
                }
              }
              const patch: Partial<Storage.SubAgent> = {}
              if (params.tasks !== undefined) patch.tasks = params.tasks
              if (params.enabled !== undefined) patch.enabled = params.enabled
              const updated = Storage.updateSubAgent(projects, params.projectId, params.subAgentId, patch)
              yield* Effect.promise(() => Storage.saveProjects(directory, updated))
              return {
                title: `Updated sub-agent: ${agent.name}`,
                output: [
                  `Sub-agent "${agent.name}" (${params.subAgentId}) updated.`,
                  ...(params.tasks !== undefined ? [`Tasks: ${params.tasks}`] : []),
                  ...(params.enabled !== undefined ? [`Enabled: ${params.enabled}`] : []),
                ].join("\n"),
                metadata: { command: "update-subagent", projectId: params.projectId, subAgentId: params.subAgentId },
              }
            }

            case "remove-subagent": {
              if (!params.projectId || !params.subAgentId) {
                return {
                  title: "Missing parameters",
                  output: "projectId and subAgentId are required for remove-subagent",
                  metadata: { command: "remove-subagent" },
                }
              }
              const project = projects.find((p) => p.id === params.projectId)
              if (!project) {
                return {
                  title: "Project not found",
                  output: `No project found with id: ${params.projectId}`,
                  metadata: { command: "remove-subagent", projectId: params.projectId },
                }
              }
              const agent = project.subAgents.find((a) => a.id === params.subAgentId)
              if (!agent) {
                return {
                  title: "Sub-agent not found",
                  output: `No sub-agent found with id: ${params.subAgentId} in project ${project.name}`,
                  metadata: { command: "remove-subagent", projectId: params.projectId, subAgentId: params.subAgentId },
                }
              }
              const updated = Storage.removeSubAgent(projects, params.projectId, params.subAgentId)
              yield* Effect.promise(() => Storage.saveProjects(directory, updated))
              return {
                title: `Removed sub-agent: ${agent.name}`,
                output: `Sub-agent "${agent.name}" (${params.subAgentId}) removed from project ${project.name}.`,
                metadata: { command: "remove-subagent", projectId: params.projectId, subAgentId: params.subAgentId },
              }
            }

            case "add-circuit": {
              if (!params.projectId) {
                return {
                  title: "Missing projectId",
                  output: "projectId is required for add-circuit",
                  metadata: { command: "add-circuit" },
                }
              }
              const project = projects.find((p) => p.id === params.projectId)
              if (!project) {
                return {
                  title: "Project not found",
                  output: `No project found with id: ${params.projectId}`,
                  metadata: { command: "add-circuit", projectId: params.projectId },
                }
              }
              const name = params.name || "Untitled Circuit"
              let updated = Storage.addCircuit(projects, params.projectId, name)
              const circuitIdx = updated.findIndex((p) => p.id === params.projectId)
              const circuits = updated[circuitIdx].circuits
              const circuit = circuits[circuits.length - 1]
              if (params.mode && ["pipeline", "evaluator", "supervisor"].includes(params.mode)) {
                updated = Storage.updateCircuit(updated, params.projectId, circuit.id, {
                  mode: params.mode as Storage.CircuitMode,
                })
              }
              yield* Effect.promise(() => Storage.saveProjects(directory, updated))
              return {
                title: `Added circuit: ${name}`,
                output: `Circuit "${name}" created with id: ${circuit.id}, mode: ${params.mode || "pipeline"}`,
                metadata: { command: "add-circuit", projectId: params.projectId, circuitId: circuit.id },
              }
            }

            case "add-connection": {
              if (!params.projectId || !params.circuitId || !params.from || !params.to) {
                return {
                  title: "Missing parameters",
                  output: "projectId, circuitId, from, and to are required for add-connection",
                  metadata: { command: "add-connection" },
                }
              }
              const project = projects.find((p) => p.id === params.projectId)
              if (!project) {
                return {
                  title: "Project not found",
                  output: `No project found with id: ${params.projectId}`,
                  metadata: { command: "add-connection", projectId: params.projectId },
                }
              }
              const circuit = project.circuits.find((c) => c.id === params.circuitId)
              if (!circuit) {
                return {
                  title: "Circuit not found",
                  output: `No circuit found with id: ${params.circuitId} in project ${project.name}`,
                  metadata: { command: "add-connection", projectId: params.projectId, circuitId: params.circuitId },
                }
              }
              const fromAgent = project.subAgents.find((a) => a.id === params.from)
              const toAgent = project.subAgents.find((a) => a.id === params.to)
              if (!fromAgent || !toAgent) {
                const missing = [!fromAgent ? params.from : "", !toAgent ? params.to : ""].filter(Boolean).join(", ")
                return {
                  title: "Sub-agent not found",
                  output: `Could not find sub-agent(s): ${missing}`,
                  metadata: { command: "add-connection", projectId: params.projectId, circuitId: params.circuitId },
                }
              }
              const updated = Storage.addConnection(
                projects,
                params.projectId,
                params.circuitId,
                params.from,
                params.to,
                params.condition,
              )
              yield* Effect.promise(() => Storage.saveProjects(directory, updated))
              const desc = params.condition ? ` (condition: ${params.condition})` : ""
              return {
                title: `Added connection: ${fromAgent.name} → ${toAgent.name}`,
                output: `Connection from "${fromAgent.name}" to "${toAgent.name}" added to circuit "${circuit.name}"${desc}.`,
                metadata: { command: "add-connection", projectId: params.projectId, circuitId: params.circuitId },
              }
            }

            default:
              return {
                title: "Unknown command",
                output: `Unknown command: ${params.command}. Valid commands: create-project, list-projects, show-project, add-subagent, update-subagent, remove-subagent, add-circuit, add-connection`,
                metadata: { command: params.command },
              }
          }
        }).pipe(Effect.orDie),
    }),
}

