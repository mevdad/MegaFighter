import sys, json, os; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import *
ENDS={'LeftHand':'LeftHandIndex4','RightHand':'RightHandIndex4','LeftFoot':'LeftToe_End','RightFoot':'RightToe_End'}
def analyze(nm, verbose=True):
    c=Clip(nm); N=c.N
    out={}
    for e in ['LeftHand','RightHand','LeftFoot','RightFoot']:
        # вынос вперёд (Z) от Hips, горизонтальная дальность, скорость конца (абс), для кисти-запястья/стопы-лодыжки
        fz=[c.p(e,i)[2]-c.p('Hips',i)[2] for i in range(N)]
        hz=[math.hypot(c.p(e,i)[0]-c.p('Hips',i)[0],c.p(e,i)[2]-c.p('Hips',i)[2]) for i in range(N)]
        tip=ENDS[e]; tz=[c.p(tip,i)[2]-c.p('Hips',i)[2] for i in range(N)]
        spd=[0]+[math.dist(c.p(e,i),c.p(e,i-1))*30 for i in range(1,N)]
        ip=max(range(N),key=lambda i:fz[i]); ps=max(range(N),key=lambda i:spd[i])
        out[e]=dict(fz=fz,hz=hz,tz=tz,spd=spd,peak=ip,fzmax=fz[ip],fz0=fz[0],tipz=tz[ip],hzmax=max(hz),pspd=spd[ps],pspdf=ps,absz=c.p(e,ip)[2],absy=c.p(e,ip)[1],gain=fz[ip]-fz[0])
    return c,out
if __name__=='__main__':
    names=sys.argv[1:] or ['Jab','Jab_Mirror','Cross_Punch','Cross_Punch_Mirror','Punching_1','Punching_1_Mirror','Martelo_2','Mma_Kick','Mma_Kick_Mirror','Surprise_Uppercut']
    for nm in names:
        c,o=analyze(nm); print('==',nm,'N',c.N)
        for e,d in o.items():
            print('  %-9s fwdZ(hips-rel) f0 %+.3f max %+.3f @f%d (gain %+.3f) tipZ@peak %+.3f | horiz max %.3f | peak speed %.2f m/s @f%d | abs Y@peak %.3f'%(e,d['fz0'],d['fzmax'],d['peak'],d['gain'],d['tipz'],d['hzmax'],d['pspd'],d['pspdf'],d['absy']))
