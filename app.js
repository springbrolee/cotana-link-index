const STORAGE_KEY = "cotana.linkIndex.links.v1";
const seedLinks = Array.isArray(window.LINK_INDEX_DATA) ? window.LINK_INDEX_DATA : [];
let links = loadLinks();

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
let activeDetailId = "";

const collator = new Intl.Collator("ko-KR", { numeric: true, sensitivity: "base" });

function loadLinks() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return mergeSeedData(JSON.parse(stored));
  } catch {
    localStorage.removeItem(STORAGE_KEY);
  }
  return seedLinks.map((link) => ({ ...link }));
}

function mergeSeedData(items) {
  return items.map((item) => {
    const seed = seedLinks.find((link) => link.id === item.id || link.url === item.url);
    if (!seed) return item;
    return {
      ...seed,
      ...item,
      detail: item.detail || seed.detail || item.summary || seed.summary || "",
    };
  });
}

function persist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(links));
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
  const opened = link.openedAt ? `Opened ${escapeHtml(formatDate(link.openedAt))}` : "Not opened";

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
          <span>${opened}</span>
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
  emptyState.classList.toggle("visible", visible.length === 0);
  totalCount.textContent = String(links.length);
  domainCount.textContent = String(new Set(links.map((link) => link.domain)).size);
  if (activeDetailId) renderDetail();
}

function markOpened(id) {
  updateLink(id, {
    status: "완료",
    openedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
}

function updateLink(id, patch) {
  links = links.map((link) => (link.id === id ? { ...link, ...patch } : link));
  persist();
  render();
}

function deleteLink(id) {
  const link = links.find((item) => item.id === id);
  if (!link) return false;
  const ok = window.confirm(`Delete this card?\n\n${link.title || link.url}`);
  if (!ok) return false;
  links = links.filter((item) => item.id !== id);
  persist();
  if (activeDetailId === id) closeDetail();
  render();
  return true;
}

function addLink(event) {
  event.preventDefault();
  let parsed;
  try {
    parsed = new URL(urlInput.value);
  } catch {
    urlInput.focus();
    return;
  }

  const url = parsed.toString();
  const now = new Date().toISOString();
  const existing = links.find((link) => link.url === url);
  const summary = summaryInput.value.trim();
  const item = {
    id: existing?.id || createId(url),
    url,
    sourceUrl: "",
    title: titleInput.value.trim() || url,
    domain: parsed.hostname.replace(/^www\./, ""),
    summary: clipText(summary, 260),
    detail: summary,
    image: "",
    tags: parseTags(tagsInput.value),
    status: existing?.status || "읽기 전",
    savedAt: existing?.savedAt || now,
    updatedAt: now,
  };

  links = existing ? links.map((link) => (link.id === existing.id ? item : link)) : [item, ...links];
  persist();
  addForm.reset();
  render();
}

function parseTags(value) {
  return [...new Set(String(value || "읽을거리").split(",").map((tag) => tag.trim()).filter(Boolean))];
}

function createId(value) {
  const encoded = btoa(unescape(encodeURIComponent(value))).replace(/[^a-z0-9]/gi, "");
  return encoded.slice(0, 16) || String(Date.now());
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

function resetLocalEdits() {
  const ok = window.confirm("Reset local edits and reload the original links-data.js cards?");
  if (!ok) return;
  localStorage.removeItem(STORAGE_KEY);
  links = seedLinks.map((link) => ({ ...link }));
  closeDetail();
  render();
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
  const source = link.sourceUrl && link.sourceUrl !== link.url ? link.sourceUrl : "";
  const opened = link.openedAt ? formatDate(link.openedAt) : "아직 열람 전";
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
        <dt>Opened</dt>
        <dd>${escapeHtml(opened)}</dd>
      </div>
      <div>
        <dt>Updated</dt>
        <dd>${escapeHtml(updated || "-")}</dd>
      </div>
      <div>
        <dt>URL</dt>
        <dd class="detail-url">${escapeHtml(link.url)}</dd>
      </div>
      ${source ? `
      <div>
        <dt>Original share</dt>
        <dd class="detail-url">${escapeHtml(source)}</dd>
      </div>` : ""}
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
  updateLink(select.dataset.id, {
    status: select.value,
    updatedAt: new Date().toISOString(),
  });
});

addForm.addEventListener("submit", addLink);
exportButton.addEventListener("click", exportJson);
resetButton.addEventListener("click", resetLocalEdits);
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
  updateLink(select.dataset.id, {
    status: select.value,
    updatedAt: new Date().toISOString(),
  });
});
detailClose.addEventListener("click", closeDetail);
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && activeDetailId) closeDetail();
});

render();
