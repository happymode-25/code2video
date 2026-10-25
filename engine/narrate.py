"""Narration engine for code2video.

Reads a spec JSON, synthesises one wav per scene with Piper, then aligns
word-level timings with faster-whisper, and writes narration.json.

    python engine/narrate.py <spec.json>

Spec:
    {
      "fps": 30,
      "outDir": "C:/.../public/projects/<id>",
      "voice":  "C:/.../en_US-lessac-medium.onnx",     # default for all scenes
      "whisperDir": "C:/.../faster-whisper-base",      # optional
      "force": false,                                   # ignore the cache
      "scenes": [
        {
          "id": 1,
          "slug": "hook",
          "text": "...",
          "voice": "C:/.../en_US-amy-medium.onnx",     # optional, per scene
          "voiceId": "amy"                              # optional, echoed back
        }
      ]
    }

Every distinct voice is loaded lazily and kept for the rest of the run, so a
two-speaker script loads two Piper models and nothing more. The cache key is
(text + voice), so changing a scene's voice re-narrates only that scene.

Writes:
    <outDir>/voice/scene-01.wav ...
    <outDir>/narration.json
    <outDir>/voice/.cache.json      (per-scene hash -> timings, so edits only
                                     re-run the scenes whose text changed)

Progress is reported on stdout as "PROGRESS <done> <total>".
"""
from __future__ import annotations

import hashlib
import json
import sys
import time
import wave
from pathlib import Path

import numpy as np
from faster_whisper import WhisperModel
from piper import PiperVoice

DEFAULT_VOICE = Path(r"C:\dev\video-lab\voice-caption\voices\en_US-lessac-medium.onnx")
DEFAULT_WHISPER = Path(r"C:\dev\video-lab\voice-caption\models\faster-whisper-base")


def log(msg: str) -> None:
    print(msg, flush=True)


def read_wav_16k(path: Path) -> np.ndarray:
    """PCM wav -> float32 mono @16 kHz (stdlib+numpy, sidesteps the PyAV clash)."""
    with wave.open(str(path), "rb") as w:
        n_ch, width, rate = w.getnchannels(), w.getsampwidth(), w.getframerate()
        frames = w.readframes(w.getnframes())
    data = np.frombuffer(frames, dtype={1: np.uint8, 2: np.int16, 4: np.int32}[width])
    data = data.astype(np.float32) / float(1 << (8 * width - 1))
    if n_ch > 1:
        data = data.reshape(-1, n_ch).mean(axis=1)
    if rate != 16000:
        n_out = int(round(len(data) * 16000 / rate))
        data = np.interp(
            np.linspace(0, len(data) - 1, n_out, dtype=np.float64),
            np.arange(len(data), dtype=np.float64),
            data,
        ).astype(np.float32)
    return data


def wav_duration(path: Path) -> float:
    with wave.open(str(path), "rb") as w:
        return w.getnframes() / float(w.getframerate())


def text_hash(text: str, voice: str) -> str:
    """Hash the words *and* the voice, so switching voice re-narrates."""
    return hashlib.sha1(f"{voice}\x00{text}".encode("utf-8")).hexdigest()[:12]


class VoicePool:
    """Loads each Piper voice at most once per run."""

    def __init__(self, log_fn=log) -> None:
        self._log = log_fn
        self._loaded: dict[str, PiperVoice] = {}
        self.load_seconds = 0.0

    def get(self, path: Path) -> PiperVoice:
        key = str(path)
        if key not in self._loaded:
            t0 = time.time()
            self._loaded[key] = PiperVoice.load(key)
            elapsed = time.time() - t0
            self.load_seconds += elapsed
            if len(self._loaded) == 1:
                self._log(f"engine: piper voice loaded in {elapsed:.1f}s")
            else:
                self._log(f"engine: voice {path.stem} loaded in {elapsed:.1f}s")
        return self._loaded[key]


def main() -> int:
    if len(sys.argv) < 2:
        log("usage: python engine/narrate.py <spec.json>")
        return 2

    spec_path = Path(sys.argv[1])
    # utf-8-sig tolerates a BOM, which editors and PowerShell redirection add.
    spec = json.loads(spec_path.read_text(encoding="utf-8-sig"))

    out_dir = Path(spec["outDir"])
    voice_dir = out_dir / "voice"
    voice_dir.mkdir(parents=True, exist_ok=True)
    out_dir.mkdir(parents=True, exist_ok=True)

    fps = int(spec.get("fps", 30))
    force = bool(spec.get("force", False))
    scenes = spec["scenes"]
    total = len(scenes)
    if total == 0:
        log("ERROR: spec has no scenes")
        return 2

    default_voice = Path(spec.get("voice") or DEFAULT_VOICE)
    whisper_path = Path(spec.get("whisperDir") or DEFAULT_WHISPER)
    if not default_voice.exists():
        log(f"ERROR: voice model not found: {default_voice}")
        return 3
    if not whisper_path.exists():
        log(f"ERROR: whisper model not found: {whisper_path}")
        return 3

    def voice_for(scene: dict) -> Path:
        raw = scene.get("voice")
        return Path(raw) if raw else default_voice

    # A scene pointing at a missing voice model falls back to the default rather
    # than failing the whole run.
    for scene in scenes:
        vp = voice_for(scene)
        if not vp.exists():
            log(f"WARN: scene {scene.get('id')} voice missing ({vp}) - using {default_voice.stem}")
            scene.pop("voice", None)

    cache_file = voice_dir / ".cache.json"
    cache: dict[str, dict] = {}
    if cache_file.exists() and not force:
        try:
            cache = json.loads(cache_file.read_text(encoding="utf-8-sig"))
        except Exception:
            cache = {}

    def cache_hit(scene: dict) -> dict | None:
        key = str(scene["id"])
        entry = cache.get(key)
        if not entry or entry.get("hash") != text_hash(scene["text"], str(voice_for(scene))):
            return None
        if not (voice_dir / entry["file"]).exists():
            return None
        return entry

    pending = [s for s in scenes if cache_hit(s) is None]

    pool = VoicePool()
    whisper = None
    if pending:
        if force:
            log(f"engine: forcing re-narration of all {total} scenes")
        else:
            log(f"engine: {len(pending)} of {total} scenes need narration")
        used = sorted({voice_for(s).stem for s in pending})
        if len(used) > 1:
            log(f"engine: {len(used)} voices in this script: {', '.join(used)}")
        # Load every voice the pending scenes need before touching whisper.
        for scene in pending:
            pool.get(voice_for(scene))
        t0 = time.time()
        whisper = WhisperModel(str(whisper_path), device="cpu", compute_type="int8")
        log(f"engine: whisper model loaded in {time.time() - t0:.1f}s")
    else:
        log(f"engine: all {total} scenes cached, nothing to synthesise")

    scenes_out = []
    done = 0
    for scene in scenes:
        sid = int(scene["id"])
        slug = scene["slug"]
        text = scene["text"]
        voice_path = voice_for(scene)
        voice_id = scene.get("voiceId") or voice_path.stem
        rel = f"scene-{sid:02d}.wav"
        hit = None if force else cache_hit(scene)

        if hit is not None:
            # Unchanged words and unchanged voice: reuse the wav and timings.
            duration, words = hit["duration"], hit["words"]
            done += 1
            log(f"[{sid:02d}] {slug:22s} {duration:5.2f}s  {len(words):3d} words  (cached)")
            log(f"PROGRESS {done} {total}")
        else:
            wav = voice_dir / rel
            t0 = time.time()
            voice = pool.get(voice_path)
            with wave.open(str(wav), "wb") as f:
                voice.synthesize_wav(text, f)
            duration = wav_duration(wav)

            segments, _ = whisper.transcribe(read_wav_16k(wav), word_timestamps=True)  # type: ignore[union-attr]
            words = []
            for seg in segments:
                for w in seg.words or []:
                    words.append(
                        {"word": w.word.strip(), "start": round(w.start, 3), "end": round(w.end, 3)}
                    )
            done += 1
            log(
                f"[{sid:02d}] {slug:22s} {duration:5.2f}s  {len(words):3d} words"
                f"  {voice_id}  ({time.time() - t0:.1f}s)"
            )
            log(f"PROGRESS {done} {total}")

        cache[str(sid)] = {
            "hash": text_hash(text, str(voice_path)),
            "file": rel,
            "voiceId": voice_id,
            "duration": round(duration, 3),
            "words": words,
        }
        scenes_out.append(
            {
                "id": sid,
                "slug": slug,
                "wav": f"/projects/{out_dir.name}/voice/{rel}",
                "text": text,
                "voiceId": voice_id,
                "duration": round(duration, 3),
                "words": words,
            }
        )

    cache_file.write_text(json.dumps(cache, indent=2), encoding="utf-8")

    grand_total = sum(s["duration"] for s in scenes_out)
    voices_used = sorted({s["voiceId"] for s in scenes_out})
    payload = {
        "fps": fps,
        "total": round(grand_total, 3),
        "voices": voices_used,
        "scenes": scenes_out,
    }
    (out_dir / "narration.json").write_text(json.dumps(payload, indent=2), encoding="utf-8")
    log(f"narration: {grand_total:.2f}s ({grand_total * fps:.0f} frames) -> {out_dir / 'narration.json'}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
