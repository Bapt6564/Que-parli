/* ============================================================
   Que parli — logique principale

   Modèle public d'une carte :
   {
     "fr": "femme",
     "translations": [
       {"oc": "hemna", "dialect": "Bigorre"},
       {"oc": "...",   "dialect": "Gers"}
     ],
     "tag": "vocabulaire",   // facultatif
     "note": "..."           // facultatif
   }
   ============================================================ */
let SEED = [];
let LEXICON = [];
const KEY = "gascon:deck";
const STATS_KEY = "gascon:stats";
const TABS = ["estudi","cartas","gramatica","sons","lexic"];
let deck = [], current = null, revealed = false, editingId = null;
let sessionDirection = null, sessionTranslation = null;
let stats = {days:{},total:0,correct:0};
let studyDirection = localStorage.getItem("gascon:direction") || "fr-oc";

const today=()=>new Date().toISOString().slice(0,10);
const addDays=n=>new Date(Date.now()+n*864e5).toISOString().slice(0,10);
const esc=s=>String(s||"").replace(/[&<>\"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const $=id=>document.getElementById(id);

function cleanTranslations(rows){
  const seen=new Set();
  return (Array.isArray(rows)?rows:[]).map(row=>typeof row==="string"?{oc:row}:row||{})
    .map(row=>({oc:String(row.oc||"").trim(),dialect:String(row.dialect||"").trim()}))
    .filter(row=>row.oc && !seen.has((row.oc+"|"+row.dialect).toLowerCase()) && seen.add((row.oc+"|"+row.dialect).toLowerCase()));
}

// Accepte le nouveau format et migre automatiquement les anciennes cartes {oc, fr, dialect}.
function normalizePublicCard(row){
  if(Array.isArray(row)){
    return {fr:row[1]||"",translations:cleanTranslations([{oc:row[0]||"",dialect:(row.length>=7?row[6]:row[4])||""}]),tag:row[2]||"",note:row[3]||""};
  }
  if(Array.isArray(row?.translations)){
    return {fr:row.fr||"",translations:cleanTranslations(row.translations),tag:row.tag||"",note:row.note||""};
  }
  return {fr:row?.fr||"",translations:cleanTranslations([{oc:row?.oc||"",dialect:row?.dialect||""}]),tag:row?.tag||"",note:row?.note||""};
}

// L'identité dépend du sens français et de l'ensemble des formes occitanes.
function cardKey(card){
  const forms=cleanTranslations(card.translations).map(t=>`${t.oc}|${t.dialect}`).sort().join("||");
  return `${String(card.fr||"").trim()}|||${forms}`;
}
function mk(data,verified,dirty=false,baseKey=null){
  const c=normalizePublicCard(data);
  return {id:"c"+Math.random().toString(36).slice(2,10),...c,verified:!!verified,due:null,ivl:0,ease:2.5,reps:0,dirty:!!dirty,baseKey:baseKey||null};
}
function searchable(c){return [c.fr,c.tag,c.note,...c.translations.flatMap(t=>[t.oc,t.dialect])].join(" ").toLowerCase();}

async function loadFragments(){
  const html=await Promise.all(TABS.map(async id=>{const r=await fetch(`pages/${id}.html`,{cache:"no-store"});if(!r.ok)throw new Error(`Impossible de charger ${id}`);return r.text();}));
  $("tab-content").innerHTML=html.join("\n");
}
async function load(){
  $("study-area").innerHTML='<div class="empty"><p>Chargement du paquet…</p></div>';
  try{
    const r=await fetch("data/cards.json",{cache:"no-store"}); if(!r.ok)throw new Error(r.status);
    SEED=(await r.json()).map(normalizePublicCard).filter(c=>c.fr&&c.translations.length);
    const lr=await fetch("data/lexique.json",{cache:"no-store"}); if(lr.ok)LEXICON=await lr.json();
  }catch(e){console.error(e);$("study-area").innerHTML='<div class="empty"><p>Impossible de charger les cartes.</p><p>Utilise GitHub Pages ou un serveur local.</p></div>';return;}
  try{
    const raw=JSON.parse(localStorage.getItem(KEY)||"[]");
    deck=Array.isArray(raw)?raw.map(old=>{
      const linguistic=normalizePublicCard(old);
      return {...old,...linguistic,id:old.id||"c"+Math.random().toString(36).slice(2,10),verified:!!old.verified,due:old.due??null,ivl:old.ivl||0,ease:old.ease||2.5,reps:old.reps||0,dirty:!!old.dirty,baseKey:old.baseKey||null};
    }).filter(c=>c.fr&&c.translations.length):[];
    stats=JSON.parse(localStorage.getItem(STATS_KEY)||"null")||stats;
  }catch(e){console.warn(e);deck=[];}
  if(!deck.length) deck=SEED.map(s=>mk(s,false));
  else{
    const have=new Set(deck.map(cardKey));
    SEED.forEach(s=>{const k=cardKey(s);if(!have.has(k)){deck.push(mk(s,false));have.add(k);}});
  }
  await save();
  if($("study-direction"))$("study-direction").value=studyDirection;
  resetTranslationFields(); next(); renderDeck(); initLexicon();
}
async function save(){try{localStorage.setItem(KEY,JSON.stringify(deck));}catch(e){console.error(e);if($("add-msg"))$("add-msg").textContent="Enregistrement local impossible : exporte une sauvegarde.";}}
function saveStats(){localStorage.setItem(STATS_KEY,JSON.stringify(stats));}
function recordAnswer(g){const d=today(),day=stats.days[d]||{reviewed:0,correct:0};day.reviewed++;stats.total++;if(g>0){day.correct++;stats.correct++;}stats.days[d]=day;saveStats();renderStats();}
function currentStreak(){let n=0,d=new Date();while(true){const k=d.toISOString().slice(0,10);if(!stats.days[k]?.reviewed)break;n++;d.setDate(d.getDate()-1);}return n;}
function renderStats(){const b=$("stats");if(!b)return;const day=stats.days[today()]||{reviewed:0};const a=stats.total?Math.round(100*stats.correct/stats.total):0;b.innerHTML=`<div><b>${day.reviewed}</b> aujourd’hui</div><div><b>${currentStreak()}</b> jour${currentStreak()>1?"s":""} de suite</div><div><b>${a}%</b> de réussite</div>`;}
const dueCards=()=>{const t=today();return deck.filter(c=>c.due&&c.due<=t);};
const newCards=()=>deck.filter(c=>!c.due);
function pick(){const d=dueCards();if(d.length)return d[Math.floor(Math.random()*d.length)];const n=newCards();return n[0]||null;}
function counts(){$("c-due").textContent=dueCards().length;$("c-new").textContent=newCards().length;$("c-tot").textContent=deck.length;renderStats();}
function next(){revealed=false;sessionDirection=null;sessionTranslation=null;current=pick();counts();const a=$("study-area");if(!deck.length){a.innerHTML='<div class="empty"><p>Le paquet est vide.</p></div>';return;}if(!current){a.innerHTML='<div class="empty"><p>Rien à revoir aujourd’hui.</p></div>';return;}draw();}
function ocDisplay(t){const starts=/^qu[e']/i.test(t.oc.trim());const body=starts?t.oc.trim().replace(/^que\b/i,"").replace(/^qu'/i,"'"):t.oc;return '<div class="answer-variant"><div class="answer-oc">'+(starts?'<span class="que">que</span>':'')+'<span>'+esc(body.trim())+'</span></div>'+(t.dialect?'<div class="variant-dialect">'+esc(t.dialect)+'</div>':'')+'</div>';}
function draw(){
  const c=current,a=$("study-area");
  if(!sessionDirection)sessionDirection=studyDirection==="mix"?(Math.random()<.5?"fr-oc":"oc-fr"):studyDirection;
  // En occitan → français, une seule variante est tirée comme question.
  if(!sessionTranslation)sessionTranslation=c.translations[Math.floor(Math.random()*c.translations.length)];
  const forward=sessionDirection==="fr-oc";
  const prompt=forward?c.fr:sessionTranslation.oc;
  const label=forward?"Comment dit-on":"Que veut dire";
  let h='<div class="card"><div class="prompt-label">'+label+'</div><p class="prompt">'+esc(prompt)+'</p>';
  if(!forward&&sessionTranslation.dialect)h+='<div class="provenance">'+esc(sessionTranslation.dialect)+'</div>';
  if(revealed){
    h+='<div class="answer reveal">';
    if(forward)h+='<div class="answer-variants">'+c.translations.map(ocDisplay).join("")+'</div>';
    else h+='<div class="answer-oc"><span>'+esc(c.fr)+'</span></div>';
    if(c.note)h+='<div class="note">'+esc(c.note)+'</div>';
    h+=(c.verified?'<span class="chip ok">vérifiée</span>':'<span class="chip">à vérifier</span>')+'</div>';
  }
  h+='</div>';
  if(!revealed)h+='<div class="actions"><button class="act primary" onclick="reveal()">Voir la réponse</button></div>';
  else h+='<div class="actions"><button class="act again" onclick="grade(0)">Encore<small>aujourd’hui</small></button><button class="act" onclick="grade(1)">Dur<small>'+prev(1)+'</small></button><button class="act primary" onclick="grade(2)">Su<small>'+prev(2)+'</small></button><button class="act" onclick="grade(3)">Facile<small>'+prev(3)+'</small></button></div><div class="linkrow"><button class="linkbtn" onclick="toggleVerify()">'+(c.verified?'Marquer à vérifier':'Marquer vérifiée')+'</button><button class="linkbtn" onclick="editCard(\''+c.id+'\')">Corriger cette carte</button></div>';
  a.innerHTML=h;
}
function reveal(){revealed=true;draw();}
function ivlFor(c,g){if(g===0)return 0;if(!c.reps)return g===1?1:g===2?2:4;return Math.max(1,Math.round(c.ivl*(g===1?1.2:g===2?c.ease:c.ease*1.3)));}
function prev(g){const d=ivlFor(current,g);return d===1?"1 jour":d+" jours";}
async function grade(g){const c=current;recordAnswer(g);c.ivl=ivlFor(c,g);c.ease=Math.max(1.3,c.ease+(g===0?-.2:g===1?-.15:g===3?.15:0));c.reps=g===0?0:c.reps+1;c.due=g===0?today():addDays(c.ivl);await save();next();renderDeck();}
async function toggleVerify(){current.verified=!current.verified;await save();draw();renderDeck();}

/* ---------- formulaire à plusieurs traductions ---------- */
function translationRow(value={oc:"",dialect:""}){const row=document.createElement("div");row.className="translation-row";row.innerHTML='<div><label>Gascon</label><input class="f-oc" type="text" placeholder="hemna" value="'+esc(value.oc)+'"></div><div class="dialect-wrap"><label>Dialecte</label><input class="f-dialect" type="text" placeholder="Bigorre, Gers…" value="'+esc(value.dialect)+'"></div><button class="iconbtn" type="button" title="Supprimer cette traduction" onclick="removeTranslationField(this)">×</button>';return row;}
function addTranslationField(value={}){$("translation-fields").appendChild(translationRow(value));}
function removeTranslationField(button){const box=$("translation-fields");if(box.children.length>1)button.closest(".translation-row").remove();else{box.querySelector(".f-oc").value="";box.querySelector(".f-dialect").value="";}}
function resetTranslationFields(values=[{}]){const box=$("translation-fields");if(!box)return;box.innerHTML="";values.forEach(addTranslationField);}
function readTranslationFields(){return cleanTranslations([...document.querySelectorAll(".translation-row")].map(row=>({oc:row.querySelector(".f-oc").value,dialect:row.querySelector(".f-dialect").value})));}
function editCard(id){const c=deck.find(x=>x.id===id);if(!c)return;editingId=id;$("f-fr").value=c.fr;$("f-t").value=c.tag;$("f-note").value=c.note;resetTranslationFields(c.translations);$("form-title").textContent="Corriger la carte";$("form-sub").classList.add("hidden");$("form-shell").classList.add("editing");$("edit-flag").textContent="en cours de correction";$("edit-flag").classList.remove("hidden");$("btn-save").textContent="Enregistrer";$("btn-cancel").classList.remove("hidden");$("add-msg").textContent="";show("cartas");$("f-fr").focus();}
function cancelEdit(){editingId=null;["f-fr","f-t","f-note"].forEach(i=>$(i).value="");resetTranslationFields();$("form-title").textContent="Ajouter une carte";$("form-sub").classList.remove("hidden");$("form-shell").classList.remove("editing");$("edit-flag").classList.add("hidden");$("btn-save").textContent="Ajouter la carte";$("btn-cancel").classList.add("hidden");$("add-msg").textContent="";}
async function saveCard(){const fr=$("f-fr").value.trim(),translations=readTranslationFields(),msg=$("add-msg");if(!fr||!translations.length){msg.textContent="Il faut le français et au moins une traduction occitane.";return;}const data={fr,translations,tag:$("f-t").value.trim(),note:$("f-note").value.trim()};if(editingId){const c=deck.find(x=>x.id===editingId);if(c){if(!c.baseKey)c.baseKey=cardKey(c);Object.assign(c,data,{verified:true,dirty:true});await save();const was=current?.id===editingId;cancelEdit();msg.textContent="Carte corrigée.";renderDeck();if(was)draw();}return;}deck.push(mk(data,true,true));await save();$("f-fr").value="";$("f-note").value="";resetTranslationFields();msg.textContent="Carte ajoutée au paquet.";counts();renderDeck();if(!current)next();}
async function addBulk(){const ta=$("bulk"),msg=$("bulk-msg"),tag=$("f-t").value.trim();let n=0;for(const line of ta.value.split("\n")){const p=line.split(/\t|;|=/);if(p.length>=2&&p[0].trim()&&p[1].trim()){deck.push(mk({fr:p[1].trim(),translations:[{oc:p[0].trim()}],tag},true,true));n++;}}if(!n){msg.textContent="Aucune paire reconnue.";return;}await save();ta.value="";msg.textContent=n+" carte"+(n>1?"s":"")+" ajoutée"+(n>1?"s":"")+".";counts();renderDeck();if(!current)next();}

function renderDeck(){const el=$("deck-list"),q=($("filter").value||"").trim().toLowerCase();const shown=q?deck.filter(c=>searchable(c).includes(q)):deck;const check=deck.filter(c=>!c.verified).length;$("deck-sub").textContent=deck.length+" carte"+(deck.length>1?"s":"")+(check?" · "+check+" à vérifier":" · toutes vérifiées")+(q?" · "+shown.length+" affichée"+(shown.length>1?"s":""):"");const pending=deck.filter(c=>c.dirty).length;if($("sync-sub"))$("sync-sub").textContent=pending?pending+" changement"+(pending>1?"s":"")+" local"+(pending>1?"aux":"")+" à exporter vers GitHub.":"Aucun changement local en attente d’export.";if(!shown.length){el.innerHTML='<div class="empty"><p>Aucune carte ne correspond.</p></div>';return;}el.innerHTML=shown.map(c=>'<div class="item"><div><div class="item-fr"><b>'+esc(c.fr)+'</b>'+(c.verified?'':' <span class="flag">·</span>')+'</div>'+c.translations.map(t=>'<div class="item-variant">'+esc(t.oc)+(t.dialect?' · '+esc(t.dialect):'')+'</div>').join("")+'</div><div class="item-meta">'+(c.due?esc(c.due):"neuve")+'<br><button class="iconbtn" title="Corriger" onclick="editCard(\''+c.id+'\')">✎</button><button class="iconbtn" title="Retirer" onclick="drop(\''+c.id+'\')">×</button></div></div>').join("");}
async function drop(id){deck=deck.filter(c=>c.id!==id);if(editingId===id)cancelEdit();await save();renderDeck();counts();if(current?.id===id)next();}
async function mergeSeed(){const have=new Set(deck.map(cardKey));let n=0;SEED.forEach(s=>{const k=cardKey(s);if(!have.has(k)){deck.push(mk(s,false));have.add(k);n++;}});if(!n){alert("Le paquet contient déjà toutes les cartes d’amorce.");return;}await save();counts();renderDeck();if(!current)next();alert(n+" carte"+(n>1?"s":"")+" ajoutée"+(n>1?"s":"")+".");}
function downloadJson(filename,data){const blob=new Blob([JSON.stringify(data,null,2)+"\n"],{type:"application/json"}),url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function publicCard(c){const card={fr:c.fr,translations:c.translations.map(t=>{const x={oc:t.oc};if(t.dialect)x.dialect=t.dialect;return x;})};if(c.tag)card.tag=c.tag;if(c.note)card.note=c.note;return card;}
async function exportPendingCards(){const cards=deck.filter(c=>c.dirty).map(c=>({...publicCard(c),baseKey:c.baseKey||null}));if(!cards.length){alert("Aucun changement local à exporter.");return;}downloadJson(`que-parli-changements-${today()}.json`,{format:"que-parli-changes-v2",cards});if(confirm("Le fichier a été créé. Le marquer comme exporté sur ce téléphone ?")){deck.forEach(c=>c.dirty=false);await save();renderDeck();}}
function exportGitHubCards(){downloadJson("cards.json",deck.map(publicCard));}
function exportProgress(){downloadJson(`que-parli-avancement-${today()}.json`,{format:"que-parli-progress-v2",progress:deck.map(c=>({key:cardKey(c),due:c.due,ivl:c.ivl,ease:c.ease,reps:c.reps}))});}
function chooseImport(){$("import-file").click();}
async function importCardsFile(event){const file=event.target.files?.[0];event.target.value="";if(!file)return;try{const parsed=JSON.parse(await file.text()),rows=Array.isArray(parsed)?parsed:parsed.cards;if(!Array.isArray(rows))throw 0;let added=0,updated=0,skipped=0;for(const row of rows){const item=normalizePublicCard(row),baseKey=row?.baseKey||null;if(!item.fr||!item.translations.length){skipped++;continue;}let existing=baseKey?deck.find(c=>cardKey(c)===baseKey):deck.find(c=>cardKey(c)===cardKey(item));if(existing){const changed=JSON.stringify(publicCard(existing))!==JSON.stringify(publicCard(item));if(changed){if(!existing.baseKey)existing.baseKey=baseKey||cardKey(existing);Object.assign(existing,item,{verified:true,dirty:true});updated++;}else skipped++;}else{deck.push(mk(item,true,true,baseKey));added++;}}await save();counts();renderDeck();if(!current)next();alert(`${added} ajoutée${added>1?"s":""}, ${updated} mise${updated>1?"s":""} à jour, ${skipped} ignorée${skipped>1?"s":""}.`);}catch(e){console.error(e);alert("Fichier JSON non reconnu.");}}
async function wipe(){if(!confirm("Effacer les cartes et repartir du paquet d’amorce ?"))return;deck=SEED.map(s=>mk(s,false));cancelEdit();await save();next();renderDeck();}
function setStudyDirection(v){studyDirection=["fr-oc","oc-fr","mix"].includes(v)?v:"fr-oc";localStorage.setItem("gascon:direction",studyDirection);if(current){revealed=false;sessionDirection=null;sessionTranslation=null;draw();}}
function initLexicon(){const source=$("lex-source");if(!source)return;const sources=[...new Set(LEXICON.map(x=>x.source).filter(Boolean))].sort();source.innerHTML='<option value="">Toutes</option>'+sources.map(x=>'<option value="'+esc(x)+'">'+esc(x)+'</option>').join("");renderLexicon();}
function renderLexicon(){const list=$("lex-list");if(!list)return;const q=($("lex-filter").value||"").trim().toLowerCase(),kind=$("lex-kind").value,source=$("lex-source").value;const shown=LEXICON.filter(x=>(!kind||x.kind===kind)&&(!source||x.source===source)&&(!q||(x.term+" "+x.meaning+" "+(x.phonetic||"")).toLowerCase().includes(q)));$("lex-count").textContent=shown.length+" entrée"+(shown.length>1?"s":"");list.innerHTML=shown.map(x=>'<article class="lex-entry"><div class="item-oc">'+esc(x.term)+'</div><div class="item-fr">'+esc(x.meaning)+'</div>'+(x.phonetic?'<div class="phonetic">Prononciation : '+esc(x.phonetic)+'</div>':'')+'<div class="lex-source">'+esc(x.source)+'</div></article>').join("")||'<div class="empty"><p>Aucune entrée.</p></div>';}
function show(id){TABS.forEach(s=>{$(s).classList.toggle("hidden",s!==id);$("tab-"+s).setAttribute("aria-selected",String(s===id));});window.scrollTo(0,0);}
document.addEventListener("keydown",e=>{if(!$("estudi")||$("estudi").classList.contains("hidden"))return;const t=document.activeElement?.tagName;if(t==="INPUT"||t==="TEXTAREA")return;if(e.key===" "){e.preventDefault();if(!revealed&&current)reveal();return;}if(revealed&&"0123".includes(e.key))grade(Number(e.key));});
async function bootstrap(){try{await loadFragments();show("estudi");await load();}catch(e){console.error(e);$("tab-content").innerHTML='<div class="empty"><p>Impossible de charger l’application.</p></div>';}}
bootstrap();
