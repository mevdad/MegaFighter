import json, math, sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import fk, paths
g=json.load(open(paths.GLTF_POSE)); gi={n:i for i,n in enumerate(g['names'])}
def dist(a,b): return math.sqrt(sum((x-y)**2 for x,y in zip(a,b)))
H='mixamorig:Hips'
def run(name, gl, variant):
    d, names, par, T0, Pre, R0, curves, nk, times = fk.load(name)
    n=len(names); preR=[fk.euler(p) for p in Pre]; fi={x:i for i,x in enumerate(names)}
    ga=g['anims'][gl]['frames']; worst=0
    for i in range(nk):
        Rw=[None]*n; Pw=[None]*n
        for b in range(n):
            tt=list(T0[b]); rr=list(R0[b])
            if (b,'Lcl Translation') in curves:
                arrs,df=curves[(b,'Lcl Translation')]; tt=[fk.sample(arrs[k],df['d|'+'XYZ'[k]],i,times) for k in range(3)]
            Ra=fk.euler(rr)
            if (b,'Lcl Rotation') in curves:
                arrs,df=curves[(b,'Lcl Rotation')]; Ra=fk.euler([fk.sample(arrs[k],df['d|'+'XYZ'[k]],i,times) for k in range(3)])
            R0m=fk.euler(R0[b])
            if variant=='delta_pre':   # Rest_master * (R0^-1 * Ranim)  (локально, справа)
                Rl=fk.mm(preR[b], fk.mm(fk.tr(R0m), Ra))
            elif variant=='delta_post':
                Rl=fk.mm(preR[b], fk.mm(Ra, fk.tr(R0m)))
            else: Rl=fk.mm(preR[b], Ra)
            if par[b]<0: Rw[b]=Rl; Pw[b]=tt
            else:
                Rw[b]=fk.mm(Rw[par[b]],Rl); o=fk.mv(Rw[par[b]],tt); Pw[b]=[Pw[par[b]][k]+o[k] for k in range(3)]
        for nm in names:
            a=[x-y for x,y in zip(Pw[fi[nm]],Pw[fi[H]])]; bb=[x-y for x,y in zip(ga[i][gi[nm]],ga[i][gi[H]])]
            worst=max(worst,dist(a,bb))
    return worst
for v in ['plain','delta_pre','delta_post']:
    print(v, 'Martelo_2', round(run('Martelo_2','kick_high',v),4), 'Cross_Punch', round(run('Cross_Punch','punch_heavy',v),4))
