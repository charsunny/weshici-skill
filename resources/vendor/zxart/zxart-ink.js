/* Deterministic raster ink study: bristle contact for dry marks, paper-guided diffusion for washes.
 * Optical density is accumulated before converting to alpha. This is a visual approximation,
 * not a fluid solver. Only layers with an explicit `ink` descriptor use this path.
 */
(function (global) {
  'use strict';
  function random(seed, index) {
    return ZXArtCompose.Brush.random(seed >>> 0, index >>> 0);
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
    var seed=spec.seed>>>0,paperSeed=(drawing.paper?.seed||0)>>>0;
    for(var y=0;y<h;y++)for(var x=0;x<w;x++) {
      var lx=(x+x0-ox)/scale,ly=(y+y0-oy)/scale;
      // Fine fibre relief plus broader paper undulations; used only where ink actually lands.
      paper[y*w+x]=.65*noise.value(lx*2.1+ly*.37,ly*2.1-lx*.37,paperSeed^0xA511E9B3)+.35*noise.value(lx*.31,ly*2.8,paperSeed^0x63D83595);
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
      for(var i=0;i<n;i++) {
        var lx=(i%w+x0-ox)/scale,ly=(Math.floor(i/w)+y0-oy)/scale;
        var loading=.65+.6*noise.value(lx*.08,ly*.08,seed^0xB5297A4D);
        density[i]+=-Math.log(Math.max(.002,1-pixels[i*4+3]/255))*loading;
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
            sum+=(density[q]-value)*(.45+.55*(1-(paper[i]+paper[q])*.5));
          }
          next[i]=Math.max(0,value+.20*sum);
        }
        var swap=density;density=next;next=swap;
      }
      for(var i=0;i<n;i++)density[i]+=Math.max(0,initial[i]-density[i])*(spec.rim||0)*(.6+paper[i]);
    }
    var output=new OffscreenCanvas(w,h),outctx=output.getContext('2d'),image=outctx.createImageData(w,h);
    var color=spec.color||[.10,.12,.10];
    for(var i=0;i<n;i++) {
      image.data[i*4]=Math.round(color[0]*255);image.data[i*4+1]=Math.round(color[1]*255);image.data[i*4+2]=Math.round(color[2]*255);
      image.data[i*4+3]=Math.round((1-Math.exp(-density[i]))*255);
    }
    outctx.putImageData(image,0,0);ctx.save();ctx.setTransform(1,0,0,1,0,0);
    ctx.globalCompositeOperation=layer.blend==='multiply'?'multiply':'source-over';ctx.globalAlpha=layer.opacity==null?1:layer.opacity;
    ctx.drawImage(output,x0,y0);ctx.restore();output.width=output.height=1;
  }
  global.ZXArtInk={version:'bristle-study-1',draw:draw};
})(typeof self!=='undefined'?self:globalThis);
