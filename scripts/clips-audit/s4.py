import sys, os; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import *
def maxy(c,i): return max(p[1] for p in c.P[i])
for nm in ['knockdown','Knocked_Out','Getting_Up']:
    c=Clip(nm); sp=c.speed_profile(); rs=c.rel_speed()
    print('=====',nm,'N',c.N,'dur',c.dur)
    step=3 if c.N<100 else 4
    for i in list(range(0,c.N,step))+[c.N-1]:
        h=c.p('Hips',i); hd=c.p('Head',i); R=c.W[i]['Spine2']; Rh=c.W[i]['Head']
        print('%3d %.2f'%(i,i/30),'hips (%+.3f %+.3f %+.3f)'%tuple(h),'head (%+.3f %+.3f %+.3f)'%tuple(hd),'maxY %.3f'%maxy(c,i),'spd %.1f rel %.1f'%(sp[i]*1000,rs[i]*1000),'chestFrontY %+.2f headFaceY %+.2f'%(R[1][2],Rh[1][2]),'footlow %.3f'%min(c.p(b,i)[1] for b in ('LeftFoot','RightFoot','LeftToeBase','RightToeBase')))
