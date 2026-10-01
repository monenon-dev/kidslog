# KidsLog

아동 대상 현장의 교사·강사가 찍은 사진·영상을 AI로 정리하고, 학부모 전달용 영상과 문구를 빠르게 만드는 웹 서비스.
기획 근거와 범위는 [KidsLog_계획서.md](KidsLog_계획서.md) (v0.4) 참고.

> **데모 서비스입니다. 실제 아동 사진·영상을 업로드하지 마세요.**

## 구성

```
frontend/  Next.js 16 + TypeScript + Tailwind v4   (브라우저 영상 처리: ffmpeg.wasm)
backend/   FastAPI + SQLAlchemy + Pillow + Claude API
```

```
브라우저 ──/api/*──▶ Next.js rewrite ──▶ FastAPI
   │                                     ├─ 서명 URL 발급, 분석 작업(BackgroundTasks), 결과 저장
   └──서명 URL로 직접 PUT──▶ R2 (개발: 로컬 스토리지가 같은 방식 흉내)
```

## 실행

```bash
# 백엔드 (http://localhost:8000, 문서: /docs)
cd backend
python -m venv .venv && .venv/Scripts/activate      # macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env                                  # 선택. 없으면 SQLite + 로컬 스토리지 + 모의 AI
uvicorn app.main:app --reload --port 8000

# 프론트엔드 (http://localhost:3000)
cd frontend
npm install            # postinstall 이 ffmpeg 워커를 public/ffmpeg 로 복사
npm run dev
```

- `ANTHROPIC_API_KEY` 가 없으면 **모의 분석**(색상 기반 휴리스틱)으로 동작한다. 화면 흐름 확인용이며 정확도 평가에는 쓰지 않는다.
- 백엔드 위치가 다르면 프론트 실행 시 `API_URL=https://...` 지정.
- 테스트: `cd backend && pytest`

## MVP 기능 (계획서 3장 대응)

| 계획서 항목 | 구현 |
|---|---|
| 회원가입/로그인, 반 생성 | JWT access(메모리) + httpOnly refresh 쿠키, 반 CRUD |
| 사진 다중 업로드 (Presigned URL) | 서명 URL 발급 → 브라우저가 스토리지로 직접 병렬 PUT(동시 4개, 재시도) → 완료 알림 → 분석 등록. 실패분만 재전송 |
| AI 자동 태깅 | Claude 비전 + JSON 스키마 강제(활동은 태그 사전 enum). 공통 태그 사전 + 사용자 정의 태그(다음 분석부터 반영). 교사가 태그 수정 시 교사 태그 우선 |
| 품질 점수 | 규칙 기반(Laplacian 분산 흔들림 + 노출) + LLM 눈감음 판정, dHash로 같은 날 중복 사진 탐지. 갤러리 "확인 필요"/"잘 나온 사진" 필터 |
| 아이별 균형 보기 | 얼굴 인식 없음. 명단 등록 → 사진에 수동 태그(여러 장 한 번에) → 기간별 아이당 장수, 평균 70% 미만 "적음" 표시 |
| 영상 합치기 (브라우저) | ffmpeg.wasm: 클립 순서·길이 제한 → 720p 맞춤 → 원본 소리 제거 → 클립별 자막·제목(OFL 한글 글꼴) → 배경음악(즉석 합성음 또는 사용자 음원) → 썸네일 후보 점수화·추천 → 제목 얹은 썸네일 PNG. **영상은 서버로 가지 않고 처리 시간 등 숫자만 기록** |
| 문구·자막 초안 | 묶음의 태그·설명 + 교사 메모 → 알림장/자막 초안(따뜻한/간결한). 교사 수정 저장, 자막은 영상 만들기로 전달. 반 명단 이름이 들어가면 경고 |
| 갤러리 조회 + 태그 검색 | 날짜·활동·품질·아이 필터, 설명/태그 텍스트 검색 |
| 앨범 이미지 내보내기 | Pillow 그리드(4/6/9장), 대표 사진 → 품질 순 |
| 날짜 기준 자동 그룹핑 | 같은 날 + 대표 활동 기준. 재실행해도 이미 묶인 사진은 유지 |

선택 항목(임베딩 기반 유사 사진·자연어 검색)은 아직 없다. `photo_meta.embedding` 자리만 있고, 현재 검색은 설명·태그 텍스트 매칭이다.

## 개인정보 설계 (계획서 4장)

- 얼굴로 아이를 식별하는 기능 없음. 아이별 집계는 교사의 수동 태그만 사용.
- 아이 이름은 AI에 보내지 않는다. 문구 프롬프트는 이름을 쓰지 말라고 지시하고, 생성 결과에 명단 이름이 있으면 경고.
- AI 전송본은 1024px로 리사이즈, 업로드 화면에서 **"AI 분석 전 얼굴 흐리게"** 선택 가능(`pip install opencv-python-headless` 필요, 없으면 원본 사본 전송).
- 저장소 키에 원본 파일명을 넣지 않음. 원본·썸네일은 비공개 + 만료 서명 URL(기본 15분)로만 접근.
- 영상 편집은 전부 브라우저 안에서 처리.
- 사용자당 하루 AI 호출 상한(`AI_DAILY_LIMIT`), 초과 시 모의 분석으로 대체.
- 화면 상단 "실제 아동 사진 업로드 금지 (데모)" 안내.

## AI 호출

- 모델: `claude-opus-5-5` (`CLAUDE_MODEL`로 변경). 태깅은 effort `low`, 문구는 `medium`.
- 구조화 출력(`output_config.format` JSON 스키마)으로 형식 강제.
- 안전 분류기 거절 시 서버측 폴백(`fallbacks: "default"`, beta `server-side-fallback-2026-07-01`)을 켜 두었다. 최종 `refusal`이면 사진은 "실패"로 표시되고 다시 분석할 수 있다.
- 프롬프트: 관찰된 것만 서술, 개인 특정 표현 금지 (`backend/app/ai/tagger.py`, `writer.py`).

## 평가 (계획서 5장)

```bash
cd backend
# eval/data/labels.csv : filename,activity,scene   (scene은 선택: 실내/야외 등)
python -m eval.run_eval --images eval/data/images --labels eval/data/labels.csv
python -m eval.run_eval --images ... --labels ... --blur                      # 얼굴 블러 유무 비교
python -m eval.run_eval --images ... --labels ... --model claude-sonnet-5-5   # 모델 비교
```

활동별·장면별 정확도와 자주 틀린 조합을 `eval/results/*.md`(README·Notion에 붙여넣기용)와 `.json`으로 저장한다.
`eval/data/` 의 두 장은 형식 예시용 합성 이미지다. 테스트셋 150~200장은 라이선스를 확인한 이미지로 직접 채워야 한다.

영상 처리 성능(4주차 측정 기준)은 "영상 만들기" 탭에서 만들 때마다 기기·클립 수·입력 용량·처리 시간이 `videos` 테이블에 쌓인다.

## 배포 메모

- 프론트: Vercel. 환경변수 `API_URL` = 백엔드 주소.
- 백엔드: Railway / Cloud Run. `DATABASE_URL`(Neon, `pip install psycopg[binary]`), `JWT_SECRET`, `COOKIE_SECURE=true`, `STORAGE_BACKEND=r2` + R2 키, `ANTHROPIC_API_KEY`.
- R2 버킷은 비공개로 두고, 브라우저 직접 업로드를 위해 버킷 CORS에 프론트 도메인의 `PUT`(헤더 `Content-Type`)과 `GET`을 허용.
- 스키마는 시작 시 `create_all`로 만든다. 운영 DB에서 스키마를 바꿀 때는 Alembic 도입 필요.
- 분석은 FastAPI BackgroundTasks로 돈다. 서버가 재시작되면 진행 중이던 사진은 "분석 중"에 남을 수 있으니 부하가 커지면 RQ/Arq 큐로 옮긴다.

## 라이선스 자료

| 자료 | 라이선스 | 출처 |
|---|---|---|
| 나눔고딕 Bold (앨범 이미지, 영상 자막) | SIL OFL 1.1 (`backend/fonts/OFL.txt`) | github.com/google/fonts |
| 주아, 도현 (영상 자막·썸네일, 실행 시 CDN에서 로드) | SIL OFL 1.1 | github.com/google/fonts |
| 내장 배경음 | 해당 없음 (ffmpeg `aevalsrc`로 즉석 합성) | `frontend/lib/video.ts` |
| ffmpeg.wasm core | GPL (x264 포함 빌드) | @ffmpeg/core 0.12.10 |
