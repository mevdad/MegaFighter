import sys, os; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import *
stc=Clip('Standing_To_Crouched'); mcp=Clip('Male_Crouch_Pose'); idle=Clip('Fighting_Idle')
def pd(a,ia,b,ib,rel=True):
    m=0;w=None
    for j,n in enumerate(a.names):
        pa=a.P[ia][j]; pb=b.P[ib][j]
        if rel: pa=[x-y for x,y in zip(pa,a.p('Hips',ia))]; pb=[x-y for x,y in zip(pb,b.p('Hips',ib))]
        d=math.dist(pa,pb)
        if d>m:m=d;w=n
    return round(m,4),w
print('MCP f0 vs f1 abs',pd(mcp,0,mcp,1,False))
sp=stc.speed_profile(); rs=stc.rel_speed()
for i in range(stc.N):
    print(i,'%.3f'%(i/30),'hipsY %.3f hipsZ %+.3f headY %.3f headZ %+.3f'%(stc.p('Hips',i)[1],stc.p('Hips',i)[2],stc.p('Head',i)[1],stc.p('Head',i)[2]),'spd %.1f rel %.1f mm/f'%(sp[i]*1000,rs[i]*1000),'| vs MCP rel %s abs %s'%(pd(stc,i,mcp,0)[0],pd(stc,i,mcp,0,False)[0]), 'footlow %.3f'%min(stc.p(b,i)[1] for b in ('LeftFoot','RightFoot','LeftToeBase','RightToeBase','LeftToe_End','RightToe_End')))
hy=[idle.p('Hips',i)[1] for i in range(idle.N)]
print('idle hips Y mean %.4f min %.4f max %.4f'%(sum(hy[:-1])/(len(hy)-1),min(hy),max(hy)),'head Y mean %.4f'%(sum(idle.ys('Head')[:-1])/(idle.N-1)),'headtop mean %.4f'%(sum(idle.ys('HeadTop_End')[:-1])/(idle.N-1)))
print('MCP hips',mcp.p('Hips',0),'head',mcp.p('Head',0),'headtop',mcp.p('HeadTop_End',0),'lhand',mcp.p('LeftHand',0),'rhand',mcp.p('RightHand',0),'lfoot',mcp.p('LeftFoot',0),'rfoot',mcp.p('RightFoot',0), 'knee',mcp.p('LeftLeg',0),mcp.p('RightLeg',0))
print('STC last hips',stc.p('Hips',19),'head',stc.p('Head',19))
print('knee Y MCP L/R',mcp.p('LeftLeg',0)[1],mcp.p('RightLeg',0)[1],'| idle f0',idle.p('LeftLeg',0)[1])
print('MCP hand rel head L',mcp.rel('LeftHand','Head',0),'R',mcp.rel('RightHand','Head',0))
v=[a-b for a,b in zip(mcp.p('Neck',0),mcp.p('Hips',0))]; print('MCP torso lean silhouette',math.degrees(math.atan2(v[2],v[1])),'3D',math.degrees(math.acos(v[1]/math.sqrt(sum(x*x for x in v)))))
