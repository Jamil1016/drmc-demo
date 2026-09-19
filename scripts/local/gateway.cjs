// Local verification only. supabase-js calls <url>/rest/v1/...; PostgREST serves
// at /. This tiny proxy strips the prefix so the real Supabase client can talk
// to the PostgREST container from docker-compose.local.yml.
//
//   node scripts/local/gateway.cjs            (listens on 54341)
const http = require("node:http");

const TARGET = { host: "127.0.0.1", port: Number(process.env.POSTGREST_PORT ?? 54340) };
const PORT = Number(process.env.GATEWAY_PORT ?? 54341);
const PREFIX = "/rest/v1";

function startGateway(port = PORT) {
  const server = http.createServer((req, res) => {
    if (!req.url || !req.url.startsWith(PREFIX)) {
      res.writeHead(404, { "content-type": "application/json" });
      res.end(JSON.stringify({ message: "local gateway only serves /rest/v1 (there is no Auth service here)" }));
      return;
    }
    const upstream = http.request(
      {
        ...TARGET,
        method: req.method,
        path: req.url.slice(PREFIX.length) || "/",
        headers: { ...req.headers, host: `${TARGET.host}:${TARGET.port}` },
      },
      (up) => {
        res.writeHead(up.statusCode ?? 502, up.headers);
        up.pipe(res);
      },
    );
    upstream.on("error", (error) => {
      res.writeHead(502, { "content-type": "application/json" });
      res.end(JSON.stringify({ message: `PostgREST unreachable: ${error.message}` }));
    });
    req.pipe(upstream);
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => resolve(server));
  });
}

module.exports = { startGateway };

if (require.main === module) {
  startGateway().then(() => console.log(`gateway: http://127.0.0.1:${PORT}${PREFIX} -> PostgREST :${TARGET.port}`));
}
