#!/usr/bin/env bash
# ==============================================
# x-bot 启动脚本
# 用法: ./start-x-bot.sh
# ==============================================
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

# 确保 eliza.json 配置存在（启用 X/Twitter 连接器）
STATE_DIR="${HOME}/.local/state/eliza"
mkdir -p "$STATE_DIR"
if [ ! -f "$STATE_DIR/eliza.json" ]; then
  echo "Creating eliza.json config..."
  cat > "$STATE_DIR/eliza.json" << 'CFGEOF'
{
  "connectors": {
    "x": {
      "enabled": true
    }
  }
}
CFGEOF
fi

# 加载 .env 变量
set -a
source .env 2>/dev/null || true
set +a

# 注入角色定义
CHARACTER_JSON=$(python3 -c "import json,sys; print(json.dumps(json.load(open('characters/x-bot.character.json'))))" 2>/dev/null || \
                 bun -e "import fs from'fs';const c=JSON.parse(fs.readFileSync('characters/x-bot.character.json','utf-8'));console.log(JSON.stringify(c))")
export ELIZA_AGENT_CHARACTER_JSON="$CHARACTER_JSON"

echo "╔══════════════════════════════════════╗"
echo "║        x-bot agent starting...       ║"
echo "╠══════════════════════════════════════╣"
echo "║ Character : x-bot                    ║"
echo "║ Dry run   : ${TWITTER_DRY_RUN:-true}                       ║"
echo "║ API       : http://localhost:${SERVER_PORT:-3000}      ║"
echo "╚══════════════════════════════════════╝"
echo ""

exec bun run --cwd packages/agent start
