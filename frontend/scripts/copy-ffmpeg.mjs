// @ffmpeg/ffmpeg 워커는 번들러를 거치면 core 동적 import가 깨진다 (Turbopack).
// 원본 ESM 워커를 public/ffmpeg 로 복사해 classWorkerURL 로 직접 쓴다.
import { cpSync, mkdirSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "node_modules/@ffmpeg/ffmpeg/dist/esm");
const dst = join(root, "public/ffmpeg");
mkdirSync(dst, { recursive: true });
for (const f of readdirSync(src)) if (f.endsWith(".js")) cpSync(join(src, f), join(dst, f));
console.log("copied ffmpeg worker ->", dst);
