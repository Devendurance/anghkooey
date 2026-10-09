import json
from pathlib import Path
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
root = Path(__file__).resolve().parent.parent
font = TTFont(root / 'assets/Satoshi-Variable.woff2')
if 'fvar' in font:
    font = instantiateVariableFont(font, {'wght': 500}, inplace=False)
for record in font['name'].names:
    if record.nameID in (1, 16):
        record.string = 'Satoshi Film'.encode(record.getEncoding())
    elif record.nameID in (2, 17):
        record.string = 'Regular'.encode(record.getEncoding())
    elif record.nameID == 4:
        record.string = 'Satoshi Film Medium'.encode(record.getEncoding())
    elif record.nameID == 6:
        record.string = 'SatoshiFilm-Medium'.encode(record.getEncoding())
font.flavor = None
font.save(root / 'assets/Satoshi-Film-Medium.ttf')
cmap = font.getBestCmap()
units = font['head'].unitsPerEm
captions = json.loads((root / 'caption_groups.json').read_text(encoding='utf-8'))
widths = []
for c in captions:
    widths.append(sum(font['hmtx'][cmap.get(ch, '.notdef')][0] for ch in c['text']) * 46 / units)
assert max(widths) < 1550, 'Caption requires wrapping. Do not cover its upper line during delivery.'
(root / 'verification/caption-widths.json').write_text(json.dumps({'font': 'Satoshi Film Medium', 'fontSize': 46, 'maxWidth': max(widths), 'singleLineLimit': 1550, 'captionCount': len(captions), 'singleLine': True}, indent=2), encoding='utf-8')
print('All final caption phrases fit one line:', round(max(widths)), '< 1550 pixels.')
