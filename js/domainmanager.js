var DomainManager=(function(){'use strict';
var STORAGE_KEY='web3deploy_domains';
var getActiveKey=null,initialized=false,unlinkTarget=null;
var els={};
var PROVIDERS={
cloudflare:{name:'Cloudflare',instructions:'Log in to Cloudflare Dashboard → Select your domain → Go to DNS → Add the following records:'},
godaddy:{name:'GoDaddy',instructions:'Log in to GoDaddy → My Products → DNS → Manage Zones → Select domain → Add these records:'},
namecheap:{name:'Namecheap',instructions:'Log in to Namecheap → Domain List → Manage → Advanced DNS → Add New Record for each:'},
other:{name:'your DNS provider',instructions:'Log in to your DNS provider\u2019s control panel and add these DNS records:'}
};
function init(getKeyFn){
if(initialized)return;initialized=true;getActiveKey=getKeyFn;
els={domainInput:document.getElementById('dmDomainInput'),providerSelect:document.getElementById('dmProviderSelect'),cidInput:document.getElementById('dmCidInput'),generateBtn:document.getElementById('dmGenerateBtn'),recordsCard:document.getElementById('dmRecordsCard'),recordsList:document.getElementById('dmRecordsList'),providerInstructions:document.getElementById('dmProviderInstructions'),checkBtn:document.getElementById('dmCheckBtn'),checkStatus:document.getElementById('dmCheckStatus'),saveBtn:document.getElementById('dmSaveBtn'),tableWrap:document.getElementById('dmTableWrap'),tableBody:document.getElementById('dmTableBody'),dmEmpty:document.getElementById('dmEmpty'),updateOverlay:document.getElementById('dmUpdateOverlay'),newCid:document.getElementById('dmNewCid'),newTxtValue:document.getElementById('dmNewTxtValue'),copyNewTxt:document.getElementById('dmCopyNewTxt'),closeUpdate:document.getElementById('dmCloseUpdate'),unlinkOverlay:document.getElementById('dmUnlinkOverlay'),unlinkName:document.getElementById('dmUnlinkName'),confirmUnlink:document.getElementById('dmConfirmUnlink'),cancelUnlink:document.getElementById('dmCancelUnlink')};
bindEvents();renderTable();
}
function getDomains(){try{return JSON.parse(localStorage.getItem(STORAGE_KEY))||[];}catch(e){return[];}}
function saveDomains(d){localStorage.setItem(STORAGE_KEY,JSON.stringify(d));}
function populateCids(){
var key=getActiveKey();if(!key)return;
PinataAPI.listPins({apiKey:key.key,sort:'DESC',limit:50}).then(function(data){
els.cidInput.innerHTML='<option value="">Select a pinned site\u2026</option>';
data.pins.forEach(function(p){
var opt=document.createElement('option');opt.value=p.cid;opt.textContent=p.name+' ('+truncCid(p.cid)+')';
els.cidInput.appendChild(opt);});});}
function truncCid(c){if(!c||c.length<16)return c;return c.slice(0,8)+'\u2026'+c.slice(-6);}
function generateRecords(){
var domain=els.domainInput.value.trim();
var provider=els.providerSelect.value;
var cid=els.cidInput.value;
if(!domain){alert('Please enter a domain name.');return;}
if(!cid){alert('Please select a site CID.');return;}
domain=domain.replace(/^https?:\/\//,'').replace(/\/$/,'');
var pInfo=PROVIDERS[provider]||PROVIDERS.other;
els.providerInstructions.textContent=pInfo.instructions;
var records=[
{type:'CNAME',host:'www',value:'gateway.pinata.cloud',ttl:'Auto',note:'Points www subdomain to Pinata gateway'},
{type:'TXT',host:'_dnslink',value:'dnslink=/ipfs/'+cid,ttl:'Auto',note:'Links your domain to the IPFS content'}
];
els.recordsList.innerHTML='';
records.forEach(function(r){
var box=document.createElement('div');box.className='dm-record-box';
box.innerHTML='<div class="dm-record-header"><span class="dm-record-type dm-record-type-'+r.type.toLowerCase()+'">'+r.type+'</span><span class="dm-record-note">'+r.note+'</span></div><div class="dm-record-fields"><div class="dm-record-field"><span class="dm-record-label">Host / Name</span><code class="dm-record-value">'+r.host+'</code><button class="btn-icon-sm dm-copy" data-copy="'+r.host+'" title="Copy">\ud83d\udccb</button></div><div class="dm-record-field"><span class="dm-record-label">Value / Target</span><code class="dm-record-value">'+r.value+'</code><button class="btn-icon-sm dm-copy" data-copy="'+r.value+'" title="Copy">\ud83d\udccb</button></div><div class="dm-record-field"><span class="dm-record-label">TTL</span><code class="dm-record-value">'+r.ttl+'</code></div></div>';
els.recordsList.appendChild(box);});
els.recordsCard.style.display='block';els.checkStatus.innerHTML='';
els.recordsCard.scrollIntoView({behavior:'smooth',block:'start'});}
function checkDns(){
var domain=els.domainInput.value.trim().replace(/^https?:\/\//,'').replace(/\/$/,'');
if(!domain)return;
els.checkStatus.innerHTML='<div class="dm-status dm-status-pending"><span class="dm-status-icon">\u23f3</span><span>\u062c\u0627\u0631\u064a \u0627\u0644\u0641\u062d\u0635...</span></div>';
els.checkBtn.disabled=true;
fetch('https://dns.google/resolve?name=_dnslink.'+domain+'&type=TXT').then(function(r){return r.json();}).then(function(data){
els.checkBtn.disabled=false;
if(data.Answer&&data.Answer.length>0){
var hasDnslink=data.Answer.some(function(a){return a.data&&a.data.indexOf('dnslink=')!==-1;});
if(hasDnslink){els.checkStatus.innerHTML='<div class="dm-status dm-status-ok"><span class="dm-status-icon">\u2705</span><div><strong>\u0645\u062a\u0635\u0644 \u0628\u0634\u0643\u0644 \u0635\u062d\u064a\u062d</strong><p>DNS records are properly configured.</p></div></div>';}
else{els.checkStatus.innerHTML='<div class="dm-status dm-status-error"><span class="dm-status-icon">\u274c</span><div><strong>\u0625\u0639\u062f\u0627\u062f \u062e\u0627\u0637\u0626</strong><p>TXT record found but missing dnslink value. Check the _dnslink record.</p></div></div>';}}
else{els.checkStatus.innerHTML='<div class="dm-status dm-status-warn"><span class="dm-status-icon">\u23f3</span><div><strong>\u0627\u0646\u062a\u0638\u0627\u0631 \u0627\u0646\u062a\u0634\u0627\u0631 DNS (24-48 \u0633\u0627\u0639\u0629)</strong><p>DNS records not detected yet. Propagation can take up to 48 hours.</p></div></div>';}
}).catch(function(){
els.checkBtn.disabled=false;
els.checkStatus.innerHTML='<div class="dm-status dm-status-warn"><span class="dm-status-icon">\u23f3</span><div><strong>\u0627\u0646\u062a\u0638\u0627\u0631 \u0627\u0646\u062a\u0634\u0627\u0631 DNS (24-48 \u0633\u0627\u0639\u0629)</strong><p>Could not query DNS. Try again later.</p></div></div>';});}
function saveDomain(){
var domain=els.domainInput.value.trim().replace(/^https?:\/\//,'').replace(/\/$/,'');
var cid=els.cidInput.value;var provider=els.providerSelect.value;
if(!domain||!cid)return;
var domains=getDomains();
var existing=domains.findIndex(function(d){return d.domain===domain;});
if(existing!==-1){domains[existing].cid=cid;domains[existing].provider=provider;domains[existing].lastChecked=new Date().toISOString();}
else{domains.push({domain:domain,cid:cid,provider:provider,status:'pending',lastChecked:new Date().toISOString()});}
saveDomains(domains);renderTable();
els.domainInput.value='';els.cidInput.value='';els.recordsCard.style.display='none';els.checkStatus.innerHTML='';}
function renderTable(){
var domains=getDomains();
if(domains.length===0){els.tableWrap.style.display='none';els.dmEmpty.style.display='block';return;}
els.tableWrap.style.display='block';els.dmEmpty.style.display='none';
els.tableBody.innerHTML='';
domains.forEach(function(d,i){
var tr=document.createElement('tr');
var statusClass=d.status==='connected'?'ok':d.status==='error'?'error':'pending';
var statusLabel=d.status==='connected'?'\u2705 \u0645\u062a\u0635\u0644':d.status==='error'?'\u274c \u062e\u0637\u0623':'\u23f3 \u0642\u064a\u062f \u0627\u0644\u0627\u0646\u062a\u0638\u0627\u0631';
tr.innerHTML='<td><div class="dm-domain-name">\ud83c\udf10 '+d.domain+'</div></td><td><span class="dm-status-badge dm-status-badge-'+statusClass+'">'+statusLabel+'</span></td><td><code class="dm-linked-cid" title="'+d.cid+'">'+truncCid(d.cid)+'</code></td><td>'+fmtDate(d.lastChecked)+'</td><td><div class="fm-td-actions"><button class="btn-icon-sm dm-act" data-act="recheck" data-idx="'+i+'" title="Re-check">\ud83d\udd0d</button><button class="btn-icon-sm dm-act" data-act="update" data-idx="'+i+'" title="Update CID">\ud83d\udd04</button><button class="btn-icon-sm dm-act fm-btn-danger" data-act="unlink" data-idx="'+i+'" title="Unlink">\u2715</button></div></td>';
els.tableBody.appendChild(tr);});}
function fmtDate(d){if(!d)return'\u2014';var dt=new Date(d);return dt.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});}
function recheckDomain(idx){
var domains=getDomains();var d=domains[idx];if(!d)return;
fetch('https://dns.google/resolve?name=_dnslink.'+d.domain+'&type=TXT').then(function(r){return r.json();}).then(function(data){
if(data.Answer&&data.Answer.some(function(a){return a.data&&a.data.indexOf('dnslink=')!==-1;})){d.status='connected';}
else{d.status='pending';}
d.lastChecked=new Date().toISOString();saveDomains(domains);renderTable();
}).catch(function(){d.lastChecked=new Date().toISOString();saveDomains(domains);renderTable();});}
function showUpdateModal(idx){
var domains=getDomains();var d=domains[idx];if(!d)return;
if(els.newCid)els.newCid.textContent=d.cid;
if(els.newTxtValue)els.newTxtValue.textContent='dnslink=/ipfs/'+d.cid;
if(els.updateOverlay)els.updateOverlay.classList.add('open');}
function openUnlink(idx){
var domains=getDomains();var d=domains[idx];if(!d)return;
unlinkTarget=idx;
if(els.unlinkName)els.unlinkName.textContent=d.domain;
if(els.unlinkOverlay)els.unlinkOverlay.classList.add('open');}
function confirmUnlink(){
if(unlinkTarget===null)return;
var domains=getDomains();domains.splice(unlinkTarget,1);saveDomains(domains);renderTable();
unlinkTarget=null;if(els.unlinkOverlay)els.unlinkOverlay.classList.remove('open');}
function bindEvents(){
els.generateBtn.addEventListener('click',generateRecords);
els.checkBtn.addEventListener('click',checkDns);
els.saveBtn.addEventListener('click',saveDomain);
document.addEventListener('click',function(e){
var copyBtn=e.target.closest('.dm-copy');
if(copyBtn){var text=copyBtn.getAttribute('data-copy');navigator.clipboard.writeText(text).then(function(){var o=copyBtn.textContent;copyBtn.textContent='\u2713';setTimeout(function(){copyBtn.textContent=o;},1200);});return;}
var actBtn=e.target.closest('.dm-act');
if(actBtn){var act=actBtn.getAttribute('data-act');var idx=parseInt(actBtn.getAttribute('data-idx'),10);
if(act==='recheck')recheckDomain(idx);
else if(act==='update')showUpdateModal(idx);
else if(act==='unlink')openUnlink(idx);}});
if(els.closeUpdate)els.closeUpdate.addEventListener('click',function(){els.updateOverlay.classList.remove('open');});
if(els.copyNewTxt)els.copyNewTxt.addEventListener('click',function(){var v=els.newTxtValue.textContent;navigator.clipboard.writeText(v).then(function(){els.copyNewTxt.textContent='\u2713';setTimeout(function(){els.copyNewTxt.textContent='\ud83d\udccb';},1200);});});
if(els.confirmUnlink)els.confirmUnlink.addEventListener('click',confirmUnlink);
if(els.cancelUnlink)els.cancelUnlink.addEventListener('click',function(){els.unlinkOverlay.classList.remove('open');unlinkTarget=null;});}
return{init:init,populateCids:populateCids};
})();
