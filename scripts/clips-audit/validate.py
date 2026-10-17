import json, math, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import paths
g = json.load(open(paths.GLTF_POSE))
gi = {n: i for i, n in enumerate(g['names'])}
pairs = [('Martelo_2', 'kick_high'), ('Cross_Punch', 'punch_heavy'), ('Punching_1', 'punch_body')]
for fb, gl in pairs:
    p = json.load(open(os.path.join(paths.POSE_DIR, '%s.json' % fb)))
    fi = {n: i for i, n in enumerate(p['names'])}
    ga = g['anims'][gl]['frames']
    n = min(len(ga), p['nframes'])
    print(fb, 'fbx frames', p['nframes'], 'gltf frames', len(ga))
    def dist(a, b): return math.sqrt(sum((x-y)**2 for x, y in zip(a, b)))
    mx = {}
    for nm in ['Hips','Head','LeftHand','RightHand','LeftFoot','RightFoot','LeftToeBase','RightToeBase']:
        key = 'mixamorig:'+nm
        d_abs = max(dist(p['pos'][k][fi[key]], ga[k][gi[key]]) for k in range(n))
        # относительно Hips
        d_rel = max(dist([a-b for a, b in zip(p['pos'][k][fi[key]], p['pos'][k][fi['mixamorig:Hips']])], [a-b for a, b in zip(ga[k][gi[key]], ga[k][gi['mixamorig:Hips']])]) for k in range(n))
        mx[nm] = (round(d_abs, 4), round(d_rel, 4))
    print('  max |dPos| abs / hips-relative (m):', mx)
    kk = [0, n//2, n-1]
    for k in kk:
        print('  frame', k, 'Hips fbx', [round(x, 4) for x in p['pos'][k][fi['mixamorig:Hips']]], 'gltf', [round(x, 4) for x in ga[k][gi['mixamorig:Hips']]])
