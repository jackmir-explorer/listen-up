#!/usr/bin/env bash
# GitHub Pages 배포 — listen-up.html → www/ → gh-pages 브랜치
# study-app 방식(단일 파일 + Pages). 본인 PC 에서 실행하세요.
#
#   # 호스팅한 백엔드 주소를 함께 주입(권장):
#   LISTENUP_API_BASE="https://my-listen-up-api.onrender.com" bash deploy.sh
#
# 배포 후 한 번만: 레포 Settings → Pages → Source 를 "gh-pages" 브랜치로 지정.
set -euo pipefail
cd "$(dirname "$0")"

BRANCH="gh-pages"
REMOTE="${REMOTE:-origin}"

# 1) www 빌드 (백엔드 주소 주입) + Jekyll 건너뛰기
bash scripts/build-www.sh
touch www/.nojekyll

# 2) www/ 내용만 gh-pages 로 force-push (임시 리포 사용 — 메인 작업 트리·브랜치 안 건드림)
REMOTE_URL="$(git remote get-url "$REMOTE")"
TMP="$(mktemp -d)"
cp -R www/. "$TMP"/
(
  cd "$TMP"
  git init -q
  git checkout -q -b "$BRANCH"
  git add -A
  git -c user.email="deploy@local" -c user.name="deploy" commit -q -m "Deploy $(date -u +%FT%TZ)"
  git push -q -f "$REMOTE_URL" "$BRANCH"
)
rm -rf "$TMP"

echo "✔ gh-pages 푸시 완료 → https://<your-user>.github.io/listen-up/"
