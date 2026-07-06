#!/usr/bin/env node
// PWA 아이콘 생성 (의존성 0: zlib 만 사용해 PNG 를 직접 인코딩)
// 디자인: 인디고→보라 그라데이션 배경 + 흰 재생 삼각형 + 소리 파형 아크 3개
//   node scripts/gen-icons.js   →  icons/icon-192.png, icon-512.png, icon-maskable-512.png
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

function crc32(buf) {
  let c, table = crc32.table;
  if (!table) {
    table = crc32.table = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c;
    }
  }
  c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = table[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePNG(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // filter: none
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// size 픽셀 아이콘 그리기. inset: 콘텐츠 축소 비율(maskable 은 0.72 로 안전영역 안에)
function draw(size, inset) {
  const px = Buffer.alloc(size * size * 4);
  const S = size / 512; // 512 기준 좌표계
  const k = inset;
  const cx = 256, cy = 256;
  // 삼각형 꼭짓점 (재생 버튼)
  const t = [[150, 156], [150, 356], [310, 256]].map(([x, y]) => [cx + (x - cx) * k, cy + (y - cy) * k]);
  const sign = (p, a, b) => (p[0] - b[0]) * (a[1] - b[1]) - (a[0] - b[0]) * (p[1] - b[1]);
  const inTri = (p) => {
    const d1 = sign(p, t[0], t[1]), d2 = sign(p, t[1], t[2]), d3 = sign(p, t[2], t[0]);
    return !(((d1 < 0) || (d2 < 0) || (d3 < 0)) && ((d1 > 0) || (d2 > 0) || (d3 > 0)));
  };
  const arcC = [cx + (310 - cx) * k, 256]; // 아크 중심 = 삼각형 꼭짓점
  const radii = [70, 118, 166].map((r) => r * k);
  const thick = 17 * k, maxAng = 0.78;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / S, v = y / S; // 512 좌표
      const g = v / 512;
      let r = Math.round(76 + (124 - 76) * g);   // #4c5fd6 → #7c3aed
      let gc = Math.round(95 + (58 - 95) * g);
      let b = Math.round(214 + (237 - 214) * g);
      let white = false;
      if (inTri([u, v])) white = true;
      else {
        const dx = u - arcC[0], dy = v - arcC[1];
        if (dx > 0) {
          const dist = Math.hypot(dx, dy), ang = Math.atan2(dy, dx);
          if (Math.abs(ang) <= maxAng)
            for (const R of radii) if (Math.abs(dist - R) <= thick / 2) { white = true; break; }
        }
      }
      const o = (y * size + x) * 4;
      if (white) { px[o] = 255; px[o + 1] = 255; px[o + 2] = 255; }
      else { px[o] = r; px[o + 1] = gc; px[o + 2] = b; }
      px[o + 3] = 255;
    }
  }
  return encodePNG(size, px);
}

const out = path.join(__dirname, "..", "icons");
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, "icon-512.png"), draw(512, 0.92));
fs.writeFileSync(path.join(out, "icon-192.png"), draw(192, 0.92));
fs.writeFileSync(path.join(out, "icon-maskable-512.png"), draw(512, 0.68));
console.log("✔ icons/ 생성: icon-192.png, icon-512.png, icon-maskable-512.png");
