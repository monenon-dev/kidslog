// 데모 모드(NEXT_PUBLIC_DEMO=true) 샘플 데이터. 이름·사진 모두 가상이며 서버로 보내지 않는다.
// 날짜는 "오늘" 기준으로 계산해서 언제 열어도 최근 기록처럼 보이게 한다.
import type { Child, Group, Klass, Note, Photo, PhotoTag, User, VideoRecord } from "@/lib/types";

/** public/demo/photo-NN.{ext}. CC0 이미지로 바꾸면 "jpg"로 (scripts/gen-demo-images.mjs 참고) */
export const DEMO_IMG_EXT = "svg";
export const demoImg = (n: number) => `/demo/photo-${String(n).padStart(2, "0")}.${DEMO_IMG_EXT}`;

/** 백엔드 backend/app/ai/tags.py 의 공통 활동 태그 사전과 같음 */
export const DEFAULT_ACTIVITY_TAGS = [
  "미술", "바깥놀이", "급식", "낮잠", "책읽기", "신체활동", "음악·율동",
  "블록·조작놀이", "역할놀이", "과학·탐구", "물놀이", "행사", "기타",
];

export const LOW_QUALITY = 45;

export function isoDaysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** 시간대 표시 없는 로컬 시각 (샘플과 새로 올린 사진을 같은 기준으로 정렬하도록) */
export function localIso(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function at(daysAgo: number, hh: number, mm = 0): string {
  return `${isoDaysAgo(daysAgo)}T${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:00`;
}

// 화면에는 "{이름} 선생님"으로 나오므로 이름은 "데모"
export const DEMO_USER: User = { id: 1, email: "demo@kidslog.choseohee.com", name: "데모" };
export const DEMO_USER_CREATED = at(30, 9);

export const CHILDREN: Child[] = [
  { id: 1, name: "김하늘" },
  { id: 2, name: "이바다" },
  { id: 3, name: "박솔" },
  { id: 4, name: "최단비" },
  { id: 5, name: "정나래" },
  { id: 6, name: "강이슬" },
  { id: 7, name: "윤보람" },
  { id: 8, name: "한별" },
];

export const CLASS_ID = 1;

export const KLASS: Omit<Klass, "photo_count" | "children"> = { id: CLASS_ID, name: "연꽃반", created_at: at(30, 9, 10) };

type Seed = {
  daysAgo: number;
  time: [number, number];
  activity: string;
  caption: string;
  extra?: [string, PhotoTag["kind"]][];
  quality: number;
  sharpness?: number;
  brightness?: number;
  eyesClosed?: boolean;
  duplicateOf?: number;
  children?: number[];
  teacher?: boolean; // 선생님이 고친 활동 태그
};

// 순서 = 사진 id = public/demo/photo-NN 번호
const SEEDS: Seed[] = [
  // 샘플은 어제부터 (오늘 날짜는 데모에서 올린 사진 몫이라 항상 맨 앞에 보인다)
  // 어제: 미술 5, 바깥놀이 3 (아직 묶음 없음 → "자동 묶기" 대상)
  { daysAgo: 1, time: [10, 5], activity: "미술", caption: "책상 위에 물감과 붓이 놓여 있고 종이에 여러 색이 칠해져 있습니다.", extra: [["물감", "object"], ["집중", "mood"]], quality: 86, children: [1, 2] },
  { daysAgo: 1, time: [10, 8], activity: "미술", caption: "큰 종이에 둥근 무늬를 함께 그리는 장면입니다.", extra: [["도화지", "object"], ["즐거움", "mood"]], quality: 81, children: [3, 4, 5] },
  { daysAgo: 1, time: [10, 9], activity: "미술", caption: "붓질하는 손이 빠르게 움직여 화면이 흐립니다.", extra: [["흔들림", "quality"]], quality: 32, sharpness: 18 },
  { daysAgo: 1, time: [10, 15], activity: "미술", caption: "완성한 그림을 들어 보이는 장면입니다.", extra: [["작품", "object"], ["뿌듯함", "mood"]], quality: 88, children: [6, 7] },
  { daysAgo: 1, time: [10, 15], activity: "미술", caption: "완성한 그림을 들어 보이는 장면입니다.", extra: [["작품", "object"]], quality: 84, duplicateOf: 4, children: [6, 7] },
  { daysAgo: 1, time: [11, 20], activity: "바깥놀이", caption: "햇볕이 드는 놀이터 언덕에서 공을 굴리고 있습니다.", extra: [["공", "object"], ["활기", "mood"]], quality: 79, children: [1, 3] },
  { daysAgo: 1, time: [11, 25], activity: "바깥놀이", caption: "잔디밭에서 줄지어 걷는 장면입니다.", extra: [["잔디", "object"]], quality: 74, children: [2, 4, 5] },
  { daysAgo: 1, time: [11, 40], activity: "바깥놀이", caption: "그늘이 져서 전체적으로 어둡게 찍혔습니다.", extra: [["어두움", "quality"]], quality: 38, brightness: 22 },
  // 그저께: 음악·율동 4 (묶음 2), 급식 2
  { daysAgo: 2, time: [9, 50], activity: "음악·율동", caption: "음악에 맞춰 팔을 들고 율동하는 장면입니다.", extra: [["율동", "object"], ["신남", "mood"]], quality: 83, children: [1, 6] },
  { daysAgo: 2, time: [9, 55], activity: "음악·율동", caption: "둥글게 서서 박자에 맞춰 손뼉을 치고 있습니다.", extra: [["손뼉", "object"], ["눈감음", "quality"]], quality: 72, eyesClosed: true, children: [2, 3, 7] },
  { daysAgo: 2, time: [10, 0], activity: "음악·율동", caption: "작은 악기를 하나씩 들고 소리를 내 보는 장면입니다.", extra: [["악기", "object"]], quality: 80, children: [4, 5] },
  { daysAgo: 2, time: [10, 2], activity: "음악·율동", caption: "빠르게 움직이는 순간이라 흔들렸습니다.", extra: [["흔들림", "quality"]], quality: 40, sharpness: 25 },
  { daysAgo: 2, time: [12, 10], activity: "급식", caption: "식판에 밥과 반찬이 담겨 있습니다.", extra: [["식판", "object"]], quality: 77, children: [1, 2, 3] },
  { daysAgo: 2, time: [12, 20], activity: "급식", caption: "스스로 숟가락을 들고 먹는 장면입니다.", extra: [["숟가락", "object"], ["편안함", "mood"]], quality: 75, children: [4, 6] },
  // 사흘 전: 과학·탐구 4 (묶음 1), 책읽기 2
  { daysAgo: 3, time: [10, 30], activity: "과학·탐구", caption: "투명한 병 안에 거품이 올라오는 실험 장면입니다.", extra: [["실험", "object"], ["호기심", "mood"]], quality: 87, children: [1, 5] },
  { daysAgo: 3, time: [10, 35], activity: "과학·탐구", caption: "돋보기로 나뭇잎을 들여다보고 있습니다.", extra: [["돋보기", "object"]], quality: 82, children: [2, 6, 7] },
  { daysAgo: 3, time: [10, 40], activity: "과학·탐구", caption: "색이 바뀐 물을 비교하는 장면입니다.", extra: [["물", "object"], ["놀람", "mood"]], quality: 78, children: [3, 4] },
  { daysAgo: 3, time: [10, 50], activity: "과학·탐구", caption: "커튼을 친 교실이라 어둡게 찍혔습니다.", extra: [["어두움", "quality"]], quality: 41, brightness: 25 },
  { daysAgo: 3, time: [14, 0], activity: "책읽기", caption: "책꽂이 앞에서 그림책을 펼쳐 보고 있습니다.", extra: [["그림책", "object"], ["차분함", "mood"]], quality: 85, children: [1, 7] },
  { daysAgo: 3, time: [14, 10], activity: "책읽기", caption: "선생님이 읽어 주는 책을 함께 보고 있습니다.", extra: [["그림책", "object"]], quality: 76, teacher: true, children: [2, 5] },
];
// 한별(8)은 일부러 태그가 없다 → 아이별 균형에서 "적음"

function seedToPhoto(s: Seed, i: number): Photo {
  const id = i + 1;
  const created = at(s.daysAgo, s.time[0], s.time[1]);
  const tags: PhotoTag[] = [
    { tag: s.activity, kind: "activity", confidence: s.teacher ? 1 : 0.9, source: s.teacher ? "teacher" : "ai" },
    ...(s.extra ?? []).map(([tag, kind]): PhotoTag => ({ tag, kind, confidence: 0.7, source: "ai" })),
  ];
  return {
    id,
    class_id: CLASS_ID,
    url: demoImg(id),
    thumb_url: demoImg(id),
    original_filename: `demo-${String(id).padStart(2, "0")}.jpg`,
    status: "done",
    error: null,
    taken_at: created,
    created_at: created,
    date: isoDaysAgo(s.daysAgo),
    width: 800,
    height: 600,
    quality_score: s.quality,
    sharpness: s.sharpness ?? 70 + (id % 5) * 5,
    brightness: s.brightness ?? 60 + (id % 4) * 5,
    eyes_closed: s.eyesClosed ?? false,
    duplicate_of: s.duplicateOf ?? null,
    blur_applied: false,
    ai_provider: "demo",
    caption: s.caption,
    activity: s.activity,
    tags,
    child_ids: s.children ?? [],
    flagged: s.quality < LOW_QUALITY || !!s.eyesClosed || s.duplicateOf !== undefined,
  };
}

export const PHOTOS: Photo[] = SEEDS.map(seedToPhoto);

/** 묶음 기본 정보 (photo_count·cover_thumb_url 은 핸들러가 계산) */
export type GroupSeed = Omit<Group, "photo_count" | "cover_thumb_url"> & { photo_ids: number[] };

export const GROUPS: GroupSeed[] = [
  { id: 1, class_id: CLASS_ID, date: isoDaysAgo(3), title: "과학·탐구 — 거품 실험과 돋보기 관찰", activity: "과학·탐구", cover_photo_id: 15, photo_ids: [15, 16, 17, 18] },
  { id: 2, class_id: CLASS_ID, date: isoDaysAgo(2), title: "음악·율동 — 악기 연주와 손뼉 놀이", activity: "음악·율동", cover_photo_id: 9, photo_ids: [9, 10, 11, 12] },
];

export const NOTES: (Note & { group_id: number })[] = [
  {
    id: 1,
    group_id: 1,
    kind: "notice",
    memo: "병에 식초랑 베이킹소다 넣어서 거품 실험, 돋보기로 나뭇잎 관찰",
    title: "오늘은 꼬마 과학자가 되었어요",
    body: "오늘은 투명한 병에 재료를 넣고 거품이 보글보글 올라오는 모습을 함께 관찰했어요. 거품이 넘칠 때마다 아이들 눈이 동그래졌답니다. 이어서 돋보기로 나뭇잎의 잎맥을 들여다보며 \"줄무늬가 있어요!\" 하고 발견한 것을 친구들과 나누었어요. 댁에서도 주변의 작은 것들을 함께 들여다보며 이야기 나눠 주세요.",
    subtitles: [],
    tone: "warm",
    edited_by_teacher: false,
    created_at: at(3, 15, 0),
    warnings: [],
  },
  {
    id: 2,
    group_id: 2,
    kind: "notice",
    memo: "작은 악기 하나씩, 둥글게 서서 손뼉 박자 놀이",
    title: "음악·율동 활동 안내",
    body: "작은 악기를 하나씩 골라 소리를 내 보고, 둥글게 서서 박자에 맞춰 손뼉을 쳤습니다. 빠르기를 바꿔 가며 따라 하는 놀이에 모두 즐겁게 참여했습니다.",
    subtitles: [],
    tone: "concise",
    edited_by_teacher: true,
    created_at: at(2, 16, 0),
    warnings: [],
  },
];

type Draft = { title: string; body: string };

/** 문구 "생성" 때 돌려줄 미리 만든 초안 (활동별, 없으면 기타) */
export const NOTE_TEMPLATES: Record<string, { warm: Draft; concise: Draft }> = {
  미술: {
    warm: { title: "알록달록 물감 놀이를 했어요", body: "오늘은 물감과 붓으로 큰 종이에 마음껏 색을 칠해 보았어요. 색이 섞여 새로운 색이 나올 때마다 \"선생님, 이것 보세요!\" 하며 신나 했답니다. 완성한 그림을 친구들 앞에서 소개하는 시간도 가졌어요. 댁에서 오늘 어떤 색을 썼는지 물어봐 주세요." },
    concise: { title: "미술 활동 안내", body: "물감과 붓으로 종이에 색을 칠하고, 완성한 작품을 친구들에게 소개했습니다. 색이 섞이는 과정을 관찰하며 즐겁게 참여했습니다." },
  },
  바깥놀이: {
    warm: { title: "햇살 아래 신나게 뛰어놀았어요", body: "날씨가 좋아 바깥에서 공을 굴리고 잔디밭을 줄지어 걸어 보았어요. 서로 공을 주고받으며 차례를 기다리는 모습이 의젓했답니다. 바깥 활동 후에는 손을 깨끗이 씻고 물을 충분히 마셨어요." },
    concise: { title: "바깥놀이 안내", body: "놀이터에서 공 굴리기와 줄지어 걷기를 했습니다. 활동 후 손 씻기와 수분 섭취를 했습니다." },
  },
  "음악·율동": {
    warm: { title: "음악에 맞춰 몸을 움직였어요", body: "작은 악기로 소리를 내 보고, 노래에 맞춰 팔과 다리를 움직였어요. 빠르게, 느리게 박자를 바꿀 때마다 웃음소리가 가득했답니다." },
    concise: { title: "음악·율동 안내", body: "악기 소리 탐색과 노래에 맞춘 율동을 했습니다. 박자 바꾸기 놀이에 즐겁게 참여했습니다." },
  },
  급식: {
    warm: { title: "맛있게 냠냠 먹었어요", body: "오늘 점심도 스스로 숟가락을 들고 골고루 먹으려고 노력했어요. 처음 보는 반찬도 한 입씩 맛보는 용기를 냈답니다." },
    concise: { title: "급식 안내", body: "스스로 숟가락을 사용해 식사했고, 여러 반찬을 골고루 맛보았습니다." },
  },
  "과학·탐구": {
    warm: { title: "오늘은 꼬마 과학자가 되었어요", body: "거품이 올라오는 실험과 돋보기 관찰을 하며 \"왜 그럴까?\" 하고 함께 생각해 보았어요. 아이들이 발견한 것을 서로 이야기하며 즐거워했답니다." },
    concise: { title: "과학·탐구 활동 안내", body: "거품 실험과 돋보기 관찰을 했습니다. 관찰한 내용을 친구들과 이야기 나누었습니다." },
  },
  책읽기: {
    warm: { title: "그림책 속으로 여행을 떠났어요", body: "책꽂이에서 마음에 드는 그림책을 골라 펼쳐 보고, 선생님이 읽어 주는 이야기에 귀 기울였어요. 다음 장면을 상상해 말해 보는 친구들도 있었답니다." },
    concise: { title: "책읽기 활동 안내", body: "스스로 고른 그림책을 보고, 선생님과 함께 이야기책을 읽었습니다." },
  },
  기타: {
    warm: { title: "오늘 하루도 즐겁게 보냈어요", body: "친구들과 함께 여러 활동에 참여하며 즐거운 하루를 보냈어요. 자세한 이야기는 댁에서 아이와 함께 나눠 주세요." },
    concise: { title: "활동 안내", body: "오늘 계획한 활동에 즐겁게 참여했습니다." },
  },
};

/** 영상 자막 초안 (클립 수만큼 앞에서부터 사용, 모자라면 반복) */
export const SUBTITLE_TEMPLATES = {
  warm: { title: "오늘 우리 반 이야기", subtitles: ["오늘도 신나는 하루 시작!", "다 같이 힘을 모아요", "우와, 이것 좀 보세요!", "친구랑 함께라서 더 즐거워요", "멋지게 해냈어요", "내일 또 만나요!"] },
  concise: { title: "오늘의 활동", subtitles: ["활동 시작", "함께 준비하기", "관찰하기", "친구와 함께", "완성", "마무리"] },
};

/** 데모 업로드 사진에 차례로 붙일 분석 결과 (파일은 어디로도 보내지 않음) */
export const UPLOAD_RESULTS: { activity: string; caption: string; extra: [string, PhotoTag["kind"]][]; quality: number }[] = [
  { activity: "블록·조작놀이", caption: "(데모 분석) 블록을 높이 쌓아 올린 장면으로 정했습니다.", extra: [["블록", "object"], ["집중", "mood"]], quality: 80 },
  { activity: "바깥놀이", caption: "(데모 분석) 야외에서 뛰어노는 장면으로 정했습니다.", extra: [["놀이터", "object"]], quality: 74 },
  { activity: "미술", caption: "(데모 분석) 색칠 활동 장면으로 정했습니다.", extra: [["크레파스", "object"]], quality: 83 },
  { activity: "역할놀이", caption: "(데모 분석) 소꿉놀이 장면으로 정했습니다.", extra: [["소꿉", "object"], ["즐거움", "mood"]], quality: 69 },
  { activity: "책읽기", caption: "(데모 분석) 책을 보는 장면으로 정했습니다.", extra: [["그림책", "object"]], quality: 78 },
];

export const VIDEOS: VideoRecord[] = [
  { id: 3, class_id: CLASS_ID, group_id: null, title: "음악·율동 하이라이트", clip_count: 5, input_total_mb: 84.2, output_seconds: 62.5, processing_ms: 48_300, resolution: "1280x720", user_agent: "Demo (Windows; Chrome)", created_at: at(2, 17, 5) },
  { id: 2, class_id: CLASS_ID, group_id: null, title: "거품 실험 모음", clip_count: 4, input_total_mb: 61.7, output_seconds: 48.0, processing_ms: 39_800, resolution: "1280x720", user_agent: "Demo (Android; Chrome)", created_at: at(3, 16, 40) },
  { id: 1, class_id: CLASS_ID, group_id: null, title: "지난주 바깥놀이", clip_count: 6, input_total_mb: 102.9, output_seconds: 75.0, processing_ms: 66_100, resolution: "1280x720", user_agent: "Demo (macOS; Safari)", created_at: at(7, 15, 20) },
];

export type DemoNotification = { id: number; kind: string; title: string; body: string; link: string; created_at: string; read: boolean };

export const NOTIFICATIONS: DemoNotification[] = [
  { id: 1, kind: "low_photos", title: "사진이 적은 아이가 있어요", body: "연꽃반 한별 — 최근 7일 사진 0장", link: `/classes/${CLASS_ID}?tab=balance`, created_at: at(1, 12, 0), read: false },
  { id: 2, kind: "analysis", title: "사진 분석이 끝났어요", body: "연꽃반 사진 8장 분석 완료 (확인 필요 2장)", link: `/classes/${CLASS_ID}?tab=gallery`, created_at: at(1, 11, 45), read: false },
  { id: 3, kind: "ai_limit", title: "오늘 AI 사용량 80%", body: "하루 상한 300회 중 240회를 썼어요. (데모 예시)", link: "/settings", created_at: at(1, 18, 0), read: true },
];
