import {contracts,aggregate} from './engine.mjs';
import {settingsColor,chartDate,isRegularSession,barTime} from './settings-model.mjs';
import {escapeHTML as esc} from './workspace-store.mjs';
const money=v=>(v<0?'−':'')+'$'+Math.abs(Number(v)||0).toFixed(2);
export function renderPosition(box,replay,symbol){
 const p=replay.position;
 if(p){const pnl=(replay.current.close-p.entry)*p.side*contracts[symbol].point*p.qty-2*p.fee*p.qty;box.classList.add('active');box.innerHTML='<div class="pos-row"><strong>'+symbol+' · '+(p.side===1?'LONG':'SHORT')+'</strong><span>'+p.qty+' / '+p.initialQty+' контр.</span></div><strong class="pos-pnl '+(pnl>=0?'positive':'negative')+'">'+money(pnl)+'</strong><p>Открытый результат с комиссией · частично реализовано '+money(p.realizedNet)+'</p><div class="pos-row"><span>Вход</span><span class="mono">'+p.entry.toFixed(2)+'</span></div><div class="protection-fields"><label>SL<input type="number" data-position-sl step="0.25" value="'+p.sl+'"></label><label>TP<input type="number" data-position-tp step="0.25" value="'+p.tp+'"></label><button class="button secondary compact" data-action="protect" '+(replay.ended?'disabled':'')+'>Применить уровни</button></div><div class="pos-actions"><button data-action="be" '+(replay.ended?'disabled':'')+'>BE</button><button data-action="be-costs" '+(replay.ended?'disabled':'')+'>BE + издержки</button></div><div class="partial-controls"><label>Закрыть контрактов<input type="number" data-close-qty min="1" max="'+p.qty+'" step="1" value="'+Math.max(1,Math.floor(p.qty/2))+'"></label><button class="button secondary compact" data-action="partial" '+(replay.ended||replay.closePending?'disabled':'')+'>Часть</button></div><div class="pos-actions"><button data-action="close" '+(replay.ended||replay.closePending?'disabled':'')+'>'+(replay.closePending?'Выход ожидается':'Закрыть всё')+'</button></div>'+(replay.ended?'<p>Период завершён · выход возможен только в новой свече.</p>':'');}
 else if(replay.pending){const q=replay.pending;box.classList.add('active');box.innerHTML='<div class="pos-row"><strong>'+(q.side===1?'LONG':'SHORT')+' · '+esc(q.kind.toUpperCase())+'</strong><span>'+q.qty+' контр.</span></div><p>'+(q.kind==='market'?'На следующем открытии':'Уровень активации '+q.entryPrice.toFixed(2))+'</p><div class="pos-row"><span>Стоп / тейк</span><span>'+q.stop+' / '+q.target+' пт</span></div><div class="pos-actions"><button data-action="cancel">Отменить заявку</button></div>';}
 else{box.classList.remove('active');box.innerHTML='<span class="position-icon">⌁</span><strong>Вне позиции</strong><p>Задайте риск, найдите сетап и откройте следующую свечу.</p><button class="button secondary compact" data-action="review">Разобрать последнюю сделку</button>';}
}
export function createComparison({primary,primarySeries,getPrimaryBars=()=>[],getTimeframe=()=>1,getDatasets,getSymbol,getTime,getPreferences,onShow}){
 let chart,series,visible=false,minutes=null,loadVersion=0,rows=[],viewScope='',renderedTime=0,syncingCrosshair=false;
 const button=document.getElementById('compareToggle'),panes=document.getElementById('chartPanes'),card=document.getElementById('chartCard'),expand=document.getElementById('chartExpand'),host=document.createElement('section');host.className='comparison-card chart-pane';host.hidden=true;host.setAttribute('aria-label','Второй инструмент');
 host.innerHTML='<div class="comparison-header"><div><h3 id="comparisonTitle">ES</h3></div><label class="sr-only" for="compareInterval">Таймфрейм второго графика</label><select id="compareInterval"><option value="sync" selected>Как основной</option><option value="1">1m</option><option value="3">3m</option><option value="5">5m</option><option value="15">15m</option><option value="30">30m</option><option value="60">1h</option></select></div><div id="compareChart" class="comparison-chart"></div><p id="compareNotice" class="pane-notice muted"></p>';
 panes.append(host);
 const title=document.getElementById('comparisonTitle'),notice=document.getElementById('compareNotice'),container=document.getElementById('compareChart');
 const interval=()=>minutes??getTimeframe();
 function moveCrosshair(param,target,targetSeries,bars,tf){
  if(!visible||syncingCrosshair||!target||!targetSeries)return;
  syncingCrosshair=true;
  try{const time=Number.isFinite(param.time)?barTime(param.time,tf,getPreferences().session):null,bar=param.point&&bars.find(b=>b.time===time);if(bar)target.setCrosshairPosition(bar.close,bar.time,targetSeries);else target.clearCrosshairPosition();}
  finally{syncingCrosshair=false;}
 }
 primary.subscribeCrosshairMove(param=>moveCrosshair(param,chart,series,rows,interval()));
 function render(){
  if(!visible)return;const L=window.LightweightCharts,p=getPreferences(),symbol=getSymbol()==='NQ'?'ES':'NQ',d=getDatasets()[symbol],now=getTime(),tf=interval();title.textContent=symbol+' · '+tf+'m';host.setAttribute('aria-label','График '+symbol);
  if(!chart){chart=L.createChart(container,{autoSize:true,layout:{attributionLogo:true},timeScale:{timeVisible:true,rightOffset:8,barSpacing:8},rightPriceScale:{scaleMargins:{top:.12,bottom:.12}}});series=chart.addSeries(L.CandlestickSeries,{priceFormat:{type:'price',precision:2,minMove:.25},priceLineVisible:false});chart.subscribeCrosshairMove(param=>moveCrosshair(param,primary,primarySeries,getPrimaryBars(),getTimeframe()));}
  const scope=symbol+':'+(d?.id||'')+':'+tf+':'+p.session,previous=rows,viewport=scope===viewScope&&now>=renderedTime?chart.timeScale().getVisibleLogicalRange():null;
  {
   chart.applyOptions({layout:{background:{type:'solid',color:settingsColor(p,'background')},textColor:settingsColor(p,'text'),fontSize:p.fontSize,fontFamily:'IBM Plex Mono, monospace'},grid:{vertLines:{visible:false},horzLines:{visible:false}},localization:{timeFormatter:t=>chartDate(t,p)},timeScale:{tickMarkFormatter:t=>chartDate(t,p,true)}});
   const revealed=(d?.bars||[]).filter(b=>b.time<=now&&(p.session!=='rth'||isRegularSession(b.time))).slice(-30000);
   series.applyOptions({upColor:settingsColor(p,'up'),downColor:settingsColor(p,'down'),borderUpColor:settingsColor(p,'borderUp'),borderDownColor:settingsColor(p,'borderDown'),wickUpColor:settingsColor(p,'wickUp'),wickDownColor:settingsColor(p,'wickDown'),borderVisible:p.borders,wickVisible:p.wicks});
   rows=aggregate(revealed,tf,(t,m)=>barTime(t,m,p.session));series.setData(rows);
   if(rows.length){
    let range={from:Math.max(-3,rows.length-90),to:rows.length+(p.marginRight??10)};
    if(viewport&&previous.length&&rows[0].time<=previous.at(-1).time){
     const following=viewport.to>=previous.length-1,dropped=rows[0].time>previous[0].time?previous.findIndex(b=>b.time>=rows[0].time):0,shift=following?rows.length-previous.length:-Math.max(0,dropped);
     range={from:viewport.from+shift,to:viewport.to+shift};
    }
    chart.timeScale().setVisibleLogicalRange(range);notice.textContent='Последняя свеча: '+chartDate(revealed.at(-1).time,p)+(now-revealed.at(-1).time>300?' · есть разрыв в данных':'');}
   else notice.textContent='Для '+symbol+' нет данных до текущего момента. Выберите другой период.';
  }
  viewScope=scope;renderedTime=now;
 }
 async function reload(){if(!visible)return;const request=++loadVersion;notice.textContent='Загружаю второй инструмент…';try{await onShow?.();if(request===loadVersion)render();}catch(error){if(request===loadVersion){rows=[];series?.setData([]);notice.textContent=error.message;}}}
 function setVisible(next){visible=Boolean(next);if(!visible)loadVersion++;host.hidden=!visible;panes.classList.toggle('is-dual',visible);button.setAttribute('aria-pressed',String(visible));button.title=visible?'Оставить один график':'Показать NQ и ES рядом';reload();window.dispatchEvent(new Event('resize'));}
 function setExpanded(next){if(card.classList.contains('charts-expanded')===Boolean(next))return;card.classList.toggle('charts-expanded',Boolean(next));document.body.classList.toggle('charts-expanded',Boolean(next));expand.setAttribute('aria-pressed',String(Boolean(next)));expand.setAttribute('aria-label',next?'Свернуть графики':'Развернуть графики');expand.title=next?'Свернуть графики · Esc':'Развернуть графики';window.dispatchEvent(new Event('resize'));}
 button.onclick=()=>setVisible(!visible);expand.onclick=()=>setExpanded(!card.classList.contains('charts-expanded'));
 document.getElementById('compareInterval').onchange=e=>{minutes=e.target.value==='sync'?null:Number(e.target.value);render();};
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&card.classList.contains('charts-expanded')&&!document.querySelector('dialog[open]'))setExpanded(false);});
 return {render,reload,setVisible,setExpanded};
}
