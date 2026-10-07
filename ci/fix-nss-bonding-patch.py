#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
修复 qosmio 24.10-nss 自带的 NSS ECM bonding 补丁，使其能干净地打到 Linux 6.6.141 上。

背景
----
target/linux/qualcommax/patches-6.6/
    0600-4-qca-nss-ecm-support-net-bonding-over-LAG-interface.patch

这个补丁是按较早期的 6.6.x 内核写的，内核升到 6.6.141 后有 2 个 hunk 上下文漂移，
OpenWrt 打补丁阶段直接报 `Patch failed!` → target/linux 编译失败，整条构建挂掉：

  1) drivers/net/bonding/bond_3ad.c
     老代码 `if (port->aggregator->is_active) {`
     6.6.141 改成先把 aggregator 取到局部量：`struct aggregator *aggregator = ...`
     再 `if (aggregator->is_active) {`，且下面用的是 `aggregator->aggregator_identifier`。

  2) drivers/net/bonding/bond_main.c
     老代码的 switch 里 8023AD 与 XOR 是同一个 fallthrough 分支；
     6.6.141 在 8023AD 分支里加了 `bond_should_broadcast_neighbor()` 判断 + `fallthrough;`，
     直接照搬补丁会挤出重复的 case 标签（C 不允许），必须重排。

修法不是「跳过补丁」——补丁会给 bonding 注册 ECM 回调（bond_register_cb / bond_get_id /
bond_get_tx_dev 等符号），跳过会导致后续 ECM 找不到符号。这里做的是按新内核重写这两处 hunk，
保持原有语义不变。

用法：fix-nss-bonding-patch.py <源码根目录>
幂等：已修过的补丁不会二次修改；补丁不存在或上下文不匹配则跳过（不报错）。
"""

import sys
import os
import glob

PATCH_GLOB = "target/linux/qualcommax/patches-6.6/0600-4-qca-nss-ecm-support-net-bonding-over-LAG-interface.patch"

# ---------- 1) bond_3ad.c：aggregator 局部量化后的上下文 ----------
OLD_3AD = (
    "@@ -2066,6 +2124,7 @@ static void ad_enable_collecting_distrib\n"
    " \t\t\t\t\t      bool *update_slave_arr)\n"
    " {\n"
    " \tif (port->aggregator->is_active) {\n"
    "+\t\tstruct bond_cb *lag_cb_main; /* QCA NSS ECM bonding support */\n"
    " \t\tslave_dbg(port->slave->bond->dev, port->slave->dev,\n"
    " \t\t\t  \"Enabling port %d (LAG %d)\\n\",\n"
    " \t\t\t  port->actor_port_number,\n"
)

NEW_3AD = (
    "@@ -2067,9 +2067,10 @@ static void ad_enable_collecting_distributing(struct port *port,\n"
    " \t\t\t\t\t      bool *update_slave_arr)\n"
    " {\n"
    " \tstruct aggregator *aggregator = rcu_dereference(port->aggregator);\n"
    " \n"
    " \tif (aggregator->is_active) {\n"
    "+\t\tstruct bond_cb *lag_cb_main; /* QCA NSS ECM bonding support */\n"
    " \t\tslave_dbg(port->slave->bond->dev, port->slave->dev,\n"
    " \t\t\t  \"Enabling port %d (LAG %d)\\n\",\n"
    " \t\t\t  port->actor_port_number,\n"
    " \t\t\t  aggregator->aggregator_identifier);\n"
)

# ---------- 2) bond_main.c：带 broadcast_neighbor 判断的新 switch ----------
OLD_MAIN = (
    "@@ -5496,8 +5789,9 @@ static netdev_tx_t __bond_start_xmit(str\n"
    " \t\treturn bond_xmit_roundrobin(skb, dev);\n"
    " \tcase BOND_MODE_ACTIVEBACKUP:\n"
    " \t\treturn bond_xmit_activebackup(skb, dev);\n"
    "-\tcase BOND_MODE_8023AD:\n"
    " \tcase BOND_MODE_XOR:\n"
    "+\t\treturn bond_xmit_xor(skb, dev); /* QCA NSS ECM bonding support */\n"
    "+\tcase BOND_MODE_8023AD:\n"
    " \t\treturn bond_3ad_xor_xmit(skb, dev);\n"
    " \tcase BOND_MODE_BROADCAST:\n"
    " \t\treturn bond_xmit_broadcast(skb, dev);\n"
)

NEW_MAIN = (
    "@@ -5577,8 +5577,8 @@ static netdev_tx_t __bond_start_xmit(struct sk_buff *skb,\n"
    " \tcase BOND_MODE_8023AD:\n"
    " \t\tif (bond_should_broadcast_neighbor(skb, dev))\n"
    " \t\t\treturn bond_xmit_broadcast(skb, dev, false);\n"
    "-\t\tfallthrough;\n"
    "-\tcase BOND_MODE_XOR:\n"
    "-\t\treturn bond_3ad_xor_xmit(skb, dev);\n"
    "+\t\treturn bond_3ad_xor_xmit(skb, dev);\n"
    "+\tcase BOND_MODE_XOR:\n"
    "+\t\treturn bond_xmit_xor(skb, dev); /* QCA NSS ECM bonding support */\n"
    " \tcase BOND_MODE_BROADCAST:\n"
    " \t\treturn bond_xmit_broadcast(skb, dev, true);\n"
)


def main():
    src = sys.argv[1] if len(sys.argv) > 1 else "."
    path = os.path.join(src, PATCH_GLOB)
    hits = glob.glob(path)

    if not hits:
        print("::notice::[patch-fix] 未找到 NSS bonding 补丁，跳过（内核树可能已变动）")
        return 0

    path = hits[0]
    with open(path, "r", encoding="utf-8", newline="") as f:
        text = f.read()

    changed = False
    if OLD_3AD in text:
        text = text.replace(OLD_3AD, NEW_3AD)
        changed = True
        print("  [patch-fix] bond_3ad.c hunk 已按 6.6.141 重写")
    else:
        print("  [patch-fix] bond_3ad.c hunk 无需修改（已修过或上下文不符）")

    if OLD_MAIN in text:
        text = text.replace(OLD_MAIN, NEW_MAIN)
        changed = True
        print("  [patch-fix] bond_main.c hunk 已按 6.6.141 重写")
    else:
        print("  [patch-fix] bond_main.c hunk 无需修改（已修过或上下文不符）")

    if changed:
        with open(path, "w", encoding="utf-8", newline="\n") as f:
            f.write(text)
        print("::notice::[patch-fix] 已修复 %s" % os.path.basename(path))
    return 0


if __name__ == "__main__":
    sys.exit(main())
