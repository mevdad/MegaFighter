import sys, os; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import *
def fh(c,s,i): return min(c.p(s+b,i)[1] for b in ('Foot','ToeBase','Toe_End'))
c=Clip('Jumping'); sp=c.speed_profile()
for i in range(c.N):
    print('%2d %.3f hips(%+.3f %.3f %+.3f) Lh %.3f Rh %.3f headY %.3f spd %.1f lean %.1f'%(i,i/30,*c.p('Hips',i),fh(c,'Left',i),fh(c,'Right',i),c.p('Head',i)[1],sp[i]*1000, math.degrees(math.atan2(*[ (c.p('Neck',i)[2]-c.p('Hips',i)[2]), (c.p('Neck',i)[1]-c.p('Hips',i)[1])]))))
