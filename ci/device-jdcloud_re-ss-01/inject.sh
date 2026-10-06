#!/bin/sh
# =============================================================
# 把「京东云 RE-SS-01（AX1800 Pro / IPQ6000）」的机型支持补齐到源码树
#
# 背景：OpenWrt 24.10 分支切出之后，jdcloud_re-ss-01 才合入主线，
# 所以 24.10 全系（官方 / ImmortalWrt / qosmio 24.10-nss）都没有这台设备。
# qosmio/openwrt-ipq@24.10-nss 的 ipq60xx 甚至标了 source-only（不产镜像），
# 且只有 ipq8074-nss.dtsi，没有 ipq6018-nss.dtsi。
#
# 本脚本补齐四件东西：
#   1. ipq6000-re-ss-01.dts        设备树（含 LED / 按键 / eMMC / 交换口 / WiFi 节点）
#   2. ipq6018-nss.dtsi            IPQ6018 的 NSS 节点（nss0 / nss_crypto / nss-common）
#   3. ipq60xx.mk 的机型定义       让 CONFIG_TARGET_DEVICE_..._DEVICE_jdcloud_re-ss-01 有效
#   4. 去掉 ipq60xx 的 source-only 否则子目标不产镜像，刷不了机
#
# 幂等：源码若已含该机型则直接跳过（25.12-nss 就是这种情况）。
# 用法：inject.sh <源码根目录>
# =============================================================
set -eu

SRC="${1:-}"
if [ -z "$SRC" ] || [ ! -d "$SRC" ]; then
	echo "用法: $0 <源码根目录>" >&2
	exit 1
fi

ASSETS="$(cd "$(dirname "$0")" && pwd)"
QCA="$SRC/target/linux/qualcommax"
DTS_DIR="$QCA/files/arch/arm64/boot/dts/qcom"
IMG="$QCA/image/ipq60xx.mk"
TMK="$QCA/ipq60xx/target.mk"

DEV="jdcloud_re-ss-01"

# ---- 幂等：已支持就什么都不做 ----
if [ -f "$IMG" ] && grep -qE "^TARGET_DEVICES \+= ${DEV}$" "$IMG"; then
	echo "::notice::源码已含机型 ${DEV}，无需注入。"
	exit 0
fi

if [ ! -f "$IMG" ]; then
	echo "::error::找不到 $IMG —— 该源码没有 qualcommax/ipq60xx 子目标，无法注入。"
	exit 1
fi

echo "===== 注入机型支持：$DEV ====="

# ---- 1+2 设备树 ----
mkdir -p "$DTS_DIR"
cp "$ASSETS/ipq6000-re-ss-01.dts" "$DTS_DIR/ipq6000-re-ss-01.dts"
cp "$ASSETS/ipq6018-nss.dtsi"     "$DTS_DIR/ipq6018-nss.dtsi"
echo "  设备树: ipq6000-re-ss-01.dts、ipq6018-nss.dtsi -> $DTS_DIR"

# ---- 2.5 校正 SDHCI 节点标签（内核版本差异，写错必炸）----
# 6.6（qosmio 24.10-nss）里 SDHCI 节点标签是 sdhc_1（由 0137 补丁添加）；
# 6.12（LibWrt 25.12）里是 sdhc。DTC 遇到不存在的标签会直接报
#   "Reference to non-existent node or label" 并中断编译，
# 所以按源码里真实存在的标签名自动校正，而不是写死某一个。
DTS_DST="$DTS_DIR/ipq6000-re-ss-01.dts"
if grep -rqE "^\+?[[:space:]]*sdhc_1:" "$QCA"/patches-*/ "$QCA"/files/ 2>/dev/null; then
	SDHC_LABEL="sdhc_1"
else
	SDHC_LABEL="sdhc"
fi
sed -i "s|^&sdhc[0-9_]*[[:space:]]*{|\&${SDHC_LABEL} {|" "$DTS_DST"
echo "  SDHCI 标签按源码校正为: &${SDHC_LABEL}"

# ---- 3 机型定义 ----
# 空行隔开，避免和上一个 define 粘在一起
printf '\n' >> "$IMG"
cat "$ASSETS/jdcloud_re-ss-01.mk" >> "$IMG"
echo "  机型定义已追加: $IMG"

# ---- 4 去掉 source-only（否则不产镜像）----
if [ -f "$TMK" ] && grep -qE '^[[:space:]]*FEATURES[[:space:]]*\+?=.*source-only' "$TMK"; then
	sed -i '/^[[:space:]]*FEATURES[[:space:]]*+*=.*source-only/d' "$TMK"
	echo "  已移除 source-only: $TMK"
else
	echo "  target.mk 无 source-only（或不存在），跳过"
fi

# ---- 5 校验 ----
echo "===== 注入后校验 ====="
grep -E "^TARGET_DEVICES \+= " "$IMG" | awk '{print $3}' | sort | tr '\n' ' '
echo
echo "::notice::机型 ${DEV} 注入完成。"
