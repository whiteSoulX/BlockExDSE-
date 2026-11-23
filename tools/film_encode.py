import json, os, subprocess, sys
D, OUT = sys.argv[1], sys.argv[2]
m = json.load(open(D + '/meta.json')); fr = sorted(m['frames'], key=lambda f: f['t'])
for i, f in enumerate(fr):
    nxt = fr[i + 1]['t'] if i + 1 < len(fr) else m['t1']
    f['d'] = min(max(nxt - f['t'], 1 / 60), 30)
order = []
for s in m['scenes']:
    if s['name'] not in order: order.append(s['name'])
total = 0
for name in order:
    fs_ = [f for f in fr if f['scene'] == name]
    if not fs_: continue
    lst = f'{D}/{name}.txt'
    with open(lst, 'w') as w:
        for f in fs_: w.write(f"file '{D}/{f['file']}'\nduration {f['d']:.4f}\n")
        w.write(f"file '{D}/{fs_[-1]['file']}'\n")
    tmp, out = f'{D}/scene_{name}.tmp.mp4', f'{D}/scene_{name}.mp4'
    r = subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', lst, '-vf', 'fps=30,scale=1920:1080,format=yuv420p',
                        '-c:v', 'libx264', '-crf', '18', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-video_track_timescale', '15360', tmp])
    if r.returncode: sys.exit('ffmpeg failed for scene ' + name)
    os.replace(tmp, out); d = sum(f['d'] for f in fs_); total += d
    print(f'scene {name}: {len(fs_)} frames, {d:.1f} s')
with open(f'{D}/all.txt', 'w') as w:
    for name in order:
        if os.path.exists(f'{D}/scene_{name}.mp4'): w.write(f"file '{D}/scene_{name}.mp4'\n")
tmp = OUT[:-4] + '.tmp.mp4'
subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', f'{D}/all.txt', '-c', 'copy', '-movflags', '+faststart', tmp], check=True)
os.replace(tmp, OUT)
base = fr[0]['t']; caps = [c for c in m['caps']]
def ts(x):
    x = max(x, 0); h = int(x // 3600); mi = int(x % 3600 // 60); s = x % 60
    return f'{h:02d}:{mi:02d}:{int(s):02d},{int(round((s - int(s)) * 1000)):03d}'
with open(OUT[:-4] + '.srt', 'w') as w, open(OUT[:-4] + '_narration.txt', 'w') as n:
    n.write('BlockExDSE v2.0 demo video: narration script (read each line when its caption appears)\n\n')
    k = 0
    for i, c in enumerate(caps):
        if not c['text']: continue
        a = c['t'] - base; b = (caps[i + 1]['t'] if i + 1 < len(caps) else m['t1']) - base
        k += 1; w.write(f"{k}\n{ts(a)} --> {ts(b - 0.05)}\n{c['text']}\n\n")
        n.write(f"[{int(a // 60)}:{int(a % 60):02d}] {(c['n'] + ': ') if c['n'] else ''}{c['text']}\n")
print('total', round(total, 1), 's ->', OUT)
