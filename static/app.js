"use strict";
(() => {
  // src/modules/theme.ts
  function initTheme() {
    applyTheme(localStorage.getItem("scraperkit_theme") || "dark");
  }
  function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("scraperkit_theme", theme);
    const dark = theme === "dark";
    document.getElementById("icon-sun")?.classList.toggle("hidden", dark);
    document.getElementById("icon-moon")?.classList.toggle("hidden", !dark);
  }
  function toggleTheme() {
    applyTheme(document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark");
  }

  // src/modules/ui.ts
  function sanitizeErrorMessage(msg) {
    let text = String(msg || "Unknown error");
    text = text.replace(/AIza[0-9A-Za-z\-_]{20,}/g, "[REDACTED_API_KEY]");
    text = text.replace(/\b(sk|pk)_[A-Za-z0-9\-_]{16,}\b/g, "[REDACTED_API_KEY]");
    text = text.replace(/\b[A-Za-z0-9_\-]{24,}\b/g, (token) => {
      const looksLikeKey = /[A-Z]/.test(token) && /[a-z]/.test(token) && /\d/.test(token);
      return looksLikeKey ? "[REDACTED]" : token;
    });
    text = text.replace(/([?&](?:api_key|apikey|key|token|access_token)=)[^&\s]+/gi, "$1[REDACTED]");
    text = text.replace(/((?:api_key|apikey|key|token|access_token)\s*[:=]\s*)[^\s,]+/gi, "$1[REDACTED]");
    text = text.replace(/(\"(?:api_key|apikey|key|token|access_token)\"\s*:\s*\")[^\"]+(\")\/gi/, "$1[REDACTED]$2");
    return text;
  }
  async function safeJson(res) {
    try {
      const data = await res.json();
      if (data && typeof data.error === "string") {
        data.error = sanitizeErrorMessage(data.error);
      }
      return data;
    } catch {
      return { error: `Request failed with status ${res.status}` };
    }
  }
  function showError(msg) {
    const el = document.getElementById("error-banner");
    if (!el) return;
    el.textContent = sanitizeErrorMessage(msg);
    el.classList.remove("hidden");
    clearTimeout(el._t);
    el._t = setTimeout(() => el.classList.add("hidden"), 8e3);
  }
  function showLoading(tbodyId, cols) {
    const tbody = document.getElementById(tbodyId);
    if (!tbody) return;
    tbody.innerHTML = "";
    for (let i = 0; i < 6; i++) {
      const tr = document.createElement("tr");
      for (let c = 0; c < cols; c++) {
        const td = document.createElement("td");
        if (c === 0) td.innerHTML = '<span class="skeleton skeleton-thumb"></span>';
        else if (c === 1) td.innerHTML = '<span class="skeleton skeleton-text-long"></span>';
        else td.innerHTML = '<span class="skeleton skeleton-text-short"></span>';
        tr.appendChild(td);
      }
      tbody.appendChild(tr);
    }
  }
  function setBtnLoading(id, loading) {
    const btn = document.getElementById(id);
    if (!btn) return;
    btn.disabled = loading;
    btn._orig = btn._orig || btn.textContent;
    btn.textContent = loading ? "Loading\u2026" : btn._orig;
  }
  function numCell(val, extra = "") {
    const td = document.createElement("td");
    td.className = ("num-cell " + extra).trim();
    td.textContent = formatNum(val);
    return td;
  }
  function emptyRow(cols, msg) {
    return `<tr class="empty-row"><td colspan="${cols}"><div class="empty-state"><div class="empty-icon">\u25CC</div><div>${msg}</div></div></td></tr>`;
  }
  function thumbPlaceholder(icon) {
    const d = document.createElement("div");
    d.className = "thumb-placeholder";
    d.textContent = icon;
    return d;
  }
  function avatarPlaceholder(username, small = false) {
    const d = document.createElement("div");
    d.className = small ? "avatar-placeholder avatar-placeholder-sm" : "avatar-placeholder";
    d.textContent = username ? username[0].toUpperCase() : "?";
    return d;
  }
  function getTimestamp() {
    const n = /* @__PURE__ */ new Date();
    const p = (x) => String(x).padStart(2, "0");
    return `${n.getFullYear()}-${p(n.getMonth() + 1)}-${p(n.getDate())}_${p(n.getHours())}-${p(n.getMinutes())}`;
  }
  function formatNum(n) {
    n = Number(n);
    if (!n && n !== 0) return "\u2014";
    if (n >= 1e6) return (n / 1e6).toFixed(1) + "M";
    if (n >= 1e3) return (n / 1e3).toFixed(1) + "K";
    return String(n);
  }
  function formatDate(iso) {
    if (!iso) return "\u2014";
    try {
      const d = new Date(iso);
      return `${String(d.getDate()).padStart(2, "0")} ${d.toLocaleString("en", { month: "short" })} ${d.getFullYear()}`;
    } catch {
      return iso;
    }
  }
  function formatDuration(secs) {
    secs = Number(secs) || 0;
    const h = Math.floor(secs / 3600);
    const m = Math.floor(secs % 3600 / 60);
    const s = secs % 60;
    if (h > 0) return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  function relativeTime(iso) {
    if (!iso) return "\u2014";
    try {
      const diff = Date.now() - new Date(iso).getTime();
      const s = Math.floor(diff / 1e3);
      if (s < 60) return "just now";
      const m = Math.floor(s / 60);
      if (m < 60) return `${m}m ago`;
      const h = Math.floor(m / 60);
      if (h < 24) return `${h}h ago`;
      const d = Math.floor(h / 24);
      if (d < 30) return `${d}d ago`;
      const mo = Math.floor(d / 30);
      if (mo < 12) return `${mo}mo ago`;
      return `${Math.floor(mo / 12)}y ago`;
    } catch {
      return "\u2014";
    }
  }
  function truncate(str, len) {
    return str && str.length > len ? str.slice(0, len) + "\u2026" : str || "";
  }
  function escHtml(str) {
    return String(str || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function showProfileCardSkeleton(cardId) {
    const card = document.getElementById(cardId);
    if (!card) return;
    card.classList.remove("hidden");
    card.classList.add("loading");
  }
  function hideProfileCardSkeleton(cardId) {
    const card = document.getElementById(cardId);
    if (!card) return;
    card.classList.remove("loading");
  }

  // src/modules/keys.ts
  var keyStatus = { tiktok: false, youtube: false, instagram: false, "ig-session": false };
  function requireKey(p) {
    if (!keyStatus[p]) {
      const label = {
        tiktok: "Apify",
        youtube: "YouTube Data API v3",
        instagram: "Apify",
        "ig-session": "Instagram Session ID"
      };
      showError(`No ${label[p]} key set. Click "API Keys" to add one.`);
      return null;
    }
    return true;
  }
  var keysOpen = false;
  function toggleKeys() {
    keysOpen = !keysOpen;
    document.getElementById("keys-drawer")?.classList.toggle("hidden", !keysOpen);
    document.getElementById("keys-overlay")?.classList.toggle("hidden", !keysOpen);
    document.getElementById("btn-keys")?.classList.toggle("active", keysOpen);
    if (keysOpen) refreshKeyStatuses();
  }
  async function refreshKeyStatuses() {
    try {
      const res = await fetch("/keys/status");
      const data = await res.json();
      for (const p of ["tiktok", "youtube", "instagram"]) {
        keyStatus[p] = !!data[p];
      }
    } catch {
    }
    renderKeyStatuses();
  }
  function renderKeyStatuses() {
    for (const p of ["tiktok", "youtube", "ig-session"]) {
      const el = document.getElementById(`${p}-key-status`);
      if (!el) continue;
      if (keyStatus[p]) {
        el.className = "key-status ok";
        el.textContent = p === "ig-session" ? "\u2713 Session saved (more comments enabled)" : "\u2713 Key saved";
      } else {
        el.className = "key-status warn";
        el.textContent = p === "ig-session" ? "\u2717 Not set (max ~5 comments)" : "\u2717 No key set";
      }
    }
  }
  function toggleEye(id, btn) {
    const inp = document.getElementById(id);
    if (!inp || !btn) return;
    inp.type = inp.type === "password" ? "text" : "password";
    btn.textContent = inp.type === "password" ? "\u{1F441}" : "\u{1F648}";
  }
  function setFeedback(el, type, msg) {
    el.className = `key-feedback ${type}`;
    el.textContent = msg;
  }
  async function saveKey(p) {
    const inp = document.getElementById(`${p}-key-input`);
    const fb = document.getElementById(`${p}-key-feedback`);
    if (!inp || !fb) return;
    const k = inp.value.trim();
    if (!k) {
      setFeedback(fb, "err", "Enter a key first.");
      return;
    }
    try {
      const res = await fetch("/keys/set", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platform: p, key: k })
      });
      if (!res.ok) throw new Error();
      inp.value = "";
      keyStatus[p] = true;
      setFeedback(fb, "ok", "Saved!");
      renderKeyStatuses();
      setTimeout(() => {
        fb.textContent = "";
        fb.className = "key-feedback";
      }, 2500);
    } catch {
      setFeedback(fb, "err", "Failed to save key.");
    }
  }
  async function clearKey(p) {
    const fb = document.getElementById(`${p}-key-feedback`);
    try {
      await fetch("/keys/clear", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platform: p })
      });
      keyStatus[p] = false;
      if (fb) {
        setFeedback(fb, "ok", "Cleared.");
        renderKeyStatuses();
        setTimeout(() => {
          fb.textContent = "";
          fb.className = "key-feedback";
        }, 2e3);
      }
    } catch {
      if (fb) setFeedback(fb, "err", "Failed to clear.");
    }
  }

  // src/modules/state.ts
  var currentPlatform = "tiktok";
  var ttVideosData = [];
  var ttCommentsData = [];
  var ytVideosData = [];
  var ytStatsData = [];
  var ytCommentsData = [];
  var ytSharedChannelInput = "";
  var igPostsData = [];
  var igCommentsData = [];
  function setCurrentPlatform(p) {
    currentPlatform = p;
  }
  function setTtVideosData(d) {
    ttVideosData = d;
  }
  function setTtCommentsData(d) {
    ttCommentsData = d;
  }
  function setYtVideosData(d) {
    ytVideosData = d;
  }
  function setYtStatsData(d) {
    ytStatsData = d;
  }
  function setYtCommentsData(d) {
    ytCommentsData = d;
  }
  function setYtSharedChannelInput(v) {
    ytSharedChannelInput = v;
  }
  function setIgPostsData(d) {
    igPostsData = d;
  }
  function setIgCommentsData(d) {
    igCommentsData = d;
  }

  // src/modules/nav.ts
  function switchPlatform(p) {
    setCurrentPlatform(p);
    document.querySelectorAll(".platform-tab").forEach((b) => {
      b.classList.toggle("active", b.dataset["platform"] === p);
    });
    document.querySelectorAll(".platform-panel").forEach((s) => {
      s.classList.toggle("hidden", s.id !== `platform-${p}`);
    });
  }
  function ytSyncChannelInput(val) {
    setYtSharedChannelInput(val);
    const ch = document.getElementById("yt-channel-id");
    if (ch && ch.value !== val) ch.value = val;
  }
  function ytSwitchTab(tab) {
    ["videos", "stats", "comments"].forEach((t) => {
      document.getElementById(`yt-panel-${t}`)?.classList.toggle("hidden", t !== tab);
      document.getElementById(`yt-tab-${t}`)?.classList.toggle("active", t === tab);
    });
    if (ytSharedChannelInput) {
      const ch = document.getElementById("yt-channel-id");
      if (ch) ch.value = ytSharedChannelInput;
    }
  }
  function igSwitchTab(tab) {
    ["posts", "comments"].forEach((t) => {
      document.getElementById(`ig-panel-${t}`)?.classList.toggle("hidden", t !== tab);
      document.getElementById(`ig-tab-${t}`)?.classList.toggle("active", t === tab);
    });
  }
  function ttSwitchTab(tab) {
    ["videos", "comments"].forEach((t) => {
      document.getElementById(`tt-panel-${t}`)?.classList.toggle("hidden", t !== tab);
      document.getElementById(`tt-tab-${t}`)?.classList.toggle("active", t === tab);
    });
  }

  // src/modules/export.ts
  function toCSV(rows) {
    if (!rows.length) return "";
    const headers = Object.keys(rows[0]);
    return [
      headers.join(","),
      ...rows.map(
        (row) => headers.map((h) => {
          const v = row[h] == null ? "" : String(row[h]);
          return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
        }).join(",")
      )
    ].join("\n");
  }
  function downloadBlob(content, filename, mime) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }
  function exportXLSX(data, sheetName, filename) {
    const XLSX = window.XLSX;
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
    XLSX.writeFile(wb, filename);
  }

  // src/modules/tiktok.ts
  function ttRenderProfile(profile) {
    const card = document.getElementById("tt-profile-card");
    if (!card) return;
    if (!profile || !profile.username && !profile.nickname) {
      card.classList.add("hidden");
      return;
    }
    const thumbWrap = document.getElementById("tt-profile-thumb");
    if (thumbWrap) {
      if (profile.avatar) {
        thumbWrap.innerHTML = `<img src="${profile.avatar}" alt="" class="channel-avatar" onerror="this.parentElement.innerHTML='<div class=\\"channel-avatar-placeholder\\">\u{1F3B5}</div>'" />`;
      } else {
        thumbWrap.innerHTML = '<div class="channel-avatar-placeholder">\u{1F3B5}</div>';
      }
    }
    const nickname = document.getElementById("tt-profile-nickname");
    if (nickname) nickname.textContent = profile.nickname || profile.username || "\u2014";
    const usernameEl = document.getElementById("tt-profile-username");
    if (usernameEl) usernameEl.textContent = profile.username ? `@${profile.username}` : "\u2014";
    const followersEl = document.getElementById("tt-profile-followers");
    if (followersEl) followersEl.textContent = `${formatNum(profile.followers)} followers`;
    const likesEl = document.getElementById("tt-profile-likes");
    if (likesEl) likesEl.textContent = `${formatNum(profile.likes)} likes`;
    const bioEl = document.getElementById("tt-profile-bio");
    if (bioEl) bioEl.textContent = profile.bio || "";
    const linkEl = document.getElementById("tt-profile-link");
    if (linkEl && profile.username) {
      linkEl.href = `https://www.tiktok.com/@${profile.username}`;
      linkEl.classList.remove("hidden");
    }
    card.classList.remove("hidden");
  }
  async function ttFetchVideos() {
    const username = document.getElementById("tt-username")?.value.trim();
    if (!username) {
      showError("Enter a TikTok username first.");
      return;
    }
    if (!requireKey("tiktok")) return;
    const limit = parseInt(document.getElementById("tt-limit")?.value, 10) || 30;
    const date_from = document.getElementById("tt-date-from")?.value || null;
    const date_to = document.getElementById("tt-date-to")?.value || null;
    setBtnLoading("tt-btn-fetch-videos", true);
    showLoading("tt-videos-tbody", 9);
    showProfileCardSkeleton("tt-profile-card");
    const exportRow = document.getElementById("tt-videos-export-row");
    if (exportRow) exportRow.style.display = "none";
    document.getElementById("error-banner")?.classList.add("hidden");
    try {
      const res = await fetch("/scrape/tiktok/videos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, limit, date_from, date_to })
      });
      const data = await safeJson(res);
      if (data.error) {
        showError(data.error);
        ttRenderVideosEmpty();
        return;
      }
      setTtVideosData(data.videos || []);
      ttDateSortDir = "desc";
      const ttInd = document.getElementById("tt-sort-date-indicator");
      if (ttInd) ttInd.textContent = "";
      ttRenderProfile(data.profile || null);
      ttRenderVideosTable();
      ttPopulateDropdown();
      const countEl = document.getElementById("tt-videos-count");
      if (countEl) countEl.textContent = `${ttVideosData.length} videos found`;
      if (exportRow) exportRow.style.display = ttVideosData.length ? "flex" : "none";
    } catch (e) {
      showError("Connection error: " + (e?.message || String(e)));
      ttRenderVideosEmpty();
    } finally {
      setBtnLoading("tt-btn-fetch-videos", false);
      hideProfileCardSkeleton("tt-profile-card");
    }
  }
  function ttRenderVideosEmpty() {
    const el = document.getElementById("tt-videos-tbody");
    if (el) el.innerHTML = emptyRow(9, "No videos found.");
  }
  function ttRenderVideosTable() {
    const tbody = document.getElementById("tt-videos-tbody");
    if (!tbody) return;
    if (!ttVideosData.length) {
      ttRenderVideosEmpty();
      return;
    }
    tbody.innerHTML = "";
    ttVideosData.forEach((v) => {
      const tr = document.createElement("tr");
      tr.addEventListener("click", () => tr.classList.toggle("selected"));
      const tdThumb = document.createElement("td");
      if (v.thumbnail) {
        const img = document.createElement("img");
        img.src = v.thumbnail;
        img.alt = "";
        img.className = "thumbnail";
        img.onerror = () => img.replaceWith(thumbPlaceholder("\u25B6"));
        tdThumb.appendChild(img);
      } else {
        tdThumb.appendChild(thumbPlaceholder("\u25B6"));
      }
      tr.appendChild(tdThumb);
      const tdCap = document.createElement("td");
      const div = document.createElement("div");
      div.className = "caption-cell";
      div.textContent = v.caption || "\u2014";
      div.title = v.caption || "";
      tdCap.appendChild(div);
      tr.appendChild(tdCap);
      const tdPub = document.createElement("td");
      tdPub.className = "date-cell hide-mobile";
      tdPub.textContent = formatDate(v.published);
      tr.appendChild(tdPub);
      const tdDur = document.createElement("td");
      tdDur.className = "num-cell hide-mobile";
      tdDur.textContent = formatDuration(v.duration);
      tr.appendChild(tdDur);
      tr.appendChild(numCell(v.views));
      tr.appendChild(numCell(v.likes));
      tr.appendChild(numCell(v.comments));
      const tdS = numCell(v.shares);
      tdS.classList.add("hide-mobile");
      tr.appendChild(tdS);
      const tdLink = document.createElement("td");
      tdLink.className = "link-cell";
      if (v.url) {
        const a = document.createElement("a");
        a.href = v.url;
        a.target = "_blank";
        a.rel = "noopener";
        a.textContent = "\u2197";
        tdLink.appendChild(a);
      }
      tr.appendChild(tdLink);
      tbody.appendChild(tr);
    });
  }
  function ttPopulateDropdown() {
    const sel = document.getElementById("tt-video-select");
    if (!sel) return;
    sel.innerHTML = "";
    if (!ttVideosData.length) {
      sel.innerHTML = '<option value="">\u2014 no videos \u2014</option>';
      return;
    }
    ttVideosData.forEach((v, i) => {
      const opt = document.createElement("option");
      opt.value = v.url || "";
      opt.textContent = truncate(v.caption || v.url || `Video ${i + 1}`, 60);
      sel.appendChild(opt);
    });
  }
  async function ttFetchComments() {
    const video_url = document.getElementById("tt-video-select")?.value;
    if (!video_url) {
      showError("Select a video first.");
      return;
    }
    if (!requireKey("tiktok")) return;
    const count = parseInt(document.getElementById("tt-comment-count")?.value, 10) || 50;
    setBtnLoading("tt-btn-fetch-comments", true);
    showLoading("tt-comments-tbody", 6);
    const exportRow = document.getElementById("tt-comments-export-row");
    if (exportRow) exportRow.style.display = "none";
    document.getElementById("error-banner")?.classList.add("hidden");
    try {
      const res = await fetch("/scrape/tiktok/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ video_url, count })
      });
      const data = await safeJson(res);
      if (data.error) {
        showError(data.error);
        ttRenderCommentsEmpty();
        return;
      }
      setTtCommentsData(data.comments || []);
      ttRenderCommentsTable();
      const countEl = document.getElementById("tt-comments-count");
      if (countEl) countEl.textContent = `${ttCommentsData.length} comments found`;
      if (exportRow) exportRow.style.display = ttCommentsData.length ? "flex" : "none";
    } catch (e) {
      showError("Connection error: " + (e?.message || String(e)));
      ttRenderCommentsEmpty();
    } finally {
      setBtnLoading("tt-btn-fetch-comments", false);
    }
  }
  function ttRenderCommentsEmpty() {
    const el = document.getElementById("tt-comments-tbody");
    if (el) el.innerHTML = emptyRow(6, "No comments found.");
  }
  function ttRenderCommentsTable() {
    const tbody = document.getElementById("tt-comments-tbody");
    if (!tbody) return;
    if (!ttCommentsData.length) {
      ttRenderCommentsEmpty();
      return;
    }
    tbody.innerHTML = "";
    ttCommentsData.forEach((c) => tbody.appendChild(ttMakeCommentRow(c)));
  }
  function ttMakeCommentRow(c) {
    const tr = document.createElement("tr");
    tr.dataset["commentId"] = c.id;
    tr.className = "comment-row";
    const tdAv = document.createElement("td");
    if (c.avatar) {
      const img = document.createElement("img");
      img.src = c.avatar;
      img.alt = c.username?.[0] || "?";
      img.className = "avatar";
      img.onerror = () => img.replaceWith(avatarPlaceholder(c.username));
      tdAv.appendChild(img);
    } else {
      tdAv.appendChild(avatarPlaceholder(c.username));
    }
    tr.appendChild(tdAv);
    const tdUser = document.createElement("td");
    tdUser.className = "username-cell";
    tdUser.textContent = c.username || "\u2014";
    tr.appendChild(tdUser);
    const tdCmt = document.createElement("td");
    const d = document.createElement("div");
    d.className = "comment-cell";
    d.textContent = truncate(c.text, 120);
    d.title = c.text || "";
    tdCmt.appendChild(d);
    tr.appendChild(tdCmt);
    tr.appendChild(numCell(c.likes));
    tr.appendChild(numCell(c.replies != null && c.replies > 0 ? c.replies : null, "hide-mobile"));
    const tdPost = document.createElement("td");
    tdPost.className = "date-cell hide-mobile";
    tdPost.textContent = relativeTime(c.posted);
    tdPost.title = c.posted || "";
    tr.appendChild(tdPost);
    return tr;
  }
  function ttExportVideosCSV() {
    if (!ttVideosData.length) return;
    downloadBlob(
      toCSV(ttVideosData.map((v) => ({
        url: v.url,
        caption: v.caption,
        published: v.published,
        duration_seconds: v.duration,
        views: v.views,
        likes: v.likes,
        comments: v.comments,
        shares: v.shares
      }))),
      `tiktok_videos_${getTimestamp()}.csv`,
      "text/csv"
    );
  }
  function ttExportVideosXLSX() {
    if (!ttVideosData.length) return;
    exportXLSX(
      ttVideosData.map((v) => ({
        url: v.url,
        caption: v.caption,
        published: v.published,
        duration_seconds: v.duration,
        views: v.views,
        likes: v.likes,
        comments: v.comments,
        shares: v.shares
      })),
      "Videos",
      `tiktok_videos_${getTimestamp()}.xlsx`
    );
  }
  function ttExportCommentsCSV() {
    if (!ttCommentsData.length) return;
    downloadBlob(
      toCSV(ttCommentsData.map((c) => ({
        username: c.username,
        text: c.text,
        likes: c.likes,
        replies: c.replies,
        posted: c.posted
      }))),
      `tiktok_comments_${getTimestamp()}.csv`,
      "text/csv"
    );
  }
  function ttExportCommentsXLSX() {
    if (!ttCommentsData.length) return;
    exportXLSX(
      ttCommentsData.map((c) => ({
        username: c.username,
        text: c.text,
        likes: c.likes,
        replies: c.replies,
        posted: c.posted
      })),
      "Comments",
      `tiktok_comments_${getTimestamp()}.xlsx`
    );
  }
  var ttDateSortDir = "desc";
  function ttSortByDate() {
    if (!ttVideosData.length) return;
    ttDateSortDir = ttDateSortDir === "desc" ? "asc" : "desc";
    const dir = ttDateSortDir;
    setTtVideosData([...ttVideosData].sort((a, b) => {
      const ta = a.published ? new Date(a.published).getTime() : 0;
      const tb = b.published ? new Date(b.published).getTime() : 0;
      return dir === "desc" ? tb - ta : ta - tb;
    }));
    const indicator = document.getElementById("tt-sort-date-indicator");
    if (indicator) indicator.textContent = dir === "desc" ? "\u2193" : "\u2191";
    ttRenderVideosTable();
  }

  // src/modules/wordcloud.ts
  var _wcDebounce = null;
  function ttGetWordCount() {
    const el = document.getElementById("tt-wc-words");
    const val = Number(el?.value || 120);
    const display = document.getElementById("tt-wc-words-value");
    if (display) display.textContent = String(val);
    return val;
  }
  function ttGetFontScale() {
    const el = document.getElementById("tt-wc-font");
    const val = Number(el?.value || 100);
    const display = document.getElementById("tt-wc-font-value");
    if (display) display.textContent = String(val);
    return val / 100;
  }
  function ttRegenerateWordCloud() {
    ttGenerateWordCloud(true);
  }
  function normalizeWord(w2) {
    return w2.replace(/(.)\1{2,}/g, "$1");
  }
  var STOPWORDS = /* @__PURE__ */ new Set([
    "the",
    "is",
    "are",
    "am",
    "was",
    "were",
    "be",
    "been",
    "being",
    "a",
    "an",
    "and",
    "or",
    "but",
    "if",
    "then",
    "so",
    "than",
    "not",
    "no",
    "of",
    "to",
    "in",
    "on",
    "for",
    "with",
    "as",
    "by",
    "at",
    "from",
    "into",
    "this",
    "that",
    "these",
    "those",
    "it",
    "its",
    "they",
    "them",
    "their",
    "you",
    "your",
    "we",
    "our",
    "i",
    "me",
    "my",
    "he",
    "she",
    "his",
    "her",
    "have",
    "has",
    "had",
    "do",
    "does",
    "did",
    "will",
    "would",
    "could",
    "should",
    "can",
    "may",
    "might",
    "shall",
    "very",
    "just",
    "also",
    "even",
    "more",
    "some",
    "any",
    "all",
    "each",
    "both",
    "too",
    "up",
    "out",
    "now",
    "here",
    "there",
    "where",
    "when",
    "how",
    "what",
    "who",
    "which",
    "why",
    "about",
    "like",
    "get",
    "got",
    "let",
    "make",
    "made",
    "good",
    "really",
    "much",
    "many",
    "yang",
    "dan",
    "di",
    "ke",
    "dari",
    "untuk",
    "dengan",
    "ini",
    "itu",
    "ada",
    "aku",
    "kamu",
    "dia",
    "mereka",
    "kita",
    "kami",
    "saya",
    "lo",
    "gue",
    "lu",
    "ya",
    "ga",
    "nggak",
    "gak",
    "ngga",
    "enggak",
    "engga",
    "nah",
    "wah",
    "aja",
    "kok",
    "nih",
    "deh",
    "sih",
    "lho",
    "tuh",
    "kan",
    "tau",
    "mau",
    "udah",
    "sudah",
    "lagi",
    "masih",
    "jadi",
    "juga",
    "pun",
    "itu",
    "banget",
    "bgt",
    "tp",
    "tapi",
    "kalo",
    "kalau",
    "biar",
    "bikin",
    "sama",
    "si",
    "lah",
    "dong",
    "kayak",
    "kaya",
    "kayaknya",
    "seperti",
    "kayanya",
    "nya",
    "loh",
    "yah",
    "iya",
    "iyaa",
    "bisa",
    "perlu",
    "harus",
    "terus",
    "gitu",
    "gini",
    "situ",
    "sini",
    "sana",
    "cara",
    "hal",
    "banyak",
    "emang",
    "memang",
    "bakal",
    "akan",
    "belum",
    "pernah",
    "selalu",
    "kadang",
    "mungkin",
    "atau",
    "karena",
    "supaya",
    "soal",
    "pas",
    "buat",
    "lebih",
    "sangat",
    "sekali",
    "cuma",
    "hanya",
    "semua",
    "setiap",
    "beberapa",
    "namun",
    "jika",
    "apakah",
    "gimana",
    "kenapa",
    "makanya",
    "padahal",
    "walaupun",
    "meskipun",
    "setelah",
    "sebelum",
    "ketika",
    "terimakasih",
    "makasih",
    "thanks",
    "thank",
    "pliss",
    "plis",
    "please",
    "haha",
    "hahaha",
    "wkwk",
    "wkwkwk",
    "wkwkwkwk",
    "hehe",
    "hihi",
    "xixi",
    "lol",
    "omg",
    "btw",
    "fyi",
    "asw",
    "oke",
    "ok",
    "okay",
    "yep",
    "yup",
    "hai",
    "hei",
    "hey",
    "hi",
    "hello",
    "bye",
    "ciao",
    "www",
    "http",
    "https",
    "com",
    "org",
    "net",
    "id",
    "co",
    "love",
    "heart",
    "fire",
    "star",
    "kak",
    "kakak",
    "kk",
    "om",
    "tante",
    "mas",
    "mbak",
    "pak",
    "bu",
    "bang",
    "abang",
    "bro",
    "sis",
    "cuy",
    "gan",
    "bos",
    "boss",
    "yg",
    "yng",
    "dgn",
    "dg",
    "krn",
    "karna",
    "utk",
    "dlm",
    "sdh",
    "blm",
    "lg",
    "lgi",
    "msh",
    "jd",
    "jg",
    "jga",
    "spy",
    "bngt",
    "skrg",
    "kmrn",
    "bsk",
    "tdk",
    "gw",
    "w",
    "u",
    "km",
    "kmu",
    "mrk",
    "dy",
    "woy",
    "woi",
    "bagus",
    "keren",
    "mantap",
    "mantul",
    "anjir",
    "anjay",
    "asik",
    "suka",
    "follow",
    "share",
    "save",
    "tag",
    "komen",
    "iyo",
    "iyaaa",
    "nope",
    "sip",
    "siap",
    "noted"
  ]);
  function isValidWord(w2) {
    if (!w2 || w2.length < 3) return false;
    if (STOPWORDS.has(w2)) return false;
    if (/^\d+$/.test(w2)) return false;
    if (/^(.)\1{2,}$/.test(w2)) return false;
    if (!/[a-z]/.test(w2)) return false;
    return true;
  }
  function tokenize(text) {
    return (text || "").toLowerCase().replace(/https?:\/\/\S+/g, "").replace(/@[\w.]+/g, "").replace(/#[\w]+/g, "").replace(/[^\w\s]/g, " ").replace(/_/g, " ").split(/\s+/).map(normalizeWord).filter(isValidWord);
  }
  function ttBuildWordFreq(limit) {
    const bigram = document.getElementById("tt-wc-bigram")?.checked ?? false;
    const trigram = document.getElementById("tt-wc-trigram")?.checked ?? false;
    const freq = /* @__PURE__ */ new Map();
    ttCommentsData.forEach((c) => {
      const tokens = tokenize(c.text);
      tokens.forEach((w2) => freq.set(w2, (freq.get(w2) || 0) + 1));
      if (bigram) {
        for (let i = 0; i < tokens.length - 1; i++) {
          const bg = tokens[i] + " " + tokens[i + 1];
          freq.set(bg, (freq.get(bg) || 0) + 1);
        }
      }
      if (trigram) {
        for (let i = 0; i < tokens.length - 2; i++) {
          const tg = tokens[i] + " " + tokens[i + 1] + " " + tokens[i + 2];
          freq.set(tg, (freq.get(tg) || 0) + 1);
        }
      }
    });
    const all = [...freq.entries()].sort((a, b) => b[1] - a[1]);
    const minFreq = all.length > 200 ? 2 : 1;
    return all.filter(([, v]) => v >= minFreq).slice(0, limit).map(([text, value]) => ({ text, value }));
  }
  function ttGenerateWordCloud(force = false) {
    if (!ttCommentsData.length) {
      showError("Fetch comments first.");
      return;
    }
    const wrap = document.getElementById("tt-wordcloud-wrap");
    const canvas = document.getElementById("tt-wordcloud-canvas");
    const wordLimit = ttGetWordCount();
    const fontScale = ttGetFontScale();
    const words = ttBuildWordFreq(wordLimit);
    wrap.classList.remove("hidden");
    _wcUpdateSliderFill(document.getElementById("tt-wc-words"));
    _wcUpdateSliderFill(document.getElementById("tt-wc-font"));
    wrap.scrollIntoView({ behavior: "smooth" });
    const W = 1200, H = 650, DPR = window.devicePixelRatio || 2;
    canvas.width = W * DPR;
    canvas.height = H * DPR;
    canvas.style.width = "100%";
    canvas.style.background = "#ffffff";
    const ctx = canvas.getContext("2d");
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(DPR, DPR);
    const d3 = window.d3;
    const maxF = words[0].value, minF = words[words.length - 1].value;
    const sizeScale = d3.scaleSqrt().domain([minF, maxF]).range([14 * fontScale, 72 * fontScale]);
    const colorScale = d3.scaleLinear().domain([minF, maxF]).range([0, 1]);
    function pickColor(v, text) {
      const t = colorScale(v);
      const pal = ["#0f172a", "#1e293b", "#334155", "#1d4ed8", "#2563eb", "#3b82f6", "#7c3aed", "#8b5cf6", "#0f766e", "#14b8a6", "#15803d", "#22c55e"];
      let pool = t > 0.8 ? pal.slice(0, 3) : t > 0.6 ? pal.slice(2, 6) : t > 0.4 ? pal.slice(4, 9) : pal.slice(6);
      if (text.includes(" ") && t > 0.4) pool = ["#7c3aed", "#8b5cf6", "#14b8a6"];
      return pool[Math.floor(Math.random() * pool.length)];
    }
    function pickWeight(v) {
      const t = colorScale(v);
      return t > 0.8 ? 800 : t > 0.5 ? 700 : 600;
    }
    d3.layout.cloud().size([W, H]).canvas(() => document.createElement("canvas")).words(words.map((w2) => ({ ...w2, size: Math.round(sizeScale(w2.value)), rotate: Math.random() < 0.1 ? Math.random() < 0.5 ? -20 : 20 : 0 }))).padding(2).rotate((d) => d.rotate).font("Inter").fontSize((d) => d.size).on("end", (dw) => {
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, W, H);
      ctx.translate(W / 2, H / 2);
      dw.forEach((w2) => {
        ctx.save();
        ctx.translate(w2.x, w2.y);
        ctx.rotate(w2.rotate * Math.PI / 180);
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = pickColor(w2.value, w2.text);
        ctx.font = `${pickWeight(w2.value)} ${w2.size}px Inter`;
        ctx.fillText(w2.text, 0, 0);
        ctx.restore();
      });
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    }).start();
  }
  function ttDownloadWordCloud() {
    const canvas = document.getElementById("tt-wordcloud-canvas");
    const link = document.createElement("a");
    link.download = `wordcloud_${Date.now()}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  }
  function _wcUpdateSliderFill(el) {
    if (!el) return;
    const min = Number(el.min || 0), max = Number(el.max || 100), val = Number(el.value);
    const pct = ((val - min) / (max - min) * 100).toFixed(1);
    el.style.background = `linear-gradient(to right, rgba(16,185,129,0.85) 0%, rgba(16,185,129,0.85) ${pct}%, rgba(255,255,255,0.12) ${pct}%, rgba(255,255,255,0.12) 100%)`;
  }
  function _wcLiveUpdate() {
    if (!ttCommentsData.length) return;
    ttGetWordCount();
    ttGetFontScale();
    _wcUpdateSliderFill(document.getElementById("tt-wc-words"));
    _wcUpdateSliderFill(document.getElementById("tt-wc-font"));
    if (_wcDebounce) clearTimeout(_wcDebounce);
    _wcDebounce = setTimeout(() => ttGenerateWordCloud(), 280);
  }

  // src/modules/format.ts
  function formatBadge(fmt) {
    if (fmt === "shorts") return `<span class="badge badge-vertical">\u{1F4F1} Shorts</span>`;
    if (fmt === "horizontal") return `<span class="badge badge-horizontal">\u2B1C Horizontal</span>`;
    return `<span class="badge badge-unknown">\u2014</span>`;
  }
  function inferVideoFormat(video) {
    const url = (video.url || "").toLowerCase();
    const secs = video.durationSeconds ?? video.durationSecs ?? null;
    if (url.includes("/shorts/")) return "shorts";
    if (secs != null) return Number(secs) <= 60 ? "shorts" : "horizontal";
    if (video.isShort === true) return "shorts";
    return "unknown";
  }
  function detectFormatAsync(video, tdEl) {
    const fmt = inferVideoFormat(video);
    video._formatDetected = fmt;
    if (tdEl) tdEl.innerHTML = formatBadge(fmt);
  }

  // src/modules/youtube.ts
  async function ytFetchChannelAndVideos() {
    const channelId = document.getElementById("yt-channel-id")?.value.trim();
    if (!channelId) {
      showError("Enter a Channel ID, @handle, or URL.");
      return;
    }
    if (!requireKey("youtube")) return;
    const maxResults = parseInt(document.getElementById("yt-max-results")?.value, 10) || 25;
    setBtnLoading("yt-btn-channel", true);
    showLoading("yt-videos-tbody", 9);
    showProfileCardSkeleton("yt-channel-card");
    const exportRow = document.getElementById("yt-videos-export-row");
    if (exportRow) exportRow.style.display = "none";
    document.getElementById("error-banner")?.classList.add("hidden");
    setYtSharedChannelInput(channelId);
    try {
      const [chRes, vidRes] = await Promise.all([
        fetch("/scrape/youtube/channel", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ channel_id: channelId })
        }),
        fetch("/scrape/youtube/videos", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ channel_id: channelId, max_results: maxResults })
        })
      ]);
      const chData = await safeJson(chRes);
      const vidData = await safeJson(vidRes);
      if (chData.error) showError(chData.error);
      else ytRenderChannelCard(chData);
      if (vidData.error) {
        showError(vidData.error);
        ytRenderVideosEmpty();
      } else {
        setYtVideosData(vidData.videos || []);
        ytDateSortDir = "desc";
        const ytInd = document.getElementById("yt-sort-date-indicator");
        if (ytInd) ytInd.textContent = "";
        ytRenderVideosTable();
        const countEl = document.getElementById("yt-videos-count");
        if (countEl) countEl.textContent = `${ytVideosData.length} videos fetched`;
        if (exportRow) exportRow.style.display = ytVideosData.length ? "flex" : "none";
      }
    } catch (e) {
      showError("Connection error: " + (e?.message || String(e)));
      ytRenderVideosEmpty();
    } finally {
      setBtnLoading("yt-btn-channel", false);
      hideProfileCardSkeleton("yt-channel-card");
    }
  }
  function ytRenderChannelCard(ch) {
    const card = document.getElementById("yt-channel-card");
    const thumbWrap = document.getElementById("yt-channel-thumb");
    if (!card || !thumbWrap) return;
    const proxiedThumb = ch.thumbnailUrl ? `/image-proxy?url=${encodeURIComponent(ch.thumbnailUrl)}` : "";
    thumbWrap.innerHTML = proxiedThumb ? `<img src="${proxiedThumb}" alt="" class="channel-avatar" onerror="this.parentElement.innerHTML='<div class=&quot;channel-avatar-placeholder&quot;>\u{1F4FA}</div>'" />` : `<div class="channel-avatar-placeholder">\u{1F4FA}</div>`;
    const titleEl = document.getElementById("yt-channel-title");
    const handleEl = document.getElementById("yt-channel-handle");
    const subsEl = document.getElementById("yt-channel-subs");
    const videosEl = document.getElementById("yt-channel-videos");
    const descEl = document.getElementById("yt-channel-desc");
    if (titleEl) titleEl.textContent = ch.title || "\u2014";
    if (handleEl) handleEl.textContent = ch.customUrl || ch.id || "\u2014";
    if (subsEl) subsEl.textContent = formatNum2(ch.subscriberCount) + " subscribers";
    if (videosEl) videosEl.textContent = formatNum2(ch.videoCount) + " videos";
    if (descEl) descEl.textContent = ch.description || "";
    const link = document.getElementById("yt-channel-link");
    if (link) {
      if (ch.customUrl || ch.id) {
        link.href = `https://www.youtube.com/${ch.customUrl ? ch.customUrl : "channel/" + ch.id}`;
        link.classList.remove("hidden");
      } else {
        link.classList.add("hidden");
      }
    }
    card.classList.remove("hidden");
  }
  function formatNum2(n) {
    n = Number(n);
    if (!n && n !== 0) return "\u2014";
    if (n >= 1e6) return (n / 1e6).toFixed(1) + "M";
    if (n >= 1e3) return (n / 1e3).toFixed(1) + "K";
    return String(n);
  }
  async function ytFetchVideos() {
    const channelId = document.getElementById("yt-channel-id")?.value.trim();
    if (!channelId) {
      showError("Enter a Channel ID, @handle, or URL.");
      return;
    }
    if (!requireKey("youtube")) return;
    const maxResults = parseInt(document.getElementById("yt-max-results")?.value, 10) || 25;
    setBtnLoading("yt-btn-videos", true);
    showLoading("yt-videos-tbody", 9);
    const exportRow = document.getElementById("yt-videos-export-row");
    if (exportRow) exportRow.style.display = "none";
    document.getElementById("error-banner")?.classList.add("hidden");
    try {
      const res = await fetch("/scrape/youtube/videos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel_id: channelId, max_results: maxResults })
      });
      const data = await safeJson(res);
      if (data.error) {
        showError(data.error);
        ytRenderVideosEmpty();
        return;
      }
      setYtVideosData(data.videos || []);
      ytDateSortDir = "desc";
      const ytInd2 = document.getElementById("yt-sort-date-indicator");
      if (ytInd2) ytInd2.textContent = "";
      ytRenderVideosTable();
      const countEl = document.getElementById("yt-videos-count");
      if (countEl) countEl.textContent = `${ytVideosData.length} videos fetched`;
      if (exportRow) exportRow.style.display = ytVideosData.length ? "flex" : "none";
    } catch (e) {
      showError("Connection error: " + (e?.message || String(e)));
      ytRenderVideosEmpty();
    } finally {
      setBtnLoading("yt-btn-videos", false);
    }
  }
  function ytRenderVideosEmpty() {
    const el = document.getElementById("yt-videos-tbody");
    if (el) el.innerHTML = emptyRow(9, "No videos found.");
  }
  function ytRenderVideosTable() {
    const tbody = document.getElementById("yt-videos-tbody");
    if (!tbody) return;
    if (!ytVideosData.length) {
      ytRenderVideosEmpty();
      return;
    }
    tbody.innerHTML = "";
    ytVideosData.forEach((v) => {
      const tr = document.createElement("tr");
      tr.addEventListener("click", () => tr.classList.toggle("selected"));
      const tdThumb = document.createElement("td");
      if (v.thumbnailUrl) {
        const img = document.createElement("img");
        img.src = v.thumbnailUrl;
        img.alt = "";
        img.className = inferVideoFormat(v) === "shorts" ? "thumbnail thumbnail-short" : "thumbnail";
        img.onerror = () => img.replaceWith(thumbPlaceholder("\u25B6"));
        tdThumb.appendChild(img);
      } else {
        tdThumb.appendChild(thumbPlaceholder("\u25B6"));
      }
      tr.appendChild(tdThumb);
      const tdTitle = document.createElement("td");
      const d = document.createElement("div");
      d.className = "caption-cell";
      d.textContent = v.title || "\u2014";
      d.title = v.title || "";
      tdTitle.appendChild(d);
      tr.appendChild(tdTitle);
      const tdPub = document.createElement("td");
      tdPub.className = "date-cell hide-mobile";
      tdPub.textContent = formatDate(v.publishedAt);
      tr.appendChild(tdPub);
      const tdDur = document.createElement("td");
      tdDur.className = "num-cell hide-mobile";
      tdDur.textContent = v.durationSeconds != null ? formatDuration(v.durationSeconds) : "\u2014";
      tr.appendChild(tdDur);
      const tdFmt = document.createElement("td");
      if (v._formatDetected) tdFmt.innerHTML = formatBadge(v._formatDetected);
      else detectFormatAsync(v, tdFmt);
      tr.appendChild(tdFmt);
      tr.appendChild(numCell(v.viewCount != null ? v.viewCount : ""));
      tr.appendChild(numCell(v.likeCount != null ? v.likeCount : ""));
      tr.appendChild(numCell(v.commentCount != null ? v.commentCount : ""));
      const tdLink = document.createElement("td");
      tdLink.className = "link-cell";
      if (v.url) {
        const a = document.createElement("a");
        a.href = v.url;
        a.target = "_blank";
        a.rel = "noopener";
        a.textContent = "\u2197";
        tdLink.appendChild(a);
      }
      tr.appendChild(tdLink);
      tbody.appendChild(tr);
    });
  }
  async function ytFetchStats() {
    const videoIds = document.getElementById("yt-video-ids")?.value.trim();
    if (!videoIds) {
      showError("Enter at least one video ID.");
      return;
    }
    if (!requireKey("youtube")) return;
    setBtnLoading("yt-btn-stats", true);
    showLoading("yt-stats-tbody", 6);
    const exportRow = document.getElementById("yt-stats-export-row");
    if (exportRow) exportRow.style.display = "none";
    document.getElementById("error-banner")?.classList.add("hidden");
    try {
      const res = await fetch("/scrape/youtube/video-stats", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ video_ids: videoIds })
      });
      const data = await safeJson(res);
      if (data.error) {
        showError(data.error);
        ytRenderStatsEmpty();
        return;
      }
      setYtStatsData(data.stats || []);
      ytRenderStatsTable();
      const countEl = document.getElementById("yt-stats-count");
      if (countEl) countEl.textContent = `${ytStatsData.length} videos`;
      if (exportRow) exportRow.style.display = ytStatsData.length ? "flex" : "none";
    } catch (e) {
      showError("Connection error: " + (e?.message || String(e)));
      ytRenderStatsEmpty();
    } finally {
      setBtnLoading("yt-btn-stats", false);
    }
  }
  function ytRenderStatsEmpty() {
    const el = document.getElementById("yt-stats-tbody");
    if (el) el.innerHTML = emptyRow(6, "No stats found.");
  }
  function ytRenderStatsTable() {
    const tbody = document.getElementById("yt-stats-tbody");
    if (!tbody) return;
    if (!ytStatsData.length) {
      ytRenderStatsEmpty();
      return;
    }
    tbody.innerHTML = "";
    ytStatsData.forEach((s) => {
      const tr = document.createElement("tr");
      tr.addEventListener("click", () => tr.classList.toggle("selected"));
      const tdId = document.createElement("td");
      tdId.innerHTML = `<a href="https://www.youtube.com/watch?v=${escHtml(s.id)}" target="_blank" rel="noopener" style="font-family:var(--font-mono);font-size:12px;">${escHtml(s.id)}</a>`;
      tr.appendChild(tdId);
      tr.appendChild(numCell(s.viewCount));
      tr.appendChild(numCell(s.likeCount));
      tr.appendChild(numCell(s.commentCount));
      const tdDur = document.createElement("td");
      tdDur.className = "num-cell hide-mobile";
      tdDur.textContent = s.durationSeconds != null ? formatDuration(s.durationSeconds) : "\u2014";
      tr.appendChild(tdDur);
      const tdPub = document.createElement("td");
      tdPub.className = "date-cell hide-mobile";
      tdPub.textContent = formatDate(s.publishedAt);
      tr.appendChild(tdPub);
      const tdTitle = document.createElement("td");
      const d = document.createElement("div");
      d.className = "caption-cell";
      d.textContent = s.title || "\u2014";
      d.title = s.title || "";
      tdTitle.appendChild(d);
      tr.appendChild(tdTitle);
      tbody.appendChild(tr);
    });
  }
  function ytExportVideosCSV() {
    if (!ytVideosData.length) return;
    downloadBlob(
      toCSV(ytVideosData.map((v) => ({
        id: v.id,
        title: v.title,
        published_at: v.publishedAt,
        duration_seconds: v.durationSeconds,
        format: v._formatDetected || inferVideoFormat(v),
        view_count: v.viewCount,
        like_count: v.likeCount,
        comment_count: v.commentCount,
        url: v.url
      }))),
      `youtube_videos_${getTimestamp()}.csv`,
      "text/csv"
    );
  }
  function ytExportVideosXLSX() {
    if (!ytVideosData.length) return;
    exportXLSX(
      ytVideosData.map((v) => ({
        id: v.id,
        title: v.title,
        published_at: v.publishedAt,
        duration_seconds: v.durationSeconds,
        format: v._formatDetected || inferVideoFormat(v),
        view_count: v.viewCount,
        like_count: v.likeCount,
        comment_count: v.commentCount,
        url: v.url
      })),
      "Videos",
      `youtube_videos_${getTimestamp()}.xlsx`
    );
  }
  function ytExportStatsCSV() {
    if (!ytStatsData.length) return;
    downloadBlob(
      toCSV(ytStatsData.map((s) => ({
        id: s.id,
        title: s.title,
        published_at: s.publishedAt,
        duration_seconds: s.durationSeconds,
        view_count: s.viewCount,
        like_count: s.likeCount,
        comment_count: s.commentCount,
        url: s.id ? `https://www.youtube.com/watch?v=${s.id}` : ""
      }))),
      `youtube_video_stats_${getTimestamp()}.csv`,
      "text/csv"
    );
  }
  function ytExportStatsXLSX() {
    if (!ytStatsData.length) return;
    exportXLSX(
      ytStatsData.map((s) => ({
        id: s.id,
        title: s.title,
        published_at: s.publishedAt,
        duration_seconds: s.durationSeconds,
        view_count: s.viewCount,
        like_count: s.likeCount,
        comment_count: s.commentCount,
        url: s.id ? `https://www.youtube.com/watch?v=${s.id}` : ""
      })),
      "Stats",
      `youtube_video_stats_${getTimestamp()}.xlsx`
    );
  }
  async function ytFetchComments() {
    const videoIdRaw = document.getElementById("yt-comment-video-id")?.value.trim();
    if (!videoIdRaw) {
      showError("Enter a YouTube Video ID first.");
      return;
    }
    if (!requireKey("youtube")) return;
    const count = parseInt(document.getElementById("yt-comment-count")?.value, 10) || 100;
    let video_id = videoIdRaw;
    const ytUrlMatch = videoIdRaw.match(/(?:v=|youtu\.be\/|\/shorts\/)([A-Za-z0-9_-]{11})/);
    if (ytUrlMatch) video_id = ytUrlMatch[1];
    setBtnLoading("yt-btn-comments", true);
    showLoading("yt-comments-tbody", 6);
    const exportRow = document.getElementById("yt-comments-export-row");
    if (exportRow) exportRow.style.display = "none";
    document.getElementById("error-banner")?.classList.add("hidden");
    try {
      const res = await fetch("/scrape/youtube/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ video_id, count })
      });
      const data = await safeJson(res);
      if (data.error) {
        showError(data.error);
        ytRenderCommentsEmpty();
        return;
      }
      setYtCommentsData(data.comments || []);
      ytRenderCommentsTable();
      const countEl = document.getElementById("yt-comments-count");
      if (countEl) countEl.textContent = `${ytCommentsData.length} comments found`;
      if (exportRow) exportRow.style.display = ytCommentsData.length ? "flex" : "none";
    } catch (e) {
      showError("Connection error: " + (e?.message || String(e)));
      ytRenderCommentsEmpty();
    } finally {
      setBtnLoading("yt-btn-comments", false);
    }
  }
  function ytRenderCommentsEmpty() {
    const el = document.getElementById("yt-comments-tbody");
    if (el) el.innerHTML = emptyRow(6, "No comments found.");
  }
  function ytRenderCommentsTable() {
    const tbody = document.getElementById("yt-comments-tbody");
    if (!tbody) return;
    if (!ytCommentsData.length) {
      ytRenderCommentsEmpty();
      return;
    }
    tbody.innerHTML = "";
    ytCommentsData.forEach((c) => tbody.appendChild(ytMakeCommentRow(c)));
  }
  function ytMakeCommentRow(c) {
    const tr = document.createElement("tr");
    tr.className = "comment-row";
    const tdAv = document.createElement("td");
    if (c.avatar) {
      const img = document.createElement("img");
      img.src = c.avatar;
      img.alt = c.username?.[0] || "?";
      img.className = "avatar";
      img.onerror = () => img.replaceWith(avatarPlaceholder(c.username));
      tdAv.appendChild(img);
    } else {
      tdAv.appendChild(avatarPlaceholder(c.username));
    }
    tr.appendChild(tdAv);
    const tdUser = document.createElement("td");
    tdUser.className = "username-cell";
    tdUser.textContent = c.username || "\u2014";
    tr.appendChild(tdUser);
    const tdCmt = document.createElement("td");
    const d = document.createElement("div");
    d.className = "comment-cell";
    d.textContent = truncate(c.text, 120);
    d.title = c.text || "";
    tdCmt.appendChild(d);
    tr.appendChild(tdCmt);
    tr.appendChild(numCell(c.likes));
    tr.appendChild(numCell(c.replies != null && c.replies > 0 ? c.replies : null, "hide-mobile"));
    const tdPost = document.createElement("td");
    tdPost.className = "date-cell hide-mobile";
    tdPost.textContent = relativeTime(c.posted);
    tdPost.title = c.posted || "";
    tr.appendChild(tdPost);
    return tr;
  }
  function ytExportCommentsCSV() {
    if (!ytCommentsData.length) return;
    downloadBlob(
      toCSV(ytCommentsData.map((c) => ({
        username: c.username,
        text: c.text,
        likes: c.likes,
        replies: c.replies,
        posted: c.posted
      }))),
      `youtube_comments_${getTimestamp()}.csv`,
      "text/csv"
    );
  }
  function ytExportCommentsXLSX() {
    if (!ytCommentsData.length) return;
    exportXLSX(
      ytCommentsData.map((c) => ({
        username: c.username,
        text: c.text,
        likes: c.likes,
        replies: c.replies,
        posted: c.posted
      })),
      "Comments",
      `youtube_comments_${getTimestamp()}.xlsx`
    );
  }
  var ytDateSortDir = "desc";
  function ytSortByDate() {
    if (!ytVideosData.length) return;
    ytDateSortDir = ytDateSortDir === "desc" ? "asc" : "desc";
    const dir = ytDateSortDir;
    setYtVideosData([...ytVideosData].sort((a, b) => {
      const ta = a.publishedAt ? new Date(a.publishedAt).getTime() : 0;
      const tb = b.publishedAt ? new Date(b.publishedAt).getTime() : 0;
      return dir === "desc" ? tb - ta : ta - tb;
    }));
    const indicator = document.getElementById("yt-sort-date-indicator");
    if (indicator) indicator.textContent = dir === "desc" ? "\u2193" : "\u2191";
    ytRenderVideosTable();
  }

  // src/modules/yt-wordcloud.ts
  var _ytWcDebounce = null;
  function ytGetWordCount() {
    const el = document.getElementById("yt-wc-words");
    const val = Number(el?.value || 120);
    const display = document.getElementById("yt-wc-words-value");
    if (display) display.textContent = String(val);
    return val;
  }
  function ytGetFontScale() {
    const el = document.getElementById("yt-wc-font");
    const val = Number(el?.value || 100);
    const display = document.getElementById("yt-wc-font-value");
    if (display) display.textContent = String(val);
    return val / 100;
  }
  function ytRegenerateWordCloud() {
    ytGenerateWordCloud(true);
  }
  function normalizeWord2(w2) {
    return w2.replace(/(.)\1{2,}/g, "$1");
  }
  var STOPWORDS2 = /* @__PURE__ */ new Set([
    "the",
    "is",
    "are",
    "am",
    "was",
    "were",
    "be",
    "been",
    "being",
    "a",
    "an",
    "and",
    "or",
    "but",
    "if",
    "then",
    "so",
    "than",
    "not",
    "no",
    "of",
    "to",
    "in",
    "on",
    "for",
    "with",
    "as",
    "by",
    "at",
    "from",
    "into",
    "this",
    "that",
    "these",
    "those",
    "it",
    "its",
    "they",
    "them",
    "their",
    "you",
    "your",
    "we",
    "our",
    "i",
    "me",
    "my",
    "he",
    "she",
    "his",
    "her",
    "have",
    "has",
    "had",
    "do",
    "does",
    "did",
    "will",
    "would",
    "could",
    "should",
    "can",
    "may",
    "might",
    "shall",
    "very",
    "just",
    "also",
    "even",
    "more",
    "some",
    "any",
    "all",
    "each",
    "both",
    "too",
    "up",
    "out",
    "now",
    "here",
    "there",
    "where",
    "when",
    "how",
    "what",
    "who",
    "which",
    "why",
    "about",
    "like",
    "get",
    "got",
    "let",
    "make",
    "made",
    "good",
    "really",
    "much",
    "many",
    "yang",
    "dan",
    "di",
    "ke",
    "dari",
    "untuk",
    "dengan",
    "ini",
    "itu",
    "ada",
    "aku",
    "kamu",
    "dia",
    "mereka",
    "kita",
    "kami",
    "saya",
    "lo",
    "gue",
    "lu",
    "ya",
    "ga",
    "nggak",
    "gak",
    "ngga",
    "enggak",
    "engga",
    "nah",
    "wah",
    "aja",
    "kok",
    "nih",
    "deh",
    "sih",
    "lho",
    "tuh",
    "kan",
    "tau",
    "mau",
    "udah",
    "sudah",
    "lagi",
    "masih",
    "jadi",
    "juga",
    "pun",
    "itu",
    "banget",
    "bgt",
    "tp",
    "tapi",
    "kalo",
    "kalau",
    "biar",
    "bikin",
    "sama",
    "si",
    "lah",
    "dong",
    "kayak",
    "kaya",
    "kayaknya",
    "seperti",
    "kayanya",
    "nya",
    "loh",
    "yah",
    "iya",
    "iyaa",
    "bisa",
    "perlu",
    "harus",
    "terus",
    "gitu",
    "gini",
    "situ",
    "sini",
    "sana",
    "cara",
    "hal",
    "banyak",
    "emang",
    "memang",
    "bakal",
    "akan",
    "belum",
    "pernah",
    "selalu",
    "kadang",
    "mungkin",
    "atau",
    "karena",
    "supaya",
    "soal",
    "pas",
    "buat",
    "lebih",
    "sangat",
    "sekali",
    "cuma",
    "hanya",
    "semua",
    "setiap",
    "beberapa",
    "namun",
    "jika",
    "apakah",
    "gimana",
    "kenapa",
    "makanya",
    "padahal",
    "walaupun",
    "meskipun",
    "setelah",
    "sebelum",
    "ketika",
    "terimakasih",
    "makasih",
    "thanks",
    "thank",
    "pliss",
    "plis",
    "please",
    "haha",
    "hahaha",
    "wkwk",
    "wkwkwk",
    "wkwkwkwk",
    "hehe",
    "hihi",
    "xixi",
    "lol",
    "omg",
    "btw",
    "fyi",
    "asw",
    "oke",
    "ok",
    "okay",
    "yep",
    "yup",
    "hai",
    "hei",
    "hey",
    "hi",
    "hello",
    "bye",
    "ciao",
    "www",
    "http",
    "https",
    "com",
    "org",
    "net",
    "id",
    "co",
    "love",
    "heart",
    "fire",
    "star",
    "kak",
    "kakak",
    "kk",
    "om",
    "tante",
    "mas",
    "mbak",
    "pak",
    "bu",
    "bang",
    "abang",
    "bro",
    "sis",
    "cuy",
    "gan",
    "bos",
    "boss",
    "yg",
    "yng",
    "dgn",
    "dg",
    "krn",
    "karna",
    "utk",
    "dlm",
    "sdh",
    "blm",
    "lg",
    "lgi",
    "msh",
    "jd",
    "jg",
    "jga",
    "spy",
    "bngt",
    "skrg",
    "kmrn",
    "bsk",
    "tdk",
    "gw",
    "w",
    "u",
    "km",
    "kmu",
    "mrk",
    "dy",
    "woy",
    "woi",
    "bagus",
    "keren",
    "mantap",
    "mantul",
    "anjir",
    "anjay",
    "asik",
    "suka",
    "follow",
    "share",
    "save",
    "tag",
    "komen",
    "iyo",
    "iyaaa",
    "nope",
    "sip",
    "siap",
    "noted"
  ]);
  function isValidWord2(w2) {
    if (!w2 || w2.length < 3) return false;
    if (STOPWORDS2.has(w2)) return false;
    if (/^\d+$/.test(w2)) return false;
    if (/^(.)\1{2,}$/.test(w2)) return false;
    if (!/[a-z]/.test(w2)) return false;
    return true;
  }
  function tokenize2(text) {
    return (text || "").toLowerCase().replace(/https?:\/\/\S+/g, "").replace(/@[\w.]+/g, "").replace(/#[\w]+/g, "").replace(/[^\w\s]/g, " ").replace(/_/g, " ").split(/\s+/).map(normalizeWord2).filter(isValidWord2);
  }
  function ytBuildWordFreq(limit) {
    const bigram = document.getElementById("yt-wc-bigram")?.checked ?? false;
    const trigram = document.getElementById("yt-wc-trigram")?.checked ?? false;
    const freq = /* @__PURE__ */ new Map();
    ytCommentsData.forEach((c) => {
      const tokens = tokenize2(c.text);
      tokens.forEach((w2) => freq.set(w2, (freq.get(w2) || 0) + 1));
      if (bigram) {
        for (let i = 0; i < tokens.length - 1; i++) {
          const bg = tokens[i] + " " + tokens[i + 1];
          freq.set(bg, (freq.get(bg) || 0) + 1);
        }
      }
      if (trigram) {
        for (let i = 0; i < tokens.length - 2; i++) {
          const tg = tokens[i] + " " + tokens[i + 1] + " " + tokens[i + 2];
          freq.set(tg, (freq.get(tg) || 0) + 1);
        }
      }
    });
    const all = [...freq.entries()].sort((a, b) => b[1] - a[1]);
    const minFreq = all.length > 200 ? 2 : 1;
    return all.filter(([, v]) => v >= minFreq).slice(0, limit).map(([text, value]) => ({ text, value }));
  }
  function ytGenerateWordCloud(force = false) {
    if (!ytCommentsData.length) {
      showError("Fetch YouTube comments first.");
      return;
    }
    const wrap = document.getElementById("yt-wordcloud-wrap");
    const canvas = document.getElementById("yt-wordcloud-canvas");
    const wordLimit = ytGetWordCount();
    const fontScale = ytGetFontScale();
    const words = ytBuildWordFreq(wordLimit);
    wrap.classList.remove("hidden");
    _wcUpdateSliderFill2(document.getElementById("yt-wc-words"));
    _wcUpdateSliderFill2(document.getElementById("yt-wc-font"));
    wrap.scrollIntoView({ behavior: "smooth" });
    const W = 1200, H = 650, DPR = window.devicePixelRatio || 2;
    canvas.width = W * DPR;
    canvas.height = H * DPR;
    canvas.style.width = "100%";
    canvas.style.background = "#ffffff";
    const ctx = canvas.getContext("2d");
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(DPR, DPR);
    const d3 = window.d3;
    const maxF = words[0].value, minF = words[words.length - 1].value;
    const sizeScale = d3.scaleSqrt().domain([minF, maxF]).range([14 * fontScale, 72 * fontScale]);
    const colorScale = d3.scaleLinear().domain([minF, maxF]).range([0, 1]);
    function pickColor(v, text) {
      const t = colorScale(v);
      const pal = ["#0f172a", "#1e293b", "#334155", "#1d4ed8", "#2563eb", "#3b82f6", "#7c3aed", "#8b5cf6", "#0f766e", "#14b8a6", "#15803d", "#22c55e"];
      let pool = t > 0.8 ? pal.slice(0, 3) : t > 0.6 ? pal.slice(2, 6) : t > 0.4 ? pal.slice(4, 9) : pal.slice(6);
      if (text.includes(" ") && t > 0.4) pool = ["#7c3aed", "#8b5cf6", "#14b8a6"];
      return pool[Math.floor(Math.random() * pool.length)];
    }
    function pickWeight(v) {
      const t = colorScale(v);
      return t > 0.8 ? 800 : t > 0.5 ? 700 : 600;
    }
    d3.layout.cloud().size([W, H]).canvas(() => document.createElement("canvas")).words(words.map((w2) => ({ ...w2, size: Math.round(sizeScale(w2.value)), rotate: Math.random() < 0.1 ? Math.random() < 0.5 ? -20 : 20 : 0 }))).padding(2).rotate((d) => d.rotate).font("Inter").fontSize((d) => d.size).on("end", (dw) => {
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, W, H);
      ctx.translate(W / 2, H / 2);
      dw.forEach((w2) => {
        ctx.save();
        ctx.translate(w2.x, w2.y);
        ctx.rotate(w2.rotate * Math.PI / 180);
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = pickColor(w2.value, w2.text);
        ctx.font = `${pickWeight(w2.value)} ${w2.size}px Inter`;
        ctx.fillText(w2.text, 0, 0);
        ctx.restore();
      });
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    }).start();
  }
  function ytDownloadWordCloud() {
    const canvas = document.getElementById("yt-wordcloud-canvas");
    const link = document.createElement("a");
    link.download = `yt_wordcloud_${Date.now()}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  }
  function _wcUpdateSliderFill2(el) {
    if (!el) return;
    const min = Number(el.min || 0), max = Number(el.max || 100), val = Number(el.value);
    const pct = ((val - min) / (max - min) * 100).toFixed(1);
    el.style.background = `linear-gradient(to right, rgba(16,185,129,0.85) 0%, rgba(16,185,129,0.85) ${pct}%, rgba(255,255,255,0.12) ${pct}%, rgba(255,255,255,0.12) 100%)`;
  }
  function _ytWcLiveUpdate() {
    if (!ytCommentsData.length) return;
    ytGetWordCount();
    ytGetFontScale();
    _wcUpdateSliderFill2(document.getElementById("yt-wc-words"));
    _wcUpdateSliderFill2(document.getElementById("yt-wc-font"));
    if (_ytWcDebounce) clearTimeout(_ytWcDebounce);
    _ytWcDebounce = setTimeout(() => ytGenerateWordCloud(), 280);
  }

  // src/modules/instagram.ts
  function igRenderProfile(profile) {
    const card = document.getElementById("ig-profile-card");
    if (!card) return;
    if (!profile || !profile.username && !profile.fullName) {
      card.classList.add("hidden");
      return;
    }
    const thumbWrap = document.getElementById("ig-profile-thumb");
    if (thumbWrap) {
      if (profile.profilePic) {
        const proxied = `/image-proxy?url=${encodeURIComponent(profile.profilePic)}`;
        thumbWrap.innerHTML = `<img src="${proxied}" alt="" class="channel-avatar" onerror="this.parentElement.innerHTML='<div class=\\"channel-avatar-placeholder\\">\u{1F4F7}</div>'" />`;
      } else {
        thumbWrap.innerHTML = '<div class="channel-avatar-placeholder">\u{1F4F7}</div>';
      }
    }
    const fullnameEl = document.getElementById("ig-profile-fullname");
    if (fullnameEl) fullnameEl.textContent = profile.fullName || profile.username || "\u2014";
    const usernameEl = document.getElementById("ig-profile-username");
    if (usernameEl) usernameEl.textContent = profile.username ? `@${profile.username}` : "\u2014";
    const followersEl = document.getElementById("ig-profile-followers");
    if (followersEl) followersEl.textContent = `${formatNum(profile.followers)} followers`;
    const postsEl = document.getElementById("ig-profile-posts");
    if (postsEl) postsEl.textContent = `${formatNum(profile.postsCount)} posts`;
    const bioEl = document.getElementById("ig-profile-bio");
    if (bioEl) bioEl.textContent = profile.biography || "";
    const linkEl = document.getElementById("ig-profile-link");
    if (linkEl && profile.username) {
      linkEl.href = `https://www.instagram.com/${profile.username}`;
      linkEl.classList.remove("hidden");
    }
    card.classList.remove("hidden");
  }
  async function igFetchPosts() {
    const username = document.getElementById("ig-username")?.value.trim();
    if (!username) {
      showError("Enter an Instagram username first.");
      return;
    }
    if (!requireKey("instagram")) return;
    const limit = parseInt(document.getElementById("ig-limit")?.value, 10) || 20;
    setBtnLoading("ig-btn-fetch-posts", true);
    showLoading("ig-posts-tbody", 8);
    showProfileCardSkeleton("ig-profile-card");
    const exportRow = document.getElementById("ig-posts-export-row");
    if (exportRow) exportRow.style.display = "none";
    document.getElementById("error-banner")?.classList.add("hidden");
    try {
      const res = await fetch("/scrape/instagram/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, limit })
      });
      const data = await safeJson(res);
      if (data.error) {
        showError(data.error);
        igRenderPostsEmpty();
        return;
      }
      setIgPostsData(data.posts || []);
      igDateSortDir = "desc";
      const igInd = document.getElementById("ig-sort-date-indicator");
      if (igInd) igInd.textContent = "";
      igRenderProfile(data.profile || null);
      igRenderPostsTable();
      igPopulateDropdown();
      const countEl = document.getElementById("ig-posts-count");
      if (countEl) countEl.textContent = `${igPostsData.length} posts found`;
      if (exportRow) exportRow.style.display = igPostsData.length ? "flex" : "none";
    } catch (e) {
      showError("Connection error: " + (e?.message || String(e)));
      igRenderPostsEmpty();
    } finally {
      setBtnLoading("ig-btn-fetch-posts", false);
      hideProfileCardSkeleton("ig-profile-card");
    }
  }
  function igRenderPostsEmpty() {
    const el = document.getElementById("ig-posts-tbody");
    if (el) el.innerHTML = emptyRow(8, "No posts found.");
  }
  function igRenderPostsTable() {
    const tbody = document.getElementById("ig-posts-tbody");
    if (!tbody) return;
    if (!igPostsData.length) {
      igRenderPostsEmpty();
      return;
    }
    tbody.innerHTML = "";
    igPostsData.forEach((p) => {
      const tr = document.createElement("tr");
      tr.addEventListener("click", () => tr.classList.toggle("selected"));
      const tdThumb = document.createElement("td");
      if (p.thumbnail) {
        const img = document.createElement("img");
        img.src = `/image-proxy?url=${encodeURIComponent(p.thumbnail)}`;
        img.alt = "";
        img.className = "thumbnail";
        img.onerror = () => img.replaceWith(thumbPlaceholder("\u{1F4F7}"));
        tdThumb.appendChild(img);
      } else {
        tdThumb.appendChild(thumbPlaceholder("\u{1F4F7}"));
      }
      tr.appendChild(tdThumb);
      const tdCap = document.createElement("td");
      const div = document.createElement("div");
      div.className = "caption-cell";
      div.textContent = p.caption || "\u2014";
      div.title = p.caption || "";
      tdCap.appendChild(div);
      tr.appendChild(tdCap);
      const tdType = document.createElement("td");
      tdType.className = "hide-mobile";
      tdType.innerHTML = igTypeBadge(p.type);
      tr.appendChild(tdType);
      const tdDate = document.createElement("td");
      tdDate.className = "date-cell hide-mobile";
      tdDate.textContent = formatDate(p.timestamp);
      tr.appendChild(tdDate);
      tr.appendChild(numCell(p.likes));
      tr.appendChild(numCell(p.comments));
      const tdViews = numCell(p.videoViews, "hide-mobile");
      tr.appendChild(tdViews);
      const tdLink = document.createElement("td");
      tdLink.className = "link-cell";
      if (p.url) {
        const a = document.createElement("a");
        a.href = p.url;
        a.target = "_blank";
        a.rel = "noopener";
        a.textContent = "\u2197";
        tdLink.appendChild(a);
      }
      tr.appendChild(tdLink);
      tbody.appendChild(tr);
    });
  }
  function igTypeBadge(type) {
    const t = (type || "").toLowerCase();
    if (t === "reel") return '<span class="badge badge-vertical">\u{1F3AC} Reel</span>';
    if (t === "video") return '<span class="badge badge-vertical">\u{1F3AC} Video</span>';
    if (t === "sidecar" || t === "album") return '<span class="badge badge-horizontal">\u{1F5BC} Album</span>';
    return '<span class="badge badge-unknown">\u{1F4F7} Image</span>';
  }
  function igPopulateDropdown() {
    const sel = document.getElementById("ig-post-select");
    if (!sel) return;
    sel.innerHTML = "";
    if (!igPostsData.length) {
      sel.innerHTML = '<option value="">\u2014 no posts \u2014</option>';
      return;
    }
    igPostsData.forEach((p, i) => {
      const opt = document.createElement("option");
      opt.value = p.url || "";
      opt.textContent = truncate(p.caption || p.url || `Post ${i + 1}`, 60);
      sel.appendChild(opt);
    });
  }
  async function igFetchComments() {
    const post_url = document.getElementById("ig-post-select")?.value;
    if (!post_url) {
      showError("Select a post first.");
      return;
    }
    if (!requireKey("instagram")) return;
    const count = parseInt(document.getElementById("ig-comment-count")?.value, 10) || 50;
    setBtnLoading("ig-btn-fetch-comments", true);
    showLoading("ig-comments-tbody", 6);
    const exportRow = document.getElementById("ig-comments-export-row");
    if (exportRow) exportRow.style.display = "none";
    document.getElementById("error-banner")?.classList.add("hidden");
    try {
      const res = await fetch("/scrape/instagram/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ post_url, count })
      });
      const data = await safeJson(res);
      if (data.error) {
        showError(data.error);
        igRenderCommentsEmpty();
        return;
      }
      if (data.warning) showError(data.warning);
      setIgCommentsData(data.comments || []);
      igRenderCommentsTable();
      const countEl = document.getElementById("ig-comments-count");
      if (countEl) countEl.textContent = `${igCommentsData.length} comments found`;
      if (exportRow) exportRow.style.display = igCommentsData.length ? "flex" : "none";
    } catch (e) {
      showError("Connection error: " + (e?.message || String(e)));
      igRenderCommentsEmpty();
    } finally {
      setBtnLoading("ig-btn-fetch-comments", false);
    }
  }
  function igRenderCommentsEmpty() {
    const el = document.getElementById("ig-comments-tbody");
    if (el) el.innerHTML = emptyRow(6, "No comments found.");
  }
  function igRenderCommentsTable() {
    const tbody = document.getElementById("ig-comments-tbody");
    if (!tbody) return;
    if (!igCommentsData.length) {
      igRenderCommentsEmpty();
      return;
    }
    tbody.innerHTML = "";
    igCommentsData.forEach((c) => tbody.appendChild(igMakeCommentRow(c)));
  }
  function igMakeCommentRow(c) {
    const tr = document.createElement("tr");
    tr.className = "comment-row";
    const tdAv = document.createElement("td");
    if (c.avatar) {
      const img = document.createElement("img");
      img.src = `/image-proxy?url=${encodeURIComponent(c.avatar)}`;
      img.alt = c.username?.[0] || "?";
      img.className = "avatar";
      img.onerror = () => img.replaceWith(avatarPlaceholder(c.username));
      tdAv.appendChild(img);
    } else {
      tdAv.appendChild(avatarPlaceholder(c.username));
    }
    tr.appendChild(tdAv);
    const tdUser = document.createElement("td");
    tdUser.className = "username-cell";
    tdUser.textContent = c.username || "\u2014";
    tr.appendChild(tdUser);
    const tdCmt = document.createElement("td");
    const d = document.createElement("div");
    d.className = "comment-cell";
    d.textContent = truncate(c.text, 120);
    d.title = c.text || "";
    tdCmt.appendChild(d);
    tr.appendChild(tdCmt);
    tr.appendChild(numCell(c.likes));
    tr.appendChild(numCell(c.replies != null && c.replies > 0 ? c.replies : null, "hide-mobile"));
    const tdPost = document.createElement("td");
    tdPost.className = "date-cell hide-mobile";
    tdPost.textContent = relativeTime(c.posted);
    tdPost.title = c.posted || "";
    tr.appendChild(tdPost);
    return tr;
  }
  function igExportPostsCSV() {
    if (!igPostsData.length) return;
    downloadBlob(
      toCSV(igPostsData.map((p) => ({
        url: p.url,
        caption: p.caption,
        type: p.type,
        timestamp: p.timestamp,
        likes: p.likes,
        comments: p.comments,
        video_views: p.videoViews
      }))),
      `instagram_posts_${getTimestamp()}.csv`,
      "text/csv"
    );
  }
  function igExportPostsXLSX() {
    if (!igPostsData.length) return;
    exportXLSX(
      igPostsData.map((p) => ({
        url: p.url,
        caption: p.caption,
        type: p.type,
        timestamp: p.timestamp,
        likes: p.likes,
        comments: p.comments,
        video_views: p.videoViews
      })),
      "Posts",
      `instagram_posts_${getTimestamp()}.xlsx`
    );
  }
  function igExportCommentsCSV() {
    if (!igCommentsData.length) return;
    downloadBlob(
      toCSV(igCommentsData.map((c) => ({
        username: c.username,
        text: c.text,
        likes: c.likes,
        replies: c.replies,
        posted: c.posted
      }))),
      `instagram_comments_${getTimestamp()}.csv`,
      "text/csv"
    );
  }
  function igExportCommentsXLSX() {
    if (!igCommentsData.length) return;
    exportXLSX(
      igCommentsData.map((c) => ({
        username: c.username,
        text: c.text,
        likes: c.likes,
        replies: c.replies,
        posted: c.posted
      })),
      "Comments",
      `instagram_comments_${getTimestamp()}.xlsx`
    );
  }
  var igDateSortDir = "desc";
  function igSortByDate() {
    if (!igPostsData.length) return;
    igDateSortDir = igDateSortDir === "desc" ? "asc" : "desc";
    const dir = igDateSortDir;
    setIgPostsData([...igPostsData].sort((a, b) => {
      const ta = a.timestamp ? new Date(a.timestamp).getTime() : 0;
      const tb = b.timestamp ? new Date(b.timestamp).getTime() : 0;
      return dir === "desc" ? tb - ta : ta - tb;
    }));
    const indicator = document.getElementById("ig-sort-date-indicator");
    if (indicator) indicator.textContent = dir === "desc" ? "\u2193" : "\u2191";
    igRenderPostsTable();
  }

  // src/modules/ig-wordcloud.ts
  var _igWcDebounce = null;
  function igGetWordCount() {
    const el = document.getElementById("ig-wc-words");
    const val = Number(el?.value || 120);
    const display = document.getElementById("ig-wc-words-value");
    if (display) display.textContent = String(val);
    return val;
  }
  function igGetFontScale() {
    const el = document.getElementById("ig-wc-font");
    const val = Number(el?.value || 100);
    const display = document.getElementById("ig-wc-font-value");
    if (display) display.textContent = String(val);
    return val / 100;
  }
  function igRegenerateWordCloud() {
    igGenerateWordCloud(true);
  }
  function normalizeWord3(w2) {
    return w2.replace(/(.)\1{2,}/g, "$1");
  }
  var STOPWORDS3 = /* @__PURE__ */ new Set([
    "the",
    "is",
    "are",
    "am",
    "was",
    "were",
    "be",
    "been",
    "being",
    "a",
    "an",
    "and",
    "or",
    "but",
    "if",
    "then",
    "so",
    "than",
    "not",
    "no",
    "of",
    "to",
    "in",
    "on",
    "for",
    "with",
    "as",
    "by",
    "at",
    "from",
    "into",
    "this",
    "that",
    "these",
    "those",
    "it",
    "its",
    "they",
    "them",
    "their",
    "you",
    "your",
    "we",
    "our",
    "i",
    "me",
    "my",
    "he",
    "she",
    "his",
    "her",
    "have",
    "has",
    "had",
    "do",
    "does",
    "did",
    "will",
    "would",
    "could",
    "should",
    "can",
    "may",
    "might",
    "shall",
    "very",
    "just",
    "also",
    "even",
    "more",
    "some",
    "any",
    "all",
    "each",
    "both",
    "too",
    "up",
    "out",
    "now",
    "here",
    "there",
    "where",
    "when",
    "how",
    "what",
    "who",
    "which",
    "why",
    "about",
    "like",
    "get",
    "got",
    "let",
    "make",
    "made",
    "good",
    "really",
    "much",
    "many",
    "yang",
    "dan",
    "di",
    "ke",
    "dari",
    "untuk",
    "dengan",
    "ini",
    "itu",
    "ada",
    "aku",
    "kamu",
    "dia",
    "mereka",
    "kita",
    "kami",
    "saya",
    "lo",
    "gue",
    "lu",
    "ya",
    "ga",
    "nggak",
    "gak",
    "ngga",
    "enggak",
    "engga",
    "nah",
    "wah",
    "aja",
    "kok",
    "nih",
    "deh",
    "sih",
    "lho",
    "tuh",
    "kan",
    "tau",
    "mau",
    "udah",
    "sudah",
    "lagi",
    "masih",
    "jadi",
    "juga",
    "pun",
    "itu",
    "banget",
    "bgt",
    "tp",
    "tapi",
    "kalo",
    "kalau",
    "biar",
    "bikin",
    "sama",
    "si",
    "lah",
    "dong",
    "kayak",
    "kaya",
    "kayaknya",
    "seperti",
    "kayanya",
    "nya",
    "loh",
    "yah",
    "iya",
    "iyaa",
    "bisa",
    "perlu",
    "harus",
    "terus",
    "gitu",
    "gini",
    "situ",
    "sini",
    "sana",
    "cara",
    "hal",
    "banyak",
    "emang",
    "memang",
    "bakal",
    "akan",
    "belum",
    "pernah",
    "selalu",
    "kadang",
    "mungkin",
    "atau",
    "karena",
    "supaya",
    "soal",
    "pas",
    "buat",
    "lebih",
    "sangat",
    "sekali",
    "cuma",
    "hanya",
    "semua",
    "setiap",
    "beberapa",
    "namun",
    "jika",
    "apakah",
    "gimana",
    "kenapa",
    "makanya",
    "padahal",
    "walaupun",
    "meskipun",
    "setelah",
    "sebelum",
    "ketika",
    "terimakasih",
    "makasih",
    "thanks",
    "thank",
    "pliss",
    "plis",
    "please",
    "haha",
    "hahaha",
    "wkwk",
    "wkwkwk",
    "wkwkwkwk",
    "hehe",
    "hihi",
    "xixi",
    "lol",
    "omg",
    "btw",
    "fyi",
    "asw",
    "oke",
    "ok",
    "okay",
    "yep",
    "yup",
    "hai",
    "hei",
    "hey",
    "hi",
    "hello",
    "bye",
    "ciao",
    "www",
    "http",
    "https",
    "com",
    "org",
    "net",
    "id",
    "co",
    "love",
    "heart",
    "fire",
    "star",
    "kak",
    "kakak",
    "kk",
    "om",
    "tante",
    "mas",
    "mbak",
    "pak",
    "bu",
    "bang",
    "abang",
    "bro",
    "sis",
    "cuy",
    "gan",
    "bos",
    "boss",
    "yg",
    "yng",
    "dgn",
    "dg",
    "krn",
    "karna",
    "utk",
    "dlm",
    "sdh",
    "blm",
    "lg",
    "lgi",
    "msh",
    "jd",
    "jg",
    "jga",
    "spy",
    "bngt",
    "skrg",
    "kmrn",
    "bsk",
    "tdk",
    "gw",
    "w",
    "u",
    "km",
    "kmu",
    "mrk",
    "dy",
    "woy",
    "woi",
    "bagus",
    "keren",
    "mantap",
    "mantul",
    "anjir",
    "anjay",
    "asik",
    "suka",
    "follow",
    "share",
    "save",
    "tag",
    "komen",
    "iyo",
    "iyaaa",
    "nope",
    "sip",
    "siap",
    "noted"
  ]);
  function isValidWord3(w2) {
    if (!w2 || w2.length < 3) return false;
    if (STOPWORDS3.has(w2)) return false;
    if (/^\d+$/.test(w2)) return false;
    if (/^(.)\1{2,}$/.test(w2)) return false;
    if (!/[a-z]/.test(w2)) return false;
    return true;
  }
  function tokenize3(text) {
    return (text || "").toLowerCase().replace(/https?:\/\/\S+/g, "").replace(/@[\w.]+/g, "").replace(/#[\w]+/g, "").replace(/[^\w\s]/g, " ").replace(/_/g, " ").split(/\s+/).map(normalizeWord3).filter(isValidWord3);
  }
  function igBuildWordFreq(limit) {
    const bigram = document.getElementById("ig-wc-bigram")?.checked ?? false;
    const trigram = document.getElementById("ig-wc-trigram")?.checked ?? false;
    const freq = /* @__PURE__ */ new Map();
    igCommentsData.forEach((c) => {
      const tokens = tokenize3(c.text);
      tokens.forEach((w2) => freq.set(w2, (freq.get(w2) || 0) + 1));
      if (bigram) {
        for (let i = 0; i < tokens.length - 1; i++) {
          const bg = tokens[i] + " " + tokens[i + 1];
          freq.set(bg, (freq.get(bg) || 0) + 1);
        }
      }
      if (trigram) {
        for (let i = 0; i < tokens.length - 2; i++) {
          const tg = tokens[i] + " " + tokens[i + 1] + " " + tokens[i + 2];
          freq.set(tg, (freq.get(tg) || 0) + 1);
        }
      }
    });
    const all = [...freq.entries()].sort((a, b) => b[1] - a[1]);
    const minFreq = all.length > 200 ? 2 : 1;
    return all.filter(([, v]) => v >= minFreq).slice(0, limit).map(([text, value]) => ({ text, value }));
  }
  function igGenerateWordCloud(force = false) {
    if (!igCommentsData.length) {
      showError("Fetch Instagram comments first.");
      return;
    }
    const wrap = document.getElementById("ig-wordcloud-wrap");
    const canvas = document.getElementById("ig-wordcloud-canvas");
    const wordLimit = igGetWordCount();
    const fontScale = igGetFontScale();
    const words = igBuildWordFreq(wordLimit);
    wrap.classList.remove("hidden");
    _wcUpdateSliderFill3(document.getElementById("ig-wc-words"));
    _wcUpdateSliderFill3(document.getElementById("ig-wc-font"));
    wrap.scrollIntoView({ behavior: "smooth" });
    const W = 1200, H = 650, DPR = window.devicePixelRatio || 2;
    canvas.width = W * DPR;
    canvas.height = H * DPR;
    canvas.style.width = "100%";
    canvas.style.background = "#ffffff";
    const ctx = canvas.getContext("2d");
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(DPR, DPR);
    const d3 = window.d3;
    const maxF = words[0].value, minF = words[words.length - 1].value;
    const sizeScale = d3.scaleSqrt().domain([minF, maxF]).range([14 * fontScale, 72 * fontScale]);
    const colorScale = d3.scaleLinear().domain([minF, maxF]).range([0, 1]);
    function pickColor(v, text) {
      const t = colorScale(v);
      const pal = ["#0f172a", "#1e293b", "#334155", "#1d4ed8", "#2563eb", "#3b82f6", "#7c3aed", "#8b5cf6", "#0f766e", "#14b8a6", "#15803d", "#22c55e"];
      let pool = t > 0.8 ? pal.slice(0, 3) : t > 0.6 ? pal.slice(2, 6) : t > 0.4 ? pal.slice(4, 9) : pal.slice(6);
      if (text.includes(" ") && t > 0.4) pool = ["#7c3aed", "#8b5cf6", "#14b8a6"];
      return pool[Math.floor(Math.random() * pool.length)];
    }
    function pickWeight(v) {
      const t = colorScale(v);
      return t > 0.8 ? 800 : t > 0.5 ? 700 : 600;
    }
    d3.layout.cloud().size([W, H]).canvas(() => document.createElement("canvas")).words(words.map((w2) => ({ ...w2, size: Math.round(sizeScale(w2.value)), rotate: Math.random() < 0.1 ? Math.random() < 0.5 ? -20 : 20 : 0 }))).padding(2).rotate((d) => d.rotate).font("Inter").fontSize((d) => d.size).on("end", (dw) => {
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, W, H);
      ctx.translate(W / 2, H / 2);
      dw.forEach((w2) => {
        ctx.save();
        ctx.translate(w2.x, w2.y);
        ctx.rotate(w2.rotate * Math.PI / 180);
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = pickColor(w2.value, w2.text);
        ctx.font = `${pickWeight(w2.value)} ${w2.size}px Inter`;
        ctx.fillText(w2.text, 0, 0);
        ctx.restore();
      });
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    }).start();
  }
  function igDownloadWordCloud() {
    const canvas = document.getElementById("ig-wordcloud-canvas");
    const link = document.createElement("a");
    link.download = `ig_wordcloud_${Date.now()}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  }
  function _wcUpdateSliderFill3(el) {
    if (!el) return;
    const min = Number(el.min || 0), max = Number(el.max || 100), val = Number(el.value);
    const pct = ((val - min) / (max - min) * 100).toFixed(1);
    el.style.background = `linear-gradient(to right, rgba(16,185,129,0.85) 0%, rgba(16,185,129,0.85) ${pct}%, rgba(255,255,255,0.12) ${pct}%, rgba(255,255,255,0.12) 100%)`;
  }
  function _igWcLiveUpdate() {
    if (!igCommentsData.length) return;
    igGetWordCount();
    igGetFontScale();
    _wcUpdateSliderFill3(document.getElementById("ig-wc-words"));
    _wcUpdateSliderFill3(document.getElementById("ig-wc-font"));
    if (_igWcDebounce) clearTimeout(_igWcDebounce);
    _igWcDebounce = setTimeout(() => igGenerateWordCloud(), 280);
  }

  // src/main.ts
  var w = window;
  w.switchPlatform = switchPlatform;
  w.toggleKeys = toggleKeys;
  w.toggleTheme = toggleTheme;
  w.toggleEye = toggleEye;
  w.saveKey = saveKey;
  w.clearKey = clearKey;
  w.ttSwitchTab = ttSwitchTab;
  w.ttFetchVideos = ttFetchVideos;
  w.ttFetchComments = ttFetchComments;
  w.ttExportVideosCSV = ttExportVideosCSV;
  w.ttExportVideosXLSX = ttExportVideosXLSX;
  w.ttExportCommentsCSV = ttExportCommentsCSV;
  w.ttExportCommentsXLSX = ttExportCommentsXLSX;
  w.ttSortByDate = ttSortByDate;
  w.ttGenerateWordCloud = ttGenerateWordCloud;
  w.ttRegenerateWordCloud = ttRegenerateWordCloud;
  w.ttDownloadWordCloud = ttDownloadWordCloud;
  w.ytSwitchTab = ytSwitchTab;
  w.ytSyncChannelInput = ytSyncChannelInput;
  w.ytFetchChannelAndVideos = ytFetchChannelAndVideos;
  w.ytFetchVideos = ytFetchVideos;
  w.ytFetchStats = ytFetchStats;
  w.ytExportVideosCSV = ytExportVideosCSV;
  w.ytExportVideosXLSX = ytExportVideosXLSX;
  w.ytExportStatsCSV = ytExportStatsCSV;
  w.ytExportStatsXLSX = ytExportStatsXLSX;
  w.ytFetchComments = ytFetchComments;
  w.ytExportCommentsCSV = ytExportCommentsCSV;
  w.ytExportCommentsXLSX = ytExportCommentsXLSX;
  w.ytSortByDate = ytSortByDate;
  w.ytGenerateWordCloud = ytGenerateWordCloud;
  w.ytRegenerateWordCloud = ytRegenerateWordCloud;
  w.ytDownloadWordCloud = ytDownloadWordCloud;
  w.igSwitchTab = igSwitchTab;
  w.igFetchPosts = igFetchPosts;
  w.igFetchComments = igFetchComments;
  w.igExportPostsCSV = igExportPostsCSV;
  w.igExportPostsXLSX = igExportPostsXLSX;
  w.igExportCommentsCSV = igExportCommentsCSV;
  w.igExportCommentsXLSX = igExportCommentsXLSX;
  w.igSortByDate = igSortByDate;
  w.igGenerateWordCloud = igGenerateWordCloud;
  w.igRegenerateWordCloud = igRegenerateWordCloud;
  w.igDownloadWordCloud = igDownloadWordCloud;
  function syncTopbarPadding() {
    const topbar = document.querySelector(".topbar");
    const appShell = document.querySelector(".app-shell");
    if (!topbar || !appShell) return;
    appShell.style.paddingTop = topbar.getBoundingClientRect().height + "px";
  }
  document.addEventListener("DOMContentLoaded", () => {
    initTheme();
    refreshKeyStatuses();
    switchPlatform("tiktok");
    ytSwitchTab("videos");
    ttSwitchTab("videos");
    igSwitchTab("posts");
    _wcUpdateSliderFill(document.getElementById("tt-wc-words"));
    _wcUpdateSliderFill(document.getElementById("tt-wc-font"));
    document.getElementById("tt-wc-words")?.addEventListener("input", _wcLiveUpdate);
    document.getElementById("tt-wc-font")?.addEventListener("input", _wcLiveUpdate);
    document.getElementById("tt-wc-bigram")?.addEventListener("change", _wcLiveUpdate);
    document.getElementById("tt-wc-trigram")?.addEventListener("change", _wcLiveUpdate);
    _wcUpdateSliderFill(document.getElementById("yt-wc-words"));
    _wcUpdateSliderFill(document.getElementById("yt-wc-font"));
    document.getElementById("yt-wc-words")?.addEventListener("input", _ytWcLiveUpdate);
    document.getElementById("yt-wc-font")?.addEventListener("input", _ytWcLiveUpdate);
    document.getElementById("yt-wc-bigram")?.addEventListener("change", _ytWcLiveUpdate);
    document.getElementById("yt-wc-trigram")?.addEventListener("change", _ytWcLiveUpdate);
    _wcUpdateSliderFill(document.getElementById("ig-wc-words"));
    _wcUpdateSliderFill(document.getElementById("ig-wc-font"));
    document.getElementById("ig-wc-words")?.addEventListener("input", _igWcLiveUpdate);
    document.getElementById("ig-wc-font")?.addEventListener("input", _igWcLiveUpdate);
    document.getElementById("ig-wc-bigram")?.addEventListener("change", _igWcLiveUpdate);
    document.getElementById("ig-wc-trigram")?.addEventListener("change", _igWcLiveUpdate);
    document.getElementById("btn-theme")?.addEventListener("click", toggleTheme);
    document.getElementById("btn-keys")?.addEventListener("click", toggleKeys);
    document.getElementById("keys-overlay")?.addEventListener("click", toggleKeys);
    document.querySelectorAll(".platform-tab").forEach((btn) => {
      btn.addEventListener("click", () => switchPlatform(btn.dataset["platform"]));
    });
    document.getElementById("tt-tab-videos")?.addEventListener("click", () => ttSwitchTab("videos"));
    document.getElementById("tt-tab-comments")?.addEventListener("click", () => ttSwitchTab("comments"));
    document.getElementById("tt-btn-fetch-videos")?.addEventListener("click", ttFetchVideos);
    document.getElementById("tt-btn-fetch-comments")?.addEventListener("click", ttFetchComments);
    document.getElementById("tt-btn-wordcloud")?.addEventListener("click", () => ttGenerateWordCloud());
    document.getElementById("tt-btn-download-wordcloud")?.addEventListener("click", ttDownloadWordCloud);
    document.getElementById("tt-export-videos-csv")?.addEventListener("click", ttExportVideosCSV);
    document.getElementById("tt-export-videos-xlsx")?.addEventListener("click", ttExportVideosXLSX);
    document.getElementById("tt-export-comments-csv")?.addEventListener("click", ttExportCommentsCSV);
    document.getElementById("tt-export-comments-xlsx")?.addEventListener("click", ttExportCommentsXLSX);
    document.getElementById("yt-tab-videos")?.addEventListener("click", () => ytSwitchTab("videos"));
    document.getElementById("yt-tab-stats")?.addEventListener("click", () => ytSwitchTab("stats"));
    document.getElementById("yt-tab-comments")?.addEventListener("click", () => ytSwitchTab("comments"));
    document.getElementById("yt-btn-channel")?.addEventListener("click", ytFetchChannelAndVideos);
    document.getElementById("yt-btn-videos")?.addEventListener("click", ytFetchVideos);
    document.getElementById("yt-btn-stats")?.addEventListener("click", ytFetchStats);
    document.getElementById("yt-btn-comments")?.addEventListener("click", ytFetchComments);
    document.getElementById("yt-btn-wordcloud")?.addEventListener("click", () => ytGenerateWordCloud());
    document.getElementById("yt-btn-download-wordcloud")?.addEventListener("click", ytDownloadWordCloud);
    document.getElementById("yt-export-videos-csv")?.addEventListener("click", ytExportVideosCSV);
    document.getElementById("yt-export-videos-xlsx")?.addEventListener("click", ytExportVideosXLSX);
    document.getElementById("yt-export-stats-csv")?.addEventListener("click", ytExportStatsCSV);
    document.getElementById("yt-export-stats-xlsx")?.addEventListener("click", ytExportStatsXLSX);
    document.getElementById("yt-export-comments-csv")?.addEventListener("click", ytExportCommentsCSV);
    document.getElementById("yt-export-comments-xlsx")?.addEventListener("click", ytExportCommentsXLSX);
    document.getElementById("yt-channel-id")?.addEventListener("input", (e) => ytSyncChannelInput(e.target.value));
    document.getElementById("ig-tab-posts")?.addEventListener("click", () => igSwitchTab("posts"));
    document.getElementById("ig-tab-comments")?.addEventListener("click", () => igSwitchTab("comments"));
    document.getElementById("ig-btn-fetch-posts")?.addEventListener("click", igFetchPosts);
    document.getElementById("ig-btn-fetch-comments")?.addEventListener("click", igFetchComments);
    document.getElementById("ig-btn-wordcloud")?.addEventListener("click", () => igGenerateWordCloud());
    document.getElementById("ig-btn-download-wordcloud")?.addEventListener("click", igDownloadWordCloud);
    document.getElementById("ig-export-posts-csv")?.addEventListener("click", igExportPostsCSV);
    document.getElementById("ig-export-posts-xlsx")?.addEventListener("click", igExportPostsXLSX);
    document.getElementById("ig-export-comments-csv")?.addEventListener("click", igExportCommentsCSV);
    document.getElementById("ig-export-comments-xlsx")?.addEventListener("click", igExportCommentsXLSX);
    document.getElementById("save-tiktok-key")?.addEventListener("click", () => saveKey("tiktok"));
    document.getElementById("clear-tiktok-key")?.addEventListener("click", () => clearKey("tiktok"));
    document.getElementById("save-youtube-key")?.addEventListener("click", () => saveKey("youtube"));
    document.getElementById("clear-youtube-key")?.addEventListener("click", () => clearKey("youtube"));
    document.getElementById("save-ig-session-key")?.addEventListener("click", () => saveKey("ig-session"));
    document.getElementById("clear-ig-session-key")?.addEventListener("click", () => clearKey("ig-session"));
    document.getElementById("toggle-tiktok-key-eye")?.addEventListener("click", function() {
      toggleEye("tiktok-key-input", this);
    });
    document.getElementById("toggle-youtube-key-eye")?.addEventListener("click", function() {
      toggleEye("youtube-key-input", this);
    });
    document.getElementById("toggle-ig-session-key-eye")?.addEventListener("click", function() {
      toggleEye("ig-session-key-input", this);
    });
    syncTopbarPadding();
    window.addEventListener("resize", syncTopbarPadding);
    document.fonts?.ready.then(syncTopbarPadding);
  });
})();
