import json
from PIL import Image, ImageEnhance, ImageFilter, ImageDraw, ImageOps

SRC = '/private/tmp/claude-501/-Applications-MAMP-htdocs/818b513e-8f95-44bc-a976-b89275f705cd/images/3.png'
im = Image.open(SRC).convert('RGB')
S = 8
big = im.resize((im.width * S, im.height * S), Image.LANCZOS)
# even out the light (blend with a histogram-equalised copy), then sharpen the features
big = big.filter(ImageFilter.MedianFilter(9))            # smooths the blotches and the camera noise, keeps the edges of the features
big = ImageOps.autocontrast(big, cutoff=1)
big = big.filter(ImageFilter.UnsharpMask(radius=8, percent=130, threshold=2))
r, g, b = big.split()
r = r.point(lambda v: min(255, int(v * 1.05))); g = g.point(lambda v: int(v * 0.96)); b = b.point(lambda v: int(v * 0.86))
big = Image.merge('RGB', (r, g, b))
big = ImageEnhance.Color(big).enhance(1.0)

W, H = big.size
cx = 46 * S
mask = Image.new('L', (W, H), 0); d = ImageDraw.Draw(mask)
d.ellipse((cx - 27 * S, 6 * S, cx + 27 * S, 73 * S), fill=255)                     # head and hair
d.polygon([(cx - 12 * S, 66 * S), (cx + 12 * S, 66 * S), (cx + 30 * S, 82 * S), (cx + 32 * S, 108 * S), (cx - 32 * S, 108 * S), (cx - 30 * S, 82 * S)], fill=255)   # neck and shoulders
PW, PH = 30, 34
box = (cx - 38 * S, 1 * S, cx + 38 * S, 99 * S)
face = big.crop(box).resize((PW, PH), Image.LANCZOS)
face = ImageEnhance.Contrast(face).enhance(1.12)
face = face.filter(ImageFilter.UnsharpMask(radius=1, percent=110, threshold=3))   # crisp eyes, brows and mouth at pixel size
msmall = mask.crop(box).resize((PW, PH), Image.BOX).point(lambda v: 255 if v > 150 else 0)

bgc = [im.getpixel((x, y)) for x in range(2, 10) for y in range(2, 10)]
bg = tuple(sum(c[i] for c in bgc) // len(bgc) for i in range(3))
for y in range(PH):
    for x in range(PW):
        if msmall.getpixel((x, y)) and (x < 4 or x > PW - 5 or y < 6 or (y > 24 and (x < 8 or x > PW - 9))):
            p = face.getpixel((x, y))
            if sum((p[i] - bg[i]) ** 2 for i in range(3)) < 60 ** 2: msmall.putpixel((x, y), 0)
for y in range(22, PH):          # teal or grey-green pixels low down are the wall behind the shoulders, not the shirt
    for x in range(PW):
        p = face.getpixel((x, y))
        if msmall.getpixel((x, y)) and p[1] > p[0] + 6 and p[2] > p[0] - 4: msmall.putpixel((x, y), 0)
# a small palette from the face only (the background is left out of the colour choice)
tmp = Image.composite(face, Image.new('RGB', face.size, (0, 0, 0)), msmall)
q = tmp.quantize(colors=17, method=Image.MEDIANCUT, dither=Image.NONE)
qrgb = q.convert('RGB')

N = 48
grid = [[None] * N for _ in range(N)]
def put(x, y, v):
    if 0 <= x < N and 0 <= y < N: grid[y][x] = v

# --- wings, drawn as shapes: a big feathered fan on each side, behind the head
def wing(side):
    layer = Image.new('L', (N, N), 0); dd = ImageDraw.Draw(layer)
    pts = [(14, 30), (9, 24), (4, 20), (0, 12), (4, 14), (1, 8), (6, 11), (4, 5), (10, 10), (11, 3), (16, 12), (20, 16), (22, 28), (18, 34)]
    pts = [(x if side == 0 else N - 1 - x, y + 9) for x, y in pts]
    dd.polygon(pts, fill=255)
    return layer
for side in (0, 1):
    wl = wing(side)
    for y in range(N):
        for x in range(N):
            if wl.getpixel((x, y)) > 128:
                # feather shading: lighter at the tips, a cool grey line between feathers
                put(x, y, 'W' if (y + (x if side == 0 else N - x)) % 5 == 0 else ('w' if y < 26 else 'V'))
# --- the portrait
ox, oy = 9, 12
for y in range(PH):
    for x in range(PW):
        if msmall.getpixel((x, y)): put(ox + x, oy + y, qrgb.getpixel((x, y)))
# --- flame crown on the hair
crown = Image.new('L', (N, N), 0)
FL = ['.......a........', '......aa...a....', '....a.aya..aa...', '...aaayyaaaya...', '..aayyyYyyyyaa..', '..ayyyYYYyyyya..', '.aayyyYYYyyyyaa.', '.ayyyyyYyyyyyya.', 'kyyyyyyyyyyyyyyk']
for j, row in enumerate(FL):
    for i, ch in enumerate(row):
        if ch != '.': put(16 + i, 3 + j, ch)
# the crown band, resting on the hair
for i in range(14): put(17 + i, 12, 'y')
# --- navy outline
out = [r[:] for r in grid]
for y in range(N):
    for x in range(N):
        if grid[y][x] is None:
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                xx, yy = x + dx, y + dy
                if 0 <= xx < N and 0 <= yy < N and grid[yy][xx] is not None: out[y][x] = 'k'; break
grid = out
shared = {'k': '#161850', 'a': '#f59e0b', 'y': '#ffd100', 'Y': '#fff3b8', 'w': '#ffffff', 'W': '#cfd3f0', 'V': '#aeb4de'}
free = list('ABCDEGHIJLMNOPQRSTUXZ')
pal = {}; letter_of = {}; rows = []
for y in range(N):
    line = ''
    for x in range(N):
        v = grid[y][x]
        if v is None: line += '.'
        elif isinstance(v, str): line += v
        else:
            if v not in letter_of: letter_of[v] = free[len(letter_of)]; pal[letter_of[v]] = '#%02x%02x%02x' % v
            line += letter_of[v]
    rows.append(line)
pal.update({'W': '#cfd3f0', 'V': '#aeb4de'})
json.dump({'rows': rows, 'pal': pal}, open('face.json', 'w'))
allpal = dict(shared); allpal.update(pal)
SC = 12
pv = Image.new('RGB', (N * SC, N * SC), (46, 49, 146)); pd = ImageDraw.Draw(pv)
for y, line in enumerate(rows):
    for x, ch in enumerate(line):
        if ch != '.':
            c = allpal[ch].lstrip('#'); pd.rectangle((x * SC, y * SC, x * SC + SC - 1, y * SC + SC - 1), fill=tuple(int(c[i:i + 2], 16) for i in (0, 2, 4)))
pv.save('face-preview.png')
print(len(letter_of), 'face colours;', N, 'x', N)
