#!/bin/sh
# =============================================================================
# install_lucky.sh — OpenWrt 上一键安装 Lucky（含 LuCI 界面）
#
# 适用：OpenWrt 24.10 / 25.12 及衍生固件（如 LibWrt）
# 能力：
#   - 自动识别包管理器：opkg(ipk) / apk
#   - 自动识别架构（aarch64/armv7/x86_64/mips/riscv64 ...）
#   - 自动拉取 gdy666/luci-app-lucky 最新 release 的三个包：
#       lucky                  （预编译二进制，核心守护进程）
#       luci-app-lucky        （LuCI 网页界面）
#       luci-i18n-lucky-zh-cn （中文翻译）
#   - 安装后自动 enable + start 服务，并校验 LuCI 注册
#
# 重要说明（apk 用户必读）：
#   gdy666 上游目前【只发 ipk，不发 apk】。因此：
#     * 若你的 25.12 固件已经把 lucky 编进镜像（如 LibWrt 自定义构建），
#       脚本会直接识别为“已安装”，仅做启用/启动，最干净。
#     * 若是裸 25.12，脚本会尝试用 binutils(ar) 解 ipk 手动落盘。
#       这种方式 apk 数据库【不会】记录该包，系统升级时可能被覆盖，
#       属于 best-effort 兜底，生产环境建议把 lucky 编进固件。
#
# 用法：
#   sh install_lucky.sh
# 可选环境变量：
#   LUCKY_VER=2.19.5    指定 release（默认自动取最新，失败回退 2.19.5）
#   LUCKY_ARCH=arm64    强制架构（默认自动探测）
#   LUCKY_FULL=0        1=用自带 Web 面板的 wanji 版（离线友好，体积大）
# =============================================================================

set -u

# ---- 基础工具 ----------------------------------------------------------------
log()  { echo "[lucky] $*"; }
warn() { echo "[lucky][WARN] $*" >&2; }
err()  { echo "[lucky][ERROR] $*" >&2; }

dl_stdout() { # url -> stdout
  if command -v wget >/dev/null 2>&1; then wget -q -T 20 -O - "$1" 2>/dev/null
  elif command -v curl >/dev/null 2>&1; then curl -fsSL --max-time 20 "$1" 2>/dev/null
  fi
}
dl_file() { # url out
  if command -v wget >/dev/null 2>&1; then wget -q -T 90 -O "$2" "$1"
  elif command -v curl >/dev/null 2>&1; then curl -fsSL --max-time 90 -o "$2" "$1"
  else return 1; fi
}

# ---- 0. 环境检查 -------------------------------------------------------------
if [ ! -f /etc/openwrt_release ]; then
  err "未检测到 /etc/openwrt_release，本脚本仅用于 OpenWrt。"
  exit 1
fi

# 包管理器识别
if command -v apk >/dev/null 2>&1; then
  PM="apk"
elif command -v opkg >/dev/null 2>&1; then
  PM="opkg"
else
  err "既无 apk 也无 opkg，无法继续。"
  exit 1
fi
log "检测到包管理器：$PM"

# ---- 1. 架构识别 -------------------------------------------------------------
ARCH="${LUCKY_ARCH:-}"
if [ -z "$ARCH" ]; then
  m=$(uname -m)
  case "$m" in
    aarch64|arm64)        ARCH="arm64" ;;
    armv7l|armv7)         ARCH="armv7" ;;
    armv6l|armv6)         ARCH="armv6" ;;
    armv5*)               ARCH="armv5" ;;
    x86_64|amd64)         ARCH="x86_64" ;;
    i386|i686)            ARCH="i386" ;;
    riscv64)              ARCH="riscv64" ;;
    mips*)
      # uname 无法区分 hard/soft float，默认 hardfloat（最常见）
      ARCH="mips_hardfloat"
      warn "MIPS 平台默认按 hardfloat 处理；若你是 softfloat 设备，请设 LUCKY_ARCH=mips_softfloat"
      ;;
    *) err "未知架构: $m"; exit 1 ;;
  esac
fi
log "目标架构：lucky_..._Openwrt_${ARCH}.ipk"

# ---- 2. 解析下载地址（优先 GitHub API，失败回退硬编码 v2.19.5）----------------
LUCKY_VER="${LUCKY_VER:-}"
if [ -z "$LUCKY_VER" ]; then
  t=$(dl_stdout "https://api.github.com/repos/gdy666/luci-app-lucky/releases/latest" 2>/dev/null \
      | grep -oE '"tag_name"[ ]*:[ ]*"[^"]+"' | head -1 | sed -E 's/.*"([^"]+)".*/\1/')
  LUCKY_VER="${t#v}"
  [ -z "$LUCKY_VER" ] && LUCKY_VER="2.19.5"
fi
log "使用 Lucky release: v${LUCKY_VER}"

lucky_url=""; luci_url=""; i18n_url=""
api_json=$(dl_stdout "https://api.github.com/repos/gdy666/luci-app-lucky/releases/tags/v${LUCKY_VER}" 2>/dev/null)
if [ -n "$api_json" ]; then
  lucky_url=$(printf '%s\n' "$api_json" | grep -oE "https://github.com/[^ ]*lucky_${LUCKY_VER}_Openwrt_${ARCH}\.ipk" | head -1)
  luci_url=$(printf '%s\n' "$api_json"  | grep -oE 'https://github.com/[^ ]*luci-app-lucky_[^ ]*_all\.ipk' | head -1)
  i18n_url=$(printf '%s\n' "$api_json"  | grep -oE 'https://github.com/[^ ]*luci-i18n-lucky-zh-cn_[^ ]*_all\.ipk' | head -1)
fi

# 回退：硬编码已知可用的 v2.19.5 资产（仅当上面没解析到时）
if [ -z "$lucky_url" ] || [ -z "$luci_url" ] || [ -z "$i18n_url" ]; then
  warn "API 解析失败或受限，回退到内置 v2.19.5 地址。"
  lucky_url="https://github.com/gdy666/luci-app-lucky/releases/download/v2.19.5/lucky_2.19.5_Openwrt_${ARCH}.ipk"
  luci_url="https://github.com/gdy666/luci-app-lucky/releases/download/v2.19.5/luci-app-lucky_2.2.2-r1_all.ipk"
  i18n_url="https://github.com/gdy666/luci-app-lucky/releases/download/v2.19.5/luci-i18n-lucky-zh-cn_25.051.13443.e78d498_all.ipk"
fi

# 是否使用自带 Web 面板的 wanji 版（离线更稳，但体积翻倍）
if [ "${LUCKY_FULL:-0}" = "1" ]; then
  w=$(printf '%s\n' "$lucky_url" | sed -E 's#(lucky_[0-9.]+_Openwrt_[^.]+\.ipk)#\1#' | sed 's/\.ipk/_wanji.ipk/')
  # wanji 资源名规则：在 .ipk 前插入 _wanji
  lucky_url=$(printf '%s\n' "$lucky_url" | sed -E 's/\.ipk$/_wanji.ipk/')
  log "已选 FULL(wanji) 版（自带 Web 面板，离线可用）"
fi

log "lucky : $lucky_url"
log "luci  : $luci_url"
log "i18n  : $i18n_url"

# ---- 3. 已安装检测（apk 下重点：LibWrt 自带固件直接跳过下载）-----------------
already() {
  if [ "$PM" = "apk" ]; then
    apk info -e "$1" >/dev/null 2>&1 && return 0
  else
    opkg list-installed "$1" 2>/dev/null | grep -q "^$1 " && return 0
  fi
  return 1
}

if already lucky && already luci-app-lucky && already luci-i18n-lucky-zh-cn; then
  log "三个包均已安装，跳过下载，直接进入启用/启动。"
  DO_INSTALL=0
else
  DO_INSTALL=1
fi

# ---- 4. 安装 -----------------------------------------------------------------
TMP=/tmp/lucky_install_$$
mkdir -p "$TMP"

install_opkg() {
  log "opkg 模式：下载并安装 ipk ..."
  dl_file "$lucky_url" "$TMP/lucky.ipk"  || { err "下载 lucky 失败"; return 1; }
  dl_file "$luci_url"  "$TMP/luci.ipk"   || { err "下载 luci-app-lucky 失败"; return 1; }
  dl_file "$i18n_url"  "$TMP/i18n.ipk"   || { err "下载 i18n 失败"; return 1; }
  opkg update >/dev/null 2>&1 || warn "opkg update 失败（依赖若已存在仍可装）"
  opkg install "$TMP/lucky.ipk" "$TMP/luci.ipk" "$TMP/i18n.ipk"
}

# apk 兜底：用 ar 解 ipk，手动落盘 + 跑 postinst
install_apk_fallback() {
  warn "apk 模式：上游未提供 apk 包，采用 ipk 手动解包兜底（apk 不追踪，升级可能被覆盖）。"
  command -v ar >/dev/null 2>&1 || { log "安装 binutils 以提供 ar ..."; apk add binutils >/dev/null 2>&1 || { err "apk add binutils 失败"; return 1; }; }
  for u in "$lucky_url" "$luci_url" "$i18n_url"; do
    fn="$TMP/$(basename "$u")"
    dl_file "$u" "$fn" || { err "下载失败: $u"; return 1; }
    ctl="$TMP/ctl_$$"; data="$TMP/data_$$"
    mkdir -p "$ctl"
    ( cd "$TMP" && ar x "$fn" 2>/dev/null ) || { err "ar 解包失败: $fn"; return 1; }
    # data.tar.gz -> 落盘
    if [ -f "$TMP/data.tar.gz" ]; then
      tar -xzf "$TMP/data.tar.gz" -C / || { err "解 data.tar.gz 失败"; return 1; }
      rm -f "$TMP/data.tar.gz"
    fi
    # control.tar.gz -> 跑 postinst
    if [ -f "$TMP/control.tar.gz" ]; then
      tar -xzf "$TMP/control.tar.gz" -C "$ctl" 2>/dev/null
      if [ -f "$ctl/postinst" ]; then
        log "  执行 $(basename "$fn") 的 postinst ..."
        sh "$ctl/postinst" || warn "postinst 返回非零（可忽略：$?)"
      fi
      rm -f "$TMP/control.tar.gz"
    fi
  done
  # 让 LuCI 重新扫描菜单 / ACL
  rm -f /tmp/luci-indexcache /tmp/luci-modulecache 2>/dev/null
  /etc/init.d/rpcd restart >/dev/null 2>&1 || true
  /etc/init.d/uhttpd restart >/dev/null 2>&1 || true
  return 0
}

if [ "$DO_INSTALL" = "1" ]; then
  if [ "$PM" = "opkg" ]; then
    install_opkg || { err "opkg 安装失败"; exit 1; }
  else
    # apk：先看固件是否已提供（LibWrt 自定义构建）
    if already lucky || already luci-app-lucky; then
      log "检测到固件已内置 lucky/luci-app-lucky，跳过下载。"
    else
      install_apk_fallback || { err "apk 兜底安装失败"; exit 1; }
    fi
  fi
fi

# ---- 5. 启用 + 启动服务 ------------------------------------------------------
if [ -x /etc/init.d/lucky ]; then
  /etc/init.d/lucky enable 2>/dev/null || true
  /etc/init.d/lucky start  2>/dev/null || true
  log "lucky 服务已 enable + start。"
else
  warn "未找到 /etc/init.d/lucky，可能安装未完成。"
fi

# ---- 6. 校验 -----------------------------------------------------------------
log "---- 校验 ----"
if command -v lucky >/dev/null 2>&1; then
  log "lucky 二进制: $(command -v lucky)"
else
  warn "lucky 命令不在 PATH，安装可能未生效。"
fi
if [ -d /usr/lib/lua/luci/controller ] && ls /usr/lib/lua/luci/controller/lucky.lua >/dev/null 2>&1; then
  log "LuCI 控制器已就位: /usr/lib/lua/luci/controller/lucky.lua"
elif [ -f /usr/share/luci/menu.d/luci-app-lucky.json ]; then
  log "LuCI 菜单已就位: /usr/share/luci/menu.d/luci-app-lucky.json"
else
  warn "未检测到 LuCI 入口文件，网页界面可能需重启路由器或重装 luci-app-lucky。"
fi

# 打印访问入口
rip=$(uci -q get network.lan.ipaddr 2>/dev/null)
if [ -z "$rip" ]; then rip=$(ip addr show 2>/dev/null | grep -oE 'inet [0-9.]+' | head -1 | awk '{print $2}'); fi
log "安装完成。LuCI 路径：服务(Luci) → Lucky ，或浏览器打开："
log "  http://${rip:-<路由器IP>}/cgi-bin/luci/admin/services/lucky"

# 清理
rm -rf "$TMP" 2>/dev/null
exit 0
