"""공식정리 md → 앱 데이터(v1/data/cards.json) 변환.

사용법: py tools/convert.py [md 경로]
md의 `- **소제목**` 하나가 카드 하나가 된다. 결과는 v1/data, 그림은 v1/images-gpt.
"""
import json
import re
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
APP = ROOT / "v1"
DEFAULT_MD = ROOT.parent / "artifacts" / "소방설비기사_기계_공식정리(수정 2차).md"
REVIEW_MARKS = ("⟨?⟩", "⟨판독불가⟩", "⚠️ 검수")
AI_NOTE_PREFIX = "그림 구성 메모:"


def clean_cell(text):
    return re.sub(r"==|\*\*", "", text).strip()


def parse_tables(lines):
    tables, i = [], 0
    while i < len(lines):
        if lines[i].lstrip().startswith("|") and i + 1 < len(lines) and re.match(r"^\s*\|[\s:|-]+\|\s*$", lines[i + 1]):
            rows = []
            j = i
            while j < len(lines) and lines[j].lstrip().startswith("|"):
                if j != i + 1:
                    rows.append([clean_cell(c) for c in lines[j].strip().strip("|").split("|")])
                j += 1
            tables.append({"header": rows[0], "rows": rows[1:]})
            i = j
        else:
            i += 1
    return tables


def build_card(meta, head, body_lines, index):
    m = re.match(r"^- \*\*(.+?)\*\*\s*(.*)$", head)
    title, rest = m.group(1).strip(), m.group(2).strip()
    lines = ([rest] if rest else []) + body_lines
    while lines and not lines[-1].strip():
        lines.pop()
    ai_notes = [l.strip()[len(AI_NOTE_PREFIX):].strip() for l in lines if l.strip().startswith(AI_NOTE_PREFIX)]
    lines = [l for l in lines if not l.strip().startswith(AI_NOTE_PREFIX)]
    body = "\n".join(lines).strip("\n")
    full = head + "\n" + body
    return {
        "id": f"c{index:03d}",
        **meta,
        "title": title,
        "body": body,
        "star": "★" in full,
        "review": any(mark in full for mark in REVIEW_MARKS),
        "formulas": [formula.strip() for formula in re.findall(r"\$\$(.+?)\$\$", body, re.DOTALL)],
        "tables": parse_tables(lines),
        "images": re.findall(r"!\[[^\]]*\]\(([^)]+)\)", body),
        "aiNotes": ai_notes,
    }


def convert(md_path):
    lines = md_path.read_text(encoding="utf-8").splitlines()
    meta = {"part": "", "chapter": "", "group": ""}
    cards, head, body, head_is_heading = [], None, [], False

    def flush():
        # 소제목 없이 제목 바로 아래 내용이 있으면 제목을 카드 제목으로 쓴다
        if head is not None and (not head_is_heading or any(l.strip() for l in body)):
            cards.append(build_card(dict(meta), head, body, len(cards) + 1))

    for line in lines:
        heading = re.match(r"^(#{1,3}) (.+)$", line)
        if heading or line.startswith("- **"):
            flush()
            head, body, head_is_heading = None, [], bool(heading)
            if heading:
                level, text = len(heading.group(1)), heading.group(2).strip()
                if level == 1:
                    meta = {"part": text, "chapter": "", "group": ""}
                elif level == 2:
                    meta.update(chapter=text, group="")
                else:
                    meta["group"] = text
                head = f"- **{text}**" if level == 3 else None
            else:
                head = line
        elif head is not None:
            body.append(line)
    flush()
    return cards


def main():
    md_path = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_MD
    cards = convert(md_path)
    data_dir = APP / "data"
    data_dir.mkdir(parents=True, exist_ok=True)
    (data_dir / "cards.json").write_text(json.dumps(cards, ensure_ascii=False, indent=1), encoding="utf-8")
    for image in sorted({img for card in cards for img in card["images"]}):
        target = APP / image
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(md_path.parent / image, target)
    print(f"cards: {len(cards)}")


if __name__ == "__main__":
    main()
