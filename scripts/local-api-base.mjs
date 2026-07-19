export const DEFAULT_LOCAL_API_BASE = "http://127.0.0.1:3000"

export function resolveLocalApiBase(env = process.env) {
  const configured = env.STARCANVAS_LOCAL_API_BASE?.trim()
  return (configured || DEFAULT_LOCAL_API_BASE).replace(/\/+$/, "")
}
