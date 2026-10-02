"use client";

import { AppHeader, RequireAuth } from "@/components/AppHeader";
import { VideoMaker } from "@/components/VideoMaker";

/** 반과 상관없이 따로 만드는 영상 */
export default function VideoPage() {
  return (
    <RequireAuth>
      <AppHeader>반 없이 영상 만들기</AppHeader>
      <main className="mx-auto max-w-6xl px-4 py-6">
        <VideoMaker klass={null} />
      </main>
    </RequireAuth>
  );
}
