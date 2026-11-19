from PIL import Image, ImageDraw

BG = (245, 184, 65, 255)      # amber accent (matches popup)
GLYPH = (23, 25, 29, 255)     # dark charcoal glyph, for contrast on amber bg

def make_icon(size, path):
    scale = 8  # supersample for crisp edges, then downscale
    s = size * scale
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # Chrome Web Store guidance: keep visible content in the central ~75%
    # of the canvas (96x96 inside a 128x128 file), leaving transparent
    # padding on each side so the icon isn't clipped in store UI contexts.
    pad = s * 0.125
    inner = s - 2 * pad

    # Background: rounded square, inset by the padding
    radius = inner * 0.24
    draw.rounded_rectangle([pad, pad, s - pad, s - pad], radius=radius, fill=BG)

    # Foreground: window glyph (rounded rect outline + title-bar line)
    margin = pad + inner * 0.22
    win_radius = inner * 0.09
    stroke = max(1, round(inner * 0.052))
    draw.rounded_rectangle(
        [margin, margin, s - margin, s - margin],
        radius=win_radius,
        outline=GLYPH,
        width=stroke,
    )
    title_y = margin + (s - 2 * margin) * 0.30
    draw.line(
        [margin + stroke / 2, title_y, s - margin - stroke / 2, title_y],
        fill=GLYPH,
        width=stroke,
    )

    img = img.resize((size, size), Image.LANCZOS)
    img.save(path)

for sz in (16, 32, 48, 128):
    make_icon(sz, f"icons/icon{sz}.png")

print("Icons generated.")
