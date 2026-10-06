#!/usr/bin/env bash
# ============================================================
#  diy.sh —— 编译前写入「初始状态」个性化配置
#  由 Build-OpenWrt.yml 在 make 之前调用，执行位置 = 源码根目录。
#
#  ⚠ 本脚本运行在编译宿主机（runner）上，此时【没有 uci 命令】，
#    所以这里只做两件事：
#      1) 往 files/ 覆盖层里写静态文件（版权镜像原样带进固件）
#      2) 生成 /etc/uci-defaults/* 脚本 —— 它在路由器【首次启动】时执行，
#         那时 uci 可用，且执行时机在 config_generate 与 `wifi config`【之后】，
#         所以脚本里设置的值一定是最终生效值（最可靠的方式）。
#
#  所有可调项都从环境变量读，未设置则用下面这套默认值。
# ============================================================
set -u

# ---------------- 读取输入（带默认值） ----------------
LAN_IP="${DIY_LAN_IP:-192.168.1.1}"
LAN_NETMASK="${DIY_LAN_NETMASK:-255.255.255.0}"
LAN_DNS="${DIY_LAN_DNS:-223.5.5.5}"
HOSTNAME="${DIY_HOSTNAME:-LibWrt}"
TIMEZONE="${DIY_TIMEZONE:-Asia/Shanghai}"
ROOT_PASSWORD="${DIY_ROOT_PASSWORD:-}"

WIFI_ENABLED="${DIY_WIFI_ENABLED:-on}"
WIFI_SSID="${DIY_WIFI_SSID:-JDC-AX1800Pro}"
WIFI_PASSWORD="${DIY_WIFI_PASSWORD:-password12345}"
WIFI_COUNTRY="${DIY_WIFI_COUNTRY:-CN}"
WIFI_CH_2G="${DIY_WIFI_CHANNEL_2G:-6}"
WIFI_HT_2G="${DIY_WIFI_HTMODE_2G:-HE20}"
WIFI_CH_5G="${DIY_WIFI_CHANNEL_5G:-36}"
WIFI_HT_5G="${DIY_WIFI_HTMODE_5G:-HE80}"

# 「开/关」统一成 0/1
case "$(printf '%s' "$WIFI_ENABLED" | tr 'A-Z' 'a-z')" in
  0|off|no|false|disable|disabled) WIFI_DISABLED=1 ;;
  *)                                WIFI_DISABLED=0 ;;
esac

# 加密方式：没给密码就退回 open，避免 psk2 + 空 key 让 hostapd 起不来
if [ -n "$WIFI_PASSWORD" ]; then
  WIFI_ENC='psk2'
  WIFI_KEY="$WIFI_PASSWORD"
else
  WIFI_ENC='none'
  WIFI_KEY=''
fi

echo "[diy.sh] PWD=$PWD"
echo "[diy.sh] LAN=$LAN_IP/$LAN_NETMASK DNS=$LAN_DNS host=$HOSTNAME tz=$TIMEZONE"
echo "[diy.sh] WiFi enabled=$WIFI_ENABLED (disabled=$WIFI_DISABLED) ssid=$WIFI_SSID"

BASE_FILES="package/base-files/files"
[ -d "$BASE_FILES" ] || BASE_FILES="package/base-files"

# 时区名 → POSIX TZ 字符串（config_generate 用的是 POSIX 串，不是 IANA 名）
tz_posix() {
  case "$1" in
    Asia/Shanghai|Asia/Chongqing|Asia/Chungking|Asia/Harbin|Asia/Urumqi|PRC) echo 'CST-8' ;;
    Asia/Hong_Kong|Asia/Macau|Asia/Taipei)                                   echo 'CST-8' ;;
    Asia/Tokyo)                                                              echo 'JST-9' ;;
    Asia/Seoul)                                                              echo 'KST-9' ;;
    Asia/Singapore|Asia/Kuala_Lumpur|Asia/Manila)                            echo '<+08>-8' ;;
    Asia/Bangkok|Asia/Jakarta|Asia/Ho_Chi_Minh)                              echo '<+07>-7' ;;
    Asia/Kolkata|Asia/Calcutta)                                              echo 'IST-5:30' ;;
    Asia/Dubai)                                                              echo '<+04>-4' ;;
    UTC|Etc/UTC|GMT)                                                         echo 'UTC0' ;;
    Europe/London)                                                           echo 'GMT0BST,M3.5.0/1,M10.5.0' ;;
    Europe/Berlin|Europe/Paris|Europe/Rome|Europe/Madrid|Europe/Amsterdam)   echo 'CET-1CEST,M3.5.0,M10.5.0/3' ;;
    Europe/Moscow)                                                           echo 'MSK-3' ;;
    America/New_York)                                                        echo 'EST5EDT,M3.2.0,M11.1.0' ;;
    America/Chicago)                                                         echo 'CST6CDT,M3.2.0,M11.1.0' ;;
    America/Denver)                                                          echo 'MST7MDT,M3.2.0,M11.1.0' ;;
    America/Los_Angeles)                                                     echo 'PST8PDT,M3.2.0,M11.1.0' ;;
    Australia/Sydney|Australia/Melbourne)                                    echo 'AEST-10AEDT,M10.1.0,M4.1.0/3' ;;
    *)                                                                       echo 'CST-8' ;;
  esac
}
TZ_POSIX="$(tz_posix "$TIMEZONE")"
echo "[diy.sh] TZ_POSIX=$TZ_POSIX"

mkdir -p files/etc/config files/etc/uci-defaults files/etc/crontabs

# ============================================================
#  1) 无线配置【不再】预置静态文件
#     原因（已踩坑）：亚瑟 IPQ6000 的 radio0/radio1 与 2.4G/5G 的对应关系由
#     驱动探测决定，编译期写死的 radio0=2g/radio1=5g 在很多固件里是反的，
#     会导致「2.4G 与 5G 交叉、信道非法、无线未关联、5G 不可用」。
#     正确做法：交给首次启动时的 `wifi config` 按真实硬件生成
#     /etc/config/wireless（path/band 都正确），再由下面的 99-diy-custom
#     按每个 radio 的真实 band 套用 SSID/信道/HT 模式（见第 2 段）。
# ============================================================
echo "[diy.sh] 跳过静态 wireless（交由首次启动 wifi config 按真实硬件生成）"

# ============================================================
#  2) 首次启动自定义脚本（uci-defaults）
#     时机：/etc/init.d/boot → uci_apply_defaults，位于 config_generate
#           与 `/sbin/wifi config` 之后 → 这里设置的值即最终值。
#     关键：不假设 radio0=2g/radio1=5g，逐 radio 读真实 band 后套用。
# ============================================================
cat > files/etc/uci-defaults/99-diy-custom <<EOF
#!/bin/sh
# 由 CI 自动生成：应用「LAN 地址 / 主机名 / 时区 / 无线初始状态」
# 返回 0 表示应用成功，OpenWrt 会把本脚本删除（只跑一次）。

# ---------- 确保无线配置存在（按真实硬件探测生成） ----------
# 首次启动若 /etc/config/wireless 缺失或不含任何 radio，先生成一遍，
# 避免某些情况下 boot 阶段 wifi config 未触发导致无线全无。
if [ ! -s /etc/config/wireless ] || [ "\$(uci -q show wireless 2>/dev/null | grep -c '=wifi-device')" = "0" ]; then
	/sbin/wifi config 2>/dev/null || true
fi

# ---------- LAN 地址 ----------
uci -q set network.lan.proto='static'
uci -q set network.lan.ipaddr='${LAN_IP}'
uci -q set network.lan.netmask='${LAN_NETMASK}'

# 下发给客户端的 DNS（DHCP Option 6）。这样电脑 ipconfig /all 里
# 「DNS 服务器」显示的就是这里的值，而不是路由器的 LAN 地址。
# 改法（出厂后随时可改，不丢）：LuCI「网络 → 接口 → LAN → 编辑 →
#   DHCP 服务器 → 高级设置 → DHCP 选项」，里面那一行就是 6,<你的DNS>。
# 先删再加，避免重复运行产生多条。
uci -q delete dhcp.lan.dhcp_option 2>/dev/null
uci -q add_list dhcp.lan.dhcp_option='6,${LAN_DNS}'
# 同时把路由器自身的上游 DNS 转发也指过去，保持一致（供把路由器当 DNS 的场景）。
uci -q delete dhcp.@dnsmasq[0].server 2>/dev/null
uci -q add_list dhcp.@dnsmasq[0].server='${LAN_DNS}'

# ---------- 主机名 / 时区 ----------
uci -q set system.@system[-1].hostname='${HOSTNAME}'
uci -q set system.@system[-1].timezone='${TZ_POSIX}'
uci -q set system.@system[-1].zonename='${TIMEZONE}'

# ---------- 无线：按每个 radio 的真实 band 套用 ----------
WIFI_DISABLED='${WIFI_DISABLED}'
for r in \$(uci -q show wireless 2>/dev/null | sed -n "s/^wireless\.\(radio[0-9]*\)=wifi-device/\1/p"); do
	band="\$(uci -q get wireless.\$r.band 2>/dev/null)"
	case "\$band" in
		2g)
			uci -q set wireless.\$r.channel='${WIFI_CH_2G}'
			uci -q set wireless.\$r.htmode='${WIFI_HT_2G}'
			uci -q set wireless.\$r.hwmode='g'
			;;
		5g|6g)
			uci -q set wireless.\$r.channel='${WIFI_CH_5G}'
			uci -q set wireless.\$r.htmode='${WIFI_HT_5G}'
			uci -q set wireless.\$r.hwmode='a'
			;;
	esac
	uci -q set wireless.\$r.country='${WIFI_COUNTRY}'
	uci -q set wireless.\$r.disabled="\$WIFI_DISABLED"
done

# iface 跟随其 device 的 band 决定 SSID（5G 加 _5G 后缀）
for i in \$(uci -q show wireless 2>/dev/null | sed -n "s/^wireless\.\(default_radio[0-9]*\)=wifi-iface/\1/p"); do
	dev="\$(uci -q get wireless.\$i.device 2>/dev/null)"
	band="\$(uci -q get wireless.\$dev.band 2>/dev/null)"
	case "\$band" in
		5g|6g) ssid='${WIFI_SSID}_5G' ;;
		*)     ssid='${WIFI_SSID}' ;;
	esac
	uci -q set wireless.\$i.ssid="\$ssid"
	uci -q set wireless.\$i.encryption='${WIFI_ENC}'
	uci -q set wireless.\$i.key='${WIFI_KEY}'
	uci -q set wireless.\$i.disabled="\$WIFI_DISABLED"
done

uci -q commit wireless
uci -q commit
exit 0
EOF
chmod +x files/etc/uci-defaults/99-diy-custom
echo "[diy.sh] 已写入 files/etc/uci-defaults/99-diy-custom"

# ============================================================
#  3) 自愈 cron（用配置好的 LAN IP 做探测）
#     logrotate 那一行只在固件真的编了该包时才写，
#     否则「极简档」里没有 logrotate，cron 会每早空跑一次。
# ============================================================
if [ -f .config ] && grep -q '^CONFIG_PACKAGE_logrotate=y' .config; then
  CRON_LOGROTATE='# 每天 04:30 强制轮转日志，防止写满 flash
30 4 * * * logrotate -f /etc/logrotate.conf >/dev/null 2>&1'
  echo "[diy.sh] 已编入 logrotate，写入日志轮转 cron"
else
  CRON_LOGROTATE=''
  echo "[diy.sh] 未编入 logrotate，跳过日志轮转 cron"
fi

cat > files/etc/crontabs/root <<EOF
# 每 5 分钟检查网关连通性，不通就重启无线（无线掉线自愈）
*/5 * * * * ping -c1 -w2 ${LAN_IP} >/dev/null 2>&1 || (wifi down; sleep 3; wifi up)
${CRON_LOGROTATE}
EOF
chmod 600 files/etc/crontabs/root
echo "[diy.sh] 已写入 files/etc/crontabs/root（探测目标 ${LAN_IP}）"

# ============================================================
#  4) root 密码（可选；留空则保持默认无密码）
# ============================================================
if [ -n "$ROOT_PASSWORD" ]; then
  if [ -f "$BASE_FILES/etc/shadow" ]; then
    mkdir -p files/etc
    cp -f "$BASE_FILES/etc/shadow" files/etc/shadow
    HASH="$(printf '%s' "$ROOT_PASSWORD" | openssl passwd -6 -stdin 2>/dev/null || true)"
    if [ -n "$HASH" ]; then
      # 只替换第 2 个字段（密码），其余字段原样保留。
      # 原始行是 root:::0:99999:7:::（9 字段，第 2 字段为空=无密码），
      # 用 sed 替换前缀会丢字段导致老化参数错位（min 变成 99999），所以用 awk。
      awk -F: -v h="$HASH" 'BEGIN{OFS=":"} $1=="root" && !d {$2=h; d=1} {print}' \
        files/etc/shadow > files/etc/shadow.new && mv files/etc/shadow.new files/etc/shadow
      chmod 600 files/etc/shadow
      echo "[diy.sh] 已设置 root 密码（sha512-crypt）"
    else
      echo "[diy.sh] !! openssl 生成密码哈希失败，保持无密码"
    fi
  else
    echo "[diy.sh] !! 未找到 $BASE_FILES/etc/shadow，跳过密码设置"
  fi
else
  echo "[diy.sh] 未指定 root 密码，保持默认无密码"
fi

echo "[diy.sh] done"
