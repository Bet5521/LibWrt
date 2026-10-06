# 云编译自定义说明（京东云 AX1800 Pro 亚瑟）

在仓库 **Actions → 左栏 `IPQ60XX-JDCloud-AX1800Pro` → Run workflow** 点开后，
表单里可以直接改下面所有内容。**留空 = 用默认值**，不会因为没填而出错。

---

## 一、可自定义项一览

### 1. 固件档位（`config_file`，下拉选择）

| 选项 | 包数 | 说明 |
| :--- | :--: | :--- |
| `configs/IPQ60XX-minimal.config` | 49 | **极简**（默认）：去掉 SQM/UPnP/WoL/ttyd/htop/watchdog/logrotate 等便利组件，最省 flash |
| `configs/IPQ60XX.config` | 71 | **标准**：精简满血 NSS + 无线 + SQM/UPnP/WoL + 基础 LuCI |
| `configs/IPQ60XX-full.config` | 120 | **全功能**：额外加常用 LuCI 应用 + 命令行工具 + USB 存储支持 |
| `configs/NoWiFi.config` | 65 | **无无线**：不编 ath11k 与 wpad（当纯有线路由用） |

> 四个档位的逐包差异见 [`../configs/README.md`](../configs/README.md)。
> 三个派生档位由 `configs/_gen_profiles.py` 从基准档 `IPQ60XX.config` 自动生成，不会各自漂移。
>
> ⚠️ **极简档去掉了 `luci-app-package-manager`**（LuCI 里的「软件包」页面），
> 之后装东西要走 SSH `apk add`；想保留就用 `extra_packages` 填 `luci-app-package-manager`。
> 极简档也没有 `logrotate`，`ci/diy.sh` 会自动跳过日志轮转的 cron 行。

### 2. LAN / 系统

| 表单项 | 默认值 | 说明 |
| :--- | :--- | :--- |
| `lan_ip` | `192.168.10.1` | 路由器管理地址（避开光猫常用的 192.168.1.1） |
| `lan_netmask` | `255.255.255.0` | 子网掩码 |
| `lan_dns` | `223.5.5.5` | 通过 DHCP 下发给客户端的 DNS |
| `hostname` | `JDC-AX1800Pro` | 主机名 |
| `timezone` | `Asia/Shanghai` | 时区（支持常见 IANA 名，如 `Asia/Tokyo`、`UTC`、`America/New_York`） |
| `root_password` | 空 | 留空 = 无密码；填了就写成 sha512-crypt 哈希 |

### 3. 无线初始状态

| 表单项 | 默认值 | 说明 |
| :--- | :--- | :--- |
| `wifi_enabled` | `on` | **`off` 时开机不启用无线**，但配置保留，之后可在 LuCI 里一键打开 |
| `wifi_ssid` | `JDC-AX1800Pro` | 2.4G 名称；5G 自动加 `_5G` 后缀 |
| `wifi_password` | `password12345` | 至少 8 位 |
| `wifi_country` | `CN` | 国家码（影响可用信道与发射功率） |
| `wifi_channel_2g` | `6` | 2.4G 信道（1 / 6 / 11 互不干扰） |
| `wifi_htmode_2g` | `HE20` | 2.4G 频宽，可选 HE20 / HE40 / HT20 / HT40 |
| `wifi_channel_5g` | `36` | 5G 信道（36–48、149–165 为非 DFS，最稳） |
| `wifi_htmode_5g` | `HE80` | 5G 频宽，可选 HE80 / HE160 / HE40 / VHT80 |

### 4. 组件 / 功能（`extra_packages` / `remove_packages`）

填包名即可，**空格、逗号或换行分隔，可写多行**，不需要写 `CONFIG_PACKAGE_` 前缀：

```
extra_packages:
  luci-app-ddns luci-app-commands
  htop iperf3
```

```
remove_packages:
  luci-app-sqm, luci-app-upnp
```

两种写法都可以（也支持中文逗号）。编译时会打印每个包的生效情况：

- `[OK] 包名` → 生效
- `[已关] 包名` → 成功移除
- 警告 → 名字写错或本分支没有**（只警告，不中断编译）**

---

## 二、这些设置是怎么生效的

| 内容 | 生效机制 |
| :--- | :--- |
| 组件 / 功能 | 直接写进 `.config`，编译时决定哪些包进固件 |
| 无线初始参数 | **不预置**静态 `wireless`；首次启动由 `wifi config` 按真实硬件生成，再由 `99-diy-custom` 逐 radio 读真实 `band` 套用信道/HT/SSID（避免 2.4G/5G 交叉） |
| LAN / 主机名 / 时区 / 无线开关 | 生成 `/etc/uci-defaults/99-diy-custom`，**路由器首次启动时**用 uci 应用；时机在 `config_generate` 和 `wifi config` **之后**，所以是最终值 |
| root 密码 | 预置 `/etc/shadow`（shadow 第 2 字段按 awk 精确替换，保持 9 字段格式） |
| 无线掉线自愈 | 预置 `/etc/crontabs/root`，每 5 分钟探测 `lan_ip`，不通就 `wifi down; up` |

> 改完想重编：再点一次 **Run workflow** 即可。
> 因为 `push` 触发器限定了 `paths`（只监听 `.github/workflows/`、`configs/`、`ci/diy.sh`），
> 日常改动 OpenWrt 源码**不会**触发编译，不会浪费额度。
