// src/utils/graphClient.ts
import * as microsoftTeams from "@microsoft/teams-js";
import {
  PublicClientApplication,
  InteractionRequiredAuthError,
  type PopupRequest,
  type SilentRequest,
  type AccountInfo,
} from "@azure/msal-browser";

const msalConfig = {
  auth: {
    clientId: "d6dd72a1-e382-4891-8077-4fc7d1cc747c",
    authority: "https://login.microsoftonline.com/2e8ebe59-15a5-4043-9ad0-d9f03c89cb47",
    redirectUri: window.location.origin,
  },
  cache: { cacheLocation: "sessionStorage" },
  system: { asyncPopups: true },
};

const GRAPH_SCOPES = ["User.Read", "Sites.Read.All"];
const LOGIN_REQUEST: PopupRequest = { scopes: GRAPH_SCOPES };
const SILENT_REQUEST = (account: AccountInfo): SilentRequest => ({ scopes: GRAPH_SCOPES, account });

function isRunningInTeams(): boolean {
  try {
    const ua = window.navigator.userAgent ?? "";
    return window.parent !== window && (window.name?.includes("embedded-page") || ua.includes("Teams"));
  } catch {
    return false;
  }
}

// ---- MSAL init (must be awaited) ----
export const msalInstance = new PublicClientApplication(msalConfig);

export const msalReady = (async () => {
  await msalInstance.initialize();
  const redirectResult = await msalInstance.handleRedirectPromise().catch(() => null);

  if (redirectResult?.account) {
    msalInstance.setActiveAccount(redirectResult.account);
  } else {
    const existing = msalInstance.getActiveAccount() ?? msalInstance.getAllAccounts()[0];
    if (existing) msalInstance.setActiveAccount(existing);
  }
})();

// ---- lock to prevent interaction_in_progress ----
let interactionLock = false;
async function withInteractionLock<T>(fn: () => Promise<T>): Promise<T> {
  while (interactionLock) await new Promise((r) => setTimeout(r, 50));
  interactionLock = true;
  try {
    return await fn();
  } finally {
    interactionLock = false;
  }
}

// ---- Teams SSO token ----
async function getTeamsSsoToken(): Promise<string> {
  const t = microsoftTeams as typeof import("@microsoft/teams-js");

  try {
    if (typeof t.app?.initialize === "function") await t.app.initialize();
    else if (typeof t.initialize === "function") t.initialize();
  } catch {
    // ignore Teams init errors
  }

  // v2 Promise API
  if (t.authentication?.getAuthToken && t.authentication.getAuthToken.length === 0) {
    return await t.authentication.getAuthToken();
  }

  // v1 Callback API fallback
  return await new Promise<string>((resolve, reject) => {
    if (!t.authentication?.getAuthToken) return reject(new Error("Teams getAuthToken unavailable"));
    t.authentication.getAuthToken({
      successCallback: resolve,
      failureCallback: reject,
    });
  });
}


export async function getAccessToken(): Promise<string> {
  await msalReady;

  const inTeams = isRunningInTeams();
  let account = msalInstance.getActiveAccount() ?? msalInstance.getAllAccounts()[0];

  // 1) silent (if possible)
  if (account) {
    try {
      const silent = await msalInstance.acquireTokenSilent(SILENT_REQUEST(account));
      return silent.accessToken;
    } catch {
      // continue
    }
  }

  // 2) Teams SSO token first in Teams
  if (inTeams) {
    try {
      const token = await getTeamsSsoToken();
      if (token) return token;
    } catch {
      // fallback to popup
    }
  }

  // 3) interactive fallback
  if (!account) {
    if (inTeams) {
      // Teams: popup only
      const loginResult = await withInteractionLock(() => msalInstance.loginPopup(LOGIN_REQUEST));
      account = loginResult.account!;
      msalInstance.setActiveAccount(account);
    } else {
      // Browser: redirect OK
      await withInteractionLock(() => msalInstance.loginRedirect(LOGIN_REQUEST));
      return new Promise(() => { });
    }
  }

  const finalAccount = msalInstance.getActiveAccount() ?? msalInstance.getAllAccounts()[0];
  if (!finalAccount) throw new Error("No active account after login.");

  try {
    const final = await msalInstance.acquireTokenSilent(SILENT_REQUEST(finalAccount));
    return final.accessToken;
  } catch (err) {
    if (err instanceof InteractionRequiredAuthError) {
      if (inTeams) {
        const interactive = await withInteractionLock(() => msalInstance.acquireTokenPopup(LOGIN_REQUEST));
        return interactive.accessToken;
      }
      await withInteractionLock(() => msalInstance.acquireTokenRedirect(LOGIN_REQUEST));
      return new Promise(() => { });
    }
    throw err;
  }
}

/**
 * Graph calls MUST go via backend (Teams tabs block direct Graph).
 * This wrapper ALWAYS calls your Netlify function using POST.
 */
export async function graphFetch<T = unknown>(url: string, options?: RequestInit): Promise<T> {
  const token = await getAccessToken();
  const method = (options?.method ?? "GET").toUpperCase();

  const proxyUrl = "/.netlify/functions/graph-proxy";

  const res = await fetch(proxyUrl, {
    method: "POST", // ✅ always POST to avoid 405
    headers: {
      Authorization: `Bearer ${token}`, // Teams SSO or MSAL token for your app
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      url, // must be https://graph.microsoft.com/...
      method,
      headers: options?.headers ?? {},
      body: options?.body ?? null,
    }),
  });

  const text = await res.text();

  if (!res.ok) {
    throw new Error(`Graph proxy ${res.status}: ${text || res.statusText}`);
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    // endpoints may return empty string
    return {} as T;
  }
}

export default { msalInstance, msalReady, getAccessToken, graphFetch };