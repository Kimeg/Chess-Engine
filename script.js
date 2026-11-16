/*
 * Chess Engine — application logic
 *
 * This file contains the chess rules, search engines, Stockfish worker integration,
 * game state, clocks, replay/PGN handling, board rendering, and UI event handlers.
 * The original feature logic is preserved; this refactor separates presentation
 * and document structure from application behavior.
 */

const $=id=>document.getElementById(id);
const GL={
    K:'\u265A',Q:'\u265B',R:'\u265C',B:'\u265D',N:'\u265E',P:'\u265F'
};
const V={
    P:100,N:320,B:330,R:500,Q:900,K:0
};
const N=[[1,2],[2,1],[-1,2],[-2,1],[1,-2],[2,-1],[-1,-2],[-2,-1]];
const K=[[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];
const STD='rnbqkbnrpppppppp................................PPPPPPPPRNBQKBNR';
const mkS=(s,t)=>{
    const b=[...s].map(c=>c==='.'?'':c);
    let c='';
    if(b[60]==='K'&&b[63]==='R')c+='K';
    if(b[60]==='K'&&b[56]==='R')c+='Q';
    if(b[4]==='k'&&b[7]==='r')c+='k';
    if(b[4]==='k'&&b[0]==='r')c+='q';
    return{
        b,t,c,ep:-1,hm:0
    }
};
const initS=()=>{
    const v=$('pos')&&$('pos').value,cb=v&&v!=='std'?ldB()[+v]:null;
    return cb?mkS(cb.s,cb.t):mkS(STD,'w')
};
const isW=p=>p<'a';
const inb=(r,f)=>r>=0&&r<8&&f>=0&&f<8;
/* ---------- rules ---------- */
function att(b,s,w) {
    const r=s>>3,f=s&7,at=(R,F,p)=>inb(R,F)&&b[R*8+F]===p,pr=w?r+1:r-1;
    if(at(pr,f-1,w?'P':'p')||at(pr,f+1,w?'P':'p'))return 1;
    for(const[d,e]of N)if(at(r+d,f+e,w?'N':'n'))return 1;
    for(const[d,e]of K)if(at(r+d,f+e,w?'K':'k'))return 1;
    for(const[d,e]of K) {
        let R=r+d,F=f+e;
        while(inb(R,F)) {
            const p=b[R*8+F];
            if(p) {
                const u=p.toUpperCase();
                if(isW(p)===w&&(u==='Q'||u===(d&&e?'B':'R')))return 1;
                break
            }
            R+=d;
            F+=e
        }
    }
    return 0
}
function gen(S) {
    const {
        b,t,c,ep
    }
    =S,w=t==='w',m=[];
    for(let s=0;s<64;s++) {
        const p=b[s];
        if(!p||isW(p)!==w)continue;
        const r=s>>3,f=s&7,u=p.toUpperCase(),add=(to,x)=>m.push({f:s,t:to,...x});
        if(u==='P') {
            const d=w?-1:1,R=r+d,pm=R===(w?0:7),push=to=>pm?['Q','R','B','N'].forEach(p=>add(to,{p})):add(to);
            if(inb(R,f)) {
                if(!b[R*8+f]) {
                    push(R*8+f);
                    if(r===(w?6:1)&&!b[(R+d)*8+f])add((R+d)*8+f)
                }
                for(const e of[-1,1]) {
                    const F=f+e;
                    if(!inb(R,F))continue;
                    const q=b[R*8+F];
                    if((q&&isW(q)!==w)||R*8+F===ep)push(R*8+F)
                }
            }
        }
        else if(u==='N'||u==='K') {
            for(const[d,e]of u==='N'?N:K) {
                const R=r+d,F=f+e;
                if(!inb(R,F))continue;
                const q=b[R*8+F];
                if(!q||isW(q)!==w)add(R*8+F)
            }
            const h=w?60:4;
            if(u==='K'&&s===h&&!att(b,h,!w)) {
                if(c.includes(w?'K':'k')&&!b[h+1]&&!b[h+2]&&b[h+3]===(w?'R':'r')&&!att(b,h+1,!w)&&!att(b,h+2,!w))add(h+2);
                if(c.includes(w?'Q':'q')&&!b[h-1]&&!b[h-2]&&!b[h-3]&&b[h-4]===(w?'R':'r')&&!att(b,h-1,!w)&&!att(b,h-2,!w))add(h-2)
            }
        }
        else for(const[d,e]of K) {
            const dg=d&&e;
            if((u==='B'&&!dg)||(u==='R'&&dg))continue;
            let R=r+d,F=f+e;
            while(inb(R,F)) {
                const q=b[R*8+F];
                if(!q)add(R*8+F);
                else {
                    if(isW(q)!==w)add(R*8+F);
                    break
                }
                R+=d;
                F+=e
            }
        }
    }
    return m
}
const CRM={
    60:'KQ',63:'K',56:'Q',4:'kq',7:'k',0:'q'
};
function make(S,m) {
    const b=S.b.slice(),p=b[m.f],w=isW(p),u=p.toUpperCase();
    let cap=!!b[m.t],ep=-1;
    if(u==='P') {
        if(m.t===S.ep) {
            b[m.t+(w?8:-8)]='';
            cap=true
        }
        if(Math.abs(m.t-m.f)===16)ep=(m.f+m.t)>>1
    }
    if(u==='K'&&Math.abs(m.t-m.f)===2) {
        const q=m.t>m.f,rf=q?m.t+1:m.t-2;
        b[q?m.t-1:m.t+1]=b[rf];
        b[rf]=''
    }
    b[m.t]=m.p?(w?m.p:m.p.toLowerCase()):p;
    b[m.f]='';
    let c=S.c;
    if(c) {
        const x=(CRM[m.f]||'')+(CRM[m.t]||'');
        if(x)for(const ch of x)c=c.replace(ch,'')
    }
    return{
        b,t:w?'b':'w',c,ep,hm:u==='P'||cap?0:S.hm+1
    }
}
const kingSq=(S,t)=>S.b.indexOf(t==='w'?'K':'k');
const inChk=S=>att(S.b,kingSq(S,S.t),S.t!=='w')?1:0;
const legal=S=>gen(S).filter(m=>{const n=make(S,m);return!att(n.b,kingSq(n,S.t),S.t!=='w')});
/* ---------- engine: negamax with alpha-beta pruning ---------- */
function ev(S) {
    let v=0;
    for(let s=0;s<64;s++) {
        const p=S.b[s];
        if(!p)continue;
        const w=isW(p),u=p.toUpperCase(),r=s>>3,f=s&7,cd=Math.abs(r-3.5)+Math.abs(f-3.5);
        let x=V[u];
        if(u==='P')x+=(w?6-r:r-1)*10+(cd<2?10:0);
        else if(u==='N'||u==='B')x+=(5-cd)*8;
        else if(u==='Q')x+=(4-cd)*2;
        else if(u==='K')x+=(w?r-4:3-r)*8;
        v+=w?x:-x
    }
    return v
}
function order(S,ms) {
    const sc=m=>(S.b[m.t]?V[S.b[m.t].toUpperCase()]*10-V[S.b[m.f].toUpperCase()]:0)+(m.p?800:0);
    return ms.sort((x,y)=>sc(y)-sc(x))
}
function srch(S,d,a,b,ply) {
    const ms=legal(S);
    if(!ms.length)return inChk(S)?-99000+ply:0;
    if(S.hm>=100)return 0;
    if(!d)return(S.t==='w'?1:-1)*ev(S);
    order(S,ms);
    for(const m of ms) {
        const v=-srch(make(S,m),d-1,-b,-a,ply+1);
        if(v>=b)return b;
        if(v>a)a=v
    }
    return a
}
function pick(S,d) {
    const ms=order(S,legal(S));
    let a=-1e6,best=-1e7,bm=ms[0];
    for(const m of ms) {
        const v=-srch(make(S,m),d-1,-1e6,-a,1),w=v+Math.random()*3;
        if(w>best) {
            best=w;
            bm=m
        }
        if(v>a)a=v
    }
    return bm
}
/* ---------- stronger engine: iterative deepening, transposition table, quiescence, killer moves, piece-square tables ---------- */
/* (these declarations replace the simpler ev/order/srch/pick above) */
const PS={
    P:[0,0,0,0,0,0,0,0,50,50,50,50,50,50,50,50,10,10,20,30,30,20,10,10,5,5,10,25,25,10,5,5,0,0,0,20,20,0,0,0,5,-5,-10,0,0,-10,-5,5,5,10,10,-20,-20,10,10,5,0,0,0,0,0,0,0,0],
    N:[-50,-40,-30,-30,-30,-30,-40,-50,-40,-20,0,0,0,0,-20,-40,-30,0,10,15,15,10,0,-30,-30,5,15,20,20,15,5,-30,-30,0,15,20,20,15,0,-30,-30,5,10,15,15,10,5,-30,-40,-20,0,5,5,0,-20,-40,-50,-40,-30,-30,-30,-30,-40,-50],
    B:[-20,-10,-10,-10,-10,-10,-10,-20,-10,0,0,0,0,0,0,-10,-10,0,5,10,10,5,0,-10,-10,5,5,10,10,5,5,-10,-10,0,10,10,10,10,0,-10,-10,10,10,10,10,10,10,-10,-10,5,0,0,0,0,5,-10,-20,-10,-10,-10,-10,-10,-10,-20],
    R:[0,0,0,0,0,0,0,0,5,10,10,10,10,10,10,5,-5,0,0,0,0,0,0,-5,-5,0,0,0,0,0,0,-5,-5,0,0,0,0,0,0,-5,-5,0,0,0,0,0,0,-5,-5,0,0,0,0,0,0,-5,0,0,0,5,5,0,0,0],
    Q:[-20,-10,-10,-5,-5,-10,-10,-20,-10,0,0,0,0,0,0,-10,-10,0,5,5,5,5,0,-10,-5,0,5,5,5,5,0,-5,0,0,5,5,5,5,0,-5,-10,5,5,5,5,5,0,-10,-10,0,5,0,0,0,0,-10,-20,-10,-10,-5,-5,-10,-10,-20],
    K:[-30,-40,-40,-50,-50,-40,-40,-30,-30,-40,-40,-50,-50,-40,-40,-30,-30,-40,-40,-50,-50,-40,-40,-30,-30,-40,-40,-50,-50,-40,-40,-30,-20,-30,-30,-40,-40,-30,-30,-20,-10,-20,-20,-20,-20,-20,-20,-10,20,20,0,0,0,0,20,20,20,30,10,0,0,10,30,20]
};
const LV={
    1: {
        d:2,t:200,n:90,adv:1
    },2: {
        d:3,t:400,n:20,adv:1
    },3: {
        d:8,t:800,n:0,adv:1,book:1
    },4: {
        d:12,t:2000,n:0,adv:1,book:1
    },5: {
        d:30,t:3000,n:0,adv:1,book:1
    },6: {
        d:40,t:7000,n:0,adv:1,book:1
    },7: {
        t:500,sf:1
    },8: {
        t:600,sf:1,early:1,book:1
    },9: {
        t:1200,sf:1,early:1,book:1
    }
};
let KL=[],RS=new Set(),TT=new Map(),DL=0,NC=0;
const key=S=>S.b.map(p=>p||'.').join('')+S.t+S.c+S.ep;
function ev(S) {
    let v=0,mat=0,bp=[0,0],ks=[];
    for(let s=0;s<64;s++) {
        const p=S.b[s];
        if(!p)continue;
        const w=isW(p),u=p.toUpperCase(),r=s>>3,f=s&7;
        if(u==='K') {
            ks.push([s,w]);
            continue
        }
        if(u!=='P')mat+=V[u];
        if(u==='B')bp[w?0:1]++;
        const x=V[u]+PS[u][w?s:(7-r)*8+f];
        v+=w?x:-x
    }
    if(bp[0]>1)v+=30;
    if(bp[1]>1)v-=30;
    for(const[s,w]of ks) {
        const r=s>>3,f=s&7,cd=Math.abs(r-3.5)+Math.abs(f-3.5),x=mat>2600?PS.K[w?s:(7-r)*8+f]:(4-cd)*12;
        v+=w?x:-x
    }
    return v
}
function order(S,ms,hm,ply) {
    const sc=m=>{
        if(hm&&m.f===hm.f&&m.t===hm.t)return 1e6;
        let s=0;
        const c=S.b[m.t];
        if(c)s=1000+V[c.toUpperCase()]*10-V[S.b[m.f].toUpperCase()];
        if(m.p)s+=800;
        const k=KL[ply];
        if(k&&k.f===m.f&&k.t===m.t)s+=500;
        return s
    };
    return ms.map(m=>[sc(m),m]).sort((x,y)=>y[0]-x[0]).map(x=>x[1])
}
function qs(S,a,b) {
    if((++NC&2047)===0&&Date.now()>DL)throw 1;
    const st=(S.t==='w'?1:-1)*ev(S);
    if(st>=b)return b;
    if(st>a)a=st;
    const caps=gen(S).filter(m=>S.b[m.t]||m.p||(m.t===S.ep&&S.b[m.f].toUpperCase()==='P'));
    for(const m of order(S,caps,null,0)) {
        const n=make(S,m);
        if(att(n.b,kingSq(n,S.t),S.t!=='w'))continue;
        const v=-qs(n,-b,-a);
        if(v>=b)return b;
        if(v>a)a=v
    }
    return a
}
function srch(S,d,a,b,ply) {
    if((++NC&2047)===0&&Date.now()>DL)throw 1;
    const ms=legal(S),chk=inChk(S);
    if(!ms.length)return chk?-99000+ply:0;
    if(S.hm>=100)return 0;
    const k=key(S);
    if(ply&&RS.has(k))return 0;
    if(chk&&ply<14)d++;
    if(d<=0)return qs(S,a,b);
    const e=TT.get(k),a0=a;
    let hm=null;
    if(e) {
        hm=e.m;
        if(e.d>=d&&(e.f===0||(e.f===1&&e.v>=b)||(e.f===2&&e.v<=a)))return e.v
    }
    let bv=-1e6,bm=null;
    for(const m of order(S,ms,hm,ply)) {
        const v=-srch(make(S,m),d-1,-b,-a,ply+1);
        if(v>bv) {
            bv=v;
            bm=m
        }
        if(v>a)a=v;
        if(a>=b) {
            if(!S.b[m.t])KL[ply]=m;
            break
        }
    }
    TT.set(k,{d,v:bv,f:bv<=a0?2:bv>=b?1:0,m:bm});
    return bv
}
async function pick(S,lv,id) {
    const L=LV[lv]||LV[3];
    if(L.sf)return pickSF(S,L,id);
    if(L.adv)return pickS(S,L,id);
    const ms=legal(S);
    if(ms.length===1)return ms[0];
    DL=Date.now()+Math.min(L.t,Math.max(50,G&&G.tm?G.tm[S.t]/25:1e9));
    NC=0;
    KL=[];
    if(TT.size>3e5)TT.clear();
    let best=ms[0];
    let ly=Date.now();
    for(let d=1;d<=L.d;d++) {
        try {
            let a=-1e6,bb=null,bw=-1e7,bv=-1e7;
            for(const m of order(S,ms,best,0)) {
                if(Date.now()-ly>60) {
                    await new Promise(r=>setTimeout(r,0));
                    ly=Date.now();
                    if(id!==epoch)return null
                }
                const v=-srch(make(S,m),d-1,-1e6,-a,1),w=v+Math.random()*L.n;
                if(w>bw) {
                    bw=w;
                    bb=m;
                    bv=v
                }
                if(v>a)a=v
            }
            best=bb;
            if(bv>90000)break
        }catch(e) {
            break
        }
    }
    return best
}
/* ---------- fast engine, used by every strength level ----------
   Precomputed attack and ray tables, allocation-light move generation (with a captures-only mode for quiescence),
   a typed-array transposition table, a pawn-structure cache, principal variation search, null-move pruning,
   late-move reductions, killer/history ordering, easy-move early exit and a small opening book. */
const Z1=new Int32Array(768),Z2=new Int32Array(768);
for(let i=0;i<768;i++) {
    Z1[i]=Math.random()*4294967296|0;
    Z2[i]=Math.random()*4294967296|0
}
const PI={
    P:0,N:1,B:2,R:3,Q:4,K:5,p:6,n:7,b:8,r:9,q:10,k:11
};
const NT=[],KT=[],RY=[],PAT=[[],[]],sqOf=([R,F])=>R*8+F;
for(let s=0;s<64;s++) {
    const r=s>>3,f=s&7,ok=([R,F])=>inb(R,F);
    NT[s]=N.map(([d,e])=>[r+d,f+e]).filter(ok).map(sqOf);
    KT[s]=K.map(([d,e])=>[r+d,f+e]).filter(ok).map(sqOf);
    RY[s]=K.map(([d,e])=>{const a=[];let R=r+d,F=f+e;while(inb(R,F)){a.push(R*8+F);R+=d;F+=e}return a});
    PAT[0][s]=[[r+1,f-1],[r+1,f+1]].filter(ok).map(sqOf);
    PAT[1][s]=[[r-1,f-1],[r-1,f+1]].filter(ok).map(sqOf)
}
function attF(b,s,w) {
    const P=w?'P':'p',Nn=w?'N':'n',Kk=w?'K':'k',Q=w?'Q':'q',Rr=w?'R':'r',Bb=w?'B':'b';
    let a=PAT[w?0:1][s],i;
    for(i=0;i<a.length;i++)if(b[a[i]]===P)return 1;
    a=NT[s];
    for(i=0;i<a.length;i++)if(b[a[i]]===Nn)return 1;
    a=KT[s];
    for(i=0;i<a.length;i++)if(b[a[i]]===Kk)return 1;
    for(let d=0;d<8;d++) {
        a=RY[s][d];
        const o=d<4?Rr:Bb;
        for(i=0;i<a.length;i++) {
            const p=b[a[i]];
            if(p) {
                if(p===Q||p===o)return 1;
                break
            }
        }
    }
    return 0
}
function genF(S,co) {
    const b=S.b,w=S.t==='w',ep=S.ep,m=[];
    for(let s=0;s<64;s++) {
        const p=b[s];
        if(!p||(p<'a')!==w)continue;
        const u=p<'a'?p:p.toUpperCase();
        if(u==='P') {
            const f=s&7,r=s>>3,d=w?-1:1,R=r+d,pm=R===(w?0:7),t1=R*8+f;
            if(!b[t1]&&(!co||pm)) {
                if(pm) {
                    m.push({f:s,t:t1,p:'Q'});
                    if(!co)m.push({f:s,t:t1,p:'R'},{f:s,t:t1,p:'B'},{f:s,t:t1,p:'N'})
                }
                else {
                    m.push({f:s,t:t1,p:''});
                    if(!co&&r===(w?6:1)&&!b[t1+d*8])m.push({f:s,t:t1+d*8,p:''})
                }
            }
            for(let e=-1;e<=1;e+=2) {
                const F=f+e;
                if(F<0||F>7)continue;
                const to=R*8+F,q=b[to];
                if((q&&(q<'a')!==w)||to===ep) {
                    if(pm) {
                        m.push({f:s,t:to,p:'Q'});
                        if(!co)m.push({f:s,t:to,p:'R'},{f:s,t:to,p:'B'},{f:s,t:to,p:'N'})
                    }else m.push({f:s,t:to,p:''})
                }
            }
        }
        else if(u==='N'||u==='K') {
            const a=u==='N'?NT[s]:KT[s];
            for(let i=0;i<a.length;i++) {
                const q=b[a[i]];
                if(q?(q<'a')!==w:!co)m.push({f:s,t:a[i],p:''})
            }
            const h=w?60:4;
            if(u==='K'&&!co&&s===h&&S.c&&!attF(b,h,!w)) {
                if(S.c.includes(w?'K':'k')&&!b[h+1]&&!b[h+2]&&b[h+3]===(w?'R':'r')&&!attF(b,h+1,!w)&&!attF(b,h+2,!w))m.push({f:s,t:h+2,p:''});
                if(S.c.includes(w?'Q':'q')&&!b[h-1]&&!b[h-2]&&!b[h-3]&&b[h-4]===(w?'R':'r')&&!attF(b,h-1,!w)&&!attF(b,h-2,!w))m.push({f:s,t:h-2,p:''})
            }
        }
        else for(let d=u==='B'?4:0,de=u==='R'?4:8;d<de;d++) {
            const a=RY[s][d];
            for(let i=0;i<a.length;i++) {
                const q=b[a[i]];
                if(!q) {
                    if(!co)m.push({f:s,t:a[i],p:''})
                }else {
                    if((q<'a')!==w)m.push({f:s,t:a[i],p:''});
                    break
                }
            }
        }
    }
    return m
}
function legalF(S) {
    const w=S.t==='w',kc=w?'K':'k',ks=S.b.indexOf(kc);
    return genF(S,false).filter(m=>!attF(make(S,m).b,S.b[m.f]===kc?m.t:ks,!w))
}
function hs(S) {
    let a=S.t==='b'?0x5bd1e995:0,c=0;
    const b=S.b;
    for(let s=0;s<64;s++) {
        const p=b[s];
        if(p) {
            const i=s*12+PI[p];
            a^=Z1[i];
            c^=Z2[i]
        }
    }
    for(const ch of S.c)a^=ch.charCodeAt(0)*2654435761|0;
    a^=(S.ep+2)*40503;
    return a+(c&0x1FFFFF)*4294967296
}
const npm=(S,w)=>S.b.some(p=>p&&(p<'a')===w&&p!=='P'&&p!=='p'&&p!=='K'&&p!=='k');
const PB=[0,6,14,28,50,85],cW=new Int8Array(8),cB=new Int8Array(8),wMax=new Int8Array(8),bMin=new Int8Array(8);
const PCk=new Float64Array(1<<14),PCv=new Int32Array(1<<14),wP=[],bP=[],rW=[],rB=[];
function evS(S) {
    const b=S.b;
    let v=0,mat=0,nbw=0,nbb=0,wk=0,bk=0,pz=0,pc=0;
    cW.fill(0);
    cB.fill(0);
    wMax.fill(-1);
    bMin.fill(8);
    wP.length=bP.length=rW.length=rB.length=0;
    for(let s=0;s<64;s++) {
        const p=b[s];
        if(!p)continue;
        const r=s>>3,f=s&7;
        switch(p) {
            case'P':cW[f]++;
            if(r>wMax[f])wMax[f]=r;
            wP.push(s);
            pz^=Z1[s*12];
            pc^=Z2[s*12];
            v+=100+PS.P[s];
            break;
            case'p':cB[f]++;
            if(r<bMin[f])bMin[f]=r;
            bP.push(s);
            pz^=Z1[s*12+6];
            pc^=Z2[s*12+6];
            v-=100+PS.P[(7-r)*8+f];
            break;
            case'K':wk=s;
            break;
            case'k':bk=s;
            break;
            default: {
                const w=p<'a',u=w?p:p.toUpperCase(),x=V[u]+PS[u][w?s:(7-r)*8+f];
                mat+=V[u];
                v+=w?x:-x;
                if(u==='B') {
                    if(w)nbw++;
                    else nbb++
                }else if(u==='R')(w?rW:rB).push(s)
            }
        }
    }
    const key=pz+(pc&0x1FFFFF)*4294967296,pi=(pz^pc)&16383;
    if(PCk[pi]===key)v+=PCv[pi];
    else {
        let x=0;
        for(const s of wP) {
            const r=s>>3,f=s&7,adj=(f?cW[f-1]:0)+(f<7?cW[f+1]:0);
            if(cW[f]>1)x-=10;
            if(!adj)x-=12;
            let ps=1;
            for(let g=f?f-1:0;g<=(f<7?f+1:7);g++)if(bMin[g]<r) {
                ps=0;
                break
            }
            if(ps)x+=PB[Math.min(5,6-r)]+(adj?6:0)
        }
        for(const s of bP) {
            const r=s>>3,f=s&7,adj=(f?cB[f-1]:0)+(f<7?cB[f+1]:0);
            if(cB[f]>1)x+=10;
            if(!adj)x+=12;
            let ps=1;
            for(let g=f?f-1:0;g<=(f<7?f+1:7);g++)if(wMax[g]>r) {
                ps=0;
                break
            }
            if(ps)x-=PB[Math.min(5,r-1)]+(adj?6:0)
        }
        PCk[pi]=key;
        PCv[pi]=x;
        v+=x
    }
    for(const s of rW) {
        const f=s&7;
        if(!cW[f])v+=cB[f]?8:15
    }
    for(const s of rB) {
        const f=s&7;
        if(!cB[f])v-=cW[f]?8:15
    }
    if(nbw>1)v+=30;
    if(nbb>1)v-=30;
    const ph=Math.min(1,mat/4000);
    for(let q=0;q<2;q++) {
        const w=q===0,s=w?wk:bk,r=s>>3,f=s&7,cd=Math.abs(r-3.5)+Math.abs(f-3.5);
        let x=PS.K[w?s:(7-r)*8+f]*ph+(4-cd)*12*(1-ph);
        if(ph>.3) {
            const fr=r+(w?-1:1);
            if(fr>=0&&fr<8)for(let g=Math.max(0,f-1);g<=Math.min(7,f+1);g++)if(b[fr*8+g]===(w?'P':'p'))x+=10*ph
        }
        v+=w?x:-x
    }
    if(ph<.6&&Math.abs(v)>200) {
        const sg=v>0?1:-1,es=sg>0?bk:wk,d=Math.abs((wk>>3)-(bk>>3))+Math.abs((wk&7)-(bk&7));
        v+=sg*((Math.abs((es>>3)-3.5)+Math.abs((es&7)-3.5))*10+(14-d)*4)*(1-ph)
    }
    return v
}
let HIS=new Int32Array(4096),KL2=[],PK=[],RH=new Set(),DL2=0,NC2=0;
const NOK=[-1,-1];
const TN=1<<20,TK=new Float64Array(TN),TV=new Int32Array(TN),TD=new Int8Array(TN),TF=new Int8Array(TN),TM=new Int32Array(TN);
const mc=m=>m.f|m.t<<6|(m.p?('QRBN'.indexOf(m.p)+1)<<12:0);
function scoreS(S,ms,hm,ply) {
    const k=KL2[ply]||NOK,b=S.b,out=new Array(ms.length);
    for(let i=0;i<ms.length;i++) {
        const m=ms[i],a=b[m.f],c=b[m.t],code=mc(m);
        let s;
        if(code===hm)s=1e8;
        else if(c)s=1e6+V[c.toUpperCase()]*10-V[a.toUpperCase()];
        else if((a==='P'||a==='p')&&m.t===S.ep)s=1e6+900;
        else if(code===k[0])s=9e5;
        else if(code===k[1])s=8.5e5;
        else s=Math.min(HIS[m.f*64+m.t],8e5);
        out[i]=m.p==='Q'?s+1.5e6:s
    }
    return out
}
function qsS(S,a,b) {
    if((++NC2&1023)===0&&Date.now()>DL2)throw 1;
    const w=S.t==='w',bd=S.b,st=(w?1:-1)*evS(S);
    if(st>=b)return b;
    if(st>a)a=st;
    const ms=genF(S,true),sc=scoreS(S,ms,-1,99),kc=w?'K':'k',ks=bd.indexOf(kc);
    for(let i=0;i<ms.length;i++) {
        let k=i;
        for(let j=i+1;j<ms.length;j++)if(sc[j]>sc[k])k=j;
        if(k!==i) {
            const t=ms[i];
            ms[i]=ms[k];
            ms[k]=t;
            const u=sc[i];
            sc[i]=sc[k];
            sc[k]=u
        }
        const m=ms[i],cv=bd[m.t]?V[bd[m.t].toUpperCase()]:100;
        if(st+cv+200<a&&!m.p)continue;
        const n=make(S,m);
        if(attF(n.b,bd[m.f]===kc?m.t:ks,!w))continue;
        const v=-qsS(n,-b,-a);
        if(v>=b)return b;
        if(v>a)a=v
    }
    return a
}
function srchS(S,d,a,b,ply,nul) {
    if((++NC2&1023)===0&&Date.now()>DL2)throw 1;
    const w=S.t==='w',bd=S.b,kc=w?'K':'k',ks=bd.indexOf(kc),chk=attF(bd,ks,!w);
    if(S.hm>=100)return 0;
    const h=hs(S);
    if(ply) {
        if(RH.has(h))return 0;
        for(let i=ply-2;i>=0;i-=2)if(PK[i]===h)return 0
    }
    PK[ply]=h;
    if(chk&&ply<30)d++;
    if(d<=0)return qsS(S,a,b);
    const ti=(h|0)&(TN-1),a0=a;
    let hm=-1;
    if(TK[ti]===h) {
        hm=TM[ti];
        const ev=TV[ti];
        if(TD[ti]>=d&&ev<90000&&ev>-90000) {
            const f=TF[ti];
            if(f===0||(f===1&&ev>=b)||(f===2&&ev<=a))return ev
        }
    }
    if(!chk&&nul&&b-a===1&&d>=3&&npm(S,w)&&(w?1:-1)*evS(S)>=b) {
        const v=-srchS({b:bd,t:w?'b':'w',c:S.c,ep:-1,hm:S.hm+1},d-1-(d>=6?3:2),-b,-b+1,ply+1,false);
        if(v>=b)return b
    }
    const ms=genF(S,false),sc=scoreS(S,ms,hm,ply);
    let bv=-1e6,bc=-1,n=0;
    for(let i=0;i<ms.length;i++) {
        let k=i;
        for(let j=i+1;j<ms.length;j++)if(sc[j]>sc[k])k=j;
        if(k!==i) {
            const t=ms[i];
            ms[i]=ms[k];
            ms[k]=t;
            const u=sc[i];
            sc[i]=sc[k];
            sc[k]=u
        }
        const m=ms[i],pc=bd[m.f],nx=make(S,m);
        if(attF(nx.b,pc===kc?m.t:ks,!w))continue;
        const quiet=!bd[m.t]&&!m.p&&!((pc==='P'||pc==='p')&&m.t===S.ep);
        let v;
        if(n===0)v=-srchS(nx,d-1,-b,-a,ply+1,true);
        else {
            const r=d>=3&&n>=3&&quiet&&!chk?(n>8?2:1):0;
            v=-srchS(nx,d-1-r,-a-1,-a,ply+1,true);
            if(v>a&&r)v=-srchS(nx,d-1,-a-1,-a,ply+1,true);
            if(v>a&&v<b)v=-srchS(nx,d-1,-b,-a,ply+1,true)
        }
        n++;
        if(v>bv) {
            bv=v;
            bc=mc(m)
        }
        if(v>a)a=v;
        if(a>=b) {
            if(quiet) {
                const code=mc(m),kk=KL2[ply]||(KL2[ply]=[-1,-1]);
                if(kk[0]!==code) {
                    kk[1]=kk[0];
                    kk[0]=code
                }
                HIS[m.f*64+m.t]+=d*d
            }
            break
        }
    }
    if(!n)return chk?-99000+ply:0;
    if(TK[ti]!==h||TD[ti]<=d) {
        TK[ti]=h;
        TV[ti]=bv;
        TD[ti]=d;
        TF[ti]=bv<=a0?2:bv>=b?1:0;
        TM[ti]=bc
    }
    return bv
}
const BK=['e2e4 e7e5 g1f3 b8c6 f1b5 a7a6 b5a4 g8f6 e1g1 f8e7 f1e1 b7b5 a4b3 d7d6 c2c3 e8g8','e2e4 e7e5 g1f3 b8c6 f1c4 f8c5 c2c3 g8f6 d2d3 d7d6','e2e4 c7c5 g1f3 d7d6 d2d4 c5d4 f3d4 g8f6 b1c3 a7a6',
'e2e4 c7c5 g1f3 b8c6 d2d4 c5d4 f3d4 g8f6 b1c3 e7e5','e2e4 e7e6 d2d4 d7d5 b1c3 g8f6 c1g5 f8e7','e2e4 c7c6 d2d4 d7d5 b1c3 d5e4 c3e4 c8f5',
'd2d4 d7d5 c2c4 e7e6 b1c3 g8f6 c1g5 f8e7 e2e3 e8g8 g1f3','d2d4 d7d5 c2c4 c7c6 g1f3 g8f6 b1c3 d5c4 a2a4 c8f5',
'd2d4 g8f6 c2c4 e7e6 g1f3 b7b6 g2g3 c8b7 f1g2 f8e7 e1g1 e8g8','d2d4 g8f6 c2c4 g7g6 b1c3 f8g7 e2e4 d7d6 g1f3 e8g8',
'g1f3 d7d5 g2g3 g8f6 f1g2 e7e6 e1g1 f8e7','c2c4 e7e5 b1c3 g8f6 g1f3 b8c6 g2g3 d7d5','e2e4 e7e5 g1f3 g8f6 f3e5 d7d6 e5f3 f6e4 d2d4 d6d5'].map(l=>l.split(' '));
const sqi=x=>(8-x[1])*8+'abcdefgh'.indexOf(x[0]);
function bookMove(S,ms) {
    if(G.mv.length>16||G.hist[0].t!=='w'||G.hist[0].b.map(p=>p||'.').join('')!==STD)return null;
    const n=G.mv.length,h=G.mv.map(m=>sqn(m.f)+sqn(m.t)+(m.p||'')).join(' '),c=[];
    for(const l of BK)if(l.length>n&&l.slice(0,n).join(' ')===h)c.push(l[n]);
    if(!c.length)return null;
    const x=c[Math.random()*c.length|0],f=sqi(x.slice(0,2)),t=sqi(x.slice(2,4));
    return ms.find(m=>m.f===f&&m.t===t)||null
}
async function pickS(S,L,id) {
    const all=legalF(S);
    if(all.length<=1)return all[0];
    if(L.book) {
        const bm=bookMove(S,all);
        if(bm)return bm
    }
    const t0=Date.now(),budget=Math.max(40,moveTime(S,L.t)),nz=L.n||0;
    DL2=t0+budget;
    NC2=0;
    HIS.fill(0);
    KL2=[];
    PK=[];
    RH=new Set(G.hist.map(hs));
    let best=all[0],ly=Date.now(),stab=0;
    for(let d=1;d<=L.d;d++) {
        if(d>3&&Date.now()-t0>budget*.45)break;
        try {
            let a=-1e6,bb=null,bw=-1e7;
            const sc=scoreS(S,all,mc(best),0),ix=all.map((_,i)=>i).sort((x,y)=>sc[y]-sc[x]);
            for(let j=0;j<ix.length;j++) {
                const m=all[ix[j]];
                if(Date.now()-ly>60) {
                    await new Promise(r=>setTimeout(r,0));
                    ly=Date.now();
                    if(id!==epoch)return null
                }
                const nx=make(S,m);
                let v;
                if(nz)v=-srchS(nx,d-1,-1e6,1e6,1,true);
                else if(j===0)v=-srchS(nx,d-1,-1e6,-a,1,true);
                else {
                    v=-srchS(nx,d-1,-a-1,-a,1,true);
                    if(v>a)v=-srchS(nx,d-1,-1e6,-a,1,true)
                }
                const w2=v+(nz?Math.random()*nz:0);
                if(nz?w2>bw:v>a) {
                    bb=m;
                    bw=w2
                }
                if(v>a)a=v
            }
            stab=bb&&mc(bb)===mc(best)?stab+1:0;
            best=bb||best;
            if(a>90000)break;
            if(d>=6&&stab>=3&&Date.now()-t0>budget*.2)break
        }catch(e) {
            break
        }
    }
    return best
}
/* ---------- Stockfish level: Stockfish.js 10 from cdnjs in a web worker, full strength (Skill Level 20).
   If it cannot load (offline, or the page blocks workers) the built-in Grandmaster engine is used instead. ---------- */
const SF={
    w:null,state:'idle',skip:0,cb:null,ready:null,busy:false,pond:null
};
const SF_BASE='https://cdnjs.cloudflare.com/ajax/libs/stockfish.js/10.0.2/';
/* tries the faster WebAssembly build first, then the plain JavaScript build */
function sfTry(src,ms) {
    return new Promise(res=>{let done=false,w=null;
    const fin=ok=>{if(done)return;done=true;if(ok)SF.w=w;else{try{w&&w.terminate()}catch(e){}}res(ok)};
    try{const code=src==='wasm'?"self.Module={locateFile:function(f){return '"+SF_BASE+"'+f}};importScripts('"+SF_BASE+"stockfish.wasm.js');":"importScripts('"+SF_BASE+"stockfish.js');";
    w=new Worker(URL.createObjectURL(new Blob([code],{type:'application/javascript'})));w.onerror=()=>fin(false);
    w.onmessage=e=>{const l=String(e.data);
    if(l==='uciok'){for(const o of['Skill Level value 20','Move Overhead value 10','Hash value 32'])w.postMessage('setoption name '+o);w.postMessage('isready')}
    else if(l==='readyok')fin(true);
    else if(l.startsWith('info')){const k=SF.watch;if(k&&!k.sent){const d=/ depth (\d+)/.exec(l),pv=/ pv (\S+)/.exec(l);
    if(d&&pv&&!/bound/.test(l)){const dd=+d[1];if(dd>k.d){k.stab=pv[1]===k.mv?k.stab+1:0;k.d=dd;k.mv=pv[1]}
    /* easy move: the same best move for 3 depths in a row after 30% of the time, so stop early */
    if(dd>=10&&k.stab>=3&&Date.now()-k.t0>=k.mt*.3){k.sent=true;w.postMessage('stop')}}}}
    else if(l.startsWith('bestmove')){SF.busy=false;SF.watch=null;if(SF.skip>0){SF.skip--;return}const f=SF.cb;SF.cb=null;if(f)f(l)}};
    w.postMessage('uci');setTimeout(()=>fin(false),ms)}catch(e){fin(false)}})
}
function sfStart() {
    if(SF.ready)return SF.ready;
    SF.ready=(async()=>{for(const[src,ms]of[['wasm',7000],['asm',15000]])if(await sfTry(src,ms)){SF.state='ready';SF.kind=src;return true}SF.state='failed';return false})();
    return SF.ready
}
/* time per move from the clock: about 1/45 of the remaining time (1/60 and at most 0.5 s in bullet) plus most of the increment */
function moveTime(S,cap) {
    if(!G||!G.tm)return cap;
    const r=G.tm[S.t],inc=G.inc||0,bullet=(G.t0||0)<=12e4,c=bullet?Math.min(cap,500):cap;
    return Math.round(Math.max(30,Math.min(c,r/(bullet?60:45)+inc*.7,r*.4)))
}
$('lv').addEventListener('change',()=>{if(+$('lv').value>=7)sfStart()});
function toFen(S,fm) {
    const f=[];
    for(let r=0;r<8;r++) {
        let x='',e=0;
        for(let i=0;i<8;i++) {
            const c=S.b[r*8+i];
            if(!c)e++;
            else {
                if(e)x+=e;
                e=0;
                x+=c
            }
        }
        f.push(x+(e||''))
    }
    return f.join('/')+' '+S.t+' '+(S.c||'-')+' '+(S.ep>=0?sqn(S.ep):'-')+' '+S.hm+' '+fm
}
const mvStr=l=>l.map(m=>sqn(m.f)+sqn(m.t)+(m.p?m.p.toLowerCase():'')).join(' ');
const sfPos=l=>'position fen '+toFen(G.hist[0],1)+(l?' moves '+l:'');
const FASTFB={
    d:30,t:450,n:0,adv:1
};
/* quick built-in engine: used whenever Stockfish is missing or late, so a move never takes long */
/* throw away a stuck Stockfish and start a fresh one in the background */
function sfReset() {
    try {
        SF.w&&SF.w.terminate()
    }catch(e) {
    }
    SF.w=null;
    SF.ready=null;
    SF.state='idle';
    SF.busy=false;
    SF.skip=0;
    SF.cb=null;
    SF.pond=null;
    SF.watch=null;
    sfStart()
}
async function pickSF(S,L,id) {
    if(L.book) {
        const bm=bookMove(S,legalF(S));
        if(bm)return bm
    }
    /* opening book: instant */
    if(SF.state!=='ready') {
        if(SF.state==='failed')return pickS(S,FASTFB,id);
        /* wait at most 1.5 s for Stockfish to finish loading, otherwise play this move with the quick engine */
        const ok=await Promise.race([sfStart(),new Promise(r=>setTimeout(()=>r(null),1500))]);
        if(id!==epoch)return null;
        if(ok!==true)return pickS(S,FASTFB,id);
        note('Stockfish ready ('+(SF.kind==='wasm'?'WebAssembly':'JavaScript')+').')
    }
    const ms=legalF(S);
    if(ms.length<=1)return ms[0];
    const cur=mvStr(G.mv),mt=moveTime(S,L.t);
    const line=await new Promise(res=>{let w1,w2;const done=x=>{clearTimeout(w1);clearTimeout(w2);res(x)};SF.cb=done;
    if(SF.busy){SF.skip++;SF.w.postMessage('stop')}
    SF.busy=true;SF.watch=L.early?{t0:Date.now(),mt,d:0,mv:'',stab:0,sent:false}:null;
    SF.w.postMessage(sfPos(cur));SF.w.postMessage('go movetime '+mt);
    /* watchdog: ask it to stop if it overruns, and if it still does not answer, restart it and move with the quick engine */
    w1=setTimeout(()=>{if(SF.cb===done)SF.w.postMessage('stop')},mt+250);
    w2=setTimeout(()=>{if(SF.cb===done){SF.cb=null;sfReset();res(null)}},mt+600)});
    if(id!==epoch)return null;
    const t=line?String(line).split(' '):[],best=t[1];
    const m=best&&ms.find(x=>sqn(x.f)+sqn(x.t)===best.slice(0,4)&&(x.p||'').toLowerCase()===(best[4]||''));
    return m||pickS(S,FASTFB,id)
}
/* ---------- game state ---------- */
let G=null,epoch=0;
const cur=()=>G?G.hist[G.hist.length-1]:(ED?{b:E.b,t:E.t,c:'',ep:-1,hm:0}:initS());
const isComp=t=>G&&(G.script||G.mode==='cc'||(G.mode==='hc'&&t!==G.hu));
const sqn=s=>'abcdefgh'[s&7]+(8-(s>>3));
const mname=m=>sqn(m.f)+'-'+sqn(m.t)+(m.p?'='+m.p:'');
const delay=()=>2100-$('spd').value*20;
const ldR=()=>{
    try {
        return JSON.parse(localStorage.getItem('chess_replays')||'[]')
    }catch(e) {
        return[]
    }
};
const svR=a=>{
    try {
        localStorage.setItem('chess_replays',JSON.stringify(a));
        return 1
    }catch(e) {
        return 0
    }
};
const fmt=ms=>{
    const s=Math.ceil(Math.max(0,ms)/1000);
    return Math.floor(s/60)+':'+String(s%60).padStart(2,'0')
};
function note(t) {
    $('nt').textContent=t;
    setTimeout(()=>{if($('nt').textContent===t)$('nt').textContent=''},3000)
}
function begin(o) {
    epoch++;
    if(o.lv>=7) {
        if(SF.state==='failed') {
            SF.ready=null;
            SF.state='idle'
        }
        sfStart()
    }
    G={
        on:true,hist:[initS()],mv:[],script:null,paused:false,over:false,msg:'',sel:null,last:null,lt:Date.now(),tm:null,hu:'w',lv:3,...o
    };
    if(o.start)G.hist=[o.start];
    const S0=G.hist[0];
    if(!legal(S0).length)end(inChk(S0)?(S0.t==='w'?'Black':'White')+' wins by checkmate':'Draw by stalemate');
    snd('start');
    ui();
    render();
    next()
}
function reset() {
    epoch++;
    G=null;
    ED=$('mode').value==='ed';
    ui();
    render()
}
function end(t) {
    G.over=true;
    G.msg=t;
    epoch++;
    snd(/ran out/.test(t)?'mate':/Draw/.test(t)?'draw':/Replay/.test(t)?'start':'')
}
function play(m) {
    if(charge())return;
    const P0=cur(),n=make(P0,m),mp=P0.b[m.f].toUpperCase(),ck=inChk(n);
    snd(ck?(legal(n).length?'check':'mate'):m.p?'promo':mp==='K'&&Math.abs(m.t-m.f)===2?'castle':(P0.b[m.t]||(mp==='P'&&m.t===P0.ep))?'cap':'move');
    if(G.tm&&G.inc)G.tm[P0.t]+=G.inc;
    G.hist.push(n);
    G.mv.push(m);
    G.last=m;
    G.sel=null;
    if(!legal(n).length)end(inChk(n)?(n.t==='w'?'Black':'White')+' wins by checkmate':'Draw by stalemate');
    else if(G.hist.map(key).filter(x=>x===key(n)).length>=3)end('Draw by threefold repetition');
    else if(n.hm>=100)end('Draw by the 50-move rule');
    else if(n.b.every(p=>!p||p==='K'||p==='k'))end('Draw, only kings left');
    render();
    next()
}
function next() {
    if(!G||!G.on||G.over||G.paused)return;
    G.hold=false;
    const S=cur(),id=epoch;
    if(G.script) {
        if(!G.script.length) {
            end('Replay finished: '+(G.res||''));
            return render()
        }
        setTimeout(()=>{if(id===epoch)play(G.script.shift())},delay())
    }
    else if(isComp(S.t)) {
        const cc=G.mode==='cc';
        if(cc)G.hold=true;
        setTimeout(()=>{if(id!==epoch)return;G.hold=false;G.lt=Date.now();render();
        setTimeout(async()=>{if(id!==epoch)return;RS=new Set(G.hist.map(key));const m=await pick(S,G.lv,id);if(m&&id===epoch)play(m)},0)},cc?delay():(G.lv>=7?0:120))
    }
}
function click(s) {
    if(!G||!G.on||G.over||G.paused||isComp(cur().t))return;
    const S=cur(),p=S.b[s];
    if(G.sel!=null) {
        const m=legal(S).find(m=>m.f===G.sel&&m.t===s);
        if(m) {
            G.sel=null;
            return play(m)
        }
    }
    G.sel=p&&isW(p)===(S.t==='w')?s:null;
    render()
}
/* ---------- UI ---------- */
function ui() {
    const m=G?G.mode:(ED?'ed':$('mode').value),rp=!!(G&&G.script);
    $('lside').hidden=m!=='hc'||rp;
    $('llv').hidden=m==='hh'||m==='ed'||rp;
    $('ed').hidden=!ED;
    $('gr').hidden=ED;
    $('lpos').hidden=ED;
    if(ED)palette();
    $('cc').hidden=!(m==='cc'||rp);
    $('pz').textContent=G&&G.paused?'Resume':'Stop';
    $('fw').hidden=!rp;
    if(!G||!G.pend)$('pr').hidden=true
}
function render() {
    const S=cur(),flip=(G&&G.mode==='hc'&&G.hu==='b')!==vf,bd=$('bd');
    const tg=new Set(G&&G.sel!=null?legal(S).filter(m=>m.f===G.sel).map(m=>m.t):[]),ck=!ED&&inChk(S)?kingSq(S,S.t):-1;
    bd.innerHTML='';
    for(let i=0;i<64;i++) {
        const s=flip?63-i:i,p=S.b[s],d=document.createElement('div');
        d.className='sq '+(((s>>3)+(s&7))%2?'d':'l')+(G&&G.last&&(G.last.f===s||G.last.t===s)?' la':'')+(G&&G.sel===s?' sel':'')+(tg.has(s)?' tg':'')+(s===ck?' ck':'');
        if(p) {
            if(+vw>0)d.appendChild(piece3d(p,flip,s));
            else {
                const sp=document.createElement('span');
                sp.className='pc';
                sp.textContent=glyph(p);
                d.appendChild(sp)
            }
            d.dataset.p=p.toUpperCase();
            d.classList.add(isW(p)?'wp':'bp')
        }
        d.dataset.s=s;
        bd.appendChild(d)
    }
    let st=ED?'Board editor: choose a piece below, then click squares to place it.':'Choose your options and press Start.';
    if(G)st=G.over?G.msg:(G.paused?'Paused. ':'')+nm(S.t)+' to move'+(inChk(S)?' (check)':'')+(G.mode==='hc'&&isComp(S.t)&&!G.paused?', computer is thinking':'');
    $('st').textContent=st;
    const ml=$('ml');
    ml.innerHTML='';
    if(G)for(let i=0;i<G.mv.length;i+=2) {
        const li=document.createElement('li');
        li.textContent=mname(G.mv[i])+'   '+(G.mv[i+1]?mname(G.mv[i+1]):'');
        ml.appendChild(li)
    }
    ml.scrollTop=1e6;
    clk()
}
function clk() {
    const S=cur(),top=(G&&G.mode==='hc'&&G.hu==='b')!==vf?'w':'b',t0=$('inf').checked?0:+$('time').value;
    [['top',top],['bot',top==='w'?'b':'w']].forEach(([k,c])=>{
    $('n'+k).textContent=G&&G.names?G.names[c]+' ('+(c==='w'?'White':'Black')+')':(c==='w'?'White':'Black')+(G&&G.mode==='hc'?(G.hu===c?' (you)':' (computer)'):'');
    $('t'+k).textContent=G?(G.tm?fmt(G.tm[c]):'\u221E'):(t0?fmt(t0*6e4):'\u221E');
    $('c'+k).classList.toggle('on',!!(G&&G.on&&!G.over&&!G.paused&&S.t===c))})
}
/* charges elapsed time to the side to move; clock holds during the animation delay in computer vs computer */
function charge() {
    if(!G)return 0;
    const now=Date.now();
    if(G.tm&&G.on&&!G.over&&!G.paused&&!G.hold) {
        const t=cur().t;
        G.tm[t]-=now-G.lt;
        const sc=Math.ceil(G.tm[t]/1000);
        if(sc>0&&sc<=10&&t+sc!==G.lw&&!isComp(t)) {
            G.lw=t+sc;
            snd('tick')
        }
        if(G.tm[t]<=0) {
            G.tm[t]=0;
            G.lt=now;
            end((t==='w'?'White':'Black')+' ran out of time. '+(t==='w'?'Black':'White')+' wins');
            render();
            return 1
        }
    }
    G.lt=now;
    return 0
}
setInterval(()=>{if(G){charge();clk()}},200);
/* ---------- controls ---------- */
$('mode').onchange=reset;
function infSync() {
    const on=$('inf').checked;
    $('time').disabled=on;
    $('inc').disabled=on
}
$('time').onchange=()=>{
    $('inf').checked=$('time').value==='0';
    infSync();
    if(!G)clk()
};
$('inf').onchange=()=>{
    const on=$('inf').checked;
    if(!on&&$('time').value==='0')$('time').value='10';
    infSync();
    if(G&&G.on&&!G.over) {
        if(on) {
            if(G.tm) {
                G.tmSaved=G.tm;
                G.tm=null
            }
        }
        else if(G.tmSaved) {
            G.tm=G.tmSaved;
            G.tmSaved=null;
            G.lt=Date.now()
        }
        else {
            const t=+$('time').value;
            if(t) {
                G.tm={
                    w:t*6e4,b:t*6e4
                };
                G.t0=t*6e4;
                G.inc=+$('inc').value*1000;
                G.lt=Date.now()
            }
        }
    }
    render()
};
$('go').onclick=()=>{
    let hu=$('side').value;
    if(hu==='r')hu=Math.random()<.5?'w':'b';
    const t=$('inf').checked?0:+$('time').value;
    begin({mode:$('mode').value,hu,lv:+$('lv').value,tm:t?{w:t*6e4,b:t*6e4}:null,inc:t?+$('inc').value*1000:0,t0:t*6e4})
};
$('rs').onclick=reset;
let vf=false;
$('fl').onclick=()=>{
    vf=!vf;
    render()
};
/* revert: human vs human takes back one move; against the computer it also takes back the reply so it is your turn again; computer vs computer and replays step back one move */
$('rv').onclick=()=>{
    if(!G||!G.on||!G.mv.length)return note('Nothing to revert.');
    if(G.script||G.mode==='cc')return $('bk').onclick();
    const k=G.mode==='hc'&&cur().t===G.hu?2:1;
    if(G.mv.length<k)return note('Nothing to revert.');
    epoch++;
    G.pend=0;
    for(let i=0;i<k;i++) {
        G.mv.pop();
        G.hist.pop()
    }
    G.over=false;
    G.msg='';
    G.sel=null;
    G.last=G.mv[G.mv.length-1]||null;
    if(G.tm)for(const x in G.tm)G.tm[x]=Math.max(G.tm[x],5000);
    G.lt=Date.now();
    snd('select');
    ui();
    render();
    next()
};
$('pz').onclick=()=>{
    if(!G||!G.on||G.over)return;
    G.paused=!G.paused;
    epoch++;
    G.lt=Date.now();
    ui();
    render();
    if(!G.paused)next()
};
$('bk').onclick=()=>{
    if(!G||!G.mv.length)return;
    epoch++;
    const m=G.mv.pop();
    G.hist.pop();
    if(G.script)G.script.unshift(m);
    G.over=false;
    G.msg='';
    G.paused=true;
    G.last=G.mv[G.mv.length-1]||null;
    G.sel=null;
    if(G.tm)for(const k in G.tm)G.tm[k]=Math.max(G.tm[k],5000);
    ui();
    render()
};
$('spd').oninput=()=>{
    if(G&&G.on&&!G.over&&!G.paused&&(G.mode==='cc'||G.script)) {
        epoch++;
        next()
    }
};
function rpList() {
    const a=ldR(),s=$('rp');
    s.innerHTML='';
    if(!a.length) {
        s.innerHTML='<option disabled selected>No saved replays yet</option>';
        return
    }
    a.forEach((r,i)=>{const o=document.createElement('option');o.value=i;o.textContent=r.name+' ('+r.moves.length+' moves)';s.appendChild(o)})
}
$('sv').onclick=()=>{
    if(!G||!G.mv.length)return note('Play a few moves first.');
    const a=ldR(),mv=G.mv.concat(G.script||[]),n={
        cc:'Computer vs computer',hc:'Human vs computer',hh:'Human vs human'
    }
    [G.mode];
    a.unshift({name:(G.names?G.names.w+' vs '+G.names.b:n)+', '+new Date().toLocaleString(),moves:mv,result:G.msg||'Unfinished',names:G.names||null,pos:{s:G.hist[0].b.map(p=>p||'.').join(''),t:G.hist[0].t}});
    if(a.length>30)a.length=30;
    note(svR(a)?'Replay saved.':'Could not save in this browser.');
    rpList()
};
$('ld').onclick=()=>{
    const r=ldR()[+$('rp').value];
    if(!r)return note('Nothing to watch yet.');
    begin({mode:'cc',script:r.moves.map(m=>({...m})),res:r.result,start:r.pos?mkS(r.pos.s,r.pos.t):null,names:r.names||null})
};
/* 3D pieces: every piece is a stack of thin discs (a lathe profile) standing on the tilted board */
const PR3={
    P:[[0,.30],[.05,.31],[.09,.27],[.14,.17],[.28,.12],[.32,.17],[.36,.17],[.40,.12],[.44,.19],[.52,.20],[.58,.17],[.62,.10],[.64,.02]],
    R:[[0,.32],[.06,.33],[.10,.27],[.18,.22],[.50,.19],[.54,.26],[.64,.26]],
    B:[[0,.32],[.06,.33],[.10,.27],[.18,.19],[.46,.13],[.50,.19],[.54,.14],[.60,.20],[.74,.20],[.80,.14],[.86,.06],[.88,.02]],
    Q:[[0,.34],[.06,.35],[.10,.29],[.18,.20],[.55,.15],[.60,.22],[.66,.19],[.72,.27],[.86,.30],[.90,.20],[.94,.04]],
    K:[[0,.34],[.06,.35],[.10,.29],[.18,.21],[.62,.16],[.66,.23],[.72,.20],[.78,.26],[.88,.28],[.92,.18],[.95,.10]]
};
/* knight slices: [height, half-length along the facing direction, half-width, forward offset] */
const KN3=[[0,.32,.32,0],[.05,.33,.33,0],[.09,.27,.27,0],[.15,.21,.21,0],[.2,.17,.15,0],[.3,.15,.14,0],[.4,.15,.13,.03],[.5,.16,.13,.06],[.58,.2,.13,.1],[.64,.26,.13,.13],[.69,.25,.12,.13],[.73,.18,.11,.08],[.77,.1,.09,0],[.8,.06,.06,-.04]];
function lathe(pts,st) {
    const o=[];
    for(let i=0;i<pts.length-1;i++) {
        const[a,ra]=pts[i],[b,rb]=pts[i+1],n=Math.max(1,Math.round((b-a)/st));
        for(let k=0;k<n;k++) {
            const t=k/n;
            o.push([a+(b-a)*t,ra+(rb-ra)*t])
        }
    }
    o.push(pts[pts.length-1]);
    return o.map(([z,r])=>[z,r,r,0])
}
function piece3d(p,flip,sq) {
    const w=p<'a',u=p.toUpperCase(),g=document.createElement('div'),kx=(sq&7)<4?1:-1,R=1.12;
    g.className='p3 '+(w?'w':'b');
    const add=(z,rx,ry,ox,cls)=>{
        rx*=R;
        ry*=R;
        const i=document.createElement('i');
        if(cls)i.className=cls;
        i.style.cssText='width:calc(var(--u)*'+(2*rx).toFixed(3)+');height:calc(var(--u)*'+(2*ry).toFixed(3)+');left:calc(var(--u)*'+(-rx).toFixed(3)+');top:calc(var(--u)*'+(-ry).toFixed(3)+');transform:translate3d(calc(var(--u)*'+(ox*R).toFixed(3)+'),0,calc(var(--u)*'+z.toFixed(3)+'))';
        g.appendChild(i)
    };
    add(.002,.5,.45,.04,'sd');
    if(u==='N')for(const[z,a,b,o]of KN3)add(z,a,b,o*kx);
    else {
        for(const[z,rx,ry]of lathe(PR3[u],.03))add(z,rx,ry,0);
        if(u==='R')add(.646,.15,.15,0,'in')
    }
    if(u==='K') {
        for(let z=.95;z<1.16;z+=.03)add(z,.035,.035,0);
        for(let z=1.02;z<1.09;z+=.03)add(z,.11,.035,0)
    }
    return g
}
/* piece styles and board themes */
let sty='c',thm='sage',vw='0';
const OUT={
    K:'♔',Q:'♕',R:'♖',B:'♗',N:'♘',P:'♙'
};
const glyph=p=>sty==='d'?'':(sty==='t'&&isW(p)?OUT:GL)[p.toUpperCase()]+'\uFE0E';
const TH={
    sage:['#ebdfc2','#7f9c8d'],walnut:['#f0d9b5','#b58863'],tournament:['#eeeed2','#769656'],ocean:['#dee3e6','#8ca2ad'],rose:['#f3dfe3','#c27b8f'],night:['#9aa5b1','#4b5563'],ice:['#e3f0fa','#7aa7c9'],lavender:['#ece6f5','#9a86c4'],coffee:['#e8d5bd','#8b5e3c'],forest:['#dfe8cf','#5d7f52'],sand:['#f4e8c8','#c9a46a'],crimson:['#f0dede','#a65a5a'],graphite:['#cfd2d6','#5c6168'],mint:['#e2f4ea','#6fb093'],gold:['#f7ecc6','#b89a4a'],marble:['#ecebe7','#9ea3a8']
};
function applyLook(sv) {
    const b=$('bd');
    b.style.setProperty('--lt',TH[thm][0]);
    b.style.setProperty('--dk',TH[thm][1]);
    document.body.className='ps-'+sty;
    $('ps').value=sty;
    $('bt').value=thm;
    $('vw').value=vw;
    {
        const w=b.parentNode;
        w.style.setProperty('--tilt',vw+'deg');
        w.classList.toggle('d3',+vw>0);
        b.classList.toggle('d3',+vw>0)
    }
    if(sv)try {
        localStorage.setItem('chess_look',sty+'|'+thm+'|'+vw)
    }catch(e) {
    }
    render()
}
$('ps').onchange=()=>{
    sty=$('ps').value;
    applyLook(1)
};
$('bt').onchange=()=>{
    thm=$('bt').value;
    applyLook(1)
};
$('vw').onchange=()=>{
    vw=$('vw').value;
    applyLook(1)
};
try {
    const l=(localStorage.getItem('chess_look')||'').split('|');
    if(['c','t','b','d'].includes(l[0]))sty=l[0];
    if(TH[l[1]])thm=l[1];
    if(['0','30','45','60'].includes(l[2]))vw=l[2]
}catch(e) {
}
/* human moves; a pawn reaching the last rank opens the promotion picker */
function tryMove(f,t) {
    const ms=legal(cur()).filter(m=>m.f===f&&m.t===t);
    if(!ms.length)return 0;
    G.sel=null;
    if(ms.length===1) {
        play(ms[0]);
        return 1
    }
    G.pend=1;
    render();
    const w=cur().t==='w',box=$('pr'),P={
        Q:'Queen',R:'Rook',B:'Bishop',N:'Knight'
    };
    box.innerHTML='<p>Promote pawn to</p>';
    const row=document.createElement('div');
    row.className='row';
    row.style.justifyContent='center';
    for(const k in P) {
        const b=document.createElement('button');
        b.title=P[k];
        b.setAttribute('aria-label',P[k]);
        b.textContent=sty==='d'?k:glyph(w?k:k.toLowerCase());
        b.className=w?'pw':'pk';
        b.style.background=TH[thm][1];
        b.onclick=()=>{
            G.pend=0;
            box.hidden=true;
            play(ms.find(m=>m.p===k))
        };
        row.appendChild(b)
    }
    const c=document.createElement('button');
    c.textContent='Cancel';
    c.className='cn';
    c.onclick=()=>{
        G.pend=0;
        box.hidden=true;
        render()
    };
    box.append(row,c);
    box.hidden=false;
    return 1
}
/* sound effects, synthesized with the Web Audio API (no audio files) */
let AC=null,muted=false,vol=.6;
document.addEventListener('pointerdown',()=>{if(!AC){try{AC=new(window.AudioContext||window.webkitAudioContext)()}catch(e){}}if(AC&&AC.state==='suspended')AC.resume()},true);
function snd(k) {
    if(muted||!AC||vol<=0||!k)return;
    const t=AC.currentTime;
    const o=(f,s,d,ty,g,f2)=>{
        const x=AC.createOscillator(),y=AC.createGain();
        x.type=ty;
        x.frequency.setValueAtTime(f,t+s);
        if(f2)x.frequency.exponentialRampToValueAtTime(f2,t+s+d);
        y.gain.setValueAtTime(.0001,t+s);
        y.gain.exponentialRampToValueAtTime(g*vol,t+s+.005);
        y.gain.exponentialRampToValueAtTime(.0001,t+s+d);
        x.connect(y).connect(AC.destination);
        x.start(t+s);
        x.stop(t+s+d+.02)
    };
    const n=(s,d,g,fq)=>{
        const L=Math.floor(AC.sampleRate*d),bf=AC.createBuffer(1,L,AC.sampleRate),a=bf.getChannelData(0);
        for(let i=0;i<L;i++)a[i]=(Math.random()*2-1)*(1-i/L);
        const x=AC.createBufferSource(),fl=AC.createBiquadFilter(),y=AC.createGain();
        x.buffer=bf;
        fl.type='bandpass';
        fl.frequency.value=fq;
        y.gain.value=g*vol;
        x.connect(fl).connect(y).connect(AC.destination);
        x.start(t+s)
    };
    switch(k) {
        case'move':o(200,0,.09,'sine',.9,90);
        n(0,.05,.5,1800);
        break;
        case'cap':o(160,0,.12,'sine',1,60);
        n(0,.09,.9,1200);
        o(320,0,.06,'triangle',.4,120);
        break;
        case'castle':o(200,0,.08,'sine',.8,90);
        n(0,.04,.4,1800);
        o(170,.14,.09,'sine',.8,80);
        n(.14,.05,.4,1600);
        break;
        case'check':o(200,0,.08,'sine',.7,90);
        o(880,.08,.12,'triangle',.5);
        o(1175,.18,.2,'triangle',.5);
        break;
        case'promo':[523,659,784,1047].forEach((f,i)=>o(f,i*.07,.16,'triangle',.5));
        break;
        case'mate':[440,370,311,220].forEach((f,i)=>o(f,i*.16,.4,'triangle',.5));
        break;
        case'draw':o(392,0,.25,'sine',.5);
        o(392,.28,.35,'sine',.5);
        break;
        case'start':o(523,0,.12,'triangle',.4);
        o(784,.12,.2,'triangle',.4);
        break;
        case'tick':o(1000,0,.05,'square',.15);
        break;
        case'illegal':o(130,0,.18,'square',.2,100);
        break;
        case'select':o(900,0,.03,'sine',.2);
        break
    }
}
const sndSave=()=>{
    try {
        localStorage.setItem('chess_snd',(muted?1:0)+'|'+vol)
    }catch(e) {
    }
};
function sndUI() {
    $('mu').textContent=muted?'Unmute':'Mute';
    $('mu').setAttribute('aria-pressed',String(muted))
}
function sndLoad() {
    try {
        const l=(localStorage.getItem('chess_snd')||'').split('|');
        if(l[0]==='1')muted=true;
        if(l[1]&&!isNaN(+l[1]))vol=Math.min(1,Math.max(0,+l[1]))
    }catch(e) {
    }
    $('vol').value=vol*100;
    sndUI()
}
$('mu').onclick=()=>{
    muted=!muted;
    sndSave();
    sndUI();
    snd('select')
};
$('vol').oninput=()=>{
    vol=$('vol').value/100;
    sndSave()
};
$('vol').onchange=()=>snd('move');
/* PGN upload: reads games of pro players and replays them */
let PG=[];
function nm(c) {
    return G&&G.names?G.names[c]:c==='w'?'White':'Black'
}
function fenS(f) {
    const p=f.split(' '),s=p[0].replace(/\d/g,d=>'.'.repeat(+d)).replace(/\//g,'');if(s.length!==64)return null;
    const S=mkS(s,p[1]==='b'?'b':'w');S.c=p[2]&&p[2]!=='-'?p[2]:'';S.ep=p[3]&&p[3]!=='-'?(8-p[3][1])*8+'abcdefgh'.indexOf(p[3][0]):-1;return S}
    function pgnParse(txt){const out=[];
    for(const ch of txt.replace(/\r/g,'').split(/^(?=\[Event\s)/m)){const tg={};for(const m of ch.matchAll(/\[(\w+)\s+"([^"]*)"\]/g))tg[m[1]]=m[2];
  let b=ch.replace(/^\[.*\]\s*$/mg,'').replace(/\{[^}]*\}/g,' ').replace(/;[^\n]*/g,' ');
  while(/\([^()]*\)/.test(b))b=b.replace(/\([^()]*\)/g,' ');
  const tk=b.replace(/\$\d+/g,' ').replace(/\d+\.+/g,' ').split(/\s+/).filter(t=>t&&!/^(1-0|0-1|1\/2-1\/2|\*)$/.test(t));
  if(!tk.length)continue;
  out.push({w:tg.White||'?',b:tg.Black||'?',name:(tg.White||'?')+' vs '+(tg.Black||'?')+(tg.Event&&tg.Event!=='?'?', '+tg.Event:'')+(tg.Date&&/^\d{4}/.test(tg.Date)?' '+tg.Date.slice(0,4):''),res:tg.Result||'',tk,fen:tg.FEN})}
 return out}
function san2m(S,t){t=t.replace(/[+#!?]+$/,'').replace(/0/g,'O');const ms=legal(S);
 if(/^O-O(-O)?$/.test(t)){const q=t==='O-O-O';return ms.find(m=>S.b[m.f].toUpperCase()==='K'&&Math.abs(m.t-m.f)===2&&(m.t>m.f)===!q)}
 const r=/^([NBRQK])?([a-h])?([1-8])?x?([a-h][1-8])(?:=?([NBRQ]))?$/.exec(t);if(!r)return null;
 const pc=r[1]||'P',to=(8-r[4][1])*8+'abcdefgh'.indexOf(r[4][0]);
 return ms.find(m=>m.t===to&&S.b[m.f].toUpperCase()===pc&&(!r[2]||'abcdefgh'[m.f&7]===r[2])&&(!r[3]||8-(m.f>>3)==r[3])
  &&(pc!=='P'||r[2]||(m.f&7)===(to&7))&&(m.p?m.p===r[5]:!r[5]))||null}
$('pgn').onchange=async e=>{const f=e.target.files[0];if(!f)return;if(f.size>8e6)return note('File is too large (8 MB max).');
 let txt;try{txt=await f.text()}catch(x){return note('Could not read that file.')}
 PG=pgnParse(txt).slice(0,500);const s=$('pg');s.innerHTML='';
 if(!PG.length){s.innerHTML='<option disabled selected>No games found</option>';return note('No games found in that file.')}
 PG.forEach((g,i)=>{const o=document.createElement('option');o.value=i;o.textContent=g.name+(g.res?' ['+g.res+']':'');s.appendChild(o)});
 note('Loaded '+PG.length+' game'+(PG.length>1?'s':'')+'. Pick one and press Watch.');e.target.value=''};
$('fw').onclick=()=>{if(!G||!G.script||!G.script.length)return;epoch++;G.paused=true;G.hold=false;play(G.script.shift());
 if(!G.over&&!G.script.length)end('Replay finished: '+(G.res||''));ui();render()};
$('wp').onclick=()=>{const g=PG[+$('pg').value];if(!g)return note('Upload a PGN file first.');
 let S=g.fen?fenS(g.fen):mkS(STD,'w');if(!S)return note('This game has an unreadable starting position.');
 const start=S,mv=[];let bad='';
 for(const t of g.tk){const m=san2m(S,t);if(!m){bad=t;break}mv.push(m);S=make(S,m)}
 if(!mv.length)return note('Could not read any moves from this game.');
 begin({mode:'cc',script:mv,res:g.name+' '+g.res,start,names:{w:g.w,b:g.b}});
 if(bad)note('Stopped at "'+bad+'": not a legal move in this position.')};

/* opening demonstrations: each line is played back with the replay controls (speed, stop, back, forward) */
const OPN=[
['Open games (1.e4 e5)',[
 ['C60','Ruy Lopez, Closed','e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O Be7 Re1 b5 Bb3 d6 c3 O-O h3','White pressures the c6 knight to undermine e5, then builds a big centre with c3 and d4.'],
 ['C50','Italian Game, Giuoco Piano','e4 e5 Nf3 Nc6 Bc4 Bc5 c3 Nf6 d3 d6 O-O O-O','A slow, classical fight for the centre; both sides develop and prepare the d4 or d5 break.'],
 ['C57','Fried Liver Attack','e4 e5 Nf3 Nc6 Bc4 Nf6 Ng5 d5 exd5 Nxd5 Nxf7 Kxf7 Qf3+ Ke6 Nc3 Ncb4 a3','White sacrifices a knight to drag the black king into the open, in a famous king hunt.'],
 ['C44','Scotch Game','e4 e5 Nf3 Nc6 d4 exd4 Nxd4 Nf6 Nxc6 bxc6 e5 Qe7 Qe2 Nd5 c4 Ba6','White opens the centre at once and gains space and quick development.'],
 ['C42','Petrov Defence','e4 e5 Nf3 Nf6 Nxe5 d6 Nf3 Nxe4 d4 d5 Bd3 Nc6 O-O Be7 c4 Nb4 Be2 O-O Nc3 Bf5','Black mirrors White and counterattacks e4; a solid, drawish reputation at the top level.'],
 ['C30','King\'s Gambit Accepted','e4 e5 f4 exf4 Nf3 g5 h4 g4 Ne5 Nf6 Bc4 d5 exd5 Bd6 d4 Nh5','A romantic gambit: White gives a pawn for rapid development and open lines.'],
 ['C51','Evans Gambit','e4 e5 Nf3 Nc6 Bc4 Bc5 b4 Bxb4 c3 Ba5 d4 exd4 O-O d6 cxd4 Bb6 Nc3','A pawn offered for a powerful pawn centre and an initiative against Black.'],
 ['C26','Vienna Game','e4 e5 Nc3 Nf6 f4 d5 fxe5 Nxe4 Nf3 Be7 d4 O-O Bd3 f5 exf6 Bxf6','White prepares f4 and keeps options open; a sharp line features en passant on f6.']]],
['Semi-open games (1.e4 other)',[
 ['B90','Sicilian Defence, Najdorf (English Attack)','e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6 Be3 e5 Nb3 Be6 f3 Be7 Qd2 O-O O-O-O Nbd7 g4 b5','Black fights for the centre from the flank; White attacks the kingside while Black counters on the queenside.'],
 ['B76','Sicilian Dragon (Yugoslav Attack)','e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 g6 Be3 Bg7 f3 O-O Qd2 Nc6 Bc4 Bd7 O-O-O Rc8 Bb3 Ne5','Opposite-side castling: White storms the kingside, Black attacks along the c-file and long diagonal.'],
 ['B33','Sicilian Defence, Sveshnikov','e4 c5 Nf3 Nc6 d4 cxd4 Nxd4 Nf6 Nc3 e5 Ndb5 d6 Bg5 a6 Na3 b5 Nd5','Black accepts a hole on d5 and a backward d-pawn in return for active pieces.'],
 ['C11','French Defence, Winawer','e4 e6 d4 d5 Nc3 Bb4 e5 c5 a3 Bxc3+ bxc3 Ne7 Qg4 Qc7 Qxg7 Rg8 Qxh7 cxd4 Ne2 Nbc6 f4 Bd7','Black gives up the bishop pair; both sides grab pawns in a sharp fight over the dark squares.'],
 ['C02','French Defence, Advance Variation','e4 e6 d4 d5 e5 c5 c3 Nc6 Nf3 Qb6 a3 c4 Nbd2 Na5','White gains space; Black attacks the d4 pawn and aims for ...f6 or queenside play.'],
 ['B18','Caro-Kann, Classical','e4 c6 d4 d5 Nc3 dxe4 Nxe4 Bf5 Ng3 Bg6 h4 h6 Nf3 Nd7 h5 Bh7 Bd3 Bxd3 Qxd3 e6','A solid defence: Black develops the light bishop outside the pawn chain before playing ...e6.'],
 ['B01','Scandinavian Defence','e4 d5 exd5 Qxd5 Nc3 Qa5 d4 Nf6 Nf3 c6 Bc4 Bf5 Bd2 e6','Black strikes at e4 immediately and accepts an early queen move for a simple structure.'],
 ['B07','Pirc Defence (Austrian Attack)','e4 d6 d4 Nf6 Nc3 g6 f4 Bg7 Nf3 O-O Bd3 Na6 O-O c5','Black lets White build a big centre and then attacks it from the sides.'],
 ['B03','Alekhine\'s Defence','e4 Nf6 e5 Nd5 d4 d6 Nf3 Bg4 Be2 e6 O-O Be7 c4 Nb6 Nc3 O-O','Black invites White to overextend the pawns and plans to undermine them.']]],
['Closed games (1.d4 d5)',[
 ['D37','Queen\'s Gambit Declined','d4 d5 c4 e6 Nc3 Nf6 Bg5 Be7 e3 O-O Nf3 h6 Bh4 b6','Black holds the d5 pawn firmly; a classic, strategic opening.'],
 ['D20','Queen\'s Gambit Accepted','d4 d5 c4 dxc4 Nf3 Nf6 e3 e6 Bxc4 c5 O-O a6 Qe2 b5 Bb3 Bb7','Black takes the pawn, then gives it back to free the position and challenge the centre.'],
 ['D17','Slav Defence','d4 d5 c4 c6 Nf3 Nf6 Nc3 dxc4 a4 Bf5 e3 e6 Bxc4 Bb4 O-O Nbd7','Black supports d5 with ...c6 so the light bishop can develop before ...e6.'],
 ['D02','London System','d4 d5 Bf4 Nf6 e3 c5 c3 Nc6 Nd2 e6 Ngf3 Bd6 Bg3 O-O','A flexible setup White can play against almost anything: bishop out early, then solid pawns.'],
 ['E04','Catalan Opening','d4 Nf6 c4 e6 g3 d5 Bg2 Be7 Nf3 O-O O-O dxc4 Qc2 a6 Qxc4 b5 Qc2 Bb7','White\'s fianchettoed bishop pressures the long diagonal and the queenside.'],
 ['A80','Dutch Defence, Stonewall','d4 f5 g3 Nf6 Bg2 e6 Nf3 d5 O-O Bd6 c4 c6 b3 Qe7','Black builds a pawn wall on e6, d5, c6 and f5 and fights for control of e4.']]],
['Indian defences (1.d4 Nf6)',[
 ['E60','King\'s Indian Defence','d4 Nf6 c4 g6 Nc3 Bg7 e4 d6 Nf3 O-O Be2 e5 O-O Nc6 d5 Ne7','Black lets White take the centre, then attacks it, usually with a kingside pawn storm.'],
 ['E32','Nimzo-Indian Defence','d4 Nf6 c4 e6 Nc3 Bb4 e3 O-O Bd3 d5 Nf3 c5 O-O Nc6 a3 Bxc3 bxc3 dxc4 Bxc4 Qc7','Black pins the knight and fights for e4 rather than occupying the centre.'],
 ['D85','Grunfeld Defence','d4 Nf6 c4 g6 Nc3 d5 cxd5 Nxd5 e4 Nxc3 bxc3 Bg7 Nf3 c5 Be3 Qa5 Qd2 O-O Rc1','White builds a big pawn centre; Black hits it with pieces and the g7 bishop.']]],
['Flank openings',[
 ['A20','English Opening','c4 e5 Nc3 Nf6 Nf3 Nc6 g3 d5 cxd5 Nxd5 Bg2 Nb6 O-O Be7','White controls d5 from the flank; this can look like a Sicilian with colours reversed.'],
 ['A09','Reti Opening','Nf3 d5 g3 Nf6 Bg2 e6 O-O Be7 d3 O-O Nbd2 c5 e4 Nc6','A hypermodern idea: White fianchettos and strikes at the centre later with e4 or c4.']]]
];
const OL=[];
function odBuild(){const s=$('od');OPN.forEach(([g,list])=>{const og=document.createElement('optgroup');og.label=g;
 list.forEach(([eco,n,m,d])=>{const o=document.createElement('option');o.value=OL.length;o.textContent=eco+'  '+n;OL.push({e:eco,n,m,d});og.appendChild(o)});s.appendChild(og)})}
odBuild();
$('odw').onclick=()=>{const o=OL[+$('od').value];if(!o)return;let S=mkS(STD,'w');const mv=[];
 for(const t of o.m.split(' ')){const m=san2m(S,t);if(!m)break;mv.push(m);S=make(S,m)}
 begin({mode:'cc',script:mv,res:o.n,start:mkS(STD,'w')});$('odd').textContent=o.e+' \u00b7 '+o.n+': '+o.d};
$('odp').onclick=()=>{if(!G||!G.script)return note('Start an opening demonstration first.');const S=cur();
 begin({mode:'hc',hu:S.t,lv:+$('lv').value,tm:null,start:S})};

/* blank board editor and saved custom boards */
let ED=false;const E={b:Array(64).fill(''),t:'w',tool:'P'};
const ldB=()=>{try{return JSON.parse(localStorage.getItem('chess_boards')||'[]')}catch(e){return[]}};
const svB=a=>{try{localStorage.setItem('chess_boards',JSON.stringify(a));return 1}catch(e){return 0}};
function posList(sel){const s=$('pos');s.innerHTML='<option value="std">Standard</option>';
 ldB().forEach((r,i)=>{const o=document.createElement('option');o.value=i;o.textContent=r.name;s.appendChild(o)});s.value=sel==null?'std':String(sel)}
function palette(){const el=$('pal');el.innerHTML='';
 for(const ch of 'KQRBNPkqrbnpx'){const b=document.createElement('button'),x=ch==='x',w=ch<'a';
  b.textContent=x?'✕':sty==='d'?ch.toUpperCase():glyph(ch);
  b.title=x?'Erase':(w?'White ':'Black ')+{K:'king',Q:'queen',R:'rook',B:'bishop',N:'knight',P:'pawn'}[ch.toUpperCase()];
  b.className=(x?'':w?'pw ':'pk ')+(E.tool===ch?'on':'');b.style.background=TH[thm][1];
  b.onclick=()=>{E.tool=ch;palette()};el.appendChild(b)}}
$('bd').addEventListener('pointerdown',e=>{if(!ED)return;const q=e.target.closest('.sq');if(!q)return;e.preventDefault();
 const s=+q.dataset.s;E.b[s]=E.tool==='x'||E.b[s]===E.tool?'':E.tool;render()});
$('etm').onchange=()=>{E.t=$('etm').value};
$('ecl').onclick=()=>{E.b.fill('');render()};
$('est').onclick=()=>{E.b.splice(0,64,...mkS(STD,'w').b);render()};
$('edn').onclick=()=>{$('mode').value='hc';reset()};
$('esv').onclick=()=>{const b=E.b;
 if(b.filter(p=>p==='K').length!==1||b.filter(p=>p==='k').length!==1)return note('Place exactly one white king and one black king.');
 if(b.some((p,i)=>(p==='P'||p==='p')&&(i<8||i>55)))return note('Pawns cannot stand on the first or last rank.');
 const str=b.map(p=>p||'.').join(''),S=mkS(str,E.t);
 if(att(S.b,kingSq(S,E.t==='w'?'b':'w'),E.t==='w'))return note('The side that is not to move cannot be in check.');
 const a=ldB(),nm=($('enm').value.trim()||'Custom board '+(a.length+1)).slice(0,40);
 a.unshift({name:nm,s:str,t:E.t});if(a.length>30)a.length=30;
 if(!svB(a))return note('Could not save in this browser.');
 posList(0);note('Saved. Press Done, pick a game mode, then Start.')};
$('pos').onchange=reset;
$('dpos').onclick=()=>{const v=$('pos').value,a=ldB();if(v==='std')return note('Select a custom board to delete.');a.splice(+v,1);svB(a);posList();reset()};
/* click-to-move and drag-and-drop */
let dr=null;
const dmove=e=>{if(dr){dr.g.style.left=e.clientX+'px';dr.g.style.top=e.clientY+'px'}};
$('bd').addEventListener('pointerdown',e=>{const q=e.target.closest('.sq');if(!q||!G||!G.on||G.over||G.paused||G.pend||isComp(cur().t))return;e.preventDefault();
 const s=+q.dataset.s,S=cur(),p=S.b[s];
 if(G.sel!=null&&G.sel!==s&&tryMove(G.sel,s))return;
 if(p&&isW(p)===(S.t==='w')){G.sel=s;snd('select');render();const src=$('bd').querySelector('[data-s="'+s+'"]');src.classList.add('drag');
  const g=document.createElement('div');g.className='ghost '+(isW(p)?'wp':'bp');g.textContent=glyph(p);g.dataset.p=p.toUpperCase();
  g.style.fontSize=src.getBoundingClientRect().width*.85+'px';document.body.appendChild(g);dr={s,g};dmove(e)}
 else{G.sel=null;render()}});
document.addEventListener('pointermove',dmove);
document.addEventListener('pointerup',e=>{if(!dr)return;const{s,g}=dr;dr=null;g.remove();
 const t=document.elementFromPoint(e.clientX,e.clientY),q=t&&t.closest&&t.closest('.sq');
 if(q&&G){const to=+q.dataset.s;if(tryMove(s,to))return;if(to!==s){G.sel=null;snd('illegal')}}
 render()});
document.addEventListener('pointercancel',()=>{if(dr){dr.g.remove();dr=null;render()}});
rpList();posList();sndLoad();infSync();ui();applyLook();
