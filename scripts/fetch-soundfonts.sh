#!/usr/bin/env bash
#
# 下载自托管音源(gleitz midi-js-soundfonts, MIT 许可)到 client/public/soundfonts/。
#
# 为什么自托管: 采样音色原先从 gleitz.github.io CDN 按浏览器加载——不同网络
# 可达性不同,导致"房主听到真采样、朋友听到降级合成音"的不一致。自托管后,
# 所有玩家从应用同源加载同一批采样,音色完全一致且不依赖外部网络。
#
# 音源格式: 每个乐器一个 JSON(内嵌 base64 采样),smplr 的 instrumentUrl 直接加载。
# 文件不入 git(见 .gitignore),在构建/部署时下载进 client/public,构建产物
# dist/soundfonts/ 随发布包分发(朋友侧无需访问外网)。
#
# 用法: bash scripts/fetch-soundfonts.sh [--force]

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT_DIR="$ROOT/client/public/soundfonts"
KIT="MusyngKite"
FORMAT="ogg"
BASE="https://gleitz.github.io/midi-js-soundfonts/${KIT}"

# 旋律乐器(鼓走 DrumMachine,保留 CDN+合成降级,见 instruments.ts)
INSTRUMENTS=(
  "acoustic_grand_piano"
  "electric_bass_finger"
  "muted_trumpet"
  "violin"
)

FORCE="${1:-}"

mkdir -p "$OUT_DIR"

downloaded=0
for name in "${INSTRUMENTS[@]}"; do
  dest="$OUT_DIR/${name}-${FORMAT}.js"
  if [[ "$FORCE" != "--force" && -s "$dest" ]]; then
    echo "skip $name (already present)"
    continue
  fi
  url="${BASE}/${name}-${FORMAT}.js"
  echo "fetch $name ..."
  curl -fsSL --retry 2 -o "$dest" "$url"
  size=$(du -h "$dest" | cut -f1)
  echo "  saved $size -> ${dest#${ROOT}/}"
  downloaded=$((downloaded + 1))
done

echo
if [[ $downloaded -eq 0 ]]; then
  echo "音源已就绪(${#INSTRUMENTS[@]} 个,共 $(du -sh "$OUT_DIR" | cut -f1))"
else
  echo "完成: 下载 $downloaded 个,现有 $(du -sh "$OUT_DIR" | cut -f1)"
fi

# --- TR-808 鼓机: dm.json + 全部样本(自托管) ---
DRUM_DIR="$OUT_DIR/tr808"
DRUM_NAME="TR-808"
DRUM_DM_URL="https://smpldsnds.github.io/drum-machines/${DRUM_NAME}/dm.json"
# 样本实际可用的基址是大写路径(dm.json 里的小写 baseUrl 在 CDN 上 404)
DRUM_SAMPLE_BASE="https://smpldsnds.github.io/drum-machines/${DRUM_NAME}/"

mkdir -p "$DRUM_DIR"
if [[ "$FORCE" == "--force" || ! -s "$DRUM_DIR/dm.json" ]]; then
  echo "fetch TR-808 drum machine ..."
  curl -fsSL --retry 2 -o "$DRUM_DIR/dm.json" "$DRUM_DM_URL"
  python3 - "$DRUM_DIR/dm.json" "$DRUM_DIR" "$DRUM_SAMPLE_BASE" << 'PY'
import json, os, sys, urllib.request

dm_path, out_dir, base = sys.argv[1], sys.argv[2], sys.argv[3]
d = json.load(open(dm_path))
samples = d.get('samples', [])
ok = 0
for s in samples:
    rel = s + '.ogg'
    dest = os.path.join(out_dir, rel)
    if os.path.exists(dest) and os.path.getsize(dest) > 0:
        ok += 1
        continue
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    try:
        data = urllib.request.urlopen(base + rel, timeout=20).read()
        with open(dest, 'wb') as f:
            f.write(data)
        ok += 1
    except Exception as e:
        print(f'  failed {rel}: {e}')
print(f'TR-808 samples: {ok}/{len(samples)}')
PY
  echo "TR-808 -> ${DRUM_DIR#${ROOT}/}"
else
  echo "skip TR-808 (already present)"
fi
echo "音源总计: $(du -sh "$OUT_DIR" | cut -f1)"
echo "提示: 音源随构建进入 dist/soundfonts/,随发布包分发;不占 git 仓库。"
