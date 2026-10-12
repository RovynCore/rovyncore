// Supply cost health: whole population of random full teams, each going to its deepest reachable destination.
const SP=[40,70,110,160,230],PR=[10,20,32,48,70],SLO=[20,32,48,75,120],SHI=[30,45,68,100,160];
const ODD=[0.48,0.29,0.15,0.07,0.01],ODD2=[0.5,0.28,0.15,0.06,0.01];
const pick=(o)=>{let x=Math.random();for(let i=0;i<5;i++){if((x-=o[i])<0)return i;}return 4;};
const lf=(b)=>Math.floor(b*(90+Math.floor(Math.random()*21))/100);
const sk=()=>{const r=pick(ODD2);return SLO[r]+Math.floor(Math.random()*(SHI[r]-SLO[r]+1));};
const team=()=>{const sr=pick(ODD);const s=lf(SP[sr]),p=lf(PR[pick(ODD2)]);let t=s+p;for(let i=0;i<=sr;i++)t+=sk();return t;};
const TH=[50,80,110,150,200,250,300,400,480,550,700,850],CO=[1,1.03,1.06,1.12,1.16,1.2,1.3,1.36,1.42,1.55,1.62,1.7],FU=[0,.02,.04,.06,.08,.10,.12,.14,.16,.18,.20,.22];
let B=0,F=0;const cnt=Array(12).fill(0);
for(let i=0;i<300000;i++){const L=team();let d=0;for(let k=0;k<12;k++)if(L>=TH[k])d=k;cnt[d]++;const b=L*CO[d];B+=b;F+=b*FU[d];}
console.log("supply as share of all rewards (everyone goes deepest):",(100*F/B).toFixed(1)+"%");
console.log("share of dives per destination:",cnt.map((c,k)=>"①②③④"[Math.floor(k/3)]+"ABC"[k%3]+" "+(100*c/300000).toFixed(1)+"%").join("  "));
// Pool view: daily emission E = 1% of pool. Supply returned to the pool = 80% of F share of E; burned = 20%.
console.log("per 10,000 RVYN emitted: supply paid",(1e4*F/B).toFixed(0),"-> back to pool",(0.8*1e4*F/B).toFixed(0),", burned",(0.2*1e4*F/B).toFixed(0));
