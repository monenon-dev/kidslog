import io

import numpy as np
from fastapi.testclient import TestClient
from PIL import Image, ImageFilter

from app.main import app

client = TestClient(app)


def _jpeg(img: Image.Image) -> bytes:
    buf = io.BytesIO()
    img.save(buf, "JPEG", quality=90)
    return buf.getvalue()


def _sharp_green() -> bytes:
    rng = np.random.default_rng(0)
    arr = np.zeros((600, 800, 3), dtype=np.uint8)
    arr[..., 1] = 160
    arr[..., 0] = 60
    arr += rng.integers(0, 60, arr.shape, dtype=np.uint8)  # 고주파 질감 → 선명
    return _jpeg(Image.fromarray(arr))


def _blurry_colorful() -> bytes:
    rng = np.random.default_rng(1)
    arr = rng.integers(0, 255, (60, 80, 3), dtype=np.uint8)
    img = Image.fromarray(arr).resize((800, 600), Image.Resampling.BICUBIC).filter(ImageFilter.GaussianBlur(12))
    return _jpeg(img)


def _signup() -> dict:
    r = client.post("/auth/signup", json={"email": "t@example.com", "password": "password123", "name": "선생님"})
    assert r.status_code == 201, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def test_full_flow():
    h = _signup()

    # 로그인 / refresh 쿠키
    r = client.post("/auth/login", json={"email": "t@example.com", "password": "password123"})
    assert r.status_code == 200
    assert client.post("/auth/refresh").status_code == 200
    assert client.post("/auth/login", json={"email": "t@example.com", "password": "wrong-pass"}).status_code == 401

    # 프로필: 이름 바꾸기, 비밀번호 바꾸기, 요약
    h0 = {"Authorization": f"Bearer {r.json()['access_token']}"}
    assert client.patch("/auth/me", json={"name": "  새 이름 "}, headers=h0).json()["name"] == "새 이름"
    assert client.post("/auth/password", json={"current_password": "wrong-pass", "new_password": "newpass123"}, headers=h0).status_code == 400
    assert client.post("/auth/password", json={"current_password": "password123", "new_password": "newpass123"}, headers=h0).status_code == 204
    assert client.post("/auth/login", json={"email": "t@example.com", "password": "newpass123"}).status_code == 200
    assert client.post("/auth/password", json={"current_password": "newpass123", "new_password": "password123"}, headers=h0).status_code == 204
    assert client.get("/auth/me/stats", headers=h0).json()["class_count"] == 0

    # 반 + 아이 명단
    k = client.post("/classes", json={"name": "햇살반"}, headers=h).json()
    kids = client.post(f"/classes/{k['id']}/children", json={"names": ["가온", "나래", "다온"]}, headers=h).json()
    assert [c["name"] for c in kids] == ["가온", "나래", "다온"]

    # 업로드: presign → PUT → complete
    files = [_sharp_green(), _sharp_green(), _blurry_colorful()]
    pres = client.post(
        "/photos/presign",
        json={
            "class_id": k["id"],
            "files": [{"filename": f"{i}.jpg", "content_type": "image/jpeg", "size": len(b)} for i, b in enumerate(files)],
        },
        headers=h,
    ).json()
    assert len(pres) == 3
    for p, data in zip(pres, files):
        r = client.put(p["upload_url"], content=data, headers={"Content-Type": "image/jpeg"})
        assert r.status_code == 200, r.text
    # 서명이 다른 키로는 업로드 불가
    bad = pres[0]["upload_url"].replace(".jpg", "x.jpg")
    assert client.put(bad, content=b"x").status_code == 403

    ids = [p["photo_id"] for p in pres]
    r = client.post("/photos/complete", json={"photo_ids": ids}, headers=h).json()
    assert r["queued"] == ids  # TestClient는 BackgroundTasks를 응답 직후 동기 실행한다

    photos = client.get(f"/photos?class_id={k['id']}", headers=h).json()
    assert photos["total"] == 3
    by_id = {p["id"]: p for p in photos["items"]}
    assert all(p["status"] == "done" for p in by_id.values()), [p["error"] for p in by_id.values()]
    assert by_id[ids[0]]["activity"] == "바깥놀이"
    assert by_id[ids[0]]["quality_score"] > by_id[ids[2]]["quality_score"]
    assert by_id[ids[1]]["duplicate_of"] == ids[0]  # 같은 장면 연속 촬영
    assert by_id[ids[1]]["flagged"] and by_id[ids[2]]["flagged"]
    assert client.get(by_id[ids[0]]["thumb_url"]).status_code == 200

    flagged = client.get(f"/photos?class_id={k['id']}&quality=flagged", headers=h).json()
    assert {p["id"] for p in flagged["items"]} == {ids[1], ids[2]}
    assert client.get(f"/photos?class_id={k['id']}&tag=바깥놀이", headers=h).json()["total"] >= 2
    assert client.get(f"/photos?class_id={k['id']}&q=야외", headers=h).json()["total"] >= 2

    # 교사 태그 수정
    r = client.put(f"/photos/{ids[2]}/tags", json={"activity": ["미술"]}, headers=h).json()
    assert r["activity"] == "미술"

    # 아이 수동 태그 + 균형 대시보드
    client.post("/photos/children/bulk", json={"photo_ids": ids, "child_id": kids[0]["id"]}, headers=h)
    client.put(f"/photos/{ids[0]}/children", json={"child_ids": [kids[0]["id"], kids[1]["id"]]}, headers=h)
    bal = client.get(f"/classes/{k['id']}/balance", headers=h).json()
    counts = {r["name"]: (r["count"], r["low"]) for r in bal["rows"]}
    assert counts == {"가온": (3, False), "나래": (1, False), "다온": (0, True)}
    assert bal["untagged_photos"] == 0

    # 자동 묶음
    groups = client.post("/groups/auto", json={"class_id": k["id"]}, headers=h).json()
    assert {g["activity"] for g in groups} == {"바깥놀이", "미술"}
    outdoor = next(g for g in groups if g["activity"] == "바깥놀이")
    assert outdoor["photo_count"] == 2 and outdoor["cover_photo_id"] == ids[0]
    assert client.post("/groups/auto", json={"class_id": k["id"]}, headers=h).json() == []  # 재실행 시 중복 없음

    # 문구 초안 → 교사 수정
    note = client.post(
        f"/groups/{outdoor['id']}/note", json={"memo": "가온이가 모래놀이를 했어요", "kind": "subtitle", "subtitle_count": 2}, headers=h
    ).json()
    assert len(note["subtitles"]) == 2
    edited = client.patch(f"/notes/{note['id']}", json={"body": "수정본"}, headers=h).json()
    assert edited["edited_by_teacher"] and edited["body"] == "수정본"

    # 앨범 내보내기
    ex = client.post(f"/groups/{outdoor['id']}/export", json={"template_id": "grid4"}, headers=h).json()
    img = client.get(ex["url"])
    assert img.status_code == 200 and img.headers["content-type"] == "image/jpeg"

    # 영상 메타데이터 등록 (영상 파일은 서버로 오지 않음)
    v = client.post(
        "/videos",
        json={"class_id": k["id"], "group_id": outdoor["id"], "clip_count": 4, "input_total_mb": 120.5, "output_seconds": 62, "processing_ms": 45000},
        headers=h,
    )
    assert v.status_code == 201
    assert len(client.get(f"/videos?class_id={k['id']}", headers=h).json()) == 1

    # 영상 편집 설정 자동 저장 (파일은 이름·크기만)
    assert client.get(f"/classes/{k['id']}/video-draft", headers=h).json()["data"] is None
    draft = {
        "title": "가을 숲",
        "max_sec": 10,
        "font": "gaegu",
        "sub_style": {"size": "l", "color": "#7CF0FF", "effect": "outline", "position": "custom", "at_x": 0.3, "at_y": 0.35},
        "music": "calm",
        "clips": [{"name": "a.mp4", "size": 1234, "duration": 3.2, "subtitle": "도토리를 찾았어요"}],
    }
    assert client.put(f"/classes/{k['id']}/video-draft", json=draft, headers=h).status_code == 200
    got = client.get(f"/classes/{k['id']}/video-draft", headers=h).json()["data"]
    assert got["clips"][0]["subtitle"] == "도토리를 찾았어요" and got["sub_style"]["at_x"] == 0.3
    bad = {**draft, "sub_style": {**draft["sub_style"], "color": "red"}}
    assert client.put(f"/classes/{k['id']}/video-draft", json=bad, headers=h).status_code == 422

    # 반 없이 만드는 영상의 편집 설정 (사용자마다 하나)
    assert client.get("/video-draft", headers=h).json()["data"] is None
    assert client.put("/video-draft", json=draft, headers=h).status_code == 200
    assert client.get("/video-draft", headers=h).json()["data"]["title"] == "가을 숲"

    # 자막 초안은 영상 만들기에서 메모로 만든다
    s = client.post("/video-subtitles", json={"memo": "숲에서 도토리 줍기", "count": 3, "class_id": k["id"]}, headers=h)
    assert s.status_code == 200 and len(s.json()["subtitles"]) == 3
    assert client.post("/video-subtitles", json={"memo": "", "count": 3}, headers=h).status_code == 422

    # 말로 하는 편집 부탁 (AI 키 없으면 규칙 기반)
    state = {"title": "", "clips": [{"subtitle": "", "seconds": 3}, {"subtitle": "", "seconds": 4}]}
    e = client.post(
        "/video-edit",
        json={"instruction": "2번 자막을 '모래성 완성!'으로 바꾸고 글자는 노랗게, 위로 올려줘", "state": state, "current": 1},
        headers=h,
    ).json()
    assert e["subtitles"] == [{"clip": 2, "text": "모래성 완성!"}]
    assert e["color"] == "#FFE066" and e["position"] == "top"
    e = client.post("/video-edit", json={"instruction": "자막 '도토리 찾기'", "state": state, "current": 1}, headers=h).json()
    assert e["subtitles"] == [{"clip": 1, "text": "도토리 찾기"}]
    e = client.post("/video-edit", json={"instruction": "배경음악 잔잔하게", "state": state}, headers=h).json()
    assert e["music"] == "calm" and e["effect"] is None

    # 다른 사용자 접근 차단
    r = client.post("/auth/signup", json={"email": "other@example.com", "password": "password123", "name": "다른"})
    h2 = {"Authorization": f"Bearer {r.json()['access_token']}"}
    assert client.get(f"/photos/{ids[0]}", headers=h2).status_code == 404
    assert client.get(f"/groups/{outdoor['id']}", headers=h2).status_code == 404
    assert client.get(f"/classes/{k['id']}/video-draft", headers=h2).status_code == 404
    assert client.put(f"/classes/{k['id']}/video-draft", json=draft, headers=h2).status_code == 404
    assert client.get("/video-draft", headers=h2).json()["data"] is None
    assert client.post("/video-subtitles", json={"memo": "x", "count": 1, "class_id": k["id"]}, headers=h2).status_code == 404

    # 삭제
    assert client.delete(f"/photos/{ids[0]}", headers=h).status_code == 204
    assert client.get(f"/photos/{ids[1]}", headers=h).json()["duplicate_of"] is None
