// 데모 모드용 사진 플레이스홀더(SVG)를 public/demo 에 만든다. 실제 아동 사진은 쓰지 않는다.
//   node scripts/gen-demo-images.mjs
//
// 파일명 규칙: photo-NN.svg (NN = 01~20, lib/demo/data.ts 의 사진 순서와 같음)
// CC0 이미지로 바꿀 때는 같은 번호로 photo-NN.jpg 를 넣고 lib/demo/data.ts 의 DEMO_IMG_EXT 를 "jpg" 로 바꾼다.
// 결과물은 저장소에 커밋해 두므로 배포 때 이 스크립트를 돌릴 필요는 없다.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const W = 800;
const H = 600;

// [활동, 변형] — normal | blur(흔들림) | dark(어두움). 순서가 곧 photo-NN 번호
const SPECS = [
  ["미술", "normal"], ["미술", "normal"], ["미술", "blur"], ["미술", "normal"], ["미술", "normal"],
  ["바깥놀이", "normal"], ["바깥놀이", "normal"], ["바깥놀이", "dark"],
  ["음악·율동", "normal"], ["음악·율동", "normal"], ["음악·율동", "normal"], ["음악·율동", "blur"],
  ["급식", "normal"], ["급식", "normal"],
  ["과학·탐구", "normal"], ["과학·탐구", "normal"], ["과학·탐구", "normal"], ["과학·탐구", "dark"],
  ["책읽기", "normal"], ["책읽기", "normal"],
];

const PALETTE = {
  미술: ["#FCE3C8", "#F2A65A", "#E36B4F", "#5B8DEF", "#F7D046"],
  바깥놀이: ["#DDF2DC", "#7BC47F", "#3E9A59", "#F7C948", "#8FD3F4"],
  "음악·율동": ["#EEE4F8", "#B48EDB", "#7D55B8", "#F28FB1", "#FFFFFF"],
  급식: ["#FFF6D6", "#F6D365", "#E8A33D", "#7BC47F", "#E36B4F"],
  "과학·탐구": ["#DDEFFA", "#5DADE2", "#2E77B8", "#7EE0C3", "#F7D046"],
  책읽기: ["#FBE3E4", "#E57F84", "#B8545B", "#5B8DEF", "#F7C948"],
};

function rng(seed) {
  let s = seed * 9301 + 49297;
  return () => ((s = (s * 9301 + 49297) % 233280) / 233280);
}

function shapes(activity, c, r) {
  const out = [];
  const R = (a, b) => a + r() * (b - a);
  switch (activity) {
    case "미술": // 물감 얼룩 + 붓 자국
      for (let i = 0; i < 6; i++) out.push(`<circle cx="${R(80, 720)}" cy="${R(80, 520)}" r="${R(30, 90)}" fill="${c[1 + (i % 4)]}" opacity="0.85"/>`);
      for (let i = 0; i < 3; i++)
        out.push(`<path d="M${R(50, 300)} ${R(350, 550)} Q ${R(300, 500)} ${R(100, 300)} ${R(500, 750)} ${R(300, 550)}" stroke="${c[2 + i]}" stroke-width="${R(18, 30)}" fill="none" stroke-linecap="round"/>`);
      break;
    case "바깥놀이": // 해 + 언덕 + 공
      out.push(`<circle cx="${R(560, 700)}" cy="${R(90, 150)}" r="60" fill="${c[3]}"/>`);
      out.push(`<ellipse cx="${R(150, 300)}" cy="600" rx="420" ry="${R(170, 230)}" fill="${c[1]}"/>`);
      out.push(`<ellipse cx="${R(550, 700)}" cy="620" rx="380" ry="${R(150, 200)}" fill="${c[2]}"/>`);
      for (let i = 0; i < 2; i++) out.push(`<circle cx="${R(200, 600)}" cy="${R(400, 470)}" r="${R(22, 34)}" fill="${c[4]}" stroke="#fff" stroke-width="6"/>`);
      break;
    case "음악·율동": // 음표 + 물결
      for (let i = 0; i < 5; i++) {
        const x = R(80, 700), y = R(200, 480), s = R(0.8, 1.4);
        out.push(`<g transform="translate(${x} ${y}) scale(${s})" fill="${c[1 + (i % 3)]}"><ellipse cx="0" cy="0" rx="26" ry="19" transform="rotate(-20)"/><rect x="20" y="-110" width="8" height="110"/><path d="M28 -110 q 40 20 30 60 q -5 -30 -30 -35z"/></g>`);
      }
      out.push(`<path d="M0 ${R(110, 160)} C 200 60, 400 220, 800 100" stroke="${c[3]}" stroke-width="14" fill="none" opacity="0.7"/>`);
      break;
    case "급식": // 식판 + 그릇
      out.push(`<rect x="130" y="${R(130, 170)}" width="540" height="320" rx="40" fill="${c[4] === "#E36B4F" ? "#fff" : c[4]}" stroke="${c[2]}" stroke-width="10"/>`);
      out.push(`<circle cx="${R(260, 290)}" cy="320" r="85" fill="${c[1]}"/>`);
      out.push(`<circle cx="${R(510, 540)}" cy="280" r="65" fill="${c[3]}"/>`);
      out.push(`<rect x="${R(430, 460)}" y="370" width="170" height="60" rx="20" fill="${c[4]}"/>`);
      break;
    case "과학·탐구": // 플라스크 + 거품 + 돋보기
      out.push(`<path d="M${R(220, 280)} 120 h80 v120 l90 200 h-260 l90 -200z" fill="${c[3]}" stroke="${c[2]}" stroke-width="10" stroke-linejoin="round"/>`);
      for (let i = 0; i < 7; i++) out.push(`<circle cx="${R(150, 450)}" cy="${R(60, 300)}" r="${R(8, 24)}" fill="none" stroke="${c[1]}" stroke-width="6"/>`);
      out.push(`<circle cx="${R(540, 600)}" cy="${R(250, 320)}" r="80" fill="#ffffff88" stroke="${c[2]}" stroke-width="14"/>`);
      out.push(`<rect x="620" y="360" width="26" height="130" rx="10" fill="${c[2]}" transform="rotate(-40 633 425)"/>`);
      break;
    case "책읽기": // 책꽂이 + 펼친 책
      for (let i = 0; i < 7; i++) out.push(`<rect x="${90 + i * 48}" y="${R(110, 160)}" width="40" height="${R(170, 230)}" rx="6" fill="${c[1 + (i % 4)]}"/>`);
      out.push(`<path d="M420 430 q 90 -50 180 0 v-180 q -90 -50 -180 0z" fill="#fff" stroke="${c[2]}" stroke-width="8"/>`);
      out.push(`<path d="M600 430 q 90 -50 160 0 v-180 q -70 -50 -160 0z" fill="#fff" stroke="${c[2]}" stroke-width="8"/>`);
      break;
  }
  return out.join("\n  ");
}

function svg(n, activity, variant) {
  const c = PALETTE[activity];
  const r = rng(n);
  const filter =
    variant === "blur" ? `<filter id="b"><feGaussianBlur stdDeviation="9"/></filter>` : "";
  const body = shapes(activity, c, r);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<!-- KidsLog 데모 플레이스홀더 #${n} (${activity}, ${variant}) — 실제 사진 아님 -->
<defs>
  <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c[0]}"/><stop offset="1" stop-color="#ffffff"/></linearGradient>
  ${filter}
</defs>
<rect width="${W}" height="${H}" fill="url(#bg)"/>
<g${variant === "blur" ? ' filter="url(#b)"' : ""}>
  ${body}
</g>
${variant === "dark" ? `<rect width="${W}" height="${H}" fill="#000" opacity="0.55"/>` : ""}
<text x="${W / 2}" y="${H - 80}" text-anchor="middle" font-family="sans-serif" font-size="26" font-weight="700" fill="#00000055">DEMO · ${activity}</text>
</svg>
`;
}

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dst = join(root, "public/demo");
mkdirSync(dst, { recursive: true });
SPECS.forEach(([activity, variant], i) => {
  const n = String(i + 1).padStart(2, "0");
  writeFileSync(join(dst, `photo-${n}.svg`), svg(i + 1, activity, variant));
});
console.log(`wrote ${SPECS.length} demo images ->`, dst);
