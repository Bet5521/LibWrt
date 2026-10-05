# LibWrt 云编译 CI 就绪度审查 — 独立核实报告

- **核实对象**：mimo 输出的《LibWrt 云编译（GitHub Actions）就绪度审查报告》（2026-10-05）
- **核实方法**：直接读取仓库 `Bet5521/LibWrt @ 25.12-nss` 当前文件（`.github/workflows/*`、`ci/diy.sh`、`configs/*.config`），逐项核对源码级事实。
- **未做**：未 clone LibWrt 源码树跑 `make defconfig`（C 盘仅剩约 6GB，且仓库+feeds 体量大）。因此"defconfig 后实际生效 / 幽灵符号"的**精确拆分数字**来自 mimo 的本地跑；我仅静态确认"这些符号确实写进了 config 文件"，并在仓库内可验证的部分给出确定结论。

---

## 结论速览

| 编号 | mimo 结论 | 核实结果 | 关键依据 |
| --- | --- | --- | --- |
| 一 | 验证通过项（YAML 合法 / 接线匹配 / 关键包生效） | **成立** | 两 workflow 已在 CI 跑过（语法合法）；24/24 inputs 名称匹配；关键包均 `=y`；`ipq-wifi-*` 经 `DEVICE_PACKAGES` 自动带出 |
| 二·1 | Cleanup 前缀 bug → 每次冷编译 | **确认** | 双剥前缀得到 `openwrt-Linux-IPQ60XX-`，前缀匹配到两个当前缓存并互删 |
| 二·2 | 诊断分支 push 必 403 | **误判** | 调用方 `IPQ60XX-JDCloud.yml` 的 `Build:` job 已显式 `permissions: contents: write`，覆盖 reusable 内部 `read`，push 应成功 |
| 二·3 | `CONFIG_CCACHE` 未生效（缺 `DEVEL`） | **确认** | 4 个 config 均有 `CONFIG_CCACHE=y`，但 `grep '^CONFIG_DEVEL='` 全无命中 |
| 三·1 | 幽灵符号清单 | **确认** | 列出的符号全部以 `=y` 存在于 config；极简档幽灵恰好 16 个，与报告一致 |
| 三·2 | 符号存在但未生效 | **部分确认** | `CONFIG_CCACHE` 确认；`xz→xz-utils` / `GZIP 依赖 EXT4FS` / `libustream 沦为 =m` 需源码确认（其中 `xz` 一项我存疑） |
| 四·1 | `manifest_file` 死参数 | **确认** | 声明且传入，但 Organize 步骤只用 `${ARTIFACT_PREFIX}.manifest` |
| 四·2 | "剔除符号"循环空转 | **确认** | `make defconfig` 后未知符号已被清，循环条件永不成立 |
| 四·3 | `SONAME` 取空串 | **确认** | 该步骤未注入 `REPO_URL`，且 `SONAME` 后续未使用 |

---

## 逐项核实

### 一、验证通过项（基本成立）

- **YAML 合法 / 双触发合法**：`.github/workflows/Build-OpenWrt.yml` 同时声明 `workflow_call` 与 `workflow_dispatch`，且二者已实际在 CI 中运行（前文有 run #1~#4），语法必然合法。
- **复用工作流接线匹配**：提取 `Build-OpenWrt.yml` 的 `workflow_call` 输入（24 个）与 `IPQ60XX-JDCloud.yml` 的 `with:` 键（24 个）做差集，**两侧完全一致、无遗漏无多余**。✅
- **关键包生效**：`kmod-qca-nss-{drv,ecm,crypto,dp}`、`nss-firmware-ipq60xx`、`ath11k-firmware-ipq6018`、`wpad-basic-mbedtls`、`dnsmasq-full`、`firewall4`、`luci`、`firewall4 + nftables-json + kmod-ipt-nat`（三件套）均以 `=y` 出现在 config 中。✅
- **`ipq-wifi-jdcloud_re-ss-01`**：报告称"包存在"——config 中无显式 `=y`，但注释写明 `board-2.bin 覆盖件由 DEVICE_PACKAGES=ipq-wifi-jdcloud_re-ss-01 自动带出`，即由设备包依赖自动选中，属正常做法，非缺陷。✅

### 二·1 Cleanup 前缀 bug（确认）

`Build-OpenWrt.yml` Cleanup 步骤（行 653-662）：

```bash
for key in "${{ needs.Build.outputs.ccache_key }}" "${{ needs.Build.outputs.staging_key }}"; do
  [ -n "$key" ] || continue
  prefix="${key%-*}"; prefix="${prefix%-*}-"        # ← 剥两次
  gh cache list --repo "$GITHUB_REPOSITORY" --key "$prefix" ... \
    | jq -r --arg k "$key" '.[] | select(.key != $k) | .id' \
    | while read -r cid; do gh cache delete ... "$cid" || true; done
done
```

key 实际形如 `openwrt-Linux-IPQ60XX-<hash>-ccache`（与 `...-staging`）。两次 `${key%-*}` 剥掉 `-ccache` 与 `-<hash>`，得到前缀 `openwrt-Linux-IPQ60XX-`。`gh cache list --key` 为**前缀匹配**，于是：

1. 处理 `ccache_key` 时 → 匹配到本运行的两个缓存，`select(.key != ccache_key)` 删掉**当前 staging**；
2. 处理 `staging_key` 时 → 删掉**当前 ccache**。

结果：每次跑完，两个当前缓存都被清掉，下次永远全量冷编译。报告结论成立。

> **修正建议（比报告更完整）**：报告说"只剥一次"仍不够——`-ccache` 与 `-staging` 两档共享 `<hash>` 前缀，单剥也会互删。正确做法是在 `jq` 里**同时排除两个当前 key**，且前缀保留 hash：
> ```bash
> prefix="${key%-*}-"   # 仅剥 -ccache / -staging，保留 <hash>
> gh cache list --key "$prefix" ... \
>   | jq -r --arg c "$ccache_key" --arg s "$staging_key" \
>         'select(.key != $c and .key != $s) | .id'
> ```
> 注意：`HASH` 是源码提交号，同源多次运行相同，所以"旧缓存"只能靠 key 差异区分；若想真正滚动清理，需把 config 摘要或时间戳纳入缓存 key。

### 二·2 诊断分支 403（报告误判）

`Write Diagnostics On Failure` 步骤位于 `Build` job，而 `Build-OpenWrt.yml` 内部把该 job 的 `permissions` 写成 `contents: read`（行 255-256）。mimo 据此认为"内部 read 是地板、只能从调用方降级，push 必 403"。

但 GitHub 文档明确：**被调用工作流 job 的权限由调用方 `uses:` job 的 `permissions` 决定**；调用方未设才回退到被调用方自身权限。当前 `IPQ60XX-JDCloud.yml` 在调用处写：

```yaml
Build:
  uses: ./.github/workflows/Build-OpenWrt.yml
  permissions:
    contents: write
    actions: write
```

因此 `Build` job 实际拥有 `contents: write`，`git push -f ... diag-branch` 不会 403。mimo 的"内部权限不可被提升"模型是错的——实际是"内部权限被调用方覆盖"。

> 结论：该诊断功能**本就可工作**，不必修。若要更稳妥，可在 Diagnostics 步骤前显式标注 `permissions: contents: write`（job 级已继承，不加也行）。

### 二·3 `CONFIG_CCACHE` 未生效（确认）

```bash
$ grep -nE '^CONFIG_DEVEL=' configs/*.config
# （无输出 —— 4 个 config 全部没有 CONFIG_DEVEL=y）
$ grep -n 'CONFIG_CCACHE=y' configs/IPQ60XX.config
159:CONFIG_CCACHE=y
```

OpenWrt 的 ccache 选项定义在 `config/Config-devel.in`：`config CCACHE ... bool "Use ccache" if DEVEL`。未设 `CONFIG_DEVEL=y` 时该选项不可见，`=y` 会被 kconfig 在 `make defconfig` 阶段静默丢弃（与 mimo 描述一致）。→ 即使 `apt` 装了 ccache，编译也不会用它，`.ccache` 目录恒为空。

**修复**：4 个 config 均加 `CONFIG_DEVEL=y`（建议同时保留 `CONFIG_CCACHE=y`）。

### 三、`=y` 非法符号

- **3.1 幽灵符号（确认存在）**：逐一 `grep` 确认下列符号在对应 config 中以 `=y` 出现（kconfig 会在 defconfig 时静默丢弃）：
  - `CONFIG_KERNEL_XTAX`（疑似 XZ 笔误，全档）
  - `CONFIG_KERNEL_KALLSYMS_UNCOMPRESSED`、`CONFIG_KERNEL_MODULE_UNLOAD_TAINT_TRACKING`（全档）
  - `CONFIG_TARGET_ROOTFS_UBI`（全档，eMMC 机型用不上）
  - `CONFIG_ECM_INTERFACE_{BOND,BRIDGE,GRE_TAP,GRE_TUN,PPPOE,VLAN}`（全档，6 个）
  - `CONFIG_WPA_MBEDTLS_CRYPTO` / `WPA_11R_SUPPORT` / `WPA_11KV_SUPPORT`（基准/minimal/full）
  - `CONFIG_PACKAGE_ath11k-firmware-default`（注释里"default"不成立；好在 `ipq6018` 已选中）
  - `CONFIG_PACKAGE_kmod-crypto-aes` / `kmod-crypto-sha2`（全档）
  - `CONFIG_PACKAGE_kmod-tunnel4`、`kmod-sqm`、`watchdog`、`coreutils-xxd`（基准/full/NoWiFi）
  - `CONFIG_PACKAGE_mtr`（仅 full）
  - `CONFIG_PACKAGE_luci-app-accesscontrol`、`luci-app-filetransfer`（full）

  **极简档 `=y` 幽灵恰好 16 个**，与报告数字完全吻合，说明 mimo 的清单对应当前仓库状态、准确无误。

- **3.2 符号存在但未生效（部分确认）**：
  - `CONFIG_CCACHE`：已确认（见二·3）。
  - `CONFIG_PACKAGE_xz → 需 xz-utils`、`CONFIG_TARGET_IMAGES_GZIP → 依赖 EXT4FS`、`CONFIG_PACKAGE_libustream-mbedtls → 沦为 =m`：这三条属于"defconfig 行为"，需源码跑一遍才能坐实。其中 **`xz` 一项我存疑**——OpenWrt 中 `CONFIG_PACKAGE_xz` 通常是合法独立包（提供 `/usr/bin/xz`），未必依赖 `xz-utils`；建议以源码实测为准，不要直接照改。

### 四、workflow 小毛病（全部确认）

1. **`manifest_file` 死参数**：`workflow_call` 声明 `manifest_file`（行 30-33），入口也传了 `manifest_file: libwrt-qualcommax-ipq60xx.manifest`（行 148），但 Organize 步骤（行 537）只用 `${ARTIFACT_PREFIX}.manifest` 重命名，从未读取该输入。→ 死参数，可删。
2. **"剔除本分支不存在的符号"循环空转**：该循环在 `make defconfig` 之后执行，此时未知符号已被 kconfig 清掉，同一符号不可能同时 `=y` 与 `# ... is not set`，条件永不成立 → 纯空转。要真校验，得在 defconfig **前/后**做 symbol diff（即 mimo 用的方法）。无害但误导。
3. **`SONAME="${REPO_URL##*/}"` 取空串**：该步骤（Generate Variables）只注入了 `CONFIG_FILE`/`ARTIFACT_PREFIX`，未注入 `REPO_URL`，故 `SONAME` 为空；且后续未使用。无害。

---

## 我无法独立坐实的部分

- 各档"=y 输入 / 实际生效 / 幽灵 / 依赖隐藏"的**精确拆分数字**（minimal 72/52/16/4 等）：依赖 `make defconfig` 的真实输出，需 clone 源码。我仅静态确认符号存在，数量级与报告吻合（极简 16 幽灵已逐个数对）。
- 3.2 中 `xz` / `GZIP` / `libustream` 三条的 defconfig 行为。

---

## 建议

1. **认可优先级**：先修 Cleanup（二·1，用上面"同时排除两 key"的修正版）→ 补 `CONFIG_DEVEL=y`（二·3）→ 清理幽灵符号后 `python3 configs/_gen_profiles.py` 重生派生档。
2. **不必修"诊断分支权限"（二·2）**：它本来就能用，mimo 误判；若洁癖可加注释。
3. manifest_file / 剔除循环 / SONAME 属洁癖项，顺手清。
4. 若想彻底坐实 3.2 与拆分数字，可在 **D 盘** clone 源码跑一次 `make defconfig` 比对（C 盘空间不足，切勿在 C 盘操作）。
