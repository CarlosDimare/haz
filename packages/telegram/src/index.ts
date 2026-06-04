import { Bot, type Context } from "grammy"
import { createOpencode, type ToolPart } from "@opencode-ai/sdk"

const botToken = process.env.TELEGRAM_BOT_TOKEN
if (!botToken) {
  console.error("❌ TELEGRAM_BOT_TOKEN no está configurado")
  process.exit(1)
}

const bot = new Bot(botToken)

console.log("🚀 Starting opencode server...")
const opencode = await createOpencode({ port: 0 })
console.log("✅ Opencode server ready")

type SessionState = {
  client: typeof opencode.client
  server: typeof opencode.server
  sessionId: string
  chatId: number
  threadId?: number
}

const sessions = new Map<string, SessionState>()
const userSessions = new Map<number, string>()

function sessionKey(chatId: number, userId: number) {
  return `${chatId}-${userId}`
}

// Live event stream for tool updates
void (async () => {
  const events = await opencode.client.event.subscribe()
  for await (const event of events.stream) {
    if (event.type === "message.part.updated") {
      const part = event.properties.part as ToolPart
      if (part.type === "tool" && part.state.status === "completed") {
        for (const [_key, state] of sessions.entries()) {
          if (state.sessionId === part.sessionID) {
            const msg = `🛠 *${part.tool}*: ${part.state.title}`
            void bot.api
              .sendMessage(state.chatId, msg, {
                message_thread_id: state.threadId,
                parse_mode: "Markdown",
              })
              .catch(() => {})
            break
          }
        }
      }
    }
  }
})()

bot.on("message:text", async (ctx: Context) => {
  const msg = ctx.message!
  const chatId = msg.chat.id
  const userId = msg.from?.id
  const text = msg.text!.trim()
  const threadId = msg.message_thread_id

  if (!userId || !text) return

  // Commands
  if (text.startsWith("/")) {
    switch (text) {
      case "/start":
        await ctx.reply(
          "🧿 Hola! Soy Ojito, tu asistente de código.\n\n" +
            "Mandame cualquier consulta sobre tu código y te ayudo.\n\n" +
            "Comandos:\n" +
            "/nuevo — empezar una sesión nueva\n" +
            "/status — ver estado del bot",
          { message_thread_id: threadId },
        )
        return
      case "/nuevo": {
        const key = sessionKey(chatId, userId)
        userSessions.delete(userId)
        sessions.delete(key)
        await ctx.reply("✅ Sesión nueva lista. Mandame tu consulta.", {
          message_thread_id: threadId,
        })
        return
      }
      case "/status":
        await ctx.reply(`🧿 Ojito Telegram Bot activo\nSesiones activas: ${sessions.size}`, {
          message_thread_id: threadId,
        })
        return
    }
    return
  }

  // Regular message — process with opencode
  const key = sessionKey(chatId, userId)
  let state = sessions.get(key)

  if (!state) {
    console.log(`🆕 Nueva sesión para usuario ${userId} en chat ${chatId}`)
    const createResult = await opencode.client.session.create({
      body: { title: `Telegram chat ${chatId} / user ${userId}` },
    })

    if (createResult.error) {
      console.error("❌ Error creando sesión:", createResult.error)
      await ctx.reply("Error al crear sesión. Intentá de nuevo.", {
        message_thread_id: threadId,
      })
      return
    }

    state = {
      client: opencode.client,
      server: opencode.server,
      sessionId: createResult.data.id,
      chatId,
      threadId,
    }
    sessions.set(key, state)
    userSessions.set(userId, key)

    // Share so it's visible in haz TUI
    const shareResult = await opencode.client.session.share({ path: { id: createResult.data.id } })
    if (!shareResult.error && shareResult.data?.share?.url) {
      await bot.api.sendMessage(chatId, `🔗 ${shareResult.data.share.url}`, {
        message_thread_id: threadId,
      })
    }
  }

  // Send to opencode
  console.log(`📝 Enviando a opencode: ${text}`)
  const result = await opencode.client.session.prompt({
    path: { id: state.sessionId },
    body: { parts: [{ type: "text", text }] },
  })

  if (result.error) {
    console.error("❌ Error en prompt:", result.error)
    await ctx.reply("Error procesando el mensaje. Intentá de nuevo.", {
      message_thread_id: threadId,
    })
    return
  }

  const response = result.data as any

  // Build response text — fields exist at runtime despite not being in TS types
  const responseText =
    response.info?.content ||
    response.parts
      ?.filter((p: any) => p.type === "text")
      .map((p: any) => p.text)
      .join("\n") ||
    "Listo, procesé tu consulta."

  // Send in chunks if too long (Telegram limit: 4096 chars)
  const maxLen = 4000
  if (responseText.length <= maxLen) {
    await ctx.reply(responseText, { message_thread_id: threadId })
  } else {
    for (let i = 0; i < responseText.length; i += maxLen) {
      const chunk = responseText.slice(i, i + maxLen)
      await bot.api.sendMessage(chatId, chunk, { message_thread_id: threadId })
    }
  }
})

// Handle errors
bot.catch((err) => {
  console.error("❌ Bot error:", err)
})

console.log("⚡️ Telegram bot starting (polling)...")
bot.start()
console.log("✅ Telegram bot running!")
