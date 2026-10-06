# 京东云 RE-SS-01（AX1800 Pro / IPQ6000）—— 补进不含本机型的源码树
#
# 与 LibWrt 25.12-nss 的定义保持一致，唯一差别：
#   去掉 DEVICE_PACKAGES 里的 ipq-wifi-jdcloud_re-ss-01。
#   原因：上游（含 LibWrt 自身）都没有 board-jdcloud_re-ss-01.* 校准文件，
#   该包实际是空的；保留它反而会在镜像打包阶段因找不到包而失败。
#   本机型的 WiFi 一直是用通用 ath11k-firmware-ipq6018 的 board-2.bin。

define Device/jdcloud_re-ss-01
	$(call Device/FitImage)
	$(call Device/EmmcImage)
	DEVICE_VENDOR := JDCloud
	DEVICE_MODEL := RE-SS-01
	KERNEL_SIZE := 6144k
	SOC := ipq6000
	DEVICE_DTS_CONFIG := config@cp03-c2
	IMAGE/factory.bin := append-kernel | pad-to $$(KERNEL_SIZE) | append-rootfs | append-metadata
endef
TARGET_DEVICES += jdcloud_re-ss-01
