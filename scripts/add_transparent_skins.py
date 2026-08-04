# -*- coding: utf-8 -*-
"""Transparent-скины: круг 128px без кейинга фона (фон уже прозрачный / не чёрный)."""
from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
SKINS_DIR = ROOT / "skins"
LIST_PATH = ROOT / "skinlist.txt"
TRANSPARENT_PATH = ROOT / "transparent.txt"
SIZE = 128

ASSETS = Path(
    r"C:\Users\root\.cursor\projects\c-Users-root-Desktop-slither-client-web\assets"
)

SKINS = [
    ("пушок", "300001", "c__Users_root_AppData_Roaming_Cursor_User_workspaceStorage_0b490dda2cc07b1f586b13381754f8aa_images________-3428b9a9-c3ce-4faa-af9d-f61d9ca17d4d.png"),
    ("ёж", "300002", "c__Users_root_AppData_Roaming_Cursor_User_workspaceStorage_0b490dda2cc07b1f586b13381754f8aa_images___-1f2996d9-1190-4591-a34b-2393cc89a78c.png"),
    ("трава", "300003", "c__Users_root_AppData_Roaming_Cursor_User_workspaceStorage_0b490dda2cc07b1f586b13381754f8aa_images_________-7ee498aa-b21d-434e-9327-47693a35704b.png"),
    ("лава", "300004", "c__Users_root_AppData_Roaming_Cursor_User_workspaceStorage_0b490dda2cc07b1f586b13381754f8aa_images________-eef58af9-b646-4dfc-be28-aea4d153ff58.png"),
    ("бабки", "300005", "c__Users_root_AppData_Roaming_Cursor_User_workspaceStorage_0b490dda2cc07b1f586b13381754f8aa_images_______-3fc4802b-967d-453d-ac98-4b6a4e1a208a.png"),
    ("корона", "300006", "c__Users_root_AppData_Roaming_Cursor_User_workspaceStorage_0b490dda2cc07b1f586b13381754f8aa_images______-7bc3badb-93c5-4a56-a31d-97dea3116553.png"),
]


def to_circle(img: Image.Image, size: int = SIZE) -> Image.Image:
    img = img.convert("RGBA")
    w, h = img.size
    # cover-fit в квадрат (как vanilla) — без удаления «чёрного»
    scale = max(size / max(w, 1), size / max(h, 1))
    nw, nh = max(1, int(round(w * scale))), max(1, int(round(h * scale)))
    img = img.resize((nw, nh), Image.Resampling.LANCZOS)
    left = max(0, (nw - size) // 2)
    top = max(0, (nh - size) // 2)
    img = img.crop((left, top, left + size, top + size))
    if img.size != (size, size):
        canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        canvas.paste(img, ((size - img.width) // 2, (size - img.height) // 2))
        img = canvas

    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).ellipse((0, 0, size - 1, size - 1), fill=255)
    mask = mask.filter(ImageFilter.GaussianBlur(0.55))
    out = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    out.paste(img, (0, 0), mask=mask)
    return out


def upsert_skinlist(entries: list[tuple[str, str]]) -> None:
    lines = LIST_PATH.read_text(encoding="utf-8").splitlines()
    want = {n.lower(): (n, sid) for n, sid in entries}
    out = []
    seen = set()
    for line in lines:
        raw = line.strip()
        if not raw or raw.startswith("#"):
            out.append(line)
            continue
        colon = raw.find(":")
        if colon <= 0:
            out.append(line)
            continue
        nick = raw[:colon].strip()
        key = nick.lower()
        if key in want:
            n, sid = want[key]
            out.append(f"{n}:{sid}")
            seen.add(key)
        else:
            out.append(line)
    insert_at = None
    for i, line in enumerate(out):
        if line.startswith("бублик:"):
            insert_at = i + 1
            break
    extras = [f"{n}:{sid}" for n, sid in entries if n.lower() not in seen]
    if extras:
        if insert_at is None:
            out.extend(extras)
        else:
            out[insert_at:insert_at] = extras
    LIST_PATH.write_text("\n".join(out) + "\n", encoding="utf-8")


def write_transparent(nicks: list[str]) -> None:
    ordered = []
    seen = set()
    for n in ["бублик", *nicks]:
        k = n.lower()
        if k in seen:
            continue
        seen.add(k)
        ordered.append(n)
    TRANSPARENT_PATH.write_text(
        "# Ники без цветной заливки головы/сегментов (только PNG-скин).\n"
        "# По одному нику на строку, без учёта регистра.\n\n"
        + "\n".join(ordered)
        + "\n",
        encoding="utf-8",
    )


def main() -> None:
    SKINS_DIR.mkdir(parents=True, exist_ok=True)
    entries = []
    for nick, sid, fname in SKINS:
        src = ASSETS / fname
        if not src.exists():
            raise SystemExit(f"missing: {src}")
        out = to_circle(Image.open(src))
        dest = SKINS_DIR / f"{sid}.png"
        out.save(dest, "PNG", optimize=True)
        entries.append((nick, sid))
        print(f"OK {nick}:{sid} -> {dest.name}")
    upsert_skinlist(entries)
    write_transparent([n for n, _ in entries])
    print("done")


if __name__ == "__main__":
    main()
