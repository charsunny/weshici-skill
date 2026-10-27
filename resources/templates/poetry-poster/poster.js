import {mulberry32} from '/resources/core/weishi-video-core.js';
import {huapingInvitation,huapingCalendar} from '/resources/core/huaping-footer.js';
import {posterPalettes} from '/resources/core/poetry-poster.js';
import {createDrawing} from './drawing.js';
const card=window.POSTER;
if(!card)throw new Error('请通过 generate.mjs poster 载入海报内容');
const cover=card.layout==='cover',has=motif=>card.motifs.includes(motif);
const c=document.getElementById('art'),g=c.getContext('2d'),W=1080,H=1440;
const rand=mulberry32(card.seed),r=(a,b)=>a+(b-a)*rand();
const {path,mountain,circle,birds,pine,boat,water,grain}=createDrawing(g,rand);
const s=posterPalettes[card.palette];
const sky=g.createLinearGradient(0,0,0,H);sky.addColorStop(0,s.sky[0]);sky.addColorStop(1,s.sky[1]);g.fillStyle=sky;g.fillRect(0,0,W,H);
if(has('sun')||has('moon')){const highMoon=has('moon')&&card.layout==='vertical';circle(highMoon?817:856,highMoon?393:794,highMoon?139:164,s.sun);}
const shift=has('moon')?80:Math.round(r(-30,40));
mountain([[-20,960+shift],[130,805+shift],[265,851+shift],[403,748+shift],[540,889+shift],[658,830+shift],[814,964+shift],[956,839+shift],[1100,904+shift]],s.back,s.river,'#c9c5a2',180);
const nearRidge=mountain([[-30,960],[70,865],[180,962],[320,914],[430,1043],[560,1054],[730,1124],[1100,1143]],s.mid,s.front,'#bdc3a2',180);
// A broad, curving river opens a path through the darker banks.
g.fillStyle=s.river;g.beginPath();g.moveTo(826,962);g.bezierCurveTo(669,1057,941,1102,687,1210);g.bezierCurveTo(610,1280,725,1395,767,1440);g.lineTo(1080,1440);g.lineTo(1080,976);g.closePath();g.fill();water(990,'#eee2c2',185);
mountain([[-20,1117],[75,1057],[178,1128],[269,1137],[390,1269],[500,1440]],s.front,s.front,'#9aaf87',110);
mountain([[930,1440],[975,1252],[1060,1178],[1100,1190]],s.front,s.front,'#a4b08a',90);
function reeds(cx,base,count,height,stem,fluff){
 for(let i=0;i<count;i++){
  const x=cx+r(-95,95),y=base+r(-12,24),h=height*r(.65,1.15),lean=r(22,110),tx=x+lean,ty=y-h;
  g.strokeStyle=stem;g.lineWidth=r(1,2.2);g.beginPath();g.moveTo(x,y);g.bezierCurveTo(x+lean*.1,y-h*.25,tx-12,ty+h*.3,tx,ty);g.stroke();
  for(let j=0;j<3;j++){const yy=y-h*(.16+j*.19),xx=x+lean*(.14+j*.18);g.fillStyle=stem;g.beginPath();g.moveTo(xx,yy);g.quadraticCurveTo(xx+r(25,75),yy-r(40,80),xx+r(85,135),yy-r(15,55));g.quadraticCurveTo(xx+42,yy-18,xx,yy+6);g.fill();}
  const len=r(62,125),bend=r(12,42),width=r(10,22);g.strokeStyle=fluff;
  for(let j=0;j<75;j++){const t=j/75,yy=ty-t*len,xx=tx+t*t*bend,spread=Math.sin(Math.PI*t)*width;g.globalAlpha=r(.4,.9);g.lineWidth=r(.5,1.25);g.beginPath();g.moveTo(xx,yy);g.quadraticCurveTo(xx-spread*.5,yy-5,xx-spread-r(0,5),yy-r(4,18));g.moveTo(xx,yy);g.quadraticCurveTo(xx+spread*.5,yy-5,xx+spread+r(0,5),yy-r(3,18));g.stroke();}g.globalAlpha=1;
 }
}
function maple(cx,cy,scale){
 g.save();g.translate(cx,cy);g.scale(scale,scale);g.strokeStyle='#4b3b2c';g.lineWidth=8;g.beginPath();g.moveTo(-20,160);g.bezierCurveTo(0,100,-18,35,10,-50);g.stroke();
 for(let b=0;b<8;b++){const bx=r(-100,100),by=r(-85,35);g.lineWidth=2;g.beginPath();g.moveTo(-4,90);g.quadraticCurveTo(bx*.4,by+20,bx,by);g.stroke();for(let j=0;j<85;j++){let x=bx+r(-45,45),y=by+r(-25,25),rr=r(3,8);g.fillStyle=['#a44024','#b9562b','#ca7440','#8d3827'][j%4];g.globalAlpha=r(.45,.9);g.beginPath();for(let k=0;k<10;k++){const a=k*Math.PI/5,rad=k%2?rr*.36:rr;const xx=x+Math.cos(a)*rad,yy=y+Math.sin(a)*rad;k?g.lineTo(xx,yy):g.moveTo(xx,yy);}g.fill();}}g.restore();
}
function cottage(x,y){g.save();g.translate(x,y);g.fillStyle='#d3c49c';g.fillRect(-70,-53,132,62);g.fillStyle='#46523d';g.beginPath();g.moveTo(-98,-45);g.lineTo(-8,-109);g.lineTo(88,-45);g.closePath();g.fill();g.strokeStyle='#a6a37d';g.lineWidth=1;for(let i=0;i<16;i++){g.beginPath();g.moveTo(-8,-105);g.lineTo(-85+i*10,-47);g.stroke();}g.fillStyle='#4b5840';g.fillRect(-6,-26,22,35);g.fillRect(-50,-26,24,19);g.fillRect(35,-26,19,19);g.restore();}
function heron(x,y){g.save();g.translate(x,y);g.strokeStyle='#e8e4cd';g.lineWidth=2;g.beginPath();g.moveTo(3,5);g.lineTo(4,30);g.moveTo(12,6);g.lineTo(15,29);g.stroke();g.fillStyle='#ece9d4';g.beginPath();g.ellipse(3,0,18,8,-.2,0,Math.PI*2);g.fill();g.lineWidth=5;g.beginPath();g.moveTo(13,-1);g.bezierCurveTo(27,-5,12,-18,24,-25);g.stroke();g.strokeStyle='#c29b55';g.lineWidth=2;g.beginPath();g.moveTo(24,-25);g.lineTo(40,-23);g.stroke();g.restore();}
if(has('fortress')){g.save();g.fillStyle='#4c5b44';const wall=nearRidge.filter(([x])=>x>=410&&x<=685);path([...wall,...[...wall].reverse().map(([x,y])=>[x,y-27])]);g.closePath();g.fill();wall.forEach(([x,y],i)=>{if(i%10<5)g.fillRect(x,y-34,2,9);});g.restore();}
if(has('cottage')) cottage(286,1094);
if(has('pine')){pine(113,1115,.68,s.front);pine(1002,1215,.65,s.front);}
if(has('maple')){maple(70,1070,1.1);maple(1055,1140,.75);}
if(has('boat')) boat(749,1165,.75,s.front,false);
if(has('moon')){g.save();g.strokeStyle='#eadcb7';for(let i=0;i<70;i++){const y=r(1000,1270),w=(y-980)*.2;g.globalAlpha=r(.1,.4);g.beginPath();g.moveTo(851-r(1,w),y);g.lineTo(851+r(1,w),y);g.stroke();}g.restore();}
if(has('reeds')){
 reeds(97,1340,cover?25:18,cover?460:310,s.front,'#eaddb9');
 reeds(1003,1395,cover?28:22,cover?655:460,s.front,'#e6ddbd');
}
if(has('heron'))heron(925,1181);
birds(777,887+shift*.3,4,has('moon')?'#c3c7b6':'#7b6b4d');
// The footer stays legible over a quiet, dark strip of the foreground.
const shade=g.createLinearGradient(0,1255,0,1440);shade.addColorStop(0,'rgba(15,42,37,0)');shade.addColorStop(1,'rgba(15,42,37,.82)');g.fillStyle=shade;g.fillRect(0,1255,W,185);grain();
const stage=document.getElementById('stage');
const longest=Math.max(...card.lines.map(line=>Array.from(line).length));
stage.className=card.layout==='horizontal'?(longest>=7?'long':'plain'):card.layout;
stage.style.setProperty('--ink',s.ink);stage.style.setProperty('--accent',s.accent);
const qr=qrcode(0,'M');const url=cover?'https://www.weshici.com':huapingInvitation(card.title,card.author);qr.addData(url);qr.make();
const cal=huapingCalendar(card.date);
const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const source=cover?card.theme:card.title+'　／　'+card.author;
const number=cover?card.date.replaceAll('-','.'):`${String(card.index).padStart(2,'0')} / ${String(card.total).padStart(2,'0')}`;
document.getElementById('type').innerHTML=`<div class="kicker"><span>微诗 · ${escape(card.theme)}</span><span class="num">${number}</span></div><div class="rule"></div><h1>${card.lines.map(line=>`<span>${escape(line)}</span>`).join('')}</h1><div class="context">${escape(card.subtitle).replaceAll('\n','<br>')}</div><div class="source"><span>${escape(source)}</span><span class="seal">微詩</span></div><div class="footer"><div class="brand">微诗</div><div class="qr">${qr.createSvgTag({cellSize:2,margin:0})}</div><div class="calendar">${cal.dateText}<br>${cal.tag}</div><div class="series">${escape(card.caption||card.theme)}</div></div>`;
const heading=document.querySelector('h1');
if(card.layout==='horizontal')heading.style.fontSize=`${Math.min(126,840/longest-3)}px`;
if(card.layout==='vertical')heading.style.fontSize=`${Math.min(99,775/longest-9)}px`;
if(card.layout==='cover')heading.style.fontSize=`${Math.min(238,850/longest-18)}px`;
if(card.layout==='hero')document.querySelectorAll('h1 span').forEach(el=>el.style.fontSize=`${Math.min(174,840/Array.from(el.textContent).length-3)}px`);
document.querySelector('.source').style.fontSize=`${Math.min(25,810/Array.from(source).length-3)}px`;
await document.fonts.ready;
window.poster={...card,source:url};window.READY=true;window.render=()=>{};window.DUR=1;
