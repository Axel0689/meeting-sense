"""Normalizzazione dell'input: testo semplice o sottotitoli WebVTT (Teams/Meet/Zoom)."""

import re

TIMESTAMP_LINE = re.compile(
    r"^\s*\d{1,2}:\d{2}(:\d{2})?[.,]\d{3}\s+-->\s+\d{1,2}:\d{2}(:\d{2})?[.,]\d{3}"
)
VOICE_TAG = re.compile(r"<v\s+([^>]+?)(?:\.[^>]*)?>(.*?)(?:</v>)?\s*$", re.IGNORECASE)
OTHER_TAGS = re.compile(r"</?[^>]+>")


def is_vtt(text: str, filename: str = "") -> bool:
    return filename.lower().endswith(".vtt") or text.lstrip().startswith("WEBVTT")


def parse_vtt(text: str) -> str:
    """Estrae dal VTT le battute come righe "Speaker: testo", scartando
    header, numeri di cue, timestamp e ripetizioni consecutive."""
    raw_lines = [l.strip() for l in text.splitlines()]
    lines: list[str] = []
    for i, line in enumerate(raw_lines):
        if (
            not line
            or line.startswith(("WEBVTT", "NOTE", "STYLE", "REGION"))
            or TIMESTAMP_LINE.match(line)
            # identificatore di cue: riga immediatamente prima di un timestamp
            or (i + 1 < len(raw_lines) and TIMESTAMP_LINE.match(raw_lines[i + 1]))
        ):
            continue
        m = VOICE_TAG.search(line)
        if m:
            speaker, spoken = m.group(1).strip(), m.group(2).strip()
            entry = f"{speaker}: {spoken}" if spoken else ""
        else:
            entry = OTHER_TAGS.sub("", line).strip()
        if entry and (not lines or lines[-1] != entry):
            lines.append(entry)
    return "\n".join(lines)


def normalize_transcript(text: str, filename: str = "") -> str:
    text = text.replace("\r\n", "\n").replace("﻿", "")
    if is_vtt(text, filename):
        return parse_vtt(text)
    return text.strip()
