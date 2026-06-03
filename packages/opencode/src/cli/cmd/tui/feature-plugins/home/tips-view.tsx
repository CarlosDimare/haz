import type { TuiPluginApi } from "@opencode-ai/plugin/tui"
import { createMemo, For, type Accessor } from "solid-js"
import { DEFAULT_THEMES, useTheme } from "@tui/context/theme"
import { useCommandShortcut } from "../../keymap"

const themeCount = Object.keys(DEFAULT_THEMES).length

type TipPart = { text: string; highlight: boolean }
type TipShortcut = Accessor<string>
type Shortcuts = {
  agentCycle: TipShortcut
  childFirst: TipShortcut
  childNext: TipShortcut
  childPrevious: TipShortcut
  commandList: TipShortcut
  editorOpen: TipShortcut
  helpShow: TipShortcut
  inputClear: TipShortcut
  inputNewline: TipShortcut
  inputPaste: TipShortcut
  inputUndo: TipShortcut
  leader: TipShortcut
  messagesCopy: TipShortcut
  messagesFirst: TipShortcut
  messagesLast: TipShortcut
  messagesPageDown: TipShortcut
  messagesPageUp: TipShortcut
  messagesToggleConceal: TipShortcut
  modelCycleRecent: TipShortcut
  modelList: TipShortcut
  sessionExport: TipShortcut
  sessionInterrupt: TipShortcut
  sessionList: TipShortcut
  sessionNew: TipShortcut
  sessionParent: TipShortcut
  sessionPinToggle: TipShortcut
  sessionQuickSwitch1: TipShortcut
  sessionQuickSwitch9: TipShortcut
  sessionSidebarToggle: TipShortcut
  sessionTimeline: TipShortcut
  statusView: TipShortcut
  terminalSuspend: TipShortcut
  themeList: TipShortcut
}
type Tip = string | ((shortcuts: Shortcuts) => string | undefined)

function parse(tip: string): TipPart[] {
  const parts: TipPart[] = []
  const regex = /\{highlight\}(.*?)\{\/highlight\}/g
  const found = Array.from(tip.matchAll(regex))
  const state = found.reduce(
    (acc, match) => {
      const start = match.index ?? 0
      if (start > acc.index) {
        acc.parts.push({ text: tip.slice(acc.index, start), highlight: false })
      }
      acc.parts.push({ text: match[1], highlight: true })
      acc.index = start + match[0].length
      return acc
    },
    { parts, index: 0 },
  )

  if (state.index < tip.length) {
    parts.push({ text: tip.slice(state.index), highlight: false })
  }

  return parts
}

const NO_MODELS_TIP = "Ejecutá {highlight}/connect{/highlight} para agregar un proveedor de IA y empezar a codificar"
const NO_MODELS_PARTS = parse(NO_MODELS_TIP)

function shortcutText(value: string) {
  return `{highlight}${value}{/highlight}`
}

function commandText(command: string, shortcut: string) {
  if (!shortcut) return shortcutText(command)
  return `${shortcutText(command)} or ${shortcutText(shortcut)}`
}

function press(shortcut: string, text: string) {
  if (!shortcut) return undefined
  return `Presioná ${shortcutText(shortcut)} ${text}`
}

function configShortcut(api: TuiPluginApi, command: string): TipShortcut {
  return () =>
    api.tuiConfig.keybinds
      .get(command)
      .map((binding) => api.keys.formatSequence(Array.from(api.keymap.parseKeySequence(binding.key))))
      .filter(Boolean)
      .join(", ")
}

export function Tips(props: { api: TuiPluginApi; connected?: boolean }) {
  const theme = useTheme().theme
  const tipOffset = Math.random()
  const shortcuts: Shortcuts = {
    agentCycle: useCommandShortcut("agent.cycle"),
    childFirst: configShortcut(props.api, "session.child.first"),
    childNext: configShortcut(props.api, "session.child.next"),
    childPrevious: configShortcut(props.api, "session.child.previous"),
    commandList: useCommandShortcut("command.palette.show"),
    editorOpen: useCommandShortcut("prompt.editor"),
    helpShow: useCommandShortcut("help.show"),
    inputClear: useCommandShortcut("prompt.clear"),
    inputNewline: useCommandShortcut("input.newline"),
    inputPaste: useCommandShortcut("prompt.paste"),
    inputUndo: useCommandShortcut("input.undo"),
    leader: configShortcut(props.api, "leader"),
    messagesCopy: configShortcut(props.api, "messages.copy"),
    messagesFirst: configShortcut(props.api, "session.first"),
    messagesLast: configShortcut(props.api, "session.last"),
    messagesPageDown: configShortcut(props.api, "session.page.down"),
    messagesPageUp: configShortcut(props.api, "session.page.up"),
    messagesToggleConceal: configShortcut(props.api, "session.toggle.conceal"),
    modelCycleRecent: useCommandShortcut("model.cycle_recent"),
    modelList: useCommandShortcut("model.list"),
    sessionExport: configShortcut(props.api, "session.export"),
    sessionInterrupt: configShortcut(props.api, "session.interrupt"),
    sessionList: useCommandShortcut("session.list"),
    sessionNew: useCommandShortcut("session.new"),
    sessionParent: configShortcut(props.api, "session.parent"),
    sessionPinToggle: configShortcut(props.api, "session.pin.toggle"),
    sessionQuickSwitch1: useCommandShortcut("session.quick_switch.1"),
    sessionQuickSwitch9: useCommandShortcut("session.quick_switch.9"),
    sessionSidebarToggle: configShortcut(props.api, "session.sidebar.toggle"),
    sessionTimeline: configShortcut(props.api, "session.timeline"),
    statusView: useCommandShortcut("opencode.status"),
    terminalSuspend: useCommandShortcut("terminal.suspend"),
    themeList: useCommandShortcut("theme.switch"),
  }
  const tip = createMemo(() => {
    if (props.connected === false) return NO_MODELS_TIP
    const tips = TIPS.flatMap((item) => {
      const value = typeof item === "string" ? item : item(shortcuts)
      return value ? [value] : []
    })
    return tips[Math.floor(tipOffset * tips.length)] ?? NO_MODELS_TIP
  }, NO_MODELS_TIP)
  // Solid can expose a memo's initial value while a pure computation is pending.
  const parts = createMemo(() => {
    const value = tip()
    if (typeof value === "string") return parse(value)
    return NO_MODELS_PARTS
  }, NO_MODELS_PARTS)

  return (
    <box flexDirection="row" maxWidth="100%">
      <text flexShrink={0} style={{ fg: theme.warning }}>
        ● Consejo{" "}
      </text>
      <text flexShrink={1} wrapMode="word">
        <For each={parts()}>
          {(part) => <span style={{ fg: part.highlight ? theme.text : theme.textMuted }}>{part.text}</span>}
        </For>
      </text>
    </box>
  )
}

const TIPS: Tip[] = [
    "Escribí {highlight}@{/highlight} seguido de un nombre de archivo para buscar y adjuntar archivos",
  "Iniciá un mensaje con {highlight}!{/highlight} para ejecutar comandos de shell directamente (ej: {highlight}!ls -la{/highlight})",
  (shortcuts) => press(shortcuts.agentCycle(), "para alternar entre agentes"),
  "Usá {highlight}/undo{/highlight} para revertir el último mensaje y cambios de archivos",
  "Usá {highlight}/redo{/highlight} para restaurar mensajes y cambios de archivos previamente deshechos",
  "Ejecutá {highlight}/share{/highlight} para crear un enlace público a tu conversación en ojito.ai",
  "Arrastrá imágenes o PDFs al terminal para agregarlos como contexto",
  (shortcuts) => press(shortcuts.inputPaste(), "para pegar imágenes desde tu portapapeles al prompt"),
  (shortcuts) => `Usá ${commandText("/editor", shortcuts.editorOpen())} para redactar mensajes en tu editor externo`,
  "Ejecutá {highlight}/init{/highlight} para generar reglas de proyecto automáticas basadas en tu código",
  (shortcuts) => `Usá ${commandText("/models", shortcuts.modelList())} para ver y cambiar entre modelos de IA disponibles`,
  (shortcuts) => `Usá ${commandText("/themes", shortcuts.themeList())} para cambiar entre ${themeCount} temas incorporados`,
  (shortcuts) => `Usá ${commandText("/new", shortcuts.sessionNew())} para iniciar una sesión de conversación nueva`,
  (shortcuts) => `Usá ${commandText("/sessions", shortcuts.sessionList())} para listar, fijar y continuar sesiones`,
  (shortcuts) => press(shortcuts.sessionPinToggle(), "en la lista de sesiones para fijar una sesión al inicio"),
  (shortcuts) =>
    shortcuts.sessionQuickSwitch1() && shortcuts.sessionQuickSwitch9()
      ? `Las sesiones fijadas tienen slots rápidos; usá ${shortcutText(shortcuts.sessionQuickSwitch1())} a ${shortcutText(shortcuts.sessionQuickSwitch9())} para cambiar`
      : undefined,
  "Ejecutá {highlight}/compact{/highlight} para resumir sesiones largas cerca del límite de contexto",
  (shortcuts) => `Usá ${commandText("/export", shortcuts.sessionExport())} para guardar la conversación como Markdown`,
  (shortcuts) => press(shortcuts.messagesCopy(), "para copiar el último mensaje del asistente al portapapeles"),
  (shortcuts) => press(shortcuts.commandList(), "para ver todas las acciones y comandos disponibles"),
  "Ejecutá {highlight}/connect{/highlight} para agregar API keys de 75+ proveedores de LLM",
  (shortcuts) => `La tecla líder es ${shortcutText(shortcuts.leader())}; combinala con otras teclas para acciones rápidas`,
  (shortcuts) => press(shortcuts.modelCycleRecent(), "para cambiar rápidamente entre modelos usados recientemente"),
  (shortcuts) => press(shortcuts.sessionSidebarToggle(), "en una sesión para mostrar u ocultar el panel lateral"),
  (shortcuts) =>
    shortcuts.messagesPageUp() && shortcuts.messagesPageDown()
      ? `Usá ${shortcutText(shortcuts.messagesPageUp())}/${shortcutText(shortcuts.messagesPageDown())} para navegar por el historial de la conversación`
      : undefined,
  (shortcuts) => press(shortcuts.messagesFirst(), "para ir al inicio de la conversación"),
  (shortcuts) => press(shortcuts.messagesLast(), "para ir al mensaje más reciente"),
  (shortcuts) => press(shortcuts.inputNewline(), "para agregar saltos de línea en tu consulta"),
  (shortcuts) => press(shortcuts.inputClear(), "mientras escribís para limpiar el campo de entrada"),
  (shortcuts) => press(shortcuts.sessionInterrupt(), "para detener la respuesta de la IA a medio camino"),
  "Cambiá al agente {highlight}Plan{/highlight} para obtener sugerencias sin hacer cambios reales",
  "Usá {highlight}@nombre-agente{/highlight} en las consultas para invocar subagentes especializados",
  (shortcuts) => {
    const items = [
      shortcuts.sessionParent(),
      shortcuts.childFirst(),
      shortcuts.childPrevious(),
      shortcuts.childNext(),
    ].filter(Boolean)
    if (!items.length) return undefined
    return `Usá ${items.map(shortcutText).join(" / ")} para moverte entre sesiones padre e hijas`
  },
  "Creá {highlight}ojito.json{/highlight} para configuración del servidor y {highlight}tui.json{/highlight} para configuración TUI",
  "Poné la configuración TUI en {highlight}~/.config/ojito/tui.json{/highlight} para config global",
  "Agregá {highlight}$schema{/highlight} a tu config para autocompletado en tu editor",
  "Configurá {highlight}model{/highlight} en la config para establecer tu modelo por defecto",
  "Anulá cualquier atajo en {highlight}tui.json{/highlight} mediante la sección {highlight}keybinds{/highlight}",
  "Poné cualquier atajo en {highlight}none{/highlight} para deshabilitarlo completamente",
  "Configurá servidores MCP locales o remotos en la sección {highlight}mcp{/highlight} de la config",
  "Agregá archivos {highlight}.md{/highlight} a {highlight}.opencode/commands/{/highlight} para definir comandos personalizados reutilizables",
  "Usá {highlight}$ARGUMENTS{/highlight}, {highlight}$1{/highlight}, {highlight}$2{/highlight} en comandos personalizados para entrada dinámica",
  "Usá backticks en comandos para inyectar salida del shell (ej: {highlight}`git status`{/highlight})",
  "Agregá archivos {highlight}.md{/highlight} a {highlight}.opencode/agents/{/highlight} para personas de IA especializadas",
  "Configurá permisos por agente para herramientas {highlight}edit{/highlight}, {highlight}bash{/highlight} y {highlight}webfetch{/highlight}",
  'Usá patrones como {highlight}"git *": "allow"{/highlight} para permisos granulares de bash',
  'Poné {highlight}"rm -rf *": "deny"{/highlight} para bloquear comandos destructivos',
  'Configurá {highlight}"git push": "ask"{/highlight} para requerir aprobación antes de enviar',
  'Poné {highlight}"formatter": true{/highlight} en la config para habilitar formateadores como prettier, gofmt y ruff',
  'Poné {highlight}"formatter": false{/highlight} en la config para deshabilitar formateadores habilitados por otra capa',
  "Definí comandos de formateo personalizados con extensiones de archivo en la config",
  'Poné {highlight}"lsp": true{/highlight} en la config para habilitar servidores LSP incorporados para análisis de código',
  "Creá archivos {highlight}.ts{/highlight} en {highlight}.opencode/tools/{/highlight} para definir nuevas herramientas LLM",
  "Las definiciones de herramientas pueden invocar scripts escritos en Python, Go, etc",
  "Agregá archivos {highlight}.ts{/highlight} a {highlight}.opencode/plugins/{/highlight} para hooks de eventos",
  "Usá plugins para enviar notificaciones del SO cuando las sesiones se completen",
  "Creá un plugin para evitar que ojito lea archivos sensibles",
  "Usá {highlight}ojito run{/highlight} para scripting no interactivo",
  "Usá {highlight}ojito --continue{/highlight} para reanudar la última sesión",
  "Usá {highlight}ojito run -f archivo.ts{/highlight} para adjuntar archivos via CLI",
  "Usá {highlight}--format json{/highlight} para salida legible por máquina en scripts",
  "Ejecutá {highlight}ojito serve{/highlight} para acceso API sin interfaz a ojito",
  "Usá {highlight}ojito run --attach{/highlight} para conectar a un servidor en ejecución",
  "Ejecutá {highlight}ojito upgrade{/highlight} para actualizar a la última versión",
  "Ejecutá {highlight}ojito auth list{/highlight} para ver todos los proveedores configurados",
  "Ejecutá {highlight}ojito agent create{/highlight} para creación guiada de agentes",
  "Usá {highlight}/ojito{/highlight} en issues/PRs de GitHub para activar acciones de IA",
  "Ejecutá {highlight}ojito github install{/highlight} para configurar el workflow de GitHub",
  "Comentá {highlight}/ojito fix this{/highlight} en issues para auto-crear PRs",
  "Comentá {highlight}/oc{/highlight} en líneas de código de PRs para revisiones específicas",
  'Usá {highlight}"theme": "system"{/highlight} para coincidir con los colores de tu terminal',
  "Creá archivos de tema JSON en el directorio {highlight}.opencode/themes/{/highlight}",
  "Los temas soportan variantes oscura/clara para ambos modos",
  "Usá códigos de color xterm numéricos 0-255 en temas JSON personalizados",
  "Usá la sintaxis {highlight}{env:VAR_NAME}{/highlight} para referenciar variables de entorno en la config",
  "Usá {highlight}{file:path}{/highlight} para incluir contenidos de archivos en valores de config",
  "Usá {highlight}instructions{/highlight} en la config para cargar archivos de reglas adicionales",
  "Configurá la {highlight}temperature{/highlight} del agente de 0.0 (enfocado) a 1.0 (creativo)",
  "Configurá {highlight}steps{/highlight} para limitar iteraciones agénticas por solicitud",
  'Poné {highlight}"tools": {"bash": false}{/highlight} para deshabilitar herramientas específicas',
  'Poné {highlight}"mcp_*": false{/highlight} para deshabilitar todas las herramientas de un servidor MCP',
  "Anulá configuraciones globales de herramientas por agente",
  'Poné {highlight}"share": "auto"{/highlight} para compartir automáticamente todas las sesiones',
  'Poné {highlight}"share": "disabled"{/highlight} para evitar compartir sesiones',
  "Ejecutá {highlight}/unshare{/highlight} para eliminar una sesión del acceso público",
  "El permiso {highlight}doom_loop{/highlight} evita bucles infinitos de tool calls",
  "El permiso {highlight}external_directory{/highlight} protege archivos fuera del proyecto",
  "Ejecutá {highlight}ojito debug config{/highlight} para diagnosticar la configuración",
  "Usá el flag {highlight}--print-logs{/highlight} para ver logs detallados en stderr",
  (shortcuts) => `Usá ${commandText("/timeline", shortcuts.sessionTimeline())} para ir a mensajes específicos`,
  (shortcuts) => press(shortcuts.messagesToggleConceal(), "para alternar visibilidad de bloques de código en mensajes"),
  (shortcuts) => `Usá ${commandText("/status", shortcuts.statusView())} para ver info del estado del sistema`,
  "Habilitá {highlight}scroll_acceleration{/highlight} en {highlight}tui.json{/highlight} para scroll suave estilo macOS",
  (shortcuts) =>
    shortcuts.commandList()
      ? `Alterná la visualización del nombre de usuario en el chat via la paleta de comandos (${shortcutText(shortcuts.commandList())})`
      : "Alterná la visualización del nombre de usuario en el chat via la paleta de comandos",
  "Ejecutá {highlight}docker run -it --rm ghcr.io/anomalyco/opencode{/highlight} para uso containerizado",
  "Usá {highlight}/connect{/highlight} con ojito Zen para modelos seleccionados y probados",
  "Commité el archivo {highlight}AGENTS.md{/highlight} de tu proyecto a Git para compartirlo en equipo",
  "Usá {highlight}/review{/highlight} para revisar cambios sin commit, ramas o PRs",
  (shortcuts) => `Usá ${commandText("/help", shortcuts.helpShow())} para mostrar el diálogo de ayuda`,
  "Usá {highlight}/rename{/highlight} para renombrar la sesión actual",
  ...(process.platform === "win32"
    ? ([(shortcuts) => press(shortcuts.inputUndo(), "para deshacer cambios en tu consulta")] satisfies Tip[])
    : ([
        (shortcuts) => press(shortcuts.terminalSuspend(), "para suspender el terminal y volver a tu shell"),
      ] satisfies Tip[])),
]
