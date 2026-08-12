"""Derive tintable RL scoreboard strip layers from SEL header_top.png."""

from __future__ import annotations

from pathlib import Path
import argparse

from PIL import Image

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("source", type=Path, help="Path to the source header_top.png artwork")
SRC = parser.parse_args().source
OUT = Path(__file__).resolve().parents[1] / "public" / "rocket-league-overlay" / "nel"

# Rectangular score boxes only (exclude diagonal slash tips).
SCORE_BOX_ONE = (707, 99, 829, 234)
SCORE_BOX_TWO = (1441, 99, 1562, 234)


def is_primary(r, g, b):
    return b > 140 and b > r + 30 and b > g


def is_secondary(r, g, b):
    return r > 160 and g > 150 and b < 120 and g >= b


def is_dark(r, g, b):
    return max(r, g, b) < 70


def in_score_box(x, y):
    for left, top, right, bottom in (SCORE_BOX_ONE, SCORE_BOX_TWO):
        if left <= x < right and top <= y < bottom:
            return True
    return False


def flood_components(points):
    """Return connected components for 4-connected point sets."""
    point_set = set(points)
    seen = set()
    components = []
    for seed in points:
        if seed in seen:
            continue
        stack = [seed]
        seen.add(seed)
        comp = []
        while stack:
            x, y = stack.pop()
            comp.append((x, y))
            for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
                if (nx, ny) in point_set and (nx, ny) not in seen:
                    seen.add((nx, ny))
                    stack.append((nx, ny))
        components.append(comp)
    return components


def main():
    im = Image.open(SRC).convert("RGBA")
    w, h = im.size
    pixels = im.load()

    primary = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    secondary = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    logo_one = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    logo_two = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    p_px, s_px, l1_px, l2_px = (
        primary.load(),
        secondary.load(),
        logo_one.load(),
        logo_two.load(),
    )

    logo_candidates = []

    for y in range(h):
        for x in range(w):
            r, g, b, a = pixels[x, y]
            if a < 12:
                continue
            if is_secondary(r, g, b):
                if in_score_box(x, y):
                    s_px[x, y] = (255, 255, 255, a)
            elif is_primary(r, g, b):
                p_px[x, y] = (255, 255, 255, a)
            elif is_dark(r, g, b):
                # Skip baked "Score" glyphs — HTML owns that label.
                if in_score_box(x, y):
                    continue
                logo_candidates.append((x, y, a))

    comps = flood_components([(x, y) for x, y, _ in logo_candidates])
    comps.sort(key=len, reverse=True)
    logo_comps = comps[:2]
    logo_comps.sort(key=lambda comp: min(x for x, _ in comp))
    alpha_lookup = {(x, y): a for x, y, a in logo_candidates}

    for index, comp in enumerate(logo_comps):
        target = l1_px if index == 0 else l2_px
        for x, y in comp:
            target[x, y] = (255, 255, 255, alpha_lookup[(x, y)])

    # Solid score boxes so source glyph cutouts never remain in the secondary mask.
    for left, top, right, bottom in (SCORE_BOX_ONE, SCORE_BOX_TWO):
        for y in range(top, bottom):
            for x in range(left, right):
                s_px[x, y] = (255, 255, 255, 255)

    OUT.mkdir(parents=True, exist_ok=True)
    primary.save(OUT / "primary-mask.png")
    secondary.save(OUT / "secondary-mask.png")
    logo_one.save(OUT / "logo-one-mask.png")
    logo_two.save(OUT / "logo-two-mask.png")

    # Keep an empty chrome file so old paths fail closed (no baked name bars / Score text).
    Image.new("RGBA", (w, h), (0, 0, 0, 0)).save(OUT / "scoreboard-chrome.png")

    # Scrub legacy scoreboard.png: solid secondary boxes without baked Score glyphs.
    legacy = im.copy()
    legacy_px = legacy.load()
    for left, top, right, bottom in (SCORE_BOX_ONE, SCORE_BOX_TWO):
        for y in range(top, bottom):
            for x in range(left, right):
                # Preserve primary frame pixels at the box edge; fill interior yellow solid.
                r, g, b, a = legacy_px[x, y]
                if a < 12:
                    continue
                if is_primary(r, g, b):
                    continue
                legacy_px[x, y] = (255, 238, 0, 255)
    legacy.save(OUT / "scoreboard.png")

    def fill_mask(mask, color):
        layer = Image.new("RGBA", (w, h), color)
        layer.putalpha(mask.split()[-1])
        return layer

    preview = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    for layer in (
        fill_mask(primary, (26, 117, 253, 255)),
        fill_mask(secondary, (252, 197, 0, 255)),
        fill_mask(logo_one, (255, 255, 255, 255)),
        fill_mask(logo_two, (0, 0, 0, 255)),
    ):
        preview = Image.alpha_composite(preview, layer)
    preview.save(OUT / "_preview-scoreboard.png")

    print("logo_one", logo_one.getbbox())
    print("logo_two", logo_two.getbbox())
    print("score_boxes", SCORE_BOX_ONE, SCORE_BOX_TWO)
    print("logo_components", [len(c) for c in comps[:5]])
    print("wrote", OUT)


if __name__ == "__main__":
    main()
