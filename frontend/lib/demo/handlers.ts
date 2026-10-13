// 데모 모드 API: lib/api.ts 의 api()·putToStorage() 대신 메모리 상태를 읽고 쓴다.
// 네트워크 요청은 하나도 나가지 않고, 새로고침하면 샘플 데이터로 돌아간다.
// 응답 형태는 백엔드(backend/app/routers)와 같게 맞춘다.
import { ApiError } from "@/lib/api";
import { DEFAULT_PREFS, type UserPrefs } from "@/lib/prefs";
import type {
  Balance, Child, Group, GroupDetail, Klass, Note, Photo, PhotoTag, SubtitleDraft, Tags, User, VideoDraft, VideoEditResult, VideoRecord,
} from "@/lib/types";
import * as seed from "./data";

// ---- 상태 ----

type DemoClass = { id: number; name: string; created_at: string };
type DemoChild = Child & { class_id: number };
type DemoNote = Note & { group_id: number };

const s = {
  user: { ...seed.DEMO_USER } as User,
  classes: [{ ...seed.KLASS }] as DemoClass[],
  children: seed.CHILDREN.map((c) => ({ ...c, class_id: seed.CLASS_ID })) as DemoChild[],
  photos: structuredClone(seed.PHOTOS) as Photo[],
  groups: structuredClone(seed.GROUPS) as seed.GroupSeed[],
  notes: structuredClone(seed.NOTES) as DemoNote[],
  customTags: [] as string[],
  videos: structuredClone(seed.VIDEOS) as VideoRecord[],
  drafts: new Map<string, VideoDraft>(),
  notifications: structuredClone(seed.NOTIFICATIONS),
  prefs: structuredClone(DEFAULT_PREFS) as UserPrefs,
  exportUrls: [] as string[],
  uploads: 0,
};

const ids = {
  class: 100,
  child: 100,
  photo: 100,
  group: 100,
  note: 100,
  notification: 100,
};

const nowIso = () => new Date().toISOString();
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

function fail(status: number, message: string): never {
  throw new ApiError(status, message);
}

// ---- 직렬화 (백엔드 serializers.py 와 같은 규칙) ----

function primaryActivity(tags: PhotoTag[]): string | null {
  const acts = tags.filter((t) => t.kind === "activity");
  acts.sort((a, b) => Number(a.source !== "teacher") - Number(b.source !== "teacher") || b.confidence - a.confidence);
  return acts[0]?.tag ?? null;
}

function refresh(p: Photo): Photo {
  p.activity = primaryActivity(p.tags);
  p.flagged =
    p.status === "done" &&
    ((p.quality_score !== null && p.quality_score < seed.LOW_QUALITY) || !!p.eyes_closed || p.duplicate_of !== null);
  return p;
}

const out = <T>(x: T): T => structuredClone(x);

function klassOut(k: DemoClass): Klass {
  return {
    ...k,
    photo_count: s.photos.filter((p) => p.class_id === k.id && p.status !== "pending").length,
    children: s.children.filter((c) => c.class_id === k.id).map(({ id, name }) => ({ id, name })),
  };
}

function groupPhotos(g: seed.GroupSeed): Photo[] {
  return g.photo_ids.map((id) => s.photos.find((p) => p.id === id)).filter((p): p is Photo => !!p);
}

function groupOut(g: seed.GroupSeed): Group {
  const photos = groupPhotos(g);
  const cover = photos.find((p) => p.id === g.cover_photo_id) ?? photos[0];
  const { photo_ids: _ids, ...rest } = g;
  return { ...rest, cover_photo_id: cover?.id ?? null, cover_thumb_url: cover?.thumb_url ?? null, photo_count: photos.length };
}

function groupDetail(g: seed.GroupSeed): GroupDetail {
  const photos = groupPhotos(g).sort((a, b) => (a.taken_at ?? a.created_at).localeCompare(b.taken_at ?? b.created_at) || a.id - b.id);
  return out({
    ...groupOut(g),
    photos,
    notes: s.notes.filter((n) => n.group_id === g.id).map(({ group_id: _g, ...n }) => n),
  });
}

function bestCover(g: seed.GroupSeed) {
  if (g.cover_photo_id && g.photo_ids.includes(g.cover_photo_id)) return;
  const best = [...groupPhotos(g)].sort(
    (a, b) => Number(b.duplicate_of === null) - Number(a.duplicate_of === null) || (b.quality_score ?? 0) - (a.quality_score ?? 0),
  )[0];
  g.cover_photo_id = best?.id ?? null;
}

function tagsOut(): Tags {
  const all = [...seed.DEFAULT_ACTIVITY_TAGS.filter((t) => t !== "기타"), ...s.customTags, "기타"];
  return { default: [...seed.DEFAULT_ACTIVITY_TAGS], custom: [...s.customTags], all };
}

function nameWarnings(classId: number, texts: string[]): string[] {
  const joined = texts.join("\n");
  const hits = s.children.filter((c) => c.class_id === classId && c.name.length >= 2 && joined.includes(c.name)).map((c) => c.name);
  return hits.length ? [`아이 이름이 포함되어 있습니다: ${hits.join(", ")}. 보내기 전에 확인하세요.`] : [];
}

function getClass(id: number): DemoClass {
  return s.classes.find((k) => k.id === id) ?? fail(404, "반을 찾을 수 없습니다");
}
function getPhoto(id: number): Photo {
  return s.photos.find((p) => p.id === id) ?? fail(404, "사진을 찾을 수 없습니다");
}
function getGroup(id: number): seed.GroupSeed {
  return s.groups.find((g) => g.id === id) ?? fail(404, "묶음을 찾을 수 없습니다");
}

// ---- 업로드 (파일은 object URL 로만 쓰고 어디로도 보내지 않음) ----

const UPLOAD_PREFIX = "demo-upload:";

export async function demoPut(url: string, file: File): Promise<void> {
  const p = getPhoto(Number(url.slice(UPLOAD_PREFIX.length)));
  await wait(150 + Math.random() * 250);
  const objectUrl = URL.createObjectURL(file);
  Object.assign(p, { url: objectUrl, thumb_url: objectUrl, status: "uploaded" });
}

function finishAnalysis(p: Photo) {
  const r = seed.UPLOAD_RESULTS[s.uploads++ % seed.UPLOAD_RESULTS.length];
  Object.assign(p, {
    status: "done",
    caption: r.caption,
    quality_score: r.quality,
    sharpness: 70,
    brightness: 65,
    eyes_closed: false,
    ai_provider: "demo",
    tags: [
      { tag: r.activity, kind: "activity", confidence: 0.85, source: "ai" },
      ...r.extra.map(([tag, kind]) => ({ tag, kind, confidence: 0.7, source: "ai" })),
    ],
  });
  refresh(p);
}

// ---- 앨범 이미지 (서버 Pillow 대신 브라우저 canvas, backend/app/album.py 와 같은 배치) ----

const TEMPLATES: Record<string, [number, number]> = { grid4: [2, 2], grid6: [3, 2], grid9: [3, 3] };

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = () => rej(new ApiError(500, "사진을 불러오지 못했습니다"));
    img.src = src;
  });
}

async function renderAlbum(templateId: string, photos: Photo[], title: string, subtitle: string): Promise<string> {
  const [cols, maxRows] = TEMPLATES[templateId] ?? TEMPLATES.grid4;
  const list = photos.slice(0, cols * maxRows);
  const WIDTH = 1080, PAD = 24, HEADER = 120;
  const rows = Math.max(1, Math.ceil(list.length / cols));
  const cell = Math.floor((WIDTH - PAD * (cols + 1)) / cols);
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEADER + PAD + rows * (cell + PAD);
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "rgb(250,247,242)";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.textBaseline = "top";
  ctx.fillStyle = "rgb(51,45,40)";
  ctx.font = "bold 44px sans-serif";
  ctx.fillText(title, PAD, 28, WIDTH - PAD * 2);
  ctx.fillStyle = "rgb(120,110,100)";
  ctx.font = "bold 24px sans-serif";
  ctx.fillText(subtitle, PAD, 82);
  const images = await Promise.all(list.map((p) => loadImage(p.url ?? p.thumb_url ?? "")));
  images.forEach((img, i) => {
    const r = Math.floor(i / cols), c = i % cols;
    // 가운데를 정사각형으로 잘라 넣기 (ImageOps.fit 과 같음)
    const side = Math.min(img.naturalWidth || img.width, img.naturalHeight || img.height);
    const sx = ((img.naturalWidth || img.width) - side) / 2;
    const sy = ((img.naturalHeight || img.height) - side) / 2;
    ctx.drawImage(img, sx, sy, side, side, PAD + c * (cell + PAD), HEADER + PAD + r * (cell + PAD), cell, cell);
  });
  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", 0.9));
  if (!blob) fail(500, "앨범 이미지를 만들지 못했습니다");
  const url = URL.createObjectURL(blob);
  s.exportUrls.push(url);
  return url;
}

// ---- 말로 편집 (backend/app/ai/video_editor.py 의 규칙 버전을 줄여 옮김) ----

const QUOTE = `['"‘“「]([^'"’”」]+)['"’”」]`;
const COLORS: [string[], string, string][] = [
  [["노랑", "노란", "노랗"], "#FFE066", "노랑"],
  [["흰", "하얀", "하얗"], "#FFFFFF", "흰색"],
  [["주황"], "#F2A531", "주황"],
  [["민트"], "#8EE3C8", "민트"],
  [["하늘"], "#9AD0F5", "하늘색"],
  [["분홍", "핑크"], "#FFB3C7", "분홍"],
  [["검정", "검은", "까만", "까맣"], "#2B2824", "검정"],
  [["빨강", "빨간", "빨갛"], "#E5484D", "빨강"],
  [["파랑", "파란", "파랗"], "#4C8DF6", "파랑"],
  [["초록", "녹색"], "#3DBE6B", "초록"],
];
const FONT_WORDS: [string[], string, string][] = [
  [["손글씨"], "gaegu", "개구 (손글씨)"],
  [["펜"], "nanumpen", "나눔손글씨 펜"],
  [["붓"], "yeonsung", "연성 (붓글씨 느낌)"],
  [["둥근", "주아"], "jua", "주아 (둥근)"],
  [["굵은", "검은고딕"], "blackhansans", "검은고딕 (굵은 제목)"],
  [["도현", "또렷"], "dohyeon", "도현 (또렷한)"],
  [["나눔고딕"], "nanum", "나눔고딕 Bold"],
  [["해바라기", "깔끔"], "sunflower", "해바라기 (깔끔한)"],
  [["고운", "부드러"], "gowundodum", "고운돋움 (부드러운)"],
];
const POSITIONS: Record<string, string> = { bottom: "아래", middle: "가운데", top: "위" };
const EFFECTS: Record<string, string> = { box: "배경 상자", outline: "테두리", shadow: "그림자", plain: "효과 없음" };
const MUSIC: Record<string, string> = { none: "음악 없음", bright: "밝은 멜로디", calm: "잔잔한 멜로디" };

function videoEdit(text: string, clipCount: number, current: number): VideoEditResult {
  const r: VideoEditResult = {
    reply: "", title: null, subtitles: [], font: null, size: null, color: null, effect: null, position: null, music: null, max_sec: null,
    provider: "demo", warnings: [],
  };
  const done: string[] = [];
  let rest = text;
  const t = rest.match(new RegExp(`제목[^'"‘“「]*${QUOTE}`));
  if (t) {
    r.title = t[1].trim().slice(0, 30);
    done.push(`제목을 ‘${r.title}’(으)로`);
    rest = rest.replace(t[0], " ");
  }
  for (const m of rest.matchAll(new RegExp(`(\\d+)\\s*번(?:째)?[^'"‘“「\\d]*?${QUOTE}`, "g"))) {
    const i = Number(m[1]);
    if (i >= 1 && i <= clipCount) {
      r.subtitles.push({ clip: i, text: m[2].trim().slice(0, 40) });
      done.push(`${i}번 자막을 ‘${m[2].trim()}’(으)로`);
    }
  }
  if (!r.subtitles.length && clipCount) {
    const m = rest.match(new RegExp(`자막[^'"‘“「]*${QUOTE}`));
    if (m) {
      const all = /모든|전부|다\s/.test(rest);
      const targets = all ? Array.from({ length: clipCount }, (_, i) => i + 1) : [current];
      r.subtitles = targets.map((clip) => ({ clip, text: m[1].trim().slice(0, 40) }));
      done.push(`${all ? "모든" : `${current}번`} 자막을 ‘${m[1].trim()}’(으)로`);
    }
  }
  const plain = text.replace(new RegExp(QUOTE, "g"), " ");
  const color = COLORS.find(([words]) => words.some((w) => plain.includes(w)));
  if (color) {
    r.color = color[1];
    done.push(`글자색을 ${color[2]}(으)로`);
  }
  if (/위로|위쪽|상단|맨\s*위/.test(plain)) r.position = "top";
  else if (/아래로|아래쪽|하단|밑으로|맨\s*아래/.test(plain)) r.position = "bottom";
  else if (/가운데|중앙|중간/.test(plain)) r.position = "middle";
  if (r.position) done.push(`자막 위치를 ${POSITIONS[r.position]}(으)로`);
  if (/크게|키워|크기를?\s*크/.test(plain)) r.size = "l";
  else if (/작게|줄여/.test(plain)) r.size = "s";
  if (r.size) done.push(`크기를 ${r.size === "l" ? "크게" : "작게"}`);
  for (const [pat, eff] of [[/테두리/, "outline"], [/그림자/, "shadow"], [/상자/, "box"], [/배경(?!\s*음악)/, "box"], [/효과\s*(없|빼)/, "plain"]] as const) {
    if (pat.test(plain)) {
      r.effect = eff;
      done.push(`효과를 ${EFFECTS[eff]}(으)로`);
      break;
    }
  }
  if (/글꼴|폰트|글씨체/.test(plain)) {
    const f = FONT_WORDS.find(([words]) => words.some((w) => plain.includes(w)));
    if (f) {
      r.font = f[1];
      done.push(`글꼴을 ${f[2]}(으)로`);
    }
  }
  if (/음악|노래/.test(plain)) {
    if (/없|끄|빼/.test(plain)) r.music = "none";
    else if (/잔잔|조용/.test(plain)) r.music = "calm";
    else if (/밝|신나/.test(plain)) r.music = "bright";
    if (r.music) done.push(`배경음악을 ${MUSIC[r.music]}(으)로`);
  }
  const sec = plain.match(/(\d+)\s*초/);
  if (sec && /길이|최대|씩|까지/.test(plain)) {
    r.max_sec = Number(sec[1]);
    done.push(`클립당 최대 길이를 ${r.max_sec}초로`);
  }
  r.reply = done.length
    ? `(데모) ${done.join(", ")} 바꿨어요.`
    : "(데모) 무엇을 바꿀지 알아듣지 못했어요. 예: 2번 자막을 '모래성 완성!'으로 바꾸고 글자는 노랗게, 위로 올려줘";
  return r;
}

// ---- 라우터 ----

type Ctx = { method: string; params: string[]; q: URLSearchParams; body: any }; // eslint-disable-line @typescript-eslint/no-explicit-any
type Handler = (c: Ctx) => unknown | Promise<unknown>;

const NOT_IN_DEMO = "데모에서는 할 수 없는 기능이에요.";

const routes: [string, RegExp, Handler][] = [
  // 인증·사용자
  ["POST", /^\/auth\/refresh$/, () => ({ access_token: "demo" })],
  ["GET", /^\/auth\/me$/, () => out(s.user)],
  ["POST", /^\/auth\/(login|signup)$/, () => ({ access_token: "demo", user: out(s.user) })],
  ["POST", /^\/auth\/logout$/, () => undefined],
  ["GET", /^\/auth\/me\/stats$/, () => ({
    class_count: s.classes.length,
    photo_count: s.photos.length,
    child_count: s.children.length,
    video_count: s.videos.length,
    created_at: seed.DEMO_USER_CREATED,
  })],
  ["PATCH", /^\/auth\/me$/, ({ body }) => {
    s.user.name = String(body.name).trim().slice(0, 50) || s.user.name;
    return out(s.user);
  }],
  ["POST", /^\/auth\/password$/, () => fail(400, NOT_IN_DEMO)],
  ["DELETE", /^\/auth\/me$/, () => fail(400, NOT_IN_DEMO)],

  // 반·명단·균형
  ["GET", /^\/classes$/, () => s.classes.map(klassOut).sort((a, b) => b.id - a.id)],
  ["POST", /^\/classes$/, ({ body }) => {
    const name = String(body.name ?? "").trim();
    if (!name) fail(422, "반 이름을 입력하세요");
    const k = { id: ++ids.class, name: name.slice(0, 50), created_at: nowIso() };
    s.classes.push(k);
    return klassOut(k);
  }],
  ["GET", /^\/classes\/(\d+)$/, ({ params }) => klassOut(getClass(+params[0]))],
  ["POST", /^\/classes\/(\d+)\/children$/, ({ params, body }) => {
    const k = getClass(+params[0]);
    const have = new Set(s.children.filter((c) => c.class_id === k.id).map((c) => c.name));
    for (const raw of body.names as string[]) {
      const name = raw.trim().slice(0, 30);
      if (name && !have.has(name)) {
        s.children.push({ id: ++ids.child, name, class_id: k.id });
        have.add(name);
      }
    }
    return klassOut(k);
  }],
  ["DELETE", /^\/classes\/(\d+)\/children\/(\d+)$/, ({ params }) => {
    const id = +params[1];
    s.children = s.children.filter((c) => c.id !== id);
    s.photos.forEach((p) => (p.child_ids = p.child_ids.filter((x) => x !== id)));
  }],
  ["GET", /^\/classes\/(\d+)\/balance$/, ({ params, q }): Balance => {
    const k = getClass(+params[0]);
    const from = q.get("from"), to = q.get("to");
    const photos = s.photos.filter(
      (p) => p.class_id === k.id && p.status !== "pending" && (!from || p.date >= from) && (!to || p.date <= to),
    );
    const kids = s.children.filter((c) => c.class_id === k.id);
    const counts = new Map(kids.map((c) => [c.id, 0]));
    let untagged = 0;
    for (const p of photos) {
      if (!p.child_ids.length) untagged++;
      for (const id of p.child_ids) if (counts.has(id)) counts.set(id, counts.get(id)! + 1);
    }
    const avg = kids.length ? [...counts.values()].reduce((a, b) => a + b, 0) / kids.length : 0;
    const rows = kids
      .map((c) => ({ child_id: c.id, name: c.name, count: counts.get(c.id)!, low: avg > 0 && counts.get(c.id)! < avg * s.prefs.balance_ratio }))
      .sort((a, b) => a.count - b.count || a.name.localeCompare(b.name));
    return { rows, average: Math.round(avg * 10) / 10, untagged_photos: untagged, total_photos: photos.length };
  }],

  // 영상 편집 설정 (반마다 / 따로 만드는 영상)
  ["GET", /^\/classes\/(\d+)\/video-draft$/, ({ params }) => out(s.drafts.get(`c${params[0]}`) ?? { data: null, updated_at: null })],
  ["PUT", /^\/classes\/(\d+)\/video-draft$/, ({ params, body }) => {
    const d = { data: body, updated_at: nowIso() };
    s.drafts.set(`c${params[0]}`, d);
    return out(d);
  }],
  ["GET", /^\/video-draft$/, () => out(s.drafts.get("me") ?? { data: null, updated_at: null })],
  ["PUT", /^\/video-draft$/, ({ body }) => {
    const d = { data: body, updated_at: nowIso() };
    s.drafts.set("me", d);
    return out(d);
  }],

  // 사진
  ["GET", /^\/photos$/, ({ q }) => {
    const classId = Number(q.get("class_id"));
    const tag = q.get("tag"), text = q.get("q")?.trim().toLowerCase(), date = q.get("date");
    const child = Number(q.get("child_id")) || null, quality = q.get("quality");
    const limit = Number(q.get("limit") ?? 60);
    const list = s.photos
      .filter((p) => p.class_id === classId && p.status !== "pending")
      .filter((p) => !tag || p.tags.some((t) => t.tag === tag))
      .filter((p) => !text || p.caption.toLowerCase().includes(text) || p.tags.some((t) => t.tag.toLowerCase().includes(text)))
      .filter((p) => !date || p.date === date)
      .filter((p) => !child || p.child_ids.includes(child))
      .filter((p) => {
        if (quality === "good")
          return p.status === "done" && (p.quality_score ?? 0) >= seed.LOW_QUALITY && p.duplicate_of === null && !p.eyes_closed;
        if (quality === "flagged") return p.status === "done" && p.flagged;
        return true;
      })
      .sort((a, b) => (b.taken_at ?? b.created_at).localeCompare(a.taken_at ?? a.created_at) || b.id - a.id);
    return { items: out(list.slice(0, limit)), total: list.length };
  }],
  ["POST", /^\/photos\/presign$/, ({ body }) => {
    getClass(body.class_id);
    return (body.files as { filename: string }[]).map((f) => {
      const id = ++ids.photo;
      const created = nowIso();
      s.photos.push({
        id, class_id: body.class_id, url: null, thumb_url: null, original_filename: f.filename, status: "pending", error: null,
        taken_at: null, created_at: created, date: seed.isoDaysAgo(0), width: null, height: null, quality_score: null,
        sharpness: null, brightness: null, eyes_closed: null, duplicate_of: null, blur_applied: false, ai_provider: null,
        caption: "", activity: null, tags: [], child_ids: [], flagged: false,
      });
      return { photo_id: id, upload_url: `${UPLOAD_PREFIX}${id}` };
    });
  }],
  ["POST", /^\/photos\/complete$/, ({ body }) => {
    for (const id of body.photo_ids as number[]) {
      const p = getPhoto(id);
      p.status = "analyzing";
      p.blur_applied = !!body.blur_faces;
      setTimeout(() => finishAnalysis(p), 2000);
    }
    return { queued: body.photo_ids.length };
  }],
  ["POST", /^\/photos\/children\/bulk$/, ({ body }) => {
    const child = s.children.find((c) => c.id === body.child_id) ?? fail(404, "아이를 찾을 수 없습니다");
    const res: Photo[] = [];
    for (const id of new Set(body.photo_ids as number[])) {
      const p = getPhoto(id);
      if (p.class_id !== child.class_id) continue;
      const has = p.child_ids.includes(child.id);
      if (body.add && !has) p.child_ids = [...p.child_ids, child.id];
      else if (!body.add && has) p.child_ids = p.child_ids.filter((x) => x !== child.id);
      res.push(p);
    }
    return out(res);
  }],
  ["PUT", /^\/photos\/(\d+)\/tags$/, ({ params, body }) => {
    const p = getPhoto(+params[0]);
    const wanted = [...new Set((body.activity as string[]).map((t) => t.trim().slice(0, 30)).filter(Boolean))];
    p.tags = [
      ...p.tags.filter((t) => t.kind !== "activity"),
      ...wanted.map((tag, i): PhotoTag => ({ tag, kind: "activity", confidence: i === 0 ? 1 : 0.9, source: "teacher" })),
    ];
    return out(refresh(p));
  }],
  ["PUT", /^\/photos\/(\d+)\/children$/, ({ params, body }) => {
    const p = getPhoto(+params[0]);
    const ok = new Set(s.children.filter((c) => c.class_id === p.class_id).map((c) => c.id));
    if ((body.child_ids as number[]).some((id) => !ok.has(id))) fail(400, "다른 반 아이는 태그할 수 없습니다");
    p.child_ids = [...body.child_ids];
    return out(p);
  }],
  ["POST", /^\/photos\/(\d+)\/reanalyze$/, ({ params }) => {
    const p = getPhoto(+params[0]);
    if (p.status === "pending" || p.status === "analyzing") fail(409, "아직 처리 중입니다");
    p.status = "analyzing";
    // 샘플 사진은 원래 태그를 그대로 두고 상태만 돌려놓는다 (선생님 태그는 원래도 유지됨)
    setTimeout(() => {
      p.status = "done";
      refresh(p);
    }, 2000);
    return out(p);
  }],
  ["DELETE", /^\/photos\/(\d+)$/, ({ params }) => {
    const id = +params[0];
    const p = getPhoto(id);
    if (p.url?.startsWith("blob:")) URL.revokeObjectURL(p.url);
    s.photos = s.photos.filter((x) => x.id !== id);
    for (const g of s.groups) {
      g.photo_ids = g.photo_ids.filter((x) => x !== id);
      if (g.cover_photo_id === id) g.cover_photo_id = null;
      bestCover(g);
    }
  }],
  ["GET", /^\/tags$/, () => tagsOut()],
  ["POST", /^\/tags$/, ({ body }) => {
    const name = String(body.name ?? "").trim().slice(0, 30);
    if (!name || seed.DEFAULT_ACTIVITY_TAGS.includes(name) || name.startsWith("품질:"))
      fail(400, "이미 있는 태그이거나 사용할 수 없는 이름입니다");
    if (!s.customTags.includes(name)) s.customTags.push(name);
    return tagsOut();
  }],

  // 묶음·문구·앨범
  ["GET", /^\/groups$/, ({ q }) => {
    const classId = Number(q.get("class_id"));
    return s.groups
      .filter((g) => g.class_id === classId)
      .sort((a, b) => b.date.localeCompare(a.date) || a.id - b.id)
      .map(groupOut);
  }],
  ["POST", /^\/groups\/auto$/, ({ body }) => {
    const classId = body.class_id as number;
    getClass(classId);
    const grouped = new Set(s.groups.filter((g) => g.class_id === classId).flatMap((g) => g.photo_ids));
    const buckets = new Map<string, Photo[]>();
    for (const p of s.photos) {
      if (p.class_id !== classId || p.status !== "done" || grouped.has(p.id)) continue;
      const key = `${p.date}|${p.activity ?? "기타"}`;
      buckets.set(key, [...(buckets.get(key) ?? []), p]);
    }
    const touched: seed.GroupSeed[] = [];
    for (const key of [...buckets.keys()].sort()) {
      const [date, act] = key.split("|");
      let g = s.groups.find((x) => x.class_id === classId && x.date === date && x.activity === act);
      if (!g) {
        const [, m, d] = date.split("-").map(Number);
        g = { id: ++ids.group, class_id: classId, date, title: `${m}월 ${d}일 ${act}`, activity: act, cover_photo_id: null, photo_ids: [] };
        s.groups.push(g);
      }
      g.photo_ids.push(...buckets.get(key)!.map((p) => p.id));
      bestCover(g);
      touched.push(g);
    }
    return touched.map(groupOut);
  }],
  ["GET", /^\/groups\/(\d+)$/, ({ params }) => groupDetail(getGroup(+params[0]))],
  ["PATCH", /^\/groups\/(\d+)$/, ({ params, body }) => {
    const g = getGroup(+params[0]);
    if (typeof body.title === "string") g.title = body.title.trim() || g.title;
    if (Array.isArray(body.remove_photo_ids)) {
      const rm = new Set(body.remove_photo_ids as number[]);
      g.photo_ids = g.photo_ids.filter((id) => !rm.has(id));
      if (g.cover_photo_id && rm.has(g.cover_photo_id)) g.cover_photo_id = null;
    }
    if (body.cover_photo_id != null) {
      if (!g.photo_ids.includes(body.cover_photo_id)) fail(400, "묶음에 없는 사진입니다");
      g.cover_photo_id = body.cover_photo_id;
    }
    bestCover(g);
    return groupDetail(g);
  }],
  ["DELETE", /^\/groups\/(\d+)$/, ({ params }) => {
    const id = +params[0];
    s.groups = s.groups.filter((g) => g.id !== id);
    s.notes = s.notes.filter((n) => n.group_id !== id);
  }],
  ["POST", /^\/groups\/(\d+)\/note$/, async ({ params, body }) => {
    const g = getGroup(+params[0]);
    await wait(1200); // AI가 쓰는 것처럼 잠깐 기다린다
    const tone = body.tone === "concise" ? "concise" : "warm";
    const tpl = (seed.NOTE_TEMPLATES[g.activity ?? ""] ?? seed.NOTE_TEMPLATES["기타"])[tone];
    const n: DemoNote = {
      id: ++ids.note, group_id: g.id, kind: body.kind ?? "notice", memo: String(body.memo ?? ""), title: tpl.title, body: tpl.body,
      subtitles: [], tone, edited_by_teacher: false, created_at: nowIso(), warnings: [],
    };
    s.notes.push(n);
    const { group_id: _g, ...note } = n;
    return { ...out(note), warnings: nameWarnings(g.class_id, [n.title, n.body]) };
  }],
  ["PATCH", /^\/notes\/(\d+)$/, ({ params, body }) => {
    const n = s.notes.find((x) => x.id === +params[0]) ?? fail(404, "문구를 찾을 수 없습니다");
    if (typeof body.title === "string") n.title = body.title;
    if (typeof body.body === "string") n.body = body.body;
    if (Array.isArray(body.subtitles)) n.subtitles = (body.subtitles as string[]).slice(0, 20).map((x) => x.slice(0, 60));
    n.edited_by_teacher = true;
    const { group_id: _g, ...note } = n;
    return out(note);
  }],
  ["POST", /^\/groups\/(\d+)\/export$/, async ({ params, body }) => {
    const g = getGroup(+params[0]);
    const photos = groupPhotos(g)
      .filter((p) => p.status === "done")
      .sort(
        (a, b) =>
          Number(a.id !== g.cover_photo_id) - Number(b.id !== g.cover_photo_id) ||
          Number(a.duplicate_of !== null) - Number(b.duplicate_of !== null) ||
          (b.quality_score ?? 0) - (a.quality_score ?? 0),
      );
    if (!photos.length) fail(400, "내보낼 사진이 없습니다");
    const url = await renderAlbum(body.template_id, photos, body.title || g.title, g.date.replaceAll("-", "."));
    return { id: s.exportUrls.length, url, template_id: body.template_id };
  }],

  // 영상
  ["GET", /^\/videos$/, ({ q }) => out(s.videos.filter((v) => v.class_id === Number(q.get("class_id"))).sort((a, b) => b.id - a.id))],
  ["POST", /^\/video-subtitles$/, async ({ body }): Promise<SubtitleDraft> => {
    await wait(1000);
    const tpl = seed.SUBTITLE_TEMPLATES[body.tone === "concise" ? "concise" : "warm"];
    const count = Math.max(1, Number(body.count) || 1);
    const subtitles = Array.from({ length: count }, (_, i) => tpl.subtitles[i % tpl.subtitles.length]);
    return { title: tpl.title, subtitles, provider: "demo", warnings: body.class_id ? nameWarnings(body.class_id, subtitles) : [] };
  }],
  ["POST", /^\/video-edit$/, async ({ body }) => {
    await wait(600);
    return videoEdit(String(body.instruction ?? ""), body.state?.clips?.length ?? 0, Number(body.current) || 1);
  }],

  // 설정·알림
  ["GET", /^\/settings$/, () => out(s.prefs)],
  ["PUT", /^\/settings$/, ({ body }) => {
    s.prefs = { ...s.prefs, ...body };
    return out(s.prefs);
  }],
  ["GET", /^\/notifications$/, () => {
    const items = [...s.notifications].sort((a, b) => b.created_at.localeCompare(a.created_at));
    return { items: out(items), unread: items.filter((n) => !n.read).length };
  }],
  ["POST", /^\/notifications\/(\d+)\/read$/, ({ params }) => {
    const n = s.notifications.find((x) => x.id === +params[0]);
    if (n) n.read = true;
  }],
  ["POST", /^\/notifications\/read-all$/, () => s.notifications.forEach((n) => (n.read = true))],
  ["POST", /^\/notifications\/client$/, ({ body }) => {
    const storage = body.event === "storage_full";
    s.notifications.push({
      id: ++ids.notification,
      kind: "storage",
      title: storage ? "영상을 브라우저에 보관하지 못했어요" : "편집 설정을 저장하지 못했어요",
      body: storage ? "브라우저 저장 공간이 부족합니다. 설정에서 보관 영상을 지워 주세요." : "잠시 뒤 다시 시도해 주세요.",
      link: String(body.link ?? "/"),
      created_at: nowIso(),
      read: false,
    });
  }],
];

export async function demoApi<T>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const method = (init.method ?? "GET").toUpperCase();
  const url = new URL(path, "http://demo.local");
  await wait(80); // 실제 요청처럼 한 박자 늦게 (상태 갱신 순서가 실제와 비슷하도록)
  for (const [m, re, handler] of routes) {
    if (m !== method) continue;
    const match = url.pathname.match(re);
    if (!match) continue;
    const res = await handler({ method, params: match.slice(1), q: url.searchParams, body: init.json ?? {} });
    return res as T;
  }
  fail(404, `데모에서 지원하지 않는 요청입니다 (${method} ${url.pathname})`);
}
