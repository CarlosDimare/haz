import { batch, createMemo, createSignal, For, onCleanup, onMount, Show } from "solid-js"
import { useTerminalDimensions } from "@opentui/solid"
import { useTheme } from "@tui/context/theme"
import { TextAttributes } from "@opentui/core"
import { useDialog } from "../ui/dialog"
import { DialogAlert } from "../ui/dialog-alert"
import { DialogConfirm } from "../ui/dialog-confirm"
import { DialogPrompt } from "../ui/dialog-prompt"
import { DialogSelect, type DialogSelectOption } from "@tui/ui/dialog-select"
import { useProject } from "@tui/context/project"
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
  updateProjectFile,
  type Project,
  type SubAgent,
  type SubAgentLog,
  type ProjectFile,
} from "@tui/util/projects-storage"
import { circuitEngine } from "@tui/util/circuit-engine"

// ── Helpers ────────────────────────────────────────────────────────────────

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

// ── Main component ─────────────────────────────────────────────────────────

export function ProjectPanel(props: {
  onClose?: () => void
  overlay?: boolean
  width?: number
  onToggleMaximize?: () => void
  isMaximized?: boolean
}) {
  const { theme } = useTheme()
  const dialog = useDialog()
  const project = useProject()
  const sdk = useSDK()
  const route = useRoute()
  const tuiConfig = useTuiConfig()
  const scrollAcceleration = createMemo(() => getScrollAcceleration(tuiConfig))

  // ── State ──────────────────────────────────────────────────────────────

  const [projects, setProjects] = createSignal<Project[]>([])
  const [expandedProjects, setExpandedProjects] = createSignal<Set<string>>(new Set())
  const [expandedAgents, setExpandedAgents] = createSignal<Set<string>>(new Set())
  const [expandedCircuits, setExpandedCircuits] = createSignal<Set<string>>(new Set())
  const [expandedLogs, setExpandedLogs] = createSignal<Set<string>>(new Set())
  const [expandedEntries, setExpandedEntries] = createSignal<Set<string>>(new Set())
  const [toDelete, setToDelete] = createSignal<{ type: "project" | "agent" | "circuit"; id: string } | null>(null)
  const runningAgents = new Set<string>()
  const [circuitRunningNodes, setCircuitRunningNodes] = createSignal<Map<string, "running" | "completed" | "failed" | "paused">>(new Map())

  // ── Load / save ────────────────────────────────────────────────────────

  let loaded = false
  let saveTimer: ReturnType<typeof setTimeout> | undefined

  function getDir(): string | undefined {
    try {
      const dir = (project as any).instance?.path?.()?.directory ?? (project as any).data?.instance?.path?.directory
      if (dir) return dir
    } catch {
      // fall through
    }
    return sdk.directory
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

  // ── Handlers ───────────────────────────────────────────────────────────

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

  async function handleEditAgentCron(projId: string, agent: SubAgent) {
    const result = await new Promise<string | null>((resolve) => {
      dialog.replace(
        () => <CronDialog agent={agent} onSelect={resolve} />,
        () => resolve(null),
      )
    })
    if (result === null) return
    withSave((list) => updateSubAgent(list, projId, agent.id, { cron: result }))
  }

  async function handleRunAgent(projId: string, agent: SubAgent) {
    if (!agent.tasks) {
      const edit = await DialogConfirm.show(dialog, "Sin tareas", `"${agent.name}" no tiene tareas asignadas. ¿Querés editarlas ahora?`)
      if (edit) void handleEditAgentTasks(projId, agent)
      return
    }
    // Prevent concurrent executions on the same agent
    if (runningAgents.has(agent.id)) return
    runningAgents.add(agent.id)

    try {
      // Expand log panel immediately
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

      // Get current session from the TUI route and fork it
      let sessionId: string
      try {
        const currentRoute = route.data
        const parentId = currentRoute.type === "session" ? currentRoute.sessionID : undefined

        if (!parentId) {
          logs.push(mkLog("error", "✗ No hay sesión activa. Abrí una sesión primero."))
          withSave((list) => updateSubAgent(list, projId, agent.id, { log: logs }))
          return
        }

        const forkRes: any = await sdk.client.session.fork(
          {
            sessionID: parentId,
            directory: sdk.directory,
          },
          { throwOnError: true },
        )
        sessionId = forkRes.data.id
      } catch (e: any) {
        logs.push(mkLog("error", `✗ Error al crear sesión hija: ${e?.message ?? e}`))
        withSave((list) => updateSubAgent(list, projId, agent.id, { log: logs }))
        return
      }

      const results: { task: string; text: string }[] = []

      for (const step of steps) {
        const trimmed = step.trim()
        logs.push(mkLog("info", `  ${trimmed.slice(0, 60)}`))
        withSave((list) => updateSubAgent(list, projId, agent.id, { log: logs }))

        try {
          const response: any = await sdk.client.session.prompt(
            {
              sessionID: sessionId,
              directory: sdk.directory,
              parts: [{ type: "text" as const, text: trimmed }],
            },
            { throwOnError: true },
          )

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

      // Generate output file with real results
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
      placeholder: "Nombre del circuito (ej: Data pipeline)",
    })
    if (!name) return
    withSave((list) => addCircuit(list, projId, name))
  }

  async function handleAddConnection(projId: string, circuitId: string, agents: SubAgent[]) {
    if (agents.length < 2) {
      void DialogAlert.show(dialog, "Circuito", "Necesitás al menos 2 agentes para crear una conexión.")
      return
    }
    const result = await new Promise<{ src: string; dst: string } | null>((resolve) => {
      dialog.replace(
        () => <LinkDialog agents={agents} onSelect={(src, dst) => resolve({ src, dst })} />,
        () => resolve(null),
      )
    })
    if (!result) return
    if (result.src === result.dst) {
      void DialogAlert.show(dialog, "Conexión inválida", "Un agente no puede conectarse a sí mismo.")
      return
    }
    // Optional condition
    const condition = await DialogPrompt.show(dialog, "Condición (opcional)", {
      placeholder: "Ej: contains:éxito | not-empty | length>100 | dejar vacío para siempre",
    })
    withSave((list) => addConnection(list, projId, circuitId, result.src, result.dst, condition ?? undefined))
  }

  async function handleEditCircuitMode(projId: string, circuit: { id: string; name: string; mode?: string; maxLoops?: number }) {
    const modeResult = await new Promise<string | null>((resolve) => {
      dialog.replace(
        () => (
          <DialogSelect<string>
            title="Modo de circuito"
            options={[
              { title: "Pipeline", description: "Ejecución por niveles del DAG (por defecto)", value: "pipeline" },
              { title: "Evaluator-Optimizer", description: "Genera → Evalúa → Mejora en loop hasta aprobar", value: "evaluator" },
              { title: "Supervisor/Worker", description: "Supervisor planifica y delega sub-tareas a workers", value: "supervisor" },
            ]}
            onSelect={(opt) => { resolve(opt.value); dialog.clear() }}
          />
        ),
        () => resolve(null),
      )
    })
    if (!modeResult) return
    const patch: Record<string, any> = { mode: modeResult }
    if (modeResult === "evaluator") {
      const loops = await DialogPrompt.show(dialog, "Iteraciones máximas", {
        value: String(circuit.maxLoops ?? 3),
        placeholder: "Número máximo de loops (ej: 3)",
      })
      if (loops) patch.maxLoops = Number.parseInt(loops) || 3
    }
    withSave((list) => updateCircuit(list, projId, circuit.id, patch))
  }

  // ── Circuit execution ──────────────────────────────────────────────────────

  async function handleRunCircuit(projId: string, circuit: { id: string; name: string; cron?: string; connections: { from: string; to: string }[] }) {
    const proj = projects().find((p) => p.id === projId)
    if (!proj) return

    const activeAgents = proj.subAgents.filter((a) => a.enabled && a.tasks.trim())
    if (activeAgents.length === 0) {
      void DialogAlert.show(dialog, "Circuito", "No hay agentes habilitados con tareas asignadas.")
      return
    }

    const currentRoute = route.data
    const parentSessionId = currentRoute.type === "session" ? currentRoute.sessionID : undefined
    if (!parentSessionId) {
      void DialogAlert.show(dialog, "Circuito", "Abrí una sesión primero.")
      return
    }

    // Mark all agents in the circuit as having running state
    const nodeStatus = new Map<string, "running" | "completed" | "failed">()
    for (const agent of activeAgents) {
      nodeStatus.set(agent.id, "running")
    }
    setCircuitRunningNodes(new Map(nodeStatus))

    // Expand all agent logs so user sees progress
    setExpandedLogs((prev) => {
      const next = new Set(prev)
      for (const a of activeAgents) next.add(a.id)
      return next
    })

    // Build onPause handler for human-in-the-loop
    const onPause = async (nodeId: string, agentName: string, pauseMsg: string): Promise<string | null> => {
      const result = await DialogPrompt.show(dialog, `⏸ ${agentName}: ${pauseMsg}`, {
        placeholder: "Escribí tu input o presioná Esc para cancelar...",
      })
      return result ?? null
    }

    try {
      const result = await circuitEngine.execute({
        circuit: { id: circuit.id, name: circuit.name, cron: circuit.cron ?? "", connections: circuit.connections, mode: (circuit as any).mode ?? "pipeline", maxLoops: (circuit as any).maxLoops ?? 3 },
        agents: proj.subAgents,
        allCircuits: proj.circuits,
        sdk: { client: sdk.client, directory: sdk.directory ?? "" },
        parentSessionId,
        onPause,
        onLog: (nodeId, level, message, detail) => {
          if (!nodeId) {
            // Circuit-level log — push to a designated circuit log? For now, log to the project
            return
          }
          withSave((list) => {
            const existing = list.find((p) => p.id === projId)
            if (!existing) return list
            const agent = existing.subAgents.find((a) => a.id === nodeId)
            if (!agent) return list
            const logs = [...(agent.log ?? []), { timestamp: Date.now(), level, message, detail: detail ?? message }]
            return updateSubAgent(list, projId, nodeId, { log: logs, lastRun: Date.now() })
          })
        },
        onProgress: (nodeId, status) => {
          setCircuitRunningNodes((prev) => {
            const next = new Map(prev)
            next.set(nodeId, status)
            return next
          })
        },
      })

      // Add output files
      if (result.outputFiles.length > 0) {
        withSave((list) => {
          let updated = list
          for (const file of result.outputFiles) {
            updated = addProjectFile(updated, projId, file.path, file.content, file.agentId)
          }
          return updated
        })
      }

      // Mark completion in each agent's log
      for (const r of result.results) {
        withSave((list) => {
          const logs = list
            .find((p) => p.id === projId)
            ?.subAgents.find((a) => a.id === r.nodeId)?.log ?? []
          return updateSubAgent(list, projId, r.nodeId, {
            log: [...logs, { timestamp: Date.now(), level: "result" as const, message: `✓ ${r.duration}ms` }],
            lastRun: Date.now(),
          })
        })
      }
    } catch (e: any) {
      void DialogAlert.show(dialog, "Error", `Error ejecutando circuito: ${e?.message ?? e}`)
    } finally {
      setCircuitRunningNodes(new Map())
    }
  }

  async function handleEditCircuitCron(projId: string, circuit: { id: string; name: string; cron?: string }) {
    const result = await new Promise<string | null>((resolve) => {
      dialog.replace(
        () => (
          <CronDialog
            agent={{ id: circuit.id, name: circuit.name, cron: circuit.cron ?? "" } as any}
            onSelect={resolve}
          />
        ),
        () => resolve(null),
      )
    })
    if (result === null) return
    withSave((list) => updateCircuit(list, projId, circuit.id, { cron: result }))
  }

  // ── File editor ────────────────────────────────────────────────────────

  async function handleOpenFile(projId: string, file: ProjectFile) {
    const result = await new Promise<string | null>((resolve) => {
      dialog.replace(
        () => <FileEditorDialog file={file} onSave={(content) => resolve(content)} onCancel={() => resolve(null)} />,
        () => resolve(null),
      )
    })
    if (result === null) return
    withSave((list) => updateProjectFile(list, projId, file.path, result))
  }

  function FileEditorDialog(props: { file: ProjectFile; onSave: (content: string) => void; onCancel: () => void }) {
    const { theme: theme_ } = useTheme()
    const dialog_ = useDialog()
    const dimensions = useTerminalDimensions()
    let textarea: any

    function save() {
      props.onSave(textarea?.value ?? props.file.content)
      dialog_.clear()
    }

    return (
      <box flexDirection="column" gap={1}>
        <box flexDirection="row" justifyContent="space-between">
          <text fg={theme_.text} attributes={TextAttributes.BOLD}>
            {props.file.path}
          </text>
          <text fg={theme_.textMuted} onMouseUp={() => dialog_.clear()}>
            esc
          </text>
        </box>
        <textarea
          height={Math.floor(dimensions().height / 2)}
          ref={(r: any) => { textarea = r }}
          initialValue={props.file.content}
          placeholder="Contenido del archivo..."
          placeholderColor={theme_.textMuted}
          textColor={theme_.text}
          focusedTextColor={theme_.text}
          cursorColor={theme_.text}
        />
        <box flexDirection="row" gap={2}>
          <text
            fg={theme_.primary}
            attributes={TextAttributes.BOLD}
            onMouseDown={save}
          >
            ✓ Guardar
          </text>
          <text
            fg={theme_.textMuted}
            onMouseDown={() => { props.onCancel(); dialog_.clear() }}
          >
            ✕ Cancelar
          </text>
        </box>
      </box>
    )
  }

  // ── Helpers for render ────────────────────────────────────────────────

  function agentColor(color: string): string {
    return color || "#f0a030"
  }

  function agentById(proj: Project, id: string): SubAgent | undefined {
    return proj.subAgents.find((a) => a.id === id)
  }

  // ── Link dialog (two-step agent select for circuits) ──────────────────

  function LinkDialog(props: { agents: SubAgent[]; onSelect: (src: string, dst: string) => void }) {
    const dialog_ = useDialog()
    const [srcId, setSrcId] = createSignal<string | null>(null)
    const step = () => (srcId() === null ? "source" : "target")

    const opts = createMemo(() => {
      const list = srcId() === null ? props.agents : props.agents.filter((a) => a.id !== srcId())
      return list.map((a) => ({
        title: a.name || "sin nombre",
        description: a.tasks ? a.tasks.slice(0, 40) : "sin tareas",
        value: a.id,
      }))
    })

    const title = () =>
      step() === "source"
        ? "AGENTE ORIGEN — inicia el flujo"
        : `AGENTE DESTINO — recibe de ${props.agents.find((a) => a.id === srcId())?.name ?? "?"}`

    return (
      <DialogSelect<string>
        title={title()}
        options={opts()}
        onSelect={(opt) => {
          if (step() === "source") {
            setSrcId(opt.value)
          } else {
            props.onSelect(srcId()!, opt.value)
            dialog_.clear()
          }
        }}
      />
    )
  }

  // ── Cron dialog (presets + custom) ────────────────────────────────────

  function CronDialog(props_: { agent: SubAgent; onSelect: (v: string | null) => void }) {
    const { theme: theme_ } = useTheme()
    const dialog_ = useDialog()
    const [mode, setMode] = createSignal<"presets" | "custom">("presets")
    const [customVal, setCustomVal] = createSignal(props_.agent.cron || "*/5 * * * *")
    let textarea: any

    const presets = [
      { label: "Manual (solo al presionar ejecutar)", value: "" },
      { label: "Cada 5 minutos", value: "*/5 * * * *" },
      { label: "Cada 30 minutos", value: "*/30 * * * *" },
      { label: "Cada hora", value: "0 * * * *" },
      { label: "Cada día (medianoche)", value: "0 0 * * *" },
    ]

    function selectPreset(value: string) {
      props_.onSelect(value)
      dialog_.clear()
    }

    function submitCustom() {
      props_.onSelect(textarea?.value ?? customVal())
      dialog_.clear()
    }

    return (
      <Show when={mode() === "presets"} fallback={
        <box flexDirection="column" gap={1}>
          <text fg={theme_.text} attributes={TextAttributes.BOLD}>
            Expresión personalizada
          </text>
          <textarea
            height={3}
            ref={(r: any) => { textarea = r }}
            initialValue={customVal()}
            placeholder="Ej: */5 * * * * o @hourly"
            placeholderColor={theme_.textMuted}
            textColor={theme_.text}
            focusedTextColor={theme_.text}
            cursorColor={theme_.text}
          />
          <text fg={theme_.textMuted}>
            Ejemplos: */10 * * * * (cada 10min), 0 9 * * 1 (lunes 9am), @daily
          </text>
          <box flexDirection="row" gap={2}>
            <text
              fg={theme_.primary}
              attributes={TextAttributes.BOLD}
              onMouseDown={submitCustom}
            >
              ✓ Confirmar
            </text>
            <text
              fg={theme_.textMuted}
              onMouseDown={() => setMode("presets")}
            >
              ✕ Volver
            </text>
            <text
              fg={theme_.textMuted}
              flexGrow={1}
              onMouseDown={() => dialog_.clear()}
            >
              esc
            </text>
          </box>
        </box>
      }>
        <box flexDirection="column" gap={0}>
          <box paddingBottom={1}>
            <text fg={theme_.text} attributes={TextAttributes.BOLD}>
              Programar: {props_.agent.name}
            </text>
          </box>
          <For each={presets}>
            {(preset) => (
              <text
                fg={theme_.text}
                onMouseDown={() => selectPreset(preset.value)}
              >
                {preset.label}
              </text>
            )}
          </For>
          <text
            fg={theme_.primary}
            paddingTop={1}
            onMouseDown={() => setMode("custom")}
          >
            Personalizado...
          </text>
          <box flexDirection="row" paddingTop={1}>
            <text
              fg={theme_.textMuted}
              flexGrow={1}
              onMouseDown={() => dialog_.clear()}
            >
              esc
            </text>
          </box>
        </box>
      </Show>
    )
  }

  // ── Render ────────────────────────────────────────────────────────────

  return (
    <box
      backgroundColor={theme.backgroundPanel}
      width={props.width ?? 44}
      height="100%"
      paddingTop={1}
      paddingBottom={1}
      paddingLeft={1}
      paddingRight={1}
      position={props.overlay ? "absolute" : "relative"}
      onMouseDown={(e: any) => e?.stopPropagation?.()}
    >
      {/* ── Header ──────────────────────────────────────────────────── */}
      <box flexShrink={0} paddingRight={1} paddingBottom={1}>
        <box flexDirection="row" gap={1} alignItems="center">
          <text
            fg={theme.primary}
            attributes={TextAttributes.BOLD}
            onMouseUp={() => void handleNewProject()}
          >
            [+]
          </text>
          <text fg={theme.textMuted} attributes={TextAttributes.BOLD} flexGrow={1}>
            Proyectos
          </text>
          <Show when={props.onToggleMaximize}>
            <text
              fg={theme.textMuted}
              flexShrink={0}
              onMouseDown={() => props.onToggleMaximize?.()}
            >
              {props.isMaximized ? "⊟" : "□"}
            </text>
          </Show>
          <text
            fg={theme.textMuted}
            flexShrink={0}
            onMouseDown={() => props.onClose?.()}
          >
            ✕
          </text>
        </box>
      </box>

      {/* ── Scrollable list ──────────────────────────────────────────── */}
      <scrollbox
        flexGrow={1}
        scrollAcceleration={scrollAcceleration()}
        verticalScrollbarOptions={{
          trackOptions: {
            backgroundColor: theme.background,
            foregroundColor: theme.borderActive,
          },
        }}
      >
        <box flexShrink={0} gap={1} paddingRight={1}>
          <Show
            when={projects().length > 0}
            fallback={
              <text fg={theme.textMuted} paddingLeft={1}>
                Sin proyectos. Click [+] para crear uno.
              </text>
            }
          >
            <For each={projects()}>
              {(proj) => {
                const isExpanded = () => expandedProjects().has(proj.id)
                const toggleExpanded = () => {
                  setExpandedProjects((prev) => {
                    const next = new Set(prev)
                    if (next.has(proj.id)) next.delete(proj.id)
                    else next.add(proj.id)
                    return next
                  })
                }
                const isDeleting = () => toDelete()?.type === "project" && toDelete()?.id === proj.id

                return (
                  <box flexDirection="column" gap={0}>
                    {/* ── Project header ────────────────────────────── */}
                    <box
                      flexDirection="row"
                      gap={1}
                      alignItems="center"
                      paddingTop={1}
                    >
                      <text
                        fg={theme.text}
                        attributes={TextAttributes.BOLD}
                        onMouseDown={() => {
                          if (isDeleting()) {
                            void handleDeleteProject(proj)
                            setToDelete(null)
                          } else {
                            toggleExpanded()
                          }
                        }}
                        flexGrow={1}
                      >
                        {isExpanded() ? "▾" : "▸"} {proj.name}
                      </text>
                      <text
                        fg={theme.textMuted}
                        flexShrink={0}
                        onMouseDown={() => {
                          if (isDeleting()) {
                            setToDelete(null)
                          } else {
                            setToDelete({ type: "project", id: proj.id })
                          }
                        }}
                      >
                        {isDeleting() ? "✕?" : "✕"}
                      </text>
                      <text
                        fg={theme.textMuted}
                        flexShrink={0}
                        onMouseUp={() => void handleRenameProject(proj)}
                      >
                        ✎
                      </text>
                    </box>

                    {/* ── Project body (expanded) ────────────────────── */}
                    <Show when={isExpanded()}>
                      <box paddingLeft={1} flexDirection="column" gap={0}>
                        {/* Sub-agents */}
                        <For each={proj.subAgents}>
                          {(agent) => {
                            const agentExpanded = () => expandedAgents().has(agent.id)
                            const toggleAgent = () => {
                              setExpandedAgents((prev) => {
                                const next = new Set(prev)
                                if (next.has(agent.id)) next.delete(agent.id)
                                else next.add(agent.id)
                                return next
                              })
                            }
                            const agentDel = () =>
                              toDelete()?.type === "agent" && toDelete()?.id === agent.id

                            return (
                              <box flexDirection="column" gap={0}>
                                <box
                                  flexDirection="row"
                                  gap={1}
                                  alignItems="center"
                                  paddingTop={0}
                                >
                                  {/* status dot */}
                                  <text fg={agent.enabled ? theme.success : theme.textMuted}>
                                    {agent.enabled ? "●" : "○"}
                                  </text>

                                  {/* name (click to expand) */}
                                  <text
                                    fg={agentColor(agent.color)}
                                    flexGrow={1}
                                    onMouseDown={toggleAgent}
                                    wrapMode="none"
                                    truncate
                                  >
                                    {agentDel() ? "¿Eliminar?" : agent.name || "sin nombre"}
                                  </text>

                                  {/* toggle on/off */}
                                  <text
                                    fg={agent.enabled ? theme.primary : theme.textMuted}
                                    flexShrink={0}
                                    onMouseDown={() => handleToggleAgent(proj.id, agent)}
                                  >
                                    {agent.enabled ? "ON" : "OFF"}
                                  </text>

                                  {/* edit config */}
                                  <text
                                    fg={theme.textMuted}
                                    flexShrink={0}
                                    onMouseDown={toggleAgent}
                                  >
                                    {agentExpanded() ? "▴" : "▾"}
                                  </text>

                                  {/* delete */}
                                  <text
                                    fg={agentDel() ? theme.warning : theme.textMuted}
                                    flexShrink={0}
                                    onMouseDown={() => {
                                      if (agentDel()) {
                                        void handleDeleteAgent(proj.id, agent)
                                        setToDelete(null)
                                      } else {
                                        setToDelete({ type: "agent", id: agent.id })
                                      }
                                    }}
                                  >
                                    {agentDel() ? "✕?" : "✕"}
                                  </text>
                                </box>

                                {/* Agent detail (expanded) */}
                                <Show when={agentExpanded()}>
                                  <box paddingLeft={2} flexDirection="column" gap={0}>
                                    {/* Tasks */}
                                    <box flexDirection="row" gap={1}>
                                      <text fg={theme.textMuted} flexShrink={0}>
                                        tareas:
                                      </text>
                                      <text
                                        fg={theme.text}
                                        flexGrow={1}
                                        onMouseUp={() => void handleEditAgentTasks(proj.id, agent)}
                                        wrapMode="none"
                                        truncate
                                      >
                                        {agent.tasks
                                          ? agent.tasks.length > 35
                                            ? agent.tasks.slice(0, 35) + "…"
                                            : agent.tasks
                                          : "click para editar"}
                                      </text>
                                    </box>

                                    {/* Cron */}
                                    <box flexDirection="row" gap={1}>
                                      <text fg={theme.textMuted} flexShrink={0}>
                                        cron:
                                      </text>
                                      <text
                                        fg={agent.cron ? theme.info : theme.textMuted}
                                        onMouseUp={() => void handleEditAgentCron(proj.id, agent)}
                                      >
                                        {cronLabel(agent.cron)}
                                      </text>
                                    </box>

                                    {/* Run button (only for manual) */}
                                    <Show when={!agent.cron}>
                                      <box flexDirection="row" gap={1}>
                                        <text
                                          fg={theme.success}
                                          attributes={TextAttributes.BOLD}
                                          onMouseUp={() => void handleRunAgent(proj.id, agent)}
                                        >
                                          ▶ Ejecutar ahora
                                        </text>
                                        <Show when={agent.lastRun}>
                                          <text fg={theme.textMuted}>
                                            · último: {new Date(agent.lastRun!).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}
                                          </text>
                                        </Show>
                                      </box>
                                    </Show>

                                    {/* Edit name */}
                                    <text
                                      fg={theme.textMuted}
                                      onMouseUp={() => void handleEditAgentName(proj.id, agent)}
                                      attributes={TextAttributes.ITALIC}
                                    >
                                      renombrar
                                    </text>

                                    {/* Execution log */}
                                    <Show when={agent.log && agent.log.length > 0}>
                                      <box paddingTop={1} flexDirection="column" gap={0}>
                                        <text
                                          fg={theme.textMuted}
                                          attributes={TextAttributes.ITALIC}
                                          onMouseDown={() => {
                                            setExpandedLogs((prev) => {
                                              const next = new Set(prev)
                                              if (next.has(agent.id)) next.delete(agent.id)
                                              else next.add(agent.id)
                                              return next
                                            })
                                          }}
                                        >
                                          {expandedLogs().has(agent.id) ? "▾" : "▸"} historial ({agent.log?.length ?? 0})
                                        </text>
                                        <Show when={expandedLogs().has(agent.id)}>
                                          <For each={[...(agent.log ?? [])].reverse()}>
                                            {(entry, idx) => {
                                              const entryKey = `${entry.timestamp}_${idx()}`
                                              const isExpanded = () => expandedEntries().has(entryKey)
                                              return (
                                                <box flexDirection="column" gap={0}>
                                                  <box
                                                    flexDirection="row"
                                                    gap={1}
                                                    onMouseDown={() => {
                                                      if (!entry.detail) return
                                                      setExpandedEntries((prev) => {
                                                        const next = new Set(prev)
                                                        if (next.has(entryKey)) next.delete(entryKey)
                                                        else next.add(entryKey)
                                                        return next
                                                      })
                                                    }}
                                                  >
                                                    <text
                                                      fg={entry.level === "error" ? theme.error : entry.level === "result" ? theme.success : theme.textMuted}
                                                      flexShrink={0}
                                                    >
                                                      {entry.detail ? (isExpanded() ? "▾" : "▸") : " "}
                                                    </text>
                                                    <text fg={theme.textMuted} flexShrink={0}>
                                                      {new Date(entry.timestamp).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                                                    </text>
                                                    <text
                                                      fg={entry.level === "error" ? theme.error : entry.level === "result" ? theme.success : theme.text}
                                                      wrapMode="none"
                                                      truncate
                                                    >
                                                      {entry.message}
                                                    </text>
                                                  </box>
                                                  <Show when={isExpanded() && entry.detail}>
                                                    <box paddingLeft={2} flexDirection="column" gap={0}>
                                                      {entry.detail!.split("\n").map((line) => (
                                                        <text
                                                          fg={theme.text}
                                                          wrapMode="none"
                                                          truncate
                                                        >
                                                          {" "}{line}
                                                        </text>
                                                      ))}
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
                                </Show>
                              </box>
                            )
                          }}
                        </For>

                        {/* New Agent button */}
                        <text
                          fg={theme.primary}
                          paddingTop={1}
                          onMouseUp={() => void handleNewAgent(proj.id, proj.subAgents.length)}
                        >
                          [+ nuevo agente]
                        </text>

                        {/* ── Files ────────────────────────────────────── */}
                        <Show when={proj.files.length > 0}>
                          <box height={1} />
                          <text fg={theme.textMuted} attributes={TextAttributes.BOLD}>
                            ══ Archivos ══
                          </text>
                          <For each={proj.files}>
                            {(file) => (
                              <box flexDirection="row" gap={1}>
                                <text fg={theme.textMuted}>•</text>
                                <text
                                  fg={theme.text}
                                  onMouseUp={() => void handleOpenFile(proj.id, file)}
                                  wrapMode="none"
                                  truncate
                                >
                                  {file.path}
                                </text>
                              </box>
                            )}
                          </For>
                        </Show>

                        {/* ── Circuits ────────────────────────────────── */}
                        <Show when={proj.circuits.length > 0 || proj.subAgents.length >= 2}>
                          <box height={1} />
                          <text fg={theme.textMuted} attributes={TextAttributes.BOLD}>
                            ══ Circuitos ══
                          </text>
                          <Show when={proj.circuits.length === 0 && proj.subAgents.length >= 2}>
                            <text fg={theme.textMuted} paddingLeft={1}>
                              Los circuitos conectan agentes en secuencia. El output de cada uno alimenta al siguiente. Creá uno abajo.
                            </text>
                          </Show>

                          <For each={proj.circuits}>
                            {(circuit) => {
                              const circExpanded = () => expandedCircuits().has(circuit.id)
                              const toggleCircuit = () => {
                                setExpandedCircuits((prev) => {
                                  const next = new Set(prev)
                                  if (next.has(circuit.id)) next.delete(circuit.id)
                                  else next.add(circuit.id)
                                  return next
                                })
                              }

                              const runningNodes = () => circuitRunningNodes()
                              const isCircuitRunning = () => runningNodes().size > 0

                              return (
                                <box flexDirection="column" gap={0}>
                                  <box flexDirection="row" gap={1}>
                                    <text
                                      fg={theme.accent}
                                      onMouseDown={toggleCircuit}
                                      flexGrow={1}
                                    >
                                      {circExpanded() ? "▾" : "▸"} {circuit.name || "sin nombre"}
                                    </text>
                                    <Show when={(circuit as any).mode === "evaluator"}>
                                      <text fg={theme.info} flexShrink={0} attributes={TextAttributes.ITALIC}>
                                        ↻ev
                                      </text>
                                    </Show>
                                    <Show when={(circuit as any).mode === "supervisor"}>
                                      <text fg={theme.warning} flexShrink={0} attributes={TextAttributes.ITALIC}>
                                        ◈sv
                                      </text>
                                    </Show>
                                    <Show when={!isCircuitRunning()}>
                                      <text
                                        fg={theme.success}
                                        attributes={TextAttributes.BOLD}
                                        flexShrink={0}
                                        onMouseUp={() => void handleRunCircuit(proj.id, circuit)}
                                      >
                                        ▶ run
                                      </text>
                                    </Show>
                                    <Show when={isCircuitRunning()}>
                                      <text fg={theme.warning} flexShrink={0}>
                                        ◉
                                      </text>
                                    </Show>
                                    <text
                                      fg={theme.primary}
                                      flexShrink={0}
                                      onMouseUp={() =>
                                        void handleAddConnection(proj.id, circuit.id, proj.subAgents)
                                      }
                                    >
                                      +link
                                    </text>
                                    <text
                                      fg={theme.textMuted}
                                      flexShrink={0}
                                      onMouseUp={() => void handleEditCircuitMode(proj.id, circuit)}
                                    >
                                      ⚙
                                    </text>
                                  </box>

                                  <Show when={circExpanded()}>
                                    <Show
                                      when={circuit.connections.length > 0}
                                      fallback={
                                        <text fg={theme.textMuted} paddingLeft={1}>
                                          Sin conexiones. Click [+link] para crear.
                                        </text>
                                      }
                                    >
                                      <box paddingLeft={1} flexDirection="column" gap={0}>
                                          <For each={circuit.connections}>
                                            {(conn, idx) => {
                                              const src = agentById(proj, conn.from)
                                              const dst = agentById(proj, conn.to)
                                              const srcStatus = () => runningNodes().get(conn.from)
                                              const dstStatus = () => runningNodes().get(conn.to)
                                              const statusColor = (s?: string) =>
                                                s === "running" ? theme.warning
                                                  : s === "completed" ? theme.success
                                                  : s === "failed" ? theme.error
                                                  : theme.textMuted
                                              const statusIcon = (s?: string) =>
                                                s === "running" ? "◉"
                                                  : s === "completed" ? "✓"
                                                  : s === "failed" ? "✗"
                                                  : "●"
                                              return (
                                                <box flexDirection="row" gap={1}>
                                                  <text fg={statusColor(srcStatus())} flexShrink={0}>
                                                    {statusIcon(srcStatus())}
                                                  </text>
                                                  <text fg={statusColor(srcStatus())} wrapMode="none" truncate>
                                                    {src?.name ?? "?"}
                                                  </text>
                                                  <text fg={theme.accent}>→</text>
                                                  <Show when={conn.condition}>
                                                    <text fg={theme.warning} flexShrink={0}>
                                                      ?
                                                    </text>
                                                  </Show>
                                                  <text fg={statusColor(dstStatus())} flexShrink={0}>
                                                    {statusIcon(dstStatus())}
                                                  </text>
                                                  <text fg={statusColor(dstStatus())} flexGrow={1} wrapMode="none" truncate>
                                                    {dst?.name ?? "?"}
                                                  </text>
                                                  <Show when={!isCircuitRunning()}>
                                                    <text
                                                      fg={theme.textMuted}
                                                      flexShrink={0}
                                                      onMouseDown={() => {
                                                        withSave((list) =>
                                                          removeConnection(list, proj.id, circuit.id, idx()),
                                                        )
                                                      }}
                                                    >
                                                      ✕
                                                    </text>
                                                  </Show>
                                                </box>
                                              )
                                            }}
                                          </For>
                                      </box>
                                    </Show>

                                      {/* Cron info */}
                                      <box paddingLeft={1} flexDirection="row" gap={1}>
                                        <text fg={theme.textMuted} flexShrink={0}>
                                          cron:
                                        </text>
                                        <text
                                          fg={circuit.cron ? theme.info : theme.textMuted}
                                          onMouseUp={() => void handleEditCircuitCron(proj.id, circuit)}
                                        >
                                          {cronLabel(circuit.cron ?? "")}
                                        </text>
                                      </box>

                                      {/* Plan preview */}
                                      <box paddingLeft={1} flexDirection="row" gap={1}>
                                        <text fg={theme.textMuted}>
                                          {(() => {
                                            const plan = circuitEngine.plan(circuit, proj.subAgents)
                                            const modeLabel = plan.mode === "supervisor" ? ` (sv: ${plan.supervisor})` : ""
                                            return `${plan.nodeCount} agentes, ${plan.levels.length} niveles${modeLabel}`
                                          })()}
                                        </text>
                                      </box>
                                  </Show>
                                </box>
                              )
                            }}
                          </For>

                          {/* New Circuit button */}
                          <text
                            fg={theme.primary}
                            onMouseUp={() => void handleNewCircuit(proj.id)}
                          >
                            [+ nuevo circuito]
                          </text>
                        </Show>
                      </box>
                    </Show>
                  </box>
                )
              }}
            </For>
          </Show>
        </box>
      </scrollbox>

      {/* ── Footer ─────────────────────────────────────────────────────── */}
      <box flexShrink={0} gap={1} paddingTop={1}>
        <text fg={theme.textMuted}>
          <span style={{ fg: theme.success }}>●</span>{" "}
          <span>{projects().length} proyectos</span>
          <Show when={projects().length > 0}>
            {" · "}
            <span>
              {projects().reduce((sum, p) => sum + p.subAgents.length, 0)} agentes
            </span>
          </Show>
        </text>
      </box>
    </box>
  )
}


