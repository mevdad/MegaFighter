import sys, os; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import *
def pca_dir(pts):
    n=len(pts); mx=sum(p[0] for p in pts)/n; mz=sum(p[1] for p in pts)/n
    sxx=sum((p[0]-mx)**2 for p in pts); szz=sum((p[1]-mz)**2 for p in pts); sxz=sum((p[0]-mx)*(p[1]-mz) for p in pts)
    th=0.5*math.atan2(2*sxz,sxx-szz)  # угол оси (от +X к +Z)
    return th, (sxx+szz)**.5
for nm in ['Walking','Walking_Backwards','Fast_Run']:
    c=Clip(nm)
    for s in ('Left','Right'):
        pts=[(c.p(s+'Foot',i)[0]-c.p('Hips',i)[0], c.p(s+'Foot',i)[2]-c.p('Hips',i)[2]) for i in range(c.N-1)]
        th,_=pca_dir(pts)
        # азимут оси от +Z к +X: atan2(dx,dz) = 90deg - th
        az=math.degrees(math.atan2(math.cos(th),math.sin(th)))
        ax=(math.cos(th),math.sin(th)); proj=[p[0]*ax[0]+p[1]*ax[1] for p in pts]
        print(nm,s,'ankle(hips-rel) main axis azimuth from +Z toward +X: %.1f deg (mod 180)'%(az%180 if az%180<=90 else az%180-180),'range along axis %.3f m'%(max(proj)-min(proj)),'X range %.3f Z range %.3f'%(max(p[0] for p in pts)-min(p[0] for p in pts),max(p[1] for p in pts)-min(p[1] for p in pts)))
