// Dev-only reverse proxy so browser preview tools can attach without reading
// .env: the real backend (with secrets) runs separately on 3001; this proxy
// holds no secrets and just forwards every request.
import http from 'node:http'

const TARGET_HOST = '127.0.0.1'
const TARGET_PORT = 3001
const port = Number(process.env.PORT ?? 4173)

http
  .createServer((req, res) => {
    const proxyReq = http.request(
      { host: TARGET_HOST, port: TARGET_PORT, path: req.url, method: req.method, headers: { ...req.headers, host: `${TARGET_HOST}:${TARGET_PORT}` } },
      (proxyRes) => {
        res.writeHead(proxyRes.statusCode ?? 502, proxyRes.headers)
        proxyRes.pipe(res)
      }
    )
    proxyReq.on('error', () => {
      res.writeHead(502, { 'content-type': 'text/plain' })
      res.end(`backend not running on :${TARGET_PORT} — start it first`)
    })
    req.pipe(proxyReq)
  })
  .listen(port, '127.0.0.1', () => {
    console.log(`preview proxy on http://localhost:${port} -> http://${TARGET_HOST}:${TARGET_PORT}`)
  })
