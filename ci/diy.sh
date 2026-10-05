#!/usr/bin/env bash
# ============================================================
#  diy.sh —— 编译前的个性化（由 Build-OpenWrt.yml 在 make 之前调用）
#  作用：把默认主机名 / 时区 / 主机 IP / root 密码 / 自愈 cron 写进固件
#  注意：本脚本在宿主机（runner）执行，**此时还没有 uci 命令**，
#        所以只能改源码里的配置文件，不能调用 uci。
# ============================================================
set -u

# 工作目录 = 源码根（workflow 里已 cd 进去）
echo "[diy.sh] PWD=$PWD"

BASE_FILES="package/base-files/files"
[ -d "$BASE_FILES" ] || BASE_FILES="package/base-files"

# ---------- 1) 主机名 / 时区 ----------
if [ -f "$BASE_FILES/etc/config/system" ]; then
  sed -i "s/option hostname.*/option hostname 'JDC-AX1800Pro'/" "$BASE_FILES/etc/config/system" 2>/dev/null || true
  sed -i "s/option timezone.*/option timezone 'CST-8'/" "$BASE_FILES/etc/config/system" 2>/dev/null || true
  sed -i "s/option zonename.*/option zonename 'Asia\/Shanghai'/" "$BASE_FILES/etc/config/system" 2>/dev/null || true
  echo "[diy.sh] 已设置 hostname / timezone"
else
  echo "[diy.sh] 未找到 $BASE_FILES/etc/config/system，跳过"
fi

# ---------- 2) 默认主机 IP（默认保持 192.168.1.1，需要改就解开下面一行）----------
# sed -i "s/option ipaddr.*/option ipaddr '192.168.1.1'/" "$BASE_FILES/etc/config/network" 2>/dev/null || true

# ---------- 3) 默认 root 密码（默认空密码；要设密码就解开并替换哈希）----------
# 生成哈希：openssl passwd -6 '你的密码'
# sed -i "s|^root:[^:]*:|root:\$6\$xxxx:0:99999:7:::|" "$BASE_FILES/etc/shadow" 2>/dev/null || true

# ---------- 4) 无线默认参数：按「稳」来（2.4G HE20 固定 ch6 / 5G HE80 固定 ch36）----------
# 说明：亚瑟是 QCN5022(2.4G) + QCN5052(5G)，ath11k 下 5G 优先选非 DFS 信道
mkdir -p files/etc/config
if [ ! -f files/etc/config/wireless ]; then
  cat > files/etc/config/wireless <<'EOF'
config wifi-device 'radio0'
        option type 'mac80211'
        option path 'platform/soc@0/c000000.wifi'
        option band '2g'
        option channel '6'
        option htmode 'HE20'
        option cell_density '0'
        option noscan '1'
        option disabled '0'

config wifi-device 'radio1'
        option type 'mac80211'
        option path 'platform/soc@0/c000000.wifi+1'
        option band '5g'
        option channel '36'
        option htmode 'HE80'
        option cell_density '0'
        option disabled '0'

config wifi-iface 'default_radio0'
        option device 'radio0'
        option network 'lan'
        option mode 'ap'
        option ssid 'JDC-AX1800Pro'
        option encryption 'psk2'
        option key 'password12345'
        option disabled '0'

config wifi-iface 'default_radio1'
        option device 'radio1'
        option network 'lan'
        option mode 'ap'
        option ssid 'JDC-AX1800Pro_5G'
        option encryption 'psk2'
        option key 'password12345'
        option disabled '0'
EOF
  echo "[diy.sh] 已写入默认无线配置（SSID=JDC-AX1800Pro / 密码 password12345，首次启动后请改）"
else
  echo "[diy.sh] files/etc/config/wireless 已存在，跳过"
fi

# ---------- 5) 自愈 cron：无线掉线自动重启 + 每天清日志 ----------
if [ ! -f files/etc/crontabs/root ]; then
  mkdir -p files/etc/crontabs
  cat > files/etc/crontabs/root <<'EOF'
# 每 5 分钟检查网关连通性，不通就重启无线
*/5 * * * * ping -c1 -w2 192.168.1.1 >/dev/null 2>&1 || (wifi down; sleep 3; wifi up)
# 每天 04:30 清理日志
30 4 * * * logrotate -f /etc/logrotate.conf >/dev/null 2>&1
EOF
  echo "[diy.sh] 已写入自愈 cron"
fi

echo "[diy.sh] done"
