import { createMemo, createSignal, For, onCleanup, onMount, Show } from "solid-js"
import { useTheme } from "@tui/context/theme"
import { TextAttributes } from "@opentui/core"
import { useDialog } from "../ui/dialog"
import { DialogAlert } from "../ui/dialog-alert"
import { DialogConfirm } from "../ui/dialog-confirm"
import { DialogPrompt } from "../ui/dialog-prompt"
import { DialogSelect } from "@tui/ui/dialog-select"
import { useSDK } from "@tui/context/sdk"
import { useRoute } from "@tui/context/route"
import { getScrollAcceleration } from "../util/scroll"
import { useTuiConfig } from "@tui/context/tui-config"
import {
  loadProjects,
  saveProjects,
  addProject,
  removeProject,
  updateProject,
  addSubAgent,
  removeSubAgent,
  updateSubAgent,
  addCircuit,
  updateCircuit,
  addConnection,
  removeConnection,
  addProjectFile,
  type Project,
  type SubAgent,
  type SubAgentLog,
  type Circuit,
} from "@tui/util/projects-storage"
import { circuitEngine } from "@tui/util/circuit-engine"

function removeCircuitFromList(list: Project[], projId: string, circuitId: string): Project[] {
  return list.map((p) =>
    p.id === projId
      ? { ...p, circuits: p.circuits.filter((c) => c.id !== circuitId), updatedAt: Date.now() }
      : p,
  )
}

const CRON_LABELS: Record<string, string> = {
  "": "manual",
  "*/5 * * * *": "cada 5m",
  "*/30 * * * *": "cada 30m",
  "0 * * * *": "cada hora",
  "0 0 * * *": "cada día",
}

function cronLabel(cron: string): string {
  return CRON_LABELS[cron] ?? (cron ? cron.slice(0, 16) : "manual")
}

export function DialogProjects() {
  const { theme } = useTheme()
  const dialog = useDialog()
  const sdk = useSDK()
  const route = useRoute()
  const tuiConfig = useTuiConfig()
  const scrollAcceleration = createMemo(() => getScrollAcceleration(tuiConfig))

  const [projects, setProjects] = createSignal<Project[]>([])
  const [expandedProjects, setExpandedProjects] = createSignal<Set<string>>(new Set())
  const [expandedAgents, setExpandedAgents] = createSignal<Set<string>>(new Set())
  const [expandedCircuits, setExpandedCircuits] = createSignal<Set<string>>(new Set())
  const [expandedLogs, setExpandedLogs] = createSignal<Set<string>>(new Set())
  const runningAgents = new Set<string>()

  let saveTimer: ReturnType<typeof setTimeout> | undefined

  function getDir(): string | undefined {
    try {
      return (sdk as any).directory
    } catch {
      return undefined
    }
  }

  function scheduleSave(list: Project[]) {
    clearTimeout(saveTimer)
    saveTimer = setTimeout(() => {
      const dir = getDir()
      if (dir) void saveProjects(dir, list)
    }, 500)
  }

  function withSave(updater: (list: Project[]) => Project[]) {
    setProjects((prev) => {
      const next = updater(prev)
      scheduleSave(next)
      return next
    })
  }

  onMount(async () => {
    const dir = getDir()
    if (!dir) return
    const list = await loadProjects(dir)
    if (list.length > 0) setProjects(list)
  })

  onCleanup(() => clearTimeout(saveTimer))

  async function handleNewProject() {
    const name = await DialogPrompt.show(dialog, "Nuevo proyecto", {
      placeholder: "Nombre del proyecto",
    })
    if (!name) return
    withSave((list) => addProject(list, name))
  }

  async function handleRenameProject(proj: Project) {
    const name = await DialogPrompt.show(dialog, "Renombrar proyecto", {
      value: proj.name,
      placeholder: "Nombre del proyecto",
    })
    if (!name || name === proj.name) return
    withSave((list) => updateProject(list, proj.id, { name }))
  }

  async function handleDeleteProject(proj: Project) {
    const ok = await DialogConfirm.show(dialog, "Eliminar proyecto", `¿Eliminar "${proj.name}" y todos sus subagentes?`)
    if (!ok) return
    withSave((list) => removeProject(list, proj.id))
  }

  async function handleNewAgent(projId: string, count: number) {
    const name = await DialogPrompt.show(dialog, "Nuevo subagente", {
      placeholder: "Nombre del agente",
    })
    if (!name) return
    withSave((list) => addSubAgent(list, projId, name, count))
  }

  async function handleEditAgentName(projId: string, agent: SubAgent) {
    const name = await DialogPrompt.show(dialog, "Renombrar agente", {
      value: agent.name,
      placeholder: "Nombre del agente",
    })
    if (!name || name === agent.name) return
    withSave((list) => updateSubAgent(list, projId, agent.id, { name }))
  }

  async function handleEditAgentTasks(projId: string, agent: SubAgent) {
    const tasks = await DialogPrompt.show(dialog, `Tareas de ${agent.name}`, {
      value: agent.tasks,
      placeholder: "Describí las tareas a ejecutar…",
    })
    if (tasks === null) return
    withSave((list) => updateSubAgent(list, projId, agent.id, { tasks }))
  }

  async function handleRunAgent(projId: string, agent: SubAgent) {
    if (!agent.tasks) {
      const edit = await DialogConfirm.show(dialog, "Sin tareas", `"${agent.name}" no tiene tareas asignadas. ¿Querés editarlas ahora?`)
      if (edit) void handleEditAgentTasks(projId, agent)
      return
    }
    if (runningAgents.has(agent.id)) return
    runningAgents.add(agent.id)

    try {
      setExpandedLogs((prev) => {
        const next = new Set(prev)
        next.add(agent.id)
        return next
      })

      const mkLog = (level: SubAgentLog["level"], message: string, detail?: string): SubAgentLog => ({
        timestamp: Date.now(),
        level,
        message,
        detail,
      })

      const steps = agent.tasks.split("\n").filter((s) => s.trim())
      const logs: SubAgentLog[] = [...(agent.log || [])]
      logs.push(mkLog("info", "▶ Ejecutando..."))
      withSave((list) => updateSubAgent(list, projId, agent.id, { log: logs }))

      let sessionId: string
      try {
        const currentRoute = route.data
        const parentId = currentRoute.type === "session" ? currentRoute.sessionID : undefined
        const forkRes: any = await (sdk.client as any).session.fork(
          { sessionID: parentId, directory: sdk.directory },
          { throwOnError: true },
        )
        sessionId = forkRes.data.id
      } catch (e: any) {
        logs.push(mkLog("error", `✗ Error al crear sesión: ${e?.message ?? e}`))
        withSave((list) => updateSubAgent(list, projId, agent.id, { log: logs }))
        return
      }

      const results: { task: string; text: string }[] = []

      for (const step of steps) {
        const trimmed = step.trim()
        logs.push(mkLog("info", `  ${trimmed.slice(0, 60)}`))
        withSave((list) => updateSubAgent(list, projId, agent.id, { log: logs }))

        try {
          const response: any = await (sdk.client as any).session.prompt({
            sessionID: sessionId,
            directory: sdk.directory,
            parts: [{ type: "text" as const, text: trimmed }],
          }, { throwOnError: true })

          const textParts = (response.data?.parts ?? []).filter((p: any) => p.type === "text")
          const resultText = textParts.map((p: any) => p.text).join("\n").trim()
          results.push({ task: trimmed, text: resultText || "(sin respuesta de texto)" })
          logs.push(mkLog("result", resultText.slice(0, 100) || "Tarea completada", resultText))
        } catch (e: any) {
          results.push({ task: trimmed, text: `Error: ${e?.message ?? e}` })
          logs.push(mkLog("error", `✗ Error: ${(e?.message ?? e).slice(0, 80)}`, `${e}`))
        }
        withSave((list) => updateSubAgent(list, projId, agent.id, { log: logs }))
      }

      const outputPath = `output/${agent.name}_${Date.now()}.md`
      const outputContent = [
        `# ${agent.name} — ${new Date().toLocaleString("es-AR")}`,
        "",
        "## Tareas ejecutadas",
        "",
        agent.tasks,
        "",
        "## Resultados",
        "",
        ...results.flatMap((r) => [
          `### ${r.task}`,
          "",
          r.text,
          "",
          "---",
          "",
        ]),
        "*Generado automáticamente por haz.*",
      ].join("\n")

      logs.push(mkLog("result", `✓ Tareas finalizadas. Archivo generado: ${outputPath}`))
      withSave((list) => {
        const withLog = updateSubAgent(list, projId, agent.id, { log: logs, lastRun: Date.now() })
        return addProjectFile(withLog, projId, outputPath, outputContent, agent.id)
      })
    } finally {
      runningAgents.delete(agent.id)
    }
  }

  function handleToggleAgent(projId: string, agent: SubAgent) {
    withSave((list) => updateSubAgent(list, projId, agent.id, { enabled: !agent.enabled }))
  }

  async function handleDeleteAgent(projId: string, agent: SubAgent) {
    const ok = await DialogConfirm.show(dialog, "Eliminar agente", `¿Eliminar "${agent.name}"?`)
    if (!ok) return
    withSave((list) => removeSubAgent(list, projId, agent.id))
  }

  async function handleNewCircuit(projId: string) {
    const name = await DialogPrompt.show(dialog, "Nuevo circuito", {
      placeholder: "Nombre del circuito",
    })
    if (!name) return
    withSave((list) => addCircuit(list, projId, name))
  }

  async function handleDeleteCircuit(projId: string, circuit: Circuit) {
    const ok = await DialogConfirm.show(dialog, "Eliminar circuito", `¿Eliminar "${circuit.name}"?`)
    if (!ok) return
    withSave((list) => removeCircuitFromList(list, projId, circuit.id))
  }

  async function handleAddConnection(projId: string, circuitId: string, agents: SubAgent[]) {
    const enabled = agents.filter((a) => a.enabled)
    if (enabled.length < 2) {
      void DialogAlert.show(dialog, "Circuito", "Necesitás al menos 2 agentes habilitados para crear una conexión.")
      return
    }
    const fromOpts = enabled.map((a) => ({ value: a.id, title: a.name }))
    const fromVal = await new Promise<string | null>((resolve) => {
      dialog.replace(() => (
        <DialogSelect
          title="Agente origen"
          options={fromOpts}
          onSelect={(opt) => resolve(opt.value)}
        />
      ), () => resolve(null))
    })
    if (!fromVal) return

    const toOpts = enabled.filter((a) => a.id !== fromVal).map((a) => ({ value: a.id, title: a.name }))
    const toVal = await new Promise<string | null>((resolve) => {
      dialog.replace(() => (
        <DialogSelect
          title="Agente destino"
          options={toOpts}
          onSelect={(opt) => resolve(opt.value)}
        />
      ), () => resolve(null))
    })
    if (!toVal) return

    withSave((list) => addConnection(list, projId, circuitId, fromVal, toVal))
  }

  async function handleRemoveConnection(projId: string, circuitId: string, connIndex: number) {
    withSave((list) => removeConnection(list, projId, circuitId, connIndex))
  }

  async function handleSetCircuitMode(projId: string, circuit: Circuit) {
    const mode = await new Promise<string | null>((resolve) => {
      dialog.replace(() => (
        <DialogSelect
          title="Modo de circuito"
          options={[
            { value: "pipeline", title: "Pipeline — ejecuta agentes en orden topológico" },
            { value: "evaluator", title: "Evaluator — generador + evaluador con aprobación" },
            { value: "supervisor", title: "Supervisor — supervisor planifica, workers ejecutan" },
          ]}
          current={circuit.mode}
          onSelect={(opt) => resolve(opt.value)}
        />
      ), () => resolve(null))
    })
    if (!mode || mode === circuit.mode) return
    withSave((list) => updateCircuit(list, projId, circuit.id, { mode: mode as Circuit["mode"] }))
  }

  async function handleRunCircuit(projId: string, circuit: Circuit, agents: SubAgent[]) {
    const enabled = agents.filter((a) => a.enabled)
    if (enabled.length < 2) {
      void DialogAlert.show(dialog, "Circuito", "Se necesitan al menos 2 agentes habilitados.")
      return
    }
    try {
      const currentRoute = route.data
      const parentId = currentRoute.type === "session" ? currentRoute.sessionID : ""
      await circuitEngine.execute({
        circuit,
        agents: enabled,
        sdk: { client: sdk.client as any, directory: sdk.directory ?? "" },
        parentSessionId: parentId ?? "",
        onLog: (agentId: string, level: string, message: string) => {
          const log: SubAgentLog = { timestamp: Date.now(), level: level as SubAgentLog["level"], message }
          withSave((list) => {
            const agent = list.find((p) => p.id === projId)?.subAgents.find((a) => a.id === agentId)
            const updated = [...(agent?.log || []), log]
            return updateSubAgent(list, projId, agentId, { log: updated })
          })
        },
      })
    } catch (e: any) {
      void DialogAlert.show(dialog, "Error", `Error al ejecutar circuito: ${e?.message ?? e}`)
    }
  }

  return (
    <box flexDirection="column" minHeight={0} height="100%">
      <box flexShrink={0} paddingBottom={1} flexDirection="row" gap={1}>
        <text fg={theme.text} attributes={TextAttributes.BOLD}>Proyectos / Agentes / Circuitos</text>
      </box>
      <scrollbox flexGrow={1} scrollAcceleration={scrollAcceleration()} minHeight={0}>
        <box flexDirection="column" gap={1}>
          <For each={projects()}>
            {(proj) => {
              const expanded = () => expandedProjects().has(proj.id)
              return (
                <box flexDirection="column" gap={0}>
                  <box flexDirection="row" gap={1} alignItems="center">
                    <text
                      fg={theme.text}
                      onMouseDown={() => setExpandedProjects((prev) => {
                        const next = new Set(prev)
                        if (next.has(proj.id)) next.delete(proj.id)
                        else next.add(proj.id)
                        return next
                      })}
                    >
                      {expanded() ? "▾" : "▸"} {proj.name}
                    </text>
                    <text fg={theme.textMuted} onMouseDown={() => handleRenameProject(proj)}>✎</text>
                    <text fg={theme.warning} onMouseDown={() => handleDeleteProject(proj)}>✕</text>
                    <text fg={theme.success} onMouseDown={() => handleNewAgent(proj.id, proj.subAgents.length)}>+agente</text>
                    <text fg={theme.primary} onMouseDown={() => handleNewCircuit(proj.id)}>+circuito</text>
                  </box>
                  <Show when={expanded()}>
                    <box paddingLeft={2} flexDirection="column" gap={0}>
                      {/* Sub-agents */}
                      <For each={proj.subAgents}>
                        {(agent) => {
                          const agentExpanded = () => expandedAgents().has(agent.id)
                          return (
                            <box flexDirection="column" gap={0}>
                              <box flexDirection="row" gap={1} alignItems="center">
                                <text
                                  fg={agent.enabled ? theme.text : theme.textMuted}
                                  onMouseDown={() => setExpandedAgents((prev) => {
                                    const next = new Set(prev)
                                    if (next.has(agent.id)) next.delete(agent.id)
                                    else next.add(agent.id)
                                    return next
                                  })}
                                >
                                  {agentExpanded() ? "▾" : "▸"} {agent.name} {agent.enabled ? "" : "(desactivado)"}
                                </text>
                                <text fg={theme.textMuted} onMouseDown={() => handleEditAgentName(proj.id, agent)}>✎</text>
                                <text fg={theme.textMuted} onMouseDown={() => handleEditAgentTasks(proj.id, agent)}>📝</text>
                                <text fg={agent.enabled ? theme.warning : theme.success} onMouseDown={() => handleToggleAgent(proj.id, agent)}>
                                  {agent.enabled ? "desactivar" : "activar"}
                                </text>
                                <text fg={theme.primary} onMouseDown={() => handleRunAgent(proj.id, agent)}>▶</text>
                                <text fg={theme.warning} onMouseDown={() => handleDeleteAgent(proj.id, agent)}>✕</text>
                              </box>
                              <Show when={agentExpanded()}>
                                <box paddingLeft={2} flexDirection="column" gap={0}>
                                  <Show when={agent.tasks}>
                                    <text fg={theme.textMuted} wrapMode="none" truncate>Tareas: {agent.tasks.slice(0, 80)}</text>
                                  </Show>
                                  <Show when={agent.cron}>
                                    <text fg={theme.textMuted}>Cron: {cronLabel(agent.cron)}</text>
                                  </Show>
                                  <Show when={agent.lastRun}>
                                    <text fg={theme.textMuted}>Últ. ejec: {new Date(agent.lastRun!).toLocaleString("es-AR")}</text>
                                  </Show>
                                  <Show when={agentExpanded() && expandedLogs().has(agent.id) && agent.log?.length}>
                                    <box flexDirection="column" gap={0} paddingLeft={1}>
                                      <text fg={theme.textMuted} attributes={TextAttributes.BOLD}>Log:</text>
                                      <For each={agent.log!.slice(-10)}>
                                        {(log) => (
                                          <text fg={log.level === "error" ? theme.warning : log.level === "result" ? theme.success : theme.textMuted} wrapMode="none" truncate>
                                            {new Date(log.timestamp).toLocaleTimeString("es-AR")} {log.message}
                                          </text>
                                        )}
                                      </For>
                                    </box>
                                  </Show>
                                </box>
                              </Show>
                            </box>
                          )
                        }}
                      </For>
                      {/* Circuits */}
                      <Show when={proj.circuits.length > 0}>
                        <box height={1} />
                        <text fg={theme.textMuted} attributes={TextAttributes.BOLD}>Circuitos:</text>
                        <For each={proj.circuits}>
                          {(circuit) => {
                            const circuitExpanded = () => expandedCircuits().has(circuit.id)
                            return (
                              <box flexDirection="column" gap={0}>
                                <box flexDirection="row" gap={1} alignItems="center">
                                  <text
                                    fg={theme.text}
                                    onMouseDown={() => setExpandedCircuits((prev) => {
                                      const next = new Set(prev)
                                      if (next.has(circuit.id)) next.delete(circuit.id)
                                      else next.add(circuit.id)
                                      return next
                                    })}
                                  >
                                    {circuitExpanded() ? "▾" : "▸"} {circuit.name} ({circuit.mode})
                                  </text>
                                  <text fg={theme.textMuted} onMouseDown={() => handleSetCircuitMode(proj.id, circuit)}>modo</text>
                                  <text fg={theme.primary} onMouseDown={() => handleAddConnection(proj.id, circuit.id, proj.subAgents)}>+conexión</text>
                                  <text fg={theme.primary} onMouseDown={() => handleRunCircuit(proj.id, circuit, proj.subAgents)}>▶</text>
                                  <text fg={theme.warning} onMouseDown={() => handleDeleteCircuit(proj.id, circuit)}>✕</text>
                                </box>
                                <Show when={circuitExpanded() && circuit.connections.length > 0}>
                                  <box paddingLeft={2} flexDirection="column" gap={0}>
                                    <For each={circuit.connections}>
                                      {(conn, idx) => (
                                        <box flexDirection="row" gap={1} alignItems="center">
                                          <text fg={theme.textMuted}>
                                            {proj.subAgents.find((a) => a.id === conn.from)?.name ?? conn.from} → {proj.subAgents.find((a) => a.id === conn.to)?.name ?? conn.to}
                                            <Show when={conn.condition}> [{conn.condition}]</Show>
                                          </text>
                                          <text fg={theme.warning} onMouseDown={() => handleRemoveConnection(proj.id, circuit.id, idx())}>✕</text>
                                        </box>
                                      )}
                                    </For>
                                  </box>
                                </Show>
                              </box>
                            )
                          }}
                        </For>
                      </Show>
                    </box>
                  </Show>
                </box>
              )
            }}
          </For>
        </box>
      </scrollbox>
      <box flexShrink={0} paddingTop={1}>
        <text fg={theme.success} onMouseDown={handleNewProject}>+ Nuevo proyecto</text>
      </box>
    </box>
  )
}
