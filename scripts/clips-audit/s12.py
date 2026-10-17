import sys, os; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import *
def win(nm, limb, tip, thr=0.85, rng=None, mode='z'):
    c=Clip(nm); N=c.N
    if mode=='z': ext=[c.p(limb,i)[2]-c.p('Hips',i)[2] for i in range(N)]
    else: ext=[c.p(limb,i)[1] for i in range(N)]
    lo,hi=rng or (0,N-1)
    base=ext[lo]; fp=max(range(lo,hi+1),key=lambda i:ext[i]); R=ext[fp]-base
    act=[i for i in range(lo,hi+1) if ext[i]>=base+thr*R]
    # непрерывный кусок вокруг пика
    a0=fp; a1=fp
    while a0-1>=lo and ext[a0-1]>=base+thr*R: a0-=1
    while a1+1<=hi and ext[a1+1]>=base+thr*R: a1+=1
    m0=next(i for i in range(lo,fp+1) if abs(ext[i]-base)>0.05*R)
    endv=ext[hi]
    m1=max(i for i in range(fp,hi+1) if abs(ext[i]-endv)>0.10*R) + 1 if any(abs(ext[i]-endv)>0.10*R for i in range(fp,hi+1)) else fp
    m1=min(m1,hi)
    tipz=[c.p(tip,i)[2]-c.p('Hips',i)[2] for i in range(N)] if mode=='z' else None
    return dict(clip=nm,limb=limb,peak=fp,reach_wrist=ext[fp],reach_tip=(tipz[fp] if tipz else None),base=base,R=R,m0=m0,a0=a0,a1=a1,m1=m1,N=N,dur=c.dur,absY=c.p(limb,fp)[1])
rows=[win('Jab','LeftHand','LeftHandIndex4'),win('Cross_Punch','RightHand','RightHandIndex4'),win('Punching_1','RightHand','RightHandIndex4'),win('Mma_Kick','RightFoot','RightToe_End'),win('Martelo_2','LeftFoot','LeftToe_End')]
for r in rows:
    su=r['a0']-r['m0']; ac=r['a1']-r['a0']+1; rc=r['m1']-r['a1']
    print('%-12s %-9s peak f%d reach wrist %+.3f tip %+.3f (%.0f%% of 0.978) absY %.3f | motion start f%d, active f%d-f%d, settle f%d (of %d) | startup %d fr=%d ticks, active %d fr=%d ticks, recovery %d fr=%d ticks, pre-lead %d fr'%(r['clip'],r['limb'],r['peak'],r['reach_wrist'],r['reach_tip'],100*r['reach_tip']/0.978,r['absY'],r['m0'],r['a0'],r['a1'],r['m1'],r['N']-1,su,su*2,ac,ac*2,rc,rc*2,r['m0']))
r=win('Surprise_Uppercut','RightHand',None,0.85,(26,50),'y'); print('Uppercut(right hand Y rise)',r)
r=win('Surprise_Uppercut','LeftHand','LeftHandIndex4',0.85,(0,20),'z'); print('Uppercut clip first hit (left hand fwd)',r)
