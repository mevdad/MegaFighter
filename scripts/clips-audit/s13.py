import sys, os; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import *
def lean(c,i):
    v=[a-b for a,b in zip(c.p('Neck',i),c.p('Hips',i))]
    return math.degrees(math.atan2(v[2],v[1])), math.degrees(math.acos(v[1]/math.sqrt(sum(x*x for x in v))))
c=Clip('Center_Block'); sp=c.speed_profile()
for f in (18,34,17,19,35):
    print('CB f%d t=%.3f spd %.1f mm/f'%(f,f/30,sp[f]*1000))
    for h in ('LeftHand','RightHand'):
        print('  %s rel Head(fwd,left,up) %s | rel Spine2 %s | rel Hips %s | dist to head-center %.3f'%(h,f3(c.rel(h,'Head',f)),f3(c.rel(h,'Spine2',f)),f3(c.rel(h,'Hips',f)),math.dist(c.p(h,f),[ (a+b)/2 for a,b in zip(c.p('Head',f),c.p('HeadTop_End',f))])))
    print('  Head rel Hips',f3(c.rel('Head','Hips',f)),'HeadTop abs Y %.3f Z(rel hips) %+.3f'%(c.p('HeadTop_End',f)[1],c.p('HeadTop_End',f)[2]-c.p('Hips',f)[2]),'Hips Y %.3f'%c.p('Hips',f)[1],'lean sil/3D %.1f / %.1f'%lean(c,f),'hands abs Y L %.3f R %.3f'%(c.p('LeftHand',f)[1],c.p('RightHand',f)[1]),'elbows Y L %.3f R %.3f'%(c.p('LeftForeArm',f)[1],c.p('RightForeArm',f)[1]))
# hands near head all frames: distance to head center min frames
d=[(min(math.dist(c.p(h,i),[(a+b)/2 for a,b in zip(c.p('Head',i),c.p('HeadTop_End',i))]) for h in ('LeftHand','RightHand')),i) for i in range(c.N)]
print('min hand-to-headcenter by frame (top5 closest):',sorted((round(a,3),i) for a,i in d)[:5])
print('windows <=10mm/f len>=3:',windows(sp,0.010,3),'<=12 len>=4',windows(sp,0.012,4),'<=5',windows(sp,0.005,2))
print('lean range sil: ',min(lean(c,i)[0] for i in range(c.N)),max(lean(c,i)[0] for i in range(c.N)))
# phases
print('speed mm/f smoothed 3: ',[round(sum(sp[max(0,i-1):i+2])/len(sp[max(0,i-1):i+2])*1000,1) for i in range(0,c.N,2)])
# Fast_Run
r=Clip('Fast_Run')
print('Fast_Run lean sil/3D per frame:',[round(lean(r,i)[0],1) for i in range(r.N)],'hips Y',[round(r.p('Hips',i)[1],3) for i in range(r.N)])
sp=r.speed_profile(); print('run spd mm/f',[round(x*1000) for x in sp])
# STC/MCP/idle numbers
idle=Clip('Fighting_Idle'); hy=sum(idle.p('Hips',i)[1] for i in range(idle.N-1))/(idle.N-1)
for nm,i in (('Standing_To_Crouched',19),('Standing_To_Crouched',17),('Male_Crouch_Pose',0)):
    o=Clip(nm); h=o.p('Hips',i)[1]; ht=o.p('HeadTop_End',i)[1]
    print(nm,'f%d'%i,'hips Y %.3f (idle mean %.3f -> %.1f%% , delta %.3f; vs idle max 0.565: %.1f%%) headtop %.3f (idle mean headtop %.3f -> %.1f%%) head %.3f lean %.1f/%.1f'%(h,hy,100*h/hy,h-hy,100*h/0.5646,ht,sum(idle.ys('HeadTop_End')[:-1])/(idle.N-1),100*ht/(sum(idle.ys('HeadTop_End')[:-1])/(idle.N-1)),o.p('Head',i)[1],*lean(o,i)))
mk=Clip('Mma_Kick'); hz=[mk.p('Hips',i)[2] for i in range(mk.N)]; print('Mma_Kick hips Z max %.3f @f%d, hips Y range %.3f..%.3f'%(max(hz),hz.index(max(hz)),min(mk.ys('Hips')),max(mk.ys('Hips'))))
