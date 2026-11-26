import { useEffect, useMemo, useRef, useState } from "react";
import { onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } from "firebase/auth";
import { addDoc, collection, deleteDoc, doc, onSnapshot, query, serverTimestamp, updateDoc } from "firebase/firestore";
import { auth, db, firebaseReady } from "./firebase";
import { LayoutDashboard, ReceiptText, Wallet, LogOut, Plus, Search, Download, X, Pencil, Trash2, ShieldCheck, ImagePlus, Upload, ClipboardPaste } from "lucide-react";

const money = n => new Intl.NumberFormat("zh-TW", { style: "currency", currency: "TWD", maximumFractionDigits: 0 }).format(Number(n || 0));
const today = () => new Date().toISOString().slice(0, 10);
const blank = { buyer: "", invoiceDate: today(), invoiceAmount: "", invoiceNo: "", item: "", purpose: "", location: "", photo: "" };

async function preparePhoto(file) {
  if (!file || !file.type.startsWith("image/")) throw new Error("請選擇圖片檔案。");
  const source = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
  const img = await new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = source;
  });
  const scale = Math.min(1, 1100 / Math.max(img.width, img.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(img.width * scale));
  canvas.height = Math.max(1, Math.round(img.height * scale));
  canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
  let quality = 0.78;
  let result = canvas.toDataURL("image/jpeg", quality);
  while (result.length > 650000 && quality > 0.35) {
    quality -= 0.08;
    result = canvas.toDataURL("image/jpeg", quality);
  }
  if (result.length > 700000) throw new Error("圖片仍太大，請改用較小的圖片或先裁切後再上傳。");
  return result;
}

export default function App() {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [items, setItems] = useState([]);
  const [budgets, setBudgets] = useState([]);
  const [page, setPage] = useState("dashboard");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [authMode, setAuthMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(blank);
  const [search, setSearch] = useState("");
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [budgetInput, setBudgetInput] = useState("");
  const fileInput = useRef(null);

  useEffect(() => {
    if (!firebaseReady) return;
    return onAuthStateChanged(auth, setUser);
  }, []);

  useEffect(() => {
    if (!user || !db) { setProfile(null); setItems([]); return; }
    const stopProfile = onSnapshot(doc(db, "users", user.uid), snap => setProfile(snap.exists() ? snap.data() : { role: "viewer" }), e => setError(e.message));
    const stopItems = onSnapshot(collection(db, "purchases"), snap => setItems(snap.docs.map(d => ({ id: d.id, ...d.data() }))), e => setError("讀取採購資料失敗，請確認 Firestore 已建立及安全規則已部署。"));
    const stopBudgets = onSnapshot(collection(db, "budgets"), snap => setBudgets(snap.docs.map(d => ({ id: d.id, ...d.data() }))), e => setError(e.message));
    return () => { stopProfile(); stopItems(); stopBudgets(); };
  }, [user]);

  const role = profile?.role || "viewer";
  const canEdit = role === "admin" || role === "staff";
  const isAdmin = role === "admin";
  const filtered = useMemo(() => items.filter(x => String(x.invoiceDate || x.purchaseDate || "").startsWith(year) && [x.buyer,x.item,x.invoiceNo,x.purpose,x.location].join(" ").toLowerCase().includes(search.toLowerCase())).sort((a,b) => String(b.invoiceDate || b.purchaseDate || "").localeCompare(String(a.invoiceDate || a.purchaseDate || ""))), [items, year, search]);
  const total = filtered.reduce((s,x) => s + Number(x.invoiceAmount || 0), 0);
  const reimbursed = 0;
  const pending = total;
  const budget = budgets.find(x => String(x.year) === year)?.amount || 0;

  async function handleAuth(e) {
    e.preventDefault(); setError(""); setBusy(true);
    try {
      if (authMode === "login") await signInWithEmailAndPassword(auth, email, password);
      else await createUserWithEmailAndPassword(auth, email, password);
    } catch (e) { setError(e.code === "auth/invalid-credential" ? "帳號或密碼錯誤。" : e.message); }
    finally { setBusy(false); }
  }

  function openNew() { setEditing(null); setForm({ ...blank, invoiceDate: today() }); setFormOpen(true); }
  function openEdit(item) { setEditing(item); setForm({ ...blank, ...item }); setFormOpen(true); }
  async function receivePhoto(file) {
    try {
      const photo = await preparePhoto(file);
      setForm(current => ({ ...current, photo }));
      setError("");
    } catch (e) { setError(e.message || "圖片讀取失敗，請再試一次。"); }
    if (fileInput.current) fileInput.current.value = "";
  }
  function handlePaste(e) {
    const imageItem = Array.from(e.clipboardData?.items || []).find(item => item.type.startsWith("image/"));
    if (!imageItem) return;
    e.preventDefault();
    const file = imageItem.getAsFile();
    if (file) receivePhoto(file);
  }

  async function savePurchase(e) {
    e.preventDefault(); setBusy(true); setError("");
    try {
      const payload = { ...form, invoiceAmount: Number(form.invoiceAmount || 0), updatedAt: serverTimestamp(), createdBy: editing?.createdBy || user.uid };
      if (editing) await updateDoc(doc(db, "purchases", editing.id), payload);
      else await addDoc(collection(db, "purchases"), { ...payload, createdAt: serverTimestamp() });
      setFormOpen(false); setEditing(null); setForm(blank);
    } catch (e) { setError("儲存失敗：" + e.message + "。請確認 Firestore 與使用者角色設定。"); }
    finally { setBusy(false); }
  }

  async function removeItem(item) {
    if (!isAdmin || !confirm("確定刪除此筆採購紀錄？")) return;
    try { await deleteDoc(doc(db, "purchases", item.id)); } catch (e) { setError(e.message); }
  }

  async function saveBudget() {
    if (!isAdmin || !budgetInput || Number(budgetInput) < 0) return;
    try {
      const found = budgets.find(x => String(x.year) === year);
      if (found) await updateDoc(doc(db, "budgets", found.id), { amount: Number(budgetInput) });
      else await addDoc(collection(db, "budgets"), { year: Number(year), amount: Number(budgetInput) });
      setBudgetInput("");
    } catch (e) { setError("更新年度預算失敗：" + e.message); }
  }

  function exportCsv() {
    const cols = ["buyer","invoiceDate","invoiceAmount","invoiceNo","item","purpose","location"];
    const labels = ["採購人","發票日期","發票金額","發票號碼","用品名稱／規格","用途說明","擺放（使用）地點"];
    const rows = [labels, ...filtered.map(x => cols.map(k => x[k] ?? ""))];
    const csv = "\uFEFF" + rows.map(row => row.map(v => '"' + String(v).replaceAll('"','""') + '"').join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a"); a.href = url; a.download = "資源教室雜支採購紀錄_" + year + ".csv"; a.click(); URL.revokeObjectURL(url);
  }

  if (!firebaseReady) return <div className="setup"><div className="setup-card"><div className="brand-mark">RR</div><h1>資源教室雜支管理系統</h1><p>尚未完成 Firebase 前端設定。</p><ol><li>複製 .env.example 並命名為 .env.local</li><li>填入 Firebase Web App 的六項設定</li><li>重新啟動 npm run dev</li></ol></div></div>;

  if (!user) return <div className="login-wrap"><form className="login-card" onSubmit={handleAuth}><div className="brand-mark">RR</div><p className="eyebrow">RESOURCE ROOM</p><h1>資源教室雜支管理系統</h1><p className="muted">採購紀錄管理</p><label>電子郵件<input type="email" required value={email} onChange={e=>setEmail(e.target.value)} placeholder="name@example.com"/></label><label>密碼<input type="password" required minLength="6" value={password} onChange={e=>setPassword(e.target.value)} placeholder="至少 6 個字元"/></label><button className="primary full" disabled={busy}>{busy ? "處理中…" : authMode === "login" ? "登入系統" : "建立帳號"}</button><button type="button" className="link-button" onClick={()=>setAuthMode(authMode==="login"?"register":"login")}>{authMode==="login"?"尚未有帳號？建立帳號":"已有帳號？返回登入"}</button>{error&&<p className="error">{error}</p>}</form></div>;

  return <div className="app-shell">
    <aside className="sidebar"><div className="brand"><div className="brand-mark small">RR</div><div><b>資源教室</b><span>雜支管理系統</span></div></div><nav><button className={page==="dashboard"?"active":""} onClick={()=>setPage("dashboard")}><LayoutDashboard size={18}/>總覽儀表板</button><button className={page==="purchases"?"active":""} onClick={()=>setPage("purchases")}><ReceiptText size={18}/>採購紀錄</button><button className={page==="budget"?"active":""} onClick={()=>setPage("budget")}><Wallet size={18}/>年度經費</button></nav><div className="side-bottom"><div className="role-chip"><ShieldCheck size={15}/>{role==="admin"?"管理者":role==="staff"?"承辦人":"查詢者"}</div><div className="user-email">{user.email}</div><button className="logout" onClick={()=>signOut(auth)}><LogOut size={17}/>登出</button></div></aside>
    <main className="main"><header className="topbar"><div><p className="eyebrow">RESOURCE ROOM / EXPENSES</p><h1>{page==="dashboard"?"總覽儀表板":page==="purchases"?"採購紀錄":"年度經費管理"}</h1></div><div className="top-actions"><select value={year} onChange={e=>setYear(e.target.value)}>{Array.from({length:6},(_,i)=>String(new Date().getFullYear()-i)).map(y=><option key={y}>{y}</option>)}</select>{canEdit&&<button className="primary" onClick={openNew}><Plus size={17}/>新增採購</button>}</div></header>
      {error&&<div className="alert">{error}<button onClick={()=>setError("")}><X size={16}/></button></div>}
      {profile && !profile.role && <div className="alert">尚未設定使用者角色，目前以查詢者權限登入。請管理者在 Firestore 的 users/{user.uid} 文件設定 role。</div>}
      {page==="dashboard"&&<><section className="stats"><div className="stat-card"><span>年度發票金額</span><strong>{money(total)}</strong><small>{year} 年已登錄採購紀錄</small></div><div className="stat-card"><span>採購筆數</span><strong>{filtered.length} 筆</strong><small>依發票日期統計</small></div><div className="stat-card"><span>本年度剩餘經費</span><strong>{money(Number(budget)-total)}</strong><small>核定經費扣除登錄金額</small></div><div className="stat-card"><span>年度核定經費</span><strong>{money(budget)}</strong><small>由年度經費頁面設定</small></div></section><section className="panel"><div className="panel-heading"><div><h2>近期採購紀錄</h2><p>依發票日期排序</p></div><button className="text-button" onClick={()=>setPage("purchases")}>查看全部 →</button></div><PurchaseTable items={filtered.slice(0,5)} onEdit={openEdit} onDelete={removeItem} canEdit={canEdit} isAdmin={isAdmin}/></section></>}
      {page==="purchases"&&<section className="panel"><div className="panel-heading"><div><h2>採購紀錄明細</h2><p>依表格欄位登錄用品、照片、用途及擺放地點</p></div><div className="table-tools"><div className="search"><Search size={16}/><input placeholder="搜尋用品、發票、地點…" value={search} onChange={e=>setSearch(e.target.value)}/></div><button className="secondary" onClick={exportCsv}><Download size={16}/>匯出 CSV</button></div></div><PurchaseTable items={filtered} onEdit={openEdit} onDelete={removeItem} canEdit={canEdit} isAdmin={isAdmin}/></section>}
      {page==="budget"&&<section className="panel budget-panel"><div className="panel-heading"><div><h2>{year} 年度經費</h2><p>依採購紀錄中的發票金額統計</p></div></div><div className="budget-number"><span>核定經費</span><strong>{money(budget)}</strong></div><div className="progress"><i style={{width:Math.min(100,budget?total/budget*100:0)+"%"}}/></div><div className="budget-grid"><div><span>採購發票金額</span><b>{money(total)}</b></div><div><span>採購筆數</span><b>{filtered.length} 筆</b></div><div><span>剩餘經費</span><b>{money(Number(budget)-total)}</b></div></div>{isAdmin&&<div className="budget-edit"><label>設定年度核定經費<input type="number" min="0" value={budgetInput} onChange={e=>setBudgetInput(e.target.value)} placeholder="輸入金額"/></label><button className="primary" onClick={saveBudget}>儲存預算</button></div>}</section>}
    </main>
    {formOpen&&<div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setFormOpen(false)}}><form className="modal purchase-modal" onSubmit={savePurchase}><div className="modal-head"><div><p className="eyebrow">PURCHASE RECORD</p><h2>{editing?"編輯採購紀錄":"新增採購紀錄"}</h2></div><button type="button" className="icon-button" onClick={()=>setFormOpen(false)}><X/></button></div>
      <div className="form-grid purchase-fields">
        <label>採購人<input required value={form.buyer} onChange={e=>setForm({...form,buyer:e.target.value})} placeholder="請輸入採購人"/></label>
        <label>發票日期<input required type="date" value={form.invoiceDate} onChange={e=>setForm({...form,invoiceDate:e.target.value})}/></label>
        <label>發票金額<input required type="number" min="0" value={form.invoiceAmount} onChange={e=>setForm({...form,invoiceAmount:e.target.value})} placeholder="請輸入金額"/></label>
        <label>發票號碼<input value={form.invoiceNo} onChange={e=>setForm({...form,invoiceNo:e.target.value})} placeholder="請輸入發票號碼"/></label>
        <label className="wide">用品名稱／規格<input required value={form.item} onChange={e=>setForm({...form,item:e.target.value})} placeholder="請輸入用品名稱及規格"/></label>
        <label className="wide">用品照片</label>
        <div className="photo-upload wide" tabIndex="0" onPaste={handlePaste} onKeyDown={e=>{if(e.key==="Enter"||e.key===" ")fileInput.current?.click();}}>
          {form.photo?<img className="photo-preview" src={form.photo} alt="用品照片預覽"/>:<div className="photo-placeholder"><ImagePlus size={30}/><b>點擊選取照片，或在此按 Ctrl+V 貼上</b><span>可貼上螢幕截圖或複製的圖片</span></div>}
          <div className="photo-actions"><button type="button" className="secondary" onClick={e=>{e.stopPropagation();fileInput.current?.click();}}><Upload size={16}/>選取檔案上傳</button><span><ClipboardPaste size={15}/> Ctrl+V 貼上圖片</span>{form.photo&&<button type="button" className="text-button" onClick={e=>{e.stopPropagation();setForm({...form,photo:""});}}>移除照片</button>}</div>
          <input ref={fileInput} type="file" accept="image/*" hidden onChange={e=>{if(e.target.files?.[0])receivePhoto(e.target.files[0]);}}/>
        </div>
        <label className="wide">用途說明<textarea required rows="3" value={form.purpose} onChange={e=>setForm({...form,purpose:e.target.value})} placeholder="請說明採購用品用途"/></label>
        <label className="wide">擺放（使用）地點<input required value={form.location} onChange={e=>setForm({...form,location:e.target.value})} placeholder="請輸入用品擺放或使用地點"/></label>
      </div>
      <p className="photo-note">照片會縮小後儲存於採購紀錄中；本系統不使用 Firebase Storage。建議每筆紀錄上傳一張清晰照片。</p>
      <div className="modal-foot"><button type="button" className="secondary" onClick={()=>setFormOpen(false)}>取消</button><button className="primary" disabled={busy}>{busy?"儲存中…":"儲存紀錄"}</button></div>
    </form></div>}
  </div>;
}

function PurchaseTable({items,onEdit,onDelete,canEdit,isAdmin}) {
  if (!items.length) return <div className="empty">目前沒有採購紀錄，新增第一筆資料吧。</div>;
  return <div className="table-wrap"><table><thead><tr><th>採購人</th><th>發票日期</th><th>發票金額</th><th>發票號碼</th><th>用品名稱／規格</th><th>用品照片</th><th>用途說明</th><th>擺放（使用）地點</th><th>操作</th></tr></thead><tbody>{items.map(x=><tr key={x.id}><td>{x.buyer||"—"}</td><td>{x.invoiceDate||"—"}</td><td className="amount">{money(x.invoiceAmount)}</td><td>{x.invoiceNo||"—"}</td><td><b>{x.item||"—"}</b></td><td>{x.photo?<img className="table-photo" src={x.photo} alt="用品照片"/>:"—"}</td><td className="purpose-cell">{x.purpose||"—"}</td><td>{x.location||"—"}</td><td><div className="row-actions">{canEdit&&<button title="編輯" onClick={()=>onEdit(x)}><Pencil size={15}/></button>}{isAdmin&&<button title="刪除" onClick={()=>onDelete(x)}><Trash2 size={15}/></button>}</div></td></tr>)}</tbody></table></div>;
}
