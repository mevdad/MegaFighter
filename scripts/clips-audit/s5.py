import sys, os; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import *
def fh(c,s,i): return min(c.p(s+b,i)[1] for b in ('Foot','ToeBase','Toe_End'))
for nm in ['Fast_Run','Walking','Walking_Backwards']:
    c=Clip(nm)
    print('=====',nm,'N',c.N)
    for i in range(c.N):
        print('%2d hips(%+.3f %.3f %+.3f) | L: h %.3f ankleZ %+.3f toeZ %+.3f ankleY %.3f | R: h %.3f ankleZ %+.3f toeZ %+.3f ankleY %.3f'%(i,*c.p('Hips',i),fh(c,'Left',i),c.p('LeftFoot',i)[2],c.p('LeftToeBase',i)[2],c.p('LeftFoot',i)[1],fh(c,'Right',i),c.p('RightFoot',i)[2],c.p('RightToeBase',i)[2],c.p('RightFoot',i)[1]))
