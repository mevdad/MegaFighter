import sys,json,os; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import *
import paths
S=json.load(open(paths.out('s1.json')))
def c(x,n=3): return ('%.*f'%(n,x)).replace('.',',').replace('-','−')
def v(t,n=3): return '('+'; '.join(c(x,n) for x in t)+')'
role={'Cross_Punch':'стар. punch_heavy','Martelo_2':'стар. kick_high','Punching_1':'стар. punch_body (мастер, меш)'}
A=['| Клип | Длит., с | Ключей (кадров) | fps | Hips start (X; Y; Z), м | Hips end | Hips отклонение от start по осям (макс. по модулю, со знаком) | Hips min..max по Y | Гориз. размах корня, м |','|---|---|---|---|---|---|---|---|---|']
B=['| Клип | Шов: макс. смещение кости (Hips-отн.), м | Шов: макс. угол локальных вращений, ° | Годится в loop (шов) | In Place (гориз. размах корня) | Yaw таза / головы в кадре 0, ° | Скелет vs warrior3 |','|---|---|---|---|---|---|---|']
for nm in CLIPS:
    s=S[nm]; cl=Clip(nm)
    nmx=nm+(' ('+role[nm]+')' if nm in role else '')
    A.append('| %s | %s | %d | 30 | %s | %s | %s | %s..%s | %s |'%(nmx,c(s['dur']),s['N'],v(s['start']),v(s['end']),v(s['dev']),c(s['mn'][1]),c(s['mx'][1]),c(s['hor'])))
    ok=s['seam_rel']<=0.01 and s['seam_ang']<=2.0
    dup=s['seam_rel']<1e-3 and s['seam_ang']<0.2
    if nm=='Male_Crouch_Pose': lp='статичная поза (2 одинаковых кадра), шов 0'
    elif dup: lp='да, кадр N−1 дублирует кадр 0 (при цикле отбросить последний)'
    elif ok: lp='да по допуску (остаточный шов %s мм)'%c(s['seam_rel']*1000,1)
    else: lp='нет (поза в конце ≠ позе в начале)'
    h=s['hor']; ip='да' if h<=0.10 else ('частично' if h<=0.25 else 'нет')
    sk='41/41 имён совпали'+(', это мастер: +узел меша, Hips (0; 0,5606; 0,0305)' if nm=='Punching_1' else ', Hips (0; 0,565; 0), остальные кости ≤5e-5 м')
    B.append('| %s | %s | %s | %s | %s (%s) | %s / %s | %s |'%(nm,c(s['seam_rel'],4),c(s['seam_ang'],2),lp,ip,c(h),c(cl.yawb('Hips',0),0),c(cl.yawb('Head',0),0),sk))
open(paths.out('T1A.md'),'w').write('\n'.join(A)); open(paths.out('T1B.md'),'w').write('\n'.join(B))
print('\n'.join(A[:6])); print('\n'.join(B[:6]))
