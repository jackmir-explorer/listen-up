#!/usr/bin/env node
// listen-up.html → www/index.html  (Capacitor webDir & GitHub Pages 공용, 크로스플랫폼)
//
// 보통은 백엔드 주소를 굽지 않고 앱 ⚙ 설정에서 런타임 지정합니다.
// 굳이 빌드에 굽고 싶으면:  LISTENUP_API_BASE="https://my-api" node scripts/build-www.js
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const src = fs.readFileSync(path.join(root, "listen-up.html"), "utf8");
const api = (process.env.LISTENUP_API_BASE || "").trim().replace(/\/+$/, "");
const inject = api ? `<script>window.LISTEN_UP_API_BASE=${JSON.stringify(api)};</script>` : "";

if (!src.includes("<!--__API_BASE__-->")) {
  console.error("✖ listen-up.html 에 <!--__API_BASE__--> 주입 지점이 없습니다.");
  process.exit(1);
}

const out = path.join(root, "www");
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, "index.html"), src.replace("<!--__API_BASE__-->", inject));
fs.writeFileSync(path.join(out, ".nojekyll"), ""); // Pages: Jekyll 처리 건너뛰기
console.log(`✔ www/index.html 생성 (API_BASE='${api || "<런타임: 앱 ⚙ 설정>"}')`);
