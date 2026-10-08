/* ============================================================
   app.js — 页面主逻辑
   ============================================================ */

const $ = id => document.getElementById(id);
const STORE_KEY = "libwrt_cloudbuild_v1";

/* ---------------- 状态 ---------------- */

const state = {
  repo: "Bet5521/LibWrt",
  token: "",
  remember: true,
  line: "24.10-nss",
  config: "configs/IPQ60XX.config",
  pkgs: new Set(),
  custom: "",
  remove: "",
  feeds: [],          // [{ id, name, url, branch, result }]
  sys: {
    lanip: "", netmask: "", dns: "", hostname: "", tz: "", rootpw: "",
    wifion: "on", ssid: "", wifipw: "", country: "", ch2g: "", ht2g: "HE20", ch5g: "", ht5g: "HE80"
  },
  release: true,
  verified: false,
  theme: "dark"
};

let feedSeq = 0;

/* ---------------- 小工具 ---------------- */

function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function setStatus(el, kind, html) {
  if (typeof el === "string") el = $(el);
  el.className = "status" + (kind ? " " + kind : "");
  el.innerHTML = html || "";
}

function splitList(raw) {
  return String(raw || "")
    .split(/[\s,，、;；\n\r]+/)
    .map(s => s.trim())
    .filter(Boolean);
}

function getCustomPkgs() { return splitList(state.custom); }
function getRemovePkgs() { return splitList(state.remove); }
function allAddPkgs() { return [...state.pkgs, ...getCustomPkgs()]; }

function debounce(fn, ms) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

/* ---------------- 持久化 ---------------- */

function save() {
  const data = {
    repo: state.repo, line: state.line, config: state.config,
    pkgs: [...state.pkgs], custom: state.custom, remove: state.remove,
    feeds: state.feeds.map(f => ({ name: f.name, url: f.url, branch: f.branch, raw: f.raw, forcedBranch: f.forcedBranch })),
    sys: state.sys, release: state.release, theme: state.theme, remember: state.remember
  };
  try { localStorage.setItem(STORE_KEY, JSON.stringify(data)); } catch (e) { /* ignore */ }
  if (state.remember || !state.token) {
    if (state.remember && state.token) localStorage.setItem(STORE_KEY + "_token", state.token);
  }
  if (!state.remember) localStorage.removeItem(STORE_KEY + "_token");
}

function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) {
      const d = JSON.parse(raw);
      Object.assign(state, {
        repo: d.repo || state.repo,
        line: LINES[d.line] ? d.line : state.line,
        config: d.config || state.config,
        custom: d.custom || "",
        remove: d.remove || "",
        release: d.release !== false,
        theme: d.theme || state.theme
      });
      state.pkgs = new Set(Array.isArray(d.pkgs) ? d.pkgs : []);
      state.sys = Object.assign(state.sys, d.sys || {});
      state.feeds = (Array.isArray(d.feeds) ? d.feeds : []).map(f => ({
        id: "f" + (++feedSeq), name: f.name || "", url: f.url || "",
        branch: f.branch || "", raw: f.raw || "", forcedBranch: f.forcedBranch || "",
        result: null, loading: false
      }));
    }
    const tk = localStorage.getItem(STORE_KEY + "_token");
    if (tk) state.token = tk;
    const th = localStorage.getItem(STORE_KEY + "_theme");
    if (th) state.theme = th;
  } catch (e) { /* ignore */ }
}

/* ---------------- 主题 ---------------- */

function applyTheme() {
  document.documentElement.setAttribute("data-theme", state.theme);
  $("btn-theme").textContent = state.theme === "dark" ? "☀️" : "🌙";
  localStorage.setItem(STORE_KEY + "_theme", state.theme);
}

/* ---------------- 渲染：编译分支 / 档位 ---------------- */

function renderLines() {
  const sel = $("in-line");
  sel.innerHTML = "";
  Object.entries(LINES).forEach(([key, v]) => {
    const o = document.createElement("option");
    o.value = key; o.textContent = v.label;
    sel.appendChild(o);
  });
  sel.value = state.line;
  updateLineHint();
}

function updateLineHint() {
  const L = LINES[state.line];
  $("hint-line").innerHTML =
    `源码 <code>${esc(L.sourceRepo)}@${esc(L.sourceBranch)}</code> · 内核 <code>${esc(L.kernel)}</code>`;
  $("device-foot").innerHTML =
    `<b>本线要点：</b>${esc(L.note)}<br>` +
    `<b>默认 feeds 来源：</b><code>${esc(L.feedsRepo)}@${esc(L.feedsRef)}/feeds.conf.default</code>`;
}

function renderConfigs() {
  const sel = $("in-config");
  sel.innerHTML = "";
  CONFIGS.forEach(c => {
    const o = document.createElement("option");
    o.value = c.file; o.textContent = `${c.label} · ${c.file}`;
    sel.appendChild(o);
  });
  sel.value = state.config;
  updateConfigHint();
}

function updateConfigHint() {
  const c = CONFIGS.find(x => x.file === state.config);
  $("hint-config").textContent = c ? c.hint : "";
}

/* ---------------- 渲染：功能组件 ---------------- */

const SRC_BADGE = {
  luci:     { cls: "ok",     txt: "默认 feed" },
  packages: { cls: "ok",     txt: "默认 feed" },
  nss:      { cls: "nss",    txt: "NSS 源" },
  preset:   { cls: "preset", txt: "预置 feed" },
  third:    { cls: "third",  txt: "需第三方源" }
};

function renderCatalog() {
  const box = $("cats");
  box.innerHTML = "";

  CATALOG.forEach(cat => {
    const el = document.createElement("div");
    el.className = "cat";
    el.dataset.cat = cat.cat;

    const title = document.createElement("div");
    title.className = "cat-title";
    title.textContent = cat.cat;
    el.appendChild(title);

    if (cat.note) {
      const n = document.createElement("div");
      n.className = "cat-note";
      n.textContent = cat.note;
      el.appendChild(n);
    }

    const list = document.createElement("div");
    list.className = "pkgs";

    cat.items.forEach(it => {
      const b = SRC_BADGE[it.src] || SRC_BADGE.third;
      const tag = document.createElement("div");
      tag.className = "pkg" + (state.pkgs.has(it.pkg) ? " on" : "");
      tag.dataset.pkg = it.pkg;
      tag.dataset.hay = (it.pkg + " " + it.name + " " + (it.desc || "") + " " + cat.cat).toLowerCase();
      tag.title = it.pkg + (it.note ? "（" + it.note + "）" : "");

      let extra = "";
      if (it.lines && it.lines.length === 1) {
        extra += `<span class="chip-mini gray">仅 ${esc(it.lines[0])}</span>`;
      }

      tag.innerHTML =
        `<span class="ic">${it.icon || "📦"}</span>` +
        `<span class="nm">${esc(it.name)}</span>` +
        `<span class="chip-mini ${b.cls}">${b.txt}</span>` + extra +
        `<span class="dp">${esc(it.desc || "")}</span>` +
        `<span class="pk-check"></span>`;

      tag.addEventListener("click", () => togglePkg(it.pkg, tag));
      list.appendChild(tag);
    });

    el.appendChild(list);
    box.appendChild(el);
  });
}

function togglePkg(pkg, el) {
  if (state.pkgs.has(pkg)) { state.pkgs.delete(pkg); el.classList.remove("on"); }
  else { state.pkgs.add(pkg); el.classList.add("on"); }
  el.classList.remove("verified-miss");
  const chk = el.querySelector(".pk-check");
  if (chk) chk.innerHTML = "";
  refreshPkgSummary();
  save();
}

function refreshPkgSummary() {
  const all = allAddPkgs();
  $("out-pkgs").textContent = all.length ? all.join(",") : "—";
  $("btn-copy-pkgs").hidden = all.length === 0;
  $("cnt-pkg").textContent = all.length ? `已选 ${all.length} 个` : "";
  const users = splitList(state.custom).filter(p => state.pkgs.has(p));
  if (users.length) {
    // 自定义框里重复勾选的包，提示一下
    setStatus("st-pkgs", "warn", "以下包在「额外包名」里重复填写了：" + esc(users.join(", ")));
  }
  renderReview();
}

function filterCatalog(q) {
  const query = q.toLowerCase().trim();
  document.querySelectorAll(".cat").forEach(cat => {
    let visible = 0;
    cat.querySelectorAll(".pkg").forEach(tag => {
      const hit = !query || tag.dataset.hay.includes(query) || tag.dataset.pkg.includes(query);
      tag.classList.toggle("hide", !hit);
      if (hit) visible++;
    });
    cat.classList.toggle("hide", visible === 0);
  });
}

/* ---------------- 渲染：feed ---------------- */

function renderDefaultFeeds(info) {
  const box = $("feeds-default");
  const L = LINES[state.line];
  box.innerHTML = "";

  if (!info || !info.feeds.length) {
    $("feeds-note").innerHTML =
      `未能读取 <code>${esc(L.feedsRepo)}@${esc(L.feedsRef)}</code> 的 feeds 配置` +
      (info && info.error ? `（${esc(info.error)}）` : "") + "。编译时仍会使用源码自带的默认 feeds。";
    return;
  }

  $("feeds-note").innerHTML =
    `来自 <code>${esc(L.feedsRepo)}@${esc(L.feedsRef)}/${esc(info.path)}</code>，编译时自动生效，无需在此填写。`;

  info.feeds.forEach(f => {
    const d = document.createElement("div");
    d.className = "feed-item";
    d.innerHTML =
      `<div class="fi-top"><span class="fi-name">${esc(f.name)}</span>` +
      `<span class="chip-mini ok">默认</span>` +
      (f.branch ? `<span class="chip-mini gray">${esc(f.branch)}</span>` : "") +
      `</div><div class="fi-url">${esc(f.url)}</div>`;
    box.appendChild(d);
  });
}

function renderCustomFeeds() {
  const box = $("feeds-custom");
  box.innerHTML = "";
  $("cnt-feed").textContent = state.feeds.length ? `${state.feeds.length} 个` : "";

  if (!state.feeds.length) {
    box.innerHTML = `<div class="feed-item"><span class="fi-url">还没有自定义源。默认情况下只用源码自带的 feeds。</span></div>`;
    return;
  }

  state.feeds.forEach(f => {
    const d = document.createElement("div");
    const r = f.result;
    d.className = "feed-item" + (f.loading ? "" : (r ? (r.level === "bad" ? " bad" : r.level === "warn" ? " warn" : " good") : ""));

    let top = `<div class="fi-top"><span class="fi-name">${esc(f.name || "(未命名)")}</span>`;
    if (f.loading) top += `<span class="chip-mini gray"><span class="spin"></span> 校验中…</span>`;
    else if (r) {
      const cls = r.level === "bad" ? "miss" : r.level === "warn" ? "third" : "ok";
      const txt = r.level === "bad" ? "不可用" : r.level === "warn" ? "有风险" : "可用";
      top += `<span class="chip-mini ${cls}">${txt}</span>`;
    }
    if (f.branch) top += `<span class="chip-mini gray">${esc(f.branch)}</span>`;
    top += `<button class="btn ghost tiny" data-act="refeed" data-id="${f.id}" type="button">重新校验</button>`;
    top += `<button class="btn ghost tiny" data-act="delfeed" data-id="${f.id}" type="button">删除</button>`;
    top += `</div>`;

    let body = `<div class="fi-url">${esc(f.url)}</div>`;

    if (r && r.headline) {
      body += `<div class="fi-note"><b>${esc(r.headline)}</b></div>`;
    }
    if (r && r.notes && r.notes.length) {
      const cls = { info: "fi-note", warn: "fi-note", bad: "fi-note" };
      body += r.notes.map(n => `<div class="${cls[n.level] || "fi-note"}">${n.level === "warn" ? "⚠️ " : n.level === "bad" ? "❌ " : "ℹ️ "}${n.msg}</div>`).join("");
    }
    if (r && r.advices && r.advices.length) {
      body += `<div class="fi-advice">` + r.advices.map((a, i) =>
        a.apply && a.apply.remove
          ? `<button class="btn ghost tiny" data-act="delfeed" data-id="${f.id}" type="button">${esc(a.label)}</button>`
          : a.apply && a.apply.branch
            ? `<button class="btn ghost tiny" data-act="usebranch" data-id="${f.id}" data-branch="${esc(a.apply.branch)}" type="button">${esc(a.label)}</button>`
            : `<span class="chip-mini gray">建议：${esc(a.label)}</span>`
      ).join("") + `</div>`;
      const noteAdvice = r.advices.find(a => a.apply && a.apply.note);
      if (noteAdvice) body += `<div class="fi-note">${esc(noteAdvice.apply.note)}</div>`;
    }

    d.innerHTML = top + body;
    box.appendChild(d);
  });

  box.querySelectorAll("[data-act]").forEach(btn => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.id;
      const f = state.feeds.find(x => x.id === id);
      if (!f) return;
      const act = btn.dataset.act;
      if (act === "delfeed") {
        state.feeds = state.feeds.filter(x => x.id !== id);
        save(); renderCustomFeeds(); renderReview();
      } else if (act === "refeed") {
        revalidateFeed(f);
      } else if (act === "usebranch") {
        f.branch = btn.dataset.branch;
        f.forcedBranch = f.branch;
        save(); revalidateFeed(f);
      }
    });
  });
}

/* ---------------- 校验流程 ---------------- */

async function revalidateFeed(f) {
  f.loading = true;
  renderCustomFeeds();
  const spec = parseFeedInput(f.url, f.name, f.branch);
  if (spec.error) {
    f.loading = false;
    f.result = { level: "bad", headline: "地址无法解析", notes: [{ level: "bad", msg: esc(spec.error) }], advices: [] };
    renderCustomFeeds(); renderReview(); return;
  }
  f.name = spec.name;
  f.url = spec.url;      // 规范化后的 git 地址（简写会被补成完整 https 形式）
  const line = LINES[state.line];
  const result = await checkFeed(spec, line);
  f.loading = false;
  f.result = result;
  // 采纳推荐分支（含用户未指定分支时自动选择）
  if (result.meta && result.meta.useBranch && result.level !== "bad") {
    if (!f.forcedBranch) f.branch = result.meta.useBranch;
  }
  save();
  renderCustomFeeds();
  renderReview();
}

async function addFeed() {
  const urlRaw = $("in-feed-url").value.trim();
  const nameRaw = $("in-feed-name").value.trim();
  const branchRaw = $("in-feed-branch").value.trim();

  if (!urlRaw) { setStatus("st-feed", "err", "请填写 feed 地址"); return; }

  const spec = parseFeedInput(urlRaw, nameRaw, branchRaw);
  if (spec.error) { setStatus("st-feed", "err", esc(spec.error)); return; }

  const dup = state.feeds.find(f => f.name === spec.name);
  if (dup) { setStatus("st-feed", "warn", `已有同名源 <code>${esc(spec.name)}</code>，请换名字或先删除旧的。`); return; }

  if (!state.token) {
    setStatus("st-feed", "warn", "未填 Token：校验可用，但配额只有 60 次/小时，很快会用完。");
  }

  const f = {
    id: "f" + (++feedSeq),
    name: spec.name,
    url: spec.url,       // 规范化后的 git 地址，而不是用户原样输入
    branch: spec.branch,
    forcedBranch: branchRaw ? spec.branch : "",
    loading: true,
    result: null
  };
  state.feeds.push(f);
  save();
  renderCustomFeeds();

  $("in-feed-url").value = ""; $("in-feed-name").value = ""; $("in-feed-branch").value = "";
  await revalidateFeed(f);
  setStatus("st-feed", "", "");
}

/* ---------------- 连接校验 ---------------- */

async function verifyConn() {
  const repo = $("in-repo").value.trim();
  const token = $("in-token").value.trim();

  if (!repo || !token) { setStatus("st-conn", "err", "请填写仓库地址和 Token"); return; }
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) { setStatus("st-conn", "err", "仓库格式应为 <code>用户名/仓库名</code>"); return; }

  state.repo = repo;
  state.token = token;
  state.remember = $("in-remember").checked;
  GH.setToken(token);

  setStatus("st-conn", "load", `<span class="spin"></span> 正在验证…`);

  const r = await GH.call(`/repos/${repo}`);
  if (r.status === 401) { setStatus("st-conn", "err", "❌ Token 无效或已过期，请重新生成。"); return; }
  if (r.status === 404) { setStatus("st-conn", "err", "❌ 仓库不存在，或 Token 无该仓库的访问权限。"); return; }
  if (!r.ok) { setStatus("st-conn", "err", `❌ 验证失败（HTTP ${r.status}${r.netError ? " / " + r.netError : ""}）。`); return; }

  const d = r.data;
  state.verified = true;
  save();
  $("lnk-releases").href = `https://github.com/${repo}/releases`;
  $("btn-repo").href = `https://github.com/${repo}`;
  $("btn-repo").textContent = "📦 " + repo.split("/")[1];

  let html = `✅ 连接成功：<code>${esc(d.full_name)}</code>（${d.private ? "私有" : "公开"}）· 默认分支 <code>${esc(d.default_branch)}</code>`;

  // 经典 PAT 会返回 scope；细粒度 PAT 不返回，只能靠触发时的报错定位
  if (r.scopes) {
    const scopes = r.scopes.split(",").map(s => s.trim()).filter(Boolean);
    if (!scopes.includes("repo") && !scopes.includes("public_repo")) {
      html += `<br>⚠️ 该经典 Token 没有 <code>repo</code> 权限，触发编译会被拒绝。请重新生成并勾选 <code>repo</code>。`;
    }
    if (scopes.includes("repo") || scopes.includes("public_repo")) {
      html += `<br>ℹ️ 经典 Token 权限看起来够用（含 <code>${esc(scopes.join(", "))}</code>）。`;
    }
  } else {
    html += `<br>ℹ️ 这是细粒度 Token，权限无法预先读取。触发编译需要 <b>Actions: Read and write</b>；若被拒绝，下面的报错会直接告诉你缺什么。`;
  }

  setStatus("st-conn", r.scopes && !/repo/.test(r.scopes) ? "warn" : "ok", html);
  renderReview();
}

/* ---------------- 复核表 ---------------- */

function renderReview() {
  const L = LINES[state.line];
  const add = allAddPkgs();
  const del = getRemovePkgs();
  const goodFeeds = state.feeds.filter(f => !f.loading && f.result && f.result.level !== "bad");
  const badFeeds = state.feeds.filter(f => !f.loading && f.result && f.result.level === "bad");
  const s = state.sys;

  const rows = [
    ["编译分支", `<code>${esc(L.short)}</code> → <code>${esc(L.sourceRepo)}@${esc(L.sourceBranch)}</code>`],
    ["内核 / 机型", `<code>${esc(L.kernel)}</code> · <code>jdcloud_re-ss-01</code>`],
    ["固件档位", `<code>${esc(state.config)}</code>`],
    ["加入组件", add.length ? esc(add.join(", ")) : "（仅档位默认）", !add.length],
    ["移除组件", del.length ? esc(del.join(", ")) : "（无）", !del.length],
    ["自定义 feed", goodFeeds.length
      ? goodFeeds.map(f => `<code>${esc(f.name)}</code>`).join(" ") + (badFeeds.length ? ` <span class="chip-mini miss">${badFeeds.length} 个不可用将被忽略</span>` : "")
      : "（仅用源码默认 feeds）", !goodFeeds.length],
    ["LAN", `<code>${esc(s.lanip || "192.168.10.1")}</code> / <code>${esc(s.netmask || "255.255.255.0")}</code> · DNS <code>${esc(s.dns || "223.5.5.5")}</code>`],
    ["主机名", s.hostname ? esc(s.hostname) : "JDC-AX1800Pro（默认）", !s.hostname],
    ["无线", `${s.wifion === "off" ? "开机不启用" : "开机启用"} · SSID <code>${esc(s.ssid || "JDC-AX1800Pro")}</code> · ${esc(s.country || "CN")} · 2.4G ch${esc(s.ch2g || "6")}/${esc(s.ht2g)} · 5G ch${esc(s.ch5g || "36")}/${esc(s.ht5g)}`],
    ["root 密码", s.rootpw ? "已设置" : "无密码（首次登录自行设置）", !s.rootpw],
    ["发布 Release", state.release ? "是" : "否（只留 Actions artifact）", !state.release]
  ];

  $("review").innerHTML = rows.map(r =>
    `<div class="rrow"><span class="rk">${r[0]}</span><span class="rv ${r[2] ? "empty" : ""}">${r[1]}</span></div>`
  ).join("");

  $("btn-build").disabled = !state.verified;
}

/* ---------------- 组装 inputs ---------------- */

function buildInputs() {
  const s = state.sys;
  const inputs = { config_file: state.config };

  const add = allAddPkgs().join(",");
  const del = getRemovePkgs().join(",");
  if (add) inputs.extra_packages = add;
  if (del) inputs.remove_packages = del;

  const feeds = state.feeds
    .filter(f => !f.loading && f.result && f.result.level !== "bad")
    .map(f => `src-git ${f.name} ${f.url}${f.branch ? ";" + f.branch : ""}`);
  if (feeds.length) inputs.extra_feeds = feeds.join("\n");

  if (s.lanip)    inputs.lan_ip = s.lanip;
  if (s.netmask)  inputs.lan_netmask = s.netmask;
  if (s.dns)      inputs.lan_dns = s.dns;
  if (s.hostname) inputs.hostname = s.hostname;
  if (s.tz)       inputs.timezone = s.tz;
  if (s.rootpw)   inputs.root_password = s.rootpw;

  inputs.wifi_enabled = s.wifion || "on";
  if (s.ssid)     inputs.wifi_ssid = s.ssid;
  if (s.wifipw)   inputs.wifi_password = s.wifipw;
  if (s.country)  inputs.wifi_country = s.country;
  if (s.ch2g)     inputs.wifi_channel_2g = s.ch2g;
  inputs.wifi_htmode_2g = s.ht2g;
  if (s.ch5g)     inputs.wifi_channel_5g = s.ch5g;
  inputs.wifi_htmode_5g = s.ht5g;

  inputs.make_release = !!state.release;   // boolean 类型必须传真布尔值
  return inputs;
}

/* ---------------- 触发编译 ---------------- */

const WF_FILE = "IPQ60XX-JDCloud.yml";

async function triggerBuild() {
  if (!state.verified) return;
  const btn = $("btn-build");
  btn.disabled = true;
  setStatus("st-build", "load", `<span class="spin"></span> 正在触发…`);

  const inputs = buildInputs();
  const r = await GH.call(`/repos/${state.repo}/actions/workflows/${WF_FILE}/dispatches`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ref: state.line, inputs })
  });

  const actionsUrl = `https://github.com/${state.repo}/actions/workflows/${WF_FILE}`;

  if (r.status === 204) {
    setStatus("st-build", "ok",
      `✅ 已触发！编译约 1~2 小时。<br>👉 <a href="${actionsUrl}" target="_blank" rel="noopener">点此查看进度 ↗</a><br>` +
      `完成后到 <a href="https://github.com/${state.repo}/releases" target="_blank" rel="noopener">Releases</a> 下载固件。`);
    setTimeout(() => { btn.disabled = false; }, 4000);
    return;
  }

  // ---- 精确报错诊断 ----
  const msg = (r.data && (r.data.message || "")) || "";
  let html = "";

  if (r.status === 401) {
    html = "❌ Token 无效或已过期，请重新生成。";
  } else if (r.status === 403) {
    html = "❌ 权限不足（403）。<br>" +
      `<span style="opacity:.85">GitHub 返回：<code>${esc(msg)}</code></span><br>` +
      "如果是<strong>细粒度 Token</strong>，请到 <a href=\"https://github.com/settings/personal-access-tokens\" target=\"_blank\" rel=\"noopener\">Token 设置</a> " +
      "把该仓库的 <b>Actions: Read and write</b> 打开（<b>Contents: Read</b> 也需要）；<br>" +
      "如果是<strong>经典 Token</strong>，请确认勾选了 <code>repo</code>（修改工作流文件才需要额外的 <code>workflow</code>）。<br>" +
      "不想折腾 Token 的话，用下面的「复制手动填写用参数」，去 Actions 页面点 Run workflow 手动填也是一样的。";
  } else if (r.status === 404) {
    html = `❌ 找不到工作流 <code>${esc(WF_FILE)}</code>（404）。<br>` +
      `常见原因：分支 <code>${esc(state.line)}</code> 上不存在该 workflow 文件，或 Token 对仓库没有访问权限。`;
  } else if (r.status === 422) {
    html = `❌ 参数被拒绝（422）。<br>GitHub 返回：<code>${esc(msg)}</code><br>` +
      `通常是分支 <code>${esc(state.line)}</code> 不存在，或某个 choice 类型的取值不在允许范围内。`;
  } else if (r.status === 0) {
    html = `❌ 网络错误：${esc(r.netError || "请求失败")}。请检查网络/代理后重试。`;
  } else {
    html = `❌ 触发失败（HTTP ${r.status}）。<br><code>${esc(msg)}</code>`;
  }

  setStatus("st-build", "err", html);
  btn.disabled = false;
}

/* ---------------- 导出 / 复制 ---------------- */

function download(name, text) {
  const blob = new Blob([text], { type: "application/json;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

function exportJSON() {
  const payload = { ref: state.line, workflow: WF_FILE, repo: state.repo, inputs: buildInputs() };
  download(`libwrt-build-${state.line}.json`, JSON.stringify(payload, null, 2));
  setStatus("st-build", "ok", "已导出参数 JSON。");
}

async function copyManual() {
  const inputs = buildInputs();
  const lines = Object.entries(inputs).map(([k, v]) =>
    `${k} = ${typeof v === "boolean" ? v : JSON.stringify(v)}`
  );
  const text =
    `仓库: ${state.repo}\n` +
    `分支: ${state.line}\n` +
    `Workflow: ${WF_FILE}\n` +
    `Actions 页面: https://github.com/${state.repo}/actions/workflows/${WF_FILE}\n\n` +
    `在 Run workflow 表单里逐项填写：\n` + lines.join("\n");

  try {
    await navigator.clipboard.writeText(text);
    setStatus("st-build", "ok", "已复制到剪贴板，可直接粘贴到 Actions 表单。");
  } catch (e) {
    setStatus("st-build", "warn", "浏览器拒绝了剪贴板访问，已改为下载文本文件。");
    download(`libwrt-manual-${state.line}.txt`, text);
  }
}

/* ---------------- 包校验 ---------------- */

async function runPkgCheck() {
  const pkgs = allAddPkgs();
  if (!pkgs.length) { setStatus("st-pkgs", "warn", "还没选任何包。"); return; }

  const line = LINES[state.line];
  setStatus("st-pkgs", "load",
    `<span class="spin"></span> 正在对照 <code>${esc(line.luciRepo)}@${esc(line.luciRef)}</code> 与 ` +
    `<code>${esc(line.packagesRepo)}@${esc(line.packagesRef)}</code> 校验 ${pkgs.length} 个包…`);

  const [presetState, res] = await Promise.all([
    checkPresetFeeds().catch(() => null),
    checkPackages(pkgs, line)
  ]);
  const { result, partial, errors, rateLimited } = res;

  // 清理旧标记
  document.querySelectorAll(".pkg").forEach(t => {
    t.classList.remove("verified-miss");
    const c = t.querySelector(".pk-check"); if (c) c.innerHTML = "";
  });

  const miss = [], ok = [], unknown = [], third = [];
  for (const p of pkgs) {
    const r = result[p];
    if (r.status === "ok" || r.status === "preset") ok.push(p);
    else if (r.status === "miss") miss.push(p);
    else if (r.status === "third") third.push(p);
    else unknown.push(p);
  }

  document.querySelectorAll(".pkg").forEach(t => {
    const p = t.dataset.pkg;
    if (!result[p]) return;
    const c = t.querySelector(".pk-check");
    if (result[p].status === "ok") { if (c) c.innerHTML = `<span class="chip-mini ok">✓</span>`; }
    else if (result[p].status === "preset") { if (c) c.innerHTML = `<span class="chip-mini preset">预置</span>`; }
    else if (result[p].status === "third") { if (c) c.innerHTML = `<span class="chip-mini third">需加源</span>`; }
    else if (result[p].status === "miss") {
      t.classList.add("verified-miss");
      if (c) c.innerHTML = `<span class="chip-mini miss">未见</span>`;
    }
  });

  const presetCount = pkgs.filter(p => result[p].status === "preset").length;
  let html = `校验完成：<b class="ok">${ok.length}</b> 个确认存在`;
  if (presetCount) html += `（其中 <b>${presetCount}</b> 个来自仓库预置 feed，编译时会自动补上）`;
  if (unknown.length) html += `，<b>${unknown.length}</b> 个无法判定`;
  if (third.length) html += `，<b>${third.length}</b> 个需第三方源`;
  if (miss.length) html += `，<b>${miss.length}</b> 个在默认 feed 里没找到`;
  html += `。<br>`;

  if (third.length) {
    html += `<span style="opacity:.9">需第三方源：<code>${esc(third.join(", "))}</code></span><br>` +
      `这些包在默认源里本来就没有，要在第 4 步添加对应 feed 才会编进去。<br>`;
  }
  if (miss.length) {
    html += `<span style="opacity:.9">未找到：<code>${esc(miss.join(", "))}</code></span><br>` +
      `要么在第 4 步添加对应 feed，要么删掉它们（否则编译时只是警告、不会中断）。<br>`;
  }
  if (unknown.length && partial) {
    if (rateLimited) {
      html += `⚠️ GitHub API 配额已用尽，索引不完整并已中断后续查询。<b>填上 Token 再试</b>（配额 5000/小时）；未填 Token 时只有 60 次/小时。`;
    } else {
      html += `（feed 索引不完整，未完成项：<code>${esc(errors.slice(0, 4).join(", "))}</code>${errors.length > 4 ? " 等" : ""}）`;
    }
  }
  setStatus("st-pkgs", miss.length ? "warn" : "ok", html);
}

/* ---------------- 事件绑定 ---------------- */

function bind() {
  $("btn-theme").addEventListener("click", () => {
    state.theme = state.theme === "dark" ? "light" : "dark";
    applyTheme();
  });

  $("in-repo").addEventListener("input", e => { state.repo = e.target.value.trim(); state.verified = false; renderReview(); save(); });
  $("in-token").addEventListener("input", e => (state.token = e.target.value.trim()));
  $("in-remember").addEventListener("change", e => { state.remember = e.target.checked; save(); });

  $("btn-eye").addEventListener("click", () => {
    const i = $("in-token");
    const hidden = i.type === "password";
    i.type = hidden ? "text" : "password";
    $("btn-eye").textContent = hidden ? "隐藏" : "显示";
  });

  $("btn-verify").addEventListener("click", verifyConn);

  $("in-line").addEventListener("change", e => {
    state.line = e.target.value;
    updateLineHint();
    loadDefaultFeeds();
    // 换了编译线，之前的 feed 校验结论与包索引都失效
    state.feeds.forEach(f => { f.result = null; f.forcedBranch = ""; });
    renderCustomFeeds();
    setStatus("st-pkgs", "", "");
    document.querySelectorAll(".pk-check").forEach(c => c.innerHTML = "");
    document.querySelectorAll(".pkg").forEach(t => t.classList.remove("verified-miss"));
    save(); renderReview();
    if (state.feeds.length) state.feeds.forEach(f => revalidateFeed(f));
  });

  $("in-config").addEventListener("change", e => { state.config = e.target.value; updateConfigHint(); save(); renderReview(); });

  $("in-search").addEventListener("input", e => filterCatalog(e.target.value));

  $("btn-clear").addEventListener("click", () => {
    state.pkgs.clear();
    document.querySelectorAll(".pkg.on").forEach(t => t.classList.remove("on"));
    refreshPkgSummary(); save();
  });

  $("btn-check-pkgs").addEventListener("click", runPkgCheck);

  $("in-custom").addEventListener("input", e => { state.custom = e.target.value; refreshPkgSummary(); save(); });
  $("in-remove").addEventListener("input", e => { state.remove = e.target.value; refreshPkgSummary(); save(); });

  $("btn-copy-pkgs").addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(allAddPkgs().join(","));
      const b = $("btn-copy-pkgs"); b.textContent = "已复制 ✓";
      setTimeout(() => { b.textContent = "复制"; }, 1400);
    } catch (e) { /* ignore */ }
  });

  $("btn-add-feed").addEventListener("click", addFeed);
  $("in-feed-url").addEventListener("keydown", e => { if (e.key === "Enter") addFeed(); });
  $("in-feed-name").addEventListener("keydown", e => { if (e.key === "Enter") addFeed(); });
  $("in-feed-branch").addEventListener("keydown", e => { if (e.key === "Enter") addFeed(); });
  $("btn-reload-feeds").addEventListener("click", loadDefaultFeeds);

  // 系统设置
  const map = {
    "in-lanip": "lanip", "in-netmask": "netmask", "in-dns": "dns", "in-hostname": "hostname",
    "in-tz": "tz", "in-rootpw": "rootpw", "in-wifion": "wifion", "in-ssid": "ssid",
    "in-wifipw": "wifipw", "in-country": "country", "in-ch2g": "ch2g", "in-ht2g": "ht2g",
    "in-ch5g": "ch5g", "in-ht5g": "ht5g"
  };
  Object.entries(map).forEach(([id, key]) => {
    const el = $(id);
    const h = debounce(() => { renderReview(); save(); }, 260);
    el.addEventListener("input", e => { state.sys[key] = e.target.value; h(); });
    el.addEventListener("change", e => { state.sys[key] = e.target.value; renderReview(); save(); });
  });

  $("in-release").addEventListener("change", e => { state.release = e.target.checked; renderReview(); save(); });

  $("btn-build").addEventListener("click", triggerBuild);
  $("btn-export").addEventListener("click", exportJSON);
  $("btn-copy-inputs").addEventListener("click", copyManual);

  // 防误关页面
  window.addEventListener("beforeunload", e => {
    if ($("st-build").classList.contains("load")) { e.preventDefault(); e.returnValue = ""; }
  });
}

/* ---------------- 默认 feeds 加载 ---------------- */

let feedsLoading = false;
function renderPresetFeeds(presetState) {
  const box = $("feeds-preset");
  if (!box) return;
  box.innerHTML = "";
  const st = presetState || {};

  PRESET_FEEDS.forEach(f => {
    const s = st[f.name] || {};
    const seen = f.dirs.filter(d => s.dirs && s.dirs[d] === true);
    const badge = !s.dirs ? `<span class="chip-mini gray">未确认</span>`
      : s.ok ? `<span class="chip-mini ok">已确认</span>`
      : `<span class="chip-mini miss">读取失败</span>`;
    const d = document.createElement("div");
    d.className = "feed-item" + (s.dirs && !s.ok ? " warn" : " good");
    d.innerHTML =
      `<div class="fi-top"><span class="fi-name">${esc(f.name)}</span>` +
      `<span class="chip-mini preset">预置</span>` + badge +
      (f.branch ? `<span class="chip-mini gray">${esc(f.branch)}</span>` : "") +
      `</div>` +
      `<div class="fi-url">${esc(f.url)}</div>` +
      `<div class="fi-note">${esc(f.desc)}</div>` +
      `<div class="fi-note">包目录：` +
      f.dirs.map(x => `<code>${esc(x)}</code>`).join(" ") +
      (seen.length ? ` —— 已确认 ${seen.length}/${f.dirs.length} 个` : "") +
      `</div>` +
      (f.why ? `<div class="fi-note">${esc(f.why)}</div>` : "");
    box.appendChild(d);
  });
}

async function loadDefaultFeeds() {
  if (feedsLoading) return;
  feedsLoading = true;
  $("feeds-note").innerHTML = `<span class="spin"></span> 正在读取 ${esc(LINES[state.line].feedsRepo)} 的 feeds 配置…`;
  $("feeds-default").innerHTML = "";
  $("feeds-preset").innerHTML = `<div class="feed-item"><span class="fi-url">正在确认预置 feed 的包目录…</span></div>`;
  try {
    const [info, preset] = await Promise.all([
      fetchDefaultFeeds(LINES[state.line]),
      checkPresetFeeds().catch(() => null)
    ]);
    renderDefaultFeeds(info);
    renderPresetFeeds(preset);
  } catch (e) {
    renderDefaultFeeds(null);
    renderPresetFeeds(null);
  } finally {
    feedsLoading = false;
  }
}

/* ---------------- 初始化 ---------------- */

function fillForm() {
  $("in-repo").value = state.repo;
  $("in-token").value = state.token;
  $("in-remember").checked = state.remember;
  $("in-custom").value = state.custom;
  $("in-remove").value = state.remove;
  $("in-release").checked = state.release;

  const s = state.sys;
  $("in-lanip").value = s.lanip; $("in-netmask").value = s.netmask; $("in-dns").value = s.dns;
  $("in-hostname").value = s.hostname; $("in-tz").value = s.tz; $("in-rootpw").value = s.rootpw;
  $("in-wifion").value = s.wifion; $("in-ssid").value = s.ssid; $("in-wifipw").value = s.wifipw;
  $("in-country").value = s.country; $("in-ch2g").value = s.ch2g; $("in-ht2g").value = s.ht2g;
  $("in-ch5g").value = s.ch5g; $("in-ht5g").value = s.ht5g;
}

document.addEventListener("DOMContentLoaded", () => {
  load();
  GH.setToken(state.token);
  applyTheme();
  renderLines();
  renderConfigs();
  renderCatalog();
  fillForm();
  bind();
  renderCustomFeeds();
  refreshPkgSummary();
  renderReview();
  loadDefaultFeeds();

  if (state.token) setStatus("st-conn", "load", "已从上次会话恢复 Token，点「验证连接」确认仍然有效。");
  if (state.repo) $("btn-repo").href = `https://github.com/${state.repo}`;
});
