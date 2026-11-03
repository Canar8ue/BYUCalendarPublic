"""Create US Letter print flyers with a blank QR area or a vector website QR."""
from pathlib import Path
import argparse
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.colors import HexColor, white
from reportlab.graphics.barcode.qr import QrCodeWidget
from reportlab.graphics.shapes import Drawing
from reportlab.graphics import renderPDF

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument('--fonts', type=Path, required=True, help='Directory containing Archivo-900.ttf and Roboto-400.ttf')
args = parser.parse_args()
for name, filename in [('Archivo', 'Archivo-900.ttf'), ('Roboto', 'Roboto-400.ttf')]:
    pdfmetrics.registerFont(TTFont(name, str(args.fonts / filename)))
OUT = ROOT / 'output' / 'pdf'
OUT.mkdir(parents=True, exist_ok=True)
INK, BLUE = HexColor('#202124'), HexColor('#1a73e8')
URL = 'https://byucalendar.com/'


def label(c, text, x, y, size, font='Archivo', color=INK, centered=False):
    c.setFillColor(color)
    c.setFont(font, size)
    (c.drawCentredString if centered else c.drawString)(x, y, text)


def calendar(c, x, y, size):
    c.saveState()
    c.translate(x, y)
    c.scale(size/200, size/200)
    c.setFillColor(INK)
    c.roundRect(5, -5, 190, 183, 10, fill=1, stroke=0)
    c.setFillColor(white)
    c.setStrokeColor(INK)
    c.setLineWidth(2)
    c.roundRect(0, 0, 190, 183, 10, fill=1, stroke=1)
    c.line(0, 143, 190, 143)
    c.setStrokeColor(HexColor('#e0e3e7'))
    c.setLineWidth(.8)
    for xx in [38,76,114,152]:
        c.line(xx, 1, xx, 142)
    for yy in [36,72,108]:
        c.line(1, yy, 189, yy)
    for xx in [25,155]:
        c.setFillColor(white)
        c.setStrokeColor(INK)
        c.setLineWidth(2)
        c.roundRect(xx, 173, 6, 22, 3, fill=1, stroke=1)
    for xx, yy, ww, color, pale in [(10,115,92,'#1a73e8','#e8f0fe'),(49,79,129,'#188038','#e6f4ea'),(10,43,92,'#7627bb','#f3e8fd'),(124,9,54,'#e8710a','#fef0df')]:
        c.setFillColor(HexColor(pale))
        c.setStrokeColor(HexColor(color))
        c.setLineWidth(1)
        c.roundRect(xx, yy, ww, 22, 4, fill=1, stroke=1)
    c.restoreState()


for blank in [True, False]:
    path = OUT / ('byu-calendar-flyer-blank-qr.pdf' if blank else 'byu-calendar-flyer.pdf')
    c = canvas.Canvas(str(path), pagesize=(612,792))
    c.setTitle('BYU Calendar - campus events flyer' + (' - blank QR space' if blank else ''))
    c.setAuthor('BYU Calendar')
    c.setSubject('Printable campus event discovery flyer')
    # All artwork is inside half-inch margins; no bleed or borderless printer needed.
    c.setFillColor(BLUE)
    c.rect(40,742,532,8,fill=1,stroke=0)
    label(c,'BYU',40,654,90)
    label(c,'Calendar',40,567,90,color=BLUE)
    calendar(c,410,649,106)
    label(c,'Find your next campus event.',42,513,25,font='Roboto')
    label(c,'Clubs. Career fairs. Workshops. Free food.',42,481,17,font='Roboto')
    # Quiet, generous lower panel provides space for a 2.75-inch square QR sticker.
    c.setFillColor(INK)
    c.roundRect(46,76,532,365,12,fill=1,stroke=0)
    c.setFillColor(HexColor('#e8f0fe'))
    c.setStrokeColor(INK)
    c.setLineWidth(2)
    c.roundRect(40,82,532,365,12,fill=1,stroke=1)
    label(c,'SCAN TO EXPLORE',306,403,26,color=BLUE,centered=True)
    qx,qy,qs=207,174,198
    c.setFillColor(white)
    c.rect(qx,qy,qs,qs,fill=1,stroke=0)
    if blank:
        # Corner guides stay outside the blank sticker/image area.
        c.setStrokeColor(BLUE)
        c.setLineWidth(1.4)
        gap,arm=4,14
        for xx,sx in [(qx-gap,1),(qx+qs+gap,-1)]:
            for yy,sy in [(qy-gap,1),(qy+qs+gap,-1)]:
                c.line(xx,yy,xx+sx*arm,yy)
                c.line(xx,yy,xx,yy+sy*arm)
    else:
        qr=QrCodeWidget(URL,barLevel='M',barBorder=4)
        bx,by,bw,bh=qr.getBounds()
        drawing=Drawing(qs,qs,transform=[qs/(bw-bx),0,0,qs/(bh-by),0,0])
        drawing.add(qr)
        renderPDF.draw(drawing,c,qx,qy)
        c.linkURL(URL,(qx,qy,qx+qs,qy+qs),relative=0)
    label(c,'byucalendar.com',306,126,27,centered=True)
    c.linkURL(URL,(170,118,442,151),relative=0)
    label(c,'Independent student project. Not an official BYU service.',306,45,9,font='Roboto',color=HexColor('#5f6368'),centered=True)
    c.showPage()
    c.save()
    print(path)
