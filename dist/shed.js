export const walls = ['front', 'right', 'back', 'left'];
export const names = {front:'Front',right:'Right',back:'Back',left:'Left',door:'Door',window:'Window'};
export const defaults = {
  width:144, length:192, height:96, spacing:16, pitch:5, overhang:8, roof:'gable',
  openings:[
    {id:'door-1',type:'door',wall:'front',offset:42,width:60,height:76,sill:0},
    {id:'window-1',type:'window',wall:'right',offset:58,width:36,height:34,sill:40}
  ]
};
export const dimensions = {width:[72,288],length:[72,288],height:[84,144]};
export const stockSizes = [8,10,12,16,20,24];
export const samplePrices = {
  '2×4':[4.28,6.98,8.98,13.98,22.98,31.98],
  '2×6':[7.48,9.98,12.98,18.98,29.98,39.98],
  '2×8':[9.98,13.98,16.98,25.98,38.98,49.98],
  '4×4':[13.98,20.98,27.98,41.98,60,79],
  floor:33.5, wall:17.5, roof:21.5, siding:38, roofing:1.25, trim:1.15,
  door:260, window:125, hanger:2.6, tie:1.45, fasteners:38
};
export const priceLabels = {
  floor:'Floor panel / sheet',wall:'Wall sheathing / sheet',roof:'Roof sheathing / sheet',
  siding:'Siding / sheet',roofing:'Roof covering / sq ft',trim:'Fascia / linear ft',
  door:'Door / unit',window:'Window / unit',hanger:'Joist hanger / unit',tie:'Rafter tie / unit',
  fasteners:'Fastener allowance / lot'
};
const colors = {
  stud:'#d8aa70', plate:'#bc8c56', header:'#d6a15d', joist:'#ca9b60', skid:'#93835f',
  deck:'#d2ba93', metal:'#808d8b', siding:'#779785', batten:'#688775', trim:'#d5ddcc',
  door:'#b88350', doorTrim:'#674c3e', glass:'#789ea8', roof:'#4b615d', seam:'#5f7470'
};
const EPS = 0.00001;
export const openingMargin = 7;
export const openingGap = 6;
export const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const round = (value, step = 4) => Math.round(value * step) / step;
export const wallSpan = (design, wall) => ['front','back'].includes(wall) ? design.width : design.length;
export function inch(value) {
  return new Intl.NumberFormat('en-US', {maximumFractionDigits:2}).format(value) + '″';
}
export function ft(value) {
  const rounded = round(value);
  const feet = Math.floor(rounded / 12);
  const inches = rounded - 12 * feet;
  return feet ? feet + '′' + (inches ? ' ' + inch(inches) : '') : inch(inches);
}
export function layoutOpenings(design) {
  const placed = [];
  const invalid = [];
  for (const opening of design.openings) {
    const span = wallSpan(design, opening.wall);
    const max = span - opening.width - openingMargin;
    if (max < openingMargin || opening.height + opening.sill + 9 > design.height) {
      invalid.push(opening);
      continue;
    }
    const offset = clamp(opening.offset, openingMargin, max);
    const clashes = placed.some(other => other.wall === opening.wall &&
      offset < other.offset + other.width + openingGap && other.offset < offset + opening.width + openingGap);
    if (clashes) invalid.push(opening);
    else placed.push({...opening, offset});
  }
  return {placed, invalid};
}
export function findOpeningSpace(design, wall, width, exclude, preferred) {
  const last = wallSpan(design, wall) - width - openingMargin;
  const others = layoutOpenings({...design,openings:design.openings.filter(item=>item.id!==exclude)})
    .placed.filter(item=>item.wall===wall).sort((a,b)=>a.offset-b.offset);
  let start = openingMargin;
  const slots = [];
  for (const opening of others) {
    const end = opening.offset - width - openingGap;
    if (start <= end) slots.push([start,end]);
    start = opening.offset + opening.width + openingGap;
  }
  if (start <= last) slots.push([start,last]);
  if (!slots.length) return null;
  return slots.map(([min,max])=>clamp(preferred,min,max))
    .sort((a,b)=>Math.abs(a-preferred)-Math.abs(b-preferred))[0];
}
export function wallPoint(design, wall, along, y, inward = 0) {
  switch (wall) {
    case 'front': return [along,y,inward];
    case 'right': return [design.width-inward,y,along];
    case 'back': return [design.width-along,y,design.length-inward];
    default: return [inward,y,design.length-along];
  }
}
export function wallOffset(design, wall, x, z) {
  switch (wall) {
    case 'front': return x;
    case 'right': return z;
    case 'back': return design.width-x;
    default: return design.length-z;
  }
}
const faces = [[0,3,2,1],[4,5,6,7],[0,1,5,4],[1,2,6,5],[2,3,7,6],[3,0,4,7]];
function rectangular(x0,x1,y0,y1,z0,z1) {
  return [[x0,y0,z0],[x1,y0,z0],[x1,y0,z1],[x0,y0,z1],
          [x0,y1,z0],[x1,y1,z0],[x1,y1,z1],[x0,y1,z1]];
}
function intervals(start,end,spacing) {
  const values = [start];
  for (let value = start + spacing; value < end - 1.5; value += spacing) values.push(value);
  if (end > start + EPS) values.push(end);
  return values;
}
function roofTop(design,x) {
  const {roof,width,height,pitch} = design;
  return height + pitch / 12 * (roof === 'lean' ? x : Math.min(x,width-x));
}
function roofRuns(design) {
  return design.roof === 'lean' ? [[-design.overhang,design.width+design.overhang]] :
    [[-design.overhang,design.width/2],[design.width/2,design.width+design.overhang]];
}

export function buildShed(design, visual = true) {
  const {width:w,length:l,height:h,spacing,overhang:o,roof,pitch} = design;
  const {placed,invalid} = layoutOpenings(design);
  const geometry = [];
  const cuts = [];
  const sequence = {};
  const count = {hanger:0,tie:0};
  const top = x=>roofTop(design,x);
  function add(name,section,layer,color,vertices,stock,length,openingId,customFaces) {
    if (!visual && !stock) return;
    const group = {Floor:'F',Front:'A',Right:'B',Back:'C',Left:'D',Roof:'R',Exterior:'E',Hardware:'H'}[section];
    const prefix = stock || ['Hardware','Exterior'].includes(section) ? group : group+'S';
    sequence[prefix] = (sequence[prefix] || 0) + 1;
    const part = {id:prefix + String(sequence[prefix]).padStart(2,'0'),name,section,layer,color,stock,length,openingId};
    if (stock) cuts.push(part);
    if (visual && vertices) geometry.push({...part,vertices,faces:customFaces||faces});
  }
  function box(name,section,layer,color,x0,x1,y0,y1,z0,z1,stock,length,openingId) {
    if (x1-x0 < EPS || y1-y0 < EPS || z1-z0 < EPS) return;
    add(name,section,layer,color,visual?rectangular(x0,x1,y0,y1,z0,z1):null,stock,length,openingId);
  }
  function wallBox(wall,name,layer,color,a,b,y0,y1,d0,d1,stock,length,openingId) {
    if (b-a < EPS || y1-y0 < EPS || d1-d0 < EPS) return;
    const points = visual ? rectangular(a,b,y0,y1,d0,d1).map(([x,y,z])=>wallPoint(design,wall,x,y,z)) : null;
    add(name,names[wall],layer,color,points,stock,length,openingId);
  }
  function wallWedge(wall,name,layer,color,a,b,y0,ya,yb,d0,d1) {
    if (Math.max(ya,yb) <= y0 + EPS) return;
    const points = visual ? rectangular(a,b,y0,1,d0,d1)
      .map(([x,y,z])=>wallPoint(design,wall,x,y===y0?y0:(x===a?ya:yb),z)) : null;
    add(name,names[wall],layer,color,points);
  }
  function sloped(name,section,layer,color,x0,x1,z0,z1,depth,shift,stock) {
    const y0 = top(x0) + shift;
    const y1 = top(x1) + shift;
    const points = visual ? [[x0,y0,z0],[x1,y1,z0],[x1,y1,z1],[x0,y0,z1],
      [x0,y0+depth,z0],[x1,y1+depth,z0],[x1,y1+depth,z1],[x0,y0+depth,z1]] : null;
    add(name,section,layer,color,points,stock,stock?Math.hypot(x1-x0,y1-y0):undefined);
  }
  const joists = intervals(0.75,l-0.75,16);
  for (const z of joists) {
    box('Floor joist','Floor','floor',colors.joist,1.5,w-1.5,-8,-0.75,z-0.75,z+0.75,'2×8',w-3);
    if (z !== joists[0] && z !== joists.at(-1)) {
      for (const x of [1.5,w-2.45]) {
        count.hanger++;
        box('Joist hanger','Hardware','floor',colors.metal,x,x+0.95,-8.1,-3.6,z-1.1,z+1.1);
      }
    }
  }
  for (const x of [0,w-1.5]) box('Floor rim','Floor','floor',colors.plate,x,x+1.5,-8,-0.75,0,l,'2×8',l);
  const skidCount = Math.max(2,Math.ceil(w/60));
  for (let i=0;i<skidCount;i++) {
    const x=12+(w-24)*i/(skidCount-1);
    box('Skid','Floor','floor',colors.skid,x-1.75,x+1.75,-11.5,-8,0,l,'4×4',l);
  }
  box('Floor deck','Floor','skin',colors.deck,0,w,-0.75,0,0,l);
  for (const wall of walls) {
    const span = wallSpan(design,wall);
    const side = wall === 'left' || wall === 'right';
    const start = side ? 3.5 : 0;
    const end = span - start;
    const wallOpenings = placed.filter(opening=>opening.wall===wall).sort((a,b)=>a.offset-b.offset);
    const wallPart = (name,color,a,b,y0,y1,stock,length,openingId) =>
      wallBox(wall,name,'wall',color,a,b,y0,y1,0,3.5,stock,length,openingId);
    const stud = (name,at,y0,y1,openingId) => wallPart(name,colors.stud,at-0.75,at+0.75,y0,y1,'2×4',y1-y0,openingId);
    let bottomStart = start;
    for (const door of wallOpenings.filter(item=>item.type==='door')) {
      wallPart('Bottom plate',colors.plate,bottomStart,door.offset,0,1.5,'2×4',door.offset-bottomStart);
      bottomStart=door.offset+door.width;
    }
    wallPart('Bottom plate',colors.plate,bottomStart,end,0,1.5,'2×4',end-bottomStart);
    wallPart('Top plate',colors.plate,start,end,h-3,h-1.5,'2×4',end-start);
    wallPart('Cap plate',colors.plate,start,end,h-1.5,h,'2×4',end-start);
    for (const at of intervals(start+0.75,end-0.75,spacing)) {
      const opening = wallOpenings.find(item=>at+0.75>item.offset-3+EPS && at-0.75<item.offset+item.width+3-EPS);
      if (!opening) stud('Wall stud',at,1.5,h-3);
      else if (at>opening.offset+0.75 && at<opening.offset+opening.width-0.75) {
        stud('Upper cripple stud',at,opening.sill+opening.height+5.5,h-3,opening.id);
        if (opening.type==='window') stud('Lower cripple stud',at,1.5,opening.sill-1.5,opening.id);
      }
    }
    for (const opening of wallOpenings) {
      const {offset:a,width,height,sill,type,id} = opening;
      const b=a+width;
      const y=sill+height;
      stud('King stud',a-2.25,1.5,h-3,id);
      stud('King stud',b+2.25,1.5,h-3,id);
      stud('Jack stud',a-0.75,1.5,y,id);
      stud('Jack stud',b+0.75,1.5,y,id);
      for (const depth of [0,2]) {
        wallBox(wall,'Header ply','wall',colors.header,a-1.5,b+1.5,y,y+5.5,depth,depth+1.5,'2×6',width+3,id);
      }
      if (type==='window') wallPart('Rough sill',colors.plate,a,b,sill-1.5,sill,'2×4',width,id);
      if (!visual) continue;
      const isDoor = type==='door';
      wallBox(wall,isDoor?'Door leaf':'Window glass','skin',isDoor?colors.door:colors.glass,a,b,sill,y,-0.38,0.35,null,null,id);
      const trimColor = isDoor ? colors.doorTrim : colors.trim;
      const trimWidth = isDoor ? 2 : 1.5;
      for (const x of [a-trimWidth,b]) wallBox(wall,'Opening trim','skin',trimColor,x,x+trimWidth,sill,y+trimWidth,-1.4,-0.55,null,null,id);
      wallBox(wall,'Opening trim','skin',trimColor,a,b,y,y+trimWidth,-1.4,-0.55,null,null,id);
      if (!isDoor) wallBox(wall,'Sill trim','skin',trimColor,a-trimWidth,b+trimWidth,sill-trimWidth,sill,-1.4,-0.55,null,null,id);
      const mid = (a+b)/2;
      if (!isDoor || width>=48) wallBox(wall,isDoor?'Door seam':'Window mullion','skin',trimColor,mid-0.55,mid+0.55,sill,y,-0.8,-0.4,null,null,id);
      if (!isDoor) wallBox(wall,'Window muntin','skin',trimColor,a,b,sill+height/2-0.5,sill+height/2+0.5,-0.8,-0.4,null,null,id);
      if (isDoor) wallBox(wall,'Door handle','skin',colors.doorTrim,mid+2,mid+3.5,sill+35,sill+38,-1.5,-0.4,null,null,id);
    }

    const rake = a=>top(wallPoint(design,wall,a,h)[0]);
    const split = roof==='gable' && !side ? [0,span/2,span] : [0,span];
    for (const at of intervals(start+0.75,end-0.75,spacing)) {
      const y=rake(at);
      if (y > h+1) stud('Upper wall stud',at,h,y);
    }
    if (visual) {
      for (let i=1;i<split.length;i++) {
        const a=split[i-1],b=split[i];
        wallWedge(wall,'Upper siding','skin',colors.siding,a,b,h,rake(a),rake(b),-0.55,0);
      }
      const boundaries = [0,...wallOpenings.flatMap(item=>[item.offset,item.offset+item.width]),span];
      for (let i=1;i<boundaries.length;i++) {
        const a=boundaries[i-1],b=boundaries[i];
        const opening = wallOpenings.find(item=>a>=item.offset-EPS && b<=item.offset+item.width+EPS);
        if (opening) {
          wallBox(wall,'Wall siding','skin',colors.siding,a,b,0,opening.sill,-0.55,0);
          wallBox(wall,'Wall siding','skin',colors.siding,a,b,opening.sill+opening.height,h,-0.55,0);
        } else wallBox(wall,'Wall siding','skin',colors.siding,a,b,0,h,-0.55,0);
      }
      for (const a of intervals(0.5,span-1,9)) {
        const opening = wallOpenings.find(item=>a+0.55>item.offset-2 && a<item.offset+item.width+2);
        const b=a+0.55;
        const y=rake(a);
        if (opening) {
          wallBox(wall,'Siding batten','skin',colors.batten,a,b,0,opening.sill-1.5,-0.72,-0.55);
          wallBox(wall,'Siding batten','skin',colors.batten,a,b,opening.sill+opening.height+2,y,-0.72,-0.55);
        } else wallBox(wall,'Siding batten','skin',colors.batten,a,b,0,y,-0.72,-0.55);
      }
      for (const a of [0,span-2.25]) wallBox(wall,'Corner trim','skin',colors.trim,a,a+2.25,0,h,-0.94,-0.6);
    }
  }
  const rafters = intervals(0.75,l-0.75,16);
  const runs = roofRuns(design);
  for (const z of rafters) {
    for (const [a,b] of runs) sloped('Rafter','Roof','roof',colors.joist,a,b,z-0.75,z+0.75,5.5,0,'2×6');
    for (const x of [1.8,w-3.4]) {
      count.tie++;
      box('Rafter tie','Hardware','roof',colors.metal,x,x+1.6,top(x)-0.8,top(x)+3.1,z-0.9,z+0.9);
    }
  }
  if (roof==='gable') box('Ridge board','Roof','roof',colors.plate,w/2-0.75,w/2+0.75,top(w/2)-0.65,top(w/2)+6.6,0,l,'2×8',l);
  for (const [a,b] of runs) {
    for (const z of [-o-1.5,l+o]) sloped('Rake fascia','Roof','roof',colors.plate,a,b,z,z+1.5,5.5,0,'2×6');
    sloped('Roof covering','Exterior','roofSkin',colors.roof,a,b,-o,l+o,1,5.65);
    if (visual) {
      for (const z of intervals(-o+0.5,l+o-0.75,15)) {
        sloped('Roof seam','Exterior','roofSkin',colors.seam,a,b,z,z+0.45,0.35,6.65);
      }
    }
  }
  for (const x of [-o,w+o-1.5]) box('Eave fascia','Roof','roof',colors.plate,x,x+1.5,top(x),top(x)+5.5,-o,l+o,'2×6',l+2*o);
  const slope = Math.hypot(1,pitch/12);
  const wallPanels = [
    [w,h+(roof==='gable'?top(w/2)-h:top(w)-h)],[w,h+(roof==='gable'?top(w/2)-h:top(w)-h)],
    [l,top(0)],[l,top(w)]
  ];
  return {geometry,cuts,placed,invalid,count,wallPanels,roofPanels:runs.map(([a,b])=>[(b-a)*slope,l+2*o]),
    floorPanels:[[w,l]], fascia:(2*(l+2*o)+2*(w+2*o)*slope)/12,
    bounds:{x:[-o-2,w+o+2],y:[-12,Math.max(top(0),top(w),top(w/2))+o*pitch/12+7.2],z:[-o-2,l+o+2]}};
}

const KERF = 0.125;
function packStock(pieces,options,strategy) {
  const remaining = [...pieces].sort((a,b)=>b.length-a.length);
  const boards = [];
  const missing = [];
  while (remaining.length) {
    const first = remaining.shift();
    const candidates = options.filter(board=>board.length+EPS>=first.length);
    if (!candidates.length) { missing.push(first); continue; }
    let best = null;
    for (const candidate of candidates) {
      let spare = candidate.length-first.length;
      const indices = [];
      for (let i=0;i<remaining.length;i++) {
        if (remaining[i].length+KERF>spare+EPS) continue;
        spare-=remaining[i].length+KERF;
        indices.push(i);
        if (spare<KERF+EPS) break;
      }
      const used = candidate.length-spare;
      const score = strategy==='tight' ? candidate.length :
        strategy==='yield' ? spare/candidate.length + candidate.length*0.00001 : candidate.price/used;
      if (!best || score<best.score) best={...candidate,spare,indices,score};
    }
    const parts = [first,...best.indices.map(index=>remaining[index])];
    for (const index of best.indices.reverse()) remaining.splice(index,1);
    const exact = best.spare<EPS;
    boards.push({length:best.length,price:best.price,parts,spare:Math.max(0,best.spare-(exact?0:KERF)),
      cuts:Math.max(0,parts.length-(exact?1:0))});
  }
  return {boards,missing,cost:boards.reduce((sum,board)=>sum+board.price,0),
    waste:boards.reduce((sum,board)=>sum+board.spare,0),cuts:boards.reduce((sum,board)=>sum+board.cuts,0)};
}
function sheetCount(surfaces, rotate) {
  const pieces = [];
  for (const [w,h] of surfaces) {
    const dx = rotate?96:48, dy = rotate?48:96;
    for (let x=0;x<w-EPS;x+=dx) for (let y=0;y<h-EPS;y+=dy) {
      const a=Math.min(dx,w-x),b=Math.min(dy,h-y);
      pieces.push(rotate?[b,a]:[a,b]);
    }
  }
  pieces.sort((a,b)=>b[0]*b[1]-a[0]*a[1]);
  const slots = [];
  let sheets = 0;
  for (const [a,b] of pieces) {
    const index = slots.findIndex(([w,h])=>a<=w+EPS && b<=h+EPS);
    let w=48,h=96;
    if (index>=0) [[w,h]]=slots.splice(index,1);
    else sheets++;
    if (w-a>EPS) slots.push([w-a,h]);
    if (h-b>EPS) slots.push([a,h-b]);
  }
  return sheets;
}
export const metricNames = {cost:'Lowest cost',waste:'Least lumber waste',cuts:'Fewest crosscuts'};
export function estimateShed(model,prices,goal='cost') {
  const groups = {Lumber:[],Panels:[],Exterior:[],Openings:[],Hardware:[]};
  const purchases = [];
  const missing = [];
  let waste = 0, crosscuts = 0;
  const add = (group,label,qty,unit,price) => { if(qty) groups[group].push({label,qty,unit,price,total:qty*price}); };
  for (const stock of Object.keys(samplePrices).filter(key=>Array.isArray(samplePrices[key]))) {
    const pieces = model.cuts.filter(item=>item.stock===stock);
    const options = stockSizes.flatMap((length,i)=>prices[stock][i]===null?[]:[{length:length*12,price:prices[stock][i]}]);
    const strategies = ['tight','economy','yield'].map(strategy=>packStock(pieces,options,strategy));
    const result = strategies.sort((a,b)=>a[goal]-b[goal] || a.cost-b.cost || a.waste-b.waste)[0];
    waste+=result.waste;
    crosscuts+=result.cuts;
    missing.push(...result.missing);
    for (const board of result.boards) purchases.push({...board,stock});
    stockSizes.forEach((length,i)=>{
      const qty = result.boards.filter(board=>board.length===length*12).length;
      add('Lumber',stock+' × '+length+'′',qty,'boards',prices[stock][i]);
    });
  }
  for (const [key,label,surfaces] of [['floor','Floor panels',model.floorPanels],
    ['wall','Wall sheathing',model.wallPanels],['roof','Roof sheathing',model.roofPanels]]) {
    const qty=Math.min(sheetCount(surfaces,false),sheetCount(surfaces,true));
    add('Panels',label,qty,'sheets',prices[key]);
    if (key==='wall') add('Exterior','Siding panels',qty,'sheets',prices.siding);
  }
  const roofArea = Math.ceil(model.roofPanels.reduce((sum,[a,b])=>sum+a*b,0)/144);
  add('Exterior','Roof covering',roofArea,'sq ft',prices.roofing);
  add('Exterior','Fascia finish',Math.ceil(model.fascia),'lin ft',prices.trim);
  for (const type of ['door','window']) {
    add('Openings',names[type]+' units',model.placed.filter(opening=>opening.type===type).length,'units',prices[type]);
  }
  add('Hardware','Joist hangers',model.count.hanger,'units',prices.hanger);
  add('Hardware','Rafter ties',model.count.tie,'units',prices.tie);
  add('Hardware','Fastener allowance',1,'lot',prices.fasteners);
  const total=Object.values(groups).flat().reduce((sum,item)=>sum+item.total,0);
  return {groups,total,boards:purchases,missing,waste,crosscuts};
}
