"""Validate decoded images and the actual video container and stream."""
import json
from pathlib import Path
import subprocess
import sys
import warnings

from PIL import Image


def check(path, expected):
    if expected in ("PNG", "JPEG", "WEBP"):
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(path) as picture:
                if picture.format != expected:
                    return False
                picture.verify()
            with Image.open(path) as picture:
                picture.load()
        return True

    # Both containers share a probe format name with related formats.
    with Path(path).open("rb") as media:
        beginning = media.read(4096)
    if expected == "MP4":
        brands = beginning[8:int.from_bytes(beginning[:4], "big")]
        if beginning[4:8] != b"ftyp" or not brands or brands[:4] == b"qt  ":
            return False
    elif expected == "WEBM":
        if not beginning.startswith(bytes.fromhex("1a45dfa3")) or b"\x42\x82\x84webm" not in beginning[:128]:
            return False
    else:
        return False
    try:
        probe = subprocess.run(
            ["ffprobe", "-v", "error", "-show_entries", "format=format_name:stream=codec_type,codec_name,width,height",
             "-of", "json", str(path)],
            capture_output=True, timeout=15, check=True
        )
    except FileNotFoundError:
        sys.exit(3)
    info = json.loads(probe.stdout)
    format_names = info.get("format", {}).get("format_name", "").split(",")
    if expected.lower() not in format_names:
        return False
    video = [s for s in info.get("streams", []) if s.get("codec_type") == "video"]
    return any(s.get("width", 0) > 0 and s.get("height", 0) > 0 and
               (expected != "WEBM" or s.get("codec_name") in ("vp8", "vp9", "av1")) for s in video)


if __name__ == "__main__":
    try:
        valid = check(Path(sys.argv[1]), sys.argv[2])
    except (OSError, ValueError, SyntaxError, subprocess.SubprocessError, Image.DecompressionBombWarning,
            Image.DecompressionBombError):
        valid = False
    sys.exit(0 if valid else 2)

