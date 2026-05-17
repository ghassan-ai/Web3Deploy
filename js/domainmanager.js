var DomainManager=(function(){'use strict';
var STORAGE_KEY='web3deploy_domains';
var getActiveKey=null,initialized=false,unlinkTarget=null;
var syncInFlight=false,providerAdapter=null;
var currentChallenge=null;
var els={};
var PROVIDERS={
cloudflare:{name:'Cloudflare',instructions:'Log in to Cloudflare Dashboard → Select your domain → Go to DNS → Add the following records:'},
godaddy:{name:'GoDaddy',instructions:'Log in to GoDaddy → My Products → DNS → Manage Zones → Select domain → Add these records:'},
namecheap:{name:'Namecheap',instructions:'Log in to Namecheap → Domain List → Manage → Advanced DNS → Add New Record for each:'},
other:{name:'your DNS provider',instructions:'Log in to your DNS provider\u2019s control panel and add these DNS records:'}
};
function init(getKeyFn){
if(initialized)return;initialized=true;getActiveKey=getKeyFn;
els={domainInput:document.getElementById('dmDomainInput'),providerSelect:document.getElementById('dmProviderSelect'),cidInput:document.getElementById('dmCidInput'),generateBtn:document.getElementById('dmGenerateBtn'),recordsCard:document.getElementById('dmRecordsCard'),recordsList:document.getElementById('dmRecordsList'),providerInstructions:document.getElementById('dmProviderInstructions'),checkBtn:document.getElementById('dmCheckBtn'),checkStatus:document.getElementById('dmCheckStatus'),saveBtn:document.getElementById('dmSaveBtn'),dmSyncBtn:document.getElementById('dmSyncBtn'),dmSyncStatus:document.getElementById('dmSyncStatus'),tableWrap:document.getElementById('dmTableWrap'),tableBody:document.getElementById('dmTableBody'),dmEmpty:document.getElementById('dmEmpty'),updateOverlay:document.getElementById('dmUpdateOverlay'),newCid:document.getElementById('dmNewCid'),newTxtValue:document.getElementById('dmNewTxtValue'),copyNewTxt:document.getElementById('dmCopyNewTxt'),closeUpdate:document.getElementById('dmCloseUpdate'),unlinkOverlay:document.getElementById('dmUnlinkOverlay'),unlinkName:document.getElementById('dmUnlinkName'),confirmUnlink:document.getElementById('dmConfirmUnlink'),cancelUnlink:document.getElementById('dmCancelUnlink')};
bindEvents();renderTable();
if(typeof WalletAuth!=='undefined'&&WalletAuth.isConnected()){updateSyncStatus(WalletAuth.getAddress());}
}
function getDomains(){try{return JSON.parse(localStorage.getItem(STORAGE_KEY))||[];}catch(e){return[];}}
function saveDomains(d){localStorage.setItem(STORAGE_KEY,JSON.stringify(d));}
function resolveAdapter(){var key=getActiveKey&&getActiveKey();if(!key)return null;if(typeof StorageProviders!=='undefined'&&StorageProviders.getAdapter){providerAdapter=StorageProviders.getAdapter(key.provider);}else{providerAdapter=null;}return providerAdapter;}
function updateSyncStatus(walletAddr,overrideText){if(!els.dmSyncStatus)return;if(overrideText){els.dmSyncStatus.textContent=overrideText;return;}if(walletAddr&&typeof DomainsIndex!=='undefined'&&DomainsIndex.getLastSyncedText){els.dmSyncStatus.textContent=DomainsIndex.getLastSyncedText(walletAddr);}else{els.dmSyncStatus.textContent='';}}
function setSyncing(isSyncing){if(!els.dmSyncBtn)return;els.dmSyncBtn.disabled=isSyncing;els.dmSyncBtn.textContent=isSyncing?'Syncing...':'Sync Domains';}
function normalizeDomain(d){var now=new Date().toISOString();return{domain:d.domain||'',cid:d.cid||'',provider:d.provider||'other',status:d.status||'pending',dateLinked:d.dateLinked||d.lastChecked||now,lastChecked:d.lastChecked||now};}
function upsertDomain(domains,entry){var idx=domains.findIndex(function(d){return(d.domain||'').toLowerCase()===(entry.domain||'').toLowerCase();});if(idx!==-1)domains[idx]=entry;else domains.push(entry);return domains;}
function removeDomainByName(domains,name){var target=(name||'').toLowerCase();return domains.filter(function(d){return(d.domain||'').toLowerCase()!==target;});}
function persistDomain(entry){var key=getActiveKey&&getActiveKey();if(!key)return;if(typeof WalletAuth==='undefined'||!WalletAuth.isConnected())return;if(typeof DomainsIndex==='undefined'||!DomainsIndex.addDomain)return;var walletAddr=WalletAuth.getAddress();DomainsIndex.addDomain(entry,key.provider,key.key,walletAddr).then(function(){updateSyncStatus(walletAddr);}).catch(function(e){console.warn('Domains persist failed:',e);});}
function removeDomainFromIndex(name){var key=getActiveKey&&getActiveKey();if(!key)return;if(typeof WalletAuth==='undefined'||!WalletAuth.isConnected())return;if(typeof DomainsIndex==='undefined'||!DomainsIndex.removeDomain)return;var walletAddr=WalletAuth.getAddress();DomainsIndex.removeDomain(name,key.provider,key.key,walletAddr).then(function(){updateSyncStatus(walletAddr);}).catch(function(e){console.warn('Domains remove failed:',e);});}
function syncDomains(options){var key=getActiveKey&&getActiveKey();if(typeof WalletAuth==='undefined'||!WalletAuth.isConnected()){if(options&&options.showSyncStatus)updateSyncStatus(null,'Connect wallet to sync');return Promise.resolve({domains:getDomains(),cid:null});}if(typeof DomainsIndex==='undefined'||!DomainsIndex.syncDomains){if(options&&options.showSyncStatus)updateSyncStatus(null,'Domains index not loaded');return Promise.resolve({domains:getDomains(),cid:null});}if(syncInFlight)return Promise.resolve({domains:getDomains(),cid:DomainsIndex.getDomainsCid?DomainsIndex.getDomainsCid(WalletAuth.getAddress()):null});syncInFlight=true;var walletAddr=WalletAuth.getAddress();if(options&&options.showSyncStatus)setSyncing(true);var providerId=key?key.provider:null;var apiKey=key?key.key:null;return DomainsIndex.syncDomains({providerId:providerId,apiKey:apiKey,walletAddr:walletAddr}).then(function(res){if(res&&res.cid){var normalized=(res.domains||[]).map(normalizeDomain);saveDomains(normalized);}renderTable();if(options&&options.showSyncStatus)updateSyncStatus(walletAddr,(res&&res.cid)?null:'No domains index found');return res;}).catch(function(err){if(options&&options.showSyncStatus)updateSyncStatus(walletAddr,err&&err.message?err.message:'Sync failed');return{domains:[],cid:null,error:err};}).finally(function(){syncInFlight=false;if(options&&options.showSyncStatus)setSyncing(false);});}
function loadDomains(options){if(typeof WalletAuth!=='undefined'&&WalletAuth.isConnected()){return syncDomains(options||{});}renderTable();if(options&&options.showSyncStatus)updateSyncStatus(null,'');return Promise.resolve({domains:getDomains(),cid:null});}
function populateCids(){
var key=getActiveKey();if(!key)return;
resolveAdapter();

resolveAdapter();

var provider=key.provider;

// Pinata — use listPins
var listFn=providerAdapter&&providerAdapter.listPins?providerAdapter.listPins:(typeof PinataAPI!=='undefined'&&PinataAPI.listPins?PinataAPI.listPins:null);
if(!listFn){
  els.cidInput.innerHTML='<option value="">Unable to load pins</option>';
  return;
}
listFn({apiKey:key.key,sort:'DESC',limit:50}).then(function(data){
els.cidInput.innerHTML='<option value="">Select a pinned site...</option>';
(data.pins||[]).forEach(function(p){
var opt=document.createElement('option');opt.value=p.cid;opt.textContent=p.name+' ('+truncCid(p.cid)+')';
els.cidInput.appendChild(opt);});}).catch(function(){
els.cidInput.innerHTML='<option value="">Unable to load pins</option>';
});}
function truncCid(c){if(!c||c.length<16)return c;return c.slice(0,8)+'\u2026'+c.slice(-6);}
function fmtDateShort(d){if(!d)return'';var dt=new Date(d);return dt.toLocaleDateString('en-US',{month:'short',day:'numeric'});}  
function generateRecords(){
var domain=els.domainInput.value.trim();
var dnsProvider=els.providerSelect.value;
var cidOrRef=els.cidInput.value;
if(!domain){alert('Please enter a domain name.');return;}
var domainRegex = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9][a-z0-9-]{0,61}[a-z0-9]$/i;
domain=domain.replace(/^https?:\/\//,'').replace(/\/$/,'');
if(!domainRegex.test(domain)){alert('Please enter a valid domain name (e.g., example.com).');return;}
if(!cidOrRef){alert('Please select a file/site.');return;}

// Determine storage provider from active key
var key=getActiveKey&&getActiveKey();
var storageProvider=key?key.provider:'pinata';

// Build the selected option to get extra data attributes
var selectedOpt=els.cidInput.options[els.cidInput.selectedIndex];
var canisterId=selectedOpt?selectedOpt.getAttribute('data-canister'):''; 

var randStr = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
currentChallenge = 'web3-deploy-verification=' + randStr;
var pInfo=PROVIDERS[dnsProvider]||PROVIDERS.other;
els.providerInstructions.textContent=pInfo.instructions;

var records;

// IPFS providers (Pinata)
var cid=cidOrRef;
records=[
  {type:'TXT',host:'@',value:currentChallenge,ttl:'Auto',note:'Proves ownership of this domain'},
  {type:'TXT',host:'_dnslink',value:'dnslink=/ipfs/'+cid,ttl:'Auto',note:'Links your domain to IPFS content'}
];

els.recordsList.innerHTML='';
records.forEach(function(r){
var box=document.createElement('div');box.className='dm-record-box';
box.innerHTML='<div class="dm-record-header"><span class="dm-record-type dm-record-type-'+r.type.toLowerCase()+'">'+r.type+'</span><span class="dm-record-note">'+r.note+'</span></div><div class="dm-record-fields"><div class="dm-record-field"><span class="dm-record-label">Host / Name</span><code class="dm-record-value">'+r.host+'</code><button class="btn-icon-sm dm-copy" data-copy="'+r.host+'" title="Copy">📋</button></div><div class="dm-record-field"><span class="dm-record-label">Value / Target</span><code class="dm-record-value">'+r.value+'</code><button class="btn-icon-sm dm-copy" data-copy="'+r.value+'" title="Copy">📋</button></div><div class="dm-record-field"><span class="dm-record-label">TTL</span><code class="dm-record-value">'+r.ttl+'</code></div></div>';
els.recordsList.appendChild(box);});
els.recordsCard.style.display='block';els.checkStatus.innerHTML='';
if(els.saveBtn) { els.saveBtn.disabled=true; els.saveBtn.innerHTML='🔒 Verify &amp; Link'; }
els.recordsCard.scrollIntoView({behavior:'smooth',block:'start'});}
function checkDns(){
var domain=els.domainInput.value.trim().replace(/^https?:\/\//,'').replace(/\/$/,'');
if(!domain || !currentChallenge)return;
els.checkStatus.innerHTML='<div class="dm-status dm-status-pending"><span class="dm-status-icon">⏳</span><span>Checking DNS records...</span></div>';
els.checkBtn.disabled=true;
if(els.saveBtn) { els.saveBtn.disabled=true; }

// Determine what dnslink value to expect based on storage provider
var key=getActiveKey&&getActiveKey();
var storageProvider=key?key.provider:'pinata';
var cidOrRef=els.cidInput.value;
var expectedDnslink='dnslink=/ipfs/'+cidOrRef;

Promise.all([
fetch('https://dns.google/resolve?name='+domain+'&type=TXT').then(function(r){return r.json();}),
fetch('https://dns.google/resolve?name=_dnslink.'+domain+'&type=TXT').then(function(r){return r.json();})
]).then(function(results){
els.checkBtn.disabled=false;
var rootData=results[0];var dnslinkData=results[1];
var hasVerification=false;
if(rootData.Answer&&rootData.Answer.length>0){
hasVerification=rootData.Answer.some(function(a){return a.data&&a.data.replace(/\"/g,'')===currentChallenge;});
}
var hasDnslink=false;
if(dnslinkData.Answer&&dnslinkData.Answer.length>0){
hasDnslink=dnslinkData.Answer.some(function(a){return a.data&&a.data.replace(/\"/g,'')===expectedDnslink;});
}
if(hasVerification&&hasDnslink){
els.checkStatus.innerHTML='<div class="dm-status dm-status-ok"><span class="dm-status-icon">✅</span><div><strong>Verified!</strong><p>Domain ownership confirmed and linked to your content.</p></div></div>';
if(els.saveBtn) { els.saveBtn.disabled=false;els.saveBtn.innerHTML='💾 Save Domain Link'; }
}else if(!hasVerification&&!hasDnslink){
els.checkStatus.innerHTML='<div class="dm-status dm-status-warn"><span class="dm-status-icon">⏳</span><div><strong>Waiting for DNS propagation (24–48h)</strong><p>Records not found yet. DNS changes can take time.</p></div></div>';
}else if(!hasVerification){
els.checkStatus.innerHTML='<div class="dm-status dm-status-error"><span class="dm-status-icon">❌</span><div><strong>Verification TXT missing</strong><p>Add the TXT record to the root domain (@).</p></div></div>';
}else{
els.checkStatus.innerHTML='<div class="dm-status dm-status-error"><span class="dm-status-icon">❌</span><div><strong>Content link missing</strong><p>_dnslink TXT record not found or incorrect.</p></div></div>';
}
}).catch(function(){
els.checkBtn.disabled=false;
els.checkStatus.innerHTML='<div class="dm-status dm-status-warn"><span class="dm-status-icon">⏳</span><div><strong>DNS lookup failed</strong><p>Could not reach DNS server. Try again later.</p></div></div>';});}
function saveDomain(){
var domain=els.domainInput.value.trim().replace(/^https?:\/\//,'').replace(/\/$/,'');
var cid=els.cidInput.value;var provider=els.providerSelect.value;
if(!domain||!cid)return;
var now=new Date().toISOString();
var domains=getDomains();
var existing=domains.find(function(d){return(d.domain||'').toLowerCase()===domain.toLowerCase();});
var key=getActiveKey&&getActiveKey();
var storageProvider=key?key.provider:'pinata';
var entry={domain:domain,cid:cid,provider:provider,storageProvider:storageProvider,status:existing&&existing.status?existing.status:'pending',dateLinked:existing&&existing.dateLinked?existing.dateLinked:now,lastChecked:now};
upsertDomain(domains,entry);
saveDomains(domains);renderTable();
persistDomain(entry);
els.domainInput.value='';els.cidInput.value='';els.recordsCard.style.display='none';els.checkStatus.innerHTML='';els.saveBtn.disabled=true;els.saveBtn.innerHTML='🔒 Verify &amp; Link';}
function renderTable(){
var domains=getDomains();
if(domains.length===0){els.tableWrap.style.display='none';els.dmEmpty.style.display='block';return;}
els.tableWrap.style.display='block';els.dmEmpty.style.display='none';
els.tableBody.innerHTML='';
domains.forEach(function(d,i){
var tr=document.createElement('tr');
var statusClass=d.status==='connected'?'ok':d.status==='error'?'error':'pending';
var statusLabel=d.status==='connected'?'✅ Connected':d.status==='error'?'❌ Error':'⏳ Pending';
tr.innerHTML='<td><div class="dm-domain-name">\ud83c\udf10 '+d.domain+'</div></td><td><span class="dm-status-badge dm-status-badge-'+statusClass+'">'+statusLabel+'</span></td><td><code class="dm-linked-cid" title="'+d.cid+'">'+truncCid(d.cid)+'</code></td><td>'+fmtDate(d.lastChecked||d.dateLinked)+'</td><td><div class="fm-td-actions"><button class="btn-icon-sm dm-act" data-act="recheck" data-idx="'+i+'" title="Re-check">\ud83d\udd0d</button><button class="btn-icon-sm dm-act" data-act="update" data-idx="'+i+'" title="Update CID">\ud83d\udd04</button><button class="btn-icon-sm dm-act fm-btn-danger" data-act="unlink" data-idx="'+i+'" title="Unlink">\u2715</button></div></td>';
els.tableBody.appendChild(tr);});}
function fmtDate(d){if(!d)return'\u2014';var dt=new Date(d);return dt.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});}
function recheckDomain(idx){
var domains=getDomains();var d=domains[idx];if(!d)return;
fetch('https://dns.google/resolve?name=_dnslink.'+d.domain+'&type=TXT').then(function(r){return r.json();}).then(function(data){
if(data.Answer&&data.Answer.some(function(a){return a.data&&a.data.indexOf('dnslink=')!==-1;})){d.status='connected';}
else{d.status='pending';}
d.lastChecked=new Date().toISOString();if(!d.dateLinked)d.dateLinked=d.lastChecked;saveDomains(domains);renderTable();
persistDomain(d);
}).catch(function(){d.lastChecked=new Date().toISOString();if(!d.dateLinked)d.dateLinked=d.lastChecked;saveDomains(domains);renderTable();persistDomain(d);});}
function showUpdateModal(idx){
var domains=getDomains();var d=domains[idx];if(!d)return;
if(els.newCid)els.newCid.textContent=d.cid;
// Show the correct dnslink format for the domain's storage provider
var dnslinkVal='dnslink=/ipfs/'+d.cid;
if(els.newTxtValue)els.newTxtValue.textContent=dnslinkVal;
if(els.updateOverlay)els.updateOverlay.classList.add('open');}
function openUnlink(idx){
var domains=getDomains();var d=domains[idx];if(!d)return;
unlinkTarget=idx;
if(els.unlinkName)els.unlinkName.textContent=d.domain;
if(els.unlinkOverlay)els.unlinkOverlay.classList.add('open');}
function confirmUnlink(){
if(unlinkTarget===null)return;
var domains=getDomains();var removed=domains[unlinkTarget];domains.splice(unlinkTarget,1);saveDomains(domains);renderTable();
if(removed&&removed.domain)removeDomainFromIndex(removed.domain);
unlinkTarget=null;if(els.unlinkOverlay)els.unlinkOverlay.classList.remove('open');}
function bindEvents(){
els.generateBtn.addEventListener('click',generateRecords);
els.checkBtn.addEventListener('click',checkDns);
els.saveBtn.addEventListener('click',saveDomain);
if(els.dmSyncBtn)els.dmSyncBtn.addEventListener('click',function(){loadDomains({showSyncStatus:true});});
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
return{init:init,populateCids:populateCids,loadDomains:loadDomains};
})();
