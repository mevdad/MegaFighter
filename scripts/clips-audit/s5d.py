import sys, os; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import *
G=0.013; TH=0.02
def fh(c,s,i): return min(c.p(s+b,i)[1] for b in ('Foot','ToeBase','Toe_End'))
def runs(flags):
    n=len(flags); 
    if all(flags): return [(0,n-1,n)]
    if not any(flags): return []
    st=next(i for i in range(n) if not flags[i])   # начать с неконтакта
    out=[];a=None
    for k in range(1,n+1):
        i=(st+k)%n
        if flags[i] and a is None: a=k
        if (not flags[i]) and a is not None:
            out.append(((st+a)%n,(st+k-1)%n,k-a)); a=None
    return out
for nm in ['Fast_Run','Walking','Walking_Backwards']:
    c=Clip(nm); n=c.N-1  # период
    print('====',nm,'period frames',n,'= %.3f s'%(n/30))
    for s in ('Left','Right'):
        fl=[fh(c,s,i)<=G+TH for i in range(n)]
        for (a,b,L) in runs(fl):
            # слайд лодыжки по Z (мир) по кадрам контакта, линейная регрессия
            idx=[(a+k)%n for k in range(L)]; 
            zs=[c.p(s+'Foot',(a+k)%n)[2] for k in range(L)]
            # unwrap not needed
            xs=list(range(L)); mx=sum(xs)/L; mz=sum(zs)/L
            sl=sum((x-mx)*(z-mz) for x,z in zip(xs,zs))/max(1e-9,sum((x-mx)**2 for x in xs)) if L>1 else 0
            tz=[c.p(s+'ToeBase',(a+k)%n)[2] for k in range(L)]; mt=sum(tz)/L
            slt=sum((x-mx)*(z-mt) for x,z in zip(xs,tz))/max(1e-9,sum((x-mx)**2 for x in xs)) if L>1 else 0
            print(' ',s,'contact touchdown f%d .. last-contact f%d (%d frames = %.3f s) ankle Z slope %.4f m/frame = %.3f m/s ; toe Z slope %.3f m/s'%(a,b,L,L/30,sl,sl*30,slt*30))
    # boot hips drift

print('--- flat-foot (ankleY<=0.09) stance slope, cyclic')
for nm in ['Fast_Run','Walking','Walking_Backwards']:
    c=Clip(nm); n=c.N-1
    for s_ in ('Left','Right'):
        fl=[c.p(s_+'Foot',i)[1]<=0.09 and fh(c,s_,i)<=0.02 for i in range(n)]
        for r in runs(fl):
            a,b,L=r
            if L<3: continue
            zs=[c.p(s_+'Foot',(a+k)%n)[2] for k in range(L)]; xs=list(range(L)); mx=sum(xs)/L; mz=sum(zs)/L
            sl=sum((x-mx)*(z-mz) for x,z in zip(xs,zs))/sum((x-mx)**2 for x in xs)
            print(nm,s_,'flat run f%d..f%d (%d fr) ankleZ slope %.3f m/s'%(a,b,L,sl*30))
