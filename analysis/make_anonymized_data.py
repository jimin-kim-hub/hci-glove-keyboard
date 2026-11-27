"""make_anonymized_data.py — 제출용 익명화 원자료 만들기

실행: python3 analysis/make_anonymized_data.py "실험 결과 데이터" data/raw

무엇을 하나
  원본 데이터 폴더(참가자마다 하위 폴더 하나, 안에 glovekb_*.jsonl)를 읽어서
  참가자 코드(S01, S02, …)로 이름을 바꾼 사본을 만든다.
    data/raw/S01.jsonl … S12.jsonl  원자료 (로그 내용은 바꾸지 않음)
    data/raw/participants.csv       참가자 코드별 순서 그룹·조건 순서·앱 버전·기본 정보

익명화 기준
  - 원본 하위 폴더 이름(실명일 수 있음)은 어디에도 쓰지 않는다.
  - 파일 이름의 날짜·시각도 쓰지 않는다. 참가자 코드는 실험 순서대로 붙인다.
  - 로그 안에는 이름·연락처·자유 응답이 없다(참가자 번호, 무작위 세션 ID, 상대 시각 ms,
    연령대·주로 쓰는 손·영어 사용 빈도·입력 방식·장갑 종류만 있음). 그래서 로그 내용은 그대로 둔다.
    원자료를 고치지 않아야 분석의 재현성이 지켜진다.
  - 참가자 코드 ↔ 원본 파일의 대응표는 원본 폴더 쪽(로컬)에만 남기고 제출물에는 넣지 않는다.
"""
import csv
import json
import shutil
import sys
from pathlib import Path

src = Path(sys.argv[1] if len(sys.argv) > 1 else "실험 결과 데이터")
dst = Path(sys.argv[2] if len(sys.argv) > 2 else "data/raw")
dst.mkdir(parents=True, exist_ok=True)

# 원본 파일을 실험 시각 순서로 정렬 (파일 이름 끝의 시각 기준)
files = sorted(src.rglob("glovekb_*.jsonl"), key=lambda p: p.stem.split("_")[-1])
rows, mapping = [], []
for i, f in enumerate(files, start=1):
    code = f"S{i:02d}"
    events = [json.loads(line) for line in f.open(encoding="utf-8") if line.strip()]
    start = [e for e in events if e["ev"] == "participant_start"][-1]
    demo = ([e for e in events if e["ev"] == "demographics"] or [{}])[-1]
    shutil.copyfile(f, dst / f"{code}.jsonl")
    rows.append({
        "participant": code, "app_pid": start["pid"], "group": start["group"], "order": start["order"],
        "app_version": start["app"], "x_is": start["xIs"],
        "age": demo.get("age", ""), "main_hand": demo.get("hand", ""), "english_freq": demo.get("englishFreq", ""),
        "typing_style": demo.get("style", ""), "glove_type": demo.get("glove", ""),
    })
    mapping.append((code, f.name))  # 원본 파일 이름(시각)만 — 폴더 이름은 쓰지 않음

with (dst / "participants.csv").open("w", newline="", encoding="utf-8") as fh:
    w = csv.DictWriter(fh, fieldnames=list(rows[0]))
    w.writeheader()
    w.writerows(rows)

# 대응표는 제출물 밖(원본 폴더)에 저장
with (src / "_participant_codes_LOCAL_ONLY.csv").open("w", newline="", encoding="utf-8") as fh:
    csv.writer(fh).writerows([("participant", "original_file"), *mapping])

print(f"{len(files)}명 → {dst}/ (S01–S{len(files):02d}.jsonl, participants.csv)")
