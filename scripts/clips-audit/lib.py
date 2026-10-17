import json, math, glob, os
import paths
H = 'mixamorig:Hips'
CLIPS = ['Cross_Punch','Cross_Punch_Mirror','Martelo_2','Punching_1','Punching_1_Mirror','Intro','Knocked_Out','Victory','Fast_Run','Surprise_Uppercut','Mma_Kick','Mma_Kick_Mirror','Jab','Jab_Mirror','Getting_Up','Hit_To_Body','Center_Block','Jumping','knockdown','Head_Hit','Standing_To_Crouched','Male_Crouch_Pose','Walking_Backwards','Walking','Fighting_Idle']
BODY_H = 0.978  # bind-рост (меш), м
class Clip:
    def __init__(s, name):
        d = json.load(open(os.path.join(paths.POSE_DIR, '%s.json' % name)))
        s.name = name; s.d = d; s.names = [n.replace('mixamorig:', '') for n in d['names']]
        s.idx = {n: i for i, n in enumerate(s.names)}; s.N = d['nframes']; s.P = d['pos']; s.par = d['parent']
        s.W = d['wrot']; s.rot_step = d['rot_step_max_deg']; s.seam_ang = d['seam_ang_max_deg']
    def p(s, bone, i): return s.P[i][s.idx[bone]]
    def ys(s, bone): return [s.P[i][s.idx[bone]][1] for i in range(s.N)]
    @property
    def dur(s): return (s.N - 1) / 30.0
    def facing(s, i):
        R = s.W[i]['Hips']; f = [R[0][2], 0.0, R[2][2]]; n = math.hypot(f[0], f[2]) or 1.0
        return [f[0]/n, 0.0, f[2]/n]
    def facing_legs(s, i):
        """единичный горизонтальный вектор 'вперёд' по тазовой линии: f = left x up, left = LeftUpLeg - RightUpLeg"""
        l = [a - b for a, b in zip(s.p('LeftUpLeg', i), s.p('RightUpLeg', i))]
        # f = l x up(0,1,0) = (l_y*0 - l_z*1, l_z*0 - l_x*0, l_x*1 - l_y*0) = (-l_z, 0, l_x)
        f = [-l[2], 0.0, l[0]]; n = math.hypot(f[0], f[2]) or 1.0
        return [f[0]/n, 0.0, f[2]/n]
    def yaw(s, i):
        f = s.facing(i); return math.degrees(math.atan2(f[0], f[2]))
    def frame_of(s, i0=0):
        """локальный базис: forward (по yaw кадра i0), left, up"""
        f = s.facing(i0); l = [f[2], 0, -f[0]]  # left = up x f = (f_z? ) проверяется: для f=(0,0,1) left=(1,0,0)
        return f, l, [0, 1, 0]
    def loc(s, v, i0=0):
        return (v[2], v[0], v[1])  # фиксированный базис: (вперёд = +Z мира, влево = +X мира, вверх = +Y)
    def rel(s, bone, ref, i, i0=0):
        a = s.p(bone, i); b = s.p(ref, i) if isinstance(ref, str) else ref
        return s.loc([x - y for x, y in zip(a, b)], i0)
    def speed_profile(s, bones=None):
        bones = bones or ['Head','Spine2','LeftHand','RightHand','LeftFoot','RightFoot','LeftToeBase','RightToeBase','LeftForeArm','RightForeArm','LeftLeg','RightLeg']
        out = [0.0]
        for i in range(1, s.N):
            out.append(max(math.dist(s.p(b, i), s.p(b, i-1)) for b in bones))
        return out  # м/кадр (абсолютные)
    def rel_speed(s):
        """макс. смещение костей между соседними кадрами в Hips-относительных координатах (без движения корня) и в локальном повороте таза"""
        bones = ['Head','LeftHand','RightHand','LeftFoot','RightFoot','LeftToeBase','RightToeBase','LeftForeArm','RightForeArm','LeftLeg','RightLeg','Spine2']
        out = [0.0]
        for i in range(1, s.N):
            m = 0
            for b in bones:
                a = [x - y for x, y in zip(s.p(b, i), s.p('Hips', i))]; c = [x - y for x, y in zip(s.p(b, i-1), s.p('Hips', i-1))]
                m = max(m, math.dist(a, c))
            out.append(m)
        return out
def f3(v, n=3): return '(' + '; '.join(('%.'+str(n)+'f') % x for x in v).replace('.', ',') + ')'

def zyaw(R):  # yaw (град) локальной оси Z кости (вперёд) в мире; 0 = +Z, + к +X
    return math.degrees(math.atan2(R[0][2], R[2][2]))
def _yawb(s, bone, i): return zyaw(s.W[i][bone])
Clip.yawb = _yawb

def windows(sp, thr, minlen):
    """непрерывные диапазоны кадров [a,b], где sp[i] <= thr (i>=1) длиной >= minlen кадров"""
    out=[]; a=None
    for i in range(1,len(sp)+1):
        ok = i<len(sp) and sp[i]<=thr
        if ok and a is None: a=i
        if (not ok) and a is not None:
            if i-a>=minlen: out.append((a,i-1))
            a=None
    return out
def yawrot(p, a):
    c,s=math.cos(a),math.sin(a); return [c*p[0]+s*p[2], p[1], -s*p[0]+c*p[2]]
def posedist(A, ia, B, ib, yaw=0.0, hipsrel=True, bones=None):
    m=0; w=None
    for j,n in enumerate(A.names):
        if bones and n not in bones: continue
        pa=A.P[ia][j]; pb=yawrot(B.P[ib][B.idx[n]], yaw)
        if hipsrel:
            pa=[x-y for x,y in zip(pa,A.p('Hips',ia))]; hb=yawrot(B.p('Hips',ib),yaw); pb=[x-y for x,y in zip(pb,hb)]
        d=math.dist(pa,pb)
        if d>m: m=d; w=n
    return m,w
def bestyaw(A, ia, B, ib):
    best=(9,0)
    for k in range(360):
        a=math.radians(k); d=posedist(A,ia,B,ib,a)[0]
        if d<best[0]: best=(d,k)
    return best
