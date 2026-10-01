export type User = { id: number; email: string; name: string };

export type Child = { id: number; name: string };

export type Klass = {
  id: number;
  name: string;
  created_at: string;
  photo_count: number;
  children: Child[];
};

export type PhotoTag = { tag: string; kind: "activity" | "object" | "mood" | "quality"; confidence: number; source: "ai" | "teacher" };

export type PhotoStatus = "pending" | "uploaded" | "analyzing" | "done" | "failed";

export type Photo = {
  id: number;
  class_id: number;
  url: string | null;
  thumb_url: string | null;
  original_filename: string;
  status: PhotoStatus;
  error: string | null;
  taken_at: string | null;
  created_at: string;
  date: string;
  width: number | null;
  height: number | null;
  quality_score: number | null;
  sharpness: number | null;
  brightness: number | null;
  eyes_closed: boolean | null;
  duplicate_of: number | null;
  blur_applied: boolean;
  ai_provider: string | null;
  caption: string;
  activity: string | null;
  tags: PhotoTag[];
  child_ids: number[];
  flagged: boolean;
};

export type Balance = {
  rows: { child_id: number; name: string; count: number; low: boolean }[];
  average: number;
  untagged_photos: number;
  total_photos: number;
};

export type Note = {
  id: number;
  kind: "notice" | "subtitle";
  memo: string;
  title: string;
  body: string;
  subtitles: string[];
  tone: "warm" | "concise";
  edited_by_teacher: boolean;
  created_at: string;
  warnings: string[];
};

export type Group = {
  id: number;
  class_id: number;
  date: string;
  title: string;
  activity: string | null;
  cover_photo_id: number | null;
  cover_thumb_url: string | null;
  photo_count: number;
};

export type GroupDetail = Group & { photos: Photo[]; notes: Note[] };

export type Tags = { default: string[]; custom: string[]; all: string[] };

export type VideoRecord = {
  id: number;
  class_id: number;
  group_id: number | null;
  title: string;
  clip_count: number;
  input_total_mb: number;
  output_seconds: number;
  processing_ms: number;
  resolution: string;
  user_agent: string;
  created_at: string;
};
