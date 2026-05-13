import { addSessionListener, removeSessionListener } from "@/lib/vm-ssh-sessions"
import { getAdminSessionFromRequest } from "@/lib/auth/session"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  if (!getAdminSessionFromRequest(request)) {
    return new Response(JSON.stringify({ success: false, error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    })
  }

  const { searchParams } = new URL(request.url)
  const sessionId = searchParams.get("sessionId")
  if (!sessionId) {
    return new Response("Missing sessionId", { status: 400 })
  }

  const listenerId = crypto.randomUUID()
  const enc = new TextEncoder()

  let cleanup: (() => void) | null = null

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const r = addSessionListener(sessionId, listenerId, (chunk: Buffer) => {
        const payload = JSON.stringify({ b64: chunk.toString("base64") })
        controller.enqueue(enc.encode(`data: ${payload}\n\n`))
      })
      if (!r.ok) {
        controller.enqueue(
          enc.encode(`data: ${JSON.stringify({ error: r.error })}\n\n`)
        )
        controller.close()
        return
      }

      // Flush headers immediately so EventSource can settle before the first shell output arrives.
      controller.enqueue(enc.encode(": connected\n\n"))

      const ping = setInterval(() => {
        try {
          controller.enqueue(enc.encode(`: ping\n\n`))
        } catch {
          clearInterval(ping)
        }
      }, 25_000)

      cleanup = () => {
        clearInterval(ping)
        removeSessionListener(sessionId, listenerId)
      }

      request.signal.addEventListener("abort", () => cleanup?.(), { once: true })
    },
    cancel() {
      cleanup?.()
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  })
}
