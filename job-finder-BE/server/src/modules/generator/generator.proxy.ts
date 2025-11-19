import { Router, type Request, type Response } from "express"
import { env } from "../../config/env"
import { logger } from "../../logger"

interface RawRequest extends Request {
  rawBody?: Buffer
}

const generatorBaseUrl = (env.GENERATOR_FUNCTION_URL || "https://us-central1-static-sites-257923.cloudfunctions.net/manageGenerator").replace(/\/$/, "")

function buildTargetUrl(req: Request): string {
  const queryIndex = req.url.indexOf("?")
  const query = queryIndex >= 0 ? req.url.slice(queryIndex) : ""
  return `${generatorBaseUrl}${req.path}${query}`
}

function cloneHeaders(req: Request): HeadersInit {
  const headers: Record<string, string> = {}
  for (const [key, value] of Object.entries(req.headers)) {
    if (!value) continue
    if (key === "host" || key === "content-length") continue
    headers[key] = Array.isArray(value) ? value.join(",") : value
  }
  return headers
}

async function forwardRequest(req: Request, res: Response) {
  const targetUrl = buildTargetUrl(req)
  const method = req.method.toUpperCase()
  const hasBody = !["GET", "HEAD"].includes(method)
  const rawReq = req as RawRequest

  let body: BodyInit | undefined
  if (hasBody) {
    if (rawReq.rawBody) {
      body = rawReq.rawBody
    } else if (req.body && typeof req.body === "object") {
      body = JSON.stringify(req.body)
    }
  }

  try {
    const response = await fetch(targetUrl, {
      method,
      headers: cloneHeaders(req),
      body,
    })

    res.status(response.status)
    response.headers.forEach((value, key) => {
      if (key === "content-length") return
      res.setHeader(key, value)
    })
    const buffer = Buffer.from(await response.arrayBuffer())
    res.send(buffer)
  } catch (error) {
    logger.error({ err: error }, "Generator proxy request failed", { targetUrl })
    res.status(502).json({ message: "Generator service unavailable" })
  }
}

export function buildGeneratorProxyRouter() {
  const router = Router()
  router.use(forwardRequest)
  return router
}
