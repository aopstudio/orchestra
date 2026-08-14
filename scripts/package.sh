#!/usr/bin/env bash
#
# Orchestra 发布打包脚本
#
# 产出: release/orchestra-<日期>.tar.gz —— 一个可直接运行的发布包:
#   - 完整源码(shared/server/client) + 生产构建产物(client/dist)
#   - 不含 node_modules / .git / 测试残留等运行无关文件
#
# 朋友的运行方式(见包内 docs/friend-quickstart.md):
#   tar xzf orchestra-<日期>.tar.gz && cd orchestra && npm ci && npm start
#   然后浏览器打开 http://<本机IP>:8080,局域网朋友访问同一地址即可合奏。
#
# 依赖: bash >= 4, tar, Node >= 18(朋友侧)

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

STAMP="$(date +%Y%m%d)"
OUT_DIR="$ROOT/release"
ARCHIVE="$OUT_DIR/orchestra-$STAMP.tar.gz"

echo "==> 1/3 构建客户端生产产物 (client/dist)"
npm run build

echo "==> 2/3 打包 (排除 node_modules/.git/测试产物)"
mkdir -p "$OUT_DIR"
# 先暂存到 orchestra/ 顶层目录,使解压后直接 cd orchestra 即可
STAGE="$(mktemp -d)"
mkdir -p "$STAGE/orchestra"
# 排除项说明:
#   node_modules/    依赖由朋友侧 npm ci 安装
#   .git/            版本历史不入包
#   test-results/ playwright-report/ coverage/  测试残留
#   .omo/            会话数据
#   release/         不把旧包打进新包
tar -czf - \
  --exclude='./node_modules' \
  --exclude='./.git' \
  --exclude='./.omo' \
  --exclude='./release' \
  --exclude='./test-results' \
  --exclude='./playwright-report' \
  --exclude='./coverage' \
  --exclude='./*.log' \
  . | tar -xzf - -C "$STAGE/orchestra"
tar -czf "$ARCHIVE" -C "$STAGE" orchestra
rm -rf "$STAGE"

echo "==> 3/3 完成"
echo
echo "发布包: $ARCHIVE"
echo "大小:   $(du -h "$ARCHIVE" | cut -f1)"
echo
echo "朋友侧运行:"
echo "  tar xzf $(basename "$ARCHIVE") && cd orchestra && npm ci && npm start"
echo "  浏览器打开 http://<本机IP>:8080"
