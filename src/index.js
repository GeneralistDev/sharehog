import { getPostHog } from "./posthog.js";

const SESSION_DAYS = 30;

// ---------- helpers ----------

function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[c]));
}

function parseCookies(request) {
  const header = request.headers.get("Cookie") || "";
  const out = {};
  header.split(";").forEach((pair) => {
    const idx = pair.indexOf("=");
    if (idx === -1) return;
    const k = pair.slice(0, idx).trim();
    const v = pair.slice(idx + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  });
  return out;
}

function bytesToHex(buf) {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function hexToBytes(hex) {
  const arr = new Uint8Array(hex.length / 2);
  for (let i = 0; i < arr.length; i++) arr[i] = parseInt(hex.substr(i * 2, 2), 16);
  return arr;
}

async function hashPassword(password, saltHex) {
  const enc = new TextEncoder();
  const salt = saltHex ? hexToBytes(saltHex) : crypto.getRandomValues(new Uint8Array(16));
  const keyMaterial = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" },
    keyMaterial,
    256
  );
  return { salt: bytesToHex(salt), hash: bytesToHex(bits) };
}

async function verifyPassword(password, saltHex, hashHex) {
  const { hash } = await hashPassword(password, saltHex);
  return hash === hashHex;
}

function newSessionId() {
  return crypto.randomUUID();
}

async function getSessionUser(request, env) {
  const cookies = parseCookies(request);
  const sid = cookies.sid;
  if (!sid) return null;
  const row = await env.DB.prepare(
    "SELECT users.id, users.username FROM sessions JOIN users ON users.id = sessions.user_id WHERE sessions.id = ? AND sessions.expires_at > datetime('now')"
  )
    .bind(sid)
    .first();
  return row || null;
}

function setCookieHeader(request, sid, maxAgeSeconds) {
  const url = new URL(request.url);
  const secure = url.protocol === "https:" ? "; Secure" : "";
  if (maxAgeSeconds === 0) {
    return `sid=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
  }
  return `sid=${sid}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${secure}`;
}

function redirect(location, headers = {}) {
  return new Response(null, { status: 302, headers: { Location: location, ...headers } });
}

function htmlResponse(body, status = 200) {
  return new Response(body, { status, headers: { "Content-Type": "text/html; charset=utf-8" } });
}

async function captureEvent(env, distinctId, event, properties = {}) {
  const posthog = getPostHog(env);
  if (!posthog) return;
  posthog.capture({ distinctId, event, properties });
  await posthog.flush();
}

// ---------- layout ----------

function posthogSnippet(env) {
  const apiKey = env.POSTHOG_API_KEY;
  const host = env.POSTHOG_HOST;
  if (!apiKey || !host) return "";
  return `<script>
    !function(t,e){var o,n,p,r;e.__SV||(window.posthog=e,e._i=[],e.init=function(i,s,a){function g(t,e){var o=e.split(".");2==o.length&&(t=t[o[0]],e=o[1]),t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}(p=t.createElement("script")).type="text/javascript",p.crossOrigin="anonymous",p.async=!0,p.src=s.api_host.replace(".i.posthog.com","-assets.i.posthog.com")+"/static/array.js",(r=t.getElementsByTagName("script")[0]).parentNode.insertBefore(p,r);var u=e;for(void 0!==a?u=e[a]=[]:a="posthog",u.people=u.people||[],u.toString=function(t){var e="posthog";return"posthog"!==a&&(e+="."+a),t||(e+=" (stub)"),e},u.people.toString=function(){return u.toString(1)+".people (stub)"},o="init me ws ys ps bs capture je Di ks register register_once register_for_session unregister unregister_for_session Ps getFeatureFlag getFeatureFlagPayload isFeatureEnabled reloadFeatureFlags updateEarlyAccessFeatureEnrollment getEarlyAccessFeatures on onFeatureFlags onSessionId getSurveys getActiveMatchingSurveys renderSurvey canRenderSurvey getNextSurveyStep identify setPersonProperties group resetGroups setPersonPropertiesForFlags resetPersonPropertiesForFlags setGroupPropertiesForFlags resetGroupPropertiesForFlags reset get_distinct_id getGroups get_session_id get_session_replay_url alias set_config startSessionRecording stopSessionRecording sessionRecordingStarted captureException loadToolbar get_property getSessionProperty Es Rs createPersonProfile Is opt_in_capturing opt_out_capturing has_opted_in_capturing has_opted_out_capturing clear_opt_in_out_capturing debug Fs getPageViewId captureTraceFeedback captureTraceMetric".split(" "),n=0;n<o.length;n++)g(u,o[n]);e._i.push([i,s,a])},e.__SV=1)}(document,window.posthog||[]);
    posthog.init(${JSON.stringify(apiKey)},{api_host:${JSON.stringify(host)},person_profiles:"identified_only",capture_exceptions:true})
  </script>`;
}

function layout({ title, user, body, error, wide, env }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)} · ShareHog</title>
${env ? posthogSnippet(env) : ""}
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
  :root {
    color-scheme: light dark;
    --bg: #f6f5f2;
    --surface: #ffffff;
    --border: #e7e3db;
    --text: #201c16;
    --text-dim: #6f6a60;
    --accent: #e8590c;
    --accent-2: #ffb020;
    --shadow: 0 1px 2px rgba(20,16,8,.04), 0 8px 24px rgba(20,16,8,.06);
    --radius: 14px;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #15130f;
      --surface: #201c16;
      --border: #34302a;
      --text: #f3efe6;
      --text-dim: #a39c8e;
      --shadow: 0 1px 2px rgba(0,0,0,.3), 0 8px 24px rgba(0,0,0,.35);
    }
  }
  * { box-sizing: border-box; }
  body {
    font-family: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    background: var(--bg);
    color: var(--text);
    margin: 0;
    line-height: 1.5;
    -webkit-font-smoothing: antialiased;
  }
  .wrap { max-width: ${wide ? "960px" : "440px"}; margin: 0 auto; padding: 20px 16px 64px; }
  header.top {
    position: sticky; top: 0; z-index: 10;
    background: color-mix(in srgb, var(--bg) 88%, transparent);
    backdrop-filter: blur(10px);
    border-bottom: 1px solid var(--border);
  }
  header.top .inner {
    max-width: 960px; margin: 0 auto; padding: 14px 16px;
    display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap;
  }
  .brand { display: flex; align-items: center; gap: 8px; text-decoration: none; color: inherit; }
  .brand .logo {
    width: 32px; height: 32px; border-radius: 9px; display: grid; place-items: center;
    background: linear-gradient(135deg, var(--accent), var(--accent-2)); font-size: 17px;
  }
  .brand span { font-weight: 800; font-size: 1.1rem; letter-spacing: -0.01em; }
  nav { display: flex; align-items: center; gap: 10px; font-size: .92rem; }
  nav .who { color: var(--text-dim); margin-right: 2px; }
  nav a { text-decoration: none; color: var(--text); }
  nav a:hover { color: var(--accent); }
  .btn {
    display: inline-flex; align-items: center; gap: 6px;
    padding: 9px 16px; border-radius: 999px; border: none;
    background: linear-gradient(135deg, var(--accent), var(--accent-2));
    color: #fff; font-weight: 700; cursor: pointer; font-size: .92rem;
    text-decoration: none; box-shadow: var(--shadow);
    transition: transform .12s ease, box-shadow .12s ease;
  }
  .btn:hover { transform: translateY(-1px); }
  .btn.ghost { background: var(--surface); color: var(--text); border: 1px solid var(--border); box-shadow: none; }
  .btn.small { padding: 6px 12px; font-size: .82rem; }
  .btn.danger { background: none; color: #c4402a; border: 1px solid #c4402a44; box-shadow: none; }

  h1.page-title { font-size: 1.6rem; margin: 4px 0 20px; letter-spacing: -0.02em; }

  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 16px; }
  .card {
    background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius);
    overflow: hidden; box-shadow: var(--shadow); display: flex; flex-direction: column;
    transition: transform .15s ease, box-shadow .15s ease;
  }
  .card:hover { transform: translateY(-2px); }
  .card .thumb {
    aspect-ratio: 16 / 9; width: 100%; object-fit: cover; display: block;
    background: linear-gradient(135deg, var(--accent), var(--accent-2));
  }
  .card .thumb.placeholder { display: grid; place-items: center; font-size: 2rem; }
  .card .body { padding: 14px 16px 16px; display: flex; flex-direction: column; gap: 6px; flex: 1; }
  .card h3 { margin: 0; font-size: 1.02rem; line-height: 1.3; }
  .card h3 a { text-decoration: none; color: var(--text); }
  .card h3 a:hover { color: var(--accent); }
  .card .url { font-size: .78rem; color: var(--text-dim); word-break: break-all; }
  .card .desc { margin: 2px 0 0; font-size: .9rem; color: var(--text-dim); }
  .card .foot {
    margin-top: auto; padding-top: 10px; display: flex; justify-content: space-between; align-items: center;
    font-size: .78rem; color: var(--text-dim);
  }
  .owner-actions { display: flex; gap: 6px; align-items: center; }

  form { display: flex; flex-direction: column; gap: 14px; }
  .auth-card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 28px; box-shadow: var(--shadow); margin-top: 40px; }
  .auth-card h1 { margin: 0 0 4px; font-size: 1.3rem; }
  .auth-card p.sub { margin: 0 0 20px; color: var(--text-dim); font-size: .9rem; }
  .auth-card .switch { margin-top: 18px; font-size: .88rem; color: var(--text-dim); text-align: center; }
  .auth-card .switch a { color: var(--accent); text-decoration: none; font-weight: 600; }

  label { font-weight: 600; font-size: .85rem; display: flex; flex-direction: column; gap: 6px; }
  label .hint { font-weight: 400; color: var(--text-dim); font-size: .78rem; }
  input, textarea {
    padding: 10px 12px; border-radius: 9px; border: 1px solid var(--border);
    background: var(--bg); color: var(--text); font-size: .95rem; font-family: inherit;
  }
  input:focus, textarea:focus { outline: 2px solid var(--accent); outline-offset: 1px; }
  textarea { resize: vertical; }

  .error { background: #c4402a1a; border: 1px solid #c4402a55; color: #c4402a; padding: 10px 14px; border-radius: 9px; margin-bottom: 16px; font-size: .9rem; }
  .empty { text-align: center; padding: 64px 16px; color: var(--text-dim); }
  .empty a { color: var(--accent); text-decoration: none; font-weight: 600; }
</style>
</head>
<body>
<header class="top">
  <div class="inner">
    <a class="brand" href="/"><span class="logo">🦔</span><span>ShareHog</span></a>
    <nav>
      ${user
        ? `<span class="who">hi, ${escapeHtml(user.username)}</span><a href="/logout">log out</a><a class="btn small" href="/new">+ new listing</a>`
        : `<a href="/login">log in</a><a class="btn small" href="/register">sign up</a>`}
    </nav>
  </div>
</header>
<div class="wrap">
${error ? `<div class="error">${escapeHtml(error)}</div>` : ""}
${body}
</div>
</body>
</html>`;
}

function listingCard(listing, currentUser) {
  const thumb = listing.image_url
    ? `<img class="thumb" src="${escapeHtml(listing.image_url)}" alt="" loading="lazy" onerror="this.outerHTML='<div class=&quot;thumb placeholder&quot;>🔗</div>'">`
    : `<div class="thumb placeholder">🔗</div>`;
  const title = listing.title ? escapeHtml(listing.title) : escapeHtml(listing.url);
  const desc = listing.description ? `<p class="desc">${escapeHtml(listing.description)}</p>` : "";
  const mine = currentUser && currentUser.id === listing.user_id;
  const ownerActions = mine
    ? `<div class="owner-actions">
         <a class="btn ghost small" href="/listings/${listing.id}/edit">edit</a>
         <form method="POST" action="/listings/${listing.id}/delete" onsubmit="return confirm('delete this listing?')">
           <button class="btn danger small" type="submit">delete</button>
         </form>
       </div>`
    : "";
  const clickPayload = escapeHtml(
    JSON.stringify({ listing_id: listing.id, url: listing.url, title: listing.title || null })
  );
  const trackClick = `onclick="window.posthog && window.posthog.capture('listing_clicked', ${clickPayload})"`;
  return `<div class="card">
    <a href="${escapeHtml(listing.url)}" target="_blank" rel="noopener noreferrer" ${trackClick}>${thumb}</a>
    <div class="body">
      <h3><a href="${escapeHtml(listing.url)}" target="_blank" rel="noopener noreferrer" ${trackClick}>${title}</a></h3>
      <div class="url">${escapeHtml(listing.url)}</div>
      ${desc}
      <div class="foot">
        <span>by ${escapeHtml(listing.username)}</span>
        ${ownerActions}
      </div>
    </div>
  </div>`;
}

// ---------- route handlers ----------

async function handleFeed(request, env, user) {
  const { results } = await env.DB.prepare(
    "SELECT listings.*, users.username FROM listings JOIN users ON users.id = listings.user_id ORDER BY listings.created_at DESC"
  ).all();
  const body = results.length
    ? `<h1 class="page-title">what people are vibe coding</h1><div class="grid">${results
        .map((l) => listingCard(l, user))
        .join("\n")}</div>`
    : `<h1 class="page-title">what people are vibe coding</h1><div class="empty">no listings yet — <a href="/new">be the first to share</a></div>`;
  return htmlResponse(layout({ title: "Listings", user, body, wide: true, env }));
}

function registerForm(env, error) {
  const body = `<div class="auth-card">
    <h1>create an account</h1>
    <p class="sub">pick a username and password for the workshop</p>
    <form method="POST" action="/register">
      <label>username <input name="username" required maxlength="40" autocomplete="username"></label>
      <label>password <input name="password" type="password" required minlength="4" autocomplete="new-password"><span class="hint">4+ characters</span></label>
      <button class="btn" type="submit">sign up</button>
    </form>
    <div class="switch">already have an account? <a href="/login">log in</a></div>
  </div>`;
  return layout({ title: "Sign up", user: null, body, error, env });
}

function loginForm(env, error) {
  const body = `<div class="auth-card">
    <h1>welcome back</h1>
    <p class="sub">log in to share and browse listings</p>
    <form method="POST" action="/login">
      <label>username <input name="username" required autocomplete="username"></label>
      <label>password <input name="password" type="password" required autocomplete="current-password"></label>
      <button class="btn" type="submit">log in</button>
    </form>
    <div class="switch">new here? <a href="/register">sign up</a></div>
  </div>`;
  return layout({ title: "Log in", user: null, body, error, env });
}

async function router(request, env) {
  const url = new URL(request.url);
  const { pathname } = url;
  const user = await getSessionUser(request, env);

  if (pathname === "/" && request.method === "GET") {
    if (!user) return redirect("/login");
    return handleFeed(request, env, user);
  }

  if (pathname === "/register" && request.method === "GET") {
    if (user) return redirect("/");
    return htmlResponse(registerForm(env));
  }

  if (pathname === "/register" && request.method === "POST") {
    const form = await request.formData();
    const username = (form.get("username") || "").toString().trim();
    const password = (form.get("password") || "").toString();
    if (!username || password.length < 4) {
      return htmlResponse(registerForm(env, "username required, password needs 4+ characters"), 400);
    }
    const existing = await env.DB.prepare("SELECT id FROM users WHERE username = ?").bind(username).first();
    if (existing) {
      return htmlResponse(registerForm(env, "that username is taken"), 400);
    }
    const { salt, hash } = await hashPassword(password);
    const result = await env.DB.prepare(
      "INSERT INTO users (username, salt, password_hash) VALUES (?, ?, ?)"
    ).bind(username, salt, hash).run();
    const userId = result.meta.last_row_id;
    const sid = newSessionId();
    const expiresAt = new Date(Date.now() + SESSION_DAYS * 86400 * 1000).toISOString();
    await env.DB.prepare("INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)")
      .bind(sid, userId, expiresAt)
      .run();
    const posthog = getPostHog(env);
    if (posthog) {
      posthog.identify({ distinctId: String(userId), properties: { username } });
      posthog.capture({ distinctId: String(userId), event: "user_registered" });
      await posthog.flush();
    }
    return redirect("/", { "Set-Cookie": setCookieHeader(request, sid, SESSION_DAYS * 86400) });
  }

  if (pathname === "/login" && request.method === "GET") {
    if (user) return redirect("/");
    return htmlResponse(loginForm(env));
  }

  if (pathname === "/login" && request.method === "POST") {
    const form = await request.formData();
    const username = (form.get("username") || "").toString().trim();
    const password = (form.get("password") || "").toString();
    const row = await env.DB.prepare("SELECT id, username, salt, password_hash FROM users WHERE username = ?")
      .bind(username)
      .first();
    if (!row || !(await verifyPassword(password, row.salt, row.password_hash))) {
      return htmlResponse(loginForm(env, "wrong username or password"), 400);
    }
    const sid = newSessionId();
    const expiresAt = new Date(Date.now() + SESSION_DAYS * 86400 * 1000).toISOString();
    await env.DB.prepare("INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)")
      .bind(sid, row.id, expiresAt)
      .run();
    const posthog = getPostHog(env);
    if (posthog) {
      posthog.identify({ distinctId: String(row.id), properties: { username: row.username } });
      posthog.capture({ distinctId: String(row.id), event: "user_logged_in" });
      await posthog.flush();
    }
    return redirect("/", { "Set-Cookie": setCookieHeader(request, sid, SESSION_DAYS * 86400) });
  }

  if (pathname === "/logout" && request.method === "GET") {
    const cookies = parseCookies(request);
    if (cookies.sid) {
      await env.DB.prepare("DELETE FROM sessions WHERE id = ?").bind(cookies.sid).run();
    }
    if (user) await captureEvent(env, String(user.id), "user_logged_out");
    return redirect("/login", { "Set-Cookie": setCookieHeader(request, "", 0) });
  }

  if (pathname === "/new" && request.method === "GET") {
    if (!user) return redirect("/login");
    return htmlResponse(layout({ title: "New listing", user, body: newListingFormBody(), env }));
  }

  if (pathname === "/new" && request.method === "POST") {
    if (!user) return redirect("/login");
    const form = await request.formData();
    const listingUrl = (form.get("url") || "").toString().trim();
    const title = (form.get("title") || "").toString().trim();
    const imageUrl = (form.get("image_url") || "").toString().trim();
    const description = (form.get("description") || "").toString().trim();
    if (!listingUrl) {
      const body = newListingFormBody({ url: listingUrl, title, image_url: imageUrl, description });
      return htmlResponse(layout({ title: "New listing", user, body, error: "url is required", env }), 400);
    }
    await env.DB.prepare(
      "INSERT INTO listings (user_id, url, title, description, image_url) VALUES (?, ?, ?, ?, ?)"
    )
      .bind(user.id, listingUrl, title || null, description || null, imageUrl || null)
      .run();
    await captureEvent(env, String(user.id), "listing_created", {
      has_title: Boolean(title),
      has_image: Boolean(imageUrl),
      has_description: Boolean(description),
    });
    return redirect("/");
  }

  if (pathname.startsWith("/listings/") && pathname.endsWith("/edit") && request.method === "GET") {
    if (!user) return redirect("/login");
    const id = pathname.split("/")[2];
    const listing = await env.DB.prepare("SELECT * FROM listings WHERE id = ? AND user_id = ?")
      .bind(id, user.id)
      .first();
    if (!listing) return htmlResponse(layout({ title: "Not found", user, body: `<p>listing not found</p>`, env }), 404);
    const body = listingFormBody({
      action: `/listings/${id}/edit`,
      heading: "edit your listing",
      sub: "only the url is required",
      submitLabel: "save changes",
      values: listing,
    });
    return htmlResponse(layout({ title: "Edit listing", user, body, env }));
  }

  if (pathname.startsWith("/listings/") && pathname.endsWith("/edit") && request.method === "POST") {
    if (!user) return redirect("/login");
    const id = pathname.split("/")[2];
    const existing = await env.DB.prepare("SELECT id FROM listings WHERE id = ? AND user_id = ?")
      .bind(id, user.id)
      .first();
    if (!existing) return htmlResponse(layout({ title: "Not found", user, body: `<p>listing not found</p>`, env }), 404);
    const form = await request.formData();
    const listingUrl = (form.get("url") || "").toString().trim();
    const title = (form.get("title") || "").toString().trim();
    const imageUrl = (form.get("image_url") || "").toString().trim();
    const description = (form.get("description") || "").toString().trim();
    if (!listingUrl) {
      const body = listingFormBody({
        action: `/listings/${id}/edit`,
        heading: "edit your listing",
        sub: "only the url is required",
        submitLabel: "save changes",
        values: { url: listingUrl, title, image_url: imageUrl, description },
      });
      return htmlResponse(layout({ title: "Edit listing", user, body, error: "url is required", env }), 400);
    }
    await env.DB.prepare(
      "UPDATE listings SET url = ?, title = ?, description = ?, image_url = ? WHERE id = ? AND user_id = ?"
    )
      .bind(listingUrl, title || null, description || null, imageUrl || null, id, user.id)
      .run();
    await captureEvent(env, String(user.id), "listing_updated", {
      has_title: Boolean(title),
      has_image: Boolean(imageUrl),
      has_description: Boolean(description),
    });
    return redirect("/");
  }

  if (pathname.startsWith("/listings/") && pathname.endsWith("/delete") && request.method === "POST") {
    if (!user) return redirect("/login");
    const id = pathname.split("/")[2];
    await env.DB.prepare("DELETE FROM listings WHERE id = ? AND user_id = ?").bind(id, user.id).run();
    await captureEvent(env, String(user.id), "listing_deleted");
    return redirect("/");
  }

  return htmlResponse(layout({ title: "Not found", user, body: `<p>page not found</p>`, env }), 404);
}

function listingFormBody({ action, heading, sub, submitLabel, values = {} }) {
  const v = (k) => escapeHtml(values[k] || "");
  return `<div class="auth-card">
    <h1>${escapeHtml(heading)}</h1>
    <p class="sub">${escapeHtml(sub)}</p>
    <form method="POST" action="${action}">
      <label>url * <input name="url" type="url" required placeholder="https://your-vibe-coded-site.com" value="${v("url")}"></label>
      <label>title <input name="title" maxlength="120" placeholder="My Vibe App" value="${v("title")}"></label>
      <label>image url <span class="hint">optional — a screenshot or logo</span><input name="image_url" type="url" placeholder="https://.../screenshot.png" value="${v("image_url")}"></label>
      <label>description <textarea name="description" rows="4" maxlength="500" placeholder="what it does, what you used to build it...">${v("description")}</textarea></label>
      <button class="btn" type="submit">${escapeHtml(submitLabel)}</button>
    </form>
  </div>`;
}

function newListingFormBody(values = {}) {
  return listingFormBody({
    action: "/new",
    heading: "share your site",
    sub: "only the url is required",
    submitLabel: "share it",
    values,
  });
}

export default {
  async fetch(request, env) {
    const posthog = getPostHog(env);

    try {
      return await router(request, env);
    } catch (err) {
      if (posthog) {
        posthog.captureException(err);
        await posthog.flush();
      }
      return new Response("Internal error: " + err.message, { status: 500 });
    }
  },
};
