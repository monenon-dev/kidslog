// 브라우저 안에서만 도는 영상 처리 도우미. 아이 영상은 서버로 가지 않는다.

export const OUT_W = 1280;
export const OUT_H = 720;
export const FPS = 30;
export const MAX_CLIPS = 15;
export const MAX_CLIP_SEC = 60;
export const MAX_CLIP_MB = 300;
export const FFMPEG_CORE = "https://unpkg.com/@ffmpeg/core@0.12.10/dist/esm";

// 상업적 이용이 허용된 SIL OFL 한글 글꼴 (google/fonts 저장소)
export const FONTS = [
  { id: "jua", label: "주아 (둥근)", url: "https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/jua/Jua-Regular.ttf" },
  { id: "dohyeon", label: "도현 (또렷한)", url: "https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/dohyeon/DoHyeon-Regular.ttf" },
  { id: "nanum", label: "나눔고딕 Bold", url: "https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/nanumgothic/NanumGothic-Bold.ttf" },
] as const;

/**
 * 내장 배경음: ffmpeg aevalsrc로 즉석 합성한 단순 멜로디라 저작권 문제가 없다.
 * 실제 음원을 추가할 때는 CC0 등 상업적 이용 가능 라이선스만 쓰고 출처를 README에 남긴다.
 */
export const MUSIC_PRESETS = [
  { id: "bright", label: "밝은 멜로디 (합성음)", base: 523.25, step: 0.4, semis: [0, 4, 7, 9, 12, 9, 7, 4] },
  { id: "calm", label: "잔잔한 멜로디 (합성음)", base: 392.0, step: 0.75, semis: [0, 7, 4, 7, 2, 7, 4, 7] },
] as const;

export function musicExpr(preset: (typeof MUSIC_PRESETS)[number]): string {
  const n = preset.semis.length;
  const idx = `mod(floor(t/${preset.step}),${n})`;
  // 배열 인덱싱이 없으니 if(eq())로 반음 값을 고른다
  let semi = String(preset.semis[n - 1]);
  for (let i = n - 2; i >= 0; i--) semi = `if(eq(${idx},${i}),${preset.semis[i]},${semi})`;
  const freq = `${preset.base}*pow(2,(${semi})/12)`;
  const env = `sin(PI*mod(t,${preset.step})/${preset.step})`; // 음 경계에서 0 → 끊김 소리 방지
  const bass = `0.08*sin(2*PI*${preset.base / 4}*t)`;
  return `0.18*${env}*sin(2*PI*${freq}*t)+${bass}`;
}

export function videoDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const v = document.createElement("video");
    v.preload = "metadata";
    v.muted = true;
    const url = URL.createObjectURL(file);
    v.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      resolve(Number.isFinite(v.duration) ? v.duration : 0);
    };
    v.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(`${file.name}: 브라우저가 읽을 수 없는 영상입니다`));
    };
    v.src = url;
  });
}

export type Frame = { time: number; dataUrl: string; score: number; sharpness: number; brightness: number };

/** 프레임 점수: 선명도(Laplacian 분산) + 적정 밝기 + 색감. 썸네일 추천용 휴리스틱. */
function scoreFrame(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const { data } = ctx.getImageData(0, 0, w, h);
  const gray = new Float32Array(w * h);
  let sum = 0;
  let sat = 0;
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const y = 0.299 * r + 0.587 * g + 0.114 * b;
    gray[p] = y;
    sum += y;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    sat += mx ? (mx - mn) / mx : 0;
  }
  const n = w * h;
  let lapSum = 0, lapSq = 0, cnt = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const l = gray[i - 1] + gray[i + 1] + gray[i - w] + gray[i + w] - 4 * gray[i];
      lapSum += l;
      lapSq += l * l;
      cnt++;
    }
  }
  const mean = lapSum / cnt;
  const sharpness = lapSq / cnt - mean * mean;
  const brightness = sum / n;
  const sharpScore = Math.min(1, Math.max(0, (Math.log10(sharpness + 1) - 1.3) / 1.2));
  const brightScore = 1 - Math.min(1, Math.abs(brightness - 135) / 110);
  const satScore = Math.min(1, (sat / n) / 0.45);
  return { sharpness, brightness, score: 0.55 * sharpScore + 0.3 * brightScore + 0.15 * satScore };
}

export async function sampleFrames(videoUrl: string, times: number[]): Promise<Frame[]> {
  const v = document.createElement("video");
  v.muted = true;
  v.src = videoUrl;
  await new Promise<void>((res, rej) => {
    v.onloadeddata = () => res();
    v.onerror = () => rej(new Error("미리보기 영상을 열 수 없습니다"));
  });
  const full = document.createElement("canvas");
  full.width = OUT_W / 2;
  full.height = OUT_H / 2;
  const small = document.createElement("canvas");
  small.width = 256;
  small.height = 144;
  const fctx = full.getContext("2d")!;
  const sctx = small.getContext("2d", { willReadFrequently: true })!;
  const out: Frame[] = [];
  for (const t of times) {
    await new Promise<void>((res) => {
      v.onseeked = () => res();
      v.currentTime = Math.min(Math.max(0, t), Math.max(0, v.duration - 0.1));
    });
    fctx.drawImage(v, 0, 0, full.width, full.height);
    sctx.drawImage(v, 0, 0, small.width, small.height);
    out.push({ time: t, dataUrl: full.toDataURL("image/jpeg", 0.85), ...scoreFrame(sctx, small.width, small.height) });
  }
  return out;
}

/** 썸네일: 선택한 프레임 + 제목 텍스트. 1280×720 PNG */
export async function renderThumbnail(frameUrl: string, title: string, fontFamily: string): Promise<string> {
  const img = new Image();
  img.src = frameUrl;
  await img.decode();
  const c = document.createElement("canvas");
  c.width = OUT_W;
  c.height = OUT_H;
  const ctx = c.getContext("2d")!;
  ctx.drawImage(img, 0, 0, OUT_W, OUT_H);
  if (title.trim()) {
    const grad = ctx.createLinearGradient(0, OUT_H * 0.55, 0, OUT_H);
    grad.addColorStop(0, "rgba(0,0,0,0)");
    grad.addColorStop(1, "rgba(0,0,0,0.65)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, OUT_H * 0.55, OUT_W, OUT_H * 0.45);
    let size = 96;
    ctx.font = `${size}px "${fontFamily}"`;
    while (ctx.measureText(title).width > OUT_W - 120 && size > 40) {
      size -= 4;
      ctx.font = `${size}px "${fontFamily}"`;
    }
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.lineWidth = Math.round(size / 8);
    ctx.strokeStyle = "rgba(0,0,0,0.7)";
    ctx.strokeText(title, OUT_W / 2, OUT_H - 60);
    ctx.fillStyle = "#fff";
    ctx.fillText(title, OUT_W / 2, OUT_H - 60);
  }
  return c.toDataURL("image/png");
}
