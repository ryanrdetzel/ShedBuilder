import {clamp,ft,wallPoint,wallOffset,findOpeningSpace} from './shed.js';

const AXES = {x:0,y:1,z:2};
const CAMERA = {yaw:0.65,pitch:0.48,zoom:1};
const dot = (a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const sub = (a,b)=>a.map((value,i)=>value-b[i]);
const cross = (a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const pointsBetween = (a,b,t)=>a.map((value,i)=>value+(b[i]-value)*t);
const average = values=>values.reduce((sum,value)=>sum+value,0)/values.length;
const length = point=>Math.hypot(...point);
const faceEdges = [[0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4],[0,4],[1,5],[2,6],[3,7]];
const colorCache = new Map();

function normalOf(vertices) {
  for (let i=2;i<vertices.length;i++) {
    const normal = cross(sub(vertices[i],vertices[0]),sub(vertices[i-1],vertices[0]));
    const magnitude = length(normal);
    if (magnitude>0.001) return normal.map(value=>value/magnitude);
  }
  return null;
}
function visiblePolygon(vertices,cut) {
  if (!cut) return vertices;
  const {index,value,direction}=cut;
  const kept = [];
  for (let i=0;i<vertices.length;i++) {
    const a=vertices[i],b=vertices[(i+1)%vertices.length];
    const da=(a[index]-value)*direction,db=(b[index]-value)*direction;
    if (da>=0) kept.push(a);
    if ((da>=0)!==(db>=0)) kept.push(pointsBetween(a,b,da/(da-db)));
  }
  return kept;
}
function cutFace(vertices,cut) {
  const {index,value}=cut;
  if (!vertices.some(point=>point[index]<value-0.0001) || !vertices.some(point=>point[index]>value+0.0001)) return [];
  const points=[];
  for (const [i,j] of faceEdges) {
    const a=vertices[i],b=vertices[j];
    if ((a[index]<value)===(b[index]<value)) continue;
    const point=pointsBetween(a,b,(value-a[index])/(b[index]-a[index]));
    if (!points.some(other=>length(sub(point,other))<0.001)) points.push(point);
  }
  const a=(index+1)%3,b=(index+2)%3;
  const centerA=average(points.map(point=>point[a])),centerB=average(points.map(point=>point[b]));
  return points.sort((p,q)=>Math.atan2(p[b]-centerB,p[a]-centerA)-Math.atan2(q[b]-centerB,q[a]-centerA));
}
function distanceToLine(x,y,a,b) {
  const dx=b.x-a.x,dy=b.y-a.y;
  const t=clamp(((x-a.x)*dx+(y-a.y)*dy)/(dx*dx+dy*dy),0,1);
  return Math.hypot(x-a.x-t*dx,y-a.y-t*dy);
}
function rgba(hex,multiplier) {
  const key='pixel-'+hex+Math.round(multiplier*50);
  if (!colorCache.has(key)) {
    const channels=[1,3,5].map(i=>Math.min(255,Math.round(parseInt(hex.slice(i,i+2),16)*multiplier)));
    colorCache.set(key,[...channels,255]);
  }
  return colorCache.get(key);
}

// Draw convex faces with a per-pixel depth buffer so long panels cover the
// framing behind them, regardless of the distance to each face's center.
export function rasterize(faces, surface, density, selection) {
  const {width,height,pixels,depth,owner}=surface;
  pixels.fill(0);
  depth.fill(-Infinity);
  owner.fill(0);
  const projected=faces.map(face=>face.points.map(point=>[point.x*density,point.y*density,point.depth]));
  const write=(index,color)=>{
    const address=index*4;
    for(let channel=0;channel<4;channel++) pixels[address+channel]=color[channel];
  };
  for (let faceIndex=0;faceIndex<faces.length;faceIndex++) {
    const face=faces[faceIndex];
    const points=projected[faceIndex];
    const selected=face.part.id===selection;
    const color=rgba(selected?'#efbf64':face.part.color,selected?1:face.shade);
    const ys=points.map(point=>point[1]);
    const first=Math.max(0,Math.ceil(Math.min(...ys)-0.5));
    const last=Math.min(height-1,Math.floor(Math.max(...ys)-0.5));
    for(let row=first;row<=last;row++) {
      const y=row+0.5;
      let left=Infinity,right=-Infinity,leftZ=0,rightZ=0;
      for(let i=0;i<points.length;i++) {
        const a=points[i],b=points[(i+1)%points.length];
        if((a[1]>y)===(b[1]>y)) continue;
        const t=(y-a[1])/(b[1]-a[1]);
        const x=a[0]+(b[0]-a[0])*t,z=a[2]+(b[2]-a[2])*t;
        if(x<left) { left=x;leftZ=z; }
        if(x>right) { right=x;rightZ=z; }
      }
      if(right<=left) continue;
      const start=Math.max(0,Math.ceil(left-0.5)),end=Math.min(width-1,Math.floor(right-0.5));
      const step=(rightZ-leftZ)/(right-left);
      let z=leftZ+(start+0.5-left)*step,index=row*width+start;
      for(let column=start;column<=end;column++,index++,z+=step) {
        if(z<depth[index]) continue;
        depth[index]=z;
        owner[index]=faceIndex+1;
        write(index,color);
      }
    }
  }
  for(let faceIndex=0;faceIndex<faces.length;faceIndex++) {
    const face=faces[faceIndex];
    const selected=face.part.id===selection;
    const color=rgba(selected?'#965e23':face.part.color,selected?1:face.shade*0.83);
    const points=projected[faceIndex];
    for(let i=0;i<points.length;i++) {
      const a=points[i],b=points[(i+1)%points.length];
      const steps=Math.ceil(Math.max(Math.abs(b[0]-a[0]),Math.abs(b[1]-a[1])));
      for(let j=0;j<steps;j++) {
        const t=j/steps;
        const x=Math.floor(a[0]+(b[0]-a[0])*t),y=Math.floor(a[1]+(b[1]-a[1])*t);
        if(x<0||x>=width||y<0||y>=height) continue;
        const index=y*width+x,z=a[2]+(b[2]-a[2])*t;
        if(owner[index]===faceIndex+1 || z>=depth[index]+0.15) {
          write(index,color);
          if(z>=depth[index]) { depth[index]=z;owner[index]=faceIndex+1; }
        }
      }
    }
  }
}
export class ShedView {
  constructor(canvas, callbacks) {
    this.canvas=canvas;
    this.ctx=canvas.getContext('2d');
    this.surface=document.createElement('canvas');
    this.surfaceContext=this.surface.getContext('2d');
    this.camera={...CAMERA};
    this.callbacks=callbacks;
    this.selection=null;
    this.mode='model';
    this.layer='exterior';
    this.hideRoof=false;
    this.section=null;
    this.hits=[];
    this.planHits=[];
    this.size={width:0,height:0};
    new ResizeObserver(()=>this.request()).observe(canvas);
    canvas.addEventListener('pointerdown',event=>this.startDrag(event));
    canvas.addEventListener('pointermove',event=>this.moveDrag(event));
    canvas.addEventListener('pointerup',event=>this.endDrag(event));
    canvas.addEventListener('pointercancel',()=>{this.drag=null;canvas.classList.remove('dragging');});
    canvas.addEventListener('wheel',event=>{
      if(this.mode!=='model') return;
      event.preventDefault();
      this.zoom(Math.exp(-event.deltaY*0.0011));
    },{passive:false});
    canvas.addEventListener('keydown',event=>{
      if(this.mode!=='model') return;
      const {key}=event;
      if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','+','-','0'].includes(key)) return;
      event.preventDefault();
      if(key==='0') this.home();
      if(key==='+') this.zoom(1.15);
      if(key==='-') this.zoom(0.87);
      if(key==='ArrowLeft') this.camera.yaw-=0.13;
      if(key==='ArrowRight') this.camera.yaw+=0.13;
      if(key==='ArrowUp') this.camera.pitch=clamp(this.camera.pitch+0.1,0.02,1.48);
      if(key==='ArrowDown') this.camera.pitch=clamp(this.camera.pitch-0.1,0.02,1.48);
      this.request();
    });
  }
  setModel(design,model) { this.design=design;this.model=model;this.request(); }
  setView(options) { Object.assign(this,options);this.request(); }
  home() { this.camera={...CAMERA};this.request(); }
  zoom(factor) { this.camera.zoom=clamp(this.camera.zoom*factor,0.55,3.3);this.request(); }
  request() {
    if(this.frame) return;
    this.frame=requestAnimationFrame(()=>{this.frame=0;this.draw();});
  }
  local(event) {
    const rect=this.canvas.getBoundingClientRect();
    return [event.clientX-rect.left,event.clientY-rect.top];
  }
  startDrag(event) {
    if(event.button!==0 || !this.model) return;
    const [x,y]=this.local(event);
    const item=this.mode==='plan' ? this.planHits.find(hit=>distanceToLine(x,y,hit.a,hit.b)<13) : null;
    this.drag={x,y,yaw:this.camera.yaw,pitch:this.camera.pitch,item,moved:false};
    this.canvas.setPointerCapture(event.pointerId);
  }
  moveDrag(event) {
    const [x,y]=this.local(event);
    const drag=this.drag;
    if(this.mode==='plan') this.canvas.classList.toggle('over-opening',this.planHits.some(hit=>distanceToLine(x,y,hit.a,hit.b)<13));
    if(!drag) return;
    const dx=x-drag.x,dy=y-drag.y;
    if(Math.hypot(dx,dy)>3) drag.moved=true;
    if(!drag.moved) return;
    if(this.mode==='model') {
      this.canvas.classList.add('dragging');
      this.camera.yaw=drag.yaw-dx*0.009;
      this.camera.pitch=clamp(drag.pitch+dy*0.008,0.02,1.48);
    } else if(drag.item) {
      const {opening}=drag.item;
      const delta=wallOffset(this.design,opening.wall,dx/this.planScale,dy/this.planScale)-
        wallOffset(this.design,opening.wall,0,0);
      const preferred=Math.round((opening.offset+delta)*4)/4;
      this.previewOffset=findOpeningSpace(this.design,opening.wall,opening.width,opening.id,preferred);
    }
    this.request();
  }
  endDrag(event) {
    const drag=this.drag;
    if(!drag) return;
    this.drag=null;
    this.canvas.classList.remove('dragging');
    if(this.mode==='plan' && drag.item) {
      if(drag.moved && this.previewOffset!==null && this.previewOffset!==undefined) {
        this.callbacks.move(drag.item.opening.id,this.previewOffset);
      } else if(!drag.moved) this.callbacks.edit(drag.item.opening.id);
      this.previewOffset=null;
      this.request();
    }
    if(this.mode==='model' && !drag.moved) {
      const [x,y]=this.local(event);
      const raster=this.raster;
      const column=Math.floor(x*this.rasterDensity),row=Math.floor(y*this.rasterDensity);
      const index=raster && column>=0 && column<raster.width && row>=0 && row<raster.height ? raster.owner[row*raster.width+column] : 0;
      const hit=this.hits[index-1];
      this.selection=hit?.part.id??null;
      this.callbacks.inspect(hit?.part??null);
      this.request();
    }
  }
  draw() {
    if(!this.model) return;
    const {clientWidth:width,clientHeight:height}=this.canvas;
    if(!width || !height) return;
    const density=Math.min(window.devicePixelRatio||1,2);
    if(this.canvas.width!==Math.round(width*density) || this.canvas.height!==Math.round(height*density)) {
      this.canvas.width=Math.round(width*density);
      this.canvas.height=Math.round(height*density);
    }
    this.size={width,height};
    this.ctx.setTransform(density,0,0,density,0,0);
    this.ctx.clearRect(0,0,width,height);
    if(this.mode==='plan') this.drawPlan();
    else this.drawModel();
  }
  line(a,b,color,width=1,dash=[]) {
    const c=this.ctx;
    c.beginPath();c.setLineDash(dash);c.moveTo(a.x,a.y);c.lineTo(b.x,b.y);
    c.lineWidth=width;c.strokeStyle=color;c.stroke();c.setLineDash([]);
  }
  polygon(points,fill,edge,width=0.7) {
    const c=this.ctx;
    c.beginPath();c.moveTo(points[0].x,points[0].y);
    for(const point of points.slice(1)) c.lineTo(point.x,point.y);
    c.closePath();
    if(fill) { c.fillStyle=fill;c.fill(); }
    if(edge) { c.lineWidth=width;c.strokeStyle=edge;c.stroke(); }
  }
  drawModel() {
    const {width,height}=this.size;
    const {width:w,length:l,overhang:o}=this.design;
    const {bounds}=this.model;
    const {yaw,pitch,zoom}=this.camera;
    const horiz=[Math.cos(yaw),0,Math.sin(yaw)];
    const up=[-Math.sin(yaw)*Math.sin(pitch),Math.cos(pitch),Math.cos(yaw)*Math.sin(pitch)];
    const forward=cross(horiz,up).map(value=>-value);
    const corners=[];
    const center=[w/2,0,l/2];
    for(const x of bounds.x) for(const y of bounds.y) for(const z of bounds.z) corners.push([x,y,z]);
    const xExtent=corners.map(point=>dot(sub(point,center),horiz));
    const yExtent=corners.map(point=>dot(sub(point,center),up));
    const dx=Math.max(...xExtent)-Math.min(...xExtent),dy=Math.max(...yExtent)-Math.min(...yExtent);
    const scale=Math.min((width-50)/dx,(height-81)/dy)*zoom;
    const xCenter=(Math.min(...xExtent)+Math.max(...xExtent))/2;
    const yCenter=(Math.min(...yExtent)+Math.max(...yExtent))/2;
    const project=point=>{
      const local=sub(point,center);
      return {x:width/2+(dot(local,horiz)-xCenter)*scale,y:height*0.48-(dot(local,up)-yCenter)*scale,depth:dot(local,forward)};
    };
    for(let x=-480;x<=w+480;x+=12) this.line(project([x,-12,-480]),project([x,-12,l+480]),x%48===0?'#9eb2a559':'#a8b9ad30',0.65);
    for(let z=-480;z<=l+480;z+=12) this.line(project([-480,-12,z]),project([w+480,-12,z]),z%48===0?'#9eb2a559':'#a8b9ad30',0.65);
    const c=this.ctx;
    c.save();
    c.shadowColor='#35574556';
    c.shadowBlur=16;
    this.polygon([[1,-12,-3],[w+6,-12,0],[w+6,-12,l+8],[0,-12,l+8]].map(project),'#52715b30');
    c.restore();
    this.polygon([[0,-11.9,0],[w,-11.9,0],[w,-11.9,l],[0,-11.9,l]].map(project),null,'#738d7b78',0.8);

    const cut=this.section ? {
      index:AXES[this.section.axis],
      value:bounds[this.section.axis][0]+(bounds[this.section.axis][1]-bounds[this.section.axis][0])*this.section.depth/100,
      direction:(this.section.axis==='y'?-1:1)*(this.section.flip?-1:1)
    }:null;
    const drawn=[];
    for(const part of this.model.geometry) {
      if(this.layer==='framing' && ['skin','roofSkin'].includes(part.layer)) continue;
      if(this.hideRoof && ['roof','roofSkin'].includes(part.layer)) continue;
      for(const face of part.faces) {
        const vertices=face.map(index=>part.vertices[index]);
        const normal=normalOf(vertices);
        if(!normal || dot(normal,forward)<0.0001) continue;
        const polygon=visiblePolygon(vertices,cut);
        if(polygon.length<3) continue;
        const shade=0.82+0.22*Math.max(0,dot(normal,[-0.36,0.83,-0.42]))+0.02*normal[1];
        const points=polygon.map(project);
        drawn.push({points,part,shade});
      }
      if(cut && -cut.direction*forward[cut.index]>0.001) {
        const polygon=cutFace(part.vertices,cut);
        if(polygon.length>=3) {
          const points=polygon.map(project);
          drawn.push({points,part,shade:1.19,cap:true});
        }
      }
    }
    this.paintParts(drawn);
    this.hits=drawn;
    this.drawAxis(horiz,up);
  }
  paintParts(faces) {
    const {width,height}=this.size;
    const density=Math.min(window.devicePixelRatio||1,1.65,1200/width,1000/height);
    const cols=Math.ceil(width*density),rows=Math.ceil(height*density);
    if(this.raster?.width!==cols || this.raster?.height!==rows) {
      this.surface.width=cols;
      this.surface.height=rows;
      const image=this.surfaceContext.createImageData(cols,rows);
      this.raster={width:cols,height:rows,image,pixels:image.data,
        depth:new Float32Array(cols*rows),owner:new Uint16Array(cols*rows)};
    }
    this.rasterDensity=density;
    rasterize(faces,this.raster,density,this.selection);
    this.surfaceContext.putImageData(this.raster.image,0,0);
    this.ctx.drawImage(this.surface,0,0,width,height);
  }
  drawAxis(horiz,up) {
    const c=this.ctx, x=this.size.width-36,y=this.size.height-37;
    const end={x,y};
    const axes=[['X',0,'#8f6b5a'],['Y',1,'#4f8265'],['Z',2,'#54798a']];
    for(const [name,i,color] of axes) {
      const point={x:x+horiz[i]*18,y:y-up[i]*18};
      this.line(end,point,color,1.25);
      c.fillStyle=color;c.font='700 8px system-ui';c.textAlign='center';
      c.fillText(name,point.x+horiz[i]*6,point.y-up[i]*7+3);
    }
  }
  drawPlan() {
    const {width,height}=this.size;
    const {width:w,length:l}=this.design;
    const scale=Math.min((width-90)/w,(height-110)/l);
    this.planScale=scale;
    const ox=(width-w*scale)/2,oy=(height-l*scale)/2;
    const p=(x,z)=>({x:ox+x*scale,y:oy+z*scale});
    const c=this.ctx;
    for(let x=ox% (12*scale);x<width;x+=12*scale) this.line({x,y:0},{x,y:height},'#a3b6a842',0.65);
    for(let y=oy% (12*scale);y<height;y+=12*scale) this.line({x:0,y},{x:width,y},'#a3b6a842',0.65);
    this.polygon([p(0,0),p(w,0),p(w,l),p(0,l)],'#fcfaf0','#3a5b49',5);
    for(let z=16;z<l;z+=16) this.line(p(2,z),p(w-2,z),'#ac9e764d',0.8,[3,4]);
    const label=(value,at,color='#4b6556',bold=false)=>{
      c.fillStyle=color;c.textAlign='center';c.font=(bold?'700 ':'500 ')+'11px system-ui';
      c.fillText(value,at.x,at.y);
    };
    label('FRONT',p(w/2,-12),'#315847',true);
    label(ft(w)+' wide',p(w/2,l+17));
    const lengthAt=p(w+15,l/2);
    c.save();c.translate(lengthAt.x,lengthAt.y);c.rotate(Math.PI/2);label(ft(l)+' long',{x:0,y:0});c.restore();
    const hits=[];
    for(const item of this.model.placed) {
      const dragged=this.drag?.item?.opening.id===item.id && this.previewOffset!=null;
      const opening=dragged?{...item,offset:this.previewOffset}:item;
      const wallP=(along,depth=0)=>{
        const [x,,z]=wallPoint(this.design,opening.wall,along,0,depth);
        return p(x,z);
      };
      const a=wallP(opening.offset),b=wallP(opening.offset+opening.width);
      this.line(a,b,'#fcfaf0',7);
      if(opening.type==='window') {
        this.line(a,b,'#558ea1',4);
        this.line(wallP(opening.offset,2),wallP(opening.offset+opening.width,2),'#97b6c1',1);
      } else {
        this.line(a,b,'#c58953',2);
        const swing=[];
        for(let i=0;i<=20;i++) {
          const angle=i*Math.PI/40;
          swing.push(wallP(opening.offset+opening.width*Math.cos(angle),opening.width*Math.sin(angle)));
        }
        this.line(a,swing.at(-1),'#af794b',1.5);
        for(let i=1;i<swing.length;i++) this.line(swing[i-1],swing[i],'#c39671',0.8);
      }
      hits.push({a,b,opening:item});
    }
    this.planHits=hits;
  }
}
