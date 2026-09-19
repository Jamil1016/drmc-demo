// Local verification only: mint HS256 JWTs for the PostgREST container, signed
// with the throwaway secret from docker-compose.local.yml.
//
//   node scripts/local/jwt.cjs service_role
const crypto = require("node:crypto");

const LOCAL_JWT_SECRET = "local-only-jwt-secret-with-at-least-32-characters";

const b64 = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");

function mintJwt(role, secret = LOCAL_JWT_SECRET) {
  const head = b64({ alg: "HS256", typ: "JWT" });
  const body = b64({ role, iss: "drmc-demo-local", exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 365 });
  const signature = crypto.createHmac("sha256", secret).update(`${head}.${body}`).digest("base64url");
  return `${head}.${body}.${signature}`;
}

module.exports = { LOCAL_JWT_SECRET, mintJwt };

if (require.main === module) console.log(mintJwt(process.argv[2] ?? "service_role"));
