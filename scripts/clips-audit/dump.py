# usage: python3 -I dump.py <in.fbx> <out.json>   (парсер бинарного FBX, ничего не исполняет)
import sys, struct, zlib, json
src, dst = sys.argv[1], sys.argv[2]
b = open(src, 'rb').read()
assert b[:20] == b'Kaydara FBX Binary  ', 'not binary FBX'
ver = struct.unpack('<I', b[23:27])[0]
FM = {'Y':'<h','C':'<B','F':'<f','D':'<d','I':'<i','L':'<q'}
def parse(pos, limit):
    nodes = []
    while pos < limit:
        end, np_, pl, nl = struct.unpack('<QQQB', b[pos:pos+25])
        if end == 0: return nodes, pos+25
        name = b[pos+25:pos+25+nl].decode('latin1')
        p = pos+25+nl; props = []; pend = p+pl
        for _ in range(np_):
            t = chr(b[p]); p += 1
            if t in FM:
                sz = struct.calcsize(FM[t]); props.append(struct.unpack(FM[t], b[p:p+sz])[0]); p += sz
            elif t in 'SR':
                l = struct.unpack('<I', b[p:p+4])[0]; p += 4
                props.append(b[p:p+l].decode('latin1') if t=='S' else None); p += l
            else:
                n, enc, cl = struct.unpack('<III', b[p:p+12]); p += 12
                raw = b[p:p+cl]; p += cl
                if enc: raw = zlib.decompress(raw)
                code = {'f':'f','d':'d','l':'q','i':'i','b':'B'}[t]
                props.append(list(struct.unpack('<%d%s' % (n, code), raw)))
        children = []
        if pend < end: children, _ = parse(pend, end)
        nodes.append((name, props, children)); pos = end
    return nodes, pos
top, _ = parse(27, len(b))
def find(ns, nm):
    for n in ns:
        if n[0] == nm: return n
def nm(s): return s.split('\x00')[0]
out = {'file': src.split('/')[-1], 'version': ver, 'size': len(b)}
gs = {}
for n in find(top, 'GlobalSettings')[2]:
    if n[0] == 'Properties70':
        for c in n[2]:
            if c[0]=='P': gs[c[1][0]] = c[1][4:]
out['global'] = gs
objs = find(top, 'Objects')[2]
cnt = {}
for n in objs: cnt[n[0]] = cnt.get(n[0], 0) + 1
out['objcount'] = cnt
models = {}
for n in objs:
    if n[0] == 'Model':
        pr = {}
        p70 = find(n[2], 'Properties70')
        if p70:
            for c in p70[2]:
                if c[0]=='P' and len(c[1])>=5: pr[c[1][0]] = c[1][4:]
        models[n[1][0]] = {'name': nm(n[1][1]), 'type': n[1][2], 'props': pr}
cnodes = {}
for n in objs:
    if n[0] == 'AnimationCurveNode':
        pr = {}
        p70 = find(n[2], 'Properties70')
        if p70:
            for c in p70[2]:
                if c[0]=='P' and len(c[1])>=5: pr[c[1][0]] = c[1][4]
        cnodes[n[1][0]] = {'name': nm(n[1][1]), 'props': pr}
curves = {}
for n in objs:
    if n[0] == 'AnimationCurve':
        kt = find(n[2], 'KeyTime')[1][0]; kv = find(n[2], 'KeyValueFloat')[1][0]
        curves[n[1][0]] = {'t': kt, 'v': kv}
stacks = []
for n in objs:
    if n[0] == 'AnimationStack':
        d = {'name': nm(n[1][1])}
        p70 = find(n[2], 'Properties70')
        if p70:
            for c in p70[2]:
                if c[0]=='P' and c[1][0] in ('LocalStart','LocalStop','ReferenceStart','ReferenceStop'): d[c[1][0]] = c[1][4]
        stacks.append(d)
out['stacks'] = stacks
parent = {}; cn_model = {}; cv_cn = {}
for c in find(top, 'Connections')[2]:
    p = c[1]
    if p[0] == 'OO' and p[1] in models and p[2] in models: parent[p[1]] = p[2]
    if p[0] == 'OP' and p[1] in cnodes and p[2] in models: cn_model[p[1]] = (p[2], p[3])
    if p[0] == 'OP' and p[1] in curves and p[2] in cnodes: cv_cn.setdefault(p[2], {})[p[3]] = p[1]
out['models'] = {str(k): dict(v, parent=str(parent[k]) if k in parent else None) for k, v in models.items()}
anim = []
for cid, (mid, ch) in cn_model.items():
    d = {'model': str(mid), 'channel': ch, 'defaults': cnodes[cid]['props'], 'curves': {}}
    for axis, cvid in cv_cn.get(cid, {}).items(): d['curves'][axis] = curves[cvid]
    anim.append(d)
out['anim'] = anim
# geometry presence / mesh vertex count
geo = find(objs and [('Objects',[],objs)], 'Objects')
out['hasMesh'] = cnt.get('Geometry', 0) > 0
json.dump(out, open(dst, 'w'))
print(src.split('/')[-1], 'ver', ver, 'models', len(models), 'anim nodes', len(anim), 'stacks', stacks, 'geom', cnt.get('Geometry', 0))
