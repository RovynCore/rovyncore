// Team luminance ranges from the Lightdive v1.0 mint tables (LightdiveMinter.sol).
const SP=[40,70,110,160,230], PR=[10,20,32,48,70], SLO=[20,32,48,75,120], SHI=[30,45,68,100,160];
const ODD=[0.48,0.29,0.15,0.07,0.01], ODD2=[0.5,0.28,0.15,0.06,0.01];
const pick=(o)=>{let x=Math.random();for(let i=0;i<5;i++){if((x-=o[i])<0)return i;}return 4;};
const lumFixed=(b)=>Math.floor(b*(90+Math.floor(Math.random()*21))/100);
const seeker=()=>{const r=pick(ODD2);return SLO[r]+Math.floor(Math.random()*(SHI[r]-SLO[r]+1));};
const team=(sr,prism=true,n)=>{const s=lumFixed(SP[sr]);const seats=sr+1;n=n??seats;const p=prism?lumFixed(PR[pick(ODD2)]):0;let t=Math.floor((s+p)*n/seats);for(let i=0;i<n;i++)t+=seeker();return t;};
const pct=(a,q)=>a[Math.floor(q*(a.length-1))];
const names=["Glimmer","Vein","Clear","Spectral","Radiant"];
console.log("Full team, random prism & seekers (deck odds), 200k samples per spire rarity");
for(let r=0;r<5;r++){const a=[];for(let i=0;i<200000;i++)a.push(team(r));a.sort((x,y)=>x-y);
 console.log(names[r].padEnd(9),"min",a[0],"p10",pct(a,.1),"p50",pct(a,.5),"p90",pct(a,.9),"p99",pct(a,.99),"max",a.at(-1));}
// theoretical bounds
const minTeam=Math.min(...[0,1,2,3,4].map(r=>Math.floor(SP[r]*0.9*1/(r+1))+20));
const maxTeam=Math.floor(Math.floor(230*1.1)*1.04)+Math.floor(Math.floor(70*1.1)*1.04)+5*160;
console.log("theoretical min (1 seeker, no prism):",minTeam,"theoretical max:",maxTeam);
// whole population: spire drawn by odds, full team
const all=[];for(let i=0;i<500000;i++)all.push(team(pick(ODD)));all.sort((x,y)=>x-y);
console.log("ALL full teams p5..p99.9:",[.05,.25,.5,.75,.9,.97,.99,.999].map(q=>q+":"+pct(all,q)).join(" "));
// "Curated" player: owns 20 seekers + 3 prisms of each draw and fields the best ones on a spire of given rarity
const curated=(sr)=>{const s=lumFixed(SP[sr]);const seats=sr+1;const ps=[0,1,2].map(()=>lumFixed(PR[pick(ODD2)]));const p=Math.max(...ps);const sk=Array.from({length:20},seeker).sort((a,b)=>b-a).slice(0,seats);return s+p+sk.reduce((a,b)=>a+b,0);};
console.log("Curated (best of 20 seekers, 3 prisms):");
for(let r=0;r<5;r++){const a=[];for(let i=0;i<50000;i++)a.push(curated(r));a.sort((x,y)=>x-y);console.log(names[r].padEnd(9),"p10",pct(a,.1),"p50",pct(a,.5),"p90",pct(a,.9),"max",a.at(-1));}
const th=[50,80,110,150,200,250,300,370,440,500,650,850];
console.log("share of random full teams reaching:",th.map(t=>t+":"+(100*all.filter(x=>x>=t).length/all.length).toFixed(1)+"%").join(" "));
