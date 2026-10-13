#!/usr/bin/env python3
"""
يرسم صورة تقريبية من قياسات التخطيط الحقيقية المستخرجة من المتصفح.
يُستخدم للتحقق البصري عندما لا تتوفر لقطة شاشة من المتصفح.
"""
import json, sys, os
from PIL import Image, ImageDraw, ImageFont

try:
    import arabic_reshaper
    from bidi.algorithm import get_display
    HAS_SHAPING = True
except ImportError:
    HAS_SHAPING = False

def shape(text):
    """يشكّل النص العربي ويطبّق الاتجاه الصحيح"""
    if not text:
        return text
    if not HAS_SHAPING:
        return text
    try:
        return get_display(arabic_reshaper.reshape(text))
    except Exception:
        return text

def find_font():
    candidates = [
        '/usr/share/fonts/noto/NotoSansArabic-Regular.ttf',
        '/usr/share/fonts/noto/NotoSansArabic-Regular.ttf',
        '/usr/share/fonts/TTF/NotoSansArabic-Regular.ttf',
        '/usr/share/fonts/dejavu/DejaVuSans.ttf',
    ]
    for c in candidates:
        if os.path.exists(c):
            return c
    # ابحث في النظام
    for root, dirs, files in os.walk('/usr/share/fonts'):
        for f in files:
            if f.endswith('.ttf') and ('Arabic' in f or 'arabic' in f or 'Naskh' in f):
                return os.path.join(root, f)
    return None

FONT_PATH = find_font()
_font_cache = {}

def font(size):
    size = max(8, int(size))
    if size in _font_cache:
        return _font_cache[size]
    try:
        f = ImageFont.truetype(FONT_PATH, size) if FONT_PATH else ImageFont.load_default()
    except Exception:
        f = ImageFont.load_default()
    _font_cache[size] = f
    return f

def parse_color(c):
    """يحول rgb(...) / color(srgb ...) / rgba(...) إلى RGBA"""
    if not c or c in ('rgba(0, 0, 0, 0)', 'transparent'):
        return None
    c = c.strip()
    if c.startswith('color(srgb'):
        nums = c[c.index('(')+1:c.index(')')].split('/')
        rgb = nums[0].split()
        alpha = float(nums[1]) if len(nums) > 1 else 1.0
        return tuple(int(float(x)*255) for x in rgb[:3]) + (int(alpha*255),)
    if c.startswith('rgb'):
        inner = c[c.index('(')+1:c.index(')')]
        if '/' in inner:
            left, right = inner.split('/')
            alpha = float(right.strip().rstrip(')'))
            vals = [float(x.strip()) for x in left.replace(',', ' ').split() if x.strip()]
        else:
            parts = [p.strip() for p in inner.split(',')]
            vals = [float(p) for p in parts[:3]]
            alpha = float(parts[3]) if len(parts) > 3 else 1.0
        r, g, b = [int(v) for v in vals[:3]]
        return (r, g, b, max(0, min(255, int(alpha*255))))
    return None

def draw_rounded(d, box, radius, fill=None, outline=None, width=1):
    if radius <= 0:
        if fill: d.rectangle(box, fill=fill)
        if outline: d.rectangle(box, outline=outline, width=width)
        return
    try:
        d.rounded_rectangle(box, radius=radius, fill=fill, outline=outline, width=width)
    except Exception:
        if fill: d.rectangle(box, fill=fill)
        if outline: d.rectangle(box, outline=outline, width=width)

def rtl_text(d, text, box, fnt, fill, align='right'):
    """يرسم نصًا عربيًا داخل صندوق مع محاذاة RTL وتشكيل صحيح"""
    if not text:
        return
    shaped = shape(text)
    x0, y0, x1, y1 = box
    try:
        bbox = d.textbbox((0, 0), shaped, font=fnt)
        tw, th = bbox[2]-bbox[0], bbox[3]-bbox[1]
    except Exception:
        tw, th = len(shaped)*8, 14
    if align == 'right':
        x = x1 - tw - 2
    elif align == 'center':
        x = x0 + (x1-x0-tw)/2
    else:
        x = x0 + 2
    y = y0 + ((y1-y0) - th)/2 - 2
    d.text((x, y), shaped, font=fnt, fill=fill)

def render(data, out_path, width=412, height=None):
    items = data['sample']
    maxy = max((it['y']+it['h'] for it in items), default=1000)
    height = height or min(maxy + 30, 3000)
    scale = 2
    img = Image.new('RGB', (width*scale, height*scale), (244, 246, 245))
    d = ImageDraw.Draw(img, 'RGBA')

    def S(v): return int(v*scale)

    # ارسم من الخلف للأمام (الترتيب كما هو = تسلسل DOM)
    for it in items:
        x, y, w, h = it['x'], it['y'], it['w'], it['h']
        if y > height:
            continue
        bg = parse_color(it.get('bg'))
        box = (S(x), S(y), S(x+w), S(y+h))
        radius = 0
        try:
            radius = int(float(it.get('br','0px').replace('px',''))) * scale
        except Exception:
            radius = 0

        if bg and bg[3] > 0:
            # خلفية العنصر
            if bg[3] < 255:
                # مزج مع الخلفية
                base = img.crop(box).convert('RGBA')
                overlay = Image.new('RGBA', base.size, bg)
                base = Image.alpha_composite(base, overlay)
                img.paste(base.convert('RGB'), (box[0], box[1]))
            else:
                draw_rounded(d, box, radius, fill=bg[:3])

        # حدود مرئية للعناصر البيضاء الرئيسية
        cls = it.get('cls','')
        if any(k in cls for k in ['task-card','sum-card','capture-box','meet-card',
                                   'assist-card','active-timer','done-sec','icon-btn',
                                   'tab','btn','flt-sel','bottom-bar','review-wrap']):
            border_col = (221, 227, 230, 255)
            if 'task-card' in cls or 'assist-card' in cls:
                # حد جانبي بلون القسم
                border_col = (46, 125, 107, 255)
            draw_rounded(d, box, radius, outline=border_col, width=max(1, scale//2))

        # النص
        txt = it.get('txt','')
        if txt:
            col = parse_color(it.get('color')) or (27,36,48,255)
            f = font(float(it.get('fs', 16)))
            rtl_text(d, txt, box, f, col[:3], align='right')

    img = img.resize((width, height), Image.LANCZOS)
    img.save(out_path, quality=92)
    return out_path

if __name__ == '__main__':
    src = sys.argv[1] if len(sys.argv) > 1 else '/tmp/layout.json'
    out = sys.argv[2] if len(sys.argv) > 2 else '/var/minis/attachments/daftar-preview.jpg'
    with open(src, encoding='utf-8') as f:
        data = json.load(f)
    p = render(data, out)
    print('saved:', p, Image.open(p).size)