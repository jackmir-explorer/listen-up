#!/usr/bin/env bash
# listen-up.html → www/index.html 생성 (Capacitor webDir & GitHub Pages 공용)
#
# 단일 파일(listen-up.html)이 소스의 진실이고, www/ 는 빌드 산출물(.gitignore).
# 배포 시 호스팅한 백엔드 주소를 주입하려면 LISTENUP_API_BASE 를 넘긴다:
#
#   LISTENUP_API_BASE="https://my-listen-up-api.onrender.com" bash scripts/build-www.sh
#
# 비워두면 API_BASE 는 앱 기본 로직(같은 출처/localStorage/네이티브 localhost)을 따른다.
set -euo pipefail
cd "$(dirname "$0")/.."   # 리포 루트 (scripts/ 의 한 단계 위)

API="${LISTENUP_API_BASE:-}"

node -e '
  const fs = require("fs");
  const src = fs.readFileSync("listen-up.html", "utf8");
  const api = process.env.LISTENUP_API_BASE || "";
  const inject = api
    ? `<script>window.LISTEN_UP_API_BASE=${JSON.stringify(api)};</script>`
    : "";
  if (!src.includes("<!--__API_BASE__-->")) {
    console.error("✖ listen-up.html 에 <!--__API_BASE__--> 주입 지점이 없습니다.");
    process.exit(1);
  }
  fs.mkdirSync("www", { recursive: true });
  fs.writeFileSync("www/index.html", src.replace("<!--__API_BASE__-->", inject));
'

echo "✔ www/index.html 생성 — API_BASE='${API:-<앱 기본값(같은 출처/localhost)>}'"
