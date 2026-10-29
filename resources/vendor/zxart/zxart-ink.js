/* Deterministic raster ink study: bristle contact for dry marks, paper-guided diffusion for washes.
 * Optical density is accumulated before converting to alpha. This is a visual approximation,
 * not a fluid solver. Production brush and wet-ink primitives share the same paper relief.
 */
(function (global) {
  'use strict';
  function random(seed, index) {
    return ZXArtCompose.Brush.random(seed >>> 0, index >>> 0);
  }
  function paperHeight(x,y,seed) {
    const noise=ZXArtCompose.WashNoise;
    return .65*noise.value(x*2.1+y*.37,y*2.1-x*.37,seed^0xA511E9B3)+.35*noise.value(x*.31,y*2.8,seed^0x63D83595);
  }
  function draw(ctx, layer, drawing, pw, ph, scale, ox, oy, drawShapes) {
    var spec=layer.ink, strokes=layer.brushStrokes||[], shapes=layer.shapes||[];
    var x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;
    function bound(x,y,r) {x0=Math.min(x0,x-r);y0=Math.min(y0,y-r);x1=Math.max(x1,x+r);y1=Math.max(y1,y+r);}
    strokes.forEach(function(stroke){stroke.path.forEach(function(p){bound(p.x,p.y,stroke.width);});});
    shapes.forEach(function(shape){for(var i=0;i<shape.points.length;i+=2)bound(shape.points[i],shape.points[i+1],0);});
    if(!Number.isFinite(x0))return;
    var pad=(spec.bleed||0)*scale*3+4;
    x0=Math.max(0,Math.floor(x0*scale+ox-pad));y0=Math.max(0,Math.floor(y0*scale+oy-pad));
    x1=Math.min(pw,Math.ceil(x1*scale+ox+pad));y1=Math.min(ph,Math.ceil(y1*scale+oy+pad));
    var w=x1-x0,h=y1-y0;if(w<=0||h<=0)return;
    var n=w*h,density=new Float32Array(n),paper=new Float32Array(n),noise=ZXArtCompose.WashNoise;
    const wetness=spec.terrain?new Float32Array(n):null;
    const flow=spec.terrain?.flow||[0,1],flowLength=Math.hypot(...flow)||1,fx=flow[0]/flowLength,fy=flow[1]/flowLength;
    var seed=spec.seed>>>0,paperSeed=(drawing.paper?.seed||0)>>>0;
    for(var y=0;y<h;y++)for(var x=0;x<w;x++) {
      var lx=(x+x0-ox)/scale,ly=(y+y0-oy)/scale;
      // Fine fibre relief plus broader paper undulations; used only where ink actually lands.
      paper[y*w+x]=paperHeight(lx,ly,paperSeed);
      if(wetness)wetness[y*w+x]=.08+.92*Math.pow(noise.value(lx*.026,ly*.032,seed^0x83A91),1.7);
    }
    function stamp(cx,cy,r,amount,contact) {
      var left=Math.max(0,Math.floor(cx-r)),right=Math.min(w-1,Math.ceil(cx+r));
      var top=Math.max(0,Math.floor(cy-r)),bottom=Math.min(h-1,Math.ceil(cy+r));
      for(var yy=top;yy<=bottom;yy++)for(var xx=left;xx<=right;xx++) {
        var d=((xx+.5-cx)*(xx+.5-cx)+(yy+.5-cy)*(yy+.5-cy))/(r*r);
        if(d>=1)continue;
        var index=yy*w+xx,keep=Math.max(0,Math.min(1,(contact-paper[index]*.35)*4));
        density[index]+=amount*(1-d)*keep;
      }
    }
    strokes.forEach(function(stroke,strokeIndex) {
      var points=stroke.path;if(points.length<2)return;
      var distances=[0];
      for(var i=1;i<points.length;i++)distances.push(distances[i-1]+Math.hypot(points[i].x-points[i-1].x,points[i].y-points[i-1].y));
      var length=distances[distances.length-1];if(length<=0)return;
      var pressure=stroke.pressure||[.15,1,.7,.05],count=Math.max(12,Math.min(72,Math.ceil(stroke.width*5)));
      var localSeed=ZXArtCompose.Brush.hash(seed,strokeIndex),bristles=[];
      // A pressed brush contacts in unequal tufts, not evenly spaced parallel teeth.
      var tuftCount=Math.max(2,Math.min(6,Math.ceil(stroke.width*.45))),tufts=[];
      for(var k=0;k<tuftCount;k++)tufts.push({
        center:-.88+1.76*(k+.15+.7*random(localSeed,k+600))/tuftCount,
        spread:.16+.45*random(localSeed,k+700),
        load:.45+.55*random(localSeed,k+800),phase:random(localSeed,k+900)*30
      });
      for(var k=0;k<count;k++) {
        var tuft=tufts[k%tuftCount];
        bristles.push({
          offset:Math.max(-1,Math.min(1,tuft.center+(random(localSeed,k)*2-1)*tuft.spread)),
          load:tuft.load*(.6+.4*random(localSeed,k+100)),life:.35+random(localSeed,k+200),
          radius:.17+.32*random(localSeed,k+300),phase:random(localSeed,k+400)*6.28,tuft:tuft
        });
      }
      var segment=0,step=.18;
      for(var distance=0;distance<=length;distance+=step) {
        while(segment<points.length-2&&distances[segment+1]<distance)segment++;
        var a=points[segment],b=points[segment+1],span=distances[segment+1]-distances[segment];
        if(span<=0)continue;
        var t=(distance-distances[segment])/span,progress=distance/length;
        var f=progress*(pressure.length-1),j=Math.min(pressure.length-2,Math.floor(f));
        var press=Math.max(0,pressure[j]+(pressure[j+1]-pressure[j])*(f-j));
        if(press<.01)continue;
        var cx=a.x+(b.x-a.x)*t,cy=a.y+(b.y-a.y)*t,nx=-(b.y-a.y)/span,ny=(b.x-a.x)/span;
        var dry=stroke.dry==null?.8:stroke.dry;
        // Water bridges the hairs of a loaded brush; a wet dot must not become a hollow outline.
        if(dry<.5) {
          var coreRadius=Math.max(.6,stroke.width*.5*press*scale);
          stamp(cx*scale+ox-x0,cy*scale+oy-y0,coreRadius,
            stroke.ink*(1-dry*2)*step*scale/coreRadius*1.4,1);
        }
        bristles.forEach(function(hair) {
          var dry=stroke.dry==null?.8:stroke.dry,oblique=stroke.oblique||0;
          var sideLoading=1+oblique*hair.offset*.6;
          var reserve=hair.load*sideLoading*Math.exp(-progress/hair.life);
          // Contact persists along the stroke in patches; fibres within a tuft share the patch.
          var patch=noise.value(distance*.16+hair.tuft.phase,hair.tuft.phase,localSeed);
          var load=reserve*Math.max(0,Math.min(1,(patch+.5-dry*.55)*2.2));
          var offset=(hair.offset+oblique*.35+.035*Math.sin(distance*.12+hair.phase))*stroke.width*.5*press;
          var px=(cx+nx*offset)*scale+ox-x0,py=(cy+ny*offset)*scale+oy-y0;
          var radius=Math.max(.6,hair.radius*scale*(.7+press*.5));
          var contact=(1-dry)*1.1+press*.36+load*.55-dry*.26;
          var amount=stroke.ink*load*step*scale/(radius*count)*stroke.width*1.8;
          stamp(px,py,radius,amount,contact);
        });
      }
    });
    if(shapes.length) {
      var source=new OffscreenCanvas(w,h),sc=source.getContext('2d',{willReadFrequently:true});
      sc.setTransform(scale,0,0,scale,ox-x0,oy-y0);drawShapes(sc,shapes);
      var pixels=sc.getImageData(0,0,w,h).data;
      function sample(x,y){return x<0||y<0||x>=w||y>=h?0:pixels[(y*w+x)*4+3]/255;}
      // Distance inside the actual wash footprint: local water content controls
      // how much of its edge loses pigment, without feathering every margin equally.
      var edge=spec.terrain?new Float32Array(n):null;
      if(edge) {
        for(var i=0;i<n;i++)edge[i]=pixels[i*4+3]>0?1e6:0;
        for(var y=0;y<h;y++)for(var x=0;x<w;x++) {
          var i=y*w+x;
          edge[i]=Math.min(edge[i],x?edge[i-1]+1:0,y?edge[i-w]+1:0,x&&y?edge[i-w-1]+1.414:1e6);
        }
        for(var y=h-1;y>=0;y--)for(var x=w-1;x>=0;x--) {
          var i=y*w+x;
          edge[i]=Math.min(edge[i],x<w-1?edge[i+1]+1:0,y<h-1?edge[i+w]+1:0,x<w-1&&y<h-1?edge[i+w+1]+1.414:1e6);
        }
      }
      for(var i=0;i<n;i++) {
        var lx=(i%w+x0-ox)/scale,ly=(Math.floor(i/w)+y0-oy)/scale;
        var loading=spec.terrain
          ?.12+2.0*Math.pow(noise.value((-lx*fy+ly*fx)*.055,(lx*fx+ly*fy)*.018,paperSeed^0xB5297A4D),1.5)+.22*noise.value(lx*.014,ly*.019,paperSeed)
          :.65+.6*noise.value(lx*.055,ly*.065,seed^0xB5297A4D);
        var alpha=pixels[i*4+3]/255;
        if(spec.bleed>0) {
          // A sub-texel displacement breaks a wet polygon's mechanically clean boundary.
          // It belongs to the paper, so overlapping washes encounter the same relief.
          var px=i%w+(noise.value(lx*.65,ly*.65,paperSeed^0x171A)-.5)*1.3*scale;
          var py=Math.floor(i/w)+(noise.value(lx*.65,ly*.65,paperSeed^0x1A71)-.5)*1.3*scale;
          var ix=Math.floor(px),iy=Math.floor(py),tx=px-ix,ty=py-iy;
          alpha=(sample(ix,iy)*(1-tx)+sample(ix+1,iy)*tx)*(1-ty)+(sample(ix,iy+1)*(1-tx)+sample(ix+1,iy+1)*tx)*ty;
        }
        if(edge) {
          var reach=(2+14*wetness[i])*scale,t=Math.min(1,edge[i]/reach);
          alpha*=.18+.82*t*t*(3-2*t);
        }
        density[i]+=-Math.log(Math.max(.002,1-alpha))*loading;
      }
      source.width=source.height=1;
    }
    if(spec.bleed>0) {
      var initial=density.slice(),next=new Float32Array(n);
      var iterations=Math.min(160,Math.max(1,Math.ceil(Math.pow(spec.bleed*scale,2)*.8)));
      for(var pass=0;pass<iterations;pass++) {
        for(var y=0;y<h;y++)for(var x=0;x<w;x++) {
          var i=y*w+x,value=density[i],sum=0;
          // Symmetric flux conserves ink while the paper height changes local diffusion speed.
          for(var axis=0;axis<4;axis++) {
            var q=axis===0?(x>0?i-1:i):axis===1?(x<w-1?i+1:i):axis===2?(y>0?i-w:i):(y<h-1?i+w:i);
            sum+=(density[q]-value)*(.45+.55*(1-(paper[i]+paper[q])*.5))*(wetness?(wetness[i]+wetness[q])*.5:1);
          }
          next[i]=Math.max(0,value+.20*sum);
        }
        var swap=density;density=next;next=swap;
      }
      for(var i=0;i<n;i++)density[i]+=Math.max(0,initial[i]-density[i])*(spec.rim||0)*(.6+paper[i])*(wetness?.2+1.8*(1-wetness[i]):1);
    }
    var output=new OffscreenCanvas(w,h),outctx=output.getContext('2d'),image=outctx.createImageData(w,h);
    var color=spec.color||[.10,.12,.10];
    for(var i=0;i<n;i++) {
      image.data[i*4]=Math.round(color[0]*255);image.data[i*4+1]=Math.round(color[1]*255);image.data[i*4+2]=Math.round(color[2]*255);
      const contact=shapes.length?.75+paper[i]*.5:1;
      image.data[i*4+3]=Math.round((1-Math.exp(-density[i]*contact))*255);
    }
    outctx.putImageData(image,0,0);ctx.save();ctx.setTransform(1,0,0,1,0,0);
    ctx.globalCompositeOperation=layer.blend==='multiply'?'multiply':'source-over';ctx.globalAlpha=layer.opacity==null?1:layer.opacity;
    ctx.drawImage(output,x0,y0);ctx.restore();output.width=output.height=1;
  }
  // Ink contact in local brush coordinates. The outline carries pressure; the raster carries dry gaps.
  function texturedShape(ctx,shape,paperSeed=0) {
    const transform=ctx.getTransform(),p=shape.points,n=p.length/4;
    if(n<2||!shape.fill)return;
    const scale=Math.hypot(transform.a,transform.b),seed=shape.brush.seed>>>0;
    const points=[];let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;
    for(let i=0;i<p.length;i+=2) {
      const x=transform.a*p[i]+transform.c*p[i+1]+transform.e,y=transform.b*p[i]+transform.d*p[i+1]+transform.f;
      points.push([x,y]);x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);
    }
    x0=Math.floor(x0)-1;y0=Math.floor(y0)-1;x1=Math.ceil(x1)+1;y1=Math.ceil(y1)+1;
    const width=x1-x0,height=y1-y0;if(width<1||height<1)return;
    const canvas=new OffscreenCanvas(width,height),cc=canvas.getContext('2d',{willReadFrequently:true});
    cc.beginPath();points.forEach(([x,y],i)=>i?cc.lineTo(x-x0,y-y0):cc.moveTo(x-x0,y-y0));cc.closePath();cc.fillStyle='white';cc.fill();
    const image=cc.getImageData(0,0,width,height),line=[];
    const stride=Math.max(1,Math.floor(n/10));
    const sample=i=>{const a=points[i],b=points[points.length-1-i];return [(a[0]+b[0])*.5,(a[1]+b[1])*.5,Math.hypot(a[0]-b[0],a[1]-b[1])*.5];};
    for(let i=0;i<n;i+=stride)line.push(sample(i));
    if((n-1)%stride)line.push(sample(n-1));
    const segments=[];let distance=0;
    for(let i=1;i<line.length;i++) {
      const a=line[i-1],b=line[i],dx=b[0]-a[0],dy=b[1]-a[1],len=Math.hypot(dx,dy);
      if(len>0)segments.push({x:a[0],y:a[1],dx:dx/len,dy:dy/len,len,start:distance,r0:a[2],r1:b[2]});distance+=len;
    }
    for(let y=0;y<height;y++)for(let x=0;x<width;x++) {
      const i=(y*width+x)*4;if(!image.data[i+3])continue;
      let best=Infinity,along=0,across=0,radius=1;
      for(const s of segments) {
        const dx=x+x0+.5-s.x,dy=y+y0+.5-s.y,t=Math.max(0,Math.min(s.len,dx*s.dx+dy*s.dy));
        const d=(dx-t*s.dx)**2+(dy-t*s.dy)**2;
        if(d<best){best=d;along=(s.start+t)/scale;across=(dy*s.dx-dx*s.dy)/scale;radius=(s.r0+(s.r1-s.r0)*t/s.len)/scale;}
      }
      const fibre=ZXArtCompose.WashNoise.value(along*.23,across*2.4+.35*Math.sin(along*.7),seed);
      const load=ZXArtCompose.WashNoise.value(along*.045,across*.35,seed^0x91E10DA5);
      const progress=distance>0?Math.min(1,along*scale/distance):0;
      const dry=Math.max(.05,Math.min(.95,shape.brush.dry-.10+progress*.25));
      const tooth=paperHeight((x+x0-transform.e)/scale,(y+y0-transform.f)/scale,paperSeed);
      const keep=Math.min(1.25,Math.max(0,(fibre*.42+load*.32+tooth*.26-(.12+dry*.24))*(3.2+dry*1.5)));
      for(let k=0;k<3;k++)image.data[i+k]=Math.round(shape.fill[k]*255);
      const side=Math.max(-1,Math.min(1,across/Math.max(.05,radius)));
      const loading=1+(shape.brush.oblique||0)*side*.5;
      const reserve=ZXArtCompose.WashNoise.value(along*.075,across*.16,seed^0xC13FA9A9);
      const depletion=Math.max(0,Math.min(1,(shape.brush.dry-.65)*6));
      const contact=1-depletion+depletion*Math.max(0,Math.min(1,(reserve-(.12+.32*dry))*5));
      const rough=Math.max(0,Math.min(1,(radius-.5)*.9))*Math.max(0,Math.min(1,(dry-.45)*3));
      const tuft=ZXArtCompose.WashNoise.value(along*.12,across*.65,seed^0x9E3779B9);
      const fragment=Math.max(0,Math.min(1,(tuft-(.28+dry*.18))*7));
      const ink=shape.brush.ink??shape.fill[3],opacity=ink>0?shape.fill[3]/ink:0;
      const pigment=(ink*(1-rough)+Math.pow(ink,.55)*rough)*opacity;
      const clump=ZXArtCompose.WashNoise.value(along*.60,across*1.15,seed^0xB5297A4D);
      const broken=Math.max(0,Math.min(1,(clump*.45+fibre*.20+tooth*.35-.42)*12));
      const surface=(1-rough)*keep*contact+rough*fragment*broken;
      image.data[i+3]*=pigment*loading*surface*(1-progress*.35*dry);
    }
    const alpha=new Uint8Array(width*height);
    for(let i=0;i<alpha.length;i++)alpha[i]=image.data[i*4+3];
    const rate=.06+.08*(1-shape.brush.dry);
    for(let y=1;y<height-1;y++)for(let x=1;x<width-1;x++) {
      const i=y*width+x;
      image.data[i*4+3]=alpha[i]+rate*(alpha[i-1]+alpha[i+1]+alpha[i-width]+alpha[i+width]-4*alpha[i]);
      for(let k=0;k<3;k++)image.data[i*4+k]=Math.round(shape.fill[k]*255);
    }
    cc.putImageData(image,0,0);ctx.save();ctx.setTransform(1,0,0,1,0,0);ctx.drawImage(canvas,x0,y0);ctx.restore();canvas.width=canvas.height=1;
  }
  global.ZXArtInk={version:'terrain-ink-9',draw:draw,texturedShape:texturedShape};
})(typeof self!=='undefined'?self:globalThis);
