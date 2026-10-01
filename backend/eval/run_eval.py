"""활동 태깅 정확도 평가 (계획서 5장 평가 계획).

테스트셋: 실제 아동 사진이 아닌 이미지(성인 동의 촬영본, 무료 라이선스, 생성 이미지)와 정답 라벨 CSV.

    eval/data/images/*.jpg
    eval/data/labels.csv      # filename,activity,scene(선택: 실내/야외 등)

사용 예:
    python -m eval.run_eval --images eval/data/images --labels eval/data/labels.csv
    python -m eval.run_eval --images ... --labels ... --blur          # 얼굴 블러 후 정확도 비교
    python -m eval.run_eval --images ... --labels ... --model claude-sonnet-5-5

결과는 eval/results/ 에 마크다운 표와 JSON으로 저장된다 (README·Notion에 그대로 붙여넣기).
"""

import argparse
import csv
import json
import os
import sys
import time
from collections import Counter, defaultdict
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.ai import image_ops  # noqa: E402
from app.ai.llm import LLMError  # noqa: E402
from app.ai.tagger import tag_image  # noqa: E402
from app.ai.tags import tag_dictionary  # noqa: E402


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--images", required=True)
    ap.add_argument("--labels", required=True)
    ap.add_argument("--provider", default="claude", choices=["claude", "mock"])
    ap.add_argument("--model", default=None, help="CLAUDE_MODEL 덮어쓰기")
    ap.add_argument("--blur", action="store_true", help="전송 전 얼굴 블러 (opencv 필요)")
    ap.add_argument("--max-side", type=int, default=1024)
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--out", default=str(Path(__file__).parent / "results"))
    args = ap.parse_args()

    if args.model:
        os.environ["CLAUDE_MODEL"] = args.model
        from app.config import get_settings

        get_settings.cache_clear()

    from app.config import get_settings

    model = get_settings().claude_model if args.provider == "claude" else "mock"

    with open(args.labels, encoding="utf-8-sig") as f:
        rows = list(csv.DictReader(f))
    if args.limit:
        rows = rows[: args.limit]

    tags = tag_dictionary(sorted({r["activity"] for r in rows} - set(tag_dictionary([]))))
    results = []
    t0 = time.time()
    for i, r in enumerate(rows, 1):
        path = Path(args.images) / r["filename"]
        img = image_ops.resized(image_ops.open_image(path.read_bytes()), args.max_side)
        blurred = False
        if args.blur:
            img, blurred = image_ops.blur_faces(img)
        try:
            res = tag_image(img, tags, args.provider)
            pred, conf, err = res.activity, res.confidence, None
        except LLMError as e:
            pred, conf, err = None, 0.0, str(e)
        ok = pred == r["activity"]
        results.append({**r, "pred": pred, "confidence": conf, "correct": ok, "blurred": blurred, "error": err})
        print(f"[{i}/{len(rows)}] {r['filename']}: {r['activity']} -> {pred} {'O' if ok else 'X'}", flush=True)
    elapsed = time.time() - t0

    total = len(results)
    correct = sum(x["correct"] for x in results)
    by_label: dict[str, list[bool]] = defaultdict(list)
    by_scene: dict[str, list[bool]] = defaultdict(list)
    confusion: Counter = Counter()
    for x in results:
        by_label[x["activity"]].append(x["correct"])
        if x.get("scene"):
            by_scene[x["scene"]].append(x["correct"])
        if not x["correct"]:
            confusion[(x["activity"], x["pred"])] += 1

    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    name = f"{stamp}_{model}{'_blur' if args.blur else ''}"
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)

    md = [
        f"# 태깅 평가 {name}",
        "",
        f"- 모델: `{model}` / 얼굴 블러: {'예' if args.blur else '아니오'} / 리사이즈: {args.max_side}px",
        f"- 전체 정확도: **{correct}/{total} = {correct / max(total, 1):.1%}**",
        f"- 오류(호출 실패): {sum(1 for x in results if x['error'])}건 / 소요: {elapsed:.0f}초",
        "",
        "## 활동별 정확도",
        "",
        "| 활동 | 장수 | 정확도 |",
        "|---|---|---|",
    ]
    for label, oks in sorted(by_label.items(), key=lambda kv: sum(kv[1]) / len(kv[1])):
        md.append(f"| {label} | {len(oks)} | {sum(oks) / len(oks):.1%} |")
    if by_scene:
        md += ["", "## 장면별 정확도", "", "| 장면 | 장수 | 정확도 |", "|---|---|---|"]
        for scene, oks in sorted(by_scene.items()):
            md.append(f"| {scene} | {len(oks)} | {sum(oks) / len(oks):.1%} |")
    if confusion:
        md += ["", "## 자주 틀린 조합", "", "| 정답 | 예측 | 건수 |", "|---|---|---|"]
        for (gold, pred), n in confusion.most_common(15):
            md.append(f"| {gold} | {pred} | {n} |")

    (out / f"{name}.md").write_text("\n".join(md) + "\n", encoding="utf-8")
    (out / f"{name}.json").write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding="utf-8")
    print("\n".join(md))
    print(f"\n저장: {out / name}.md")


if __name__ == "__main__":
    main()
