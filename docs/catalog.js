/* ============================================================
   catalog.js — 功能组件目录 + 编译线元数据
   ------------------------------------------------------------
   说明（重要）：
   这里列出的包名是「人工整理 + 已知常见」的清单，用于**勾选**。
   它不保证在当前编译线里 100% 存在 —— 真正的判定交给页面上的
   「校验所选包」按钮：它会带着当前编译线去对应 feed 仓库逐个查路径。
   所以本文件只需要"尽量全、分类清楚"，准确性由运行时校验兜底。

   src 字段含义（仅作来源提示）：
     luci     → 来自 luci feed（LuCI 应用/主题/协议）
     packages → 来自 packages feed（命令行工具、内核模块等）
     nss      → 来自 qosmio NSS 专用源
     preset   → 来自本仓库预置 feed（见下方 PRESET_FEEDS），两条编译线都会自动带上
     third    → 默认源通常没有，需要第 4 步加第三方 feed

   lines 字段（可选）：限定只在某些编译线存在，例如 ["25.12-nss"]
   ============================================================ */

/* ---------------- 编译线元数据 ---------------- */

const LINES = {
  "24.10-nss": {
    label: "24.10-nss · OpenWrt 24.10 + NSS（推荐）",
    short: "24.10-nss",
    sourceRepo: "qosmio/openwrt-ipq",
    sourceBranch: "24.10-nss",
    kernel: "6.6.141",
    versionTag: "openwrt-24.10",
    // 默认 feeds 从哪个仓库读 feeds.conf.default
    feedsRepo: "qosmio/openwrt-ipq",
    feedsRef: "24.10-nss",
    // 校验包时去哪个 luci 仓库查
    luciRepo: "openwrt/luci",
    luciRef: "openwrt-24.10",
    packagesRepo: "openwrt/packages",
    packagesRef: "openwrt-24.10",
    note: "OpenWrt 主线 24.10 + qosmio 反向移植的 IPQ60xx NSS 栈。已实机跑通编译。"
  },
  "25.12-nss": {
    label: "25.12-nss · LibWrt 主线（更新，更激进）",
    short: "25.12-nss",
    sourceRepo: "Bet5521/LibWrt",
    sourceBranch: "25.12-nss",
    kernel: "6.12.x",
    versionTag: "openwrt-25.12",
    feedsRepo: "Bet5521/LibWrt",
    feedsRef: "25.12-nss",
    luciRepo: "immortalwrt/luci",
    luciRef: "openwrt-25.12",
    packagesRepo: "immortalwrt/packages",
    packagesRef: "openwrt-25.12",
    note: "immortalwrt 25.12 基础 + NSS，自带本机型支持，无需反移植补丁。"
  }
};

/* ---------------- 固件档位 ---------------- */

const CONFIGS = [
  { file: "configs/IPQ60XX.config",         label: "标准档（推荐）", hint: "NSS 满血 + ath11k 无线 + 基础 LuCI，约 18~19 MB" },
  { file: "configs/IPQ60XX-minimal.config", label: "极简档",        hint: "只保留上网与 NSS 核心，最小体积" },
  { file: "configs/IPQ60XX-full.config",    label: "完整档",        hint: "含较多常用组件，体积最大" },
  { file: "configs/NoWiFi.config",          label: "无无线档",      hint: "关掉无线，当纯有线路由/旁路由用" }
];

/* ---------------- 功能组件目录 ---------------- */

const CATALOG = [
  {
    cat: "🌐 代理与分流",
    note: "这些默认 feed 里几乎都没有，装之前先在第 4 步加第三方源（如 kenzo）。",
    items: [
      { pkg: "luci-app-openclash", name: "OpenClash",  icon: "🐱", desc: "Clash 内核图形客户端", src: "third" },
      { pkg: "luci-app-nikki",     name: "Nikki",      icon: "🐱", desc: "mihomo 内核，OpenClash 轻量替代", src: "third" },
      { pkg: "luci-app-passwall",  name: "PassWall",   icon: "🧱", desc: "多协议代理", src: "third" },
      { pkg: "luci-app-passwall2", name: "PassWall2",  icon: "🧱", desc: "PassWall 二代，更现代", src: "third" },
      { pkg: "luci-app-ssr-plus",  name: "SSR Plus+",  icon: "✈️", desc: "ShadowSocksR 增强版", src: "third" },
      { pkg: "luci-app-homeproxy", name: "HomeProxy",  icon: "🏠", desc: "sing-box 内核，结构清爽", src: "third" },
      { pkg: "luci-app-mihomo",    name: "Mihomo",     icon: "⚡", desc: "mihomo 代理面板", src: "third" },
      { pkg: "luci-app-v2raya",    name: "V2RayA",     icon: "🔀", desc: "V2Ray/Xray 网页管理", src: "third" },
      { pkg: "luci-app-bypass",    name: "Bypass",     icon: "🪄", desc: "轻量分流代理", src: "third" },
      { pkg: "luci-app-daed",      name: "DAED",       icon: "🎭", desc: "eBPF 代理内核面板", src: "third" }
    ]
  },
  {
    cat: "🧭 DNS 与广告过滤",
    note: "SmartDNS 在 immortalwrt 线自带；openwrt 线需第三方源或另装。",
    items: [
      { pkg: "luci-app-smartdns",      name: "SmartDNS",      icon: "🧠", desc: "国内外 DNS 分流加速", src: "luci", lines: ["25.12-nss"], note: "immortalwrt 线自带" },
      { pkg: "luci-app-mosdns",        name: "MosDNS",        icon: "🧩", desc: "插件化 DNS 分流", src: "third" },
      { pkg: "luci-app-adguardhome",   name: "AdGuard Home",  icon: "🛡️", desc: "全网广告/追踪拦截", src: "third" },
      { pkg: "luci-app-adblock",       name: "AdBlock",       icon: "🚫", desc: "DNS 层广告过滤", src: "luci" },
      { pkg: "luci-app-simple-adblock",name: "Simple AdBlock",icon: "🚫", desc: "轻量广告过滤", src: "luci" },
      { pkg: "luci-app-https-dns-proxy",name:"DoH Proxy",     icon: "🔐", desc: "DNS over HTTPS 代理", src: "luci" },
      { pkg: "luci-app-dnscrypt-proxy",name: "DNSCrypt",      icon: "🔐", desc: "加密 DNS 客户端", src: "third" },
      { pkg: "luci-app-dnsfilter",     name: "DNS 过滤",      icon: "🧯", desc: "DNS 层规则过滤", src: "third" }
    ]
  },
  {
    cat: "🌍 网络与隧道",
    items: [
      { pkg: "luci-app-ddns",        name: "DDNS",         icon: "🌐", desc: "动态域名解析", src: "luci" },
      { pkg: "luci-app-ddns-go",     name: "DDNS-GO",      icon: "🌐", desc: "多平台 DDNS 客户端", src: "third" },
      { pkg: "luci-app-aliyunddns",  name: "阿里云 DDNS",   icon: "🌐", desc: "阿里云动态域名", src: "third" },
      { pkg: "luci-app-upnp",        name: "UPnP",         icon: "🔌", desc: "端口自动映射", src: "luci" },
      { pkg: "luci-app-mwan3",       name: "MWAN3",        icon: "🔀", desc: "多线负载均衡/故障切换", src: "luci" },
      { pkg: "luci-app-zerotier",    name: "ZeroTier",     icon: "🔗", desc: "虚拟局域网组网", src: "luci" },
      { pkg: "luci-app-cloudflared", name: "Cloudflared",  icon: "☁️", desc: "Cloudflare Tunnel", src: "luci" },
      { pkg: "luci-app-socat",       name: "Socat",        icon: "🔀", desc: "端口转发工具", src: "third" },
      { pkg: "luci-app-frpc",        name: "FRP 客户端",    icon: "🚇", desc: "内网穿透客户端", src: "third" },
      { pkg: "luci-app-frps",        name: "FRP 服务端",    icon: "🚇", desc: "内网穿透服务端", src: "third" },
      { pkg: "luci-app-tinyproxy",   name: "Tinyproxy",    icon: "🕸️", desc: "轻量 HTTP 代理", src: "luci" },
      { pkg: "luci-app-udpxy",       name: "udpxy",        icon: "📺", desc: "IPTV 组播转 HTTP", src: "packages" },
      { pkg: "luci-app-lucky",       name: "Lucky",        icon: "🍀", desc: "DDNS/端口转发/反代/ACME", src: "preset", note: "仓库预置 feed；标准/全功能/NoWiFi 三档已内建" },
      { pkg: "lucky",                name: "Lucky 后端",   icon: "🍀", desc: "Lucky 二进制本体（前端自动带上）", src: "preset", note: "跟随 luci-app-lucky 自动安装" }
    ]
  },
  {
    cat: "🔒 VPN 组网",
    items: [
      { pkg: "luci-app-wireguard",  name: "WireGuard",    icon: "🔐", desc: "高性能 VPN 隧道", src: "luci" },
      { pkg: "luci-app-tailscale",  name: "Tailscale",    icon: "🦎", desc: "异地组网，近年最流行", src: "third" },
      { pkg: "luci-app-openvpn",    name: "OpenVPN 服务端",icon: "🔐", desc: "OpenVPN 服务器", src: "luci" },
      { pkg: "luci-app-softethervpn",name:"SoftEther",    icon: "🔐", desc: "多协议 VPN 服务", src: "third" },
      { pkg: "luci-app-easytier",   name: "EasyTier",     icon: "🕸️", desc: "P2P 组网工具", src: "third" },
      { pkg: "luci-app-n2n",        name: "N2N",          icon: "🕸️", desc: "N2N P2P VPN", src: "third" },
      { pkg: "luci-app-ipsec-server",name:"IPSec VPN",    icon: "🔐", desc: "IPSec 服务端", src: "third" },
      { pkg: "luci-app-pptp-server",name: "PPTP VPN",     icon: "🔐", desc: "PPTP 服务端", src: "luci" }
    ]
  },
  {
    cat: "⚡ 流量控制与加速",
    note: "IPQ6000 已有 NSS 硬件加速，纯软件 SQM 会抢 CPU，按需选用。",
    items: [
      { pkg: "luci-app-sqm",          name: "SQM QoS",    icon: "⚖️", desc: "智能队列管理（Bufferbloat）", src: "luci" },
      { pkg: "luci-app-nft-qos",      name: "nft-qos",    icon: "⚖️", desc: "nftables 版限速", src: "third" },
      { pkg: "luci-app-turboacc",     name: "Turbo ACC",  icon: "🚀", desc: "软件流量加速（NSS 场景慎用）", src: "third" },
      { pkg: "luci-app-ttyd",         name: "TTYD 终端",  icon: "💻", desc: "网页版 SSH 终端", src: "luci" },
      { pkg: "kmod-tcp-bbr",          name: "TCP BBR",    icon: "🚀", desc: "BBR 拥塞控制算法", src: "packages" },
      { pkg: "sqm-scripts-nss",       name: "SQM NSS 脚本",icon: "⚖️", desc: "走 NSS 卸载的 SQM 脚本", src: "nss" }
    ]
  },
  {
    cat: "📊 监控与测速",
    items: [
      { pkg: "luci-app-nlbwmon",       name: "带宽监控",    icon: "📈", desc: "按设备统计流量", src: "luci" },
      { pkg: "luci-app-statistics",    name: "统计图表",    icon: "📊", desc: "collectd 系统统计", src: "luci" },
      { pkg: "luci-app-vnstat2",       name: "vnStat2",    icon: "📉", desc: "长期流量统计", src: "luci" },
      { pkg: "luci-app-netdata",       name: "Netdata",    icon: "📡", desc: "实时性能面板", src: "third" },
      { pkg: "luci-app-netspeedtest",  name: "网速测试",    icon: "🚀", desc: "局域网/互联网测速", src: "third" },
      { pkg: "luci-app-cpu-status",    name: "CPU 状态",    icon: "🧮", desc: "顶栏 CPU 占用", src: "third" },
      { pkg: "luci-app-temp-status",   name: "温度状态",    icon: "🌡️", desc: "顶栏温度，看散热是否够", src: "third" }
    ]
  },
  {
    cat: "🔧 系统工具",
    items: [
      { pkg: "luci-app-commands",      name: "自定义命令",  icon: "⌨️", desc: "网页执行 shell 命令", src: "luci" },
      { pkg: "luci-app-crontab",       name: "计划任务",    icon: "⏰", desc: "cron 定时任务管理", src: "luci" },
      { pkg: "luci-app-autoreboot",    name: "定时重启",    icon: "🔄", desc: "按周期自动重启", src: "third" },
      { pkg: "luci-app-watchcat",      name: "WatchCat",   icon: "🐱", desc: "网络失联自动重启", src: "luci" },
      { pkg: "luci-app-cpufreq",       name: "CPU 调频",    icon: "⚡", desc: "CPU 频率与调速器", src: "third" },
      { pkg: "luci-app-diskman",       name: "磁盘管理",    icon: "💾", desc: "分区/格式化/挂载", src: "luci" },
      { pkg: "luci-app-uhttpd",        name: "uHTTPd",     icon: "🌐", desc: "Web 服务配置", src: "luci" },
      { pkg: "luci-app-opkg",          name: "软件包管理",  icon: "📦", desc: "opkg 图形界面", src: "luci" },
      { pkg: "luci-app-filetransfer",  name: "文件传输",    icon: "📤", desc: "网页上传下载", src: "luci" },
      { pkg: "luci-app-advanced-reboot",name:"重启到分区",  icon: "🔁", desc: "双分区切换（本例不适用）", src: "third" },
      { pkg: "luci-app-ttyd-extra",    name: "TTYD 附加",   icon: "💻", desc: "TTYD 额外依赖", src: "third" },
      { pkg: "htop",                   name: "htop",       icon: "📊", desc: "命令行进程监控", src: "packages" },
      { pkg: "nano",                   name: "nano",       icon: "✏️", desc: "命令行文本编辑器", src: "packages" },
      { pkg: "curl",                   name: "curl",       icon: "🌐", desc: "命令行 HTTP 工具", src: "packages" },
      { pkg: "wget-ssl",               name: "wget",       icon: "⬇️", desc: "命令行下载（SSL）", src: "packages" },
      { pkg: "luci-app-argon-config",  name: "Argon 主题设置",icon: "🎨", desc: "Argon 主题配置项", src: "luci", lines: ["25.12-nss"] }
    ]
  },
  {
    cat: "🗄️ 存储与文件共享",
    items: [
      { pkg: "luci-app-samba4",      name: "Samba4",       icon: "📂", desc: "Windows 文件共享", src: "luci" },
      { pkg: "luci-app-vsftpd",      name: "vsftpd",       icon: "📂", desc: "FTP 服务器", src: "luci" },
      { pkg: "luci-app-nfs",         name: "NFS",          icon: "📂", desc: "NFS 网络文件系统", src: "third" },
      { pkg: "luci-app-webdav",      name: "WebDAV",       icon: "📂", desc: "WebDAV 服务", src: "third" },
      { pkg: "luci-app-hd-idle",     name: "硬盘休眠",      icon: "💤", desc: "空闲自动停转", src: "luci" },
      { pkg: "luci-app-usb-printer", name: "USB 打印机",    icon: "🖨️", desc: "USB 打印机共享", src: "luci" },
      { pkg: "luci-app-syncthing",   name: "Syncthing",    icon: "🔄", desc: "跨设备文件同步", src: "third" },
      { pkg: "luci-app-alist",       name: "AList",        icon: "☁️", desc: "多网盘聚合列表", src: "third" },
      { pkg: "luci-app-openlist",    name: "OpenList",     icon: "📋", desc: "AList 后继版本", src: "third" }
    ]
  },
  {
    cat: "⬇️ 下载与媒体",
    items: [
      { pkg: "luci-app-aria2",        name: "Aria2",       icon: "⬇️", desc: "多协议下载器", src: "luci" },
      { pkg: "luci-app-transmission", name: "Transmission",icon: "🌊", desc: "BT 客户端", src: "luci" },
      { pkg: "luci-app-minidlna",     name: "miniDLNA",    icon: "📺", desc: "DLNA 媒体服务器", src: "luci" },
      { pkg: "luci-app-mjpg-streamer",name: "摄像头推流",  icon: "📷", desc: "USB 摄像头 MJPEG 流", src: "luci" }
    ]
  },
  {
    cat: "🔐 访问控制与安全",
    items: [
      { pkg: "luci-app-banip",        name: "BanIP",       icon: "🚷", desc: "IP 黑名单订阅封锁", src: "luci" },
      { pkg: "luci-app-fail2ban",     name: "Fail2ban",    icon: "🚫", desc: "SSH/Web 暴力破解防护", src: "luci" },
      { pkg: "luci-app-acme",         name: "ACME 证书",    icon: "🔐", desc: "自动申请 Let's Encrypt", src: "luci" },
      { pkg: "luci-app-clamav",       name: "ClamAV",      icon: "🦠", desc: "开源杀毒（吃内存，慎用）", src: "luci" },
      { pkg: "luci-app-arpbind",      name: "IP/MAC 绑定",  icon: "🔗", desc: "静态绑定防 ARP 欺骗", src: "third" },
      { pkg: "luci-app-accesscontrol",name: "上网时间控制",  icon: "⏱️", desc: "按时间段限制上网", src: "third" },
      { pkg: "luci-app-wifischedule", name: "WiFi 定时开关", icon: "🕐", desc: "按计划关开无线", src: "luci" }
    ]
  },
  {
    cat: "📶 无线与网络协议",
    note: "本机无线为 ath11k（IPQ6018），这些协议包用于拨号/上网方式。",
    items: [
      { pkg: "luci-proto-wireguard",  name: "协议 WireGuard", icon: "🔐", desc: "WireGuard 接口协议", src: "luci" },
      { pkg: "luci-proto-ppp",        name: "协议 PPPoE",     icon: "🔌", desc: "PPPoE 拨号协议", src: "luci" },
      { pkg: "luci-proto-ipv6",       name: "协议 IPv6",      icon: "6️⃣", desc: "IPv6 配置支持", src: "luci" },
      { pkg: "luci-proto-qmi",        name: "协议 QMI",       icon: "📱", desc: "USB 4G/5G 模块拨号", src: "luci" },
      { pkg: "luci-app-modemband",    name: "频段锁定",        icon: "📡", desc: "锁定 4G/5G 频段", src: "third" },
      { pkg: "ath11k-firmware-ipq6018",name:"ath11k 固件",    icon: "📶", desc: "IPQ6018 无线固件", src: "packages" }
    ]
  },
  {
    cat: "🎨 主题",
    items: [
      { pkg: "luci-theme-material",     name: "Material",     icon: "🎨", desc: "Material Design", src: "luci" },
      { pkg: "luci-theme-openwrt-2020", name: "OpenWrt 2020", icon: "🎨", desc: "官方现代主题", src: "luci" },
      { pkg: "luci-theme-openwrt",      name: "OpenWrt",      icon: "🎨", desc: "官方默认主题", src: "luci" },
      { pkg: "luci-theme-bootstrap",    name: "Bootstrap",    icon: "🎨", desc: "经典主题", src: "luci" },
      { pkg: "luci-theme-argon",        name: "Argon",        icon: "🎨", desc: "论坛流行主题", src: "luci", lines: ["25.12-nss"], note: "immortalwrt 线自带" }
    ]
  },
  {
    cat: "🐳 容器与应用商店",
    items: [
      { pkg: "luci-app-dockerman", name: "Docker (Dockerman)", icon: "🐳", desc: "容器图形管理", src: "luci" },
      { pkg: "docker",             name: "Docker CE",           icon: "🐳", desc: "容器引擎本体", src: "packages" },
      { pkg: "luci-app-store",     name: "iStore",              icon: "🏪", desc: "应用商店（需第三方源）", src: "third" }
    ]
  },
  {
    cat: "🚀 NSS 硬件加速（本机型核心）",
    note: "这些是满血 NSS 的关键件，标准档已默认包含，一般不需要动。",
    items: [
      { pkg: "kmod-qca-nss-drv",         name: "NSS 驱动",        icon: "🚀", desc: "NSS 核心驱动", src: "nss" },
      { pkg: "kmod-qca-nss-ecm",         name: "NSS ECM",         icon: "🚀", desc: "连接管理器（加速转发）", src: "nss" },
      { pkg: "kmod-qca-nss-crypto",      name: "NSS Crypto",      icon: "🔐", desc: "硬件加解密卸载", src: "nss" },
      { pkg: "kmod-qca-nss-dp",          name: "NSS DP",          icon: "🚀", desc: "数据面驱动", src: "nss" },
      { pkg: "kmod-qca-nss-drv-pppoe",   name: "NSS PPPoE 卸载",   icon: "🔌", desc: "PPPoE 走硬件加速", src: "nss" },
      { pkg: "kmod-qca-nss-drv-bridge-mgr",name:"NSS 桥管理",     icon: "🌉", desc: "桥接管理器", src: "nss" },
      { pkg: "kmod-qca-nss-drv-vlan-mgr",name:"NSS VLAN 管理",   icon: "🏷️", desc: "VLAN 管理", src: "nss" },
      { pkg: "kmod-qca-nss-drv-tunipip6",name:"NSS 隧道卸载",     icon: "🚇", desc: "6rd/IPIP 隧道卸载", src: "nss" },
      { pkg: "nss-firmware-ipq60xx",     name: "NSS 固件",        icon: "🧩", desc: "IPQ60xx NSS 固件", src: "nss" }
    ]
  }
];

/* 展开成扁平数组，方便查找 */
const ALL_PKGS = CATALOG.flatMap(c => c.items.map(i => ({ ...i, cat: c.cat })));

/* ---------------- 仓库预置 feed ----------------
   本仓库 feeds.conf.default 里 `# >>> repo-extra-feeds >>>` 与
   `# <<< repo-extra-feeds <<<` 之间的 feed。云编译时（Build-OpenWrt.yml 的
   Apply Feeds 步骤）按 feed 名合并到**任意**编译线：源码里没有同名 feed 才追加，
   已有则保持源码那一份不动。所以下面的源在 24.10 / 25.12 两条线上都会生效，
   即便 24.10 实际 clone 的 qosmio/openwrt-ipq 里根本没有这些源。

   dirs 是 feed 仓库里的包目录名；页面会用它们去 repo 里逐个确认存在性，
   所以这里不需要"背"结论，写了也只是给个提示。 */
const PRESET_FEEDS = [
  {
    name: "lucky",
    url: "https://github.com/gdy666/luci-app-lucky.git",
    branch: "",
    repo: "gdy666/luci-app-lucky",
    ref: "main",
    dirs: ["luci-app-lucky", "lucky"],
    desc: "DDNS / 端口转发 / 反向代理 / ACME 证书自动化",
    why: "纯预编译二进制 + 架构无关的 LuCI 前端，不含内核模块，跨内核/跨版本都安全"
  }
];

/* 包名 → 它属于哪个预置 feed */
const PRESET_PKG_FEED = {};
PRESET_FEEDS.forEach(f => f.dirs.forEach(d => { PRESET_PKG_FEED[d] = f; }));

/* 包名 → 目录里标称的来源（用于区分「默认源没有」和「需第三方源」） */
const SRC_OF = {};
ALL_PKGS.forEach(i => { SRC_OF[i.pkg] = i.src; });

/* ---------------- 编译线建议分支（feed 校验用） ---------------- */

const KNOWN_BRANCHES = [
  "openwrt-25.12", "openwrt-24.10", "openwrt-23.05", "openwrt-22.03", "openwrt-21.02",
  "main", "master"
];
