"""Render the three BYU Calendar flyers in the established brand style.

python scripts/generate-campaign-flyers.py --calendar output/pdf/flyer-event-sources-20261105.json
Requires ReportLab. The retained manifest reproduces this print run.
"""
from pathlib import Path
from datetime import datetime, timedelta
import argparse
import json
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.colors import HexColor, white
from reportlab.graphics.barcode.qr import QrCodeWidget
from reportlab.graphics.shapes import Drawing
from reportlab.graphics import renderPDF

ROOT=Path(__file__).resolve().parents[1]
W,H=612,792
INK,BLUE,PALE,MUTED,GRID=[HexColor(v) for v in ('#202124','#1a73e8','#e8f0fe','#5f6368','#e0e3e7')]
parser=argparse.ArgumentParser()
parser.add_argument('--calendar',type=Path,required=True)
parser.add_argument('--output',type=Path,default=ROOT/'output/pdf')
args=parser.parse_args()
data=json.loads(args.calendar.read_text(encoding='utf-8'))
records=data.get('events')
if records is None: records=[i['source'] for p in ['finance','ais'] for i in data[p]['events']]
events={e['id']:e for e in records}
args.output.mkdir(parents=True,exist_ok=True)
for name,file in [('Display','Archivo-900.ttf'),('Body','Roboto-400.ttf'),('Bold','Roboto-700.ttf')]:
    pdfmetrics.registerFont(TTFont(name,str(ROOT/'logos/source/fonts'/file)))


def text(c,content,x,baseline,size=12,font='Body',color=INK,align='left'):
    c.setFont(font,size)
    c.setFillColor(color)
    {'left':c.drawString,'center':c.drawCentredString,'right':c.drawRightString}[align](x,H-baseline,content)


def line(c,x1,y1,x2,y2,color=GRID,width=.8):
    c.setStrokeColor(color)
    c.setLineWidth(width)
    c.line(x1,H-y1,x2,H-y2)


def rounded(c,x,y,w,h,fill=white,stroke=INK,radius=10,width=1.6):
    c.setFillColor(fill)
    c.setStrokeColor(stroke or fill)
    c.setLineWidth(width)
    c.roundRect(x,H-y-h,w,h,radius,fill=1,stroke=stroke is not None)


def panel(c,x,y,w,h):
    rounded(c,x+5,y+5,w,h,INK,None,11)
    rounded(c,x,y,w,h,PALE,INK,11,1.8)


def brand(c,x,baseline,size):
    text(c,'BYU',x,baseline,size,'Display')
    offset=pdfmetrics.stringWidth('BYU','Display',size)+size*.2
    text(c,'Calendar',x+offset,baseline,size,'Display',BLUE)
    return offset+pdfmetrics.stringWidth('Calendar','Display',size)


def bottom_brand(c):
    size=46
    width=pdfmetrics.stringWidth('BYU','Display',size)+size*.2+pdfmetrics.stringWidth('Calendar','Display',size)
    assert width<532
    brand(c,(W-width)/2,750,size)


def qr(c,url,x,y,size):
    widget=QrCodeWidget(url,barLevel='M',barBorder=4)
    x0,y0,x1,y1=widget.getBounds()
    drawing=Drawing(size,size,transform=[size/(x1-x0),0,0,size/(y1-y0),0,0])
    drawing.add(widget)
    c.setFillColor(white)
    c.rect(x,H-y-size,size,size,fill=1,stroke=0)
    renderPDF.draw(drawing,c,x,H-y-size)
    c.linkURL(url,(x,H-y-size,x+size,H-y),relative=0)


def start(filename,title):
    c=canvas.Canvas(str(args.output/filename),pagesize=(W,H),pageCompression=1)
    c.setTitle(title)
    c.setAuthor('BYU Calendar')
    c.setSubject('BYU Calendar print campaign - US Letter portrait')
    return c


def illustrated_calendar(c):
    x,y,w,h=40,469,532,195
    rounded(c,x+5,y+5,w,h,INK,None,10)
    rounded(c,x,y,w,h,white,INK,10,1.8)
    for xx in [88,516]: rounded(c,xx,y-9,5,20,white,INK,2,1.3)
    for i,label in enumerate(['MON','TUE','WED','THU','FRI']):
        text(c,label,x+w/5*(i+.5),y+21,9,'Bold',MUTED,'center')
    line(c,x,y+31,x+w,y+31,INK,1.1)
    for i in range(1,5): line(c,x+w*i/5,y+31,x+w*i/5,y+h)
    for i in [1,2]: line(c,x,y+31+(h-31)*i/3,x+w,y+31+(h-31)*i/3)
    for label,xx,yy,ww,ink,pale in [
        ('Clubs',55,514,105,'#1a73e8','#e8f0fe'),
        ('Careers',270,514,139,'#188038','#e6f4ea'),
        ('Music',164,569,133,'#7627bb','#f3e8fd'),
        ('Sports',377,569,107,'#1a73e8','#e8f0fe'),
        ('Food',482,624,74,'#e8710a','#fef0df'),
    ]:
        rounded(c,xx,yy,ww,25,HexColor(pale),HexColor(ink),4,.8)
        text(c,label,xx+ww/2,yy+17,11,'Bold',HexColor(ink),'center')


def general():
    file='01-byu-calendar-qr-poster.pdf'
    c=start(file,'BYU Calendar - find your next campus event')
    text(c,'Find your next',W/2,105,38,'Display',align='center')
    text(c,'campus event.',W/2,148,38,'Display',BLUE,'center')
    panel(c,40,181,532,243)
    qr(c,'https://byucalendar.com/',214,191,184)
    text(c,'byucalendar.com',306,407,22,'Bold',INK,'center')
    c.linkURL('https://byucalendar.com/',(180,H-412,432,H-385),relative=0)
    illustrated_calendar(c)
    bottom_brand(c)
    c.showPage(); c.save()
    return {'file':file,'qr':'https://byucalendar.com/','note':'Evergreen category illustration; no dated event schedule.'}


FINANCE=[
    {'id':'marriott-events-lkb49w','date':'10','title':'Women in Finance: Alumnae Panel','time':'7:00 PM','detail':'TNRB 4315/4325'},
    {'id':'marriott-events-1ld8fud','date':'11','title':'McKinsey & Company Latin America','time':'6:00 PM','detail':'Info session | TNRB 1258'},
    {'id':'marriott-events-yuqint','date':'12','title':'BYU KBSA - Qualtrics','time':'2:30 PM','detail':'333 W River Dr, Provo'},
    {'id':'marriott-events-1m7ma1e','date':'13','title':"Pre-Finance Women's Lunch",'time':'11:00 AM','detail':''},
    {'id':'marriott-events-67wz','date':'17','title':'WINFA PEVC','time':'8:00 PM','detail':'TNRB 2220'},
]
AIS=[
    {'id':'ais-1mem0v3','date':'10-12','title':'Pies with Professors','time':None,'detail':'Times and details in AIS Slack'},
    {'id':'ais-mtwlgw','date':'12','title':'Tech Talks','time':'7:00 PM','detail':'Room TBD'},
    {'id':'ais-1g4nipv','date':'13','title':'A-Team','time':'9:00 AM','detail':'TNRB 3319'},
    {'id':'ais-8t5mm1','date':'17','title':'WAIS Activity','time':'6:00 PM','detail':''},
    {'id':'ais-g3a1vv','date':'19','title':'IS Academy: Professor Panel','time':'7:00 PM','detail':'Room TBD'},
]


def validate(items):
    for item in items:
        event=events[item['id']]
        assert not event['cancelled']
        if event['allDay']:
            assert event['start']=='2026-11-10' and event['end']=='2026-11-13'
        else:
            local=datetime.fromisoformat(event['start'].replace('Z','+00:00'))-timedelta(hours=7)
            assert (local.year,local.month,local.day)==(2026,11,int(item['date']))
            assert local.strftime('%I:%M %p').lstrip('0')==item['time']
        assert pdfmetrics.stringWidth(item['title'],'Bold',13.3)<420,item['title']


def targeted(kind,items):
    finance=kind=='finance'
    file='02-finance-business-events-flyer.pdf' if finance else '03-ais-events-flyer.pdf'
    c=start(file,'Finance events - BYU Calendar' if finance else 'AIS events - BYU Calendar')
    audience='Finance' if finance else 'AIS'
    heading_size=88 if finance else 100
    assert pdfmetrics.stringWidth(audience,'Display',heading_size)<532
    text(c,audience,W/2,121,heading_size,'Display',BLUE,'center')
    text(c,'events',W/2,162,34,'Display',align='center')
    text(c,'November',W/2,187,16,'Body',align='center')
    x,top,width,height=40,205,532,285
    rounded(c,x,top,width,height,white,INK,10,1.6)
    details=[' | '.join(part for part in [item['time'],item['detail']] if part) for item in items]
    text_width=max(max(pdfmetrics.stringWidth(item['title'],'Bold',13.3),
                       pdfmetrics.stringWidth(detail,'Body',10.3))
                   for item,detail in zip(items,details))
    badge_width,badge_gap=57,19
    badge_x=(W-badge_width-badge_gap-text_width)/2
    badge_center=badge_x+badge_width/2
    event_center=badge_x+badge_width+badge_gap+text_width/2
    row_h=height/len(items)
    for i,(item,detail) in enumerate(zip(items,details)):
        y=top+row_h*i
        if i: line(c,x+15,y,x+width-15,y)
        rounded(c,badge_x,y+9,badge_width,41,PALE,None,5)
        text(c,'NOV',badge_center,y+21,8,'Bold',BLUE,'center')
        text(c,item['date'],badge_center,y+42,17 if len(item['date'])>2 else 22,'Display',BLUE,'center')
        text(c,item['title'],event_center,y+25,13.3,'Bold',align='center')
        text(c,detail,event_center,y+44,10.3,'Body',MUTED,'center')
        c.linkURL('https://byucalendar.com/events/'+item['id'],(x+10,H-y-row_h+5,x+width-10,H-y-6),relative=0)
    panel(c,40,513,532,175)
    url='https://byucalendar.com/?q=Finance+or+business' if finance else 'https://byucalendar.com/?q=AIS'
    invitation='See you there'
    invitation_width=pdfmetrics.stringWidth(invitation,'Display',28)
    qr_size,cta_gap=134,32
    qr_x=(W-qr_size-cta_gap-invitation_width)/2
    qr_center=qr_x+qr_size/2
    cta_center=qr_x+qr_size+cta_gap+invitation_width/2
    qr(c,url,qr_x,523,qr_size)
    text(c,'byucalendar.com',qr_center,677,12.2,'Bold',INK,'center')
    c.linkURL('https://byucalendar.com/',(qr_x,H-682,qr_x+qr_size,H-661),relative=0)
    text(c,invitation,cta_center,590,28,'Display',BLUE,'center')
    text(c,'Scan for more events.',cta_center,619,15,align='center')
    bottom_brand(c)
    c.showPage(); c.save()
    return {'file':file,'qr':url,'events':[{'id':i['id'],'printed':i,'source':events[i['id']]} for i in items]}


validate(FINANCE)
validate(AIS)
manifest={'createdFor':'2026-11-05','design':'BYU Calendar centered flyer revision',
    'eventWindow':'2026-11-09 through 2026-11-20','paper':'US Letter portrait, 8.5 x 11 inches, no bleed',
    'general':general(),'finance':targeted('finance',FINANCE),'ais':targeted('ais',AIS)}
(args.output/'flyer-event-sources-20261105.json').write_text(json.dumps(manifest,indent=2,ensure_ascii=False)+'\n',encoding='utf-8')
(args.output/'README-flyers.md').write_text('''# BYU Calendar print flyers

Three numbered PDFs, revised to match byu-calendar-flyer.pdf: Archivo and Roboto,
site blue (#1a73e8), white space, thin dark outlines and a simple blue QR panel.
The original reference PDF is unchanged.
Finance and AIS lead in large, centered type above the events label and November.
The event rows and the QR and invitation pair are centered within their panels.
Each URL sits directly below its QR. BYU Calendar is the final bottom element.

- 01: General QR-first poster; evergreen calendar illustration below.
- 02: Five Finance/Business events, November 9-20, 2026.
- 03: Five AIS events for the same window.

Print US Letter portrait at 100% / Actual size, one-sided. No bleed is needed.
Keep the QR white margins clear. QR codes, lettering and calendar artwork are
vectors; fonts are embedded. Event entries are clickable in the PDFs.

The source manifest retains organizer records and QR destinations. Source details
were checked November 5 against the public Marriott and AIS feeds. Pies with
Professors covers November 10-12; the source end on November 13 is exclusive,
and no daily time is invented. Check AIS Slack for final details. Refresh or remove
dated flyers after November 20. No food/admission claim was inferred.

Rebuild this edition with ReportLab:
python scripts/generate-campaign-flyers.py --calendar output/pdf/flyer-event-sources-20261105.json

For another department, keep the layout and five-event limit; update the audience,
dates, source-backed selections and QR filter. Review Finance/AIS before expansion.
''',encoding='utf-8')
for profile in ['general','finance','ais']: print(args.output/manifest[profile]['file'])
