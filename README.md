# LibWrt 云编译（京东云 AX1800 Pro 亚瑟 · 精简满血 NSS）

> 京东云 AX1800 Pro 亚瑟（`jdcloud_re-ss-01` / IPQ6000 / 512MB RAM）的 GitHub Actions 一键云编译。
> 架构参照 LibWrt 作者本人的官方云编译 [`laipeng668/openwrt-ci-roc`](https://github.com/laipeng668/openwrt-ci-roc)，
> 源码基于 [LibWrt](https://github.com/LiBwrt/LibWrt) 的 `25.12-nss` NSS 分支。
>
> 所有固件均带 **NSS 满血卸载**（有线 datapath 走 NSS），默认 LAN `192.168.10.1`、无线开机启用。

## 🌐 网页版云编译（勾选功能 + 自定义 feed 校验）

不想在 Actions 表单里逐项手填，用网页版：**https://bet5521.github.io/LibWrt/**

- **功能勾选**：112 个包按 14 个分类列出，每项标了来源（默认 feed / NSS 源 / **本仓库预置 feed** / 需第三方源），
  支持搜索、自定义包名、移除包名；还有「校验所选包」——按当前编译线去 feed 仓库逐个确认是否真实存在
- **编译分支可切** `24.10-nss` / `25.12-nss`，页面显示该线的源码仓库、内核版本、默认 feeds 来源
- **Feed 源管理**（本次新增的重点）：
  - 默认 feeds **直接从源码仓库的 `feeds.conf.default` 读取展示**（切分支会自动重新读取）
  - **本仓库预置 feed** 单独一块：来自本仓库 `feeds.conf.default` 的 `repo-extra-feeds` 区，
    两条编译线都会自动补上；页面会实时去上游仓库确认包目录是否存在，不靠硬编码结论
  - 添加自定义源后**立即自动校验**，逐条给出结论与建议：
    | 校验项 | 判定与建议 |
    |---|---|
    | 仓库是否存在 / 可访问 | 404 → 明确报错（私有仓库需 Token 有读权限） |
    | 分支是否存在 | 不存在 → 给出**最接近的分支**，可一键切换 |
    | **版本是否匹配** | 分支 `openwrt-23.05` 对 24.10 线 → 警告 + 建议改 `openwrt-24.10` |
    | **是否含内核模块** | 检出 `kmod-*` / `target/` → 提示内核绑定风险（预编译闭源驱动跨内核必失效） |
    | 是否真的是 feed | 误把完整源码树填进来 → 直接判不可用 |
    | 非 GitHub 源 | gitee / git.openwrt.org 等无法预校验，说明会交由编译时验证 |
- **一键触发** `IPQ60XX-JDCloud-AX1800Pro`；也可导出参数 JSON / 复制参数去 Actions 手动填

### 开启网页（一次性）

仓库 **Settings → Pages → Build and deployment → Source** 选 **`GitHub Actions`** → 保存一次即可。
之后改 `docs/` 下的文件并推送，会自动重新部署（见 `.github/workflows/Pages.yml`）。

> 从别人仓库 fork 过来时，Pages 设置**不会**继承上游，必须在本仓库手动开一次；
> 若 Actions 被禁用，还要在 Actions 页面点一次「I understand my workflows, go ahead and enable them」。

### 网页用什么 Token

触发 workflow 需要 Token：
- **细粒度 Token**：该仓库的 `Actions: Read and write` + `Contents: Read`
- **经典 Token**：勾 `repo`（只改工作流文件才额外需要 `workflow`）

Token 只存浏览器 localStorage，页面**直连 `api.github.com`**，不经任何中转服务器。
不想用 Token 也行：页面能导出参数 JSON / 复制参数，拿去 Actions 表单手动填，效果一样。

> 页面的 feed 校验是**编译前**的静态判断；真正能不能用，最终由编译时的
> `./scripts/feeds update <name>` 决定 —— 单条失败会被**自动回滚并跳过**，不会拖垮整条构建。

## 目录结构

```
.github/workflows/Build-OpenWrt.yml      # workflow_call 公共模板（Build / Release / Cleanup 三 job）
.github/workflows/IPQ60XX-JDCloud.yml    # 亚瑟入口（手动表单 + push + 每周一 cron）
.github/workflows/Cleanup-Build-Info.yml # 一键清空 Release/Tag/运行记录/产物/缓存（手动触发）
.github/workflows/Pages.yml              # 发布 docs/ 里的网页版编译页面
docs/index.html                          # 网页版编译页面（GitHub Pages 静态站点）
docs/style.css                           # 页面样式（亮/暗主题）
docs/catalog.js                          # 功能组件目录 + 编译线元数据
docs/feedcheck.js                        # GitHub API 封装 + feed 源校验 + 包名存在性校验
docs/app.js                              # 页面主逻辑（勾选 / 校验 / 触发编译）
feeds.conf.default                       # 源码 feed 清单 + 本仓库追加的 repo-extra-feeds 区
configs/IPQ60XX.config                   # 标准档位（精简满血 NSS，73 包，默认档）
configs/IPQ60XX-minimal.config           # 极简档位（52 包）
configs/IPQ60XX-full.config              # 全功能档位（118 包）
configs/NoWiFi.config                    # 无无线档位（68 包）
configs/_gen_profiles.py                 # 由基准档自动派生三个档位（防止漂移）
configs/README.md                        # 四档差异与包级对照（详细版）
ci/diy.sh                                # 初始状态生成（LAN / 无线 / 主机名 / 密码 / cron）
ci/README.md                             # 自定义项完整对照表
```

## 怎么用

1. Actions → 左栏选 **`IPQ60XX-JDCloud-AX1800Pro`** → **Run workflow**
2. 表单里按需改 LAN 地址 / 无线初始状态 / 组件，**留空即用默认值**
3. 约 40~70 分钟出结果（有缓存时 10~20 分钟）
4. 产物：该 run 的 **Artifacts**，或 **Releases** 里以日期结尾的那个标签（见下节）

### Release 标签规则

标签**自动生成**，规则是 `<主机名>_<内核版本>_<config 名称>_<构建日期>`：

```
JDC-AX1800Pro_6.12.108_IPQ60XX-minimal_2026-10-06
│             │        │                  │
│             │        │                  构建日期（Asia/Shanghai）
│             │        config 文件基名（去掉 .config）
│             内核版本（clone 源码后才知道，所以不能做成表单项）
主机名
```

四档分别会得到 `..._IPQ60XX-minimal_...` / `..._IPQ60XX_...` / `..._IPQ60XX-full_...` / `..._NoWiFi_...`。
日期取北京时间；同一天重复构建会**更新同一个 Release**（`allowUpdates: true`），不会堆出一串同名标签。

### Release 里会写明默认凭据

Release 说明顶部有「🔐 登录凭据」和「📶 无线」两张表，直接给出：

| 场景 | Release 上显示 |
| --- | --- |
| 表单填了 `root_password` | 账号 `root` + 你填的密码 |
| `root_password` 留空 | 账号 `root` + 「未设置（开机无密码，登录后请立即设置）」 |
| `wifi_enabled = on` | 无线状态、2.4G/5G SSID、无线密码、信道频宽 |
| `wifi_enabled = off` | 「默认关闭（不广播）」+ 如何在 LuCI 里启用 |

> ⚠️ 本仓库是**公开仓库**，这些凭据写在 Release 上等于公开。
> 要么把 `root_password` / `wifi_password` 当成一次性出厂值、**刷完立刻改**；
> 要么干脆留空，让它开机无密码、首次登录再设。

### 一键清空构建信息

Actions → **Cleanup Build Info** → Run workflow，会删掉
Release（含固件资产）/ Tag / 全部运行记录 / Artifacts / Actions 缓存 / `diag-branch`。
（外部 PAT 常是只读的删不动这些，所以这个 workflow 用的是 Actions 自己的 `GITHUB_TOKEN`。）

### 可自定义项（19 项表单）

| 分组 | 表单项 | 默认值 |
| --- | --- | --- |
| 档位 | `config_file`（下拉，**默认标准档**） | `IPQ60XX` / `IPQ60XX-minimal` / `IPQ60XX-full` / `NoWiFi` |
| LAN | `lan_ip` / `lan_netmask` / `lan_dns` | `192.168.10.1` / `255.255.255.0` / `223.5.5.5` |
| 系统 | `hostname` / `timezone` / `root_password` | `JDC-AX1800Pro` / `Asia/Shanghai` / 空（无密码） |
| 无线 | `wifi_enabled`（on/off） | `on` |
| 无线 | `wifi_ssid` / `wifi_password` / `wifi_country` | `JDC-AX1800Pro` / `password12345` / `CN` |
| 无线 | `wifi_channel_2g` / `wifi_htmode_2g` | `6` / `HE20` |
| 无线 | `wifi_channel_5g` / `wifi_htmode_5g` | `36` / `HE80` |
| 组件 | `extra_packages` / `remove_packages` | 空（空格/逗号/换行分隔，可多行） |
| Feed | `extra_feeds` | 空（每行一个 `<name> <url>[;branch]`；留空＝只用源码默认 feeds + 本仓库预置 feed） |

`wifi_enabled = off` 时：无线不启用，但配置保留，之后可在 LuCI 里一键打开。

### `extra_feeds` 自定义 feed 源

每行一个，三种写法都认（支持多行，`#` 开头的行为注释）：

```
kenzo https://github.com/kenzok8/openwrt-packages.git;main
src-git small https://github.com/kenzok8/small-package.git;main
https://github.com/foo/bar.git;openwrt-25.12        # 不写名字，从 URL 自动推导
```

编译时的行为（`Build-OpenWrt.yml` 的「Apply Feeds」步骤，**先合并仓库预置 feed，再处理表单自定义源**）：

| 情况 | 处理 |
| --- | --- |
| 表单未填 | 跳过表单源；**仓库预置 feed（见下节）仍会照常合并** |
| 正常 | 需要追加时先把 `feeds.conf.default` 复制成 `feeds.conf`（**必须**，否则 `scripts/feeds` 只读 `.default`，追加的行等于没写），再逐条追加 |
| 某条源 `update` 失败 | **只告警 + 回滚那一行**，其余源与整条构建继续跑 |
| 同名源写了两次 | 后者覆盖前者，`feeds.conf` 里只留一行 |
| **覆盖源码自带 feed** | 允许，但**显式告警**（用第三方源替换 `packages` 之类风险很大） |
| feed 名含不安全字符 | 自动改写为 `-` 分隔并在日志里说明原名（避免写坏 `sed` 与 `/tmp/<name>.log`） |
| 装包有失败项 | 告警并列出，不中断 |

> 用网页版（第 4 步）添加自定义源，会在提交前就帮你把这些坑提前判掉。

### 本仓库预置 feed（`repo-extra-feeds` 区）

本仓库 `feeds.conf.default` 末尾有一段用哨兵注释划出来的区域：

```
# >>> repo-extra-feeds >>>   以下 feed 由本仓库追加，云编译时会合并到任意分支
src-git lucky https://github.com/gdy666/luci-app-lucky.git
# <<< repo-extra-feeds <<<
```

编译时由 `Build-OpenWrt.yml` 的「Apply Feeds」步骤读取，规则是**只补不覆盖**：

| 情况 | 处理 |
| --- | --- |
| 源码里没有同名 feed | 追加、`update`、`install -a -p <name>`，失败则回滚那一行 |
| 源码里已有同名 feed | **保持源码那一份不动**（连地址都不改） |
| 一个都没追加 | 不生成 `feeds.conf`，`scripts/feeds` 直接读源码的 `feeds.conf.default` |

**为什么非要有这一段**：两条编译线 clone 的源码根本不是同一个仓库 ——
`25.12-nss` clone 本仓库（天然带 lucky），`24.10-nss` clone `qosmio/openwrt-ipq`（**没有** lucky）。
只改 `feeds.conf.default` 的话，24.10 线永远不会生效。

**⚠️ 这一段只能放「与内核版本、OpenWrt 版本都无关」的源。**
别把上面那些 `packages` / `luci` / `video` 搬进来：本文件里它们写的是 `openwrt-25.12`，
而 `qosmio/openwrt-ipq@24.10-nss` 自带的是 `openwrt-24.10` 那一套（并且**没有** `video`）。
一旦按名合并就成了「把 25.12 系 feed 注入 24.10 构建」，这是实测确认过的坑。

当前预置内容：

| feed | 地址 | 提供 | 为什么安全 |
| --- | --- | --- | --- |
| `lucky` | `gdy666/luci-app-lucky` | `luci-app-lucky`（前端）+ `lucky`（后端二进制） | 后端是上游预编译二进制、前端是架构无关的 LuCI 包，**不含任何内核模块**，跨内核（6.6 / 6.12）与跨版本都安全 |

### 设置是怎么生效的

| 内容 | 机制 |
| --- | --- |
| 组件 / 功能 | 追加 `CONFIG_PACKAGE_x=y/n` 进 `.config`，编译期决定 |
| 无线参数 | **不预置**静态 `wireless`；首次启动由 `wifi config` 按真实硬件生成（path/band 正确），`99-diy-custom` 再**逐 radio 读真实 `band` 套用信道/HT/`hwmode`**（5G 必须 `hwmode=a` 才能开 AC/AX，否则 5G 退化为 20MHz、信道无法设置），以此避免 2.4G/5G 交叉与信道不可用 |
| LAN / 主机名 / 时区 / 无线开关 | 生成 `/etc/uci-defaults/99-diy-custom`，**首次启动**时用 uci 应用。时机在 `config_generate` 与 `wifi config` 之后 → 一定是最终值 |
| root 密码 | 预置 `files/etc/shadow`（awk 按字段替换，保持 9 字段格式） |
| 无线掉线自愈 | `files/etc/crontabs/root` 每 5 分钟探测 `lan_ip`，不通就 `wifi down; up` |

## 三种 bin 的用法

| 文件 | 场景 |
| --- | --- |
| `*-squashfs-sysupgrade.bin` | 网页「系统 → 备份/升级」直接刷（**已有 OpenWrt 时首选**） |
| `*-squashfs-factory.bin` | U-Boot 首刷 / 跨固件平台刷 |
| `*-squashfs-recovery.bin` | 救砖 |

刷前确认 `mmcblk0p18` 是 2G 大分区布局（rootfs 2048MiB / HLOS 12MiB）。

---

## 各档位内含包清单对比

四个档位**只差四类**，其余（目标平台、分区、内核、NSS 卸载、网络基础、LuCI 基础）完全一致。
下面给出每个档位实际编入的包（`CONFIG_PACKAGE_*.y`）以及逐包对比。

### 一、四档速览

| 档位 | 配置文件 | 编入包数 | 与基准（标准）差异 | 定位 |
| :--- | :--- | :-: | :--- | :--- |
| **标准** | `IPQ60XX.config` | 73 | —（基准） | 精简满血 NSS，带 SQM/UPnP/WoL/**Lucky** |
| **极简** | `IPQ60XX-minimal.config` | 52 | **−21**（砍掉便利组件，含 2 个孤儿翻译） | 只要路由本职，最省 flash / 内存 |
| **全功能** | `IPQ60XX-full.config` | 118 | **+45**（常用 LuCI 应用 + 工具 + USB 存储） | 家庭网关 + 轻 NAS，什么都想有 |
| **无无线** | `NoWiFi.config` | 68 | **−5 无线包**（ath11k/wpad 改 `=n`，另加 12 条兜底 `=n`） | 关无线当纯有线路由 / 旁路由 |

> 三个派生档都含 **Lucky**（DDNS / 端口转发 / 反向代理 / ACME），极简档不带。
> Lucky 来自本仓库预置 feed（见下文），两条编译线都会自动补上。

> ⚠️ 三个派生档位**不是手工维护的**——由 `configs/_gen_profiles.py` 从基准档 `IPQ60XX.config` 自动生成，
> 改基准档后重跑生成器即可，四档不再各自漂移。

### 二、按类别的包数对比

| 类别 | 标准 | 极简 | 全功能 | 无无线 |
| :--- | :-: | :-: | :-: | :-: |
| NSS 满血卸载 | 5 | 5 | 5 | 5 |
| 无线 ath11k | 5 | 5 | 7 | 0 |
| 网络基础 | 21 | 16 | 21 | 21 |
| LuCI 基础 | 17 | 15 | 31 | 17 |
| LuCI 应用 | 5 | 1 | 19 | 5 |
| 基础工具 | 17 | 10 | 24 | 17 |
| USB / 存储 | 0 | 0 | 8 | 0 |
| **合计** | **64** | **46** | **109** | **59** |

### 三、完整包清单（逐包对比）

✓ = 编入固件　— = 未编入（走上游默认或显式关闭）

<details open>

**NSS 满血卸载**（5，四档全有）

| 包名 | 标准 | 极简 | 全功能 | 无无线 |
| :--- | :-: | :-: | :-: | :-: |
| `kmod-qca-nss-crypto` | ✓ | ✓ | ✓ | ✓ |
| `kmod-qca-nss-dp` | ✓ | ✓ | ✓ | ✓ |
| `kmod-qca-nss-drv` | ✓ | ✓ | ✓ | ✓ |
| `kmod-qca-nss-ecm` | ✓ | ✓ | ✓ | ✓ |
| `nss-firmware-ipq60xx` | ✓ | ✓ | ✓ | ✓ |

**无线 ath11k**（标准 / 极简 / 全功能均有；无无线档整块关闭）

| 包名 | 标准 | 极简 | 全功能 | 无无线 |
| :--- | :-: | :-: | :-: | :-: |
| `ath11k-firmware-ipq6018` | ✓ | ✓ | ✓ | — |
| `kmod-ath11k` | ✓ | ✓ | ✓ | — |
| `kmod-ath11k-ahb` | ✓ | ✓ | ✓ | — |
| `kmod-ath11k-pci` | ✓ | ✓ | ✓ | — |
| `wpad-basic-mbedtls` | ✓ | ✓ | ✓ | — |
| `luci-app-wifischedule` | — | — | ✓ | — |
| `luci-i18n-wifischedule-zh-cn` | — | — | ✓ | — |

**网络基础**（极简档去掉 SQM/隧道类；无无线档与标准一致）

| 包名 | 标准 | 极简 | 全功能 | 无无线 |
| :--- | :-: | :-: | :-: | :-: |
| `dnsmasq-full` | ✓ | ✓ | ✓ | ✓ |
| `firewall4` | ✓ | ✓ | ✓ | ✓ |
| `kmod-crypto-cbc` | ✓ | ✓ | ✓ | ✓ |
| `kmod-crypto-xts` | ✓ | ✓ | ✓ | ✓ |
| `kmod-gre` | ✓ | — | ✓ | ✓ |
| `kmod-ipip` | ✓ | — | ✓ | ✓ |
| `kmod-ipt-conntrack` | ✓ | ✓ | ✓ | ✓ |
| `kmod-ipt-nat` | ✓ | ✓ | ✓ | ✓ |
| `kmod-ipt-offload` | ✓ | ✓ | ✓ | ✓ |
| `kmod-nft-offload` | ✓ | ✓ | ✓ | ✓ |
| `kmod-pppoe` | ✓ | ✓ | ✓ | ✓ |
| `kmod-pppox` | ✓ | ✓ | ✓ | ✓ |
| `kmod-sched-cake` | ✓ | — | ✓ | ✓ |
| `kmod-vxlan` | ✓ | — | ✓ | ✓ |
| `nftables-json` | ✓ | ✓ | ✓ | ✓ |
| `odhcp6c` | ✓ | ✓ | ✓ | ✓ |
| `odhcpd-ipv6only` | ✓ | ✓ | ✓ | ✓ |
| `sqm-scripts-nss` | ✓ | — | ✓ | ✓ |

**LuCI 基础**

| 包名 | 标准 | 极简 | 全功能 | 无无线 |
| :--- | :-: | :-: | :-: | :-: |
| `luci` | ✓ | ✓ | ✓ | ✓ |
| `luci-base` | ✓ | ✓ | ✓ | ✓ |
| `luci-mod-admin-full` | ✓ | ✓ | ✓ | ✓ |
| `luci-mod-network` | ✓ | ✓ | ✓ | ✓ |
| `luci-mod-status` | ✓ | ✓ | ✓ | ✓ |
| `luci-mod-system` | ✓ | ✓ | ✓ | ✓ |
| `luci-proto-ipv6` | ✓ | ✓ | ✓ | ✓ |
| `luci-proto-ppp` | ✓ | ✓ | ✓ | ✓ |
| `luci-theme-bootstrap` | ✓ | ✓ | ✓ | ✓ |
| `luci-theme-openwrt-2020` | ✓ | ✓ | ✓ | ✓ |
| `luci-theme-material` | ✓ | ✓ | ✓ | ✓ |
| `luci-theme-argon` | ✓ | ✓ | ✓ | ✓ |
| `luci-i18n-base-zh-cn` | ✓ | ✓ | ✓ | ✓ |
| `luci-i18n-firewall-zh-cn` | ✓ | ✓ | ✓ | ✓ |
| `luci-i18n-package-manager-zh-cn` | ✓ | ✓ | ✓ | ✓ |
| `luci-i18n-sqm-zh-cn` | ✓ | — | ✓ | ✓ |
| `luci-i18n-upnp-zh-cn` | ✓ | — | ✓ | ✓ |
| `luci-i18n-arpbind-zh-cn` | — | — | ✓ | — |
| `luci-i18n-autoreboot-zh-cn` | — | — | ✓ | — |
| `luci-i18n-commands-zh-cn` | — | — | ✓ | — |
| `luci-i18n-ddns-zh-cn` | — | — | ✓ | — |
| `luci-i18n-diskman-zh-cn` | — | — | ✓ | — |
| `luci-i18n-hd-idle-zh-cn` | — | — | ✓ | — |
| `luci-i18n-netdata-zh-cn` | — | — | ✓ | — |
| `luci-i18n-nlbwmon-zh-cn` | — | — | ✓ | — |
| `luci-i18n-openvpn-zh-cn` | — | — | ✓ | — |
| `luci-i18n-smartdns-zh-cn` | — | — | ✓ | — |
| `luci-i18n-ttyd-zh-cn` | — | — | ✓ | — |
| `luci-i18n-uhttpd-zh-cn` | — | — | ✓ | — |
| `luci-i18n-vlmcsd-zh-cn` | — | — | ✓ | — |
| `luci-i18n-watchcat-zh-cn` | — | — | ✓ | — |

**LuCI 应用**

| 包名 | 标准 | 极简 | 全功能 | 无无线 |
| :--- | :-: | :-: | :-: | :-: |
| `luci-app-firewall` | ✓ | ✓ | ✓ | ✓ |
| `luci-app-package-manager` | ✓ | — | ✓ | ✓ |
| `luci-app-sqm` | ✓ | — | ✓ | ✓ |
| `luci-app-upnp` | ✓ | — | ✓ | ✓ |
| `luci-app-wol` | ✓ | — | ✓ | ✓ |
| `luci-app-arpbind` | — | — | ✓ | — |
| `luci-app-autoreboot` | — | — | ✓ | — |
| `luci-app-commands` | — | — | ✓ | — |
| `luci-app-ddns` | — | — | ✓ | — |
| `luci-app-diskman` | — | — | ✓ | — |
| `luci-app-hd-idle` | — | — | ✓ | — |
| `luci-app-netdata` | — | — | ✓ | — |
| `luci-app-nlbwmon` | — | — | ✓ | — |
| `luci-app-openvpn` | — | — | ✓ | — |
| `luci-app-smartdns` | — | — | ✓ | — |
| `luci-app-ttyd` | — | — | ✓ | — |
| `luci-app-uhttpd` | — | — | ✓ | — |
| `luci-app-vlmcsd` | — | — | ✓ | — |
| `luci-app-watchcat` | — | — | ✓ | — |

**基础工具**

| 包名 | 标准 | 极简 | 全功能 | 无无线 |
| :--- | :-: | :-: | :-: | :-: |
| `ca-certificates` | ✓ | ✓ | ✓ | ✓ |
| `curl` | ✓ | ✓ | ✓ | ✓ |
| `libustream-mbedtls` | ✓ | ✓ | ✓ | ✓ |
| `ucode` | ✓ | ✓ | ✓ | ✓ |
| `ucode-mod-fs` | ✓ | ✓ | ✓ | ✓ |
| `ucode-mod-ubus` | ✓ | ✓ | ✓ | ✓ |
| `ucode-mod-uci` | ✓ | ✓ | ✓ | ✓ |
| `xz` | ✓ | ✓ | ✓ | ✓ |
| `zstd` | ✓ | ✓ | ✓ | ✓ |
| `openssh-server` | ✓ | ✓ | ✓ | ✓ |
| `openssh-client-utils` | ✓ | — | ✓ | ✓ |
| `coreutils` | ✓ | — | ✓ | ✓ |
| `coreutils-sort` | ✓ | — | ✓ | ✓ |
| `htop` | ✓ | — | ✓ | ✓ |
| `ttyd` | ✓ | — | ✓ | ✓ |
| `logrotate` | ✓ | — | ✓ | ✓ |
| `terminfo` | ✓ | — | ✓ | ✓ |
| `openssl-util` | — | — | ✓ | — |
| `bash` | — | — | ✓ | — |
| `nano` | — | — | ✓ | — |
| `tmux` | — | — | ✓ | — |
| `iperf3` | — | — | ✓ | — |
| `mtr-json` | — | — | ✓ | — |
| `tcpdump` | — | — | ✓ | — |

**USB / 存储**（仅全功能档）

| 包名 | 标准 | 极简 | 全功能 | 无无线 |
| :--- | :-: | :-: | :-: | :-: |
| `block-mount` | — | — | ✓ | — |
| `e2fsprogs` | — | — | ✓ | — |
| `kmod-fs-exfat` | — | — | ✓ | — |
| `kmod-fs-ext4` | — | — | ✓ | — |
| `kmod-fs-ntfs3` | — | — | ✓ | — |
| `kmod-usb-storage` | — | — | ✓ | — |
| `kmod-usb-storage-uas` | — | — | ✓ | — |
| `kmod-usb3` | — | — | ✓ | — |

</details>

### 四、关键说明

- **极简档 −18 项**：在标准档基础上砍掉 `luci-app-sqm/upnp/wol/package-manager`、`kmod-sched-cake/sqm-scripts-nss`、`kmod-gre/ipip/vxlan`、`htop/ttyd/logrotate/terminfo/coreutils/coreutils-sort/openssh-client-utils`，以及 `luci-i18n-sqm/upnp-zh-cn`。
  - 注意它去掉了 `luci-app-package-manager`（LuCI 的「软件包」页面），之后装包得走 SSH 用 `apk add`；要回来就在表单 `extra_packages` 填 `luci-app-package-manager`。
  - 去掉了 `logrotate`，`ci/diy.sh` 会自动跳过日志轮转的 cron 行（脚本读 `.config` 判断），不留每天失败的定时任务。
- **全功能档 +45 项**：15 个常用 LuCI 应用 + 对应 15 个中文语言包 + 7 个命令行工具（`bash/nano/tmux/iperf3/mtr-json/tcpdump/openssl-util`）+ 8 个 USB 存储/挂载（`kmod-usb3/storage/uas`、`block-mount`、`kmod-fs-{ext4,exfat,ntfs3}`、`e2fsprogs`）。
- **无无线档 −5 无线包**：把 `ath11k-firmware-ipq6018`、`kmod-ath11k*`、`wpad-basic-mbedtls` 写成 `=n`，并额外加 12 条 `=n` 兜底（防止 `wpad` 等间接依赖把 ath11k 拉回）。
- **⚠️ 上网必备三件套（四档都有，缺一不可）**：`firewall4` + `nftables-json` + `kmod-ipt-nat`（外加 `kmod-ipt-conntrack`）。这三者任一缺失，**路由器能启动、能进 LuCI，但 NAT/防火墙不工作，有线上不了网**——很难从现象联想到是编译配置问题。基准档已固化，派生档继承，不会丢。

> 更细的包级差异、命名规则踩坑、生成器用法见 [`configs/README.md`](configs/README.md)。

## 改配置

只改 `configs/IPQ60XX.config`（基准），然后重跑生成器：

```bash
python3 configs/_gen_profiles.py
```

要排除某个包**必须写 `=n`**，只加 `#` 注释是无效的。

加新机型：复制一份 `IPQ60XX-JDCloud.yml`，改 `config_file` / `artifact_prefix` / `hostname` 即可，模板不用动
（`firmware_tag` 已改为自动生成，不需要也不应该再手填）。

## 关键设计（照抄官方，别改）

| 项 | 做法 | 原因 |
| --- | --- | --- |
| 源码获取 | `git clone --depth 1 --single-branch` 到 `/mnt/openwrt` | 用 `actions/checkout` 拉大仓库必失败 |
| 依赖 | LibWrt README 的官方完整 apt 清单 | 自行精简必缺 `perl`/`patch`/`gperf` 之类 |
| `make download` | 失败重试 3 次 + 删残缺文件 | 上游 issue #153：报错属正常，可继续编译 |
| 编译 | `make -j$(nproc) \|\| make -j1 V=s` | 多线程失败自动降级，拿到真实报错 |
| 缓存 | ccache + staging_dir | 二次编译从 1 小时降到 10~20 分钟 |

## 包名（最容易写错，务必保留）

- **NSS 固件是 `nss-firmware-ipq60xx`** —— 来自 feed `qosmio/nss-packages` 的 `firmware/nss-firmware`，
  它生成 ipq807x/ipq60xx/ipq50xx/default 四个包。**没有 `qca-nss-firmware` 这个包。**
- **`ath11k-firmware-qcn5052` / `qcn5022` 在 25.12 不存在**。该源码已换成
  `laipeng668/ath11k-firmware-ddwrt`，子包只有
  `ipq5018 / ipq5018-qcn6122 / ipq6018 / ipq8074 / qca2066 / qca6390`
  —— **没有 `default` 这个子包**（旧配置写的 `ath11k-firmware-default` 是无效符号，已删除）。
  **IPQ60xx 必须选 `ath11k-firmware-ipq6018`**（QCN5052/QCN5022 闭源固件在这一组）。
- `KernelPackage/xxx` 类符号**自动带 `kmod-` 前缀**（源码写 `KernelPackage/qca-nss-drv` → `kmod-qca-nss-drv`）；
  `firmware` 类**不加**前缀。
- `wpad-basic-mbedtls` 已合并 `hostapd` / `wpa-supplicant`，三者不可同时选。
- `ipq-wifi-jdcloud_re-ss-01` 是 board-2.bin 覆盖件，由设备定义自动带出，不要手写。

## NSS 调优

- **别开 SQM**（NSS 与 SQM 抢流分类，反而掉速）；要限速用 `sqm-scripts-nss`
- **别开无线卸载**（ath11k 下无线 offload 是掉线头号原因，先只开有线 datapath）
- **无线校准数据别动**（改 `board-2.bin` 会掉性能甚至不启动）
- 发射功率别拉满，贴着合规上限跑最稳

## 排错

先看 run 页面的 **Annotations**：错误位置形如 `step:10:20`，配合耗时判断阶段。
**耗时 < 60s ⇒ 一定卡在 checkout / 依赖安装 / feeds，不可能是编译。**

修完记得核对是否真推上去了：`git ls-remote origin refs/heads/25.12-nss`。
