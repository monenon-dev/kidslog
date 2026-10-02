"use client";

import type { FFmpeg } from "@ffmpeg/ffmpeg";
import { ArrowDown, ArrowUp, Bookmark, Check, Clapperboard, CloudCheck, CloudOff, FileVideo, HardDrive, Move, Music, Pause, PenLine, Play, RotateCcw, Send, Sparkles, TriangleAlert, Undo2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api";
import type { Klass, SubtitleDraft, VideoDraft, VideoDraftClip, VideoDraftData, VideoEditResult, VideoRecord } from "@/lib/types";
import {
  FFMPEG_CORE,
  FONTS,
  FPS,
  MAX_CLIP_MB,
  MAX_CLIP_SEC,
  MAX_CLIPS,
  DEFAULT_SUB_STYLE,
  MUSIC_PRESETS,
  OUT_H,
  OUT_W,
  SUB_COLORS,
  SUB_EFFECTS,
  SUB_MARGIN,
  SUB_POSITIONS,
  SUB_SIZES,
  musicExpr,
  renderThumbnail,
  sampleFrames,
  subStyleColors,
  subtitleFilter,
  videoDuration,
  type Frame,
  type SubStyle,
} from "@/lib/video";
import { loadPrefs, savePrefs, type VideoDefaults } from "@/lib/prefs";
import { deleteVideo, loadVideo, saveVideo, updateVideoThumb } from "@/lib/videoStore";
import { ColorPicker } from "./ColorPicker";
import { Segmented } from "./Segmented";

/** draftIdx: 저장된 편집 설정에서 몇 번째 클립이었는지 (다시 넣을 때 순서 맞추기용) */
type Clip = { key: string; file: File; duration: number; subtitle: string; draftIdx?: number };
/** 저장된 편집 설정에는 있지만 아직 파일을 다시 넣지 않은 클립 */
type MissingClip = VideoDraftClip & { idx: number };
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

/**
 * 출력 영상(1280×720) 비율 그대로 영상 위에 자막·제목을 겹쳐 보여주는 화면. cqw = 화면 폭의 1%
 * - children: 아래에 깔릴 영상 (없으면 견본 그라데이션)
 * - 자막을 끌거나(마우스·터치) 방향키로 옮기면 위치가 "custom"이 된다.
 * - onTextChange가 있으면 자막을 두 번 누르거나 Enter로 그 자리에서 글자를 고친다.
 */
function SubtitlePreview({
  text,
  placeholder,
  title,
  style,
  fontFamily,
  fontReady,
  disabled,
  onMove,
  onTextChange,
  onEditStart,
  children,
}: {
  text: string;
  placeholder?: string;
  title?: string;
  style: SubStyle;
  fontFamily: string;
  fontReady: boolean;
  disabled?: boolean;
  onMove: (at: { x: number; y: number }) => void;
  onTextChange?: (text: string) => void;
  onEditStart?: () => void;
  children?: React.ReactNode;
}) {
  const px = SUB_SIZES.find((s) => s.id === style.size)!.px;
  const { hex, back } = subStyleColors(style);
  const u = (v: number) => `${(v / OUT_W) * 100}cqw`;
  const rgba = (h: string, a: number) => `rgba(${parseInt(h.slice(1, 3), 16)},${parseInt(h.slice(3, 5), 16)},${parseInt(h.slice(5, 7), 16)},${a})`;
  const frameRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const grab = useRef<{ dx: number; dy: number; sx: number; sy: number; moved: boolean } | null>(null);
  const editRef = useRef<HTMLSpanElement>(null);
  const [editing, setEditing] = useState(false);
  const canEdit = !!onTextChange && !disabled;

  // 고치기 시작: 지금 글자를 넣고 전부 선택
  useEffect(() => {
    const el = editRef.current;
    if (!editing || !el) return;
    onEditStart?.();
    el.textContent = text;
    el.focus();
    const r = document.createRange();
    r.selectNodeContents(el);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(r);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing]);
  const finishEdit = (save: boolean) => {
    if (save) onTextChange?.((editRef.current?.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 40));
    setEditing(false);
  };

  // 자막이 화면 밖으로 나가지 않게 가운데 좌표를 자른다
  const clampAt = (x: number, y: number) => {
    const f = frameRef.current!.getBoundingClientRect();
    const t = textRef.current!.getBoundingClientRect();
    const hx = Math.min(0.5, t.width / 2 / f.width);
    const hy = Math.min(0.5, t.height / 2 / f.height);
    return { x: Math.min(1 - hx, Math.max(hx, x)), y: Math.min(1 - hy, Math.max(hy, y)) };
  };
  // 프리셋 위치일 때 현재 화면상 가운데 좌표 (끌기 시작점)
  const currentAt = () => {
    const f = frameRef.current!.getBoundingClientRect();
    const t = textRef.current!.getBoundingClientRect();
    return { x: (t.left + t.width / 2 - f.left) / f.width, y: (t.top + t.height / 2 - f.top) / f.height };
  };

  const pos =
    style.position === "custom"
      ? { left: `${style.at.x * 100}%`, top: `${style.at.y * 100}%`, transform: "translate(-50%,-50%)" }
      : style.position === "bottom"
        ? { left: "50%", bottom: u(SUB_MARGIN), transform: "translateX(-50%)" }
        : style.position === "top"
          ? { left: "50%", top: u(SUB_MARGIN), transform: "translateX(-50%)" }
          : { left: "50%", top: "50%", transform: "translate(-50%,-50%)" };

  const textStyle: React.CSSProperties = {
    fontFamily: fontReady ? `"${fontFamily}"` : undefined,
    fontSize: u(px),
    color: hex,
    ...(style.effect === "box" && { background: rgba(back, 0.45), padding: u(px * 0.38) }),
    ...(style.effect === "outline" && { WebkitTextStroke: `${u(Math.max(2, Math.round(px / 12)) * 2)} ${rgba(back, 0.85)}`, paintOrder: "stroke fill" }),
    ...(style.effect === "shadow" && { textShadow: `${u(px / 16)} ${u(px / 16)} 0 ${rgba(back, 0.6)}` }),
  };
  const empty = !text && !editing;
  // 영상 만들 때와 같은 규칙: 첫 클립 처음 3초에 제목, 자막이 가운데 근처면 제목은 위로
  const titleHigh = style.position === "middle" || (style.position === "custom" && Math.abs(style.at.y - 0.5) < 0.2);

  return (
    <div
      ref={frameRef}
      className={`relative aspect-video w-full touch-none select-none overflow-hidden rounded-lg ${children ? "bg-black" : "bg-gradient-to-br from-[#7fa7b0] via-[#c9b79a] to-[#e9a95a]"}`}
      style={{ containerType: "inline-size" }}
    >
      {children}
      {title && (
        <span
          className="pointer-events-none absolute left-1/2 -translate-x-1/2 whitespace-pre leading-none text-white"
          style={{
            top: titleHigh ? "22%" : "50%",
            transform: titleHigh ? "translateX(-50%)" : "translate(-50%,-50%)",
            fontFamily: fontReady ? `"${fontFamily}"` : undefined,
            fontSize: u(76),
            WebkitTextStroke: `${u(10)} rgba(0,0,0,0.6)`,
            paintOrder: "stroke fill",
          }}
        >
          {title}
        </span>
      )}
      <div
        className={`absolute rounded outline-offset-4 focus-visible:outline-2 focus-visible:outline-brand ${
          editing ? "outline-2 outline-brand" : disabled ? "" : "cursor-grab hover:outline-1 hover:outline-dashed hover:outline-white/80 active:cursor-grabbing"
        }`}
        style={pos}
        tabIndex={disabled || editing ? -1 : 0}
        aria-roledescription="끌어서 옮기는 자막"
        aria-label={canEdit ? "자막 (끌거나 방향키로 옮기기, 두 번 누르거나 Enter로 글자 고치기)" : "자막 위치 (끌거나 방향키로 옮기기, Shift로 크게)"}
        onPointerDown={(e) => {
          if (disabled || editing) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          const f = frameRef.current!.getBoundingClientRect();
          const at = currentAt();
          grab.current = { dx: (e.clientX - f.left) / f.width - at.x, dy: (e.clientY - f.top) / f.height - at.y, sx: e.clientX, sy: e.clientY, moved: false };
        }}
        onPointerMove={(e) => {
          const g = grab.current;
          if (!g) return;
          // 살짝 누른 것(두 번 누르기)은 옮기기로 치지 않는다
          if (!g.moved && Math.hypot(e.clientX - g.sx, e.clientY - g.sy) < 4) return;
          g.moved = true;
          const f = frameRef.current!.getBoundingClientRect();
          onMove(clampAt((e.clientX - f.left) / f.width - g.dx, (e.clientY - f.top) / f.height - g.dy));
        }}
        onPointerUp={() => (grab.current = null)}
        onPointerCancel={() => (grab.current = null)}
        onDoubleClick={() => canEdit && setEditing(true)}
        onKeyDown={(e) => {
          if (editing) return;
          if (e.key === "Enter" && canEdit) {
            e.preventDefault();
            setEditing(true);
            return;
          }
          const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
          if (!d || disabled) return;
          e.preventDefault();
          const step = e.shiftKey ? 0.05 : 0.01;
          const at = style.position === "custom" ? style.at : currentAt();
          onMove(clampAt(at.x + d[0] * step, at.y + d[1] * step));
        }}
      >
        {editing ? (
          <span
            key="edit"
            ref={(el) => {
              editRef.current = el;
              textRef.current = el;
            }}
            contentEditable="plaintext-only"
            suppressContentEditableWarning
            role="textbox"
            aria-label="자막 글자"
            className="block min-w-[2em] cursor-text select-text whitespace-pre leading-none outline-none"
            style={textStyle}
            onBlur={() => finishEdit(true)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                finishEdit(true);
              } else if (e.key === "Escape") {
                e.preventDefault();
                finishEdit(false);
              }
            }}
          />
        ) : (
          <span key="view" ref={textRef} className={`block whitespace-pre leading-none ${empty ? "opacity-60" : ""}`} style={textStyle}>
            {empty ? placeholder : text}
          </span>
        )}
      </div>
    </div>
  );
}

/** 브라우저에서만 알 수 있는 문제를 알림으로 남긴다 (설정에서 끌 수 있음) */
function reportClientIssue(event: "storage_full" | "draft_failed", link: string) {
  api("/notifications/client", { method: "POST", json: { event, link } })
    .then(() => window.dispatchEvent(new Event("kidslog:notify")))
    .catch(() => {});
}

const fmtSec = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;

/** klass가 없으면 반과 상관없이 따로 만드는 영상 (편집 설정은 사용자마다 하나) */
export function VideoMaker({ klass }: { klass: Klass | null }) {
  const classId = klass?.id ?? null;
  const draftPath = classId === null ? "/video-draft" : `/classes/${classId}/video-draft`;
  const storeKey = classId ?? 0; // 브라우저 보관 칸: 반 id, 따로 만든 영상은 0
  const [clips, setClips] = useState<Clip[]>([]);
  const [title, setTitle] = useState("");
  const [maxSec, setMaxSec] = useState(15);
  const [font, setFont] = useState<string>(FONTS[0].id);
  const [music, setMusic] = useState<MusicChoice>("bright");
  const [musicFile, setMusicFile] = useState<File | null>(null);
  const [subStyle, setSubStyle] = useState<SubStyle>(DEFAULT_SUB_STYLE);
  const [fontReady, setFontReady] = useState<string | null>(null);
  const [hexDraft, setHexDraft] = useState<string | null>(null);
  const [stage, setStage] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [output, setOutput] = useState<{ url: string; seconds: number; ms: number; mb: number } | null>(null);
  const [frames, setFrames] = useState<Frame[]>([]);
  const [thumb, setThumb] = useState<string | null>(null);
  const [history, setHistory] = useState<VideoRecord[]>([]);
  const [missing, setMissing] = useState<MissingClip[]>([]);
  const [lastMusicName, setLastMusicName] = useState("");
  const [draftLoaded, setDraftLoaded] = useState(false);
  const [saveState, setSaveState] = useState<"saving" | "saved" | "error" | null>(null);
  const [storedAt, setStoredAt] = useState<number | null>(null);
  const [storeFailed, setStoreFailed] = useState(false);
  const lastSaved = useRef<string | null>(null);
  const logRef = useRef<string[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);
  const musicInput = useRef<HTMLInputElement>(null);
  // 영상 화면: 클립을 이어서 실제 영상처럼 재생
  const [sel, setSel] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [localT, setLocalT] = useState(0);
  const [stageView, setStageView] = useState<"edit" | "result">("edit");
  const [dragOver, setDragOver] = useState(false);
  const editorRef = useRef<HTMLDivElement>(null);
  const editorVideo = useRef<HTMLVideoElement>(null);
  const pendingSeek = useRef<number | null>(null);
  const urlCache = useRef(new Map<File, string>());
  // 말로 하는 편집 부탁
  const [cmd, setCmd] = useState("");
  const [cmdBusy, setCmdBusy] = useState(false);
  const [cmdReply, setCmdReply] = useState<{ text: string; warn: boolean } | null>(null);
  const undoRef = useRef<{ title: string; maxSec: number; font: string; subStyle: SubStyle; music: MusicChoice; subs: Map<string, string> } | null>(null);
  const [canUndo, setCanUndo] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiMemo, setAiMemo] = useState("");
  const [aiTone, setAiTone] = useState<"warm" | "concise">("warm");
  const [aiBusy, setAiBusy] = useState(false);
  const [aiNote, setAiNote] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    if (classId !== null) api<VideoRecord[]>(`/videos?class_id=${classId}`).then(setHistory).catch(() => {});
    (async () => {
      const [draft, stored, prefs] = await Promise.all([api<VideoDraft>(draftPath).catch(() => null), loadVideo(storeKey), loadPrefs()]);
      if (!alive) return;
      setAiTone(prefs.ai_tone);
      defaultsRef.current = prefs.video_defaults;

      // 1) 서버에 자동 저장된 편집 설정 되살리기
      const d = draft?.data;
      if (d) {
        setTitle(d.title);
        setMaxSec(d.max_sec);
        if (FONTS.some((f) => f.id === d.font)) setFont(d.font);
        const st = d.sub_style;
        setSubStyle({ size: st.size, color: st.color.toUpperCase(), effect: st.effect, position: st.position, at: { x: st.at_x, y: st.at_y } });
        if (d.music === "none" || d.music === "file" || MUSIC_PRESETS.some((m) => m.id === d.music)) setMusic(d.music as MusicChoice);
        setLastMusicName(d.music_file_name);
        setMissing(d.clips.map((c, idx) => ({ ...c, idx })));
      } else {
        // 처음 만드는 영상은 설정의 '영상 기본 스타일'로 시작
        applyDefaults(prefs.video_defaults);
      }

      // 2) 이 브라우저에 보관해 둔 지난 영상
      if (stored) {
        setOutput({ url: URL.createObjectURL(stored.blob), seconds: stored.seconds, ms: stored.ms, mb: stored.mb });
        setFrames(stored.frames);
        setThumb(stored.thumb);
        setStoredAt(stored.createdAt);
      }
      setDraftLoaded(true);
    })();
    return () => void (alive = false);
  }, [classId, draftPath, storeKey]);
  useEffect(() => () => void (output && URL.revokeObjectURL(output.url)), [output]);
  // 미리보기용으로 고른 글꼴을 미리 받아 둔다 (영상 만들 때도 캐시를 그대로 씀)
  useEffect(() => {
    let alive = true;
    loadFont(font).then(() => alive && setFontReady(font)).catch(() => {});
    return () => void (alive = false);
  }, [font]);
  const setSub = <K extends keyof SubStyle>(k: K, v: SubStyle[K]) => setSubStyle((st) => ({ ...st, [k]: v }));

  // 편집 설정 자동 저장 (영상 파일은 보내지 않고 클립 이름·크기·자막만)
  const draftJson = useMemo(() => {
    const data: VideoDraftData = {
      title,
      max_sec: maxSec,
      font,
      sub_style: { size: subStyle.size, color: subStyle.color, effect: subStyle.effect, position: subStyle.position, at_x: subStyle.at.x, at_y: subStyle.at.y },
      music,
      music_file_name: music === "file" ? (musicFile?.name ?? lastMusicName) : "",
      clips: [
        ...clips.map((c) => ({ name: c.file.name, size: c.file.size, duration: Math.round(c.duration * 100) / 100, subtitle: c.subtitle })),
        ...missing.map(({ idx: _, ...c }) => c),
      ].slice(0, MAX_CLIPS),
    };
    return JSON.stringify(data);
  }, [title, maxSec, font, subStyle, music, musicFile, lastMusicName, clips, missing]);
  useEffect(() => {
    if (!draftLoaded || draftJson === lastSaved.current) return;
    setSaveState("saving");
    const t = setTimeout(() => {
      api(draftPath, { method: "PUT", json: JSON.parse(draftJson) })
        .then(() => {
          lastSaved.current = draftJson;
          setSaveState("saved");
        })
        .catch(() => {
          setSaveState("error");
          reportClientIssue("draft_failed", window.location.pathname + window.location.search);
        });
    }, 800);
    return () => clearTimeout(t);
  }, [draftJson, draftLoaded, draftPath]);

  const defaultsRef = useRef<VideoDefaults | null>(null);
  const [defaultsMsg, setDefaultsMsg] = useState<string | null>(null);
  function applyDefaults(vd: VideoDefaults | null) {
    if (!vd) {
      setMaxSec(15);
      setFont(FONTS[0].id);
      setSubStyle(DEFAULT_SUB_STYLE);
      setMusic("bright");
      return;
    }
    setMaxSec(vd.max_sec);
    setFont(FONTS.some((f) => f.id === vd.font) ? vd.font : FONTS[0].id);
    setSubStyle({ ...DEFAULT_SUB_STYLE, size: vd.size, color: vd.color.toUpperCase(), effect: vd.effect, position: vd.position });
    setMusic(vd.music);
  }
  // 지금 꾸밈을 설정의 '영상 기본 스타일'로 저장
  async function saveAsDefaults() {
    const vd: VideoDefaults = {
      font,
      size: subStyle.size,
      color: subStyle.color,
      effect: subStyle.effect,
      position: subStyle.position === "custom" ? (subStyle.at.y < 0.35 ? "top" : subStyle.at.y > 0.65 ? "bottom" : "middle") : subStyle.position,
      music: music === "file" ? "bright" : music,
      max_sec: maxSec,
    };
    try {
      const p = await loadPrefs();
      await savePrefs({ ...p, video_defaults: vd });
      defaultsRef.current = vd;
      setDefaultsMsg("기본 스타일로 저장했어요. 새 영상은 이 모양으로 시작해요.");
    } catch {
      setDefaultsMsg("저장하지 못했어요");
    }
    setTimeout(() => setDefaultsMsg(null), 4000);
  }

  function resetAll() {
    if (!confirm("클립 목록과 제목·자막·꾸미기 설정을 모두 처음 상태로 돌릴까요? (보관된 영상은 그대로 둡니다)")) return;
    setClips([]);
    setMissing([]);
    setTitle("");
    applyDefaults(defaultsRef.current);
    setMusicFile(null);
    setLastMusicName("");
  }

  async function forgetStored() {
    if (!confirm("이 브라우저에 보관된 영상을 지울까요? 내려받은 파일은 지워지지 않습니다.")) return;
    await deleteVideo(storeKey);
    setOutput(null);
    setFrames([]);
    setThumb(null);
    setStoredAt(null);
  }

  async function addFiles(list: FileList | null) {
    if (!list) return;
    setError(null);
    const next: Clip[] = [];
    const matched = new Set<number>();
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
        // 지난 편집에 있던 파일이면 자막·순서를 되살린다 (이름+크기, 없으면 이름만으로)
        const pool = missing.filter((m) => !matched.has(m.idx));
        const m = pool.find((x) => x.name === file.name && x.size === file.size) ?? pool.find((x) => x.name === file.name);
        if (m) matched.add(m.idx);
        next.push({
          key: `${file.name}-${file.lastModified}-${idx}`,
          file,
          duration,
          subtitle: m ? m.subtitle : "",
          draftIdx: m?.idx,
        });
      } catch (e) {
        setError(e instanceof Error ? e.message : "읽기 실패");
      }
    }
    if (matched.size) setMissing((ms) => ms.filter((x) => !matched.has(x.idx)));
    // 되살린 클립은 지난 순서대로, 새 클립은 뒤에 (정렬은 안정 정렬)
    setClips((c) => [...c, ...next].sort((a, b) => (a.draftIdx ?? 1e9) - (b.draftIdx ?? 1e9)));
  }

  const move = (i: number, d: number) =>
    setClips((c) => {
      const j = i + d;
      if (j < 0 || j >= c.length) return c;
      const x = c.map((k) => ({ ...k, draftIdx: undefined }));
      [x[i], x[j]] = [x[j], x[i]];
      return x;
    });

  // AI 자막 초안: 선생님 메모로 클립 수만큼 만든다 (영상·사진은 보내지 않음)
  async function draftSubtitles() {
    if (!clips.length || !aiMemo.trim()) return;
    if (clips.some((c) => c.subtitle.trim()) && !confirm("이미 쓴 자막을 AI 초안으로 바꿀까요?")) return;
    setAiBusy(true);
    setAiNote(null);
    try {
      const d = await api<SubtitleDraft>("/video-subtitles", {
        method: "POST",
        json: { memo: aiMemo, tone: aiTone, count: clips.length, class_id: classId },
      });
      setClips((cs) => cs.map((c, i) => ({ ...c, subtitle: d.subtitles[i] ?? c.subtitle })));
      if (!title.trim() && d.title) setTitle(d.title);
      setAiNote(
        [d.provider === "mock" ? "AI 키가 없어 모의 초안을 넣었어요." : "초안을 넣었어요. 클립마다 고쳐서 쓰세요.", ...d.warnings].join(" "),
      );
    } catch (e) {
      setAiNote(e instanceof Error ? e.message : "자막 초안을 만들지 못했어요");
    } finally {
      setAiBusy(false);
    }
  }

  // 편집 화면에 띄울 클립 (지운 뒤에도 범위 안으로)
  const selIdx = Math.min(sel, clips.length - 1);
  const selClip = selIdx >= 0 ? clips[selIdx] : null;
  const urlOf = (f: File) => {
    let u = urlCache.current.get(f);
    if (!u) urlCache.current.set(f, (u = URL.createObjectURL(f)));
    return u;
  };
  // 빠진 클립의 주소는 정리
  useEffect(() => {
    const live = new Set(clips.map((c) => c.file));
    for (const [f, u] of urlCache.current) if (!live.has(f)) (URL.revokeObjectURL(u), urlCache.current.delete(f));
  }, [clips]);
  const setClipSub = (i: number, v: string) => setClips((cs) => cs.map((x, j) => (j === i ? { ...x, subtitle: v } : x)));

  const clipLen = (c: Clip) => Math.min(c.duration || maxSec, maxSec);
  const totalSec = clips.reduce((s, c) => s + clipLen(c), 0);
  const startOf = (i: number) => clips.slice(0, i).reduce((s, c) => s + clipLen(c), 0);

  function seekTo(i: number, t: number) {
    const v = editorVideo.current;
    setStageView("edit");
    setLocalT(t);
    if (i === selIdx && v) v.currentTime = t;
    else {
      pendingSeek.current = t;
      setSel(i);
    }
  }
  function nextClip() {
    const v = editorVideo.current;
    const n = clips.length;
    if (!n) return;
    if (n === 1 || !v) {
      if (v) v.currentTime = 0;
      setLocalT(0);
      return;
    }
    // 마지막 클립 다음은 처음으로 (계속 반복)
    pendingSeek.current = 0;
    setLocalT(0);
    setSel((selIdx + 1) % n);
  }
  function togglePlay() {
    const v = editorVideo.current;
    if (!v) return;
    if (playing) {
      v.pause();
      setPlaying(false);
    } else {
      v.play().catch(() => {});
      setPlaying(true);
    }
  }
  function pause() {
    editorVideo.current?.pause();
    setPlaying(false);
  }

  // 말로 하는 편집: 바꿀 설정만 받아서 여기서 적용 (영상은 보내지 않음)
  async function askEdit(e: React.FormEvent) {
    e.preventDefault();
    const text = cmd.trim();
    if (!text || !clips.length) return;
    setCmdBusy(true);
    setCmdReply(null);
    try {
      const r = await api<VideoEditResult>("/video-edit", {
        method: "POST",
        json: {
          instruction: text,
          class_id: classId,
          current: selIdx + 1,
          state: {
            title,
            max_sec: maxSec,
            font,
            music: music === "file" ? "bright" : music,
            style: { size: subStyle.size, color: subStyle.color, effect: subStyle.effect, position: subStyle.position },
            clips: clips.map((c) => ({ subtitle: c.subtitle, seconds: Math.round(clipLen(c) * 10) / 10 })),
          },
        },
      });
      undoRef.current = { title, maxSec, font, subStyle, music, subs: new Map(clips.map((c) => [c.key, c.subtitle])) };
      if (r.title !== null) setTitle(r.title);
      if (r.max_sec !== null) setMaxSec(r.max_sec);
      if (r.font && FONTS.some((f) => f.id === r.font)) setFont(r.font);
      if (r.music) setMusic(r.music as MusicChoice);
      setSubStyle((st) => ({
        ...st,
        ...(r.size && { size: r.size as SubStyle["size"] }),
        ...(r.color && { color: r.color }),
        ...(r.effect && { effect: r.effect as SubStyle["effect"] }),
        ...(r.position && { position: r.position as SubStyle["position"] }),
      }));
      if (r.subtitles.length) {
        const byIdx = new Map(r.subtitles.map((x) => [x.clip - 1, x.text]));
        setClips((cs) => cs.map((c, i) => (byIdx.has(i) ? { ...c, subtitle: byIdx.get(i)! } : c)));
        // 바뀐 첫 클립을 화면에 띄운다
        const first = r.subtitles[0].clip - 1;
        if (first !== selIdx) seekTo(first, 0);
      }
      setCanUndo(true);
      setCmd("");
      setCmdReply({ text: [r.reply, ...r.warnings].join(" "), warn: r.warnings.length > 0 });
    } catch (err) {
      setCmdReply({ text: err instanceof Error ? err.message : "부탁을 처리하지 못했어요", warn: true });
    } finally {
      setCmdBusy(false);
    }
  }
  function undoEdit() {
    const u = undoRef.current;
    if (!u) return;
    setTitle(u.title);
    setMaxSec(u.maxSec);
    setFont(u.font);
    setSubStyle(u.subStyle);
    setMusic(u.music);
    setClips((cs) => cs.map((c) => (u.subs.has(c.key) ? { ...c, subtitle: u.subs.get(c.key)! } : c)));
    undoRef.current = null;
    setCanUndo(false);
    setCmdReply({ text: "방금 바꾼 것을 되돌렸어요.", warn: false });
  }
  const totalMb = clips.reduce((s, c) => s + c.file.size, 0) / 1024 / 1024;

  async function make() {
    if (!clips.length) return;
    setError(null);
    setOutput(null);
    setFrames([]);
    setThumb(null);
    setStoredAt(null);
    setStoreFailed(false);
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
          filters.push(subtitleFilter(subStyle, `/sub_${i}.txt`));
        }
        if (i === 0 && title.trim()) {
          await write("title.txt", title.trim());
          filters.push(
            `drawtext=fontfile=/font.ttf:textfile=/title.txt:fontsize=76:fontcolor=white:borderw=5:bordercolor=black@0.6:x=(w-text_w)/2:y=${subStyle.position === "middle" || (subStyle.position === "custom" && Math.abs(subStyle.at.y - 0.5) < 0.2) ? "h*0.22" : "(h-text_h)/2"}:enable='lt(t,3)'`,
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
      // 같은 시각은 한 번만 (클립 가운데와 25%/75% 지점이 겹칠 수 있음)
      const uniq = [...new Set(times.map((t) => Math.round(t * 100) / 100))].sort((a, b) => a - b);
      const fr = (await sampleFrames(url, uniq)).sort((a, b) => b.score - a.score);
      setFrames(fr);
      const firstThumb = fr[0] ? await renderThumbnail(fr[0].dataUrl, title, `kl-${font}`) : null;
      setThumb(firstThumb);

      // 이 브라우저에만 보관 (새로고침·재방문해도 같은 기기에서는 남는다)
      const createdAt = Date.now();
      const kept = await saveVideo({ classId: storeKey, blob, title, seconds: total, ms, mb: blob.size / 1024 / 1024, thumb: firstThumb, frames: fr, createdAt });
      setStoredAt(kept ? createdAt : null);
      setStageView("result");
      editorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      setStoreFailed(!kept);
      if (!kept) reportClientIssue("storage_full", window.location.pathname + window.location.search);

      // 5) 성능 기록 (영상 파일은 올리지 않고 숫자만, 반에서 만든 영상만)
      const rec = classId === null ? null : await api<VideoRecord>("/videos", {
        method: "POST",
        json: {
          class_id: classId,
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
        <div
          ref={editorRef}
          className="card scroll-mt-4 space-y-3 p-5"
          onDragOver={(e) => {
            if (busy) return;
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            if (!busy) addFiles(e.dataTransfer.files);
          }}
        >
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold">영상</h3>
            {clips.length > 0 && stageView === "edit" && (
              <span className="text-xs text-ink-3">
                {selIdx + 1}번 클립 · {fmtSec(startOf(selIdx) + localT)} / {fmtSec(totalSec)}
              </span>
            )}
            {output && (
              <div className="ml-auto w-48">
                <Segmented
                  value={stageView}
                  options={[
                    { id: "edit", label: "편집 중" },
                    { id: "result", label: "완성 영상" },
                  ]}
                  onChange={(v) => {
                    setStageView(v);
                    if (v === "result") pause();
                  }}
                />
              </div>
            )}
          </div>

          {stageView === "result" && output ? (
            <>
              <video src={output.url} controls className="aspect-video w-full rounded-lg bg-black" poster={thumb ?? undefined} />
              <p className="break-keep text-xs text-ink-3">
                완성 영상에는 자막이 새겨져 있어요. 고치려면 ‘편집 중’으로 돌아가 영상 위에서 고친 뒤 영상 만들기를 다시 누르세요.
              </p>
            </>
          ) : clips.length === 0 ? (
            <div
              className={`flex aspect-video w-full flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed px-6 text-center transition-colors ${
                dragOver ? "border-brand bg-brand-soft" : "border-line bg-paper"
              }`}
            >
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-soft text-brand-ink">
                <Clapperboard size={22} />
              </span>
              <p className="font-semibold">클립을 넣으면 여기서 영상이 바로 재생돼요</p>
              <p className="max-w-sm break-keep text-sm text-ink-2">영상 위에서 자막을 끌어 옮기고, 두 번 눌러 고치고, 아래 칸에 말로 부탁해서 편집해요.</p>
              <button className="btn-primary" disabled={busy} onClick={() => fileInput.current?.click()}>
                클립 추가
              </button>
            </div>
          ) : (
            <>
              <SubtitlePreview
                text={selClip!.subtitle}
                placeholder="두 번 눌러 자막 쓰기"
                title={selIdx === 0 && localT < 3 ? title.trim() : undefined}
                style={subStyle}
                fontFamily={`kl-${font}`}
                fontReady={fontReady === font}
                disabled={busy}
                onMove={(at) => setSubStyle((st) => ({ ...st, position: "custom", at }))}
                onTextChange={(v) => setClipSub(selIdx, v)}
                onEditStart={pause}
              >
                <video
                  ref={editorVideo}
                  src={urlOf(selClip!.file)}
                  className="pointer-events-none absolute inset-0 h-full w-full object-contain"
                  muted
                  playsInline
                  autoPlay={playing}
                  onLoadedMetadata={(e) => {
                    const v = e.currentTarget;
                    if (pendingSeek.current !== null) v.currentTime = pendingSeek.current;
                    pendingSeek.current = null;
                    if (playing) v.play().catch(() => {});
                  }}
                  onTimeUpdate={(e) => {
                    const t = e.currentTarget.currentTime;
                    // 클립당 최대 길이까지만 (실제 영상에 들어가는 부분), 다음 클립으로 이어서
                    if (t >= clipLen(selClip!) - 0.04) nextClip();
                    else setLocalT(t);
                  }}
                  onEnded={nextClip}
                />
              </SubtitlePreview>

              {/* 타임라인: 칸 너비 = 클립이 영상에 들어가는 길이 */}
              <div className="flex items-stretch gap-2">
                <button type="button" className="btn-ghost shrink-0 px-2.5" onClick={togglePlay} aria-label={playing ? "일시 정지" : "재생"}>
                  {playing ? <Pause size={16} /> : <Play size={16} />}
                </button>
                <div className="flex min-w-0 flex-1 gap-1" role="tablist" aria-label="클립 타임라인">
                  {clips.map((c, i) => {
                    const len = clipLen(c);
                    const on = i === selIdx;
                    return (
                      <button
                        key={c.key}
                        type="button"
                        role="tab"
                        aria-selected={on}
                        title={`${i + 1}번 · ${fmtSec(len)}${c.subtitle ? ` · ${c.subtitle}` : ""}`}
                        style={{ flexGrow: len, flexBasis: 0 }}
                        className={`relative min-w-6 overflow-hidden rounded-md border px-1.5 py-1 text-left text-[11px] leading-tight ${
                          on ? "border-brand bg-brand-soft" : "border-line bg-paper hover:border-brand"
                        }`}
                        onClick={(e) => {
                          const r = e.currentTarget.getBoundingClientRect();
                          seekTo(i, Math.max(0, Math.min(len - 0.1, ((e.clientX - r.left) / r.width) * len)));
                        }}
                      >
                        <span className="block font-semibold text-ink-2">{i + 1}</span>
                        <span className={`block truncate ${c.subtitle ? "text-ink" : "text-ink-3"}`}>{c.subtitle || "자막 없음"}</span>
                        {on && <span className="absolute inset-y-0 w-0.5 bg-brand-ink" style={{ left: `${Math.min(100, (localT / len) * 100)}%` }} aria-hidden />}
                      </button>
                    );
                  })}
                </div>
              </div>
              <p className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-ink-3">
                <span className="inline-flex items-center gap-1">
                  <Move size={12} /> 자막 끌어서 옮기기
                </span>
                <span className="inline-flex items-center gap-1">
                  <PenLine size={12} /> 두 번 눌러 글자 고치기
                </span>
                <span>타임라인을 눌러 원하는 곳으로</span>
              </p>
            </>
          )}

          {/* 말로 하는 편집 */}
          {clips.length > 0 && (
            <div className="rounded-lg border border-line bg-paper/60 p-3">
              <form onSubmit={askEdit} className="flex items-center gap-2">
                <Sparkles size={16} className="shrink-0 text-brand" aria-hidden />
                <input
                  className="input min-w-0 flex-1 py-1.5"
                  value={cmd}
                  maxLength={500}
                  disabled={busy || cmdBusy}
                  onChange={(e) => setCmd(e.target.value)}
                  placeholder="AI에게 말로 부탁하기 — 예: 2번 자막을 '모래성 완성!'으로 바꾸고 글자는 노랗게, 위로 올려줘"
                  aria-label="AI에게 편집 부탁하기"
                />
                <button className="btn-primary shrink-0 px-3 py-1.5" disabled={busy || cmdBusy || !cmd.trim()} aria-label="부탁 보내기">
                  {cmdBusy ? "…" : <Send size={15} />}
                </button>
              </form>
              {cmdReply && (
                <div className={`mt-2 flex items-start gap-2 text-xs ${cmdReply.warn ? "text-warn" : "text-brand-ink"}`}>
                  <span className="min-w-0 flex-1 break-keep">{cmdReply.text}</span>
                  {canUndo && (
                    <button type="button" className="inline-flex shrink-0 items-center gap-1 font-medium text-ink-2 hover:text-ink" onClick={undoEdit}>
                      <Undo2 size={13} /> 되돌리기
                    </button>
                  )}
                </div>
              )}
              <p className="mt-1.5 text-[11px] text-ink-3">자막·제목·글자 모양·음악·클립 길이를 바꿀 수 있어요. 부탁한 문장과 자막만 보내고 영상은 보내지 않아요.</p>
            </div>
          )}
        </div>

        <div className="card p-5">
          <div className="flex flex-wrap items-center gap-3">
            <h3 className="font-semibold">클립</h3>
            <button className={clips.length ? "btn-ghost" : "btn-primary"} disabled={busy} onClick={() => fileInput.current?.click()}>
              클립 추가
            </button>
            <span className="text-sm text-ink-2">
              영상은 이 브라우저 안에서만 처리되고 서버로 올라가지 않습니다. 최대 {MAX_CLIPS}개, 클립당 {MAX_CLIP_MB}MB.
            </span>
            <input ref={fileInput} type="file" accept="video/*" multiple hidden onChange={(e) => (addFiles(e.target.files), (e.target.value = ""))} />
          </div>
          {clips.length > 0 && (
            <div className="mt-4 rounded-lg border border-line bg-paper/60 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold">자막</span>
                <span className="text-xs text-ink-3">클립마다 직접 쓰거나 AI 초안을 받아 고쳐 쓰세요.</span>
                <button
                  type="button"
                  className={`${aiOpen ? "btn-primary" : "btn-ghost"} ml-auto px-2.5 py-1`}
                  disabled={busy}
                  aria-expanded={aiOpen}
                  onClick={() => setAiOpen((o) => !o)}
                >
                  <Sparkles size={14} />
                  AI 자막 초안
                </button>
              </div>
              {aiOpen && (
                <div className="mt-3 space-y-2">
                  <textarea
                    className="input min-h-20"
                    value={aiMemo}
                    maxLength={2000}
                    disabled={busy || aiBusy}
                    onChange={(e) => setAiMemo(e.target.value)}
                    placeholder={"어떤 활동이었는지 짧게 적어 주세요. 예: 숲 산책, 도토리 줍기, 낙엽으로 왕관 만들기\n아이 이름은 쓰지 않아도 돼요."}
                  />
                  <div className="flex flex-wrap items-center gap-2">
                    <Segmented
                      value={aiTone}
                      options={[
                        { id: "warm", label: "따뜻한" },
                        { id: "concise", label: "간결한" },
                      ]}
                      onChange={setAiTone}
                      disabled={busy || aiBusy}
                    />
                    <button type="button" className="btn-primary ml-auto py-1.5" disabled={busy || aiBusy || !aiMemo.trim()} onClick={draftSubtitles}>
                      {aiBusy ? "만드는 중…" : `클립 ${clips.length}개에 자막 넣기`}
                    </button>
                  </div>
                  <p className="text-xs text-ink-3">메모만 AI에 보내고 영상은 보내지 않아요. 초안이 비어 있던 제목도 채워요.</p>
                </div>
              )}
              {aiNote && <p className="mt-2 text-xs text-brand-ink">{aiNote}</p>}
            </div>
          )}
          {clips.length > 0 && (
            <ol className="mt-4 space-y-2">
              {clips.map((c, i) => (
                <li key={c.key} className={`flex flex-wrap items-center gap-2 rounded-lg border p-2 ${i === selIdx ? "border-brand bg-brand-soft/30" : "border-line"}`}>
                  <button type="button" className="w-6 text-center text-sm font-semibold text-ink-3 hover:text-brand-ink" onClick={() => seekTo(i, 0)} title="영상 화면에 띄우기">
                    {i + 1}
                  </button>
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
                    onFocus={() => i !== selIdx && seekTo(i, 0)}
                    onChange={(e) => setClipSub(i, e.target.value)}
                  />
                  <div className="flex gap-1">
                    <button className="btn-ghost px-2 py-1" disabled={busy || i === 0} onClick={() => move(i, -1)} aria-label="위로">
                      <ArrowUp size={16} />
                    </button>
                    <button className="btn-ghost px-2 py-1" disabled={busy || i === clips.length - 1} onClick={() => move(i, 1)} aria-label="아래로">
                      <ArrowDown size={16} />
                    </button>
                    <button className="btn-danger px-2 py-1" disabled={busy} onClick={() => setClips((cs) => cs.filter((x) => x.key !== c.key))} aria-label="빼기">
                      <X size={16} />
                    </button>
                  </div>
                </li>
              ))}
            </ol>
          )}
          {missing.length > 0 && (
            <div className="mt-4 rounded-lg border border-dashed border-brand/50 bg-brand-soft/50 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <FileVideo size={16} className="text-brand-ink" />
                <span className="text-sm font-semibold text-brand-ink">지난번 편집에서 다시 넣을 클립 {missing.length}개</span>
                <div className="ml-auto flex gap-2">
                  <button className="btn-ghost px-2.5 py-1" disabled={busy} onClick={() => fileInput.current?.click()}>
                    파일 다시 넣기
                  </button>
                  <button className="btn-ghost px-2.5 py-1 text-ink-3" disabled={busy} onClick={() => setMissing([])}>
                    목록 지우기
                  </button>
                </div>
              </div>
              <p className="mt-1 text-xs text-ink-2">영상 파일은 서버에 없어서 다시 넣어야 해요. 같은 파일을 넣으면 자막과 순서가 그대로 돌아와요.</p>
              <ul className="mt-2 space-y-1">
                {missing.map((m) => (
                  <li key={m.idx} className="flex gap-2 text-sm">
                    <span className="w-5 shrink-0 text-center text-ink-3">{m.idx + 1}</span>
                    <span className="min-w-0 truncate">{m.name}</span>
                    {m.subtitle && <span className="min-w-0 truncate text-ink-3">“{m.subtitle}”</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-line pt-4">
            <div className="min-w-0 flex-1 text-sm text-ink-2">
              {clips.length > 0 ? (
                <>
                  완성 길이 약 {fmtSec(totalSec)} · 입력 합계 {totalMb.toFixed(0)}MB
                  {totalMb > 600 && <span className="ml-2 inline-flex items-center gap-1 align-middle text-warn"><TriangleAlert size={14} />용량이 커서 브라우저 메모리가 부족할 수 있습니다</span>}
                </>
              ) : (
                "클립을 추가하면 영상을 만들 수 있어요."
              )}
              <div className="flex flex-wrap items-center gap-x-2 text-xs text-ink-3">
                <span>
                  출력: {OUT_W}×{OUT_H}, {FPS}fps, H.264
                </span>
                {saveState && (
                  <span className={`inline-flex items-center gap-1 ${saveState === "error" ? "text-warn" : ""}`}>
                    {saveState === "error" ? <CloudOff size={12} /> : <CloudCheck size={12} />}
                    {saveState === "saving" ? "편집 내용 저장 중…" : saveState === "saved" ? "편집 내용 자동 저장됨" : "편집 내용 저장 실패"}
                  </span>
                )}
              </div>
            </div>
            <button className="btn-ghost" disabled={busy} onClick={resetAll} title="클립 목록과 설정을 처음 상태로">
              <RotateCcw size={15} />
              새로 시작
            </button>
            <button className="btn-primary px-6" disabled={busy || clips.length === 0} onClick={make}>
              <Clapperboard size={16} />
              {busy ? "만드는 중…" : "영상 만들기"}
            </button>
          </div>
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
                <div className="flex flex-wrap items-center gap-3 text-sm">
                  <a className="btn-primary" href={output.url} download={`${title || "kidslog"}.mp4`}>
                    영상 내려받기
                  </a>
                  <button
                    type="button"
                    className="btn-ghost"
                    onClick={() => {
                      setStageView("result");
                      editorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
                    }}
                  >
                    <Play size={15} />
                    완성 영상 보기
                  </button>
                  <button
                    type="button"
                    className="btn-ghost"
                    onClick={() => {
                      setStageView("edit");
                      editorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
                    }}
                  >
                    <PenLine size={15} />
                    자막 고치기
                  </button>
                  <span className="text-ink-2">
                    {fmtSec(output.seconds)} · {output.mb.toFixed(1)}MB · 처리 시간 <strong>{(output.ms / 1000).toFixed(1)}초</strong>
                  </span>
                </div>

                {storedAt ? (
                  <div className="flex flex-wrap items-center gap-2 rounded-lg bg-paper px-3 py-2 text-xs text-ink-2">
                    <HardDrive size={14} className="shrink-0 text-ink-3" />
                    <span className="min-w-0 flex-1 break-keep">
                      {new Date(storedAt).toLocaleString("ko-KR", { month: "long", day: "numeric", hour: "numeric", minute: "2-digit" })}에 만든 영상을 이 브라우저에 보관 중이에요. 서버와 다른 기기에는 없어요.
                    </span>
                    <button className="shrink-0 font-medium text-ink-3 hover:text-bad" onClick={forgetStored}>
                      보관 지우기
                    </button>
                  </div>
                ) : (
                  storeFailed && (
                    <p className="flex items-center gap-1 text-xs text-warn">
                      <TriangleAlert size={13} />
                      브라우저 저장 공간이 부족해 보관하지 못했어요. 페이지를 나가기 전에 꼭 내려받아 주세요.
                    </p>
                  )
                )}
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
                    onClick={async () => {
                      const t = await renderThumbnail(f.dataUrl, title, `kl-${font}`);
                      setThumb(t);
                      if (storedAt) updateVideoThumb(storeKey, t);
                    }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={f.dataUrl} alt={`${fmtSec(f.time)} 장면`} className="aspect-video w-full object-cover" />
                    {i === 0 && <span className="absolute left-1 top-1 rounded bg-brand px-1.5 text-[11px] font-medium text-ink">추천</span>}
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
          <fieldset className="space-y-3 rounded-xl border border-line p-3">
            <legend className="px-1 text-sm font-semibold">자막 꾸미기</legend>
            <p className="break-keep text-xs text-ink-3">바꾼 모양은 왼쪽 영상 화면에 바로 보여요. 위치와 글자도 거기서 고칠 수 있어요.</p>
            {/* 페이지가 길어지지 않게 자막 설정은 이 상자 안에서만 스크롤 */}
            <div className="-mx-1 max-h-[max(12rem,calc(100vh-33rem))] space-y-3 overflow-y-auto px-1 py-1 pr-2 [scrollbar-color:var(--color-line)_transparent] [scrollbar-width:thin]">
              <div>
                <label className="label">글꼴 (SIL OFL, 상업적 이용 가능)</label>
                <select className="input" value={font} onChange={(e) => setFont(e.target.value)} disabled={busy}>
                  {FONTS.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <span className="label">크기</span>
                <Segmented value={subStyle.size} options={SUB_SIZES} onChange={(v) => setSub("size", v)} disabled={busy} />
              </div>
              <div>
                <span className="label">글자색</span>
                <div className="flex flex-wrap items-center gap-2">
                  {SUB_COLORS.map((c) => {
                    const on = subStyle.color.toUpperCase() === c.hex;
                    return (
                      <button
                        key={c.hex}
                        type="button"
                        disabled={busy}
                        onClick={() => setSub("color", c.hex)}
                        className={`flex h-7 w-7 items-center justify-center rounded-full border transition-shadow ${on ? "border-ink ring-2 ring-brand ring-offset-2" : "border-line"}`}
                        style={{ background: c.hex }}
                        aria-label={c.label}
                        aria-pressed={on}
                        title={c.label}
                      >
                        {on && <Check size={13} strokeWidth={3} color={subStyleColors({ ...subStyle, color: c.hex }).dark ? "#fff" : "#2b2824"} />}
                      </button>
                    );
                  })}
                </div>
                {/* 컬러 박스: 원하는 색을 직접 고르기 */}
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <ColorPicker value={subStyle.color} onChange={(hex) => setSub("color", hex)} disabled={busy} iconColor={subStyleColors(subStyle).dark ? "#fff" : "#2b2824"} />
                  <input
                    className="input w-28 py-1 font-mono text-sm uppercase"
                    value={hexDraft ?? subStyle.color}
                    maxLength={7}
                    disabled={busy}
                    aria-label="글자색 코드 (#RRGGBB)"
                    onChange={(e) => {
                      const v = e.target.value.startsWith("#") ? e.target.value : `#${e.target.value}`;
                      setHexDraft(v);
                      if (/^#[0-9a-f]{6}$/i.test(v)) setSub("color", v.toUpperCase());
                    }}
                    onBlur={() => setHexDraft(null)}
                  />
                </div>
              </div>
              <div>
                <span className="label">효과</span>
                <Segmented value={subStyle.effect} options={SUB_EFFECTS} onChange={(v) => setSub("effect", v)} disabled={busy} />
              </div>
              <div>
                <span className="label">위치</span>
                <Segmented value={subStyle.position} options={SUB_POSITIONS} onChange={(v) => setSub("position", v)} disabled={busy} />
                {subStyle.position === "custom" && <p className="mt-1 text-xs text-brand-ink">직접 옮긴 위치를 쓰는 중이에요. 위 버튼을 누르면 기본 위치로 돌아가요.</p>}
              </div>
            </div>
          </fieldset>
          <div>
            <label className="label">배경음악 (원본 소리는 항상 음소거)</label>
            <select
              className="input"
              value={music}
              onChange={(e) => {
                const v = e.target.value as MusicChoice;
                setMusic(v);
                // "내 음원 파일"을 고르면 바로 파일 선택 창을 연다
                if (v === "file" && !musicFile) musicInput.current?.click();
              }}
              disabled={busy}
            >
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
                <div className="mt-2 flex items-center gap-2">
                  <button type="button" className="btn-ghost shrink-0" disabled={busy} onClick={() => musicInput.current?.click()}>
                    <Music size={16} />
                    {musicFile ? "다른 파일" : "음원 파일 선택"}
                  </button>
                  <span className={`min-w-0 truncate text-sm ${musicFile ? "text-ink" : "text-ink-3"}`} title={musicFile?.name ?? lastMusicName}>
                    {musicFile ? musicFile.name : lastMusicName ? `지난번: ${lastMusicName} (다시 골라 주세요)` : "선택된 파일 없음"}
                  </span>
                  {musicFile && (
                    <button type="button" className="ml-auto shrink-0 text-ink-3 hover:text-bad" disabled={busy} onClick={() => setMusicFile(null)} aria-label="음원 파일 빼기">
                      <X size={16} />
                    </button>
                  )}
                </div>
                <p className="mt-1 text-xs text-warn">저작권이 허용된 음원(CC0, 상업 이용 가능 등)만 사용하세요.</p>
              </>
            )}
          </div>
          <input ref={musicInput} type="file" accept="audio/*" hidden onChange={(e) => (setMusicFile(e.target.files?.[0] ?? null), (e.target.value = ""))} />
          <div className="border-t border-line pt-3">
            <button type="button" className="btn-ghost w-full" disabled={busy} onClick={saveAsDefaults}>
              <Bookmark size={15} />
              지금 꾸밈을 기본 스타일로 저장
            </button>
            <p className="mt-1.5 break-keep text-center text-xs text-ink-3">{defaultsMsg ?? "글꼴·자막 모양·음악·클립 길이를 새 영상의 시작값으로 써요."}</p>
          </div>
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
