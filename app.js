const KEY="sbb_data_v2";
const LEGACY_KEY="sbb_data_v1";

const today=()=>new Date().toISOString().slice(0,10);
const uid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,8);
const money=n=>"₹"+Number(n||0).toLocaleString("en-IN",{maximumFractionDigits:2});
const esc=v=>String(v??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;");
const dateText=v=>v?new Date(v+"T00:00:00").toLocaleDateString("en-IN",{day:"2-digit",month:"short",year:"numeric"}):"";

const defaultData=()=>({
  version:2,
  settings:{
    rate:1,
    days:85,
    start:today(),
    low:5,
    shopName:"Shankar Beej Bhandar",
    notifications:false
  },
  dist:[],
  bills:[],
  pay:[],
  stockAdj:[],
  sales:[],
  notificationLog:[]
});

function normalizeData(raw){
  const base=defaultData();
  const x=raw&&typeof raw==="object"?raw:{};
  return {
    version:2,
    settings:{...base.settings,...(x.settings||{})},
    dist:Array.isArray(x.dist)?x.dist:[],
    bills:Array.isArray(x.bills)?x.bills:[],
    pay:Array.isArray(x.pay)?x.pay:[],
    stockAdj:Array.isArray(x.stockAdj)?x.stockAdj:[],
    sales:Array.isArray(x.sales)?x.sales:[],
    notificationLog:Array.isArray(x.notificationLog)?x.notificationLog:[]
  };
}

let stored=localStorage.getItem(KEY);
if(!stored) stored=localStorage.getItem(LEGACY_KEY);
let data;
try{data=normalizeData(JSON.parse(stored||"null"))}catch{data=defaultData()}
localStorage.setItem(KEY,JSON.stringify(data));

const save=()=>localStorage.setItem(KEY,JSON.stringify(data));

const distributor=id=>data.dist.find(x=>x.id===id);

function billTotal(b){
  if(Number.isFinite(Number(b.total))) return Number(b.total);
  return (b.items||[]).reduce((s,x)=>s+(Number(x.q)||0)*(Number(x.p)||0),0);
}

function distributorTotals(did){
  const bills=data.bills.filter(b=>b.did===did);
  const payments=data.pay.filter(p=>p.did===did);
  const billed=bills.reduce((s,b)=>s+billTotal(b),0);
  const paid=payments.reduce((s,p)=>s+(Number(p.a)||0),0);
  return {bills, payments, billed, paid, outstanding:billed-paid};
}

function syncStock(){
  const map={};
  for(const b of data.bills){
    for(const item of (b.items||[])){
      if(!item.name||!(Number(item.q)>0)) continue;
      const key=item.name.trim().toLowerCase();
      map[key]??={name:item.name.trim(),unit:item.unit||"Bag",q:0,p:Number(item.p)||0};
      map[key].q+=Number(item.q)||0;
      if(Number(item.p)>0) map[key].p=Number(item.p);
    }
  }
  for(const adj of data.stockAdj){
    if(!adj.name) continue;
    const key=adj.name.trim().toLowerCase();
    map[key]??={name:adj.name.trim(),unit:adj.unit||"Bag",q:0,p:0};
    map[key].q+=Number(adj.q)||0;
  }
  data.stock=Object.values(map);
  save();
}

function currentPeriod(){
  const days=Math.max(1,Number(data.settings.days)||85);
  let start=new Date((data.settings.start||today())+"T00:00:00");
  let now=new Date();
  let cycles=Math.max(0,Math.floor((now-start)/86400000/days));
  start.setDate(start.getDate()+cycles*days);
  const end=new Date(start);
  end.setDate(end.getDate()+days-1);
  const from=start.toISOString().slice(0,10);
  const to=end.toISOString().slice(0,10);
  const sales=data.sales.filter(x=>x.date>=from&&x.date<=to).reduce((s,x)=>s+(Number(x.amount)||0),0);
  return {start,end,from,to,sales,gst:sales*Number(data.settings.rate||1)/100,left:Math.max(0,Math.ceil((end-now)/86400000))};
}

function completedPeriods(){
  const days=Math.max(1,Number(data.settings.days)||85);
  const base=new Date((data.settings.start||today())+"T00:00:00");
  const now=new Date();
  const count=Math.max(0,Math.floor((now-base)/86400000/days));
  const result=[];
  for(let i=0;i<count;i++){
    const s=new Date(base);
    s.setDate(s.getDate()+i*days);
    const e=new Date(s);
    e.setDate(e.getDate()+days-1);
    const from=s.toISOString().slice(0,10);
    const to=e.toISOString().slice(0,10);
    const sales=data.sales.filter(x=>x.date>=from&&x.date<=to).reduce((a,x)=>a+(Number(x.amount)||0),0);
    result.push({index:i,from,to,sales,gst:sales*Number(data.settings.rate||1)/100});
  }
  return result;
}

let page="home";
let detailDist=null;
let detailMode=null;
let deferredInstall=null;

function render(){
  document.querySelectorAll(".bottom-nav button").forEach(b=>b.classList.toggle("active",b.dataset.page===page));
  const app=document.getElementById("app");
  if(page==="home") app.innerHTML=homePage();
  if(page==="distributors") app.innerHTML=distributorsPage();
  if(page==="bills") app.innerHTML=billsPage();
  if(page==="stock") app.innerHTML=stockPage();
  if(page==="more") app.innerHTML=morePage();
  bind();
  checkPeriodNotification();
}

function homePage(){
  syncStock();
  const billed=data.bills.reduce((s,b)=>s+billTotal(b),0);
  const paid=data.pay.reduce((s,p)=>s+(Number(p.a)||0),0);
  const stockValue=(data.stock||[]).reduce((s,x)=>s+(Number(x.q)||0)*(Number(x.p)||0),0);
  const p=currentPeriod();
  return `
    <h2>Dashboard</h2>
    <div class="grid">
      <div class="card"><div class="stat-label">Distributors</div><div class="num">${data.dist.length}</div></div>
      <div class="card"><div class="stat-label">Total Bills</div><div class="num">${money(billed)}</div></div>
      <div class="card"><div class="stat-label">Total Paid</div><div class="num gold">${money(paid)}</div></div>
      <div class="card"><div class="stat-label">Overall Outstanding</div><div class="num ${billed-paid>0?"red":"green"}">${money(billed-paid)}</div></div>
      <div class="card"><div class="stat-label">Stock Value</div><div class="num">${money(stockValue)}</div></div>
      <div class="card"><div class="stat-label">85-Day Sales</div><div class="num">${money(p.sales)}</div></div>
      <div class="card"><div class="stat-label">Calculated GST</div><div class="num gold">${money(p.gst)}</div></div>
      <div class="card"><div class="stat-label">Days Left</div><div class="num green">${p.left}</div></div>
    </div>
    <div class="actions">
      <button class="btn" onclick="openDistributorForm()">+ Distributor</button>
      <button class="btn" onclick="openBillForm()">+ Bill</button>
      <button class="btn" onclick="openPaymentForm()">+ Payment</button>
      <button class="btn" onclick="openSaleForm()">+ Sale</button>
    </div>
    <div class="notice">
      Current period: <b>${dateText(p.from)} to ${dateText(p.to)}</b><br>
      Sales: <b>${money(p.sales)}</b> · GST at ${data.settings.rate}%: <b>${money(p.gst)}</b>
    </div>
    <div class="section-gap">
      <div class="card quick-card">
        <div><b>85-day period</b><div class="muted">Completed periods and GST history</div></div>
        <button class="mini" onclick="openGst()">Open GST</button>
      </div>
    </div>
  `;
}

function distributorsPage(){
  return `
    <div class="row"><h2>Distributors</h2><button class="btn" onclick="openDistributorForm()">+ Add</button></div>
    <input id="search" class="search" placeholder="Search firm, place or contact">
    <div id="list" class="list">${data.dist.map(distributorCard).join("")||`<div class="card empty">No distributors yet.<br>Add your first distributor.</div>`}</div>
  `;
}

function distributorCard(x){
  const t=distributorTotals(x.id);
  return `
    <div class="card">
      <div class="row">
        <div><h3>${esc(x.name)}</h3><div class="muted">${esc(x.place||"")} · ${esc(x.phone||"")}</div></div>
        <div style="text-align:right"><div class="muted">Outstanding</div><b class="${t.outstanding>0?"red":"green"}">${money(t.outstanding)}</b></div>
      </div>
      <div class="kpi-grid section-gap">
        <div><div class="muted">Bills</div><b>${money(t.billed)}</b></div>
        <div><div class="muted">Paid</div><b class="gold">${money(t.paid)}</b></div>
        <div><div class="muted">Bills Count</div><b>${t.bills.length}</b></div>
      </div>
      <div class="dist-actions">
        <button class="mini" onclick="openDistributorDetail('${x.id}','bills')">Bills</button>
        <button class="mini" onclick="openDistributorDetail('${x.id}','payments')">Payments</button>
        <button class="mini" onclick="openDistributorDetail('${x.id}','history')">History</button>
        <button class="mini" onclick="openBillForm('${x.id}')">+ Bill</button>
        <button class="mini" onclick="openPaymentForm('${x.id}')">+ Payment</button>
        <button class="mini" onclick="openDistributorForm('${x.id}')">Edit</button>
        <button class="mini danger" onclick="deleteDistributor('${x.id}')">Delete</button>
      </div>
    </div>
  `;
}

function distributorHeader(x){
  const t=distributorTotals(x.id);
  return `
    <div class="card">
      <div class="row">
        <div><h2 style="margin:0">${esc(x.name)}</h2><div class="muted">${esc(x.place||"")} · ${esc(x.phone||"")}</div></div>
        <div style="text-align:right"><div class="muted">Outstanding</div><b class="${t.outstanding>0?"red":"green"}">${money(t.outstanding)}</b></div>
      </div>
      <div class="kpi-grid section-gap">
        <div class="card"><div class="muted">Total Bills</div><div class="num">${money(t.billed)}</div></div>
        <div class="card"><div class="muted">Total Paid</div><div class="num gold">${money(t.paid)}</div></div>
        <div class="card"><div class="muted">Outstanding</div><div class="num ${t.outstanding>0?"red":"green"}">${money(t.outstanding)}</div></div>
      </div>
      <div class="dist-actions">
        <button class="mini" onclick="openDistributorDetail('${x.id}','bills')">Bills</button>
        <button class="mini" onclick="openDistributorDetail('${x.id}','payments')">Payments</button>
        <button class="mini" onclick="openDistributorDetail('${x.id}','history')">History</button>
        <button class="mini" onclick="openBillForm('${x.id}')">+ Bill</button>
        <button class="mini" onclick="openPaymentForm('${x.id}')">+ Payment</button>
        <button class="mini" onclick="renderDistributors()">Back</button>
      </div>
    </div>
  `;
}

function renderDistributors(){
  page="distributors";detailDist=null;detailMode=null;render();
}

function openDistributorDetail(did,mode){
  const x=distributor(did);
  if(!x)return;
  detailDist=did;detailMode=mode;
  const app=document.getElementById("app");
  if(mode==="bills") app.innerHTML=distributorBillsPage(x);
  if(mode==="payments") app.innerHTML=distributorPaymentsPage(x);
  if(mode==="history") app.innerHTML=distributorHistoryPage(x);
  bind();
}

function distributorBillsPage(x){
  const t=distributorTotals(x.id);
  return `
    <div class="row"><h2>Bill History</h2><button class="mini" onclick="renderDistributors()">Back</button></div>
    ${distributorHeader(x)}
    <div class="card section-gap"><b>Total Bills: ${money(t.billed)}</b> · <span class="muted">${t.bills.length} bill(s)</span></div>
    <div class="list section-gap">
      ${t.bills.slice().sort((a,b)=>b.date.localeCompare(a.date)).map(b=>billCard(b,true)).join("")||`<div class="card empty">No bills for this distributor.</div>`}
    </div>
  `;
}

function distributorPaymentsPage(x){
  const t=distributorTotals(x.id);
  return `
    <div class="row"><h2>Payment History</h2><button class="mini" onclick="renderDistributors()">Back</button></div>
    ${distributorHeader(x)}
    <div class="card section-gap"><b>Total Paid: ${money(t.paid)}</b> · <span class="muted">${t.payments.length} payment(s)</span></div>
    <div class="list section-gap">
      ${t.payments.slice().sort((a,b)=>b.date.localeCompare(a.date)).map(paymentCard).join("")||`<div class="card empty">No payments for this distributor.</div>`}
    </div>
  `;
}

function distributorHistoryPage(x){
  const t=distributorTotals(x.id);
  const events=[
    ...t.bills.map(b=>({date:b.date,type:"Bill",amount:billTotal(b),id:b.id,label:b.no})),
    ...t.payments.map(p=>({date:p.date,type:"Payment",amount:Number(p.a)||0,id:p.id,label:p.method||"Payment"}))
  ].sort((a,b)=>b.date.localeCompare(a.date));
  return `
    <div class="row"><h2>Complete History</h2><button class="mini" onclick="renderDistributors()">Back</button></div>
    ${distributorHeader(x)}
    <div class="timeline section-gap">
      ${events.map(e=>`
        <div class="timeline-item">
          <div class="muted">${dateText(e.date)}</div>
          <div><span class="badge ${e.type==="Bill"?"bill":"payment"}">${e.type}</span><strong>${esc(e.label)}</strong></div>
          <b class="${e.type==="Payment"?"gold":""}">${e.type==="Payment"?"-":"+"}${money(e.amount)}</b>
        </div>
      `).join("")||`<div class="card empty">No history available.</div>`}
    </div>
  `;
}

function billsPage(){
  return `
    <div class="row"><h2>Bills</h2><button class="btn" onclick="openBillForm()">+ Add</button></div>
    <input id="search" class="search" placeholder="Search bill, distributor or item">
    <div id="list" class="list">${data.bills.slice().sort((a,b)=>b.date.localeCompare(a.date)).map(b=>billCard(b,false)).join("")||`<div class="card empty">No bills yet.</div>`}</div>
  `;
}

function billCard(b,compact){
  const dname=distributor(b.did)?.name||"Unknown distributor";
  return `
    <div class="card">
      <div class="row">
        <div><b>${esc(b.no)}</b><div class="muted">${esc(dname)} · ${dateText(b.date)}</div></div>
        <b>${money(billTotal(b))}</b>
      </div>
      ${(b.items||[]).length?`<div class="muted section-gap">${b.items.map(x=>`${esc(x.name)} × ${esc(x.q)} ${esc(x.unit||"")}`).join(" · ")}</div>`:""}
      ${b.img?`<img class="small-img" src="${b.img}" alt="Bill photo">`:""}
      <div class="actions">
        <button class="mini" onclick="openBillForm('', '${b.id}')">Edit</button>
        <button class="mini danger" onclick="deleteBill('${b.id}')">Delete</button>
      </div>
    </div>
  `;
}

function stockPage(){
  syncStock();
  return `
    <div class="row"><h2>Stock</h2><button class="btn" onclick="openStockAdjustment()">Update</button></div>
    <input id="search" class="search" placeholder="Search item">
    <div id="list" class="list">
      ${(data.stock||[]).map(x=>`
        <div class="card">
          <div class="row"><div><b>${esc(x.name)}</b><div class="muted">${esc(x.unit||"")} · Rate ${money(x.p)}</div></div><b class="${x.q<=Number(data.settings.low)?"red":"green"}">${x.q}</b></div>
          <div class="muted section-gap">Value ${money(x.q*x.p)} ${x.q<=Number(data.settings.low)?"· LOW STOCK":""}</div>
        </div>
      `).join("")||`<div class="card empty">No stock yet. Add bill items or a manual stock adjustment.</div>`}
    </div>
  `;
}

function morePage(){
  const p=currentPeriod();
  return `
    <h2>More</h2>
    <div class="list">
      <div class="card quick-card"><div><b>Sales</b><div class="muted">Record and review sales</div></div><button class="btn" onclick="openSales()">Open</button></div>
      <div class="card quick-card"><div><b>GST Calculation</b><div class="muted">Total amount or date range</div></div><button class="btn" onclick="openGst()">Open</button></div>
      <div class="card quick-card"><div><b>85-Day Periods</b><div class="muted">Current and completed period totals</div></div><button class="btn" onclick="openPeriods()">Open</button></div>
      <div class="card quick-card"><div><b>Settings</b><div class="muted">GST rate, period, low stock and shop settings</div></div><button class="btn" onclick="openSettings()">Open</button></div>
      <div class="card quick-card"><div><b>Notifications</b><div class="muted">Notify when an 85-day period completes</div></div><button class="mini" onclick="enableNotifications()">Enable</button></div>
      <div class="card">
        <b>Backup</b>
        <p class="muted">Export regularly. Your app data is stored locally on this device/browser.</p>
        <div class="actions"><button class="mini" onclick="exportData()">Export</button><button class="mini" onclick="importData()">Import</button></div>
      </div>
      <div class="card">
        <b>Reset Shop Data</b>
        <p class="muted">Deletes distributors, bills, payments, stock adjustments and sales from this device. Settings can be kept or reset.</p>
        <button class="mini danger" onclick="resetData()">Reset All Data</button>
      </div>
      <div class="notice">Current period: ${dateText(p.from)} to ${dateText(p.to)} · ${p.left} day(s) left.</div>
    </div>
  `;
}

function modal(title,html,onReady){
  const wrap=document.createElement("div");
  wrap.className="modalWrap";
  wrap.innerHTML=`<div class="card modalBox"><div class="row"><h2>${title}</h2><button type="button" class="mini" data-close>Close</button></div>${html}</div>`;
  document.body.appendChild(wrap);
  wrap.querySelector("[data-close]").onclick=()=>wrap.remove();
  wrap.addEventListener("click",e=>{if(e.target===wrap)wrap.remove()});
  onReady?.(wrap);
  return wrap;
}

function openDistributorForm(editId){
  const old=editId?distributor(editId):null;
  modal(old?"Edit Distributor":"Add Distributor",`
    <form id="form">
      <input name="name" placeholder="Firm Name" required value="${esc(old?.name||"")}">
      <input name="place" placeholder="Place" required value="${esc(old?.place||"")}">
      <input name="phone" placeholder="Contact Number" required value="${esc(old?.phone||"")}">
      <button class="btn">Save Distributor</button>
    </form>
  `,wrap=>{
    wrap.querySelector("#form").onsubmit=e=>{
      e.preventDefault();
      const f=new FormData(e.target);
      const item={id:old?.id||uid(),name:f.get("name").trim(),place:f.get("place").trim(),phone:f.get("phone").trim()};
      if(old)data.dist=data.dist.map(x=>x.id===old.id?item:x); else data.dist.push(item);
      save();wrap.remove();render();
    };
  });
}

function openBillForm(preselectedDist="",editId=""){
  if(!data.dist.length){alert("Add a distributor first.");page="distributors";render();return;}
  const old=editId?data.bills.find(x=>x.id===editId):null;
  const items=old?.items?.length?old.items:[{name:"",q:"",p:"",unit:"Bag"}];
  modal(old?"Edit Distributor Bill":"Add Distributor Bill",`
    <form id="form">
      <select name="did" required>${data.dist.map(x=>`<option value="${x.id}" ${x.id===(old?.did||preselectedDist)?"selected":""}>${esc(x.name)}</option>`).join("")}</select>
      <input name="no" placeholder="Bill Number" required value="${esc(old?.no||"")}">
      <input type="date" name="date" required value="${old?.date||today()}">
      <input id="billAmount" type="number" min="0" step=".01" name="total" placeholder="Net Bill Amount (₹)" required value="${old?billTotal(old):""}">
      <input id="billImage" type="file" name="img" accept="image/*" capture="environment">
      <div id="ocrStatus" class="notice" style="display:none"></div>
      <div class="notice">Item details are optional. Enter item + quantity when this bill should add stock automatically.</div>
      <div id="items">${items.map(itemRow).join("")}</div>
      <button type="button" class="mini" id="addItem">+ Item</button>
      <button class="btn">${old?"Update Bill":"Save Bill"}</button>
    </form>
  `,wrap=>{
    const itemsBox=wrap.querySelector("#items");
    wrap.querySelector("#addItem").onclick=()=>itemsBox.insertAdjacentHTML("beforeend",itemRow({}));
    wrap.querySelector("#billImage").onchange=async e=>{
      const file=e.target.files?.[0]; if(!file)return;
      const status=wrap.querySelector("#ocrStatus");
      status.style.display="block";status.textContent="Reading bill amount...";
      try{
        const n=await readBillAmount(file);
        if(n){wrap.querySelector("#billAmount").value=n;status.textContent=`Detected net amount: ${money(n)}. Please verify before saving.`}
        else status.textContent="Net amount was not detected. Enter it manually.";
      }catch{status.textContent="OCR could not read this bill. Enter the amount manually."}
    };
    wrap.querySelector("#form").onsubmit=async e=>{
      e.preventDefault();
      const f=new FormData(e.target);
      let imageData=old?.img||"";
      const file=f.get("img");
      if(file&&file.size) imageData=await compressImage(file);
      const itemData=[...itemsBox.querySelectorAll(".item-row")].map(row=>({
        name:row.querySelector("[name=name]").value.trim(),
        q:Number(row.querySelector("[name=q]").value)||0,
        p:Number(row.querySelector("[name=p]").value)||0,
        unit:row.querySelector("[name=unit]").value
      })).filter(x=>x.name&&x.q>0);
      const total=Number(f.get("total"));
      if(!(total>=0)){alert("Enter the net bill amount.");return}
      const bill={id:old?.id||uid(),did:f.get("did"),no:f.get("no").trim(),date:f.get("date"),total,img:imageData,items:itemData};
      if(old)data.bills=data.bills.map(x=>x.id===old.id?bill:x); else data.bills.push(bill);
      syncStock();wrap.remove();render();
    };
  });
}

function itemRow(x){
  return `<div class="item-row">
    <input name="name" placeholder="Item" value="${esc(x?.name||"")}">
    <input name="q" type="number" step="any" placeholder="Qty" value="${x?.q??""}">
    <input name="p" type="number" step="any" placeholder="Price" value="${x?.p??""}">
    <select class="unit" name="unit"><option ${x?.unit==="Bag"||!x?.unit?"selected":""}>Bag</option><option ${x?.unit==="Kg"?"selected":""}>Kg</option><option ${x?.unit==="Piece"?"selected":""}>Piece</option><option ${x?.unit==="Box"?"selected":""}>Box</option><option ${x?.unit==="Other"?"selected":""}>Other</option></select>
    <button type="button" class="mini danger remove-item">×</button>
  </div>`;
}

function openPaymentForm(preselectedDist="",editId=""){
  if(!data.dist.length){alert("Add a distributor first.");page="distributors";render();return;}
  const old=editId?data.pay.find(x=>x.id===editId):null;
  modal(old?"Edit Payment":"Add Payment",`
    <form id="form">
      <select name="did" required>${data.dist.map(x=>`<option value="${x.id}" ${x.id===(old?.did||preselectedDist)?"selected":""}>${esc(x.name)}</option>`).join("")}</select>
      <input type="date" name="date" value="${old?.date||today()}" required>
      <input type="number" name="a" min="0.01" step=".01" placeholder="Amount" required value="${old?.a||""}">
      <select name="method"><option ${old?.method==="Cash"||!old?.method?"selected":""}>Cash</option><option ${old?.method==="UPI"?"selected":""}>UPI</option><option ${old?.method==="Bank Transfer"?"selected":""}>Bank Transfer</option><option ${old?.method==="Other"?"selected":""}>Other</option></select>
      <textarea name="note" placeholder="Notes">${esc(old?.note||"")}</textarea>
      <button class="btn">${old?"Update Payment":"Save Payment"}</button>
    </form>
  `,wrap=>{
    wrap.querySelector("#form").onsubmit=e=>{
      e.preventDefault();const f=new FormData(e.target);
      const item={id:old?.id||uid(),did:f.get("did"),date:f.get("date"),a:Number(f.get("a")),method:f.get("method"),note:f.get("note")};
      if(old)data.pay=data.pay.map(x=>x.id===old.id?item:x);else data.pay.push(item);
      save();wrap.remove();render();
    };
  });
}

function paymentCard(p){
  return `<div class="card"><div class="row"><div><b>${dateText(p.date)}</b><div class="muted">${esc(p.method||"")}</div></div><b class="gold">${money(p.a)}</b></div>${p.note?`<div class="muted section-gap">${esc(p.note)}</div>`:""}<div class="actions"><button class="mini" onclick="openPaymentForm("","${p.id}")">Edit</button><button class="mini danger" onclick="deletePayment('${p.id}')">Delete</button></div></div>`;
}

function openStockAdjustment(){
  modal("Update Stock",`
    <form id="form">
      <input name="name" placeholder="Item Name" required>
      <input name="q" type="number" step="any" placeholder="Quantity change (+/-)" required>
      <select name="unit"><option>Bag</option><option>Kg</option><option>Piece</option><option>Box</option><option>Other</option></select>
      <input name="reason" placeholder="Reason">
      <button class="btn">Save Stock Adjustment</button>
    </form>
  `,wrap=>{
    wrap.querySelector("#form").onsubmit=e=>{
      e.preventDefault();const f=new FormData(e.target);
      data.stockAdj.push({id:uid(),name:f.get("name").trim(),q:Number(f.get("q")),unit:f.get("unit"),reason:f.get("reason")});
      syncStock();wrap.remove();render();
    };
  });
}

function openSaleForm(editId=""){
  const old=editId?data.sales.find(x=>x.id===editId):null;
  modal(old?"Edit Sale":"Add Sale",`
    <form id="form">
      <input type="date" name="date" value="${old?.date||today()}" required>
      <input type="number" name="amount" min="0.01" step=".01" placeholder="Sale Amount" value="${old?.amount||""}" required>
      <textarea name="note" placeholder="Notes">${esc(old?.note||"")}</textarea>
      <button class="btn">${old?"Update Sale":"Save Sale"}</button>
    </form>
  `,wrap=>{
    wrap.querySelector("#form").onsubmit=e=>{
      e.preventDefault();const f=new FormData(e.target);
      const item={id:old?.id||uid(),date:f.get("date"),amount:Number(f.get("amount")),note:f.get("note")};
      if(old)data.sales=data.sales.map(x=>x.id===old.id?item:x);else data.sales.push(item);
      save();wrap.remove();render();
    };
  });
}

function openSales(){
  modal("Sales",`
    <div class="card"><b>Current 85-day sales: ${money(currentPeriod().sales)}</b></div>
    <button class="btn" id="addSale">+ Add Sale</button>
    <div class="list section-gap">${data.sales.slice().sort((a,b)=>b.date.localeCompare(a.date)).map(x=>`
      <div class="card"><div class="row"><b>${dateText(x.date)}</b><b>${money(x.amount)}</b></div>${x.note?`<div class="muted">${esc(x.note)}</div>`:""}<div class="actions"><button class="mini" data-edit="${x.id}">Edit</button><button class="mini danger" data-delete="${x.id}">Delete</button></div></div>
    `).join("")||`<div class="card empty">No sales yet.</div>`}</div>
  `,wrap=>{
    wrap.querySelector("#addSale").onclick=()=>{wrap.remove();openSaleForm()};
    wrap.querySelectorAll("[data-edit]").forEach(b=>b.onclick=()=>{const id=b.dataset.edit;wrap.remove();openSaleForm(id)});
    wrap.querySelectorAll("[data-delete]").forEach(b=>b.onclick=()=>{if(confirm("Delete this sale?")){data.sales=data.sales.filter(x=>x.id!==b.dataset.delete);save();wrap.remove();openSales()}});
  });
}

function openGst(){
  const p=currentPeriod();
  modal("GST Calculation",`
    <div class="notice">Calculate GST on a manually entered total amount or from sales between two dates.</div>
    <div class="actions">
      <button type="button" class="mini" id="tabTotal">Total Amount</button>
      <button type="button" class="mini" id="tabRange">Date Range</button>
    </div>
    <div id="gstTotal" class="section-gap">
      <input id="manualAmount" type="number" min="0" step=".01" placeholder="Enter total amount">
      <input id="manualRate" type="number" min="0" step=".01" value="${data.settings.rate}" placeholder="GST rate %">
      <button class="btn" id="calcManual">Calculate</button>
      <div id="manualResult"></div>
    </div>
    <div id="gstRange" class="section-gap" style="display:none">
      <input id="fromDate" type="date">
      <input id="toDate" type="date">
      <input id="rangeRate" type="number" min="0" step=".01" value="${data.settings.rate}" placeholder="GST rate %">
      <button class="btn" id="calcRange">Calculate</button>
      <div id="rangeResult"></div>
    </div>
    <div class="card section-gap"><b>Current 85-day period</b><p>${dateText(p.from)} to ${dateText(p.to)}</p><p>Sales: <b>${money(p.sales)}</b></p><p>GST at ${data.settings.rate}%: <b>${money(p.gst)}</b></p></div>
  `,wrap=>{
    const totalBox=wrap.querySelector("#gstTotal"),rangeBox=wrap.querySelector("#gstRange");
    wrap.querySelector("#tabTotal").onclick=()=>{totalBox.style.display="block";rangeBox.style.display="none"};
    wrap.querySelector("#tabRange").onclick=()=>{totalBox.style.display="none";rangeBox.style.display="block"};
    wrap.querySelector("#calcManual").onclick=()=>{
      const amount=Number(wrap.querySelector("#manualAmount").value),rate=Number(wrap.querySelector("#manualRate").value);
      if(!(amount>=0)){alert("Enter total amount.");return}
      wrap.querySelector("#manualResult").innerHTML=`<div class="card section-gap"><b>Result</b><p>Total: <b>${money(amount)}</b></p><p>Rate: <b>${rate}%</b></p><p>GST: <b>${money(amount*rate/100)}</b></p></div>`;
    };
    wrap.querySelector("#calcRange").onclick=()=>{
      const from=wrap.querySelector("#fromDate").value,to=wrap.querySelector("#toDate").value,rate=Number(wrap.querySelector("#rangeRate").value);
      if(!from||!to){alert("Select both dates.");return}
      if(from>to){alert("Start date cannot be after end date.");return}
      const total=data.sales.filter(x=>x.date>=from&&x.date<=to).reduce((s,x)=>s+(Number(x.amount)||0),0);
      wrap.querySelector("#rangeResult").innerHTML=`<div class="card section-gap"><b>Range Result</b><p>${dateText(from)} to ${dateText(to)}</p><p>Total Sales: <b>${money(total)}</b></p><p>Rate: <b>${rate}%</b></p><p>GST: <b>${money(total*rate/100)}</b></p></div>`;
    };
  });
}

function openPeriods(){
  const p=currentPeriod(),done=completedPeriods();
  modal("85-Day Periods",`
    <div class="card"><b>Current Period</b><p>${dateText(p.from)} to ${dateText(p.to)}</p><p>Sales: <b>${money(p.sales)}</b></p><p>GST: <b>${money(p.gst)}</b></p><p>Days left: <b>${p.left}</b></p></div>
    <div class="list section-gap">${done.slice().reverse().map(x=>`<div class="card"><div class="row"><b>${dateText(x.from)} – ${dateText(x.to)}</b><b>${money(x.sales)}</b></div><div class="muted">GST at ${data.settings.rate}%: ${money(x.gst)}</div></div>`).join("")||`<div class="card empty">No completed 85-day period yet.</div>`}</div>
  `,null);
}

function openSettings(){
  modal("Settings",`
    <form id="form">
      <input name="shopName" placeholder="Shop Name" value="${esc(data.settings.shopName)}">
      <input name="rate" type="number" step=".01" min="0" value="${data.settings.rate}" placeholder="GST rate %">
      <input name="days" type="number" min="1" value="${data.settings.days}" placeholder="Period days">
      <input name="start" type="date" value="${data.settings.start}">
      <input name="low" type="number" step="any" value="${data.settings.low}" placeholder="Low stock quantity">
      <button class="btn">Save Settings</button>
    </form>
  `,wrap=>{
    wrap.querySelector("#form").onsubmit=e=>{
      e.preventDefault();const f=new FormData(e.target);
      data.settings={...data.settings,shopName:f.get("shopName").trim()||"Shankar Beej Bhandar",rate:Number(f.get("rate"))||0,days:Number(f.get("days"))||85,start:f.get("start")||today(),low:Number(f.get("low"))||0};
      save();wrap.remove();render();
    };
  });
}

async function readBillAmount(file){
  if(typeof Tesseract==="undefined") throw new Error("OCR unavailable");
  const result=await Tesseract.recognize(file,"eng");
  return extractAmount(result?.data?.text||"");
}

function extractAmount(text){
  const clean=text.replace(/,/g,"").replace(/[|]/g,"I");
  const patterns=[
    /net\s*(?:amount|payable|value)[^\d]{0,35}(\d+(?:\.\d{1,2})?)/i,
    /grand\s*total[^\d]{0,35}(\d+(?:\.\d{1,2})?)/i,
    /total\s*(?:amount|payable)[^\d]{0,35}(\d+(?:\.\d{1,2})?)/i,
    /amount\s*payable[^\d]{0,35}(\d+(?:\.\d{1,2})?)/i,
    /invoice\s*total[^\d]{0,35}(\d+(?:\.\d{1,2})?)/i,
    /bill\s*total[^\d]{0,35}(\d+(?:\.\d{1,2})?)/i
  ];
  for(const p of patterns){
    const m=clean.match(p);
    if(m&&Number(m[1])>0)return Number(m[1]);
  }
  return null;
}

function compressImage(file){
  return new Promise(resolve=>{
    const reader=new FileReader();
    reader.onload=()=>{
      const img=new Image();
      img.onload=()=>{
        const scale=Math.min(1,1200/Math.max(img.width,img.height));
        const c=document.createElement("canvas");
        c.width=Math.round(img.width*scale);
        c.height=Math.round(img.height*scale);
        c.getContext("2d").drawImage(img,0,0,c.width,c.height);
        resolve(c.toDataURL("image/jpeg",.68));
      };
      img.src=reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function deleteDistributor(id){
  const x=distributor(id);
  if(!x)return;
  const t=distributorTotals(id);
  if(!confirm(`Delete ${x.name}? Its bills and payments will also be deleted. This cannot be undone.`))return;
  data.dist=data.dist.filter(x=>x.id!==id);
  data.bills=data.bills.filter(x=>x.did!==id);
  data.pay=data.pay.filter(x=>x.did!==id);
  syncStock();
  render();
}

function deleteBill(id){
  if(!confirm("Delete this bill? Stock will be recalculated."))return;
  data.bills=data.bills.filter(x=>x.id!==id);
  syncStock();render();
}

function deletePayment(id){
  if(!confirm("Delete this payment?"))return;
  data.pay=data.pay.filter(x=>x.id!==id);
  save();render();
}

function exportData(){
  const blob=new Blob([JSON.stringify(data,null,2)],{type:"application/json"});
  const url=URL.createObjectURL(blob);
  const a=document.createElement("a");
  a.href=url;a.download="shankar-beej-backup.json";a.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}

function importData(){
  const input=document.createElement("input");
  input.type="file";input.accept=".json,application/json";
  input.onchange=()=>{
    const file=input.files?.[0];if(!file)return;
    const reader=new FileReader();
    reader.onload=()=>{
      try{
        const imported=normalizeData(JSON.parse(reader.result));
        if(!confirm("Import this backup and replace current shop data?"))return;
        data=imported;save();syncStock();render();alert("Backup imported successfully.");
      }catch{alert("Invalid backup file.")}
    };
    reader.readAsText(file);
  };
  input.click();
}

function resetData(){
  if(!confirm("This will delete ALL distributors, bills, payments, stock adjustments and sales from this device. Continue?"))return;
  if(!confirm("Final confirmation: all shop records will be erased. Your settings will be kept."))return;
  const keepSettings={...data.settings};
  data=defaultData();
  data.settings=keepSettings;
  save();
  render();
  alert("All shop records have been reset. Dashboard is now fresh.");
}

async function enableNotifications(){
  if(!("Notification" in window)){
    alert("This browser does not support notifications.");
    return;
  }
  const permission=await Notification.requestPermission();
  if(permission!=="granted"){alert("Notification permission was not granted.");return}
  data.settings.notifications=true;save();
  alert("85-day period notifications are enabled.");
  checkPeriodNotification(true);
}

function checkPeriodNotification(force=false){
  if(!data.settings.notifications||!("Notification" in window)||Notification.permission!=="granted")return;
  const periods=completedPeriods();
  if(!periods.length)return;
  const last=periods[periods.length-1];
  const key=`period-${last.from}-${last.to}`;
  if(data.notificationLog.includes(key)&&!force)return;
  const body=`Period ${dateText(last.from)} to ${dateText(last.to)} completed. Total sales: ${money(last.sales)}. GST at ${data.settings.rate}%: ${money(last.gst)}.`;
  try{
    navigator.serviceWorker?.ready.then(reg=>{
      reg.showNotification("Shankar Beej Bhandar",{body,tag:key});
    }).catch(()=>new Notification("Shankar Beej Bhandar",{body}));
  }catch{}
  if(!data.notificationLog.includes(key))data.notificationLog.push(key);
  save();
}

window.openDistributorForm=openDistributorForm;
window.openBillForm=openBillForm;
window.openPaymentForm=openPaymentForm;
window.openSaleForm=openSaleForm;
window.openStockAdjustment=openStockAdjustment;
window.openDistributorDetail=openDistributorDetail;
window.renderDistributors=renderDistributors;
window.openGst=openGst;
window.openPeriods=openPeriods;
window.openSettings=openSettings;
window.openSales=openSales;
window.deleteDistributor=deleteDistributor;
window.deleteBill=deleteBill;
window.deletePayment=deletePayment;
window.exportData=exportData;
window.importData=importData;
window.resetData=resetData;
window.enableNotifications=enableNotifications;

document.querySelectorAll(".bottom-nav button").forEach(btn=>{
  btn.onclick=()=>{page=btn.dataset.page;detailDist=null;detailMode=null;render()};
});

document.addEventListener("click",e=>{
  if(e.target.classList.contains("remove-item")) e.target.closest(".item-row")?.remove();
});

document.addEventListener("keydown",e=>{
  if(e.key==="Escape")document.querySelector(".modalWrap")?.remove();
});

window.addEventListener("beforeinstallprompt",e=>{
  e.preventDefault();deferredInstall=e;
  const btn=document.getElementById("install");
  if(btn)btn.style.display="block";
});

document.getElementById("install").onclick=async()=>{
  if(deferredInstall){
    deferredInstall.prompt();
    await deferredInstall.userChoice;
    deferredInstall=null;
  }else{
    alert("Use Chrome menu → Add to Home screen / Install app.");
  }
};

if("serviceWorker" in navigator) navigator.serviceWorker.register("./sw.js").catch(()=>{});

function bind(){
  const search=document.getElementById("search");
  if(!search)return;
  search.oninput=()=>{
    const q=search.value.toLowerCase();
    const list=document.getElementById("list");
    if(page==="distributors"){
      list.innerHTML=data.dist.filter(x=>(x.name+" "+x.place+" "+x.phone).toLowerCase().includes(q)).map(distributorCard).join("")||`<div class="card empty">No matching distributor.</div>`;
    }
    if(page==="bills"){
      list.innerHTML=data.bills.filter(b=>{
        const text=b.no+" "+(distributor(b.did)?.name||"")+" "+(b.items||[]).map(x=>x.name).join(" ");
        return text.toLowerCase().includes(q);
      }).sort((a,b)=>b.date.localeCompare(a.date)).map(b=>billCard(b,false)).join("")||`<div class="card empty">No matching bill.</div>`;
    }
    if(page==="stock"){
      list.innerHTML=(data.stock||[]).filter(x=>x.name.toLowerCase().includes(q)).map(x=>`<div class="card"><div class="row"><b>${esc(x.name)}</b><b>${x.q}</b></div></div>`).join("")||`<div class="card empty">No matching item.</div>`;
    }
  };
}

render();
