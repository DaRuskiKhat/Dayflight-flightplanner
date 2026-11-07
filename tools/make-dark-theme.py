#!/usr/bin/env python3
"""Generate dist/dark.css from dist/style.css.

Every rule that sets a colour gets a `html[data-theme=dark] <selector>` counterpart (inside the same @media
wrapper, in the same order) with the colour remapped by role:
  - backgrounds: light -> dark (dark backgrounds such as primary buttons are kept)
  - text/fill: dark -> light (light text, e.g. on primary buttons, is kept)
  - borders/outlines: light -> subtle dark
Saturated mid-tone accents (gold highlights, light-category colours, flight-category badges) are kept, and
areas that are already dark (the map card and everything inside it) are skipped.

Re-run after editing style.css:  python3 tools/make-dark-theme.py
"""
import colorsys, pathlib, re, sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC, OUT = ROOT / 'dist' / 'style.css', ROOT / 'dist' / 'dark.css'

# Selectors for regions that are already dark, or whose colours carry meaning; left untouched.
SKIP = re.compile(r'map-card|map-wrap|map-heading|map-navigation|map-settings|map-legend|map-footer|#map\b|sky|celestial|'
                  r'route-comparison|\.status|simulation-notice|mapPick|#segments|\.segments|\bseg\b|\.seg\b|wx-badge|wx-vfr|'
                  r'wx-mvfr|wx-ifr|wx-lifr|wx-none|data-light|\.dot\b|legend|swatch|\.day\b|\.civil|\.nautical|\.astronomical|'
                  r'\.night\b|alt-ramp|aircraft-icon|phase-mark|day-change')
COLOR_PROPS = {'color', 'background', 'background-color', 'background-image', 'border', 'border-color', 'border-top',
               'border-bottom', 'border-left', 'border-right', 'border-top-color', 'border-bottom-color',
               'border-left-color', 'border-right-color', 'outline', 'outline-color', 'box-shadow', 'fill', 'stroke',
               'caret-color', 'text-decoration-color', 'accent-color'}
TOKEN = re.compile(r'#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)|\bwhite\b')


def parse_color(tok):
    t = tok.lower()
    if t == 'white':
        return (1, 1, 1, None)
    if t.startswith('#'):
        h = t[1:]
        if len(h) in (3, 4):
            h = ''.join(ch * 2 for ch in h)
        r, g, b = (int(h[i:i + 2], 16) / 255 for i in (0, 2, 4))
        a = int(h[6:8], 16) / 255 if len(h) == 8 else None
        return (r, g, b, a)
    nums = [float(x.strip().rstrip('%')) for x in t[t.index('(') + 1:-1].split(',')]
    return (nums[0] / 255, nums[1] / 255, nums[2] / 255, nums[3] if len(nums) > 3 else None)


def fmt(r, g, b, a):
    s = '#' + ''.join(f'{round(max(0, min(1, v)) * 255):02x}' for v in (r, g, b))
    if a is not None:
        s += f'{round(a * 255):02x}'
    return s


def remap(tok, role):
    r, g, b, a = parse_color(tok)
    h, l, s = colorsys.rgb_to_hls(r, g, b)
    if a is not None and a < 0.2 and role != 'text':
        return tok                      # faint overlays/shadows read the same on dark
    if s > 0.42 and 0.35 < l < 0.85:
        return tok                      # saturated accents (gold, warm highlights) keep their colour
    if role == 'bg':
        if l < 0.45:
            return tok                  # already-dark surfaces (primary buttons etc.)
        nl = 0.085 + (1 - l) * 0.55     # #fff -> ~0.085, #eef2e8 -> ~0.12, #dbe1d9 -> ~0.16
        h, ns = 0.43, 0.14              # one consistent deep teal-green tint (near-white sources carry stray hues)
    elif role == 'border':
        if l < 0.45:
            return tok
        nl = 0.17 + (1 - l) * 0.45
        h, ns = 0.43, 0.12
    else:                               # text / fill / stroke
        if l > 0.6:
            return tok                  # light text already (e.g. on dark buttons)
        nl = 0.93 - l * 0.55            # #193e40 (0.17) -> ~0.84, muted #6d8278 (0.47) -> ~0.67
        ns = min(s, 0.32)
    r2, g2, b2 = colorsys.hls_to_rgb(h, nl, ns)
    return fmt(r2, g2, b2, a)


def role_of(prop):
    if prop.startswith('background'):
        return 'bg'
    if prop.startswith('border') or prop.startswith('outline') or prop == 'box-shadow':
        return 'border'
    return 'text'


def convert_decls(body):
    out = []
    for decl in body.split(';'):
        if ':' not in decl:
            continue
        prop, val = decl.split(':', 1)
        p = prop.strip().lower()
        if p not in COLOR_PROPS or 'var(' in val:
            continue
        role = role_of(p)
        new = TOKEN.sub(lambda m: remap(m.group(0), role), val)
        if new != val:
            out.append(f'{p}:{new.strip()}')
    return ';'.join(out)


def blocks(css):
    """Yield (prelude, body) for top-level blocks; nested @media bodies are returned raw."""
    i, n = 0, len(css)
    while i < n:
        j = css.find('{', i)
        if j < 0:
            break
        prelude = css[i:j].strip()
        depth, k = 1, j + 1
        while k < n and depth:
            depth += {'{': 1, '}': -1}.get(css[k], 0)
            k += 1
        yield prelude, css[j + 1:k - 1]
        i = k


def prefix(selectors):
    parts = [s.strip() for s in selectors.split(',') if s.strip()]
    out = []
    for s in parts:
        if s in (':root', 'html'):
            out.append('html[data-theme=dark]')
        elif s.startswith('html'):
            out.append('html[data-theme=dark]' + s[4:])
        elif s.startswith('body'):
            out.append('html[data-theme=dark] ' + s)
        else:
            out.append('html[data-theme=dark] ' + s)
    return ','.join(out)


def convert_rules(css):
    out = []
    for prelude, body in blocks(css):
        if prelude.startswith('@media') or prelude.startswith('@supports'):
            inner = convert_rules(body)
            if inner:
                out.append(f'{prelude}{{{inner}}}')
        elif prelude.startswith('@'):
            continue                    # @font-face, @keyframes
        else:
            if SKIP.search(prelude):
                continue
            decls = convert_decls(body)
            if decls:
                out.append(f'{prefix(prelude)}{{{decls}}}')
    return '\n'.join(out)


css = re.sub(r'/\*.*?\*/', '', SRC.read_text(), flags=re.S)
header = ('/* Dark theme for Dayflight. GENERATED by tools/make-dark-theme.py from style.css; edit the generator or '
          'the hand-tuned section at the end, not the generated rules. */\n'
          'html[data-theme=dark]{color-scheme:dark;--bg:#111816;--ink:#dfe8e2;--muted:#93a69c;--line:#2a3633}\n')
generated = convert_rules(css)
manual_path = ROOT / 'tools' / 'dark-overrides.css'
manual = manual_path.read_text() if manual_path.exists() else ''
OUT.write_text(header + generated + '\n/* Hand-tuned overrides (tools/dark-overrides.css) */\n' + manual)
print(f'wrote {OUT.relative_to(ROOT)}: {len(generated.splitlines())} generated rules, {len(manual)} chars of overrides')
