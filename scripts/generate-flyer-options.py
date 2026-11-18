"""Create twelve complete flyer style sets from the approved event manifest."""
import json
from pathlib import Path

from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.colors import HexColor, white
from reportlab.graphics.barcode.qr import QrCodeWidget
from reportlab.graphics.shapes import Drawing
from reportlab.graphics import renderPDF
from pypdf import PdfReader, PdfWriter

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'output/pdf/style-options'
OUT.mkdir(parents=True, exist_ok=True)
SOURCE = json.loads((ROOT / 'output/pdf/approved-centered/flyer-event-sources-20261105.json').read_text(encoding='utf-8'))
PAGE_WIDTH, PAGE_HEIGHT = 612, 792
for name, filename in [('Display', 'Archivo-900.ttf'), ('Body', 'Roboto-400.ttf'), ('Bold', 'Roboto-700.ttf')]:
    pdfmetrics.registerFont(TTFont(name, str(ROOT / 'logos/source/fonts' / filename)))

STYLES = [
    dict(number='01', name='Cobalt classic', layout='frame', accent='#1a73e8', paper='#ffffff', ink='#202124', muted='#5f6368', pale='#e8f0fe', line='#dce2ea', title=88),
    dict(number='02', name='Navy headline', layout='banner', accent='#002e5d', paper='#ffffff', ink='#172539', muted='#58667a', pale='#edf3fa', line='#d8e1ed', title=80),
    dict(number='03', name='Open blue', layout='open', accent='#1266d5', paper='#ffffff', ink='#202124', muted='#626970', pale='#edf5ff', line='#d9e7f8', title=94),
    dict(number='04', name='Warm teal', layout='cards', accent='#087c78', paper='#fffdf7', ink='#183a38', muted='#526761', pale='#e3f4ec', line='#d1e5db', title=86),
    dict(number='05', name='Soft violet', layout='frame', accent='#6650bb', paper='#fffefe', ink='#2b273a', muted='#70667f', pale='#f0eafb', line='#e1daee', title=84),
    dict(number='06', name='Black and white', layout='rail', accent='#202124', paper='#ffffff', ink='#202124', muted='#606164', pale='#f0f0f0', line='#d4d4d4', title=90),
    dict(number='07', name='Big type', layout='open', accent='#002e5d', paper='#ffffff', ink='#172539', muted='#596574', pale='#e8f0fe', line='#cedbec', title=102),
    dict(number='08', name='Centered invitation', layout='stack', accent='#1a73e8', paper='#ffffff', ink='#202124', muted='#5f6368', pale='#e8f0fe', line='#dce2ea', title=86),
    dict(number='09', name='Sky blue', layout='rail', accent='#1165a8', paper='#eef8ff', ink='#18364d', muted='#516a7b', pale='#d8ecfa', line='#c2dceb', title=88),
    dict(number='10', name='Indigo cards', layout='cards', accent='#424db0', paper='#ffffff', ink='#242b4b', muted='#60667d', pale='#edf0ff', line='#d6dcf4', title=86),
    dict(number='11', name='Lemon highlight', layout='banner', accent='#ffe064', paper='#ffffff', ink='#202124', muted='#5f6368', pale='#fff8d8', line='#e8e0c2', title=80, banner_ink='#202124'),
    dict(number='12', name='After dark', layout='frame', accent='#93bdff', paper='#12243b', ink='#ffffff', muted='#c4d2e5', pale='#203954', line='#3b536f', title=88),
]


def label(pdf, value, x, baseline, size=12, font='Body', color='#202124', align='center'):
    pdf.setFont(font, size)
    pdf.setFillColor(HexColor(color))
    draw = {'center': pdf.drawCentredString, 'left': pdf.drawString, 'right': pdf.drawRightString}[align]
    draw(x, PAGE_HEIGHT - baseline, value)


def rule(pdf, x1, top, x2, color, width=0.7):
    pdf.setStrokeColor(HexColor(color))
    pdf.setLineWidth(width)
    pdf.line(x1, PAGE_HEIGHT - top, x2, PAGE_HEIGHT - top)


def rectangle(pdf, x, top, width, height, fill, stroke=None, radius=0, weight=1):
    pdf.setFillColor(HexColor(fill))
    pdf.setStrokeColor(HexColor(stroke or fill))
    pdf.setLineWidth(weight)
    if radius:
        pdf.roundRect(x, PAGE_HEIGHT - top - height, width, height, radius, fill=1, stroke=stroke is not None)
    else:
        pdf.rect(x, PAGE_HEIGHT - top - height, width, height, fill=1, stroke=stroke is not None)


def draw_qr(pdf, url, x, top, size):
    widget = QrCodeWidget(url, barLevel='M', barBorder=4)
    x0, y0, x1, y1 = widget.getBounds()
    drawing = Drawing(size, size, transform=[size/(x1-x0), 0, 0, size/(y1-y0), 0, 0])
    drawing.add(widget)
    rectangle(pdf, x, top, size, size, '#ffffff')
    renderPDF.draw(drawing, pdf, x, PAGE_HEIGHT - top - size)
    pdf.linkURL(url, (x, PAGE_HEIGHT-top-size, x+size, PAGE_HEIGHT-top), relative=0)


def draw_brand(pdf, style):
    size = 42 if style['layout'] == 'banner' else 44
    first_width = pdfmetrics.stringWidth('BYU', 'Display', size)
    gap = size * 0.2
    last_width = pdfmetrics.stringWidth('Calendar', 'Display', size)
    x = (PAGE_WIDTH - first_width - gap - last_width)/2
    brand_blue = '#1a73e8' if style['number'] == '11' else style['accent']
    label(pdf, 'BYU', x, 750, size, 'Display', style['ink'], 'left')
    label(pdf, 'Calendar', x+first_width+gap, 750, size, 'Display', brand_blue, 'left')


def heading(pdf, audience, style):
    layout = style['layout']
    size = style['title'] if audience == 'Finance' else min(style['title']+14, 112)
    maximum = 506
    size = min(size, maximum/pdfmetrics.stringWidth(audience, 'Display', 1))
    if layout == 'banner':
        rectangle(pdf, 32, 30, 548, 168, style['accent'], radius=14)
        ink = style.get('banner_ink', '#ffffff')
        label(pdf, audience, 306, 117, size, 'Display', ink)
        label(pdf, 'events', 306, 154, 30, 'Display', ink)
        label(pdf, 'November', 306, 181, 15, 'Body', ink)
    else:
        top = 110 if layout == 'stack' else 124
        label(pdf, audience, 306, top, size, 'Display', style['accent'])
        label(pdf, 'events', 306, top+39, 32, 'Display', style['ink'])
        label(pdf, 'November', 306, top+65, 15, 'Body', style['muted'])


def draw_events(pdf, entries, style):
    layout = style['layout']
    top = 193 if layout == 'stack' else 216
    row_height = 49 if layout == 'stack' else 54
    card_gap = 4 if layout == 'cards' else 0
    height = row_height*len(entries) + card_gap*(len(entries)-1)
    if layout == 'frame':
        rectangle(pdf, 40, top-3, 532, height+6, style['paper'], style['line'], 12, 1.2)
    if layout == 'rail':
        rectangle(pdf, 69, top, 70, height, style['pale'], radius=12)
    for index, entry in enumerate(entries):
        item = entry['printed']
        row_top = top + index*(row_height+card_gap)
        detail = ' | '.join(value for value in [item['time'], item['detail']] if value)
        title_width = pdfmetrics.stringWidth(item['title'], 'Bold', 13.3)
        detail_width = pdfmetrics.stringWidth(detail, 'Body', 10.3)
        if layout == 'cards':
            rectangle(pdf, 40, row_top, 532, row_height, style['pale'], radius=13)
        elif index and layout != 'rail':
            rule(pdf, 56, row_top, 556, style['line'])
        if layout == 'stack':
            badge_x, event_center = 86, 350
        else:
            badge_x, event_center = 78, 348
        if layout == 'rail':
            badge_x = 75
        elif layout == 'open':
            badge_x = 74
        else:
            rectangle(pdf, badge_x, row_top+6, 58, row_height-12, style['pale'], radius=6)
        if layout == 'cards':
            rectangle(pdf, badge_x, row_top+7, 58, row_height-14, style['paper'], radius=6)
        label(pdf, 'NOV', badge_x+29, row_top+18, 7.5, 'Bold', style['accent'] if style['number'] != '11' else style['ink'])
        label(pdf, item['date'], badge_x+29, row_top+39, 16 if len(item['date']) > 2 else 21, 'Display', style['accent'] if style['number'] != '11' else style['ink'])
        font_size = 13.3
        # The largest approved title stays within a predictable reading column.
        available = 408
        if title_width > available:
            font_size *= available/title_width
        label(pdf, item['title'], event_center, row_top+22, font_size, 'Bold', style['ink'])
        label(pdf, detail, event_center, row_top+40, 10.3, 'Body', style['muted'])
        assert max(title_width, detail_width) < 420
        pdf.linkURL('https://byucalendar.com/events/'+entry['id'], (48, PAGE_HEIGHT-row_top-row_height, 564, PAGE_HEIGHT-row_top), relative=0)


def invitation(pdf, url, style):
    layout = style['layout']
    accent = style['ink'] if style['number'] == '11' else style['accent']
    if layout == 'stack':
        label(pdf, 'See you there', 306, 481, 24, 'Display', accent)
        draw_qr(pdf, url, 236, 493, 140)
        label(pdf, 'byucalendar.com', 306, 654, 14, 'Bold', style['ink'])
        return
    if layout in ['frame', 'cards', 'banner']:
        rectangle(pdf, 40, 516, 532, 174, style['pale'], radius=14)
    elif layout == 'rail':
        rectangle(pdf, 64, 520, 484, 170, style['paper'], style['accent'], 16, 1.4)
    else:
        rule(pdf, 68, 517, 544, style['accent'], 1.5)
    qr_size = 140 if layout == 'open' else 134
    qr_x = 110 if layout == 'rail' else 99
    qr_top = 528
    draw_qr(pdf, url, qr_x, qr_top, qr_size)
    label(pdf, 'byucalendar.com', qr_x+qr_size/2, qr_top+qr_size+19, 12, 'Bold', style['ink'])
    label(pdf, 'See you there', 395, 588, 26, 'Display', accent)
    label(pdf, 'Scan for more events.', 395, 615, 13, 'Body', style['ink'])


def calendar_graphic(pdf, style):
    x, top, width, height = 42, 467, 528, 197
    radius = 0 if style['layout'] == 'open' else 12
    rectangle(pdf, x, top, width, height, style['paper'], style['line'], radius, 1.2)
    for index, day in enumerate(['MON', 'TUE', 'WED', 'THU', 'FRI']):
        label(pdf, day, x+width/5*(index+.5), top+22, 8, 'Bold', style['muted'])
    for row in [0,1,2]:
        rule(pdf, x, top+33+row*54, x+width, style['line'])
    pdf.setStrokeColor(HexColor(style['line']))
    pdf.setLineWidth(.65)
    for col in [1,2,3,4]:
        pdf.line(x+col*width/5, PAGE_HEIGHT-top-33, x+col*width/5, PAGE_HEIGHT-top-height)
    for title, col, row, span in [('Clubs',0,0,1.1), ('Careers',2,0,1.5), ('Music',1,1,1.4), ('Sports',3,1,1.1), ('Food',4,2,.8)]:
        block_x = x+12+col*width/5
        block_top = top+47+row*54
        block_width = min(width/5*span-17, x+width-10-block_x)
        fill = style['pale']
        block_ink = style['accent'] if style['number'] != '11' else style['ink']
        rectangle(pdf, block_x, block_top, block_width, 24, fill, radius=5)
        label(pdf, title, block_x+block_width/2, block_top+16, 10, 'Bold', block_ink)


def general_page(pdf, style):
    layout = style['layout']
    if layout == 'banner':
        rectangle(pdf, 32, 30, 548, 133, style['accent'], radius=14)
        headline_color = style.get('banner_ink', '#ffffff')
    else:
        headline_color = style['accent']
    label(pdf, 'Find your next', 306, 95, 37 if layout != 'open' else 42, 'Display', style['ink'] if layout != 'banner' else headline_color)
    label(pdf, 'campus event.', 306, 140, 37 if layout != 'open' else 42, 'Display', headline_color)
    if layout == 'open':
        rule(pdf, 97, 173, 515, style['line'])
    else:
        rectangle(pdf, 42, 180, 528, 247, style['pale'], radius=14)
    qr_size = 184 if layout != 'stack' else 198
    qr_top = 192 if layout != 'stack' else 186
    draw_qr(pdf, SOURCE['general']['qr'], (612-qr_size)/2, qr_top, qr_size)
    label(pdf, 'byucalendar.com', 306, 410, 21, 'Bold', style['ink'])
    calendar_graphic(pdf, style)
    draw_brand(pdf, style)


def create_flyer(style, kind, directory):
    filename = SOURCE[kind]['file']
    path = directory / filename
    pdf = canvas.Canvas(str(path), pagesize=(612,792), pageCompression=1)
    pdf.setTitle(style['number']+' '+style['name']+' - '+kind.title())
    pdf.setAuthor('BYU Calendar')
    rectangle(pdf, 0, 0, 612, 792, style['paper'])
    if kind == 'general':
        general_page(pdf, style)
    else:
        heading(pdf, 'Finance' if kind == 'finance' else 'AIS', style)
        draw_events(pdf, SOURCE[kind]['events'], style)
        invitation(pdf, SOURCE[kind]['qr'], style)
        draw_brand(pdf, style)
    pdf.showPage()
    pdf.save()
    return path


catalog = []
print_book = PdfWriter()
for style in STYLES:
    slug = style['number']+'-'+style['name'].lower().replace(' ', '-')
    directory = OUT / slug
    directory.mkdir(exist_ok=True)
    paths = []
    for kind in ['general','finance','ais']:
        path = create_flyer(style, kind, directory)
        print_book.append(str(path), import_outline=False)
        paths.append(str(path.relative_to(OUT)))
    print_book.add_outline_item(style['number']+' '+style['name'], (int(style['number'])-1)*3)
    catalog.append({**style, 'files':paths})
    print(style['number']+' '+style['name'])
print_book.write(str(OUT / 'all-36-flyers-print-book.pdf'))
(OUT / 'style-catalog.json').write_text(json.dumps(catalog, indent=2)+'\n', encoding='utf-8')
