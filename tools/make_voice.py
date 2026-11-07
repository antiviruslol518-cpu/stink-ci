#!/usr/bin/env python3
"""make_voice.py — voice.wav + words.json from SCRIPT.md, with the N==M check.
Usage: python3 <skill>/assets/scripts/make_voice.py   (run from the project folder)
edge_tts is flaky in SILENT ways (see below). This script makes every failure loud:
  - NoAudioReceived -> retried up to 5 times, then a hard error
  - partial word streams (65/168 written, no error) -> the N==M check catches it
Output: voice/voice.wav (48 kHz mono) + voice/words.json [{w, s, e}]
"""
import asyncio, json, re, subprocess, sys
from pathlib import Path

try:
    import edge_tts
except ImportError:
    sys.exit("edge-tts missing. Install into a venv first:  python3 -m venv venv && ./venv/bin/pip install edge-tts\nThen run: ./venv/bin/python " + str(Path(__file__).name))

VOICE = "en-US-AndrewNeural"
RATE = "+45%"   # locked 2026-11-04: 3.80 words/s — do not change without re-measuring

# edge-tts >= 7.x defaults to SentenceBoundary, which yields ZERO WordBoundary events and
# makes the N==M check fire on a perfectly good stream. The word timings are the whole
# point of this script, so ask for them explicitly rather than downgrading the library.
BOUNDARY = "WordBoundary"

def script_text():
    md = Path("SCRIPT.md").read_text()
    lines = md.splitlines()
    body, in_facts, started = [], False, False
    for ln in lines:
        if ln.startswith("# "): continue
        if ln.startswith("Facts:"): in_facts = True; continue
        if in_facts:
            if not ln.strip(): in_facts = False
            continue
        s = re.sub(r"<[^>]+>", "", ln).strip()
        if s: body.append(s); started = True
    if not body: sys.exit("SCRIPT.md has no spoken lines (after the title and Facts block)")
    return " ".join(body)

async def synth(text):
    words, last_err = [], None
    for attempt in range(5):
        words = []
        try:
            com = edge_tts.Communicate(text, VOICE, rate=RATE, volume="+0%", boundary=BOUNDARY)
            with open("voice/voice.mp3", "wb") as fh:
                async for chunk in com.stream():
                    if chunk["type"] == "audio": fh.write(chunk["data"])
                    elif chunk["type"] == "WordBoundary":
                        words.append({"w": chunk["text"],
                                      "s": chunk["offset"] / 1e7,
                                      "e": (chunk["offset"] + chunk["duration"]) / 1e7})
            if words and Path("voice/voice.mp3").stat().st_size > 1000:
                return words
            last_err = "empty audio or zero word boundaries"
        except Exception as ex:
            last_err = repr(ex)
        print(f"  attempt {attempt+1} failed ({last_err}) — retrying")
        await asyncio.sleep(2)
    sys.exit(f"edge-tts failed 5 times: {last_err}. STOP — tell the user the network/TTS is down.")

def coverage(text, words):
    """How much of the written script the timed words actually account for.

    The old check was `len(words) == len(text.split())`, which fires two ways:
      - a PARTIAL stream (the real bug: 65 of 168 words, silent corruption) -> must fail
      - the engine merging a token ("St Albans" -> one boundary) -> harmless, and the
        strict count rejects a perfectly good stream.
    So compare the consumed character counts instead: a partial stream leaves most of the
    script uncovered, a merged token leaves only a few characters of difference.
    """
    norm = lambda s: "".join(ch for ch in s.lower() if ch.isalnum())
    want = norm(text)
    got = norm("".join(w["w"] for w in words))
    if not want:
        return 0.0
    # fraction of the script's characters present in the timed stream, in order
    i = 0
    for ch in got:
        if i < len(want) and ch == want[i]:
            i += 1
    return i / len(want)


def main():
    Path("voice").mkdir(exist_ok=True)
    text = script_text()
    n_words_text = len(text.split())
    print(f"script: {n_words_text} words")
    words = asyncio.run(synth(text))
    # THE COVERAGE CHECK: a partial WordBoundary stream arrives with NO error and silently
    # corrupts every timing table downstream (real case: 65 of 168 words written).
    cov = coverage(text, words)
    if cov < 0.995:
        sys.exit(f"WORD TIMING MISMATCH: timed words cover only {cov*100:.1f}% of the script "
                 f"({len(words)} boundaries for {n_words_text} written words) — partial stream. "
                 f"Re-run this script. Never continue with a partial words.json.")
    json.dump(words, open("voice/words.json", "w"), indent=1)
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", "voice/voice.mp3",
                    "-ar", "48000", "-ac", "1", "voice/voice.wav"], check=True)
    dur = words[-1]["e"]
    print(f"words: {len(words)} boundaries, {n_words_text} written, coverage {cov*100:.1f}% (OK)")
    print(f"last word ends: {dur:.2f}s   (need 55-70s total after mix)")
    if not (50 <= dur <= 75):
        print("WARNING: spoken duration out of band — the script is the wrong length. Fix SCRIPT.md and re-run.")
    print("wrote voice/voice.wav (48kHz mono) + voice/words.json")

if __name__ == "__main__":
    main()
