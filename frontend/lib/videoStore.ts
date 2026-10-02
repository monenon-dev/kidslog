// 만든 영상을 이 브라우저(IndexedDB)에만 보관한다. 서버로는 보내지 않는다.
// 반마다 마지막으로 만든 영상 하나만 둔다.

import type { Frame } from "./video";

export type StoredVideo = {
  classId: number;
  blob: Blob;
  title: string;
  seconds: number;
  ms: number;
  mb: number;
  thumb: string | null;
  frames: Frame[];
  createdAt: number;
};

const DB = "kidslog";
const STORE = "videos";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "classId" });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const req = fn(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(req.result);
      tx.onerror = tx.onabort = () => reject(tx.error ?? req.error);
    });
  } finally {
    db.close();
  }
}

/** 개인정보 보호 모드 등으로 저장소를 못 쓰면 null */
export async function loadVideo(classId: number): Promise<StoredVideo | null> {
  try {
    return ((await run("readonly", (s) => s.get(classId))) as StoredVideo | undefined) ?? null;
  } catch {
    return null;
  }
}

/** 실패(용량 부족 등)하면 false */
export async function saveVideo(v: StoredVideo): Promise<boolean> {
  try {
    await run("readwrite", (s) => s.put(v));
    return true;
  } catch {
    return false;
  }
}

export async function updateVideoThumb(classId: number, thumb: string): Promise<void> {
  const v = await loadVideo(classId);
  if (v) await saveVideo({ ...v, thumb });
}

export async function deleteVideo(classId: number): Promise<void> {
  try {
    await run("readwrite", (s) => s.delete(classId));
  } catch {}
}

/** 이 브라우저에 보관한 영상을 모두 지운다 (설정 화면, 계정 삭제) */
export async function clearAllVideos(): Promise<boolean> {
  try {
    await run("readwrite", (s) => s.clear());
    return true;
  } catch {
    return false;
  }
}

/** 보관 중인 영상 수와 용량 (MB) */
export async function storedVideoStats(): Promise<{ count: number; mb: number }> {
  try {
    const all = (await run("readonly", (s) => s.getAll())) as StoredVideo[];
    return { count: all.length, mb: all.reduce((t, v) => t + v.blob.size, 0) / 1024 / 1024 };
  } catch {
    return { count: 0, mb: 0 };
  }
}
