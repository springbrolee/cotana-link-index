const SUPABASE_URL = "https://vzttlkatauvijjeqdldk.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ6dHRsa2F0YXV2aWpqZXFkbGRrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE3NjA1MzEsImV4cCI6MjA5NzMzNjUzMX0.6ycVzDnpRREPi8Zg_J4IeGE0Exo-F2W0GV4N97wINxY";

const seedLinks = Array.isArray(window.LINK_INDEX_DATA) ? window.LINK_INDEX_DATA : [];
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let links = [];
let activeDetailId = "";
let currentUser = null;

const authPanel = document.querySelector("#authPanel");
const authForm = document.querySelector("#authForm");
const authMessage = document.querySelector("#authMessage");
const emailInput = document.querySelector("#emailInput");
const passwordInput = document.querySelector("#passwordInput");
const signOutButton = document.querySelector("#signOutButton");
const workspace = document.querySelector("#workspace");
const cards = document.querySelector("#cards");
const emptyState = document.querySelector("#emptyState");
const searchInput = document.querySelector("#searchInput");
const tagFilter = document.querySelector("#tagFilter");
const statusFilter = document.querySelector("#statusFilter");
const sortSelect = document.querySelector("#sortSelect");
const totalCount = document.querySelector("#totalCount");
const domainCount = document.querySelector("#domainCount");
const addForm = document.querySelector("#addForm");
const urlInput = document.querySelector("#urlInput");
const titleInput = document.querySelector("#titleInput");
const tagsInput = document.querySelector("#tagsInput");
const summaryInput = document.querySelector("#summaryInput");
const exportButton = document.querySelector("#exportButton");
const resetButton = document.querySelector("#resetButton");
const detailPanel = document.querySelector("#detailPanel");
const detailContent = document.querySelector("#detailContent");
const detailClose = document.querySelector("#detailClose");

const collator = new Intl.Collator("ko-KR", { numeric: true, sensitivity: "base" });

function setMessage(message, kind = "") {
  authMessage.textContent = message;
  authMessage.dataset.kind = kind;
}

async function initialize() {
  const { data } = await supabase.auth.getSession();
  await applySession(data.session);
  supabase.auth.onAuthStateChange((_event, session) => {
    applySession(session);
  });
}

async function applySession(session) {
  currentUser = session?.user || null;
  authPanel.hidden = Boolean(currentUser);
  workspace.hidden = !currentUser;
  signOutButton.hidden = !currentUser;

  if (!currentUser) {
    links = [];
    closeDetail();
    render();
    setMessage("Sign in to sync links with Supabase.");
    return;
  }

  setMessage(`Signed in as ${currentUser.email || "user"}.`, "ok");
  await loadLinks();
}

async function loadLinks() {
  const { data, error } = await supabase
    .from("links")
    .select("id,title,url,summary,tags,status,created_at,updated_at,user_id")
    .order("created_at", { ascending: false });

  if (error) {
    setMessage(`Supabase load failed: ${error.message}`, "error");
    links = [];
  } else {
    links = (data || []).map(fromRow);
  }
  render();
}

function fromRow(row) {
  return {
    id: row.id,
    url: row.url,
    sourceUrl: "",
    title: row.title,
    domain: getDomain(row.url),
    summary: row.summary || "",
    detail: row.summary || "",
    image: "",
    tags: row.tags || [],
    status: row.status || "읽기 전",
    savedAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toInsertPayload(item) {
  return {
    title: item.title,
    url: item.url,
    summary: item.summary || "",
    tags: item.tags || [],
    status: item.status || "읽기 전",
    user_id: currentUser.id,
  };
}

function toUpdatePayload(patch) {
  return {
    ...patch,
    updated_at: new Date().toISOString(),
  };
}

function normalize(value) {
  return String(value || "").toLowerCase();
}

function formatDate(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}

function getDomain(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "unknown";
  }
}

function fallbackInitial(domain) {
  const cleaned = String(domain || "link").replace(/^www\./, "");
  return cleaned.slice(0, 1).toUpperCase();
}

function allTags() {
  return [...new Set(links.flatMap((link) => link.tags || []))]
    .filter(Boolean)
    .sort(collator.compare);
}

function renderTagOptions() {
  const selected = tagFilter.value;
  tagFilter.innerHTML = '<option value="all">All tags</option>';
  for (const tag of allTags()) {
    const option = document.createElement("option");
    option.value = tag;
    option.textContent = tag;
    tagFilter.append(option);
  }
  tagFilter.value = [...tagFilter.options].some((option) => option.value === selected) ? selected : "all";
}

function cardTemplate(link) {
  const tags = (link.tags || []).map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join("");
  const thumb = link.image
    ? `<img src="${escapeAttr(link.image)}" alt="">`
    : `<div class="thumb-fallback">${escapeHtml(fallbackInitial(link.domain))}</div>`;

  return `
    <article class="card js-card" data-id="${escapeAttr(link.id)}" data-domain="${escapeAttr(link.domain)}" tabindex="0" aria-label="Open summary for ${escapeAttr(link.title || link.url)}">
      <div class="thumb">${thumb}</div>
      <div class="content">
        <div class="meta">
          <span class="domain">${escapeHtml(link.domain)}</span>
          <span class="status ${statusClass(link.status)}">${escapeHtml(link.status || "읽기 전")}</span>
        </div>
        <h2 class="title">${escapeHtml(link.title || link.url)}</h2>
        <p class="summary">${escapeHtml(link.summary || "No summary captured yet.")}</p>
        <div class="tags">${tags}</div>
        <div class="actions">
          <a class="open js-open" href="${escapeAttr(link.url)}" target="_blank" rel="noopener noreferrer" data-id="${escapeAttr(link.id)}">Open</a>
          <select class="mini-select js-status" data-id="${escapeAttr(link.id)}" aria-label="Change status">
            ${statusOption("읽기 전", link.status)}
            ${statusOption("완료", link.status)}
            ${statusOption("보관", link.status)}
          </select>
          <button class="icon-button js-delete" type="button" data-id="${escapeAttr(link.id)}" aria-label="Delete card">Delete</button>
        </div>
        <div class="card-foot">
          <span>${escapeHtml(formatDate(link.savedAt))}</span>
          <span>${escapeHtml(formatDate(link.updatedAt))}</span>
        </div>
      </div>
    </article>
  `;
}

function statusOption(value, current) {
  return `<option value="${escapeAttr(value)}" ${value === current ? "selected" : ""}>${escapeHtml(value)}</option>`;
}

function statusClass(status) {
  if (status === "완료") return "done";
  if (status === "보관") return "archived";
  return "";
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttr(value) {
  return escapeHtml(value).replaceAll("`", "&#096;");
}

function filteredLinks() {
  const query = normalize(searchInput.value);
  const tag = tagFilter.value;
  const status = statusFilter.value;

  const result = links.filter((link) => {
    const haystack = normalize([
      link.title,
      link.summary,
      link.detail,
      link.domain,
      link.url,
      ...(link.tags || []),
    ].join(" "));
    const matchesQuery = !query || haystack.includes(query);
    const matchesTag = tag === "all" || (link.tags || []).includes(tag);
    const matchesStatus = status === "all" || link.status === status;
    return matchesQuery && matchesTag && matchesStatus;
  });

  if (sortSelect.value === "oldest") {
    result.sort((a, b) => new Date(a.savedAt) - new Date(b.savedAt));
  } else if (sortSelect.value === "domain") {
    result.sort((a, b) => collator.compare(a.domain || "", b.domain || ""));
  } else {
    result.sort((a, b) => new Date(b.savedAt) - new Date(a.savedAt));
  }

  return result;
}

function render() {
  renderTagOptions();
  const visible = filteredLinks();
  cards.innerHTML = visible.map(cardTemplate).join("");
  emptyState.classList.toggle("visible", Boolean(currentUser) && visible.length === 0);
  totalCount.textContent = String(links.length);
  domainCount.textContent = String(new Set(links.map((link) => link.domain)).size);
  if (activeDetailId) renderDetail();
}

async function updateLink(id, patch) {
  const { error } = await supabase
    .from("links")
    .update(toUpdatePayload(patch))
    .eq("id", id);

  if (error) {
    setMessage(`Update failed: ${error.message}`, "error");
    await loadLinks();
    return;
  }
  links = links.map((link) => (link.id === id ? { ...link, ...patch, updatedAt: new Date().toISOString() } : link));
  render();
}

async function markOpened(id) {
  await updateLink(id, { status: "완료" });
}

async function deleteLink(id) {
  const link = links.find((item) => item.id === id);
  if (!link) return false;
  const ok = window.confirm(`Delete this card?\n\n${link.title || link.url}`);
  if (!ok) return false;

  const { error } = await supabase.from("links").delete().eq("id", id);
  if (error) {
    setMessage(`Delete failed: ${error.message}`, "error");
    return false;
  }

  links = links.filter((item) => item.id !== id);
  if (activeDetailId === id) closeDetail();
  render();
  return true;
}

async function addLink(event) {
  event.preventDefault();
  let parsed;
  try {
    parsed = new URL(urlInput.value);
  } catch {
    urlInput.focus();
    return;
  }

  const url = parsed.toString();
  const summary = summaryInput.value.trim();
  const existing = links.find((link) => link.url === url);
  const payload = {
    title: titleInput.value.trim() || url,
    url,
    summary: clipText(summary, 1200),
    tags: parseTags(tagsInput.value),
    status: existing?.status || "읽기 전",
  };

  const request = existing
    ? supabase.from("links").update(toUpdatePayload(payload)).eq("id", existing.id).select().single()
    : supabase.from("links").insert(toInsertPayload(payload)).select().single();

  const { data, error } = await request;
  if (error) {
    setMessage(`Save failed: ${error.message}`, "error");
    return;
  }

  const next = fromRow(data);
  links = existing ? links.map((link) => (link.id === existing.id ? next : link)) : [next, ...links];
  addForm.reset();
  setMessage(existing ? "Card updated in Supabase." : "Card added to Supabase.", "ok");
  render();
}

function parseTags(value) {
  return [...new Set(String(value || "읽을거리").split(",").map((tag) => tag.trim()).filter(Boolean))];
}

function clipText(value, length) {
  const cleaned = String(value || "").replace(/\s+/g, " ").trim();
  return cleaned.length > length ? `${cleaned.slice(0, length - 1)}...` : cleaned;
}

function exportJson() {
  const blob = new Blob([`${JSON.stringify(links, null, 2)}\n`], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `cotana-link-index-${new Date().toISOString().slice(0, 10)}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

async function importStarterData() {
  if (!seedLinks.length) return;
  const ok = window.confirm(`Import ${seedLinks.length} starter cards into your Supabase account?`);
  if (!ok) return;

  const existingUrls = new Set(links.map((link) => link.url));
  const payload = seedLinks
    .filter((link) => !existingUrls.has(link.url))
    .map((link) => toInsertPayload({
      title: link.title || link.url,
      url: link.url,
      summary: clipText(link.summary || link.detail || "", 1200),
      tags: link.tags || ["읽을거리"],
      status: link.status || "읽기 전",
    }));

  if (!payload.length) {
    setMessage("Starter data is already imported.", "ok");
    return;
  }

  const { error } = await supabase.from("links").insert(payload);
  if (error) {
    setMessage(`Import failed: ${error.message}`, "error");
    return;
  }
  setMessage("Starter data imported.", "ok");
  await loadLinks();
}

function showDetail(id) {
  activeDetailId = id;
  renderDetail();
  detailPanel.classList.add("visible");
  detailPanel.setAttribute("aria-hidden", "false");
  detailClose.focus();
}

function closeDetail() {
  activeDetailId = "";
  detailPanel.classList.remove("visible");
  detailPanel.setAttribute("aria-hidden", "true");
  detailContent.innerHTML = "";
}

function renderDetail() {
  if (!activeDetailId) return;
  const link = links.find((item) => item.id === activeDetailId);
  if (!link) {
    closeDetail();
    return;
  }

  const tags = (link.tags || []).map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join("");
  const saved = link.savedAt ? formatDate(link.savedAt) : "";
  const updated = link.updatedAt ? formatDate(link.updatedAt) : "";
  const detail = link.detail || link.summary || "No summary captured yet.";

  detailContent.innerHTML = `
    <div class="detail-head">
      <p class="eyebrow">Summary page</p>
      <h2 id="detailTitle">${escapeHtml(link.title || link.url)}</h2>
      <div class="detail-meta">
        <span>${escapeHtml(link.domain || "unknown domain")}</span>
        <span class="status ${statusClass(link.status)}">${escapeHtml(link.status || "읽기 전")}</span>
      </div>
    </div>

    <div class="detail-summary">
      ${formatDetail(detail)}
    </div>

    <div class="tags detail-tags">${tags}</div>

    <dl class="detail-list">
      <div>
        <dt>Saved</dt>
        <dd>${escapeHtml(saved || "-")}</dd>
      </div>
      <div>
        <dt>Updated</dt>
        <dd>${escapeHtml(updated || "-")}</dd>
      </div>
      <div>
        <dt>URL</dt>
        <dd class="detail-url">${escapeHtml(link.url)}</dd>
      </div>
    </dl>

    <div class="detail-actions">
      <a class="open js-detail-open" href="${escapeAttr(link.url)}" target="_blank" rel="noopener noreferrer" data-id="${escapeAttr(link.id)}">Open original</a>
      <select class="mini-select js-detail-status" data-id="${escapeAttr(link.id)}" aria-label="Change detail status">
        ${statusOption("읽기 전", link.status)}
        ${statusOption("완료", link.status)}
        ${statusOption("보관", link.status)}
      </select>
      <button class="button danger js-detail-delete" type="button" data-id="${escapeAttr(link.id)}">Delete card</button>
    </div>
  `;
}

function cardControl(target) {
  return target.closest("a, button, select, input, textarea");
}

function formatDetail(value) {
  const lines = String(value || "").replace(/\r\n/g, "\n").split("\n");
  let html = "";
  let inList = false;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      if (inList) {
        html += "</ul>";
        inList = false;
      }
      continue;
    }

    const heading = line.match(/^(#{2,4})\s+(.+)$/);
    if (heading) {
      if (inList) {
        html += "</ul>";
        inList = false;
      }
      html += `<h3>${formatInline(heading[2])}</h3>`;
      continue;
    }

    const listItem = line.match(/^[-*]\s+(.+)$/);
    if (listItem) {
      if (!inList) {
        html += "<ul>";
        inList = true;
      }
      html += `<li>${formatInline(listItem[1])}</li>`;
      continue;
    }

    if (inList) {
      html += "</ul>";
      inList = false;
    }
    html += `<p>${formatInline(line)}</p>`;
  }

  if (inList) html += "</ul>";
  return html || "<p>No summary captured yet.</p>";
}

function formatInline(value) {
  return escapeHtml(value)
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/`([^`]+)`/g, "<code>$1</code>");
}

async function handleAuth(event) {
  event.preventDefault();
  const submitter = event.submitter;
  const mode = submitter?.dataset.authMode || "signin";
  const email = emailInput.value.trim();
  const password = passwordInput.value;
  setMessage(mode === "signup" ? "Creating account..." : "Signing in...");

  const { error } = mode === "signup"
    ? await supabase.auth.signUp({ email, password })
    : await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    setMessage(error.message, "error");
    return;
  }

  if (mode === "signup") {
    setMessage("Account created. If Supabase asks for email confirmation, confirm it and sign in.", "ok");
  } else {
    setMessage("Signed in.", "ok");
  }
}

cards.addEventListener("click", (event) => {
  const open = event.target.closest(".js-open");
  const remove = event.target.closest(".js-delete");
  const card = event.target.closest(".js-card");
  if (open) {
    markOpened(open.dataset.id);
    return;
  }
  if (remove) {
    deleteLink(remove.dataset.id);
    return;
  }
  if (card && !cardControl(event.target)) showDetail(card.dataset.id);
});

cards.addEventListener("keydown", (event) => {
  const card = event.target.closest(".js-card");
  if (cardControl(event.target)) return;
  if (!card || (event.key !== "Enter" && event.key !== " ")) return;
  event.preventDefault();
  showDetail(card.dataset.id);
});

cards.addEventListener("change", (event) => {
  const select = event.target.closest(".js-status");
  if (!select) return;
  updateLink(select.dataset.id, { status: select.value });
});

authForm.addEventListener("submit", handleAuth);
signOutButton.addEventListener("click", () => supabase.auth.signOut());
addForm.addEventListener("submit", addLink);
exportButton.addEventListener("click", exportJson);
resetButton.addEventListener("click", importStarterData);
searchInput.addEventListener("input", render);
tagFilter.addEventListener("change", render);
statusFilter.addEventListener("change", render);
sortSelect.addEventListener("change", render);
detailPanel.addEventListener("click", (event) => {
  if (event.target.matches("[data-detail-close]")) {
    closeDetail();
    return;
  }

  const open = event.target.closest(".js-detail-open");
  const remove = event.target.closest(".js-detail-delete");
  if (open) {
    markOpened(open.dataset.id);
    return;
  }
  if (remove) deleteLink(remove.dataset.id);
});
detailPanel.addEventListener("change", (event) => {
  const select = event.target.closest(".js-detail-status");
  if (!select) return;
  updateLink(select.dataset.id, { status: select.value });
});
detailClose.addEventListener("click", closeDetail);
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && activeDetailId) closeDetail();
});

initialize();
