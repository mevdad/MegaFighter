import sys, os; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import *
for nm in ['Hit_To_Body','Head_Hit']:
    c=Clip(nm); sp=c.speed_profile()
    print('=====',nm,c.N,'dur',c.dur,'windows<=5',windows(sp,0.005,3))
    h0=c.p('Hips',0); hd0=c.p('Head',0); n0=c.p('Neck',0)
    best=0
    for i in range(c.N):
        v=[a-b for a,b in zip(c.p('Neck',i),c.p('Hips',i))]
        lean=math.degrees(math.atan2(v[2],v[1]))
        dh=[c.p('Hips',i)[k]-h0[k] for k in range(3)]
        dhead=[c.p('Head',i)[k]-hd0[k] for k in range(3)]
        print('%2d %.2f dHips(%+.3f %+.3f %+.3f) dHead(%+.3f %+.3f %+.3f) lean(sil,+fwd) %+.1f spd %.1f dist-to-f0 %.3f'%(i,i/30,*dh,*dhead,lean,sp[i]*1000,posedist(c,0,c,i,0,False)[0]))
