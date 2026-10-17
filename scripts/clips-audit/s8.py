import sys, os; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import *
c=Clip('Fighting_Idle'); n=c.N-1
def mean(f): return sum(f(i) for i in range(n))/n
for b in ['LeftFoot','RightFoot','LeftToeBase','RightToeBase','LeftHand','RightHand','LeftLeg','RightLeg','LeftShoulder','RightShoulder','LeftArm','RightArm']:
    z=[c.p(b,i)[2]-c.p('Hips',i)[2] for i in range(n)]; x=[c.p(b,i)[0]-c.p('Hips',i)[0] for i in range(n)]; y=[c.p(b,i)[1] for i in range(n)]
    print('%-14s fwd(Z) rel hips mean %+.3f [%+.3f..%+.3f]  lat(X) mean %+.3f  Y mean %.3f [%.3f..%.3f]'%(b,sum(z)/n,min(z),max(z),sum(x)/n,sum(y)/n,min(y),max(y)))
print('mean abs Z foot L %.3f R %.3f ; hand L %.3f R %.3f'%(mean(lambda i:c.p('LeftFoot',i)[2]),mean(lambda i:c.p('RightFoot',i)[2]),mean(lambda i:c.p('LeftHand',i)[2]),mean(lambda i:c.p('RightHand',i)[2])))
print('Hips Y range %.3f..%.3f (amp %.3f) Z %.3f..%.3f X %.3f..%.3f'%tuple(f(c.p('Hips',i)[k] for i in range(c.N)) for k,f in [(1,min),(1,max)]) if False else '')
hy=[c.p('Hips',i)[1] for i in range(c.N)]; print('Hips Y min %.3f max %.3f amp %.3f ; head Y min %.3f max %.3f'%(min(hy),max(hy),max(hy)-min(hy),min(c.ys('Head')),max(c.ys('Head'))))
hz=[c.p('Hips',i)[2] for i in range(c.N)]; hx=[c.p('Hips',i)[0] for i in range(c.N)]; print('Hips Z amp %.3f X amp %.3f'%(max(hz)-min(hz),max(hx)-min(hx)))
# циклы: ближайшие кадры к кадру 0 (не соседи)
d=[(round(posedist(c,0,c,i,0,False)[0],4),i) for i in range(8,n-7)]
print('closest to f0 (excluding +-8): ',sorted(d)[:4])
d=[(round(posedist(c,0,c,i,0,False)[0],4),i) for i in range(1,n)]
print('dist to f0 at f%s'%[ (i,round(posedist(c,0,c,i,0,False)[0],3)) for i in (10,25,34,51,68,85,95,101)])
sp=c.speed_profile(); print('speed mm/f mean %.1f max %.1f'%(sum(sp)/len(sp)*1000,max(sp)*1000))
# стойка: ступни по оси Z мир и ориентация носков
for s in ('Left','Right'):
    v=[c.p(s+'Toe_End',0)[k]-c.p(s+'Foot',0)[k] for k in range(3)]; print(s,'foot dir yaw %.1f deg'%math.degrees(math.atan2(v[0],v[2])),'toeEnd',c.p(s+'Toe_End',0),'ankle',c.p(s+'Foot',0))
print('pelvis yaw f0 %.1f chest %.1f head %.1f'%(c.yawb('Hips',0),c.yawb('Spine2',0),c.yawb('Head',0)))
# базовая стойка для всех клипов: расстояние кадра 0 до Fighting_Idle f0 (hips-rel, мировые оси)
print('start pose vs Fighting_Idle mean? (f0): ')
for nm in CLIPS:
    o=Clip(nm); print(' ',nm.ljust(22),'max bone dist hips-rel %.3f'%posedist(o,0,c,0)[0],'hips Y f0 %.3f'%o.p('Hips',0)[1])
