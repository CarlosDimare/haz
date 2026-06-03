export * as TuiKeybind from "./keybind"

import type { KeyEvent, Renderable } from "@opentui/core"
import type { Binding } from "@opentui/keymap"
import type { BindingCommandMap, BindingConfig, BindingDefaults } from "@opentui/keymap/extras"
import type { DeepMutable } from "@opencode-ai/core/schema"
import { Schema } from "effect"

const KeyStroke = Schema.Struct({
  name: Schema.String,
  ctrl: Schema.optional(Schema.Boolean),
  shift: Schema.optional(Schema.Boolean),
  meta: Schema.optional(Schema.Boolean),
  super: Schema.optional(Schema.Boolean),
  hyper: Schema.optional(Schema.Boolean),
})

const BindingObject = Schema.StructWithRest(
  Schema.Struct({
    key: Schema.Union([Schema.String, KeyStroke]),
    event: Schema.optional(Schema.Literals(["press", "release"])),
    preventDefault: Schema.optional(Schema.Boolean),
    fallthrough: Schema.optional(Schema.Boolean),
  }),
  [Schema.Record(Schema.String, Schema.Unknown)],
)

const BindingItem = Schema.Union([Schema.String, KeyStroke, BindingObject])
export const BindingValueSchema = Schema.Union([
  Schema.Literal(false),
  Schema.Literal("none"),
  BindingItem,
  Schema.Array(BindingItem),
])
export type BindingValueSchema = DeepMutable<Schema.Schema.Type<typeof BindingValueSchema>>

type Definition = {
  default: BindingValueSchema
  description: string
}

const inputUndoDefault = process.platform === "win32" ? "ctrl+z,ctrl+-,super+z" : "ctrl+-,super+z"
export const LeaderDefault = "ctrl+x"

const keybind = (value: Definition["default"], description: string): Definition => ({ default: value, description })

export const Definitions = {
  leader: keybind(LeaderDefault, "Tecla líder para combinaciones de atajos"),

  app_exit: keybind("ctrl+c,ctrl+d,<leader>q", "Salir de la aplicación"),
  app_debug: keybind("none", "Alternar panel de debug"),
  app_console: keybind("none", "Alternar consola"),
  app_heap_snapshot: keybind("none", "Escribir heap snapshot"),
  app_toggle_animations: keybind("none", "Alternar animaciones"),
  app_toggle_file_context: keybind("none", "Alternar contexto de archivos"),
  app_toggle_diffwrap: keybind("none", "Alternar ajuste de diff"),
  app_toggle_paste_summary: keybind("none", "Alternar resumen de pegado"),
  app_toggle_session_directory_filter: keybind("none", "Alternar filtro de directorio de sesión"),
  command_list: keybind("ctrl+p", "Listar comandos disponibles"),
  help_show: keybind("none", "Abrir diálogo de ayuda"),
  docs_open: keybind("none", "Abrir documentación"),
  diff_close: keybind("escape,q", "Cerrar visor de diff"),
  diff_toggle: keybind("enter,space", "Alternar elemento del visor de diff"),
  diff_expand: keybind("right", "Expandir elemento del visor de diff"),
  diff_expand_all: keybind("E", "Expandir todas las carpetas del visor de diff"),
  diff_collapse: keybind("left", "Colapsar elemento del visor de diff"),
  diff_switch_focus: keybind("tab", "Cambiar foco del visor de diff"),
  diff_next_file: keybind("n", "Saltar al siguiente archivo diff"),
  diff_previous_file: keybind("p", "Saltar al archivo diff anterior"),
  diff_toggle_file_tree: keybind("b", "Alternar árbol de archivos del visor de diff"),
  diff_single_patch: keybind("s", "Alternar vista de parche único"),
  diff_switch_source: keybind("d", "Cambiar fuente del visor de diff"),
  diff_toggle_view: keybind("v", "Alternar vista dividida o unificada del diff"),
  diff_help: keybind("?", "Mostrar más atajos del visor de diff"),

  editor_open: keybind("<leader>e", "Abrir editor externo"),
  theme_list: keybind("<leader>t", "Listar temas disponibles"),
  theme_switch_mode: keybind("none", "Cambiar entre modo claro y oscuro"),
  theme_mode_lock: keybind("none", "Bloquear o desbloquear modo de tema"),
  sidebar_toggle: keybind("<leader>b", "Alternar barra lateral"),
  scrollbar_toggle: keybind("none", "Alternar barra de desplazamiento de sesión"),
  status_view: keybind("<leader>s", "Ver estado"),

  session_export: keybind("<leader>x", "Exportar sesión al editor"),
  session_copy: keybind("none", "Copiar transcripción de sesión"),
  session_new: keybind("<leader>n", "Crear una nueva sesión"),
  session_list: keybind("<leader>l", "Listar todas las sesiones"),
  session_timeline: keybind("<leader>g", "Mostrar línea de tiempo de la sesión"),
  session_fork: keybind("none", "Bifurcar sesión desde un mensaje"),
  session_rename: keybind("ctrl+r", "Renombrar sesión"),
  session_delete: keybind("ctrl+d", "Eliminar sesión"),
  session_share: keybind("none", "Compartir sesión actual"),
  session_unshare: keybind("none", "Dejar de compartir sesión actual"),
  session_interrupt: keybind("escape", "Interrumpir sesión actual"),
  session_compact: keybind("<leader>c", "Compactar la sesión"),
  session_toggle_timestamps: keybind("none", "Alternar marcas de tiempo en mensajes"),
  session_toggle_generic_tool_output: keybind("none", "Alternar salida de herramientas genérica"),
  session_queued_prompts: keybind("<leader>q", "Gestionar consultas en cola"),
  session_child_first: keybind("<leader>down", "Ir a la primera sesión hija"),
  session_child_cycle: keybind("right", "Ir a la siguiente sesión hija"),
  session_child_cycle_reverse: keybind("left", "Ir a la sesión hija anterior"),
  session_parent: keybind("up", "Ir a la sesión padre"),
  session_pin_toggle: keybind("ctrl+f", "Fijar o desfijar sesión en la lista"),
  session_quick_switch_1: keybind("<leader>1", "Cambiar a sesión en slot rápido 1"),
  session_quick_switch_2: keybind("<leader>2", "Cambiar a sesión en slot rápido 2"),
  session_quick_switch_3: keybind("<leader>3", "Cambiar a sesión en slot rápido 3"),
  session_quick_switch_4: keybind("<leader>4", "Cambiar a sesión en slot rápido 4"),
  session_quick_switch_5: keybind("<leader>5", "Cambiar a sesión en slot rápido 5"),
  session_quick_switch_6: keybind("<leader>6", "Cambiar a sesión en slot rápido 6"),
  session_quick_switch_7: keybind("<leader>7", "Cambiar a sesión en slot rápido 7"),
  session_quick_switch_8: keybind("<leader>8", "Cambiar a sesión en slot rápido 8"),
  session_quick_switch_9: keybind("<leader>9", "Cambiar a sesión en slot rápido 9"),

  stash_delete: keybind("ctrl+d", "Eliminar entrada de stash"),
  model_provider_list: keybind("ctrl+a", "Abrir lista de proveedores desde el diálogo de modelo"),
  model_favorite_toggle: keybind("ctrl+f", "Alternar estado de favorito del modelo"),
  model_list: keybind("<leader>m", "Listar modelos disponibles"),
  model_cycle_recent: keybind("f2", "Siguiente modelo usado recientemente"),
  model_cycle_recent_reverse: keybind("shift+f2", "Modelo usado recientemente anterior"),
  model_cycle_favorite: keybind("none", "Siguiente modelo favorito"),
  model_cycle_favorite_reverse: keybind("none", "Modelo favorito anterior"),
  mcp_list: keybind("none", "Listar servidores MCP"),
  provider_connect: keybind("none", "Conectar proveedor"),
  console_org_switch: keybind("none", "Cambiar organización de consola"),
  agent_list: keybind("<leader>a", "Listar agentes"),
  agent_cycle: keybind("tab", "Siguiente agente"),
  agent_cycle_reverse: keybind("shift+tab", "Agente anterior"),
  variant_cycle: keybind("ctrl+t", "Alternar variantes de modelo"),
  variant_list: keybind("none", "Listar variantes de modelo"),

  messages_page_up: keybind("pageup,ctrl+alt+b", "Desplazar mensajes una página arriba"),
  messages_page_down: keybind("pagedown,ctrl+alt+f", "Desplazar mensajes una página abajo"),
  messages_line_up: keybind("ctrl+alt+y", "Desplazar mensajes una línea arriba"),
  messages_line_down: keybind("ctrl+alt+e", "Desplazar mensajes una línea abajo"),
  messages_half_page_up: keybind("ctrl+alt+u", "Desplazar mensajes media página arriba"),
  messages_half_page_down: keybind("ctrl+alt+d", "Desplazar mensajes media página abajo"),
  messages_first: keybind("ctrl+g,home", "Ir al primer mensaje"),
  messages_last: keybind("ctrl+alt+g,end", "Ir al último mensaje"),
  messages_next: keybind("none", "Ir al siguiente mensaje"),
  messages_previous: keybind("none", "Ir al mensaje anterior"),
  messages_last_user: keybind("none", "Ir al último mensaje del usuario"),
  messages_copy: keybind("<leader>y", "Copiar mensaje"),
  messages_undo: keybind("<leader>u", "Deshacer mensaje"),
  messages_redo: keybind("<leader>r", "Rehacer mensaje"),
  messages_toggle_conceal: keybind("<leader>h", "Alternar ocultamiento de bloques de código en mensajes"),
  tool_details: keybind("none", "Alternar visibilidad de detalles de herramientas"),
  display_thinking: keybind("none", "Alternar visibilidad de bloques de pensamiento"),

  prompt_submit: keybind("none", "Enviar consulta"),
  prompt_editor_context_clear: keybind("none", "Limpiar contexto del editor"),
  prompt_skills: keybind("none", "Abrir selector de skills"),
  prompt_stash: keybind("none", "Guardar consulta"),
  prompt_stash_pop: keybind("none", "Recuperar consulta guardada"),
  prompt_stash_list: keybind("none", "Listar consultas guardadas"),
  workspace_set: keybind("none", "Establecer workspace"),

  input_clear: keybind("ctrl+c", "Limpiar campo de entrada"),
  input_paste: keybind({ key: "ctrl+v", preventDefault: false }, "Pegar desde portapapeles"),
  input_submit: keybind("return", "Enviar entrada"),
  input_newline: keybind("shift+return,ctrl+return,alt+return,ctrl+j", "Insertar salto de línea en la entrada"),
  input_move_left: keybind("left,ctrl+b", "Mover cursor a la izquierda"),
  input_move_right: keybind("right,ctrl+f", "Mover cursor a la derecha"),
  input_move_up: keybind("up", "Mover cursor arriba"),
  input_move_down: keybind("down", "Mover cursor abajo"),
  input_select_left: keybind("shift+left", "Seleccionar a la izquierda"),
  input_select_right: keybind("shift+right", "Seleccionar a la derecha"),
  input_select_up: keybind("shift+up", "Seleccionar arriba"),
  input_select_down: keybind("shift+down", "Seleccionar abajo"),
  input_line_home: keybind("ctrl+a", "Ir al inicio de la línea"),
  input_line_end: keybind("ctrl+e", "Ir al final de la línea"),
  input_select_line_home: keybind("ctrl+shift+a", "Seleccionar hasta inicio de línea"),
  input_select_line_end: keybind("ctrl+shift+e", "Seleccionar hasta final de línea"),
  input_visual_line_home: keybind("alt+a", "Ir al inicio de línea visual"),
  input_visual_line_end: keybind("alt+e", "Ir al final de línea visual"),
  input_select_visual_line_home: keybind("alt+shift+a", "Seleccionar hasta inicio de línea visual"),
  input_select_visual_line_end: keybind("alt+shift+e", "Seleccionar hasta final de línea visual"),
  input_buffer_home: keybind("home", "Ir al inicio del buffer"),
  input_buffer_end: keybind("end", "Ir al final del buffer"),
  input_select_buffer_home: keybind("shift+home", "Seleccionar hasta inicio del buffer"),
  input_select_buffer_end: keybind("shift+end", "Seleccionar hasta final del buffer"),
  input_delete_line: keybind("ctrl+shift+d", "Eliminar línea en la entrada"),
  input_delete_to_line_end: keybind("ctrl+k", "Eliminar hasta final de línea"),
  input_delete_to_line_start: keybind("ctrl+u", "Eliminar hasta inicio de línea"),
  input_backspace: keybind("backspace,shift+backspace", "Retroceso en la entrada"),
  input_delete: keybind("ctrl+d,delete,shift+delete", "Eliminar carácter en la entrada"),
  input_undo: keybind(inputUndoDefault, "Deshacer en la entrada"),
  input_redo: keybind("ctrl+.,super+shift+z", "Rehacer en la entrada"),
  input_word_forward: keybind("alt+f,alt+right,ctrl+right", "Avanzar una palabra en la entrada"),
  input_word_backward: keybind("alt+b,alt+left,ctrl+left", "Retroceder una palabra en la entrada"),
  input_select_word_forward: keybind("alt+shift+f,alt+shift+right", "Seleccionar palabra a la derecha"),
  input_select_word_backward: keybind("alt+shift+b,alt+shift+left", "Seleccionar palabra a la izquierda"),
  input_delete_word_forward: keybind("alt+d,alt+delete,ctrl+delete", "Eliminar palabra a la derecha"),
  input_delete_word_backward: keybind("ctrl+w,ctrl+backspace,alt+backspace", "Eliminar palabra a la izquierda"),
  input_select_all: keybind("super+a", "Seleccionar todo en la entrada"),
  history_previous: keybind("up", "Elemento de historial anterior"),
  history_next: keybind("down", "Elemento de historial siguiente"),

  "dialog.select.prev": keybind("up,ctrl+p", "Ir al elemento de diálogo anterior"),
  "dialog.select.next": keybind("down,ctrl+n", "Ir al siguiente elemento de diálogo"),
  "dialog.select.page_up": keybind("pageup", "Subir una página en el diálogo"),
  "dialog.select.page_down": keybind("pagedown", "Bajar una página en el diálogo"),
  "dialog.select.home": keybind("home", "Ir al primer elemento del diálogo"),
  "dialog.select.end": keybind("end", "Ir al último elemento del diálogo"),
  "dialog.select.submit": keybind("return", "Confirmar elemento seleccionado"),
  "dialog.prompt.submit": keybind("return", "Enviar prompt del diálogo"),
  "dialog.mcp.toggle": keybind("space", "Alternar MCP en el diálogo MCP"),
  "prompt.autocomplete.prev": keybind("up,ctrl+p", "Ir al elemento de autocompletado anterior"),
  "prompt.autocomplete.next": keybind("down,ctrl+n", "Ir al siguiente elemento de autocompletado"),
  "prompt.autocomplete.hide": keybind("escape", "Ocultar autocompletado"),
  "prompt.autocomplete.select": keybind("return", "Seleccionar elemento de autocompletado"),
  "prompt.autocomplete.complete": keybind("tab", "Completar elemento de autocompletado"),
  "permission.prompt.fullscreen": keybind("ctrl+f", "Alternar pantalla completa del permiso"),
  "plugins.toggle": keybind("space", "Alternar plugin"),
  "dialog.plugins.install": keybind("shift+i", "Instalar plugin desde el diálogo"),

  terminal_suspend: keybind("ctrl+z", "Suspender terminal"),
  terminal_title_toggle: keybind("none", "Alternar título del terminal"),
  tips_toggle: keybind("<leader>h", "Alternar tips en pantalla de inicio"),
  plugin_manager: keybind("none", "Abrir diálogo de gestión de plugins"),
  plugin_install: keybind("none", "Instalar plugin"),

  which_key_toggle: keybind("ctrl+alt+k", "Alternar panel which-key"),
  which_key_layout_toggle: keybind("ctrl+alt+shift+k", "Cambiar diseño de which-key"),
  which_key_pending_toggle: keybind("ctrl+alt+shift+p", "Alternar vista previa pendiente de which-key"),
  which_key_group_previous: keybind("ctrl+alt+left,ctrl+alt+[", "Grupo anterior de which-key"),
  which_key_group_next: keybind("ctrl+alt+right,ctrl+alt+]", "Siguiente grupo de which-key"),
  which_key_scroll_up: keybind("ctrl+alt+up,ctrl+alt+p", "Desplazar which-key arriba"),
  which_key_scroll_down: keybind("ctrl+alt+down,ctrl+alt+n", "Desplazar which-key abajo"),
  which_key_page_up: keybind("ctrl+alt+pageup", "Página arriba de which-key"),
  which_key_page_down: keybind("ctrl+alt+pagedown", "Página abajo de which-key"),
  which_key_home: keybind("ctrl+alt+home", "Ir al primer atajo de which-key"),
  which_key_end: keybind("ctrl+alt+end", "Ir al último atajo de which-key"),
} satisfies Record<string, Definition>

type KeybindName = keyof typeof Definitions
const KeybindNames = new Set<string>(Object.keys(Definitions))

export const KeybindOverrides = Schema.Struct(
  Object.fromEntries(
    Object.entries(Definitions).map(([name, item]) => [
      name,
      Schema.optional(BindingValueSchema).annotate({ description: item.description }),
    ]),
  ),
).annotate({ description: "TUI keybinding overrides" })
export const Descriptions = Object.fromEntries(
  Object.entries(Definitions).map(([name, item]) => [name, item.description]),
) as Record<KeybindName, string>
export const CommandMap = {
  app_exit: "app.exit",
  app_debug: "app.debug",
  app_console: "app.console",
  app_heap_snapshot: "app.heap_snapshot",
  app_toggle_animations: "app.toggle.animations",
  app_toggle_file_context: "app.toggle.file_context",
  app_toggle_diffwrap: "app.toggle.diffwrap",
  app_toggle_paste_summary: "app.toggle.paste_summary",
  app_toggle_session_directory_filter: "app.toggle.session_directory_filter",
  command_list: "command.palette.show",
  help_show: "help.show",
  docs_open: "docs.open",
  diff_close: "diff.close",
  diff_toggle: "diff.toggle",
  diff_expand: "diff.expand",
  diff_expand_all: "diff.expand_all",
  diff_collapse: "diff.collapse",
  diff_switch_focus: "diff.switch_focus",
  diff_next_file: "diff.next_file",
  diff_previous_file: "diff.previous_file",
  diff_toggle_file_tree: "diff.toggle_file_tree",
  diff_single_patch: "diff.single_patch",
  diff_switch_source: "diff.switch_source",
  diff_toggle_view: "diff.toggle_view",
  diff_help: "diff.help",
  editor_open: "prompt.editor",
  theme_list: "theme.switch",
  theme_switch_mode: "theme.switch_mode",
  theme_mode_lock: "theme.mode.lock",
  sidebar_toggle: "session.sidebar.toggle",
  scrollbar_toggle: "session.toggle.scrollbar",
  status_view: "opencode.status",
  session_export: "session.export",
  session_copy: "session.copy",
  session_new: "session.new",
  session_list: "session.list",
  session_timeline: "session.timeline",
  session_fork: "session.fork",
  session_rename: "session.rename",
  session_delete: "session.delete",
  session_share: "session.share",
  session_unshare: "session.unshare",
  session_interrupt: "session.interrupt",
  session_compact: "session.compact",
  session_toggle_timestamps: "session.toggle.timestamps",
  session_toggle_generic_tool_output: "session.toggle.generic_tool_output",
  session_queued_prompts: "session.queued_prompts",
  session_child_first: "session.child.first",
  session_child_cycle: "session.child.next",
  session_child_cycle_reverse: "session.child.previous",
  session_parent: "session.parent",
  session_pin_toggle: "session.pin.toggle",
  session_quick_switch_1: "session.quick_switch.1",
  session_quick_switch_2: "session.quick_switch.2",
  session_quick_switch_3: "session.quick_switch.3",
  session_quick_switch_4: "session.quick_switch.4",
  session_quick_switch_5: "session.quick_switch.5",
  session_quick_switch_6: "session.quick_switch.6",
  session_quick_switch_7: "session.quick_switch.7",
  session_quick_switch_8: "session.quick_switch.8",
  session_quick_switch_9: "session.quick_switch.9",
  stash_delete: "stash.delete",
  model_provider_list: "model.dialog.provider",
  model_favorite_toggle: "model.dialog.favorite",
  model_list: "model.list",
  model_cycle_recent: "model.cycle_recent",
  model_cycle_recent_reverse: "model.cycle_recent_reverse",
  model_cycle_favorite: "model.cycle_favorite",
  model_cycle_favorite_reverse: "model.cycle_favorite_reverse",
  mcp_list: "mcp.list",
  provider_connect: "provider.connect",
  console_org_switch: "console.org.switch",
  agent_list: "agent.list",
  agent_cycle: "agent.cycle",
  agent_cycle_reverse: "agent.cycle.reverse",
  variant_cycle: "variant.cycle",
  variant_list: "variant.list",
  messages_page_up: "session.page.up",
  messages_page_down: "session.page.down",
  messages_line_up: "session.line.up",
  messages_line_down: "session.line.down",
  messages_half_page_up: "session.half.page.up",
  messages_half_page_down: "session.half.page.down",
  messages_first: "session.first",
  messages_last: "session.last",
  messages_next: "session.message.next",
  messages_previous: "session.message.previous",
  messages_last_user: "session.messages_last_user",
  messages_copy: "messages.copy",
  messages_undo: "session.undo",
  messages_redo: "session.redo",
  messages_toggle_conceal: "session.toggle.conceal",
  tool_details: "session.toggle.actions",
  display_thinking: "session.toggle.thinking",
  prompt_submit: "prompt.submit",
  prompt_editor_context_clear: "prompt.editor_context.clear",
  prompt_skills: "prompt.skills",
  prompt_stash: "prompt.stash",
  prompt_stash_pop: "prompt.stash.pop",
  prompt_stash_list: "prompt.stash.list",
  workspace_set: "workspace.set",
  input_clear: "prompt.clear",
  input_paste: "prompt.paste",
  input_submit: "input.submit",
  input_newline: "input.newline",
  input_move_left: "input.move.left",
  input_move_right: "input.move.right",
  input_move_up: "input.move.up",
  input_move_down: "input.move.down",
  input_select_left: "input.select.left",
  input_select_right: "input.select.right",
  input_select_up: "input.select.up",
  input_select_down: "input.select.down",
  input_line_home: "input.line.home",
  input_line_end: "input.line.end",
  input_select_line_home: "input.select.line.home",
  input_select_line_end: "input.select.line.end",
  input_visual_line_home: "input.visual.line.home",
  input_visual_line_end: "input.visual.line.end",
  input_select_visual_line_home: "input.select.visual.line.home",
  input_select_visual_line_end: "input.select.visual.line.end",
  input_buffer_home: "input.buffer.home",
  input_buffer_end: "input.buffer.end",
  input_select_buffer_home: "input.select.buffer.home",
  input_select_buffer_end: "input.select.buffer.end",
  input_delete_line: "input.delete.line",
  input_delete_to_line_end: "input.delete.to.line.end",
  input_delete_to_line_start: "input.delete.to.line.start",
  input_backspace: "input.backspace",
  input_delete: "input.delete",
  input_undo: "input.undo",
  input_redo: "input.redo",
  input_word_forward: "input.word.forward",
  input_word_backward: "input.word.backward",
  input_select_word_forward: "input.select.word.forward",
  input_select_word_backward: "input.select.word.backward",
  input_delete_word_forward: "input.delete.word.forward",
  input_delete_word_backward: "input.delete.word.backward",
  input_select_all: "input.select.all",
  history_previous: "prompt.history.previous",
  history_next: "prompt.history.next",
  terminal_suspend: "terminal.suspend",
  terminal_title_toggle: "terminal.title.toggle",
  tips_toggle: "tips.toggle",
  plugin_manager: "plugins.list",
  plugin_install: "plugins.install",
  which_key_toggle: "which-key.toggle",
  which_key_layout_toggle: "which-key.layout.toggle",
  which_key_pending_toggle: "which-key.pending.toggle",
  which_key_group_previous: "which-key.group.previous",
  which_key_group_next: "which-key.group.next",
  which_key_scroll_up: "which-key.scroll.up",
  which_key_scroll_down: "which-key.scroll.down",
  which_key_page_up: "which-key.page.up",
  which_key_page_down: "which-key.page.down",
  which_key_home: "which-key.home",
  which_key_end: "which-key.end",
} satisfies BindingCommandMap
const CommandDescriptions = Object.fromEntries(
  Object.entries(Definitions).map(([name, item]) => [
    CommandMap[name as keyof typeof CommandMap] ?? name,
    item.description,
  ]),
) as Record<string, string>

export type Keybinds = { [K in KeybindName]: BindingValueSchema }
export type KeybindOverrides = Partial<Keybinds>
export type BindingLookupView = {
  readonly bindings: readonly Binding<Renderable, KeyEvent>[]
  get(command: string): readonly Binding<Renderable, KeyEvent>[]
  has(command: string): boolean
  gather(name: string, commands: readonly string[]): readonly Binding<Renderable, KeyEvent>[]
  pick(name: string, commands: readonly string[]): Binding<Renderable, KeyEvent>[]
  omit(name: string, commands: readonly string[]): Binding<Renderable, KeyEvent>[]
}

export function toBindingConfig(keybinds: Keybinds): BindingConfig<Renderable, KeyEvent> {
  return Object.fromEntries(Object.entries(keybinds)) as BindingConfig<Renderable, KeyEvent>
}

const decodeBindingValue = Schema.decodeUnknownSync(BindingValueSchema)

export function defaultValue(name: KeybindName) {
  return Definitions[name].default
}

export function parse(keybinds: KeybindOverrides): Keybinds {
  const invalid = unknownKeys(keybinds)
  if (invalid.length) throw new Error(`Unrecognized keybind${invalid.length === 1 ? "" : "s"}: ${invalid.join(", ")}`)
  return Object.fromEntries(
    Object.entries(Definitions).map(([name, item]) => [
      name,
      decodeBindingValue(keybinds[name as KeybindName] ?? item.default),
    ]),
  ) as Keybinds
}

export const Keybinds = { parse }

export function unknownKeys(input: object) {
  return Object.keys(input).filter((key) => !KeybindNames.has(key))
}

export function bindingDefaults(): BindingDefaults<Renderable, KeyEvent> {
  return ({ command, binding }) => {
    if (binding.desc !== undefined) return
    return { desc: CommandDescriptions[command] }
  }
}
