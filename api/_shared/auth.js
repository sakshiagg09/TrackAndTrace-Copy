//TrackAndTrace/api/_shared/auth.js
import jwt from "jsonwebtoken";
import jwksClient from "jwks-rsa";

/**
 * Validates Teams SSO token for your API.
 * Expect audience: api://<CLIENT_ID>
 */
export async function requireUser(context, req) {

  // 🔥 Bypass auth for local testing (no token needed)
  if (
    process.env.NODE_ENV === "development" ||
    process.env.AZURE_FUNCTIONS_ENVIRONMENT === "Development"
  ) {
    return { oid: "local-user", email: "local@test.com" };
  }

  const auth = req.headers?.authorization || req.headers?.Authorization;

  if (!auth?.startsWith("Bearer ")) {
    context.res = { status: 401, body: "Missing Authorization Bearer token" };
    return null;
  }

  const token = auth.slice("Bearer ".length);
  const tenantId = process.env.TENANT_ID;
  const expectedAud = process.env.EXPECTED_AUDIENCE; // api://<clientId>

  const jwksUri = `https://login.microsoftonline.com/${tenantId}/discovery/v2.0/keys`;
  const client = jwksClient({ jwksUri });

  function getKey(header, cb) {
    client.getSigningKey(header.kid, (err, key) => {
      if (err) return cb(err);
      cb(null, key.getPublicKey());
    });
  }

  try {
    const payload = await new Promise((resolve, reject) => {
      jwt.verify(
        token,
        getKey,
        {
          audience: expectedAud,
          issuer: `https://login.microsoftonline.com/${tenantId}/v2.0`
        },
        (err, decoded) => (err ? reject(err) : resolve(decoded))
      );
    });

    return payload; // contains oid, email, etc.
  } catch (e) {
    context.log("Token validation failed:", e?.message || e);
    context.res = { status: 401, body: "Invalid token" };
    return null;
  }
}
