# -*- coding: utf-8 -*-
"""
从「基准档」configs/IPQ60XX.config 生成其余三个档位配置文件。

为什么要有这个脚本：
  之前 IPQ60XX-minimal / IPQ60XX-full / NoWiFi 是手工在旧版基准上改出来的，
  基准档后来加了包（nftables-json、kmod-ipt-nat、ucode-mod-ubus、xz、zstd、
  若干 zh-cn 翻译包……），另外三个档位没有跟着更新，导致 NoWiFi 档
  实际上缺了防火墙/NAT 运行时的关键包。用脚本统一派生就不会再漂移。

用法：
  python3 configs/_gen_profiles.py        # 在仓库根目录或 configs/ 下都能跑

产出（覆盖同名文件）：
  configs/IPQ60XX-minimal.config    基准 − 便利组件
  configs/IPQ60XX-full.config       基准 + 常用应用/工具/USB
  configs/NoWiFi.config             基准 − ath11k/wpad（纯有线路由）
"""

import io
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
BASE_NAME = "IPQ60XX.config"


# ============================================================
#  极简档：从基准移除的包
#  注意：同时要移除这些应用对应的 luci-i18n-*-zh-cn，
#        否则会留下「有翻译没应用」的孤儿包。
# ============================================================
MINIMAL_DROP = [
    # 注：coreutils-xxd / kmod-tunnel4 / kmod-sqm / watchdog 已从基准档删除
    #     （本分支不存在这些包），这里就不必再列了。
    "coreutils", "coreutils-sort",
    "htop", "openssh-client-utils", "terminfo",
    "kmod-gre", "kmod-ipip", "kmod-vxlan",
    "kmod-sched-cake", "sqm-scripts-nss",
    "luci-app-sqm", "luci-app-upnp", "luci-app-wol",
    "luci-app-package-manager", "ttyd", "logrotate",
    # 上面那些 LuCI 应用配套的翻译包，一并去掉
    "luci-i18n-sqm-zh-cn", "luci-i18n-upnp-zh-cn",
]

# ============================================================
#  全功能档：追加的包
# ============================================================
FULL_EXTRA = """# ============================================================
#  以下为「全功能档」追加内容（基准档没有）
#  若某个包在本分支不存在，Apply Config 步骤会自动剔除并打印 [drop]，
#  不会导致编译失败。
# ============================================================

# ---------- 常用 LuCI 应用 ----------
CONFIG_PACKAGE_luci-app-commands=y
CONFIG_PACKAGE_luci-app-ddns=y
CONFIG_PACKAGE_luci-app-uhttpd=y
CONFIG_PACKAGE_luci-app-nlbwmon=y
CONFIG_PACKAGE_luci-app-watchcat=y
CONFIG_PACKAGE_luci-app-autoreboot=y
CONFIG_PACKAGE_luci-app-arpbind=y
CONFIG_PACKAGE_luci-app-vlmcsd=y
CONFIG_PACKAGE_luci-app-smartdns=y
CONFIG_PACKAGE_luci-app-ttyd=y
CONFIG_PACKAGE_luci-app-hd-idle=y
CONFIG_PACKAGE_luci-app-diskman=y
CONFIG_PACKAGE_luci-app-netdata=y
CONFIG_PACKAGE_luci-app-openvpn=y
CONFIG_PACKAGE_luci-app-wifischedule=y

# ---------- 中文界面 ----------
CONFIG_PACKAGE_luci-i18n-commands-zh-cn=y
CONFIG_PACKAGE_luci-i18n-ddns-zh-cn=y
CONFIG_PACKAGE_luci-i18n-uhttpd-zh-cn=y
CONFIG_PACKAGE_luci-i18n-nlbwmon-zh-cn=y
CONFIG_PACKAGE_luci-i18n-watchcat-zh-cn=y
CONFIG_PACKAGE_luci-i18n-autoreboot-zh-cn=y
CONFIG_PACKAGE_luci-i18n-arpbind-zh-cn=y
CONFIG_PACKAGE_luci-i18n-vlmcsd-zh-cn=y
CONFIG_PACKAGE_luci-i18n-smartdns-zh-cn=y
CONFIG_PACKAGE_luci-i18n-ttyd-zh-cn=y
CONFIG_PACKAGE_luci-i18n-hd-idle-zh-cn=y
CONFIG_PACKAGE_luci-i18n-diskman-zh-cn=y
CONFIG_PACKAGE_luci-i18n-netdata-zh-cn=y
CONFIG_PACKAGE_luci-i18n-openvpn-zh-cn=y
CONFIG_PACKAGE_luci-i18n-wifischedule-zh-cn=y

# ---------- 命令行工具 ----------
CONFIG_PACKAGE_bash=y
CONFIG_PACKAGE_nano=y
CONFIG_PACKAGE_tmux=y
CONFIG_PACKAGE_iperf3=y
CONFIG_PACKAGE_mtr-json=y
CONFIG_PACKAGE_tcpdump=y
CONFIG_PACKAGE_openssl-util=y

# ---------- USB 存储 / 挂载 ----------
CONFIG_PACKAGE_kmod-usb3=y
CONFIG_PACKAGE_kmod-usb-storage=y
CONFIG_PACKAGE_kmod-usb-storage-uas=y
CONFIG_PACKAGE_block-mount=y
CONFIG_PACKAGE_kmod-fs-ext4=y
CONFIG_PACKAGE_kmod-fs-exfat=y
CONFIG_PACKAGE_kmod-fs-ntfs3=y
CONFIG_PACKAGE_e2fsprogs=y
"""

# ============================================================
#  无无线档：从基准移除的无线包 + 显式 =n 清单
# ============================================================
WIFI_PKGS = [
    "kmod-ath11k", "kmod-ath11k-ahb", "kmod-ath11k-pci",
    "ath11k-firmware-ipq6018",
    "wpad-basic-mbedtls",
]

# 这些包在基准里没有出现，但要显式关掉，避免被别的依赖悄悄拉回来
NOWIFI_EXPLICIT_OFF = [
    "kmod-ath11k", "kmod-ath11k-ahb", "kmod-ath11k-pci",
    "ath11k-firmware-ipq6018",
    "wpad-basic-mbedtls", "wpad-basic-openssl", "wpad-openssl",
    "hostapd", "wpa-supplicant", "iw", "iwinfo",
    "luci-app-wifischedule",
]


def read(name):
    return io.open(os.path.join(HERE, name), encoding="utf-8").read()


def write(name, text):
    p = os.path.join(HERE, name)
    io.open(p, "w", encoding="utf-8", newline="\n").write(text)
    y = len([1 for l in text.splitlines() if re.match(r"^CONFIG_PACKAGE_\S+=y$", l)])
    n = len([1 for l in text.splitlines() if re.match(r"^CONFIG_PACKAGE_\S+=n$", l)])
    print("  %-28s =y:%-4d =n:%-4d 行:%-4d" % (name, y, n, text.count("\n")))


def swap_header(text, title, extra_lines=()):
    """替换文件头部注释块（第 1~5 行那种），保持后续内容不动。"""
    lines = text.splitlines()
    # 找到第一个真正的配置行
    idx = 0
    while idx < len(lines) and (lines[idx].startswith("#") or not lines[idx].strip()):
        idx += 1
    head = ["# ============================================================",
            "#  " + title]
    head += ["#  " + s for s in extra_lines]
    head += ["#  由 configs/_gen_profiles.py 从 IPQ60XX.config 自动派生，勿手工改",
             "# ============================================================",
             ""]
    return "\n".join(head + lines[idx:])


def drop_pkg(text, names, marker="[移除]"):
    out = []
    for line in text.splitlines():
        m = re.match(r"^CONFIG_PACKAGE_([A-Za-z0-9_.+-]+)=(y|n)$", line)
        if m and m.group(1) in names:
            out.append("# %s %s" % (marker, line))
        else:
            out.append(line)
    return "\n".join(out)


def drop_symbol(text, keys, marker="[移除]"):
    """注释掉普通（非 CONFIG_PACKAGE_）配置行。"""
    out = []
    for line in text.splitlines():
        m = re.match(r"^(CONFIG_[A-Za-z0-9_]+)=(y|n|m)$", line)
        if m and m.group(1) in keys:
            out.append("# %s %s" % (marker, line))
        else:
            out.append(line)
    return "\n".join(out)


def main():
    base = read(BASE_NAME)
    print("基准档:", BASE_NAME)

    # ---------------- 极简档 ----------------
    minimal = drop_pkg(base, set(MINIMAL_DROP))
    minimal = swap_header(
        minimal,
        "京东云 AX1800 Pro 亚瑟（jdcloud_re-ss-01）—— 极简满血 NSS",
        ["去掉 SQM/UPnP/WoL/ttyd/htop/watchdog/logrotate 等便利组件，",
         "保留 NSS 满血卸载 + ath11k 无线 + dnsmasq-full + firewall4 + 基础 LuCI。"])
    write("IPQ60XX-minimal.config", minimal)

    # ---------------- 全功能档 ----------------
    # 基准「明确不要」里若与追加项冲突，要先删掉那行 =n，否则同键两值。
    conflict = set(re.findall(r"^CONFIG_PACKAGE_(\S+)=y$", FULL_EXTRA, re.M))
    full = drop_pkg(base, conflict, marker="[全功能档改为启用]")
    full = swap_header(
        full,
        "京东云 AX1800 Pro 亚瑟（jdcloud_re-ss-01）—— 全功能满血 NSS",
        ["在基准档基础上追加常用 LuCI 应用 / 命令行工具 / USB 存储支持。"])
    full = full.rstrip("\n") + "\n\n" + FULL_EXTRA
    write("IPQ60XX-full.config", full)

    # ---------------- 无无线档 ----------------
    nowifi = drop_pkg(base, set(WIFI_PKGS))
    nowifi = swap_header(
        nowifi,
        "京东云 AX1800 Pro 亚瑟（jdcloud_re-ss-01）—— 无无线满血 NSS",
        ["纯有线路由 / 旁路由：不编 ath11k 与 wpad，体积更小、启动更干净。"])
    nowifi = nowifi.rstrip("\n") + "\n\n" + "\n".join(
        ["# ---------- 显式关掉一切无线相关（核心差异）----------",
         "# 这些包在基准档里没出现，但写 =n 能防止被其它依赖悄悄拉回来。"] +
        ["CONFIG_PACKAGE_%s=n" % p for p in NOWIFI_EXPLICIT_OFF] +
        [""])
    write("NoWiFi.config", nowifi)


if __name__ == "__main__":
    main()
