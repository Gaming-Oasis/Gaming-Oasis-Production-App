"""Export source-art masks; tooling only (Pillow + psd-tools), never a runtime dependency.

The PSDs remain the geometry reference. HTML owns text, champion art and logos.
The existing gold/tower/baron/inhibitor PNGs originate in scoreboard icons.ai.
"""
from pathlib import Path
import hashlib
import json
from PIL import Image, ImageDraw
from psd_tools import PSDImage

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "public" / "league-of-legends-overlay"

def rect(layer):
    x, y, right, bottom = layer.bbox
    return [x, y, right - x, bottom - y]

def group(parent, name):
    return next(layer for layer in parent if layer.name == name)

def text_size(layer):
    style = layer.engine_dict["StyleRun"]["RunArray"][0]["StyleSheet"]["StyleSheetData"]
    return float(style["FontSize"]) * layer.transform[0]

def series(parent):
    return {name: [rect(layer) for layer in group(parent, name)] for name in ["bo3", "bo5"]}

def draft_layout(psd):
    main = group(psd, "main")
    def side(name):
        cards = []
        for card in group(main, "picks " + name):
            role_layers = list(group(card, "champion roles"))
            cards.append({"portrait": rect(group(card, "Layer 2")), "namePlate": rect(group(card, "Layer 4")),
                          "name": rect(group(card, "champion name")),
                          "nameBaselineX": group(card, "champion name").transform[4],
                          "rolePlate": rect(group(card, "Layer 5")),
                          "roles": {role: rect(role_layers[index]) for role,index in [("Top",2),("Jungle",0),("Mid",1),("Bottom",3),("Support",4)]}})
        bans = group(main, "bans left" if name == "left" else "bans righit")
        return {"picks":cards, "banPlate":rect(group(bans,"Layer 13")), "bans":[rect(l) for l in bans if l.kind == "smartobject"]}
    fearless=group(psd,"20 fearless")
    return {"size":list(psd.size), "base":rect(group(main,"Layer 11")), "blue":side("left"), "red":side("right"),
            "logos":[rect(l) for l in group(main,"logos")], "series":series(group(main,"best ofs")),
            "sponsor":rect(group(group(main,"sponsor"),"Layer 17")),
            "sponsorText":rect(group(group(main,"sponsor"),"SPONSOR AREA")),
            "sponsorFontSize":text_size(group(group(main,"sponsor"),"SPONSOR AREA")),
            "fearlessPlate":rect(group(fearless,"Layer 13")),
            "fearless":[rect(l) for l in fearless if l.kind == "smartobject"]}

def score_layout(psd):
    layers=list(psd.descendants())
    r=lambda i:rect(layers[i])
    return {"size":list(psd.size), "main":r(1), "fill":r(3), "edges":[r(5),r(6)], "bottom":r(42),
            "logoPlates":[r(23),r(24)], "logos":[r(26),r(25)], "leagueLogo":r(40),
            "series":{"bo3":[r(i) for i in [9,10,16,17]], "bo5":[r(i) for i in [12,13,14,19,20,21]]},
            "towers":[r(31),r(36)], "towerValues":[r(30),r(35)], "gold":[r(28),r(33)], "goldValues":[r(29),r(34)],
            "kills":[r(38),r(39)], "clock":r(45), "inhibitors":[r(43),r(46)], "inhibitorValues":[r(44),r(47)],
            "barons":[r(49),r(55)], "dragons":[[r(i) for i in [53,52,51,50]],[r(i) for i in [59,58,57,56]]],
            "timers":[{"plate":r(60),"iconPlate":r(61),"textPlate":r(62),"icon":r(64),"text":r(63)},
                      {"plate":r(65),"iconPlate":r(66),"textPlate":r(67),"icon":r(69),"text":r(68)}]}


def find(psd, name, left=None):
    return next(layer for layer in psd.descendants()
                if layer.name == name and (left is None or layer.left == left))


def mask(layer, filename):
    source = layer.topil().convert("RGBA")
    result = Image.new("RGBA", source.size, "white")
    result.putalpha(source.getchannel("A"))
    result.save(OUT / filename)


def series_masks(psd, scene):
    parent = group(group(psd, "main"), "best ofs")
    for best_of in ["bo3", "bo5"]:
        layers = [layer for section in parent if section.name == best_of for layer in section]
        empty = next(layer.topil().getchannel("A") for layer in layers
                     if layer.topil().getpixel((layer.width // 2, layer.height // 2))[3] == 0)
        for index, layer in enumerate(layers):
            alpha = layer.topil().getchannel("A")
            if alpha.getpixel((alpha.width // 2, alpha.height // 2)):
                alpha = empty.copy()
            filled = alpha.copy()
            ImageDraw.floodfill(filled, (filled.width // 2, filled.height // 2), 255, thresh=0)
            for state, channel in [("empty", alpha), ("filled", filled)]:
                result = Image.new("RGBA", channel.size, "white")
                result.putalpha(channel)
                result.save(OUT / f"{scene}-{best_of}-{index}-{state}.png")


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    draft = PSDImage.open(ROOT / "assets" / "league-of-legends" / "PickBan Overlay.psd")
    # Preserve both the fine dark texture and bright linework relative to the PSD's
    # 15/255 base. CSS supplies the required #171717 plate underneath these masks.
    source = find(draft, "Layer 11").composite().convert("RGBA")
    luminance = source.convert("L")
    for filename, alpha in [
        ("draft-chrome-mask.png", luminance.point(lambda v: round(max(0, v - 15) * 255 / 240))),
        ("draft-texture-mask.png", luminance.point(lambda v: round(max(0, 15 - v) * 255 / 15))),
    ]:
        chrome = Image.new("RGBA", source.size, "white")
        chrome.putalpha(alpha)
        chrome.save(OUT / filename)
    for name, role, left in [("Layer 6", "jungle", 113), ("Layer 7", "mid", 113),
                             ("Layer 8", "top", 112), ("Layer 9", "bottom", 112),
                             ("Layer 10", "support", 113)]:
        mask(find(draft, name, left), f"role-{role}.png")
    # Each placed icon has its own fractional Photoshop rasterization. Do not
    # stretch the first card's pixels into the other cards' slightly different bounds.
    for side, source_side in [("blue", "left"), ("red", "right")]:
        for card, (role, index) in zip(group(group(draft, "main"), "picks " + source_side),
                                     [("top", 2), ("jungle", 0), ("mid", 1), ("bottom", 3), ("support", 4)]):
            mask(list(group(card, "champion roles"))[index], f"role-{side}-{role}.png")
    score = PSDImage.open(ROOT / "assets" / "league-of-legends" / "Score Overlay.psd")
    series_masks(draft, "draft")
    series_masks(score, "score")
    find(score, "Layer 11", 98).topil().save(OUT / "dragon.png")
    # Use the source rasterization of the Illustrator icons, at their placed PSD bounds.
    for name, layer in [("score-gold",find(score,"Layer 4",451)),("score-tower",find(score,"Layer 5",399)),
                        ("score-inhibitor",find(score,"Layer 6",347)),("score-baron",find(score,"Layer 9 copy",399)),
                        ("timer-baron",find(score,"Layer 9",11)),("score-dragon",find(score,"Layer 11 copy",561))]:
        if name in ["score-gold", "score-tower"]:
            mask(layer, name + ".png")
        else:
            # Objective colors communicate identity in the supplied artwork.
            layer.topil().save(OUT / (name + ".png"))
    manifest={"sources":{name:hashlib.sha256((ROOT/"assets/league-of-legends"/name).read_bytes()).hexdigest()
                        for name in ["PickBan Overlay.psd","Score Overlay.psd","scoreboard icons.ai"]},
              "draft":draft_layout(draft),"score":score_layout(score)}
    (ROOT/"lib/league-overlay-layout.json").write_text(json.dumps(manifest,indent=2)+"\n",encoding="utf8")


if __name__ == "__main__":
    main()
