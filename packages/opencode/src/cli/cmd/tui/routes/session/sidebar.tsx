import { useProject } from "@tui/context/project"
import { useSync } from "@tui/context/sync"
import { createMemo, createResource, createSignal, For, onCleanup, onMount, Show } from "solid-js"
import { useTheme } from "../../context/theme"
import { useTuiConfig } from "../../context/tui-config"
import { TextAttributes } from "@opentui/core"
import { InstallationVersion } from "@opencode-ai/core/installation/version"
import { useRoute } from "@tui/context/route"
import { relativeTime } from "../../feature-plugins/session/util"
import { useSDK } from "@tui/context/sdk"
import { errorMessage } from "@/util/error"
import { useToast } from "../../ui/toast"

import { getScrollAcceleration } from "../../util/scroll"
import { WorkspaceLabel } from "../../component/workspace-label"
import { loadPersonality, getAllSkills } from "@tui/util/facet-skills"

export function Sidebar(props: { sessionID: string; overlay?: boolean; onClose?: () => void; onImproveSkill?: (skill: string) => void }) {
  const project = useProject()
  const sync = useSync()
  const { theme } = useTheme()
  const tuiConfig = useTuiConfig()
  const { navigate } = useRoute()
  const sdk = useSDK()
  const toast = useToast()
  const session = createMemo(() => sync.session.get(props.sessionID))
  const [toDelete, setToDelete] = createSignal<string | null>(null)
  const workspace = () => {
    const workspaceID = session()?.workspaceID
    if (!workspaceID) return
    return project.workspace.get(workspaceID)
  }
  const scrollAcceleration = createMemo(() => getScrollAcceleration(tuiConfig))

  const currentMessages = createMemo(() => sync.data.message[props.sessionID]?.length ?? 0)
  const currentSummary = createMemo(() => session()?.summary)

  const allSessions = createMemo(() =>
    sync.data.session
      .filter((s) => s.id !== props.sessionID)
      .toSorted((a, b) => b.time.updated - a.time.updated),
  )

  const groups = createMemo(() => {
    const today = new Date()
    const todayStr = today.toDateString()
    const yesterday = new Date(today.getTime() - 86400000).toDateString()
    const groups: { label: string; sessions: typeof sync.data.session }[] = []

    const todayGroup: typeof sync.data.session = []
    const yesterdayGroup: typeof sync.data.session = []
    const olderGroup: typeof sync.data.session = []

    for (const s of allSessions()) {
      const dateStr = new Date(s.time.updated).toDateString()
      if (dateStr === todayStr) todayGroup.push(s)
      else if (dateStr === yesterday) yesterdayGroup.push(s)
      else olderGroup.push(s)
    }

    if (todayGroup.length) groups.push({ label: "Hoy", sessions: todayGroup })
    if (yesterdayGroup.length) groups.push({ label: "Ayer", sessions: yesterdayGroup })
    if (olderGroup.length) groups.push({ label: "Anterior", sessions: olderGroup })

    return groups
  })

  // Personalidad con auto-refresh cada 2s (detecta cambios en el prompt al instante)
  const [personality, setPersonality] = createSignal<Awaited<ReturnType<typeof loadPersonality>> | undefined>(undefined)
  const [expandedTraits, setExpandedTraits] = createSignal<Set<string>>(new Set())
  const toggleTrait = (label: string) => {
    setExpandedTraits((prev) => {
      const next = new Set(prev)
      if (next.has(label)) next.delete(label)
      else next.add(label)
      return next
    })
  }
  const getDir = () => {
    try {
      // Intentar acceso tipo home (instance.path().directory)
      return (project as any).instance.path().directory
    } catch {
      try {
        // Intentar acceso tipo sidebar (data.instance.path.directory)
        return (project as any).data.instance.path.directory
      } catch {
        return undefined
      }
    }
  }
  onMount(() => {
    const dir = getDir()
    loadPersonality(dir).then(setPersonality)
    const id = setInterval(() => {
      loadPersonality(getDir()).then(setPersonality)
    }, 2000)
    onCleanup(() => clearInterval(id))
  })

  const [skills] = createResource(async () => {
    const result = await sdk.client.app.skills()
    return result.data ?? []
  })

  const allSkills = createMemo(() => getAllSkills(skills() ?? []))

  async function deleteSession(id: string) {
    try {
      const result = await sdk.client.session.delete({ sessionID: id })
      if (result.error) {
        toast.show({ variant: "error", title: "Error al eliminar sesión", message: errorMessage(result.error) })
        return
      }
      await sync.session.refresh()
      setToDelete(null)
    } catch (err) {
      toast.show({ variant: "error", title: "Error al eliminar sesión", message: errorMessage(err) })
    }
  }

  return (
    <Show when={session()}>
      <box
        backgroundColor={theme.backgroundPanel}
        width={42}
        height="100%"
        paddingTop={1}
        paddingBottom={1}
        paddingLeft={2}
        paddingRight={2}
        position={props.overlay ? "absolute" : "relative"}
      >
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
            {/* Header: close + session title */}
            <box paddingRight={1} flexDirection="row" gap={1} alignItems="center">
              <text
                fg={theme.textMuted}
                flexShrink={0}
                onMouseDown={() => props.onClose?.()}
              >
                ✕
              </text>
              <text fg={theme.text} wrapMode="none" truncate>
                <b>{session()!.title}</b>
              </text>
              <Show when={session()!.workspaceID}>
                <text fg={theme.textMuted} flexShrink={0}>
                  <Show
                    when={workspace()}
                    fallback={<WorkspaceLabel type="unknown" name={session()!.workspaceID!} status="error" icon />}
                  >
                    {(item) => (
                      <WorkspaceLabel
                        type={item().type}
                        name={item().name}
                        status={project.workspace.status(item().id) ?? "error"}
                        icon
                      />
                    )}
                  </Show>
                </text>
              </Show>
            </box>

            {/* Pulse: current session metrics */}
            <box flexDirection="row" gap={2} paddingTop={1}>
              <text fg={theme.textMuted}>
                <span style={{ fg: theme.text }}>{currentMessages()}</span> msgs
              </text>
              <Show when={currentSummary()?.files}>
                <text fg={theme.textMuted}>
                  <span style={{ fg: currentSummary()!.additions! > 0 || currentSummary()!.deletions! > 0 ? theme.success : theme.textMuted }}>
                    {currentSummary()!.files}
                  </span>{" "}
                  files
                </text>
              </Show>
              <Show when={currentSummary() && (currentSummary()!.additions! > 0 || currentSummary()!.deletions! > 0)}>
                <text fg={theme.text}>
                  <span style={{ fg: theme.success }}>+{currentSummary()!.additions}</span>
                  <span style={{ fg: theme.warning }}> -{currentSummary()!.deletions}</span>
                </text>
              </Show>
            </box>

            {/* LSP pulse */}
            <box flexDirection="row" gap={2}>
              <Show when={sync.data.lsp.length > 0}>
                <text fg={theme.textMuted}>
                  <span style={{ fg: theme.success }}>•</span> {sync.data.lsp.length} LSP
                </text>
              </Show>
              <Show when={Object.keys(sync.data.mcp).length > 0}>
                <text fg={theme.textMuted}>
                  <span style={{ fg: theme.success }}>⊙</span>{" "}
                  {Object.values(sync.data.mcp).filter((x: any) => x.status === "connected").length} MCP
                </text>
              </Show>
            </box>

            {/* Personalidad — desde el system prompt */}
            <box flexDirection="column" gap={1} paddingTop={1}>
              <text fg={theme.textMuted} attributes={TextAttributes.BOLD}>
                Personalidad
              </text>
              <Show when={personality() && personality()!.length > 0} fallback={
                <text fg={theme.textMuted} paddingLeft={1}>Cargando...</text>
              }>
                <For each={personality()!}>
                  {(trait) => {
                    const expanded = () => expandedTraits().has(trait.label)
                    const barLen = Math.round(trait.value * 6)
                    const bar = "\u2593".repeat(barLen) + "\u2591".repeat(6 - barLen)
                    return (
                      <box flexDirection="column" gap={0}>
                        <box
                          paddingLeft={1}
                          flexDirection="row" gap={1}
                          onMouseDown={() => toggleTrait(trait.label)}
                        >
                          <text fg={(theme as any)[trait.color] ?? theme.text}>
                            {trait.label}
                          </text>
                          <text fg={theme.textMuted}>{bar}</text>
                          <text fg={theme.textMuted}>
                            {Math.round(trait.value * 100)}%
                          </text>
                          <Show when={trait.sources.length > 0}>
                            <text fg={theme.textMuted}>{expanded() ? "▾" : "▸"}</text>
                          </Show>
                        </box>
                        <Show when={expanded() && trait.sources.length > 0}>
                          <box paddingLeft={3} flexDirection="column" gap={0}>
                            <For each={trait.sources}>
                              {(src) => (
                                <box flexDirection="column" gap={0}>
                                  <text fg={theme.textMuted} attributes={TextAttributes.ITALIC}>
                                    ─ {src.section} ─
                                  </text>
                                  <For each={src.lines}>
                                    {(line) => (
                                      <text fg={theme.textMuted} wrapMode="none" truncate>
                                        {line}
                                      </text>
                                    )}
                                  </For>
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

            <box height={1} />

            {/* Caja de Herramientas */}
            <box flexDirection="column" gap={1}>
              <text fg={theme.textMuted} attributes={TextAttributes.BOLD}>
                Caja de Herramientas ({allSkills().length})
              </text>
              <box paddingLeft={1} flexDirection="column" gap={0}>
                <For each={allSkills()}>
                  {(skill) => (
                    <text fg={theme.textMuted} wrapMode="none" truncate>
                      · {skill.name}
                    </text>
                  )}
                </For>
              </box>
            </box>

            <box height={1} />

            {/* Session history */}
            <For each={groups()}>
              {(group) => (
                <box flexDirection="column" gap={1}>
                  <text fg={theme.textMuted} attributes={TextAttributes.BOLD}>
                    {group.label}
                  </text>
                  <For each={group.sessions}>
                    {(s) => {
                      const deleting = createMemo(() => toDelete() === s.id)
                      const sessionSummary = s.summary
                      return (
                        <box
                          flexDirection="row"
                          justifyContent="space-between"
                          gap={1}
                        >
                          <box
                            flexGrow={1}
                            flexDirection="column"
                            gap={0}
                            onMouseDown={() => {
                              if (deleting()) {
                                void deleteSession(s.id)
                              } else {
                                navigate({ type: "session", sessionID: s.id })
                              }
                            }}
                          >
                            <text fg={deleting() ? theme.warning : theme.text} wrapMode="none" truncate>
                              {deleting() ? `¿Eliminar ${s.title}?` : s.title}
                            </text>
                            <Show when={sessionSummary?.files}>
                              <text fg={theme.textMuted} wrapMode="none" truncate>
                                {sessionSummary!.files} arch
                                {sessionSummary!.additions ? <span style={{ fg: theme.success }}> +{sessionSummary!.additions}</span> : null}
                                {sessionSummary!.deletions ? <span style={{ fg: theme.warning }}> -{sessionSummary!.deletions}</span> : null}
                              </text>
                            </Show>
                          </box>
                          <text
                            fg={deleting() ? theme.warning : theme.textMuted}
                            flexShrink={0}
                            onMouseDown={() => {
                              if (deleting()) {
                                setToDelete(null)
                              } else {
                                setToDelete(s.id)
                              }
                            }}
                          >
                            {deleting() ? "✕" : relativeTime(s.time.updated)}
                          </text>
                        </box>
                      )
                    }}
                  </For>
                  <box height={1} />
                </box>
              )}
            </For>
          </box>
        </scrollbox>

        <box flexShrink={0} gap={1} paddingTop={1}>
          <text fg={theme.textMuted}>
            <span style={{ fg: theme.success }}>•</span>
            {" "}
            <span>{InstallationVersion}</span>
          </text>
        </box>
      </box>
    </Show>
  )
}
