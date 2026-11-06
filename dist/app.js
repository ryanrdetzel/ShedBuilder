import {ShedView} from './view.js';
import {defaults,dimensions,walls,names,stockSizes,samplePrices,priceLabels,metricNames,
  clamp,inch,ft,wallSpan,openingMargin,openingGap,findOpeningSpace,buildShed,estimateShed} from './shed.js';

const icons = {
  shed:'<path d="M2.5 10.5 12 3l9.5 7.5M5 9v11h14V9M10 20v-6h4v6"/>',
  ruler:'<rect x="3" y="8" width="18" height="8" rx="1.5"/><path d="M7 8v4m5-4v2m5-2v4"/>',
  settings:'<path d="M4 6h16M4 12h16M4 18h16"/><circle fill="white" cx="9" cy="6" r="2"/><circle fill="white" cx="15" cy="12" r="2"/><circle fill="white" cx="10" cy="18" r="2"/>',
  reset:'<path d="M4 11a8 8 0 1 1 2.5 6.5M4 5v6h6"/>',
  gable:'<path d="m2.5 13 9.5-7.5 9.5 7.5M5 12v6.5h14V12"/>',
  lean:'<path d="m2.5 13 19-6M5 12v6.5h14V8"/>',
  plus:'<path d="M12 5v14M5 12h14"/>',
  minus:'<path d="M5 12h14"/>',
  cube:'<path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3zm0 18v-9m8-4.5L12 12 4 7.5"/>',
  plan:'<rect x="4" y="4" width="16" height="16" rx="1"/><path d="M4 11h8v9m0-16v3m4 4h4"/>',
  fit:'<path d="M9 4H4v5m11-5h5v5M4 15v5h5m11-5v5h-5"/><circle cx="12" cy="12" r="2"/>',
  pointer:'<path d="m6 3 13 10-6 1.1L10 20 6 3z"/>',
  layers:'<path d="m3 9 9-5 9 5-9 5-9-5zm0 4 9 5 9-5M3 17l9 5 9-5"/>',
  section:'<path d="M4 5h16v14H4zM12 3v3m0 3v2m0 3v2m0 3v2M7 12h2m6 0h2"/>',
  receipt:'<path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3zm3 5h6m-6 4h6m-6 4h3"/>',
  download:'<path d="M12 3v12m-4-4 4 4 4-4M4 16v4h16v-4"/>',
  info:'<circle cx="12" cy="12" r="8"/><path d="M12 11v5m0-8h.01"/>',
  close:'<path d="m6 6 12 12M18 6 6 18"/>',
  door:'<path d="M5 21h14M7 21V4h10v17m-3-8h.01"/>',
  window:'<rect x="4" y="4" width="16" height="16" rx="1"/><path d="M12 4v16M4 12h16"/>',
  chevron:'<path d="m9 6 6 6-6 6"/>',
  panel:'<rect x="4" y="4" width="16" height="16" rx="1"/><path d="m7 15 8-8m-4 10 6-6"/>',
  screw:'<path d="m15 4 5 5m-8-2 5 5M6 18l1-4 8-8 3 3-8 8-4 1zm3-6 3 3"/>'
};
const $ = id=>document.getElementById(id);
const icon = name=>'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+icons[name]+'</svg>';
const markIcons = root=>root.querySelectorAll('[data-icon]').forEach(item=>item.innerHTML=icon(item.dataset.icon));
markIcons(document);
const money = new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0});
const preciseMoney = new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'});
const decimal = new Intl.NumberFormat('en-US',{maximumFractionDigits:1});
const formatMoney = value=>money.format(value);
const num = value=>decimal.format(value);
const storageKey = 'shed-workshop.design.v1';
let saved = {};
try { saved=JSON.parse(localStorage.getItem(storageKey))??{}; } catch {}
let design = {...structuredClone(defaults),...saved.design};
let prices = {...structuredClone(samplePrices),...saved.prices};
let blank = new Set(saved.blank??[]);
let goal = metricNames[saved.goal]?saved.goal:'cost';
let flexibility = 6;
let tab = 'buy';
let model,estimate,editing;
let viewMode = 'model', layer = 'exterior', hideRoof = false, section = false, flip = false;
let openingMessage = '';
const expanded={buy:new Set(),cuts:new Set()};
const view = new ShedView($('model'),{
  move:(id,offset)=>{
    const item=design.openings.find(opening=>opening.id===id);
    if(item) { item.offset=offset; renderDesign(); }
  },
  edit:id=>openOpening(design.openings.find(item=>item.id===id)),
  inspect:showInspector
});

function persist() {
  try {
    localStorage.setItem(storageKey,JSON.stringify({design,prices,blank:[...blank],goal}));
    $('save-status').textContent='Saved on this device';
  } catch {
    $('save-status').textContent='This session only';
  }
}
function loadInputs() {
  for(const key of Object.keys(dimensions)) $(key).value=blank.has(key)?'':+(design[key]/12).toFixed(4);
  for(const key of ['spacing','pitch','overhang']) $(key).value=design[key];
}
function renderDesign() {
  model=buildShed(design);
  estimate=estimateShed(model,prices,goal);
  view.selection=null;
  showInspector(null);
  view.setModel(design,model);
  $('area').textContent=num(design.width*design.length/144)+' sq ft';
  for(const button of document.querySelectorAll('[data-roof]')) button.setAttribute('aria-pressed',String(button.dataset.roof===design.roof));
  renderOpenings();
  renderEstimate();
  persist();
}
function renderOpenings() {
  const placedById=new Map(model.placed.map(item=>[item.id,item]));
  $('opening-count').textContent=design.openings.length;
  $('opening-list').innerHTML=design.openings.map(item=>{
    const placed=placedById.get(item.id);
    return '<button type="button" class="opening-item" data-opening="'+item.id+'"><span class="item-icon">'+icon(item.type)+
      '</span><span><strong>'+names[item.type]+' · '+names[item.wall]+'</strong><small>'+inch(item.width)+' × '+inch(item.height)+
      (placed?' · '+inch(placed.offset)+' offset':' · Needs adjustment')+
      '</small></span><span class="chevron">'+icon('chevron')+'</span></button>';
  }).join('');
  $('opening-note').textContent=model.invalid.length ? 'Some openings need more room. Edit them to include them in the model.' : openingMessage;
}
function refreshView() {
  for(const button of document.querySelectorAll('[data-view]')) button.setAttribute('aria-pressed',String(button.dataset.view===viewMode));
  for(const button of document.querySelectorAll('[data-layer]')) button.setAttribute('aria-pressed',String(button.dataset.layer===layer));
  $('viewer-label').textContent=viewMode==='plan'?'TOP VIEW':'LIVE MODEL';
  $('model').classList.toggle('plan',viewMode==='plan');
  $('model').setAttribute('aria-label',viewMode==='plan'?'Shed floor plan. Drag openings along their wall or use Design settings to edit.':'Interactive shed model. Use arrow keys to orbit or drag with your pointer.');
  $('viewer-bottom').hidden=viewMode==='plan';
  $('stage-tools').hidden=viewMode==='plan';
  $('section-controls').hidden=viewMode==='plan'||!section;
  $('roof-toggle').setAttribute('aria-pressed',String(hideRoof));
  $('roof-toggle').innerHTML=icon('gable')+(hideRoof?' Show roof':' Hide roof');
  $('section-toggle').setAttribute('aria-pressed',String(section));
  $('flip-cut').setAttribute('aria-pressed',String(flip));
  $('depth-value').textContent=$('cut-depth').value+'%';
  $('stage-caption').innerHTML=icon('pointer')+(viewMode==='plan'?' Drag an opening to move it <b>·</b> Click to edit':' Drag to orbit <b>·</b> Scroll to zoom <b>·</b> Click to inspect');
  view.selection=null;
  showInspector(null);
  view.setView({mode:viewMode,layer,hideRoof,section:section?{axis:$('axis').value,depth:+$('cut-depth').value,flip}:null});
}
function showInspector(part) {
  const element=$('inspector');
  element.hidden=!part;
  if(!part) return;
  const detail=part.stock?part.stock+' · '+ft(part.length):part.section;
  element.innerHTML='<strong>'+part.id+' · '+part.name+'</strong><small>'+detail+
    '</small><button class="icon-button" type="button" aria-label="Clear selection">'+icon('close')+'</button>';
  element.querySelector('button').addEventListener('click',()=>{
    view.selection=null;
    showInspector(null);
    view.request();
  });
}
function openingFields() {
  const wall=$('opening-wall').value;
  $('opening-help').textContent='Offset is measured from the start of the '+wall+' wall, going clockwise from the front-left corner. Wall span '+ft(wallSpan(design,wall))+'.';
}
function openOpening(item, isNew=false) {
  if(!item) return;
  openingMessage='';
  editing={...item,isNew};
  $('opening-title').textContent=(isNew?'Add ':'Edit ')+names[item.type].toLowerCase();
  $('opening-wall').value=item.wall;
  $('opening-offset').value=model.placed.find(placed=>placed.id===item.id)?.offset??item.offset;
  for(const key of ['width','height','sill']) $('opening-'+key).value=item[key];
  $('sill-label').hidden=item.type==='door';
  $('opening-sill').disabled=item.type==='door';
  $('remove-opening').hidden=isNew;
  $('opening-error').hidden=true;
  openingFields();
  $('opening-dialog').showModal();
}
function addOpening(type) {
  const width=type==='door'?36:30;
  if(design.openings.length>=16) {
    openingMessage='This version supports up to 16 openings.';
    renderOpenings();
    return;
  }
  for(const wall of walls) {
    const offset=findOpeningSpace(design,wall,width,null,(wallSpan(design,wall)-width)/2);
    if(offset===null) continue;
    openOpening({id:type+'-'+Date.now().toString(36),type,wall,offset:Math.round(offset*4)/4,
      width,height:type==='door'?72:32,sill:type==='door'?0:36},true);
    return;
  }
  openingMessage='There’s no space for another opening at the default width.';
  renderOpenings();
}
function errorOpening(message) {
  $('opening-error').textContent=message;
  $('opening-error').hidden=false;
}
$('opening-form').addEventListener('submit',event=>{
  event.preventDefault();
  const {isNew,...opening}=editing;
  opening.wall=$('opening-wall').value;
  for(const key of ['offset','width','height','sill']) opening[key]=+$('opening-'+key).value;
  const span=wallSpan(design,opening.wall);
  if(opening.offset<openingMargin || opening.offset+opening.width>span-openingMargin) return errorOpening('Leave at least '+openingMargin+' inches between the opening and either corner.');
  if(opening.sill+opening.height+9>design.height || (opening.type==='window'&&opening.sill<1.5)) return errorOpening('Adjust the height or sill to leave 9 inches above the opening and, for a window, at least 1½ inches below.');
  const available=findOpeningSpace(design,opening.wall,opening.width,opening.id,opening.offset);
  if(available===null || Math.abs(available-opening.offset)>0.01) return errorOpening('That opening needs at least '+openingGap+' inches of space from the next opening.');
  design.openings=isNew?[...design.openings,opening]:design.openings.map(item=>item.id===opening.id?opening:item);
  $('opening-dialog').close();
  renderDesign();
});

const groupIcons = {Lumber:'layers',Panels:'panel',Exterior:'shed',Openings:'window',Hardware:'screw'};
function detailGroup(name,title,summary,rows,type,groupIcon) {
  return '<details class="material-group" data-group="'+name+'" '+(expanded[type].has(name)?'open':'')+'><summary><span class="group-label">'+
    icon(groupIcon)+' '+title+'</span><span>'+summary+'</span><span class="chevron">'+icon('chevron')+
    '</span></summary><ul>'+rows.join('')+'</ul></details>';
}
function shoppingHtml() {
  return Object.entries(estimate.groups).filter(([,rows])=>rows.length).map(([name,rows])=>
    detailGroup(name,name,formatMoney(rows.reduce((sum,row)=>sum+row.total,0)),rows.map(row=>
      '<li><span>'+row.label+'</span><span>'+row.qty+' '+row.unit+' · '+formatMoney(row.total)+'</span></li>'),'buy',groupIcons[name])).join('');
}
function cutsHtml() {
  let html='<p class="tab-note">'+estimate.boards.length+' stock boards · '+estimate.crosscuts+
    ' crosscuts · '+num(estimate.waste/12)+' ft of offcuts. Export for board-by-board assignments.</p>';
  for(const stock of Object.keys(samplePrices).filter(key=>Array.isArray(samplePrices[key]))) {
    const pieces=model.cuts.filter(piece=>piece.stock===stock);
    if(!pieces.length) continue;
    html+=detailGroup(stock,stock+' cuts',pieces.length+' pieces',pieces.map(piece=>
      '<li class="cut-piece"><span>'+piece.id+' · '+piece.name+'<small>'+piece.section+'</small></span><span>'+ft(piece.length)+'</span></li>'),'cuts','layers');
  }
  return html;
}
function variants() {
  const options=[];
  const lengths=new Set([design.length]);
  if(flexibility) {
    lengths.add(design.length-flexibility);
    lengths.add(design.length+flexibility);
    for(let length=Math.ceil((design.length-flexibility)/3)*3;length<=design.length+flexibility;length+=3) lengths.add(length);
  }
  for(const length of lengths) {
    const delta=length-design.length;
    if(length<dimensions.length[0] || length>dimensions.length[1]) continue;
    const candidate={...design,length};
    const candidateModel=delta===0?model:buildShed(candidate,false);
    if(candidateModel.invalid.length) continue;
    if(candidateModel.placed.some(opening=>opening.offset!==model.placed.find(item=>item.id===opening.id)?.offset)) continue;
    for(const metric of Object.keys(metricNames)) {
      const result=estimateShed(candidateModel,prices,metric);
      if(!result.missing.length) options.push({delta,length,metric,result});
    }
  }
  return options;
}
function changeLabel(difference) {
  if(Math.abs(difference)<0.5) return 'Same estimated cost';
  return formatMoney(Math.abs(difference))+(difference<0?' less':' more');
}
function compareHtml() {
  const options=variants();
  const header='<div class="compare-head"><label>Length can change by <select id="flexibility">'+
    [0,3,6,12].map(value=>'<option value="'+value+'" '+(value===flexibility?'selected':'')+'>'+(value?'± '+value+' in':'Keep length')+'</option>').join('')+
    '</select></label></div><p class="tab-note">Width and openings stay fixed. Compares nearby lengths and stock cuts at your prices.</p>';
  if(!options.length) return header+'<p class="tab-note">Make room for the openings and price the missing stock lengths to compare options.</p>';
  return header+Object.entries(metricNames).map(([metric,label])=>{
    const best=options.filter(option=>option.metric===metric).sort((a,b)=>a.result[metric]-b.result[metric]||
      a.result.total-b.result.total||Math.abs(a.delta)-Math.abs(b.delta))[0];
    const result=best.result;
    const active=best.delta===0 && goal===metric;
    const value=metric==='cost'?formatMoney(result.total):metric==='waste'?num(result.waste/12)+' ft of offcuts':result.crosscuts+' crosscuts';
    const lengthLabel=best.delta===0?'Same footprint':ft(best.length)+' long · '+inch(Math.abs(best.delta))+(best.delta>0?' longer':' shorter');
    const boardDelta=result.boards.length-estimate.boards.length;
    const sheetDelta=Object.values(result.groups).flat().filter(row=>row.unit==='sheets').reduce((sum,row)=>sum+row.qty,0)
      - Object.values(estimate.groups).flat().filter(row=>row.unit==='sheets').reduce((sum,row)=>sum+row.qty,0);
    const quantityDelta=(delta,unit)=>delta ? Math.abs(delta)+' '+(delta>0?'more':'fewer')+' '+unit : null;
    const stats=[quantityDelta(boardDelta,'boards'),quantityDelta(sheetDelta,'sheets')].filter(Boolean).join(' · ');
    const costChange=estimate.missing.length?'Current estimate is partial':changeLabel(result.total-estimate.total);
    return '<article class="compare-card"><div class="compare-title">'+label+'</div><div class="compare-metric">'+value+
      '</div><p>'+lengthLabel+' · '+costChange+(stats?'<br>'+stats:'')+'</p><button type="button" class="button" data-apply="'+metric+'" data-length="'+best.length+'" '+
      (active?'disabled':'')+'>'+(active?'Current option':'Apply option')+'</button></article>';
  }).join('');
}
function renderEstimate() {
  $('total').textContent=formatMoney(estimate.total);
  $('total').title=preciseMoney.format(estimate.total);
  $('pricing-note').textContent=estimate.missing.length?estimate.missing.length+' lumber pieces need a stocked length. Total is partial.' :
    JSON.stringify(prices)===JSON.stringify(samplePrices)?'Sample prices in USD.':'Estimate at your unit prices.';
  const panel=$('estimate-content');
  const scroll=panel.scrollTop;
  panel.innerHTML=tab==='buy'?shoppingHtml():tab==='cuts'?cutsHtml():compareHtml();
  panel.scrollTop=scroll;
  for(const detail of panel.querySelectorAll('[data-group]')) detail.addEventListener('toggle',()=>{
    if(detail.open) expanded[tab]?.add(detail.dataset.group);
    else expanded[tab]?.delete(detail.dataset.group);
  });
  for(const button of document.querySelectorAll('[data-tab]')) {
    button.setAttribute('aria-selected',String(button.dataset.tab===tab));
    button.tabIndex=button.dataset.tab===tab?0:-1;
  }
}
function renderPriceFields(current) {
  const field=(key,label,price,optional=false)=>'<label>'+label+'<input name="'+key+'" type="number" min="0" max="100000" step="0.01" '+
    (optional?'placeholder="Unavailable"':'required')+' value="'+(price??'')+'"></label>';
  $('price-fields').innerHTML=Object.keys(samplePrices).filter(key=>Array.isArray(samplePrices[key])).map(key=>
    '<details class="price-group"><summary>'+key+' stock boards</summary><div class="price-grid">'+stockSizes.map((size,index)=>
      field(key+'_'+index,size+' ft',current[key][index],true)).join('')+'</div></details>').join('')+
    '<details class="price-group" open><summary>Panels, finish, and hardware</summary><div class="price-grid">'+
    Object.entries(priceLabels).map(([key,label])=>field(key,label,current[key])).join('')+'</div></details>';
}
function exportCsv() {
  const rows=[['Shed Workshop material estimate'],['Width',ft(design.width),'Length',ft(design.length),'Wall height',ft(design.height)],
    ['Concept model. Verify all dimensions and sizing before building.'],['Panel quantities are layout estimates. Lumber cuts are rough lengths.'],
    [],['Category','Item','Quantity','Unit','Unit price USD','Subtotal USD']];
  for(const [group,items] of Object.entries(estimate.groups)) {
    for(const item of items) rows.push([group,item.label,item.qty,item.unit,item.price.toFixed(2),item.total.toFixed(2)]);
  }
  rows.push(['','Estimated total','','','',estimate.total.toFixed(2)],[],
    ['Stock board','Stock type','Board length in','Cut part','Description','Assembly','Rough cut length in']);
  estimate.boards.forEach((board,index)=>board.parts.forEach(part=>rows.push([
    index+1,board.stock,board.length,part.id,part.name,part.section,part.length.toFixed(3)
  ])));
  for(const piece of estimate.missing) rows.push(['UNPRICED',piece.stock,'',piece.id,piece.name,piece.section,piece.length.toFixed(3)]);
  const csv=rows.map(row=>row.map(value=>'"'+String(value).replaceAll('"','""')+'"').join(',')).join('\r\n');
  const url=URL.createObjectURL(new Blob(['\uFEFF',csv],{type:'text/csv;charset=utf-8'}));
  const link=document.createElement('a');
  link.href=url;
  link.download='shed-workshop-materials.csv';
  link.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}

for(const [key,[min,max]] of Object.entries(dimensions)) {
  const input=$(key);
  function accept(commit) {
    if(input.validity.badInput) { if(commit) input.value=+(design[key]/12).toFixed(4); return; }
    if(input.value==='') {
      blank.add(key);
      design[key]=defaults[key];
    } else {
      const value=input.valueAsNumber*12;
      if(!Number.isFinite(value) || (!commit&&(value<min-0.01 || value>max+0.01))) return;
      blank.delete(key);
      design[key]=Math.round(clamp(value,min,max)*4)/4;
      if(commit) input.value=+(design[key]/12).toFixed(4);
    }
    renderDesign();
  }
  input.addEventListener('input',()=>accept(false));
  input.addEventListener('change',()=>accept(true));
}
for(const key of ['spacing','pitch','overhang']) $(key).addEventListener('change',()=>{
  design[key]=+$(key).value;
  renderDesign();
});
for(const button of document.querySelectorAll('[data-roof]')) button.addEventListener('click',()=>{
  design.roof=button.dataset.roof;
  renderDesign();
});
for(const button of document.querySelectorAll('[data-add]')) button.addEventListener('click',()=>addOpening(button.dataset.add));
$('opening-list').addEventListener('click',event=>{
  const button=event.target.closest('[data-opening]');
  if(button) openOpening(design.openings.find(item=>item.id===button.dataset.opening));
});
$('opening-wall').addEventListener('change',()=>{
  const width=+$('opening-width').value;
  const wall=$('opening-wall').value;
  const offset=findOpeningSpace(design,wall,width,editing.id,(wallSpan(design,wall)-width)/2);
  if(offset!==null) $('opening-offset').value=Math.round(offset*4)/4;
  openingFields();
});
$('remove-opening').addEventListener('click',()=>{
  design.openings=design.openings.filter(item=>item.id!==editing.id);
  $('opening-dialog').close();
  renderDesign();
});
for(const button of document.querySelectorAll('.close-dialog')) button.addEventListener('click',()=>button.closest('dialog').close());
for(const button of document.querySelectorAll('[data-view]')) button.addEventListener('click',()=>{viewMode=button.dataset.view;refreshView();});
for(const button of document.querySelectorAll('[data-layer]')) button.addEventListener('click',()=>{layer=button.dataset.layer;refreshView();});
$('roof-toggle').addEventListener('click',()=>{hideRoof=!hideRoof;refreshView();});
$('section-toggle').addEventListener('click',()=>{section=!section;refreshView();});
$('flip-cut').addEventListener('click',()=>{flip=!flip;refreshView();});
$('axis').addEventListener('change',refreshView);
$('cut-depth').addEventListener('input',refreshView);
$('zoom-in').addEventListener('click',()=>view.zoom(1.2));
$('zoom-out').addEventListener('click',()=>view.zoom(1/1.2));
$('home-camera').addEventListener('click',()=>view.home());
function changeTab(value) {
  tab=value;
  $('estimate-content').scrollTop=0;
  renderEstimate();
}
const tabs=[...document.querySelectorAll('[data-tab]')];
for(const button of tabs) button.addEventListener('click',()=>changeTab(button.dataset.tab));
$('estimate-tabs').addEventListener('keydown',event=>{
  const index=tabs.findIndex(button=>button.dataset.tab===tab);
  const target={ArrowLeft:(index+tabs.length-1)%tabs.length,ArrowRight:(index+1)%tabs.length,Home:0,End:tabs.length-1}[event.key];
  if(target===undefined) return;
  event.preventDefault();
  changeTab(tabs[target].dataset.tab);
  tabs[target].focus();
});
$('estimate-content').addEventListener('change',event=>{
  if(event.target.id!=='flexibility') return;
  flexibility=+event.target.value;
  renderEstimate();
  $('flexibility').focus();
});
$('estimate-content').addEventListener('click',event=>{
  const button=event.target.closest('[data-apply]');
  if(!button) return;
  design.length=+button.dataset.length;
  blank.delete('length');
  goal=button.dataset.apply;
  loadInputs();
  renderDesign();
});
$('edit-prices').addEventListener('click',()=>{
  renderPriceFields(prices);
  $('prices-dialog').showModal();
});
$('reset-prices').addEventListener('click',()=>renderPriceFields(samplePrices));
$('prices-form').addEventListener('submit',event=>{
  event.preventDefault();
  const fields=new FormData(event.target);
  for(const key of Object.keys(samplePrices)) {
    if(Array.isArray(samplePrices[key])) prices[key]=stockSizes.map((size,index)=>{
      const value=fields.get(key+'_'+index);
      return value===''?null:Number(value);
    });
    else prices[key]=Number(fields.get(key));
  }
  $('prices-dialog').close();
  renderDesign();
});
$('export').addEventListener('click',exportCsv);
$('reset').addEventListener('click',()=>{
  $('reset-dialog').returnValue='';
  $('reset-dialog').showModal();
});
$('reset-dialog').addEventListener('close',()=>{
  if($('reset-dialog').returnValue!=='reset') return;
  design=structuredClone(defaults);
  blank=new Set();
  goal='cost';
  viewMode='model';
  layer='exterior';
  hideRoof=section=flip=false;
  $('cut-depth').value=50;
  $('axis').value='z';
  view.home();
  openingMessage='';
  loadInputs();
  refreshView();
  renderDesign();
});

loadInputs();
refreshView();
renderDesign();
