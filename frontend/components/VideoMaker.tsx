"use client";

import type { FFmpeg } from "@ffmpeg/ffmpeg";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import type { Klass, VideoRecord } from "@/lib/types";
import {
  FFMPEG_CORE,
  FONTS,
  FPS,
  MAX_CLIP_MB,
  MAX_CLIP_SEC,
  MAX_CLIPS,
  MUSIC_PRESETS,
  OUT_H,
  OUT_W,
  musicExpr,
  renderThumbnail,
  sampleFrames,
  videoDuration,
  type Frame,
} from "@/lib/video";

type Clip = { key: string; file: File; duration: number; subtitle: string };
type MusicChoice = "none" | (typeof MUSIC_PRESETS)[number]["id"] | "file";

let ffmpegPromise: Promise<FFmpeg> | null = null;
async function getFFmpeg(): Promise<FFmpeg> {
  ffmpegPromise ??= (async () => {
    const [{ FFmpeg }, { toBlobURL }] = await Promise.all([import("@ffmpeg/ffmpeg"), import("@ffmpeg/util")]);
    const ff = new FFmpeg();
    await ff.load({
      // 번들된 워커는 core 동적 import가 깨지므로 public/ffmpeg 의 원본 워커를 쓴다 (scripts/copy-ffmpeg.mjs)
      classWorkerURL: new URL("/ffmpeg/worker.js", window.location.href).href,
      coreURL: await toBlobURL(`${FFMPEG_CORE}/ffmpeg-core.js`, "text/javascript"),
      wasmURL: await toBlobURL(`${FFMPEG_CORE}/ffmpeg-core.wasm`, "application/wasm"),
    });
    return ff;
  })().catch((e) => {
    ffmpegPromise = null;
    throw e;
  });
  return ffmpegPromise;
}

const fontCache = new Map<string, Uint8Array>();
async function loadFont(id: string): Promise<Uint8Array> {
  const f = FONTS.find((x) => x.id === id)!;
  if (!fontCache.has(id)) {
    const r = await fetch(f.url);
    if (!r.ok) throw new Error("글꼴을 불러오지 못했습니다");
    const buf = new Uint8Array(await r.arrayBuffer());
    fontCache.set(id, buf);
    // 썸네일 캔버스에서도 같은 글꼴 사용
    const face = new FontFace(`kl-${id}`, buf.slice().buffer);
    await face.load();
    document.fonts.add(face);
  }
  return fontCache.get(id)!;
}

const fmtSec = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;

export function VideoMaker({ klass }: { klass: Klass }) {
  const [clips, setClips] = useState<Clip[]>([]);
  const [title, setTitle] = useState("");
  const [maxSec, setMaxSec] = useState(15);
  const [font, setFont] = useState<string>(FONTS[0].id);
  const [music, setMusic] = useState<MusicChoice>("bright");
  const [musicFile, setMusicFile] = useState<File | null>(null);
  const [stage, setStage] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [output, setOutput] = useState<{ url: string; seconds: number; ms: number; mb: number } | null>(null);
  const [frames, setFrames] = useState<Frame[]>([]);
  const [thumb, setThumb] = useState<string | null>(null);
  const [history, setHistory] = useState<VideoRecord[]>([]);
  const logRef = useRef<string[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);
  const pendingSubs = useRef<string[]>([]);

  useEffect(() => {
    api<VideoRecord[]>(`/videos?class_id=${klass.id}`).then(setHistory).catch(() => {});
    // 묶음·문구 탭에서 보낸 자막
    try {
      const raw = sessionStorage.getItem("kidslog:subtitles");
      if (raw) {
        const { title: t, lines } = JSON.parse(raw) as { title: string; lines: string[] };
        setTitle((x) => x || t);
        pendingSubs.current = lines;
      }
    } catch {}
  }, [klass.id]);
  useEffect(() => () => void (output && URL.revokeObjectURL(output.url)), [output]);

  async function addFiles(list: FileList | null) {
    if (!list) return;
    setError(null);
    const next: Clip[] = [];
    for (const file of Array.from(list)) {
      if (!file.type.startsWith("video/")) continue;
      if (clips.length + next.length >= MAX_CLIPS) {
        setError(`클립은 최대 ${MAX_CLIPS}개까지 넣을 수 있습니다`);
        break;
      }
      if (file.size > MAX_CLIP_MB * 1024 * 1024) {
        setError(`${file.name}: ${MAX_CLIP_MB}MB 이하 클립만 넣을 수 있습니다`);
        continue;
      }
      try {
        const duration = await videoDuration(file);
        const idx = clips.length + next.length;
        next.push({ key: `${file.name}-${file.lastModified}-${idx}`, file, duration, subtitle: pendingSubs.current[idx] ?? "" });
      } catch (e) {
        setError(e instanceof Error ? e.message : "읽기 실패");
      }
    }
    setClips((c) => [...c, ...next]);
  }

  const move = (i: number, d: number) =>
    setClips((c) => {
      const j = i + d;
      if (j < 0 || j >= c.length) return c;
      const x = [...c];
      [x[i], x[j]] = [x[j], x[i]];
      return x;
    });

  const clipLen = (c: Clip) => Math.min(c.duration || maxSec, maxSec);
  const totalSec = clips.reduce((s, c) => s + clipLen(c), 0);
  const totalMb = clips.reduce((s, c) => s + c.file.size, 0) / 1024 / 1024;

  async function make() {
    if (!clips.length) return;
    setError(null);
    setOutput(null);
    setFrames([]);
    setThumb(null);
    logRef.current = [];
    const started = performance.now();
    let ff: FFmpeg;
    try {
      setStage("영상 도구 불러오는 중 (처음 한 번, 약 30MB)…");
      ff = await getFFmpeg();
    } catch {
      setStage(null);
      setError("영상 도구를 불러오지 못했습니다. 네트워크를 확인해 주세요.");
      return;
    }
    const onLog = ({ message }: { message: string }) => {
      logRef.current.push(message);
      if (logRef.current.length > 40) logRef.current.shift();
    };
    let base = 0;
    let span = 1;
    const onProgress = ({ progress: p }: { progress: number }) => setProgress(Math.min(1, base + span * Math.max(0, Math.min(1, p))));
    ff.on("log", onLog);
    ff.on("progress", onProgress);
    const written: string[] = [];
    const write = async (name: string, data: Uint8Array | string) => {
      await ff.writeFile(name, data);
      written.push(name);
    };
    try {
      const { fetchFile } = await import("@ffmpeg/util");
      setStage("글꼴 준비 중…");
      await write("font.ttf", await loadFont(font));

      const n = clips.length;
      const parts: string[] = [];
      // 1) 클립별: 길이 자르기 → 720p 맞춤 → 원본 소리 제거 → 자막
      for (let i = 0; i < n; i++) {
        const c = clips[i];
        setStage(`클립 ${i + 1}/${n} 변환 중…`);
        base = (i / n) * 0.85;
        span = 0.85 / n;
        const input = `in_${i}`;
        await ff.writeFile(input, await fetchFile(c.file));
        const filters = [
          `scale=${OUT_W}:${OUT_H}:force_original_aspect_ratio=decrease`,
          `pad=${OUT_W}:${OUT_H}:(ow-iw)/2:(oh-ih)/2:color=black`,
          "setsar=1",
          `fps=${FPS}`,
        ];
        if (c.subtitle.trim()) {
          await write(`sub_${i}.txt`, c.subtitle.trim());
          filters.push(
            `drawtext=fontfile=/font.ttf:textfile=/sub_${i}.txt:fontsize=52:fontcolor=white:box=1:boxcolor=black@0.45:boxborderw=20:x=(w-text_w)/2:y=h-text_h-56`,
          );
        }
        if (i === 0 && title.trim()) {
          await write("title.txt", title.trim());
          filters.push(
            `drawtext=fontfile=/font.ttf:textfile=/title.txt:fontsize=76:fontcolor=white:borderw=5:bordercolor=black@0.6:x=(w-text_w)/2:y=(h-text_h)/2:enable='lt(t,3)'`,
          );
        }
        const part = `part_${i}.mp4`;
        const code = await ff.exec([
          "-i", input,
          "-t", String(clipLen(c)),
          "-an",
          "-vf", filters.join(","),
          "-c:v", "libx264", "-preset", "ultrafast", "-crf", "26", "-pix_fmt", "yuv420p",
          part,
        ]);
        await ff.deleteFile(input);
        if (code !== 0) throw new Error(`클립 ${i + 1} 변환 실패 (${c.file.name})`);
        written.push(part);
        parts.push(part);
      }

      // 2) 합치기 (같은 규격이라 재인코딩 없이 이어 붙임)
      setStage("클립 합치는 중…");
      base = 0.85;
      span = 0.05;
      await write("list.txt", parts.map((p) => `file '${p}'`).join("\n"));
      if ((await ff.exec(["-f", "concat", "-safe", "0", "-i", "list.txt", "-c", "copy", "merged.mp4"])) !== 0) throw new Error("합치기 실패");
      written.push("merged.mp4");

      // 3) 배경음악
      let final = "merged.mp4";
      const total = totalSec;
      if (music !== "none") {
        setStage("배경음악 넣는 중…");
        base = 0.9;
        span = 0.1;
        const fade = `afade=t=in:d=1,afade=t=out:st=${Math.max(0, total - 2).toFixed(2)}:d=2`;
        let audioIn: string[];
        if (music === "file") {
          if (!musicFile) throw new Error("배경음악 파일을 골라 주세요");
          await write("music_in", await fetchFile(musicFile));
          audioIn = ["-stream_loop", "-1", "-i", "music_in"];
        } else {
          const preset = MUSIC_PRESETS.find((m) => m.id === music)!;
          audioIn = ["-f", "lavfi", "-t", total.toFixed(2), "-i", `aevalsrc='${musicExpr(preset)}':s=44100`];
        }
        const code = await ff.exec([
          "-i", "merged.mp4", ...audioIn,
          "-map", "0:v", "-map", "1:a",
          "-c:v", "copy", "-c:a", "aac", "-b:a", "128k",
          "-af", `${fade},volume=0.8`,
          "-shortest",
          "out.mp4",
        ]);
        if (code !== 0) throw new Error("배경음악 넣기 실패");
        written.push("out.mp4");
        final = "out.mp4";
      }

      const data = (await ff.readFile(final)) as Uint8Array;
      const blob = new Blob([data.slice().buffer], { type: "video/mp4" });
      const url = URL.createObjectURL(blob);
      const ms = Math.round(performance.now() - started);
      setOutput({ url, seconds: total, ms, mb: blob.size / 1024 / 1024 });
      setProgress(1);

      // 4) 썸네일 후보: 각 클립 중간 + 앞부분
      setStage("썸네일 후보 고르는 중…");
      const times: number[] = [];
      let acc = 0;
      for (const c of clips) {
        const len = clipLen(c);
        times.push(acc + len * 0.5);
        acc += len;
      }
      if (times.length < 4) times.push(...[0.25, 0.75].map((r) => total * r));
      const fr = (await sampleFrames(url, times.sort((a, b) => a - b))).sort((a, b) => b.score - a.score);
      setFrames(fr);
      if (fr[0]) setThumb(await renderThumbnail(fr[0].dataUrl, title, `kl-${font}`));

      // 5) 성능 기록 (영상 파일은 올리지 않고 숫자만)
      const rec = await api<VideoRecord>("/videos", {
        method: "POST",
        json: {
          class_id: klass.id,
          title: title.slice(0, 100),
          clip_count: clips.length,
          input_total_mb: Math.round(totalMb * 10) / 10,
          output_seconds: Math.round(total * 10) / 10,
          processing_ms: ms,
          resolution: `${OUT_W}x${OUT_H}`,
          user_agent: navigator.userAgent.slice(0, 300),
        },
      }).catch(() => null);
      if (rec) setHistory((h) => [rec, ...h]);
      setStage(null);
    } catch (e) {
      setStage(null);
      const tail = logRef.current.slice(-3).join(" / ");
      setError(`${e instanceof Error ? e.message : "영상 만들기 실패"}${tail ? ` — ${tail}` : ""}`);
    } finally {
      ff.off("log", onLog);
      ff.off("progress", onProgress);
      for (const f of written) await ff.deleteFile(f).catch(() => {});
    }
  }

  const busy = stage !== null;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
      <section className="space-y-4">
        <div className="card p-5">
          <div className="flex flex-wrap items-center gap-3">
            <button className="btn-primary" disabled={busy} onClick={() => fileInput.current?.click()}>
              클립 추가
            </button>
            <span className="text-sm text-ink-2">
              영상은 이 브라우저 안에서만 처리되고 서버로 올라가지 않습니다. 최대 {MAX_CLIPS}개, 클립당 {MAX_CLIP_MB}MB.
            </span>
            <input ref={fileInput} type="file" accept="video/*" multiple hidden onChange={(e) => (addFiles(e.target.files), (e.target.value = ""))} />
          </div>
          {clips.length > 0 && (
            <ol className="mt-4 space-y-2">
              {clips.map((c, i) => (
                <li key={c.key} className="flex flex-wrap items-center gap-2 rounded-lg border border-line p-2">
                  <span className="w-6 text-center text-sm font-semibold text-ink-3">{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm">{c.file.name}</div>
                    <div className="text-xs text-ink-3">
                      {fmtSec(c.duration)} → {fmtSec(clipLen(c))} 사용 · {(c.file.size / 1024 / 1024).toFixed(1)}MB
                    </div>
                  </div>
                  <input
                    className="input w-full py-1 sm:w-64"
                    placeholder="이 클립 자막 (선택)"
                    value={c.subtitle}
                    maxLength={40}
                    disabled={busy}
                    onChange={(e) => setClips((cs) => cs.map((x) => (x.key === c.key ? { ...x, subtitle: e.target.value } : x)))}
                  />
                  <div className="flex gap-1">
                    <button className="btn-ghost px-2 py-1" disabled={busy || i === 0} onClick={() => move(i, -1)} aria-label="위로">
                      ↑
                    </button>
                    <button className="btn-ghost px-2 py-1" disabled={busy || i === clips.length - 1} onClick={() => move(i, 1)} aria-label="아래로">
                      ↓
                    </button>
                    <button className="btn-danger px-2 py-1" disabled={busy} onClick={() => setClips((cs) => cs.filter((x) => x.key !== c.key))} aria-label="빼기">
                      ×
                    </button>
                  </div>
                </li>
              ))}
            </ol>
          )}
          {clips.length > 0 && (
            <p className="mt-3 text-sm text-ink-2">
              완성 길이 약 {fmtSec(totalSec)} · 입력 합계 {totalMb.toFixed(0)}MB
              {totalMb > 600 && <span className="ml-2 text-warn">⚠ 용량이 커서 브라우저 메모리가 부족할 수 있습니다</span>}
            </p>
          )}
        </div>

        {(busy || output || error) && (
          <div className="card space-y-3 p-5">
            {busy && (
              <>
                <div className="text-sm">{stage}</div>
                <div className="h-2 overflow-hidden rounded-full bg-paper">
                  <div className="h-full bg-brand transition-all" style={{ width: `${progress * 100}%` }} />
                </div>
                <p className="text-xs text-ink-3">처리 중에는 이 탭을 닫지 마세요.</p>
              </>
            )}
            {error && <p className="text-sm text-bad">{error}</p>}
            {output && (
              <>
                <video src={output.url} controls className="w-full rounded-lg bg-ink" poster={thumb ?? undefined} />
                <div className="flex flex-wrap items-center gap-3 text-sm">
                  <a className="btn-primary" href={output.url} download={`${title || "kidslog"}.mp4`}>
                    영상 내려받기
                  </a>
                  <span className="text-ink-2">
                    {fmtSec(output.seconds)} · {output.mb.toFixed(1)}MB · 처리 시간 <strong>{(output.ms / 1000).toFixed(1)}초</strong>
                  </span>
                </div>
              </>
            )}
          </div>
        )}

        {frames.length > 0 && (
          <div className="card space-y-3 p-5">
            <h3 className="font-semibold">썸네일 추천</h3>
            <p className="text-xs text-ink-2">선명하고 밝기가 적당한 장면 순입니다. 눌러서 바꿀 수 있어요.</p>
            <ul className="grid grid-cols-3 gap-2 sm:grid-cols-5">
              {frames.map((f, i) => (
                <li key={f.time}>
                  <button
                    className="relative block w-full overflow-hidden rounded-lg border border-line hover:border-brand"
                    onClick={async () => setThumb(await renderThumbnail(f.dataUrl, title, `kl-${font}`))}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={f.dataUrl} alt={`${fmtSec(f.time)} 장면`} className="aspect-video w-full object-cover" />
                    {i === 0 && <span className="absolute left-1 top-1 rounded bg-brand px-1.5 text-[11px] text-white">추천</span>}
                    <span className="absolute bottom-1 right-1 rounded bg-black/55 px-1 text-[10px] text-white">{fmtSec(f.time)}</span>
                  </button>
                </li>
              ))}
            </ul>
            {thumb && (
              <div>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={thumb} alt="썸네일" className="w-full rounded-lg border border-line" />
                <a className="btn-ghost mt-2" href={thumb} download={`${title || "kidslog"}_썸네일.png`}>
                  썸네일 내려받기
                </a>
              </div>
            )}
          </div>
        )}
      </section>

      <aside className="space-y-4">
        <div className="card space-y-4 p-5">
          <div>
            <label className="label">영상 제목 (첫 3초 + 썸네일)</label>
            <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={30} placeholder="예: 가을 숲 산책" disabled={busy} />
          </div>
          <div>
            <label className="label">클립당 최대 길이: {maxSec}초</label>
            <input type="range" min={3} max={MAX_CLIP_SEC} value={maxSec} onChange={(e) => setMaxSec(Number(e.target.value))} className="w-full" disabled={busy} />
          </div>
          <div>
            <label className="label">자막 글꼴 (SIL OFL, 상업적 이용 가능)</label>
            <select className="input" value={font} onChange={(e) => setFont(e.target.value)} disabled={busy}>
              {FONTS.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">배경음악 (원본 소리는 항상 음소거)</label>
            <select className="input" value={music} onChange={(e) => setMusic(e.target.value as MusicChoice)} disabled={busy}>
              <option value="none">없음 (무음)</option>
              {MUSIC_PRESETS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
              <option value="file">내 음원 파일</option>
            </select>
            {music === "file" && (
              <>
                <input type="file" accept="audio/*" className="mt-2 text-sm" onChange={(e) => setMusicFile(e.target.files?.[0] ?? null)} />
                <p className="mt-1 text-xs text-warn">저작권이 허용된 음원(CC0, 상업 이용 가능 등)만 사용하세요.</p>
              </>
            )}
          </div>
          <p className="text-xs text-ink-3">
            출력: {OUT_W}×{OUT_H}, {FPS}fps, H.264
          </p>
          <button className="btn-primary w-full" disabled={busy || clips.length === 0} onClick={make}>
            {busy ? "만드는 중…" : "영상 만들기"}
          </button>
        </div>

        {history.length > 0 && (
          <div className="card p-5">
            <h3 className="font-semibold">처리 시간 기록</h3>
            <p className="mt-1 text-xs text-ink-2">기기별 브라우저 처리 성능 측정용 (영상 파일은 저장하지 않음)</p>
            <table className="mt-3 w-full text-xs">
              <thead className="text-ink-3">
                <tr>
                  <th className="py-1 text-left font-normal">날짜</th>
                  <th className="text-right font-normal">클립</th>
                  <th className="text-right font-normal">입력</th>
                  <th className="text-right font-normal">결과</th>
                  <th className="text-right font-normal">처리</th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {history.slice(0, 10).map((h) => (
                  <tr key={h.id} className="border-t border-line" title={h.user_agent}>
                    <td className="py-1">{new Date(h.created_at).toLocaleDateString("ko-KR")}</td>
                    <td className="text-right">{h.clip_count}</td>
                    <td className="text-right">{h.input_total_mb.toFixed(0)}MB</td>
                    <td className="text-right">{fmtSec(h.output_seconds)}</td>
                    <td className="text-right">{(h.processing_ms / 1000).toFixed(1)}초</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </aside>
    </div>
  );
}
