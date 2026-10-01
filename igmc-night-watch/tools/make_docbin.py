"""consultant.obj -> compact indexed binary for the game (DOC1), embedded as V11_DOC_BIN.
    python3 make_docbin.py consultant.obj DOCBIN.txt
positions: model scaled to 1.85 m, feet at y=0, facing +Z (Uint16 quantised in bbox)
normals Int8x3(+pad), uv Uint16x2, cavity Uint8, indices Uint16."""
import struct, base64, math, sys
src=sys.argv[1]; out=sys.argv[2]
V=[];VT=[];VN=[];F=[]
for l in open(src):
    if l.startswith('v '): a=l.split(); V.append([float(a[1]),float(a[2]),float(a[3])])
    elif l.startswith('vt '): a=l.split(); VT.append([float(a[1]),float(a[2])])
    elif l.startswith('vn '): a=l.split(); VN.append([float(a[1]),float(a[2]),float(a[3])])
    elif l.startswith('f '):
        idx=[]
        for t in l.split()[1:]:
            p=t.split('/'); vi=int(p[0])-1; ti=int(p[1])-1 if len(p)>1 and p[1] else -1; ni=int(p[2])-1 if len(p)>2 and p[2] else -1
            idx.append((vi,ti,ni))
        for k in range(1,len(idx)-1): F.append((idx[0],idx[k],idx[k+1]))
y0=min(v[1] for v in V); y1=max(v[1] for v in V); s=1.85/(y1-y0)
cx=(min(v[0] for v in V)+max(v[0] for v in V))/2; cz=(min(v[2] for v in V)+max(v[2] for v in V))/2
P=[[(v[0]-cx)*s,(v[1]-y0)*s,(v[2]-cz)*s] for v in V]
# cavity per position: how far the 1-ring centroid sits in front of / behind the surface along the normal
nb=[set() for _ in V]
for f in F:
    a,b,c=f[0][0],f[1][0],f[2][0]
    nb[a]|={b,c}; nb[b]|={a,c}; nb[c]|={a,b}
# area-weighted face normals per position
vn=[[0.0,0.0,0.0] for _ in V]
for f in F:
    a,b,c=(P[f[0][0]],P[f[1][0]],P[f[2][0]])
    ux,uy,uz=b[0]-a[0],b[1]-a[1],b[2]-a[2]; wx,wy,wz=c[0]-a[0],c[1]-a[1],c[2]-a[2]
    n=(uy*wz-uz*wy,uz*wx-ux*wz,ux*wy-uy*wx)
    for k in (f[0][0],f[1][0],f[2][0]):
        vn[k][0]+=n[0]; vn[k][1]+=n[1]; vn[k][2]+=n[2]
for n in vn:
    l=math.sqrt(n[0]**2+n[1]**2+n[2]**2) or 1; n[0]/=l; n[1]/=l; n[2]/=l
cav=[0.0]*len(V)
for i,ring in enumerate(nb):
    if not ring: continue
    mx=sum(P[j][0] for j in ring)/len(ring); my=sum(P[j][1] for j in ring)/len(ring); mz=sum(P[j][2] for j in ring)/len(ring)
    d=(mx-P[i][0])*vn[i][0]+(my-P[i][1])*vn[i][1]+(mz-P[i][2])*vn[i][2]
    el=sum(math.dist(P[i],P[j]) for j in ring)/len(ring) or 1e-4
    cav[i]=d/el          # >0: concave (a crease, a socket), <0: convex
# two smoothing passes so a crease reads as a soft shadow, not single vertices
for _ in range(2):
    cav=[(cav[i]*.5+.5*sum(cav[j] for j in nb[i])/len(nb[i])) if nb[i] else cav[i] for i in range(len(V))]
# the export's own normals are split almost everywhere (it reads faceted): rebuild them smooth,
# averaging only faces within 60 degrees of each other so real hard edges (lapels, cuffs, soles) stay
fa=[]; fu=[]
for f in F:
    a_,b_,c_=(P[f[0][0]],P[f[1][0]],P[f[2][0]])
    ux,uy,uz=b_[0]-a_[0],b_[1]-a_[1],b_[2]-a_[2]; wx,wy,wz=c_[0]-a_[0],c_[1]-a_[1],c_[2]-a_[2]
    n=(uy*wz-uz*wy,uz*wx-ux*wz,ux*wy-uy*wx); l=math.sqrt(n[0]**2+n[1]**2+n[2]**2) or 1e-12
    fa.append(n); fu.append((n[0]/l,n[1]/l,n[2]/l))
around=[[] for _ in V]
for fi,f in enumerate(F):
    for c in f: around[c[0]].append(fi)
COS=math.cos(math.radians(60))
def corner_normal(fi,pi):
    u=fu[fi]; sx=sy=sz=0.0
    for gj in around[pi]:
        g=fu[gj]
        if g[0]*u[0]+g[1]*u[1]+g[2]*u[2]>=COS:
            sx+=fa[gj][0]; sy+=fa[gj][1]; sz+=fa[gj][2]
    l=math.sqrt(sx*sx+sy*sy+sz*sz) or 1
    return (sx/l,sy/l,sz/l)
# unify position / uv / (quantised) normal
key={}; OP=[];ON=[];OU=[];OC=[];I=[]
for fi,f in enumerate(F):
    for c in f:
        n=corner_normal(fi,c[0]); qn=tuple(max(-127,min(127,round(x*127))) for x in n)
        k=(c[0],c[1],qn)
        if k not in key:
            key[k]=len(OP)
            OP.append(P[c[0]]); ON.append(n)
            OU.append(VT[c[1]] if c[1]>=0 else [0,0]); OC.append(cav[c[0]])
        I.append(key[k])
nV=len(OP); nI=len(I)
mn=[min(p[k] for p in OP) for k in range(3)]; mx=[max(p[k] for p in OP) for k in range(3)]
pad=lambda b:b+b'\0'*((4-len(b)%4)%4)
q=lambda v,a,b:max(0,min(65535,round((v-a)/(b-a)*65535)))
pos=b''.join(struct.pack('<3H',*(q(p[k],mn[k],mx[k]) for k in range(3))) for p in OP)
nrm=b''.join(struct.pack('<3b',*(max(-127,min(127,round(n[k]*127))) for k in range(3))) for n in ON)
uv=b''.join(struct.pack('<2H',q(u[0]%1.0 if u[0]!=1.0 else 1.0,0,1),q(u[1]%1.0 if u[1]!=1.0 else 1.0,0,1)) for u in OU)
cv=bytes(max(0,min(255,round(128+c*600))) for c in OC)
idx=b''.join(struct.pack('<H',i) for i in I) if nV<65536 else b''.join(struct.pack('<I',i) for i in I)
blob=b'DOC1'+struct.pack('<II',nV,nI)+struct.pack('<6f',*mn,*mx)+pad(pos)+pad(nrm)+pad(uv)+pad(cv)+pad(idx)
open(out,'w').write('data:application/octet-stream;base64,'+base64.b64encode(blob).decode())
cs=sorted(OC); print('nV',nV,'nI',nI,'tris',nI//3,'bytes',len(blob),'bbox',[round(x,3) for x in mn+mx],'cav p5/p50/p95',round(cs[len(cs)//20],3),round(cs[len(cs)//2],3),round(cs[-len(cs)//20],3))
