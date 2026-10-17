import sys,struct,zlib
b=open(sys.argv[1],'rb').read()
ver=struct.unpack('<I',b[23:27])[0]
print('version',ver,'size',len(b))
FM={'Y':'<h','C':'<B','F':'<f','D':'<d','I':'<i','L':'<q'}
def parse(pos,limit):
    nodes=[]
    while pos<limit:
        end,np_,pl,nl=struct.unpack('<QQQB',b[pos:pos+25])
        if end==0: return nodes,pos+25
        name=b[pos+25:pos+25+nl].decode('latin1')
        p=pos+25+nl; props=[]; pend=p+pl
        for _ in range(np_):
            t=chr(b[p]);p+=1
            if t in FM:
                sz=struct.calcsize(FM[t]); props.append((t,struct.unpack(FM[t],b[p:p+sz])[0])); p+=sz
            elif t in 'SR':
                l=struct.unpack('<I',b[p:p+4])[0];p+=4
                props.append((t,b[p:p+l].decode('latin1') if t=='S' else b[p:p+l]));p+=l
            else:
                n,enc,cl=struct.unpack('<III',b[p:p+12]);p+=12
                raw=b[p:p+cl];p+=cl
                if enc: raw=zlib.decompress(raw)
                code={'f':'f','d':'d','l':'q','i':'i','b':'B'}[t]
                props.append((t,list(struct.unpack('<%d%s'%(n,code),raw))))
        children=[]
        if pend<end: children,_=parse(pend,end)
        nodes.append((name,props,children)); pos=end
    return nodes,pos
top,_=parse(27,len(b))
def find(nodes,name):
    for n in nodes:
        if n[0]==name:return n
def walk(nodes):
    for n in nodes:
        yield n; yield from walk(n[2])
gs=find(top,'GlobalSettings')
for n in walk(gs[2]):
    if n[0]=='P' and n[1] and n[1][0][1] in('UnitScaleFactor','OriginalUnitScaleFactor','TimeMode','CustomFrameRate','UpAxis','FrontAxis','CoordAxis','UpAxisSign','FrontAxisSign'):
        print(' GS',n[1][0][1],[p[1] for p in n[1][4:]])
objs=find(top,'Objects')
cnt={}
for n in objs[2]: cnt[n[0]]=cnt.get(n[0],0)+1
print(' objects',cnt)
KT=46186158000
for n in objs[2]:
    if n[0]=='AnimationStack':
        print(' stack',n[1][1][1].split('\x00')[0])
        for c in walk(n[2]):
            if c[0]=='P' and c[1][0][1] in ('LocalStart','LocalStop','ReferenceStart','ReferenceStop'):
                print('   ',c[1][0][1],'sec=',round(c[1][4][1]/KT,4))
models={}
idn={}
for n in objs[2]:
    if n[0]=='Model':
        pid=n[1][0][1]; nm=n[1][1][1].split('\x00')[0]; typ=n[1][2][1]
        props={}
        pn=find(n[2],'Properties70')
        if pn:
            for c in pn[2]:
                if c[1] and c[1][0][1] in('Lcl Translation','Lcl Rotation','Lcl Scaling','PreRotation'):
                    props[c[1][0][1]]=[round(p[1],4) for p in c[1][4:7]]
        models[pid]=(nm,typ,props)
conn=find(top,'Connections')
parent={}
for c in conn[2]:
    if c[1][0][1]=='OO' and c[1][1][1] in models and c[1][2][1] in models: parent[c[1][1][1]]=c[1][2][1]
roots=[models[k] for k in models if k not in parent]
print(' model roots',roots)
for k,v in models.items():
    if 'Hips' in v[0]: print(' hips',v, 'parent',models.get(parent.get(k),('-',))[0])
print(' models',len(models),'types',{t:sum(1 for v in models.values() if v[1]==t) for t in set(v[1] for v in models.values())})
print(' prefix mixamorig:',sum(1 for v in models.values() if v[0].startswith('mixamorig')))
# curve nodes: key counts and Hips translation
names={n[1][0][1]:n[1][1][1].split('\x00')[0] for n in objs[2] if n[0] in('AnimationCurveNode',)}
curves={n[1][0][1]:n for n in objs[2] if n[0]=='AnimationCurve'}
cn_to_model={}; cn_ch={}
for c in conn[2]:
    if c[1][0][1]=='OP' and c[1][1][1] in names and c[1][2][1] in models:
        cn_to_model[c[1][1][1]]=c[1][2][1]; cn_ch[c[1][1][1]]=c[1][3][1]
cv={}
for c in conn[2]:
    if c[1][0][1]=='OP' and c[1][1][1] in curves and c[1][2][1] in names:
        cv.setdefault(c[1][2][1],{})[c[1][3][1]]=curves[c[1][1][1]]
nkeys=set();tmax=0;tmin=1e18
for cid,d in cv.items():
    for ch,cn in d.items():
        kt=find(cn[2],'KeyTime')[1][0][1]; nkeys.add(len(kt)); tmax=max(tmax,kt[-1]); tmin=min(tmin,kt[0])
print(' channel kinds',sorted(set(cn_ch.values())));print(' curve key counts',sorted(nkeys),'time range sec',round(tmin/KT,4),round(tmax/KT,4),'-> fps~',round((max(nkeys)-1)/((tmax-tmin)/KT),2) if max(nkeys)>1 else '?')
for cid,mid in cn_to_model.items():
    if 'Hips' in models[mid][0] and cn_ch[cid]=='Lcl Translation' or (cn_ch[cid]=='Lcl Translation' and 'Hips' in models[mid][0]):
        d=cv.get(cid,{})
        out={}
        for ch,cn in d.items():
            vals=find(cn[2],'KeyValueFloat')[1][0][1]
            out[ch]=(round(vals[0],3),round(vals[-1],3),round(min(vals),3),round(max(vals),3))
        print(' Hips T curves (first,last,min,max) [FBX units, cm if scale .01]',out)
print(' T-curve nodes (non-hips):',sum(1 for cid in cn_to_model if cn_ch[cid]=='Lcl Translation' and 'Hips' not in models[cn_to_model[cid]][0]))
