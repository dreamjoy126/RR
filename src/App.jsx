import { useEffect, useMemo, useState } from "react";
import { onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } from "firebase/auth";
import { addDoc, collection, deleteDoc, doc, onSnapshot, orderBy, query, serverTimestamp, updateDoc, where } from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { auth, db, storage, firebaseReady } from "./firebase";
import { LayoutDashboard, ReceiptText, Wallet, LogOut, Plus, Search, Download, ImagePlus, X, Pencil, Trash2, Menu, ShieldCheck } from "lucide-react";

const money = n => new Intl.NumberFormat("zh-TW", { style: "currency", currency: "TWD", maximumFractionDigits: 0 }).format(Number(n || 0));
const today = () => new Date().toISOString().slice(0, 10);
const blank = { purchaseDate: today(), item: "", category: "文具用品", quantity: 1, unitPrice: "", vendor: "", invoiceNo: "", invoiceDate: "", purpose: "", location: "", status: "待核銷", reimbursementDate: "", note: "" };

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
  const [file, setFile] = useState(null);
  const [search, setSearch] = useState("");
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [budgetInput, setBudgetInput] = useState("");

  useEffect(() => {
    if (!firebaseReady) return;
    return onAuthStateChanged(auth, setUser);
  }, []);

  useEffect(() => {
    if (!user || !db) { setProfile(null); setItems([]); return; }
    const stopProfile = onSnapshot(doc(db, "users", user.uid), snap => setProfile(snap.exists() ? snap.data() : { role: "viewer" }), e => setError(e.message));
    const stopItems = onSnapshot(query(collection(db, "purchases"), orderBy("purchaseDate", "desc")), snap => setItems(snap.docs.map(d => ({ id: d.id, ...d.data() }))), e => setError("讀取採購資料失敗，請確認 Firestore 已建立及安全規則已部署。"));
    const stopBudgets = onSnapshot(collection(db, "budgets"), snap => setBudgets(snap.docs.map(d => ({ id: d.id, ...d.data() }))), e => setError(e.message));
    return () => { stopProfile(); stopItems(); stopBudgets(); };
  }, [user]);

  const role = profile?.role || "viewer";
  const canEdit = role === "admin" || role === "staff";
  const isAdmin = role === "admin";
  const filtered = useMemo(() => items.filter(x => String(x.purchaseDate || "").startsWith(year) && [x.item,x.category,x.invoiceNo,x.vendor,x.location].join(" ").toLowerCase().includes(search.toLowerCase())), [items, year, search]);
  const total = filtered.reduce((s,x) => s + Number(x.total || Number(x.quantity || 0) * Number(x.unitPrice || 0)), 0);
  const reimbursed = filtered.filter(x => x.status === "已核銷").reduce((s,x) => s + Number(x.total || 0), 0);
  const pending = total - reimbursed;
  const budget = budgets.find(x => String(x.year) === year)?.amount || 0;

  async function handleAuth(e) {
    e.preventDefault(); setError(""); setBusy(true);
    try {
      if (authMode === "login") await signInWithEmailAndPassword(auth, email, password);
      else await createUserWithEmailAndPassword(auth, email, password);
    } catch (e) { setError(e.code === "auth/invalid-credential" ? "帳號或密碼錯誤。" : e.message); }
    finally { setBusy(false); }
  }

  function openNew() { setEditing(null); setForm(blank); setFile(null); setFormOpen(true); }
  function openEdit(item) { setEditing(item); setForm({ ...blank, ...item }); setFile(null); setFormOpen(true); }

  async function savePurchase(e) {
    e.preventDefault(); setBusy(true); setError("");
    try {
      let photoUrl = form.photoUrl || "";
      if (file) {
        const path = "purchases/" + (editing?.id || crypto.randomUUID()) + "/" + Date.now() + "-" + file.name;
        const uploaded = await uploadBytes(ref(storage, path), file);
        photoUrl = await getDownloadURL(uploaded.ref);
      }
      const payload = { ...form, quantity: Number(form.quantity), unitPrice: Number(form.unitPrice), total: Number(form.quantity) * Number(form.unitPrice), photoUrl, updatedAt: serverTimestamp(), createdBy: editing?.createdBy || user.uid };
      if (editing) await updateDoc(doc(db, "purchases", editing.id), payload);
      else await addDoc(collection(db, "purchases"), { ...payload, createdAt: serverTimestamp() });
      setFormOpen(false); setEditing(null); setForm(blank); setFile(null);
    } catch (e) { setError("儲存失敗：" + e.message + "。請確認 Firestore、Storage 與使用者角色設定。"); }
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
    const cols = ["purchaseDate","item","category","quantity","unitPrice","total","vendor","invoiceNo","invoiceDate","purpose","location","status","reimbursementDate","note"];
    const labels = ["採購日期","品項","分類","數量","單價","總金額","廠商","發票編號","發票日期","用途說明","使用地點","核銷狀態","核銷日期","備註"];
    const rows = [labels, ...filtered.map(x => cols.map(k => x[k] ?? ""))];
    const csv = "\uFEFF" + rows.map(row => row.map(v => '"' + String(v).replaceAll('"','""') + '"').join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a"); a.href = url; a.download = "資源教室雜支_" + year + ".csv"; a.click(); URL.revokeObjectURL(url);
  }

  if (!firebaseReady) return <div className="setup"><div className="setup-card"><div className="brand-mark">RR</div><h1>資源教室雜支管理系統</h1><p>尚未完成 Firebase 前端設定。</p><ol><li>複製 .env.example 並命名為 .env.local</li><li>填入 Firebase Web App 的六項設定</li><li>重新啟動 npm run dev</li></ol></div></div>;

  if (!user) return <div className="login-wrap"><form className="login-card" onSubmit={handleAuth}><div className="brand-mark">RR</div><p className="eyebrow">RESOURCE ROOM</p><h1>資源教室雜支管理系統</h1><p className="muted">經費、採購與核銷紀錄，一處管理</p><label>電子郵件<input type="email" required value={email} onChange={e=>setEmail(e.target.value)} placeholder="name@example.com"/></label><label>密碼<input type="password" required minLength="6" value={password} onChange={e=>setPassword(e.target.value)} placeholder="至少 6 個字元"/></label><button className="primary full" disabled={busy}>{busy ? "處理中…" : authMode === "login" ? "登入系統" : "建立帳號"}</button><button type="button" className="link-button" onClick={()=>setAuthMode(authMode==="login"?"register":"login")}>{authMode==="login"?"尚未有帳號？建立帳號":"已有帳號？返回登入"}</button>{error&&<p className="error">{error}</p>}</form></div>;

  return <div className="app-shell">
    <aside className="sidebar"><div className="brand"><div className="brand-mark small">RR</div><div><b>資源教室</b><span>雜支管理系統</span></div></div><nav><button className={page==="dashboard"?"active":""} onClick={()=>setPage("dashboard")}><LayoutDashboard size={18}/>總覽儀表板</button><button className={page==="purchases"?"active":""} onClick={()=>setPage("purchases")}><ReceiptText size={18}/>採購與核銷</button><button className={page==="budget"?"active":""} onClick={()=>setPage("budget")}><Wallet size={18}/>年度經費</button></nav><div className="side-bottom"><div className="role-chip"><ShieldCheck size={15}/>{role==="admin"?"管理者":role==="staff"?"承辦人":"查詢者"}</div><div className="user-email">{user.email}</div><button className="logout" onClick={()=>signOut(auth)}><LogOut size={17}/>登出</button></div></aside>
    <main className="main"><header className="topbar"><div><p className="eyebrow">RESOURCE ROOM / EXPENSES</p><h1>{page==="dashboard"?"總覽儀表板":page==="purchases"?"採購與核銷":"年度經費管理"}</h1></div><div className="top-actions"><select value={year} onChange={e=>setYear(e.target.value)}>{Array.from({length:6},(_,i)=>String(new Date().getFullYear()-i)).map(y=><option key={y}>{y}</option>)}</select>{canEdit&&<button className="primary" onClick={openNew}><Plus size={17}/>新增採購</button>}</div></header>
      {error&&<div className="alert">{error}<button onClick={()=>setError("")}><X size={16}/></button></div>}
      {profile && !profile.role && <div className="alert">尚未設定使用者角色，目前以查詢者權限登入。請管理者在 Firestore 的 users/{user.uid} 文件設定 role。</div>}
      {page==="dashboard"&&<><section className="stats"><div className="stat-card"><span>年度採購支出</span><strong>{money(total)}</strong><small>{year} 年已登錄採購</small></div><div className="stat-card"><span>已核銷金額</span><strong>{money(reimbursed)}</strong><small>核銷狀態為已核銷</small></div><div className="stat-card"><span>待核銷金額</span><strong>{money(pending)}</strong><small>尚未完成核銷</small></div><div className="stat-card"><span>年度剩餘經費</span><strong>{money(Number(budget)-total)}</strong><small>核定經費扣除採購支出</small></div></section><section className="panel"><div className="panel-heading"><div><h2>近期採購紀錄</h2><p>依採購日期排序</p></div><button className="text-button" onClick={()=>setPage("purchases")}>查看全部 →</button></div><PurchaseTable items={filtered.slice(0,5)} onEdit={openEdit} onDelete={removeItem} canEdit={canEdit} isAdmin={isAdmin}/></section></>}
      {page==="purchases"&&<section className="panel"><div className="panel-heading"><div><h2>採購明細</h2><p>管理用品、憑證、用途與擺放地點</p></div><div className="table-tools"><div className="search"><Search size={16}/><input placeholder="搜尋品項、發票、地點…" value={search} onChange={e=>setSearch(e.target.value)}/></div><button className="secondary" onClick={exportCsv}><Download size={16}/>匯出 CSV</button></div></div><PurchaseTable items={filtered} onEdit={openEdit} onDelete={removeItem} canEdit={canEdit} isAdmin={isAdmin}/></section>}
      {page==="budget"&&<section className="panel budget-panel"><div className="panel-heading"><div><h2>{year} 年度經費</h2><p>預算與執行狀況</p></div></div><div className="budget-number"><span>核定經費</span><strong>{money(budget)}</strong></div><div className="progress"><i style={{width:Math.min(100,budget?total/budget*100:0)+"%"}}/></div><div className="budget-grid"><div><span>已採購支出</span><b>{money(total)}</b></div><div><span>已核銷金額</span><b>{money(reimbursed)}</b></div><div><span>待核銷金額</span><b>{money(pending)}</b></div><div><span>剩餘經費</span><b>{money(Number(budget)-total)}</b></div></div>{isAdmin&&<div className="budget-edit"><label>設定年度核定經費<input type="number" min="0" value={budgetInput} onChange={e=>setBudgetInput(e.target.value)} placeholder="輸入金額"/></label><button className="primary" onClick={saveBudget}>儲存預算</button></div>}</section>}
    </main>
    {formOpen&&<div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setFormOpen(false)}}><form className="modal" onSubmit={savePurchase}><div className="modal-head"><div><p className="eyebrow">PURCHASE RECORD</p><h2>{editing?"編輯採購紀錄":"新增採購紀錄"}</h2></div><button type="button" className="icon-button" onClick={()=>setFormOpen(false)}><X/></button></div><div className="form-grid">{[["purchaseDate","採購日期","date"],["item","品項名稱","text"],["category","用品分類","select"],["quantity","數量","number"],["unitPrice","單價","number"],["vendor","廠商／平台","text"],["invoiceNo","發票編號","text"],["invoiceDate","發票日期","date"],["purpose","用途說明","text"],["location","擺放／使用地點","text"],["status","核銷狀態","status"],["reimbursementDate","核銷日期","date"]].map(([key,label,type])=><label key={key}>{label}{type==="select"?<select value={form[key]} onChange={e=>setForm({...form,[key]:e.target.value})}>{["文具用品","清潔用品","生活用品","教具教材","活動用品","資訊設備","其他"].map(v=><option key={v}>{v}</option>)}</select>:type==="status"?<select value={form[key]} onChange={e=>setForm({...form,[key]:e.target.value})}><option>待核銷</option><option>已核銷</option></select>:<input required={["purchaseDate","item","quantity","unitPrice"].includes(key)} type={type} min={type==="number"?"0":undefined} step={key==="unitPrice"?"1":undefined} value={form[key]} onChange={e=>setForm({...form,[key]:e.target.value})}/>}</label>)}<label className="wide">備註<textarea rows="2" value={form.note} onChange={e=>setForm({...form,note:e.target.value})}/></label><label className="wide upload"><ImagePlus size={18}/>用品照片／發票憑證（圖片或 PDF，10MB 以內）<input type="file" accept="image/*,application/pdf" onChange={e=>setFile(e.target.files?.[0]||null)}/>{file&&<small>{file.name}</small>}{form.photoUrl&&!file&&<small>已有附件 <a href={form.photoUrl} target="_blank" rel="noreferrer">開啟</a></small>}</label></div><div className="modal-foot"><button type="button" className="secondary" onClick={()=>setFormOpen(false)}>取消</button><button className="primary" disabled={busy}>{busy?"儲存中…":"儲存紀錄"}</button></div></form></div>}
  </div>;
}

function PurchaseTable({items,onEdit,onDelete,canEdit,isAdmin}) {
  if (!items.length) return <div className="empty">目前沒有採購紀錄，新增第一筆資料吧。</div>;
  return <div className="table-wrap"><table><thead><tr><th>採購日期</th><th>品項／用途</th><th>發票編號</th><th>使用地點</th><th>金額</th><th>核銷狀態</th><th>附件</th><th>操作</th></tr></thead><tbody>{items.map(x=><tr key={x.id}><td>{x.purchaseDate||"—"}</td><td><b>{x.item}</b><small>{x.purpose||x.category}</small></td><td>{x.invoiceNo||"—"}</td><td>{x.location||"—"}</td><td className="amount">{money(x.total)}</td><td><span className={"status "+(x.status==="已核銷"?"done":"pending")}>{x.status||"待核銷"}</span></td><td>{x.photoUrl?<a href={x.photoUrl} target="_blank" rel="noreferrer">查看附件</a>:"—"}</td><td><div className="row-actions">{canEdit&&<button title="編輯" onClick={()=>onEdit(x)}><Pencil size={15}/></button>}{isAdmin&&<button title="刪除" onClick={()=>onDelete(x)}><Trash2 size={15}/></button>}</div></td></tr>)}</tbody></table></div>;
}
