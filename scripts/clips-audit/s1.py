import sys, os; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import *
import paths
import json
res={}
def fm(v): return '(' + '; '.join('%+.3f'%x for x in v).replace('.',',') + ')'
for nm in CLIPS:
    c=Clip(nm); N=c.N
    hp=[c.p('Hips',i) for i in range(N)]
    st,en=hp[0],hp[-1]
    mn=[min(h[k] for h in hp) for k in range(3)]; mx=[max(h[k] for h in hp) for k in range(3)]
    dev=[max((h[k]-st[k] for h in hp),key=abs) for k in range(3)]  # макс отклонение от старта по оси (со знаком)
    hor=max(math.hypot(h[0]-st[0],h[2]-st[2]) for h in hp)
    # шов
    rel0=[[a-b for a,b in zip(c.P[0][j],c.P[0][c.idx['Hips']])] for j in range(41)]
    rel1=[[a-b for a,b in zip(c.P[-1][j],c.P[-1][c.idx['Hips']])] for j in range(41)]
    seam_rel=max(math.dist(a,b) for a,b in zip(rel0,rel1))
    seam_abs=max(math.dist(c.P[0][j],c.P[-1][j]) for j in range(41))
    # ближайший к первому кадру кадр (не считая соседей) -> цикл
    res[nm]=dict(N=N,dur=c.dur,stop=c.d['stop_s'],start=st,end=en,mn=mn,mx=mx,dev=dev,hor=hor,seam_rel=seam_rel,seam_abs=seam_abs,seam_ang=c.seam_ang,hipsdelta=[en[k]-st[k] for k in range(3)])
    print(nm.ljust(20),'N',N,'dur %.3f'%c.dur,'stop %.3f'%c.d['stop_s'],'| start',fm(st),'end',fm(en),'| min',fm(mn),'max',fm(mx),'| dev',fm(dev),'| hor %.3f'%hor,'| seam rel %.4f abs %.4f ang %.2f'%(seam_rel,seam_abs,c.seam_ang))
json.dump(res,open(paths.out('s1.json'),'w'))
