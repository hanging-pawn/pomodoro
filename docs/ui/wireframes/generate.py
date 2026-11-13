"""Low-fi wireframes for POMO-42. Regenerate: python3 docs/ui/wireframes/generate.py docs/ui/wireframes"""
import sys
from pathlib import Path

OUT = Path(sys.argv[1])
INK, SUB, MUTED, LINE, CARD, ALT, HL, ACC, ACCM = (
    '#111827', '#4b5563', '#5b6472', '#e5e7eb', '#ffffff', '#f1f5f9', '#eef2ff', '#3730a3', '#6366f1')
NOTE = '#b45309'


def esc(s):
    return s.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')


class W:
    def __init__(s, w, h, title):
        s.w, s.h, s.items = w, h, []
        s.title = title

    def add(s, x):
        s.items.append(x)

    def rect(s, x, y, w, h, fill=CARD, stroke=LINE, r=12, dash=False):
        d = ' stroke-dasharray="4 3"' if dash else ''
        s.add(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{r}" fill="{fill}" stroke="{stroke}"{d}/>')

    def text(s, x, y, t, size=14, fill=INK, weight=400, anchor='start'):
        s.add(f'<text x="{x}" y="{y}" font-size="{size}" fill="{fill}" font-weight="{weight}" text-anchor="{anchor}">{esc(t)}</text>')

    def note(s, x, y, t, anchor='start'):
        s.text(x, y, t, 10, NOTE, 400, anchor)

    def btn(s, x, y, w, t, primary=False, h=52):
        if primary:
            s.rect(x, y, w, h, INK, INK, 14)
            s.text(x + w / 2, y + h / 2 + 5, t, 15, '#ffffff', 600, 'middle')
        else:
            s.rect(x, y, w, h, CARD, LINE, 14)
            s.text(x + w / 2, y + h / 2 + 5, t, 14, INK, 500, 'middle')

    def icon(s, cx, cy, label):
        s.add(f'<circle cx="{cx}" cy="{cy}" r="22" fill="{CARD}" stroke="{LINE}"/>')
        s.text(cx, cy + 4, label, 11, SUB, 500, 'middle')

    def bar(s, x, y, w, frac, over=False):
        s.rect(x, y, w, 6, '#c7d2fe', 'none', 3)
        s.rect(x, y, w * min(frac, 1), 6, '#b91c1c' if over else ACCM, 'none', 3)

    def line(s, pts, color, width=4, dash=False):
        d = ' stroke-dasharray="2 7"' if dash else ''
        p = ' '.join(f'{x},{y}' for x, y in pts)
        s.add(f'<polyline points="{p}" fill="none" stroke="{color}" stroke-width="{width}" stroke-linecap="round" stroke-linejoin="round"{d}/>')

    def station(s, x, y, done):
        if done:
            s.add(f'<circle cx="{x}" cy="{y}" r="7" fill="{ACCM}"/>')
        else:
            s.add(f'<circle cx="{x}" cy="{y}" r="7" fill="{CARD}" stroke="{MUTED}" stroke-width="2"/>')

    def here(s, x, y):
        s.add(f'<circle cx="{x}" cy="{y}" r="11" fill="none" stroke="{ACC}" stroke-width="3"/>')
        s.add(f'<circle cx="{x}" cy="{y}" r="4" fill="{ACC}"/>')

    def save(s, name):
        body = '\n  '.join(s.items)
        svg = (f'<svg xmlns="http://www.w3.org/2000/svg" width="{s.w}" height="{s.h}" viewBox="0 0 {s.w} {s.h}" '
               f'font-family="DM Sans, system-ui, sans-serif" role="img" aria-label="{esc(s.title)}">\n'
               f'  <title>{esc(s.title)}</title>\n'
               f'  <rect width="{s.w}" height="{s.h}" fill="#f8fafc"/>\n  {body}\n</svg>\n')
        (OUT / name).write_text(svg)


# Day data shared by all views: 4 tasks (2/2/1/1 rounds), 2 done, rewards between (FR-602, FR-603).
TASKS = [('Write report', 2, 2), ('Read chapter 3', 2, 0), ('Answer mails', 1, 0), ('Plan tomorrow', 1, 0)]
REWARDS = {1: ('Coffee outside', 'about 10:50', 'in 2 rounds'), 3: ('Walk by the lake', 'about 14:30', 'in 4 rounds')}


def header(s, x0, w, coins='20'):
    s.text(x0, 40, 'pomo.pomo', 18, INK, 700)
    s.note(x0, 54, 'name from config APP_NAME')
    s.text(x0 + w - 118, 38, coins, 18, INK, 700, 'end')
    s.text(x0 + w - 118, 52, 'coins', 11, SUB, 400, 'end')
    s.icon(x0 + w - 78, 38, 'Hz')
    s.icon(x0 + w - 24, 38, 'Set')


def budget(s, x0, y, w, done=2, planned=6, budget_=8):
    s.text(x0, y, 'Today', 14, INK, 600)
    s.text(x0 + w, y, f'{done} of {planned} rounds · budget {budget_}', 12, SUB, 400, 'end')
    s.bar(x0, y + 10, w, planned / budget_)
    s.add(f'<rect x="{x0}" y="{y + 10}" width="{w * done / budget_}" height="6" rx="3" fill="{ACC}"/>')


def draw_day(s, x0, y0, w, current=(1, 0)):
    """Day path: one row per task (title, then its rounds as stations on a lane across the width),
    lanes joined at alternating edges, reward rows between tasks (FR-602, FR-603)."""
    left, right = x0 + 4, x0 + w - 4
    pts, st, here_pos = [], [], None
    s.text(x0 + 20, y0 - 10, 'Start of day', 11, MUTED)
    pts.append((left, y0 - 14))
    y = y0
    for i, (title, n, done) in enumerate(TASKS):
        s.text(x0 + 20, y + 10, title, 14, INK if done < n else SUB, 500)
        s.text(x0 + w - 20, y + 10, f'{done} of {n} round' + ('s' if n > 1 else ''), 11, SUB, 400, 'end')
        sy = y + 34
        ltr = i % 2 == 0
        a_, b_ = (left, right) if ltr else (right, left)
        pts.append((a_, sy))
        for k in range(n):
            sx = a_ + (b_ - a_) * (k + 1) / (n + 1)
            pts.append((sx, sy))
            st.append((sx, sy, k < done))
            if (i, k) == current:
                here_pos = (sx, sy)
        pts.append((b_, sy))
        y += 62
        if i in REWARDS:
            name, at, dist = REWARDS[i]
            s.rect(x0 + 16, y - 8, w - 32, 42, HL, 'none', 12)
            s.text(x0 + 30, y + 10, f'{name} · {at}', 13, ACC, 600)
            s.text(x0 + 30, y + 26, f'40 coins · {dist}', 11, ACC)
            y += 50
    end_x = right if len(TASKS) % 2 else left
    pts.append((end_x, y))
    s.text(x0 + w / 2, y + 4, 'Goal · day done', 12, MUTED, 600, 'middle')
    cut = pts.index(here_pos)
    s.line(pts[cut:], MUTED, 3, dash=True)
    s.line(pts[: cut + 1], ACCM, 4)
    for sx, sy, d in st:
        s.station(sx, sy, d)
    s.here(*here_pos)
    return y


def nav(s, w, h, active='Today'):
    s.add(f'<rect x="0" y="{h - 64}" width="{w}" height="64" fill="{CARD}"/>')
    s.add(f'<line x1="0" y1="{h - 64}" x2="{w}" y2="{h - 64}" stroke="{LINE}"/>')
    items = ['Today', 'Tasks', 'Shop', 'Week']
    for k, it in enumerate(items):
        cx = w / len(items) * (k + 0.5)
        col = ACC if it == active else SUB
        s.add(f'<rect x="{cx - 10}" y="{h - 52}" width="20" height="20" rx="5" fill="none" stroke="{col}" stroke-width="1.5"/>')
        s.text(cx, h - 16, it, 11, col, 600 if it == active else 400, 'middle')


# 1 Main 360: Tagesweg overview (idle / before a round)
s = W(360, 860, 'Main screen Tagesweg overview at 360 px')
header(s, 16, 328)
budget(s, 16, 84, 328)
yend = draw_day(s, 22, 140, 316)
s.rect(16, 640, 328, 140, CARD, LINE, 16)
s.text(32, 664, 'NEXT ROUND', 11, SUB, 600)
s.text(32, 686, 'Read chapter 3 · round 1 of 2', 15, INK, 600)
s.text(32, 704, '25 min focus · strict', 12, SUB)
s.btn(32, 716, 236, 'Start round', primary=True)
s.icon(306, 742, 'P')
s.note(286, 776, 'park key (P)')
s.note(32, 620, 'timer: start in 1 tap (FR-102);')
s.note(32, 632, 'time runs as a path piece (FR-606)')
nav(s, 360, 860)
s.save('main-360.svg')

# 2 Focus 360: zoomed in during a round (FR-604, FR-606)
s = W(360, 760, 'Focus view during a round at 360 px')
s.text(16, 40, 'pomo.pomo', 18, INK, 700)
s.note(16, 54, 'Tagesweg, rewards and nav hidden in the round (FR-604)')
s.text(180, 140, 'Read chapter 3', 22, INK, 700, 'middle')
s.text(180, 164, 'round 1 of 2', 13, SUB, 400, 'middle')
# Path piece: one long segment from station to station, filled share = elapsed.
s.line([(60, 300), (300, 300)], '#c7d2fe', 10)
s.line([(60, 300), (196, 300)], ACCM, 10)
s.station(60, 300, True)
s.station(300, 300, False)
s.here(196, 300)
s.note(180, 330, 'remaining time = rest of the path piece', 'middle')
s.rect(110, 350, 140, 56, CARD, LINE, 14, dash=True)
s.text(180, 388, '10:48', 36, INK, 700, 'middle')
s.note(180, 422, 'digits only on tap, for 3 s (or always, setting)', 'middle')
s.rect(16, 452, 328, 120, CARD, LINE, 16, dash=True)
s.text(32, 476, 'Notes for this round (FR-609, later ticket)', 12, SUB, 600)
for k, t in enumerate(['outline section 3.1', 'note open questions']):
    s.add(f'<rect x="32" y="{490 + k * 30}" width="16" height="16" rx="4" fill="none" stroke="{MUTED}" stroke-width="1.5"/>')
    s.text(58, 503 + k * 30, t, 13, INK)
s.btn(16, 600, 156, 'Park  (P)')
s.btn(188, 600, 156, 'Abort')
s.note(16, 672, 'strict: no pause key, only Abort (FR-107);')
s.note(16, 686, 'flexible mode adds Pause')
s.note(16, 700, 'tab title: «10:48 · Read chapter 3» (FR-108)')
s.save('focus-360.svg')

# 3 Ring moment 360 (FR-605, FR-407)
s = W(360, 860, 'Ring moment on the path at 360 px')
header(s, 16, 328, coins='30')
budget(s, 16, 84, 328, done=3)
TASKS[1] = ('Read chapter 3', 2, 1)
REWARDS[1] = ('Coffee outside', 'about 10:50', 'in 1 round')
REWARDS[3] = ('Walk by the lake', 'about 14:30', 'in 3 rounds')
draw_day(s, 22, 140, 316, current=(1, 1))
s.rect(16, 640, 328, 140, HL, 'none', 16)
s.text(32, 670, '+10 coins', 22, ACC, 700)
s.text(32, 692, 'balance 30 · 10 to go until Coffee outside', 13, ACC)
s.text(32, 712, 'Read chapter 3: 1 of 2 rounds', 12, SUB)
s.btn(32, 722, 140, 'Short break', primary=True, h=44)
s.btn(184, 722, 144, 'Next round', h=44)
s.note(32, 620, 'dot moves one station, 600 ms ease, no confetti;')
s.note(32, 632, 'walked piece colours in (FR-605)')
s.note(32, 792, 'balance ≥ price → «Redeem» on the reward row')
nav(s, 360, 860)
s.save('ring-360.svg')

# 4 Pause 360
s = W(360, 860, 'Break view at 360 px')
header(s, 16, 328, coins='30')
budget(s, 16, 84, 328, done=3)
draw_day(s, 22, 140, 316, current=(1, 1))
s.rect(16, 640, 328, 140, CARD, LINE, 16)
s.text(32, 664, 'SHORT BREAK · 5 MIN', 11, SUB, 600)
s.bar(32, 676, 296, 0.4)
s.text(32, 704, 'Next: Read chapter 3 · round 2 of 2', 14, INK, 500)
s.btn(32, 716, 236, 'Start next round', primary=True)
s.icon(306, 742, 'P')
s.note(32, 632, 'whole Tagesweg visible again in the break (FR-604)')
nav(s, 360, 860)
s.save('pause-360.svg')
TASKS[1] = ('Read chapter 3', 2, 0)
REWARDS[1] = ('Coffee outside', 'about 10:50', 'in 2 rounds')
REWARDS[3] = ('Walk by the lake', 'about 14:30', 'in 4 rounds')

# 5 Horizon 360 (FR-607, FR-608)
s = W(360, 760, 'Horizon zoom level with projects up to their target date at 360 px')
s.icon(38, 38, '<')
s.text(70, 44, 'Horizon', 18, INK, 700)
s.note(70, 58, 'zoom level above the day; later ticket')
x_today, x_end = 40, 330
s.add(f'<line x1="{x_today}" y1="90" x2="{x_today}" y2="560" stroke="{ACC}" stroke-width="2"/>')
s.text(x_today, 84, 'today', 11, ACC, 600, 'middle')
for k, (name, end, days, frac) in enumerate([
        ('Exam statistics', '12 Dec', 'in 29 days', 0.95), ('Thesis chapter 2', '20 Nov', 'in 7 days', 0.35),
        ('Tax return', '30 Nov', 'in 17 days', 0.6)]):
    y = 140 + k * 130
    s.text(x_today + 10, y, name, 15, INK, 600)
    s.text(x_today + 10, y + 18, f'target {end} · {days} · 3 open tasks', 11, SUB)
    xe = x_today + (x_end - x_today) * frac
    s.line([(x_today, y + 44), (xe, y + 44)], MUTED, 3, dash=True)
    s.line([(x_today, y + 44), (x_today + 30, y + 44)], ACCM, 4)
    s.add(f'<rect x="{xe - 6}" y="{y + 36}" width="12" height="16" rx="2" fill="none" stroke="{INK}" stroke-width="2"/>')
    s.rect(x_today + 6, y + 58, 200, 44, 'none', LINE, 12, dash=True)
    s.text(x_today + 18, y + 85, 'tap = work on it next', 12, SUB)
s.note(16, 580, 'tap a project → its next open task')
s.note(16, 594, 'gets the next round (FR-607)')
s.save('horizon-360.svg')

# 6 Inventory 360 (FR-201..209, FR-608)
s = W(360, 760, 'Task inventory at 360 px')
s.text(16, 44, 'Tasks', 26, INK, 700)
s.icon(322, 38, '+')
s.rect(16, 70, 328, 44, ALT, 'none', 12)
s.text(32, 97, 'Add a task or paste lines…', 14, MUTED)
for k, t in enumerate(['All', 'Thesis', 'Exam', 'Unplanned']):
    s.rect(16 + k * 82, 126, 74, 32, HL if k == 0 else CARD, LINE if k else 'none', 16)
    s.text(53 + k * 82, 147, t, 12, ACC if k == 0 else SUB, 600 if k == 0 else 400, 'middle')
rows = [('Read chapter 3', 'Exam · 2 rounds · today', ''), ('Write report', 'Thesis · 2 of 2 · done today', ''),
        ('Summarise paper B', 'Thesis · 3 rounds · due tomorrow', 'due'),
        ('Register for exam', 'Exam · 1 round · overdue', 'overdue'),
        ('Call landlord  U', 'unplanned · external · parked 09:40', ''), ('Weekly review', 'weekly, Monday · 1 round', '')]
y = 176
for title, meta, flag in rows:
    s.add(f'<line x1="16" y1="{y + 52}" x2="344" y2="{y + 52}" stroke="{LINE}"/>')
    s.text(16, y + 20, title, 14, INK, 500)
    s.text(16, y + 38, meta, 11, '#b91c1c' if flag == 'overdue' else SUB)
    s.rect(268, y + 8, 76, 32, CARD, LINE, 16)
    s.text(306, y + 29, '+ today', 12, INK, 500, 'middle')
    y += 56
s.text(16, y + 24, 'Projects', 14, INK, 600)
s.text(16, y + 44, 'Exam statistics · target 12 Dec · 29 days left', 12, SUB)
s.note(16, y + 66, 'estimate > 7 → hint «split» (FR-202, FR-209)')
nav(s, 360, 760, 'Tasks')
s.save('inventory-360.svg')

# 7 Shop 360 (FR-402, FR-408, FR-405)
s = W(360, 760, 'Reward shop at 360 px')
s.text(16, 44, 'Shop', 26, INK, 700)
s.text(344, 40, '30', 22, INK, 700, 'end')
s.text(344, 56, 'coins', 11, SUB, 400, 'end')
s.rect(16, 74, 328, 44, ALT, 'none', 12)
s.text(32, 101, 'New reward: title and price…', 14, MUTED)
items = [('Coffee outside', 40), ('Episode of a series', 60), ('Walk by the lake', 30), ('Cake', 80),
         ('Evening off', 200), ('New book', 300)]
y = 140
for name, price in items:
    s.add(f'<line x1="16" y1="{y + 52}" x2="344" y2="{y + 52}" stroke="{LINE}"/>')
    s.text(16, y + 22, name, 14, INK, 500)
    s.text(16, y + 40, f'{price} coins', 12, SUB)
    ok = price <= 30
    s.rect(248, y + 8, 96, 36, INK if ok else CARD, INK if ok else LINE, 14)
    s.text(296, y + 31, 'Redeem' if ok else f'{price - 30} to go', 12, '#ffffff' if ok else MUTED, 600, 'middle')
    y += 56
s.text(16, y + 26, 'History', 14, INK, 600)
s.text(16, y + 46, 'Yesterday 16:10 · Coffee outside · −40', 12, SUB)
s.note(16, y + 68, 'templates on first start (FR-408), editable;')
s.note(16, y + 82, 'hidden when gamification is off (FR-405)')
nav(s, 360, 760, 'Shop')
s.save('shop-360.svg')

# 8 Main desktop 1280
s = W(1280, 800, 'Main screen Tagesweg overview on desktop')
s.text(40, 48, 'pomo.pomo', 20, INK, 700)
s.note(40, 62, 'name from config APP_NAME')
for k, t in enumerate(['Today', 'Tasks', 'Shop', 'Week']):
    s.text(220 + k * 80, 48, t, 14, ACC if k == 0 else SUB, 600 if k == 0 else 400)
s.text(1120, 46, '20', 20, INK, 700, 'end')
s.text(1120, 60, 'coins', 11, SUB, 400, 'end')
s.icon(1166, 42, 'Hz')
s.icon(1220, 42, 'Set')
s.rect(40, 90, 720, 680, CARD, LINE, 16)
budget(s, 72, 124, 656)
draw_day(s, 80, 190, 640)
s.rect(800, 90, 440, 300, CARD, LINE, 16)
s.text(824, 124, 'NEXT ROUND', 11, SUB, 600)
s.text(824, 152, 'Read chapter 3 · round 1 of 2', 18, INK, 600)
s.text(824, 176, '25 min focus · strict · Space to start', 13, SUB)
s.btn(824, 200, 320, 'Start round', primary=True)
s.icon(1192, 226, 'P')
s.text(824, 300, 'Keys: Space start · P park · N next task (NFR-06)', 12, SUB)
s.rect(800, 410, 440, 360, CARD, LINE, 16)
s.text(824, 444, 'Unplanned & urgent', 14, INK, 600)
s.text(824, 474, 'Call landlord · external · parked 09:40', 13, SUB)
s.text(824, 520, 'Parked thoughts', 14, INK, 600)
s.text(824, 550, 'look up formula for variance · internal', 13, SUB)
s.note(824, 600, 'side column: today extras; same components as mobile')
s.note(40, 790, 'desktop ≥ 1024 px: path left, next-round card and extras right; focus view centres the path piece')
s.save('main-desktop.svg')
print('ok')
