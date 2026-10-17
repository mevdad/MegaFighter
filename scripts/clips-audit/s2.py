import sys, os; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import *
c=Clip('Center_Block'); N=c.N
sp=c.speed_profile(); rs=c.rel_speed()
def lean(i):
    v=[a-b for a,b in zip(c.p('Neck',i),c.p('Hips',i))]; return math.degrees(math.atan2(v[2],v[1])), math.degrees(math.acos(v[1]/math.sqrt(sum(x*x for x in v))))
def lean_sp(i):
    v=[a-b for a,b in zip(c.p('Head',i),c.p('Hips',i))]; return math.degrees(math.acos(v[1]/math.sqrt(sum(x*x for x in v))))
print('f  t     spd(mm/f) relspd  | Rhand-head (fwd,left,up) | Lhand-head | Hips Y | head fwd rel hips | lean(Hips->Neck) deg  | rotstep')
for i in range(N):
    rh=c.rel('RightHand','Head',i); lh=c.rel('LeftHand','Head',i)
    print('%2d %.3f %6.1f %6.1f | %s | %s | %.3f | %+.3f | %5.1f %5.1f | %.2f'%(i,i/30,sp[i]*1000,rs[i]*1000,f3(rh),f3(lh),c.p('Hips',i)[1],c.rel('Head','Hips',i)[0],lean(i)[1],lean_sp(i),c.rot_step[i]))
