# FK по дампам (dump/*.json) -> pose/<clip>.json: мировые позиции всех 41 костей на каждом кадре (индекс = номер ключа, t = i/30).
# Модель трансформа FBX: local = T(Lcl Translation) * Rpre(PreRotation, XYZ) * R(Lcl Rotation, XYZ); без пивотов/масштабов (в файлах их нет).
import json, glob, math, os, sys
import paths
KT30 = 1539538600  # 46186158000/30
def rx(a):
    c, s = math.cos(a), math.sin(a); return [[1,0,0],[0,c,-s],[0,s,c]]
def ry(a):
    c, s = math.cos(a), math.sin(a); return [[c,0,s],[0,1,0],[-s,0,c]]
def rz(a):
    c, s = math.cos(a), math.sin(a); return [[c,-s,0],[s,c,0],[0,0,1]]
def mm(a, b): return [[sum(a[i][k]*b[k][j] for k in range(3)) for j in range(3)] for i in range(3)]
def mv(a, v): return [sum(a[i][k]*v[k] for k in range(3)) for i in range(3)]
def euler(d):  # eEulerXYZ: R = Rz*Ry*Rx
    x, y, z = [math.radians(t) for t in d]
    return mm(rz(z), mm(ry(y), rx(x)))
I3 = [[1,0,0],[0,1,0],[0,0,1]]
def ang(R):  # угол поворота матрицы, градусы
    c = (R[0][0]+R[1][1]+R[2][2]-1)/2; return math.degrees(math.acos(max(-1, min(1, c))))
def tr(R): return [[R[j][i] for j in range(3)] for i in range(3)]

def load(name):
    d = json.load(open(os.path.join(paths.DUMP_DIR, '%s.json' % name)))
    M = d['models']
    ids = [k for k, v in M.items() if v['type'] == 'LimbNode']
    # топологический порядок
    order = []; seen = set()
    def add(k):
        if k in seen: return
        p = M[k]['parent']
        if p is not None and p in M and M[p]['type'] == 'LimbNode': add(p)
        seen.add(k); order.append(k)
    for k in ids: add(k)
    names = [M[k]['name'] for k in order]
    idx = {k: i for i, k in enumerate(order)}
    par = [idx.get(M[k]['parent'], -1) if M[k]['parent'] in idx else -1 for k in order]
    T0 = [M[k]['props'].get('Lcl Translation', [0,0,0]) for k in order]
    Pre = [M[k]['props'].get('PreRotation', [0,0,0]) for k in order]
    R0 = [M[k]['props'].get('Lcl Rotation', [0,0,0]) for k in order]
    nkeys = 1; curves = {}  # (bone, chan) -> [axis arrays]
    times = None
    for a in d['anim']:
        if a['model'] not in idx: continue
        b = idx[a['model']]; ch = a['channel']
        arrs = []
        for ax in ('d|X', 'd|Y', 'd|Z'):
            c = a['curves'].get(ax)
            if c is None: arrs.append(None)
            else:
                arrs.append(c)
                if len(c['t']) > 1:
                    nkeys = max(nkeys, len(c['t']))
        curves[(b, ch)] = (arrs, a['defaults'])
    # времена
    for (b, ch), (arrs, df) in curves.items():
        for c in arrs:
            if c is not None and len(c['t']) == nkeys:
                times = c['t']; break
        if times: break
    return d, names, par, T0, Pre, R0, curves, nkeys, times

def sample(c, df_val, i, times):
    if c is None: return df_val
    if len(c['v']) == 1: return c['v'][0]
    return c['v'][i]  # ключи лежат на каждом кадре (проверено: dt=1539538600 тиков)

def run(name):
    d, names, par, T0, Pre, R0, curves, nk, times = load(name)
    # проверка равномерности 30 fps
    if times and len(times) > 1:
        dts = set(times[i+1]-times[i] for i in range(len(times)-1))
    else: dts = set()
    n = len(names)
    preR = [euler(p) for p in Pre]
    frames = []; locR_all = []; wrots = []
    for i in range(nk):
        Rw = [None]*n; Pw = [None]*n; locR = [None]*n
        for b in range(n):
            tt = list(T0[b]); rr = list(R0[b])
            if (b, 'Lcl Translation') in curves:
                arrs, df = curves[(b, 'Lcl Translation')]
                tt = [sample(arrs[k], df['d|'+'XYZ'[k]], i, times) for k in range(3)]
            if (b, 'Lcl Rotation') in curves:
                arrs, df = curves[(b, 'Lcl Rotation')]
                rr = [sample(arrs[k], df['d|'+'XYZ'[k]], i, times) for k in range(3)]
            Rl = mm(preR[b], euler(rr)); locR[b] = Rl
            if par[b] < 0: Rw[b] = Rl; Pw[b] = tt
            else:
                Rw[b] = mm(Rw[par[b]], Rl)
                o = mv(Rw[par[b]], tt); Pw[b] = [Pw[par[b]][k]+o[k] for k in range(3)]
        frames.append([[round(x, 6) for x in p] for p in Pw]); locR_all.append(locR)
        wrots.append({nm: [[round(x, 5) for x in r] for r in Rw[names.index('mixamorig:' + nm)]] for nm in ('Hips', 'Spine', 'Spine2', 'Head', 'LeftFoot', 'RightFoot')})
    # шов: углы локальных вращений первый/последний
    seam_ang = max(ang(mm(tr(locR_all[0][b]), locR_all[-1][b])) for b in range(n))
    # скорость вращений по кадрам: макс угол между соседними кадрами по костям
    rot_step = [0.0] + [max(ang(mm(tr(locR_all[i-1][b]), locR_all[i][b])) for b in range(n)) for i in range(1, nk)]
    out = {'name': name, 'names': names, 'parent': par, 'nframes': nk, 'fps': 30, 'dt_ticks': sorted(dts),
           'pos': frames, 'wrot': wrots, 'seam_ang_max_deg': seam_ang, 'rot_step_max_deg': rot_step,
           'stop_s': d['stacks'][0].get('LocalStop', 0)/46186158000, 'hasMesh': d['hasMesh'], 'unit': d['global']['UnitScaleFactor'][0]}
    json.dump(out, open(paths.out('pose', '%s.json' % name), 'w'))
    return out
if __name__ == '__main__':
    for f in sorted(glob.glob(os.path.join(paths.DUMP_DIR, '*.json'))):
        nm = os.path.basename(f)[:-5]
        o = run(nm)
        print(nm, o['nframes'], 'dt', o['dt_ticks'], 'seam', round(o['seam_ang_max_deg'], 3))
