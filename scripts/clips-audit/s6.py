import sys, os; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import *
for nm in ['Victory','Intro']:
    c=Clip(nm); sp=c.speed_profile(); rs=c.rel_speed()
    print('=====',nm,c.N,'frames; windows<=5mm/f(abs spd) len>=4:',windows(sp,0.005,4),'<=3:',windows(sp,0.003,4),'<=10 len>=8',windows(sp,0.010,8))
    for i in list(range(0,c.N,5))+[c.N-1]:
        print('%3d %.2f hips(%+.3f %.3f %+.3f) head(%.3f %+.3f) LhandY %.3f RhandY %.3f maxY %.3f spd %.1f yawP %.0f yawH %.0f'%(i,i/30,*c.p('Hips',i),c.p('Head',i)[1],c.p('Head',i)[2],c.p('LeftHand',i)[1],c.p('RightHand',i)[1],max(p[1] for p in c.P[i]),sp[i]*1000,c.yawb('Hips',i),c.yawb('Head',i)))
