"""Export browser-ready layers from the Rocket League post-match team PSD.

The browser scene owns live text and tint colors. Geometry, opacity, rounded
corners, and static chrome come directly from the PSD layers.
"""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageFilter
from psd_tools import PSDImage

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "assets" / "rocket-league" / "Post Match Team.psd"
OUT = ROOT / "public" / "rocket-league-overlay" / "post-match"
CANVAS = (1920, 1080)
TRANSPARENT = (0, 0, 0, 0)
PLATE = (23, 23, 23)


def layer_by_name(psd, name, left=None):
    for layer in psd.descendants():
        if layer.name != name:
            continue
        if left is None or layer.bbox[0] == left:
            return layer
    raise RuntimeError(f"PSD layer not found: {name!r} at left={left!r}")


def place(layer):
    image = layer.composite()
    if image is None:
        raise RuntimeError(f"PSD layer did not render: {layer.name!r}")
    canvas = Image.new("RGBA", CANVAS, TRANSPARENT)
    canvas.alpha_composite(image.convert("RGBA"), (layer.bbox[0], layer.bbox[1]))
    return canvas


def alpha_mask(layer, *, crop_bottom=None):
    source = layer.composite()
    if source is None:
        raise RuntimeError(f"PSD layer did not render: {layer.name!r}")
    mask = Image.new("RGBA", CANVAS, TRANSPARENT)
    pixels = mask.load()
    source = source.convert("RGBA")
    left, top = layer.bbox[:2]
    for y in range(source.height):
        canvas_y = top + y
        if crop_bottom is not None and canvas_y >= crop_bottom:
            continue
        for x in range(source.width):
            alpha = source.getpixel((x, y))[3]
            if alpha:
                pixels[left + x, canvas_y] = (255, 255, 255, alpha)
    return mask


def export_outer_plate(psd):
    layer = layer_by_name(psd, "Rectangle 1767")
    source = layer.composite().convert("RGBA")
    panel = Image.new("RGBA", CANVAS, TRANSPARENT)
    border = Image.new("RGBA", CANVAS, TRANSPARENT)
    panel_pixels = panel.load()
    border_pixels = border.load()
    left, top = layer.bbox[:2]

    for y in range(source.height):
        for x in range(source.width):
            red, green, blue, alpha = source.getpixel((x, y))
            if not alpha:
                continue
            canvas_x, canvas_y = left + x, top + y
            # Rectangle 1767 contains both navy fill and the yellow stroke.
            if red > 180 and green > 160 and blue < 80:
                border_pixels[canvas_x, canvas_y] = (255, 255, 255, alpha)
            else:
                # Overlay plates are always the opaque browser-overlay token.
                panel_pixels[canvas_x, canvas_y] = (*PLATE, 255)

    panel.save(OUT / "panel-fill.png")
    border.save(OUT / "border-mask.png")


def export_static_chrome(psd):
    chrome = Image.new("RGBA", CANVAS, TRANSPARENT)

    # Six translucent stat rows retain their exact PSD opacity and corners.
    for name in (
        "Rectangle 1787",
        "Rectangle 1787 copy",
        "Rectangle 1787 copy 2",
        "Rectangle 1787 copy 3",
        "Rectangle 1787 copy 4",
        "Rectangle 1787 copy 5",
    ):
        chrome = Image.alpha_composite(chrome, place(layer_by_name(psd, name)))

    chrome.save(OUT / "chrome.png")


def export_dynamic_masks(psd):
    alpha_mask(
        layer_by_name(psd, "Rectangle 1771", 339),
        crop_bottom=209,
    ).save(OUT / "result-accent-left-mask.png")
    alpha_mask(
        layer_by_name(psd, "Rectangle 1771", 1244),
        crop_bottom=209,
    ).save(OUT / "result-accent-right-mask.png")
    alpha_mask(layer_by_name(psd, "Rectangle 1783 copy", 257)).save(
        OUT / "name-left-mask.png"
    )
    alpha_mask(layer_by_name(psd, "Rectangle 1783", 1247)).save(
        OUT / "name-right-mask.png"
    )

    # Result pill bodies use overlay navy instead of baked PSD chrome pixels.
    result_body_mask = Image.alpha_composite(
        alpha_mask(layer_by_name(psd, "Rectangle 1771 copy", 339)),
        alpha_mask(layer_by_name(psd, "Rectangle 1771 copy", 1244)),
    )
    result_body_mask.save(OUT / "result-body-mask.png")

    # The BO chip uses one PSD layer for its translucent outline and another
    # for its opaque header. Thicken the body outline slightly so the border
    # reads clearly on broadcast without changing the header fill geometry.
    series_box_body = alpha_mask(layer_by_name(psd, "Rectangle 1823"))
    body_alpha = series_box_body.split()[3].filter(ImageFilter.MaxFilter(5))
    series_box_body.putalpha(body_alpha)
    series_box_mask = Image.alpha_composite(
        series_box_body,
        alpha_mask(layer_by_name(psd, "Rectangle 1823 copy")),
    )
    series_box_mask.save(OUT / "series-box-mask.png")

    # Intersect each team divider with the rendered PSD stat-row alpha. This
    # keeps the colored segments flush with the rows' actual antialiased top
    # and bottom edges instead of their looser vector bounding boxes.
    stat_row_layers = tuple(
        layer_by_name(psd, name)
        for name in (
            "Rectangle 1787",
            "Rectangle 1787 copy",
            "Rectangle 1787 copy 2",
            "Rectangle 1787 copy 3",
            "Rectangle 1787 copy 4",
            "Rectangle 1787 copy 5",
        )
    )
    for side, (left, right) in (
        ("left", (688, 699)),
        ("right", (1223, 1234)),
    ):
        mask = Image.new("RGBA", CANVAS, TRANSPARENT)
        pixels = mask.load()
        for row_layer in stat_row_layers:
            row = row_layer.composite().convert("RGBA")
            row_left, row_top = row_layer.bbox[:2]
            for y in range(row.height):
                canvas_y = row_top + y
                for canvas_x in range(left, right):
                    row_x = canvas_x - row_left
                    if 0 <= row_x < row.width and row.getpixel((row_x, y))[3]:
                        pixels[canvas_x, canvas_y] = (255, 255, 255, 255)
        mask.save(OUT / f"divider-{side}-mask.png")


def main():
    if not SRC.exists():
        raise FileNotFoundError(SRC)
    OUT.mkdir(parents=True, exist_ok=True)
    psd = PSDImage.open(SRC)
    if (psd.width, psd.height) != CANVAS:
        raise RuntimeError(f"Expected 1920x1080 PSD, got {psd.width}x{psd.height}")

    export_outer_plate(psd)
    export_static_chrome(psd)
    export_dynamic_masks(psd)

    keep = {
        "panel-fill.png",
        "border-mask.png",
        "chrome.png",
        "result-accent-left-mask.png",
        "result-accent-right-mask.png",
        "result-body-mask.png",
        "name-left-mask.png",
        "name-right-mask.png",
        "divider-left-mask.png",
        "divider-right-mask.png",
        "series-box-mask.png",
    }
    for asset in OUT.glob("*.png"):
        if asset.name not in keep:
            asset.unlink()
    print(f"Wrote {len(keep)} PSD-derived assets to {OUT}")


if __name__ == "__main__":
    main()
