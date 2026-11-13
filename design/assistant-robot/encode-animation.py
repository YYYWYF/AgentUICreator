"""Pack genuine model renders into bounded, transparent frame atlases."""
from pathlib import Path
import argparse,hashlib,math,json
from PIL import Image
parser=argparse.ArgumentParser();parser.add_argument('frames',type=Path);parser.add_argument('output',type=Path);args=parser.parse_args()
interactive=(args.frames/'poses.json').exists()
files=sorted(p for p in args.frames.glob('*.png') if p.stem.isdecimal());assert len(files)==(70 if interactive else 800)
args.output.mkdir(parents=True,exist_ok=True)
unique=[];lookup={};timeline=[]
for file in files:
 data=file.read_bytes();key=hashlib.sha256(data).digest()
 if key not in lookup:lookup[key]=len(unique);unique.append(Image.open(file).convert('RGBA'))
 timeline.append(lookup[key])
size=192;gutter=2;cell=size+gutter*2;columns=8
for per_page in [32,16,8]:
 pages=[];sizes=[]
 for start in range(0,len(unique),per_page):
  rows=math.ceil(min(per_page,len(unique)-start)/columns)
  atlas=Image.new('RGBA',(columns*cell,rows*cell))
  for slot,image in enumerate(unique[start:start+per_page]):atlas.paste(image.resize((size,size),Image.Resampling.LANCZOS),((slot%columns)*cell+gutter,(slot//columns)*cell+gutter))
  target=args.output/f'assistant-robot-frames-{len(pages)}.webp';atlas.save(target,format='WEBP',quality=85,alpha_quality=100,method=6)
  pages.append(target);sizes.append(target.stat().st_size)
 if max(sizes)<=250000:break
else:raise RuntimeError('Atlas page exceeds template resource limit')
poster=Image.open(args.frames/'poster.png').convert('RGBA') if interactive else unique[0]
poster.resize((size,size),Image.Resampling.LANCZOS).save(args.output/'assistant-robot-still.png',optimize=True)
imports='\n'.join(f"import page{i} from './{p.name}';" for i,p in enumerate(pages))
bank=('  faceSize: 192, yawCount: 57, yawStep: 0.025, pitchCount: 13, pitchStep: 0.03, pitchStart: -0.18,\n  views: [' if interactive else '  timeline: [')
faces=json.loads((args.frames/'faces.json').read_text()) if interactive else None
if interactive:assert len(faces)==len(files)
face_source=('  faces: '+json.dumps(faces,separators=(',',':'))+',\n') if interactive else ''
source=imports+'\n\nexport const robotFrames = {\n'+f'  size: {size}, cell: {cell}, gutter: {gutter}, columns: {columns}, perPage: {per_page}, fps: 25,\n'+'  pages: ['+','.join(f'page{i}' for i in range(len(pages)))+'],\n'+bank+','.join(map(str,timeline))+'],\n'+face_source+'};\n'
(args.output/'assistant-robot-frames.ts').write_text(source)
for p in args.output.glob('assistant-robot-frames-*.webp'):
 if p not in pages:p.unlink()
old=args.output/'assistant-robot-loop.webp'
if old.exists():old.unlink()
print('Unique frames:',len(unique),'page sizes:',sizes,'total bytes:',sum(sizes),flush=True)
