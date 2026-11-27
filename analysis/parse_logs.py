"""parse_logs.py — 원자료(JSONL) 읽기

원자료 형식: JSON Lines. 한 줄 = 이벤트 하나. 예)
  {"ev":"touch","cond":"D","phase":"main","x":196,"y":39.7,"keyBase":"e","keyCal":"w","keyShown":"w", ...}
  {"ev":"trial_end","cond":"D","phrase":"we dine out on the weekends","typed":"...","start":...,"end":...}

규칙
  - 파일 하나 = 참가자 한 명. 참가자 코드는 파일 이름(S01.jsonl → "S01")으로 정한다.
    앱이 붙인 참가자 번호(P01–P04)는 순서 그룹마다 겹치므로 참가자를 구분하는 데 쓰지 않는다.
  - 파일 안에서 마지막 participant_start 이후의 이벤트만 쓴다.
    (같은 브라우저에서 앞 사람의 기록이 섞이는 경우를 막기 위한 규칙. 이번 12명은 모두 시작이 한 번뿐이다.)
"""
import json
from pathlib import Path

import pandas as pd


def load_session(path):
    """JSONL 파일 하나를 읽어 이벤트 목록(dict의 list)으로 돌려준다."""
    events = [json.loads(line) for line in Path(path).open(encoding="utf-8") if line.strip()]
    starts = [i for i, e in enumerate(events) if e["ev"] == "participant_start"]
    if not starts:
        raise ValueError(f"{path}: participant_start 이벤트가 없음")
    start = events[starts[-1]]
    # 마지막 시작 이후 + 같은 참가자 번호의 이벤트만
    return [e for e in events[starts[-1]:] if e.get("pid") == start["pid"]]


def load_all(data_dir):
    """데이터 폴더의 S*.jsonl을 모두 읽는다. 결과: {참가자 코드: 이벤트 목록}"""
    files = sorted(Path(data_dir).glob("S*.jsonl"))
    if not files:
        raise FileNotFoundError(f"{data_dir}에 S*.jsonl 파일이 없음 (make_anonymized_data.py로 먼저 만든다)")
    return {f.stem: load_session(f) for f in files}


def participants_table(sessions):
    """참가자별 기본 정보 표: 순서 그룹, 조건 순서, 앱 버전, 이벤트 수, 완료 여부, 기본 정보."""
    rows = []
    for code, ev in sessions.items():
        start = next(e for e in ev if e["ev"] == "participant_start")
        demo = next((e for e in reversed(ev) if e["ev"] == "demographics"), {})
        rows.append({
            "participant": code, "group": start["group"], "order": start["order"], "app": start["app"],
            "events": len(ev), "touches": sum(e["ev"] == "touch" for e in ev),
            "finished": any(e["ev"] == "participant_end" for e in ev),
            "age": demo.get("age"), "english_freq": demo.get("englishFreq"), "glove_type": demo.get("glove"),
        })
    return pd.DataFrame(rows)


def events_frame(sessions, kinds=None):
    """모든 이벤트를 하나의 표(DataFrame)로 펼친다. kinds로 이벤트 종류를 고를 수 있다(예: ['touch'])."""
    rows = [{"participant": code, **e} for code, ev in sessions.items() for e in ev
            if kinds is None or e["ev"] in kinds]
    return pd.DataFrame(rows)
