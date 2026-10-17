import sys, os; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import *
def swap(n):
    if n.startswith('Left'): return 'Right'+n[4:]
    if n.startswith('Right'): return 'Left'+n[5:]
    return n
for a,b in [('Jab','Jab_Mirror'),('Mma_Kick','Mma_Kick_Mirror'),('Cross_Punch','Cross_Punch_Mirror'),('Punching_1','Punching_1_Mirror')]:
    A=Clip(a); B=Clip(b); assert A.N==B.N
    res={}
    for mode in ('abs','rel'):
        errs=[];ident=[];bw={}
        for i in range(A.N):
            for n in A.names:
                pa=A.p(n,i); pb=B.p(swap(n),i)
                if mode=='rel':
                    pa=[x-y for x,y in zip(pa,A.p('Hips',i))]; pb=[x-y for x,y in zip(pb,B.p('Hips',i))]
                mb=[-pb[0],pb[1],pb[2]]
                e=math.dist(pa,mb); errs.append(e); bw[n]=max(bw.get(n,0),e)
                ident.append(math.dist(pa,B.p(n,i) if mode=='abs' else [x-y for x,y in zip(B.p(n,i),B.p('Hips',i))]))
        res[mode]=(max(errs),sum(errs)/len(errs),max(ident),max(bw,key=bw.get),max(bw.values()))
    # локальные вращения: углы Эйлера из дампа? сравним кватернионные углы мира для Hips/Head/Spine2 через yaw/ наклон
    yaw_sum=max(abs(A.yawb('Hips',i)+B.yawb('Hips',i)) for i in range(A.N))
    print('%s vs %s: frames %d/%d  mirror(X->-X, L<->R) error abs: max %.4f mean %.5f | hips-rel: max %.4f mean %.5f (worst bone %s %.4f) | no-mirror baseline max %.3f | max|yawA+yawB| %.2f deg'%(a,b,A.N,B.N,res['abs'][0],res['abs'][1],res['rel'][0],res['rel'][1],res['rel'][3],res['rel'][4],res['abs'][2],yaw_sum))
