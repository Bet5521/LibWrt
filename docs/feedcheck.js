/* ============================================================
   feedcheck.js — GitHub API 封装 + feed 源校验 + 包名存在性校验
   ------------------------------------------------------------
   全部在浏览器直连 api.github.com（官方支持 CORS），不经任何中转。
   带 Token 时用 Token（配额 5000/小时）；不带也能查公开仓库，
   但配额只有 60 次/小时，做两三次校验就会用光。
   ============================================================ */

const GH_API = "https://api.github.com";
const FETCH_TIMEOUT_MS = 20000;

/* ---------------- 基础封装 ---------------- */

const GH = {
  token: "",
  setToken(t) { this.token = (t || "").trim(); },

  _headers() {
    const h = {
      "Accept": "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28"
    };
    if (this.token) h["Authorization"] = "Bearer " + this.token;
    return h;
  },

  async call(pathOrUrl, init = {}) {
    const url = pathOrUrl.startsWith("http") ? pathOrUrl : GH_API + pathOrUrl;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        ...init,
        signal: ctrl.signal,
        headers: { ...this._headers(), ...(init.headers || {}) }
      });
      let data = null;
      const ct = res.headers.get("content-type") || "";
      if (ct.includes("json")) { try { data = await res.json(); } catch (e) { /* ignore */ } }
      return {
        status: res.status,
        ok: res.ok,
        data,
        scopes: res.headers.get("x-oauth-scopes"),
        accepted: res.headers.get("x-accepted-oauth-scopes"),
        rateLeft: res.headers.get("x-ratelimit-remaining")
      };
    } catch (err) {
      const aborted = err && err.name === "AbortError";
      return { status: 0, ok: false, data: null, netError: aborted ? "请求超时" : "网络错误" };
    } finally {
      clearTimeout(timer);
    }
  }
};

function b64ToText(b64) {
  const bin = atob((b64 || "").replace(/\s/g, ""));
  const bytes = Uint8Array.from(bin, c => c.charCodeAt(0));
  return new TextDecoder("utf-8").decode(bytes);
}

/* ---------------- 解析用户输入 ---------------- */

/**
 * 支持：
 *   owner/repo
 *   https://github.com/owner/repo[.git]
 *   git@github.com:owner/repo.git
 *   https://gitee.com/owner/repo.git
 *   带分支：<url>;branch  或  <url>@branch  （也可单独填在分支框）
 *   整行写法：src-git <name> <url>
 *   两段写法：<name> <url>
 */
function parseFeedInput(rawUrl, rawName, rawBranch) {
  let url = (rawUrl || "").trim().replace(/\r/g, "");
  let name = (rawName || "").trim();
  let branch = (rawBranch || "").trim();

  if (!url) return { error: "请填写 feed 地址" };

  if (/^src-[a-z-]+\s+/i.test(url)) {                 // src-git <name> <url>
    const parts = url.split(/\s+/).filter(Boolean);
    if (parts.length >= 3) { if (!name) name = parts[1]; url = parts[2]; }
    else if (parts.length === 2) { url = parts[1]; }
  } else if (/\s/.test(url)) {                        // <name> <url>
    const parts = url.split(/\s+/).filter(Boolean);
    if (parts.length === 2 && parts[1].includes("/")) {
      if (!name) name = parts[0];
      url = parts[1];
    } else {
      url = parts[0];
    }
  }

  // URL 尾巴上夹带分支
  //   ;branch  → feeds.conf 的官方写法，最可靠，无条件采纳
  //   @branch  → 仅在 @ 出现在最后一个 / 之后时才算分支，避免把 git@host:owner/repo 误拆
  if (!branch) {
    const m = url.match(/;([^;\s]+)$/);
    if (m) {
      branch = m[1];
      url = url.slice(0, url.length - m[1].length - 1);
    } else {
      const at = url.lastIndexOf("@");
      const slash = url.lastIndexOf("/");
      if (at > 0 && at > slash && !/^git@/.test(url)) {
        const tail = url.slice(at + 1);
        if (tail && !tail.includes("/")) {
          branch = tail;
          url = url.slice(0, at);
        }
      }
    }
  }

  const cleaned = url.replace(/^git\+/, "").replace(/^git@([^:]+):/, "https://$1/");

  let host = "", path = "";
  if (/^https?:\/\//i.test(cleaned)) {
    try { const u = new URL(cleaned); host = u.hostname.toLowerCase(); path = u.pathname; }
    catch (e) { return { error: "地址格式无法解析" }; }
  } else if (/^[\w.-]+\/[\w.-]+$/.test(cleaned)) {
    host = "github.com"; path = "/" + cleaned;
  } else {
    return { error: "地址格式无法解析：支持 owner/repo、https://github.com/owner/repo.git 等写法" };
  }

  path = path.replace(/\.git$/i, "").replace(/^\/+|\/+$/g, "");
  const seg = path.split("/").filter(Boolean);
  const isGithub = host === "github.com" || host === "www.github.com";

  if (isGithub && seg.length < 2) return { error: "GitHub 地址至少需要 owner/repo 两段" };
  if (!isGithub && seg.length < 2) return { error: "地址里看不出仓库路径" };

  const owner = seg[0] || "";
  const repo  = seg[1] || "";
  if (!name) name = (repo || path).toLowerCase().replace(/[^a-z0-9_.-]/g, "-");

  // 规范化的 git 地址：必须能直接喂给 scripts/feeds。
  // 用户填简写（kenzok8/openwrt-packages）时，绝不能把它原样写进 feeds.conf —— git 不认。
  let canonical;
  if (isGithub) {
    const sub = seg.length > 2 ? "/" + seg.slice(2).join("/") : "";
    canonical = `https://github.com/${owner}/${repo}${sub}${sub ? "" : ".git"}`;
  } else {
    canonical = cleaned;   // 非 GitHub：保留用户给的完整写法
  }

  return {
    raw: url, url: canonical, host, owner, repo, name, branch, isGithub,
    full: isGithub ? `${owner}/${repo}` : `${host}/${seg.join("/")}`,
    subPath: seg.slice(2).join("/"),
    confLine() { return `src-git ${this.name} ${this.url}${this.branch ? ";" + this.branch : ""}`; }
  };
}

/* ---------------- 分支推荐 ---------------- */

/**
 * 从分支名里提取 OpenWrt 版本号（如 openwrt-24.10 → 24.10）。
 * 只认标准写法，避免把 NSS-12.5-K6.x 这类版本号误当 OpenWrt 版本。
 */
function versionOf(branch) {
  const s = (branch || "").trim();
  let m = s.match(/^openwrt-(\d{2,4})\.(\d{1,2})$/);
  if (m) return `${m[1]}.${m[2]}`;
  m = s.match(/^(\d{2,4})\.(\d{1,2})$/);
  if (m) return `${m[1]}.${m[2]}`;
  m = s.match(/openwrt-(\d{2,4})\.(\d{1,2})/);
  if (m) return `${m[1]}.${m[2]}`;
  return "";
}

function closestBranch(wanted, branches) {
  if (!wanted) return "";
  const w = wanted.toLowerCase();
  const wv = versionOf(wanted);
  let best = "", bestScore = 0;
  for (const b of branches) {
    const bl = b.toLowerCase();
    let score = 0;
    if (bl === w) score = 100;
    else if (bl.endsWith(w) || w.endsWith(bl)) score = 80;
    else {
      let i = 0;
      while (i < w.length && i < bl.length && w[i] === bl[i]) i++;
      score = i * 2;
    }
    if (wv && versionOf(b) === wv) score += 40;
    if (score > bestScore) { bestScore = score; best = b; }
  }
  return bestScore >= 6 ? best : "";
}

function suggestBranch(branches, line, wanted, defaultBranch) {
  if (!branches || !branches.length) return null;

  if (wanted) {
    if (branches.includes(wanted)) {
      return { pick: wanted, why: `你指定的分支 ${wanted} 存在`, level: "good" };
    }
    const near = closestBranch(wanted, branches);
    if (near) return { pick: near, why: `你指定的 ${wanted} 不存在，最接近的是 ${near}`, level: "warn" };
    return { pick: branches[0], why: `你指定的 ${wanted} 不存在，仓库里另有 ${branches.length} 个分支`, level: "warn" };
  }

  if (branches.includes(line.versionTag)) {
    return { pick: line.versionTag, why: `未指定分支，自动选用与编译线一致的 ${line.versionTag}`, level: "good" };
  }
  const ow = branches.filter(b => /^openwrt-\d+\.\d+$/.test(b)).sort().reverse();
  if (ow.length) {
    return { pick: ow[0], why: `未指定分支，且仓库没有 ${line.versionTag}；退用最新的 ${ow[0]}（跨版本，需自行确认）`, level: "warn" };
  }
  for (const b of ["main", "master"]) {
    if (branches.includes(b)) {
      return { pick: b, why: `未指定分支，仓库没有版本分支，用 ${b}（第三方源常见做法）`, level: "warn" };
    }
  }
  if (defaultBranch) return { pick: defaultBranch, why: `未指定分支，用仓库默认分支 ${defaultBranch}`, level: "warn" };
  return { pick: branches[0], why: `未指定分支，退用 ${branches[0]}`, level: "warn" };
}

/* ---------------- feed 源校验 ---------------- */

async function checkFeed(spec, line) {
  const out = { level: "good", headline: "", notes: [], advices: [], meta: {} };
  const warn = m => { out.notes.push({ level: "warn", msg: m }); if (out.level === "good") out.level = "warn"; };
  const bad  = m => { out.notes.push({ level: "bad",  msg: m }); out.level = "bad"; };
  const info = m => out.notes.push({ level: "info", msg: m });

  // ---- 0) 非 GitHub 源：只能做格式校验 ----
  if (!spec.isGithub) {
    out.level = "warn";
    out.headline = "非 GitHub 源 · 无法在线预校验";
    info(`地址指向 <code>${spec.host}</code>。本页只能校验 GitHub 仓库，该源会在云端编译时由 <code>scripts/feeds update</code> 实际验证 —— 失败只会被自动跳过，不会拖垮整条构建。`);
    info("请自行确认该源对标的 OpenWrt 版本与当前编译线一致。");
    out.meta.useBranch = spec.branch || "";
    return out;
  }

  // ---- 1) 仓库存在性 ----
  const repoRes = await GH.call(`/repos/${spec.owner}/${spec.repo}`);
  if (repoRes.status === 404) {
    bad(`仓库 <code>${spec.full}</code> 不存在，或无权限访问。请检查拼写；私有仓库需要 Token 具备该仓库读取权限。`);
    return out;
  }
  if (repoRes.status === 403 && repoRes.rateLeft === "0") {
    bad("GitHub API 配额用尽（未登录只有 60 次/小时）。填上 Token 后重试。");
    return out;
  }
  if (!repoRes.ok) {
    bad(`查询仓库失败（HTTP ${repoRes.status}${repoRes.netError ? " / " + repoRes.netError : ""}）。`);
    return out;
  }

  const info0 = repoRes.data;
  out.meta.defaultBranch = info0.default_branch;
  out.meta.sizeKB = info0.size;
  out.meta.pushedAt = info0.pushed_at;
  if (info0.archived) warn("该仓库已被作者<strong>归档（archived）</strong>，大概率长期不更新。");
  if (info0.fork) info("这是一个 fork 仓库。");

  // ---- 2) 分支列表 ----
  const brRes = await GH.call(`/repos/${spec.owner}/${spec.repo}/branches?per_page=100`);
  const branches = Array.isArray(brRes.data) ? brRes.data.map(b => b.name) : [];
  out.meta.branches = branches;
  if (branches.length === 100) info("分支数 ≥100，只检查了前 100 个。");

  // ---- 3) 决定实际用哪个分支 ----
  const sug = suggestBranch(branches, line, spec.branch, info0.default_branch);
  let useBranch = spec.branch || info0.default_branch || "";

  if (spec.branch && !branches.includes(spec.branch)) {
    if (sug && sug.pick) {
      warn(`分支 <code>${spec.branch}</code> 不存在，已自动改用 <code>${sug.pick}</code>。`);
      useBranch = sug.pick;
    } else {
      bad(`分支 <code>${spec.branch}</code> 不存在，且没有找到可替代的分支。`);
      return out;
    }
  } else if (sug && sug.pick && sug.pick !== useBranch) {
    out.notes.push({ level: sug.level === "good" ? "info" : "warn", msg: `分支建议 <code>${sug.pick}</code>：${sug.why}` });
    out.advices.push({ label: `改用分支 ${sug.pick}`, apply: { branch: sug.pick } });
    if (out.level === "good" && sug.level !== "good") out.level = "warn";
    useBranch = sug.pick;
  } else if (sug) {
    info(sug.why);
  }

  out.meta.useBranch = useBranch;

  // ---- 4) 版本匹配判定 ----
  const bv = versionOf(useBranch);
  const lv = versionOf(line.versionTag);
  if (bv && bv !== lv) {
    warn(
      `版本不匹配：该源分支是 <code>${useBranch}</code>（OpenWrt ${bv}），当前编译线是 ` +
      `<code>${line.versionTag}</code>（OpenWrt ${lv}）。跨版本 feed 的包可能依赖了新 API / 新内核，` +
      `表现为编不过或运行时异常。`
    );
    out.advices.push({ label: `切到本线版本 ${line.versionTag}`, apply: { branch: line.versionTag } });
  } else if (!bv) {
    info(`分支 <code>${useBranch}</code> 不含版本号（如 main/master），版本匹配度无法判断，请自行确认。`);
  }

  // ---- 5) 内容识别 ----
  const cRes = await GH.call(`/repos/${spec.owner}/${spec.repo}/contents/?ref=${encodeURIComponent(useBranch)}`);
  const names = Array.isArray(cRes.data) ? cRes.data.map(x => x.name) : [];
  out.meta.topLevel = names;

  const hasLuciApp  = names.some(n => /^luci-(app|theme|proto|mod|lib)-/.test(n));
  const hasLuciTree = ["applications", "themes", "modules", "protocols", "collections"].some(d => names.includes(d));
  const pkgDirs     = ["net", "utils", "libs", "kernel", "multimedia", "admin", "system", "lang", "sound", "mail", "devel", "firmware"];
  const hasPkgTree  = pkgDirs.filter(d => names.includes(d)).length >= 3;
  const hasKmodDir  = names.some(n => /^kmod-/.test(n));
  const looksLikeSrc = names.includes("feeds.conf.default") || names.includes("feeds.conf") ||
                       (names.includes("target") && names.includes("package") && names.includes("include"));

  if (looksLikeSrc) {
    bad("这看起来是一棵<strong>完整 OpenWrt 源码树</strong>，不是 feed 源。feed 应该是只含包的仓库，加进来会让 <code>feeds update</code> 失败。");
    out.headline = `不是 feed 源：${spec.full}`;
    return out;
  }

  if (!hasLuciApp && !hasLuciTree && !hasPkgTree && !hasKmodDir) {
    warn("顶层结构不像标准 OpenWrt feed（没看到 <code>luci-app-*</code>、<code>applications/</code>、<code>net|utils|kernel</code> 之类）。仍可添加，但编译时很可能一个包都装不上。");
    out.advices.push({ label: "删除该条目", apply: { remove: true } });
  } else {
    const kind = (hasLuciApp || hasLuciTree) ? "LuCI 应用源" : (hasKmodDir ? "含内核模块的包源" : "OpenWrt 包源");
    info(`识别为：<strong>${kind}</strong>。`);
  }

  // ---- 6) 内核相关性 ----
  let isKmod = hasKmodDir;
  let pkgCount = null;
  const tRes = await GH.call(`/repos/${spec.owner}/${spec.repo}/git/trees/${encodeURIComponent(useBranch)}?recursive=1`);
  if (tRes.ok && tRes.data && Array.isArray(tRes.data.tree)) {
    const paths = tRes.data.tree.map(t => t.path);
    pkgCount = paths.filter(p => p.endsWith("/Makefile")).length;
    out.meta.pkgCount = pkgCount;
    if (tRes.data.truncated) info("仓库文件过多，目录树被截断，以下判断基于可见部分。");
    if (paths.some(p => /(^|\/)kmod-[^/]+\/Makefile$/.test(p))) isKmod = true;
    if (paths.some(p => /(^|\/)target\//.test(p) || /(^|\/)patches-[0-9.]+\//.test(p))) {
      warn("该源里存在 <code>target/</code> 或内核补丁目录，通常意味着它绑定自己的内核版本，用在本仓库上极可能打补丁失败。");
    }
  } else {
    info("未能读取完整目录树（仓库过大或接口受限），已跳过深层内容检查。");
  }

  if (isKmod) {
    warn(
      `该源含 <strong>内核模块（kmod-*）</strong>。当前编译线内核 <code>${line.kernel}</code>：` +
      `kmod 会用本仓库内核源码<strong>现编</strong>，源码接口没变时通常可用；` +
      `但若是<strong>预编译的闭源驱动/固件</strong>（很多 WiFi、硬件加速驱动属于这类），跨内核版本会直接失效。`
    );
    out.advices.push({
      label: "怎么处理 kmod",
      apply: { note: "在第 3 步里不要把该源的 kmod-* 勾进来；若必须用它，得把源码换成与该源同内核版本的仓库。" }
    });
  }

  // ---- 7) 结论 ----
  const suffix = pkgCount !== null ? ` · 约 ${pkgCount} 个包` : "";
  if (out.level === "bad")       out.headline = `不可用：${spec.full}@${useBranch}`;
  else if (out.level === "warn") out.headline = `可用但有风险：${spec.full}@${useBranch}${suffix}`;
  else                           out.headline = `可用：${spec.full}@${useBranch}${suffix}`;

  return out;
}

/* ---------------- 包名存在性校验 ---------------- */

const _idxCache = new Map();

async function buildPkgIndex(line) {
  const key = [line.luciRepo, line.luciRef, line.packagesRepo, line.packagesRef].join("|");
  if (_idxCache.has(key)) return _idxCache.get(key);

  const idx = { luci: new Set(), packages: new Set(), errors: [], partial: false, rateLimited: false };

  const grab = async (repo, ref, dir) => {
    if (idx.rateLimited) return;   // 配额已尽，不再发无谓请求
    const r = await GH.call(`/repos/${repo}/contents/${dir}?ref=${encodeURIComponent(ref)}`);
    // 404 = 该分类目录本来就不存在（不同分支的 packages 仓库分类不一样），不算错误
    if (r.status === 404) return;
    if (!r.ok) {
      if (r.status === 403 && r.rateLeft === "0") idx.rateLimited = true;
      idx.errors.push(`${repo}/${dir} (HTTP ${r.status})`);
      idx.partial = true;
      return;
    }
    if (!Array.isArray(r.data)) { idx.errors.push(`${repo}/${dir} (非目录)`); idx.partial = true; return; }
    r.data.forEach(x => { (repo === line.luciRepo ? idx.luci : idx.packages).add(x.name); });
  };

  for (const d of ["applications", "themes", "modules", "protocols", "collections"]) {
    await grab(line.luciRepo, line.luciRef, d);
  }
  for (const d of ["net", "utils", "libs", "kernel", "multimedia", "admin", "system",
                   "lang", "sound", "mail", "devel", "firmware"]) {
    await grab(line.packagesRepo, line.packagesRef, d);
  }

  _idxCache.set(key, idx);
  return idx;
}

async function checkPackages(pkgs, line) {
  const idx = await buildPkgIndex(line);
  const result = {};
  for (const pkg of pkgs) {
    let where = "";
    if (idx.luci.has(pkg)) where = `luci feed · ${line.luciRepo}`;
    else if (idx.packages.has(pkg)) where = `packages feed · ${line.packagesRepo}`;
    else if (/^(kmod-qca-nss|nss-firmware|sqm-scripts-nss)/.test(pkg)) where = "NSS 专用源 · qosmio/nss-packages";
    else if (/^ath11k-firmware/.test(pkg)) where = "packages feed · 无线固件";
    else if (/^ipq-wifi-/.test(pkg)) where = "无线校准文件（本机型已内建）";

    if (where) result[pkg] = { status: "ok", where };
    else if (idx.partial) result[pkg] = { status: "unknown", where: "feed 索引不完整，无法判定" };
    else result[pkg] = { status: "miss", where: "" };
  }
  return { result, partial: idx.partial, errors: idx.errors, rateLimited: idx.rateLimited };
}

/* ---------------- 读取源码仓库默认 feeds ---------------- */

async function fetchDefaultFeeds(line) {
  for (const p of ["feeds.conf.default", "feeds.conf"]) {
    const r = await GH.call(`/repos/${line.feedsRepo}/contents/${p}?ref=${encodeURIComponent(line.feedsRef)}`);
    if (r.ok && r.data && r.data.content) {
      const txt = b64ToText(r.data.content);
      const feeds = [];
      txt.split(/\r?\n/).forEach(t => {
        const raw = t.trim();
        if (!raw || raw.startsWith("#")) return;
        const m = raw.match(/^src-([a-z-]+)\s+(\S+)\s+(\S+)/i);
        if (!m) return;
        let urlPart = m[3], branch = "";
        const i = m[3].lastIndexOf(";");
        if (i > 0) { urlPart = m[3].slice(0, i); branch = m[3].slice(i + 1); }
        feeds.push({ type: "src-" + m[1], name: m[2], url: urlPart, branch, raw });
      });
      return { feeds, path: p };
    }
  }
  return { feeds: [], path: "", error: "未能读取 feeds.conf.default" };
}
