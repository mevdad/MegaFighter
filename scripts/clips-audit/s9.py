import sys, os; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import *
c=Clip('Surprise_Uppercut'); sp=c.speed_profile()
for i in list(range(0,c.N,2))+[c.N-1]:
    print('%3d %.2f hips(%+.3f %.3f %+.3f) headY %.3f | Lh(Z%+.3f Y%.3f) Rh(Z%+.3f Y%.3f) | Lf Y%.3f Rf Y%.3f | spd %.1f yawP %.0f'%(i,i/30,*c.p('Hips',i),c.p('Head',i)[1],c.p('LeftHand',i)[2],c.p('LeftHand',i)[1],c.p('RightHand',i)[2],c.p('RightHand',i)[1],c.p('LeftFoot',i)[1],c.p('RightFoot',i)[1],sp[i]*1000,c.yawb('Hips',i)))
print(windows(sp,0.005,4),windows(sp,0.010,6))
