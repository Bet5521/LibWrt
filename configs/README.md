# 固件档位（configs/）说明与差异对照

本目录是京东云 AX1800 Pro **亚瑟**（`jdcloud_re-ss-01` / IPQ6000 / 512MB RAM）的云编译配置档位。
在 Actions → `IPQ60XX-JDCloud-AX1800Pro` → **Run workflow** 时从下拉框选一个档位即可。

---

## 一、四档速览

| 档位 | 配置文件 | 编入包数 | 定位 | 什么时候选 |
| :--- | :--- | :-: | :--- | :--- |
| **标准** | `IPQ60XX.config` | 73 | 精简满血 NSS，带 SQM/UPnP/WoL/Lucky | 一次性配好就不太动，要限速与网络唤醒 |
| **极简** | `IPQ60XX-minimal.config` | 52 | 基准档减掉一切便利组件（含 Lucky） | 只要路由本职功能，最省 flash / 内存 |
| **全功能** | `IPQ60XX-full.config` | 118 | 基准档 + 常用应用 / 工具 / USB | 要当家庭网关 + 轻 NAS，什么都想有 |
| **无无线** | `NoWiFi.config` | 68 | 不编 ath11k 与 wpad | 关掉无线当纯有线路由 / 旁路由 |

> 三个派生档位**不是手工维护的**——由 `_gen_profiles.py` 从基准档 `IPQ60XX.config` 自动生成。
> 改基准档后重新跑一次生成器，四个档位就不会再各自漂移。

---

## 二、哪些东西四档完全一致（刻意统一）

这四档**只有四类差异**，其余全部相同。以下这些是四档共有的地基，改档位时**不要动**：

| 类别 | 内容 |
| :--- | :--- |
| 目标平台 | `qualcommax` / `ipq60xx`、设备 `jdcloud_re-ss-01`、`aarch64_cortex-a53`、`MULTI_PROFILE` |
| 分区尺寸 | `KERNEL_PARTSIZE=12`（MB）、`ROOTFS_PARTSIZE=2048`（MB，对应 2GB 大分区） |
| 内核 | `KALLSYMS` / `XTAX` / `DEBUG_FS` / `PROFILING` 等 |
| **NSS 满血卸载** | `kmod-qca-nss-drv`、`kmod-qca-nss-ecm`、`kmod-qca-nss-crypto`、`kmod-qca-nss-dp`、`nss-firmware-ipq60xx`、`ECM_INTERFACE_*` |
| 网络基础 | `dnsmasq-full`、`odhcp6c`、`odhcpd-ipv6only`、`firewall4`、`nftables-json`、`kmod-nft-offload`、`kmod-ipt-{offload,nat,conntrack}`、`kmod-pppoe`、`kmod-pppox` |
| LuCI 基础 | `luci`、`luci-base`、`luci-mod-*`、`luci-proto-*`、`luci-theme-bootstrap` + 中文语言包 |

**为什么强调这点**：`firewall4` 必须配 `nftables-json` 才能加载 nft 规则集，
`kmod-ipt-nat` / `kmod-ipt-conntrack` 是 NAT 与连接跟踪的前提。
这三个包一旦缺失，**路由器能启动、能进 LuCI，但上不了网**——很难从现象联想到是编译配置的问题。

---

## 三、四类差异维度

### 维度 1：无线栈（唯一「整块开关」）

| 包名 | 标准 | 极简 | 全功能 | 无无线 |
| :--- | :-: | :-: | :-: | :-: |
| `kmod-ath11k` | ✓ | ✓ | ✓ | ✗ |
| `kmod-ath11k-ahb` | ✓ | ✓ | ✓ | ✗ |
| `kmod-ath11k-pci` | ✓ | ✓ | ✓ | ✗ |
| `ath11k-firmware-ipq6018` | ✓ | ✓ | ✓ | ✗ |
| `ath11k-firmware-default` | ✓ | ✓ | ✓ | ✗ |
| `wpad-basic-mbedtls` | ✓ | ✓ | ✓ | ✗ |
| `hostapd` / `wpa-supplicant` / `iw` / `iwinfo` | — | — | — | ✗（显式关） |
| `WPA_MBEDTLS_CRYPTO` / `WPA_11KV_SUPPORT` / `WPA_11R_SUPPORT` | ✓ | ✓ | ✓ | 关 |

- 只有**无无线档**动这一块。`NoWiFi.config` 额外写了 13 条 `=n` 兜底，
  防止 `wpad` 之类的间接依赖把 ath11k 又悄悄拉回来。
- 亚瑟的无线是 **QCN5022（2.4G）+ QCN5052（5G）**，两者固件都在
  `ath11k-firmware-ipq6018` 里（**没有** `ath11k-firmware-qcn5052` 这种包名）。
- `ipq-wifi-jdcloud_re-ss-01`（board-2.bin 覆盖件）由设备定义里的 `DEVICE_PACKAGES` 自动带出，**不要在 config 里手写**。

### 维度 2：极简档移除的 25 项

在基准档基础上注释掉以下包（共 25 个：23 个功能包 + 2 个配套翻译包）：

| 分组 | 移除的包 |
| :--- | :--- |
| LuCI 应用 | `luci-app-sqm`、`luci-app-upnp`、`luci-app-wol`、**`luci-app-package-manager`** |
| SQM 限速 | `kmod-sqm`、`kmod-sched-cake`、`sqm-scripts-nss` |
| 隧道 | `kmod-gre`、`kmod-ipip`、`kmod-tunnel4`、`kmod-vxlan` |
| 命令行工具 | `htop`、`ttyd`、`coreutils`、`coreutils-sort`、`coreutils-xxd`、`openssh-client-utils`、`terminfo` |
| 系统维护 | `watchdog`、`logrotate` |
| 第三方应用 | `lucky`、`luci-app-lucky`、`luci-i18n-lucky-zh-cn`（Lucky 来自本仓库预置 feed，极简档不拉这个 feed） |
| 配套翻译 | `luci-i18n-sqm-zh-cn`、`luci-i18n-upnp-zh-cn` |

> ⚠️ 极简档 **去掉了 `luci-app-package-manager`**，也就是 LuCI 里的「软件包」页面。
> 之后想装东西得走 SSH 用 `apk add`。
> 如果这个不方便，用表单的 `extra_packages` 填 `luci-app-package-manager` 就能加回来。
>
> ⚠️ 极简档去掉了 `logrotate`，`ci/diy.sh` 会自动**跳过**日志轮转的 cron 行（脚本会读 `.config` 判断），
> 不会留下一条每天都失败的定时任务。

### 维度 3：全功能档追加的 49 项

| 分组 | 数量 | 内容 |
| :--- | :-: | :--- |
| 常用 LuCI 应用 | 17 | `commands`、`ddns`、`uhttpd`、`nlbwmon`、`watchcat`、`autoreboot`、`arpbind`、`accesscontrol`、`vlmcsd`、`smartdns`、`ttyd`、`hd-idle`、`diskman`、`netdata`、`openvpn`、`wifischedule`、`filetransfer` |
| 对应中文语言包 | 17 | 上述每个应用的 `luci-i18n-*-zh-cn` |
| 命令行工具 | 7 | `bash`、`nano`、`tmux`、`iperf3`、`mtr`、`tcpdump`、`openssl-util` |
| USB 存储 / 挂载 | 8 | `kmod-usb3`、`kmod-usb-storage`、`kmod-usb-storage-uas`、`block-mount`、`kmod-fs-ext4`、`kmod-fs-exfat`、`kmod-fs-ntfs3`、`e2fsprogs` |

其中 `luci-app-filetransfer` 在基准档里被显式写成了 `=n`（在「明确不要」清单里），
生成器会自动把那行处理掉，避免同一个键出现 `=n` 和 `=y` 两个值。

> Lucky（`lucky` + `luci-app-lucky` + `luci-i18n-lucky-zh-cn`）已进基准档，全功能档直接继承，不在追加清单里。
> 它来自本仓库 `feeds.conf.default` 的 `repo-extra-feeds` 预置区，编译时自动合并。

### 维度 4：基准档的「明确不要」清单

基准档末尾有一段 14 条 `=n`，四档都继承（全功能档除外 `filetransfer`）：
`docker`、`luci-app-dockerman`、`luci-app-passwall`、`luci-app-openclash`、`luci-app-adguardhome`、
`luci-app-qbittorrent`、`luci-app-samba4`、`samba4-server`、`transmission-daemon`、
`luci-app-filetransfer`、`luci-app-aria2`、`luci-app-zerotier`、`luci-app-frps`、`luci-app-frpc`。

另外 `kmod-mt76=n`、`luci-app-turboacc=n` 也是显式关掉的。

> **写 `=n` 是有意义的**：只在行首加 `#` 只是注释掉那一行，不等于关闭。
> 想真正排除某个包必须写 `CONFIG_PACKAGE_xxx=n`。

---

## 四、包级差异总表

✓ = 编入固件　✗ = 显式关闭　— = 该档位未提及（走进上游默认）

**NSS 满血卸载**

| 包名 | 标准 | 极简 | 全功能 | 无无线 |
| :--- | :-: | :-: | :-: | :-: |
| `kmod-qca-nss-crypto` | ✓ | ✓ | ✓ | ✓ |
| `kmod-qca-nss-dp` | ✓ | ✓ | ✓ | ✓ |
| `kmod-qca-nss-drv` | ✓ | ✓ | ✓ | ✓ |
| `kmod-qca-nss-ecm` | ✓ | ✓ | ✓ | ✓ |
| `nss-firmware-ipq60xx` | ✓ | ✓ | ✓ | ✓ |

**无线 ath11k**

| 包名 | 标准 | 极简 | 全功能 | 无无线 |
| :--- | :-: | :-: | :-: | :-: |
| `ath11k-firmware-default` | ✓ | ✓ | ✓ | ✗ |
| `ath11k-firmware-ipq6018` | ✓ | ✓ | ✓ | ✗ |
| `kmod-ath11k` | ✓ | ✓ | ✓ | ✗ |
| `kmod-ath11k-ahb` | ✓ | ✓ | ✓ | ✗ |
| `kmod-ath11k-pci` | ✓ | ✓ | ✓ | ✗ |
| `wpad-basic-mbedtls` | ✓ | ✓ | ✓ | ✗ |

**网络基础**

| 包名 | 标准 | 极简 | 全功能 | 无无线 |
| :--- | :-: | :-: | :-: | :-: |
| `dnsmasq-full` | ✓ | ✓ | ✓ | ✓ |
| `firewall4` | ✓ | ✓ | ✓ | ✓ |
| `kmod-crypto-aes` | ✓ | ✓ | ✓ | ✓ |
| `kmod-crypto-cbc` | ✓ | ✓ | ✓ | ✓ |
| `kmod-crypto-sha2` | ✓ | ✓ | ✓ | ✓ |
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
| `kmod-sqm` | ✓ | — | ✓ | ✓ |
| `kmod-tunnel4` | ✓ | — | ✓ | ✓ |
| `kmod-vxlan` | ✓ | — | ✓ | ✓ |
| `luci-app-firewall` | ✓ | ✓ | ✓ | ✓ |
| `luci-app-package-manager` | ✓ | — | ✓ | ✓ |
| `luci-app-sqm` | ✓ | — | ✓ | ✓ |
| `luci-app-upnp` | ✓ | — | ✓ | ✓ |
| `luci-app-wol` | ✓ | — | ✓ | ✓ |
| `nftables-json` | ✓ | ✓ | ✓ | ✓ |
| `odhcp6c` | ✓ | ✓ | ✓ | ✓ |
| `odhcpd-ipv6only` | ✓ | ✓ | ✓ | ✓ |
| `sqm-scripts-nss` | ✓ | — | ✓ | ✓ |

**LuCI 基础**

| 包名 | 标准 | 极简 | 全功能 | 无无线 |
| :--- | :-: | :-: | :-: | :-: |
| `luci` | ✓ | ✓ | ✓ | ✓ |
| `luci-base` | ✓ | ✓ | ✓ | ✓ |
| `luci-i18n-base-zh-cn` | ✓ | ✓ | ✓ | ✓ |
| `luci-i18n-firewall-zh-cn` | ✓ | ✓ | ✓ | ✓ |
| `luci-i18n-package-manager-zh-cn` | ✓ | ✓ | ✓ | ✓ |
| `luci-i18n-sqm-zh-cn` | ✓ | — | ✓ | ✓ |
| `luci-i18n-upnp-zh-cn` | ✓ | — | ✓ | ✓ |
| `luci-mod-admin-full` | ✓ | ✓ | ✓ | ✓ |
| `luci-mod-network` | ✓ | ✓ | ✓ | ✓ |
| `luci-mod-status` | ✓ | ✓ | ✓ | ✓ |
| `luci-mod-system` | ✓ | ✓ | ✓ | ✓ |
| `luci-proto-ipv6` | ✓ | ✓ | ✓ | ✓ |
| `luci-proto-ppp` | ✓ | ✓ | ✓ | ✓ |
| `luci-theme-bootstrap` | ✓ | ✓ | ✓ | ✓ |

**基础工具**

| 包名 | 标准 | 极简 | 全功能 | 无无线 |
| :--- | :-: | :-: | :-: | :-: |
| `ca-certificates` | ✓ | ✓ | ✓ | ✓ |
| `coreutils` | ✓ | — | ✓ | ✓ |
| `coreutils-sort` | ✓ | — | ✓ | ✓ |
| `coreutils-xxd` | ✓ | — | ✓ | ✓ |
| `curl` | ✓ | ✓ | ✓ | ✓ |
| `htop` | ✓ | — | ✓ | ✓ |
| `libustream-mbedtls` | ✓ | ✓ | ✓ | ✓ |
| `logrotate` | ✓ | — | ✓ | ✓ |
| `openssh-client-utils` | ✓ | — | ✓ | ✓ |
| `openssh-server` | ✓ | ✓ | ✓ | ✓ |
| `terminfo` | ✓ | — | ✓ | ✓ |
| `ttyd` | ✓ | — | ✓ | ✓ |
| `ucode` | ✓ | ✓ | ✓ | ✓ |
| `ucode-mod-fs` | ✓ | ✓ | ✓ | ✓ |
| `ucode-mod-ubus` | ✓ | ✓ | ✓ | ✓ |
| `ucode-mod-uci` | ✓ | ✓ | ✓ | ✓ |
| `watchdog` | ✓ | — | ✓ | ✓ |
| `xz` | ✓ | ✓ | ✓ | ✓ |
| `zstd` | ✓ | ✓ | ✓ | ✓ |

**全功能档新增：常用 LuCI 应用**

| 包名 | 标准 | 极简 | 全功能 | 无无线 |
| :--- | :-: | :-: | :-: | :-: |
| `luci-app-accesscontrol` | — | — | ✓ | — |
| `luci-app-arpbind` | — | — | ✓ | — |
| `luci-app-autoreboot` | — | — | ✓ | — |
| `luci-app-commands` | — | — | ✓ | — |
| `luci-app-ddns` | — | — | ✓ | — |
| `luci-app-diskman` | — | — | ✓ | — |
| `luci-app-filetransfer` | ✗ | ✗ | ✓ | ✗ |
| `luci-app-hd-idle` | — | — | ✓ | — |
| `luci-app-netdata` | — | — | ✓ | — |
| `luci-app-nlbwmon` | — | — | ✓ | — |
| `luci-app-openvpn` | — | — | ✓ | — |
| `luci-app-smartdns` | — | — | ✓ | — |
| `luci-app-ttyd` | — | — | ✓ | — |
| `luci-app-uhttpd` | — | — | ✓ | — |
| `luci-app-vlmcsd` | — | — | ✓ | — |
| `luci-app-watchcat` | — | — | ✓ | — |
| `luci-app-wifischedule` | — | — | ✓ | ✗ |

**全功能档新增：中文语言包**（17 个，与上面应用一一对应）
`luci-i18n-{accesscontrol,arpbind,autoreboot,commands,ddns,diskman,filetransfer,hd-idle,netdata,nlbwmon,openvpn,smartdns,ttyd,uhttpd,vlmcsd,watchcat,wifischedule}-zh-cn`

**全功能档新增：命令行工具与 USB 存储**

| 包名 | 标准 | 极简 | 全功能 | 无无线 |
| :--- | :-: | :-: | :-: | :-: |
| `bash` | — | — | ✓ | — |
| `iperf3` | — | — | ✓ | — |
| `mtr` | — | — | ✓ | — |
| `nano` | — | — | ✓ | — |
| `openssl-util` | — | — | ✓ | — |
| `tcpdump` | — | — | ✓ | — |
| `tmux` | — | — | ✓ | — |
| `block-mount` | — | — | ✓ | — |
| `e2fsprogs` | — | — | ✓ | — |
| `kmod-fs-exfat` | — | — | ✓ | — |
| `kmod-fs-ext4` | — | — | ✓ | — |
| `kmod-fs-ntfs3` | — | — | ✓ | — |
| `kmod-usb-storage` | — | — | ✓ | — |
| `kmod-usb-storage-uas` | — | — | ✓ | — |
| `kmod-usb3` | — | — | ✓ | — |

---

## 五、本次核对发现并已修复的问题

| # | 问题 | 影响 | 处理 |
| :-: | :--- | :--- | :--- |
| 1 | **`NoWiFi.config` 已漂移**：它是在旧版基准档上改的，基准档后来新增的 23 个包它一个都没有 | 缺 `nftables-json`、`kmod-ipt-nat`、`kmod-ipt-conntrack`、`ucode-mod-ubus`、`luci`、`luci-mod-admin-full`、`xz`、`zstd`、`kmod-crypto-{cbc,sha2}` 等 —— **编译出的固件能启动、能进 LuCI，但防火墙/NAT 不工作，有线上不了网** | 改为由生成器从当前基准档派生，补齐全部 23 项 |
| 2 | `NoWiFi.config` 有幽灵符号 `CONFIG_PACKAGE_luci-app-wifi-schedule=n` | 包名不存在（正确是 `luci-app-wifischedule`），该行被 `make defconfig` 静默丢弃，等于没关 | 生成器改为写正确的 `luci-app-wifischedule=n` |
| 3 | 极简档留着 `luci-i18n-sqm-zh-cn`、`luci-i18n-upnp-zh-cn`，但对应的 `luci-app-sqm` / `luci-app-upnp` 已移除 | 留下「有翻译没应用」的孤儿包，体积白占 | 生成器把它们一并列入移除清单（51 → 49 包） |
| 4 | 全功能档里 `luci-app-filetransfer` 同时存在 `=n`（继承自基准）和 `=y`（追加段） | 同键两值，靠「后出现的生效」侥幸正确，语义混乱 | 生成器生成全功能档时自动删掉冲突的 `=n` 行 |
| 5 | 四个档位手工维护、无单一来源 | 基准档一改，派生档就悄悄过时（问题 1 的根因） | 引入 `_gen_profiles.py`，三个派生档全部由基准档生成 |

---

## 六、怎么改

### 要长期改某个档位
改 `IPQ60XX.config`（基准），然后重新生成：

```bash
python3 configs/_gen_profiles.py
```

生成器会覆盖 `IPQ60XX-minimal.config`、`IPQ60XX-full.config`、`NoWiFi.config`，
并在每个派生档头部写上「由 `_gen_profiles.py` 自动派生，勿手工改」。

### 只想临时加减几个包
**不用改文件**，直接在 Actions 表单里填：

| 表单项 | 作用 | 例子 |
| :--- | :--- | :--- |
| `extra_packages` | 追加包 | `luci-app-package-manager iperf3 htop` |
| `remove_packages` | 移除包 | `sqm-scripts-nss luci-app-sqm` |

分隔符支持空格、英文逗号、中文逗号、换行，**不用写 `CONFIG_PACKAGE_` 前缀**。
流程里会逐个回验并打印 `[OK]` / `[已关]` / 警告——包名写错只警告，不会中断编译。

### 要新增一个档位
1. 在 `configs/` 下新建 `IPQ60XX-xxx.config`（可以直接拷基准档再改）；
2. 把 `configs/IPQ60XX-xxx.config` 加进 `.github/workflows/IPQ60XX-JDCloud.yml` 里
   `config_file` 那个 `choice` 的 `options` 列表。

---

## 七、包名规则（最容易写错的地方）

| 源码里的写法 | 生成的 CONFIG 符号 | 例子 |
| :--- | :--- | :--- |
| `define KernelPackage/xxx` | 自动带 `kmod-` 前缀 | `KernelPackage/qca-nss-drv` → `CONFIG_PACKAGE_kmod-qca-nss-drv` |
| `define Package/xxx` | 直接就是 `xxx` | `Package/nss-firmware-ipq60xx` → `CONFIG_PACKAGE_nss-firmware-ipq60xx` |

已经踩过的坑：

- ❌ `qca-nss-firmware` 不存在 → ✅ `nss-firmware-ipq60xx`
- ❌ `ath11k-firmware-qcn5052` / `ath11k-firmware-qcn5022` 不存在 → ✅ `ath11k-firmware-ipq6018` + `ath11k-firmware-default`
- ❌ `CONFIG_NSS_FIRMWARE_VERSION_12_5` 这个符号在 25.12 里**根本不存在**（12.5 是 `nss_packages` feed 默认分支自带的）
- ⚠️ `hostapd` 与 `wpa-supplicant` 不能同时选，用合并包 `wpad-basic-mbedtls`

---

## 相关文档

- [`../ci/README.md`](../ci/README.md) —— Actions 表单 18 项的逐项说明、自定义值如何生效、生成器输出的三份文件是什么
- 工作流：`.github/workflows/IPQ60XX-JDCloud.yml`（入口）、`.github/workflows/Build-OpenWrt.yml`（公共模板）
