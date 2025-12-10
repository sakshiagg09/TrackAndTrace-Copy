import { ConfidentialClientApplication } from "@azure/msal-node";

const { TENANT_ID, CLIENT_ID, CLIENT_SECRET } = process.env;

const cca = new ConfidentialClientApplication({
    auth: {
        clientId: CLIENT_ID,
        authority: `https://login.microsoftonline.com/${TENANT_ID}`,
        clientSecret: CLIENT_SECRET,
    },
});

// ✅ IMPORTANT: Use fully-qualified Graph scopes (or .default)
const GRAPH_SCOPES = ["https://graph.microsoft.com/.default"];
// Alternative (also fine):
// const GRAPH_SCOPES = [
//   "https://graph.microsoft.com/User.Read",
//   "https://graph.microsoft.com/Sites.Read.All",
// ];

function decodeAud(token) {
    try {
        const payload = JSON.parse(
            Buffer.from(token.split(".")[1], "base64").toString("utf8")
        );
        return payload.aud;
    } catch {
        return "unknown";
    }
}

export default async (req) => {
    if (req.method !== "POST") {
        return new Response("Use POST", { status: 405 });
    }

    const auth = req.headers.get("authorization") || "";
    const bearer = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7) : "";
    if (!bearer) {
        return new Response(JSON.stringify({ error: "Missing Authorization Bearer token" }), {
            status: 401,
            headers: { "content-type": "application/json" },
        });
    }

    let body = {};
    try {
        body = await req.json();
    } catch { }

    const url = body.url;
    const method = (body.method || "GET").toUpperCase();
    const headers = body.headers || {};
    const payload = body.body;

    if (!url || typeof url !== "string" || !url.startsWith("https://graph.microsoft.com/")) {
        return new Response(JSON.stringify({ error: "Body must include a Graph URL" }), {
            status: 400,
            headers: { "content-type": "application/json" },
        });
    }

    try {
        console.log("Incoming token aud:", decodeAud(bearer));

        const obo = await cca.acquireTokenOnBehalfOf({
            oboAssertion: bearer,
            scopes: GRAPH_SCOPES,
        });

        if (!obo?.accessToken) {
            return new Response(JSON.stringify({ error: "OBO failed: no Graph access token returned" }), {
                status: 401,
                headers: { "content-type": "application/json" },
            });
        }

        console.log("OBO token aud:", decodeAud(obo.accessToken));

        const res = await fetch(url, {
            method,
            headers: {
                ...headers,
                Authorization: `Bearer ${obo.accessToken}`, // ✅ Graph token (correct audience)
                "Content-Type": "application/json",
            },
            body: payload ? JSON.stringify(payload) : undefined,
        });

        const text = await res.text();
        const contentType = res.headers.get("content-type") || "application/json";

        return new Response(text, {
            status: res.status,
            headers: { "content-type": contentType },
        });
    } catch (e) {
        return new Response(
            JSON.stringify({ error: "graph-proxy failed", message: e?.message || String(e) }),
            { status: 500, headers: { "content-type": "application/json" } }
        );
    }
};