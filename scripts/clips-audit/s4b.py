import sys, os; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import *
kd=Clip('knockdown'); ko=Clip('Knocked_Out'); gu=Clip('Getting_Up')
for c in (kd,ko):
    # лёжа: Hips Y<=0.12 и Head Y<=0.25 и ступни? ; затем все кости <= порога
    for hy,hdy in ((0.12,0.25),):
        fr=[i for i in range(c.N) if c.p('Hips',i)[1]<=hy and c.p('Head',i)[1]<=hdy]
        print(c.name,'first frame Hips<=%.2f & Head<=%.2f:'%(hy,hdy),fr[:1],'t=%.3f'%(fr[0]/30))
    fr=[i for i in range(c.N) if max(p[1] for p in c.P[i])<=0.40]; print('  all bones Y<=0.40 first',fr[:1])
    sp=c.speed_profile()
    for thr in (0.005,0.003,0.001):
        print('  windows <=%.0f mm/f minlen4'%(thr*1000),windows(sp,thr,4))
    i=c.N-1
    hd=c.p('Head',i); hp=c.p('Hips',i); ft=[c.p(b,i) for b in ('LeftFoot','RightFoot')]
    fm=[(ft[0][k]+ft[1][k])/2 for k in range(3)]
    print('  end: head-hips horiz (dx,dz)',(round(hd[0]-hp[0],3),round(hd[2]-hp[2],3)),'feet-hips',(round(fm[0]-hp[0],3),round(fm[2]-hp[2],3)),'body axis head->feet azimuth deg(from +Z toward +X)',round(math.degrees(math.atan2(fm[0]-hd[0],fm[2]-hd[2])),1),'length head-feet %.3f'%math.dist([hd[0],hd[2]],[fm[0],fm[2]]))
    print('  end yaw pelvis',round(c.yawb('Hips',i),1),'chest',round(c.yawb('Spine2',i),1),'chestFrontY',c.W[i]['Spine2'][1][2],'headFaceY',c.W[i]['Head'][1][2],'max bone Y',max(p[1] for p in c.P[i]))
    print('  hips travel per axis start->end',[round(c.p('Hips',i)[k]-c.p('Hips',0)[k],3) for k in range(3)],'max speed hips mm/f',max(math.dist(c.p('Hips',j),c.p('Hips',j-1)) for j in range(1,c.N))*1000)
    # момент удара/старт падения: первый кадр где speed>10 mm/f
    print('  first frame speed>10mm/f:',next(i for i in range(1,c.N) if sp[i]>0.010),'; >20:',next(i for i in range(1,c.N) if sp[i]>0.020))
for nm,c in (('knockdown',kd),('Knocked_Out',ko)):
    d0=posedist(gu,0,c,c.N-1)
    d,y=bestyaw(gu,0,c,c.N-1)
    print('GettingUp f0 vs %s last: hips-rel max dist (no yaw)'%nm,round(d0[0],3),d0[1],'| best yaw %d deg -> %.3f'%(y,d))
    # также сравнить Getting_Up с каждым кадром в нужном диапазоне? 
    # расстояние до getup f0 по хвосту
    print('   dist to GU f0 over last frames (best yaw fixed):',[round(posedist(gu,0,c,i,math.radians(y))[0],3) for i in range(c.N-8,c.N,2)])
print('GU end vs Fighting_Idle f0 hips-rel',round(posedist(gu,gu.N-1,Clip('Fighting_Idle'),0)[0],3),'; vs Center_Block f0',round(posedist(gu,gu.N-1,Clip('Center_Block'),0)[0],3))
print('GU end yaw',gu.yawb('Hips',gu.N-1),'GU start yaw',gu.yawb('Hips',0))
sp=gu.speed_profile(); print('GU windows <=5mm/f',windows(sp,0.005,4),'<=3',windows(sp,0.003,4), 'first f>10mm',next(i for i in range(1,gu.N) if sp[i]>0.010))
print('GU first frames speed',[round(x*1000,1) for x in sp[:12]])
