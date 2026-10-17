import json, math, sys, os
sys.argv=['x']
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import fk, paths
def static_pose(name, use_R=True):
    d, names, par, T0, Pre, R0, curves, nk, times = fk.load(name)
    n=len(names); preR=[fk.euler(p) for p in Pre]; Rw=[None]*n; Pw=[None]*n
    for b in range(n):
        Rl=fk.mm(preR[b], fk.euler(R0[b]) if use_R else fk.I3)
        if par[b]<0: Rw[b]=Rl; Pw[b]=list(T0[b])
        else:
            Rw[b]=fk.mm(Rw[par[b]],Rl); o=fk.mv(Rw[par[b]],T0[b]); Pw[b]=[Pw[par[b]][k]+o[k] for k in range(3)]
    return names, Pw, R0
g=json.load(open(paths.GLTF_POSE)); gi={n:i for i,n in enumerate(g['names'])}
def dist(a,b): return math.sqrt(sum((x-y)**2 for x,y in zip(a,b)))
H='mixamorig:Hips'
for nm in ['Punching_1','Martelo_2','Cross_Punch','Jab']:
    names,P,R0=static_pose(nm)
    fi={n:i for i,n in enumerate(names)}
    # относительно Hips
    diffs=sorted([(dist([a-b for a,b in zip(P[fi[n]],P[fi[H]])],[a-b for a,b in zip(g['bind'][gi[n]],g['bind'][gi[H]])]),n.replace('mixamorig:','')) for n in names],reverse=True)
    print(nm,'static(Lcl as stored) vs glb bind, hips-relative: top',[(round(a,3),b) for a,b in diffs[:5]],'; nonzero static Lcl Rot bones:',sum(1 for r in R0 if any(abs(x)>1e-6 for x in r)))
    names,P,R0=static_pose(nm,False)
    diffs=sorted([(dist([a-b for a,b in zip(P[fi[n]],P[fi[H]])],[a-b for a,b in zip(g['bind'][gi[n]],g['bind'][gi[H]])]),n.replace('mixamorig:','')) for n in names],reverse=True)
    print('   rest (Lcl rot=0, PreRotation only) vs glb bind: top',[(round(a,3),b) for a,b in diffs[:5]])
