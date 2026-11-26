import { useEffect, useMemo, useRef, useState } from "react";
import { onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } from "firebase/auth";
import { addDoc, collection, deleteDoc, doc, onSnapshot, query, serverTimestamp, updateDoc, setDoc } from "firebase/firestore";
import { auth, db, firebaseReady } from "./firebase";
import { LayoutDashboard, ReceiptText, Wallet, LogOut, Plus, Search, Download, X, Pencil, Trash2, ShieldCheck, ImagePlus, Upload, ClipboardPaste, FileDown } from "lucide-react";
import { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, ImageRun, PageBreak } from "docx";

const money = n => new Intl.NumberFormat("zh-TW", { style: "currency", currency: "TWD", maximumFractionDigits: 0 }).format(Number(n || 0));
const today = () => new Date().toISOString().slice(0, 10);
const blankLine = () => ({ item: "", purpose: "", location: "", photo: "" });
const blank = { buyer: "", invoiceDate: today(), invoiceAmount: "", invoiceNo: "", lineItems: [blankLine()] };
const getLines = record => Array.isArray(record.lineItems) && record.lineItems.length ? record.lineItems : [{ item: record.item || "", purpose: record.purpose || "", location: record.location || "", photo: record.photo || "" }];

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
  while (result.length > 180000 && quality > 0.25) {
    quality -= 0.08;
    result = canvas.toDataURL("image/jpeg", quality);
  }
  if (result.length > 190000) throw new Error("圖片仍太大，請改用較小的圖片或先裁切後再上傳。");
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
  const [selectedIds, setSelectedIds] = useState([]);
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [budgetInput, setBudgetInput] = useState("");
  const [buyerDraft, setBuyerDraft] = useState("");
  const [locationDraft, setLocationDraft] = useState("");
  const fileInput = useRef([]);

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
  const filtered = useMemo(() => items.filter(x => String(x.invoiceDate || x.purchaseDate || "").startsWith(year) && [x.buyer,x.invoiceNo,...getLines(x).flatMap(v=>[v.item,v.purpose,v.location])].join(" ").toLowerCase().includes(search.toLowerCase())).sort((a,b) => String(b.invoiceDate || b.purchaseDate || "").localeCompare(String(a.invoiceDate || a.purchaseDate || ""))), [items, year, search]);
  const total = filtered.reduce((s,x) => s + Number(x.invoiceAmount || 0), 0);
  const reimbursed = 0;
  const pending = total;
  const budget = budgets.find(x => String(x.year) === year)?.amount || 0;
  const optionDoc = budgets.find(x => x.id === "system-options");
  const buyerOptions = optionDoc?.buyerOptions || [];
  const locationOptions = optionDoc?.locationOptions || [];

  async function handleAuth(e) {
    e.preventDefault(); setError(""); setBusy(true);
    try {
      if (authMode === "login") await signInWithEmailAndPassword(auth, email, password);
      else await createUserWithEmailAndPassword(auth, email, password);
    } catch (e) { setError(e.code === "auth/invalid-credential" ? "帳號或密碼錯誤。" : e.message); }
    finally { setBusy(false); }
  }

  function openNew() { setEditing(null); setForm({ ...blank, invoiceDate: today(), lineItems: [blankLine()] }); setFormOpen(true); }
  function openEdit(item) { setEditing(item); setForm({ buyer: item.buyer || "", invoiceDate: item.invoiceDate || today(), invoiceAmount: item.invoiceAmount ?? "", invoiceNo: item.invoiceNo || "", lineItems: getLines(item).map(v=>({...blankLine(),...v})) }); setFormOpen(true); }
  async function receivePhoto(file, index) {
    try {
      const photo = await preparePhoto(file);
      setForm(current => ({ ...current, lineItems: current.lineItems.map((v,i)=>i===index?{...v,photo}:v) }));
      setError("");
    } catch (e) { setError(e.message || "圖片讀取失敗，請再試一次。"); }
    if (fileInput.current) fileInput.current.value = "";
  }
  function handlePaste(e, index) {
    const imageItem = Array.from(e.clipboardData?.items || []).find(item => item.type.startsWith("image/"));
    if (!imageItem) return;
    e.preventDefault();
    const file = imageItem.getAsFile();
    if (file) receivePhoto(file, index);
  }
  function updateLine(index, key, value) { setForm(current=>({...current,lineItems:current.lineItems.map((v,i)=>i===index?{...v,[key]:value}:v)})); }
  function addLine() { setForm(current=>({...current,lineItems:[...current.lineItems,blankLine()]})); }
  function removeLine(index) { setForm(current=>({...current,lineItems:current.lineItems.length===1?current.lineItems:[...current.lineItems.filter((_,i)=>i!==index)]})); }

  async function downloadWord(records) {
    try {
      const selectedRecords = Array.isArray(records) ? records : [records];
      const border = { style: "single", size: 6, color: "7F8C99" };
      const borders = { top: border, bottom: border, left: border, right: border, insideHorizontal: border, insideVertical: border };
      const font = "標楷體";
      const metaWidths = [1656, 2952, 1656, 2952];
      const detailWidths = [691, 1944, 2088, 2232, 2261];
      const makeCell = (value, options = {}) => new TableCell({
        width: { size: options.width || 1800, type: WidthType.DXA },
        verticalAlign: "center",
        shading: options.fill ? { fill: options.fill, type: "clear" } : undefined,
        margins: options.margins || { top: 120, bottom: 120, left: 70, right: 70 },
        children: [new Paragraph({
          alignment: options.align || "center",
          spacing: { before: 40, after: 40 },
          children: [new TextRun({ text: String(value ?? ""), font, size: options.size || 18, bold: !!options.bold, color: options.color || "000000" })]
        })]
      });
      const children = [];
      selectedRecords.forEach((record, recordIndex) => {
        if (recordIndex > 0) children.push(new Paragraph({ children: [new PageBreak()] }));
        const lines = getLines(record);
        const metaRows = [
          new TableRow({ children: [
            makeCell("採購人", { width: metaWidths[0], fill: "D9EAF7", bold: true, size: 20 }),
            makeCell(record.buyer || "", { width: metaWidths[1], align: "left", size: 20 }),
            makeCell("發票日期", { width: metaWidths[2], fill: "D9EAF7", bold: true, size: 20 }),
            makeCell(record.invoiceDate || "", { width: metaWidths[3], align: "left", size: 20 })
          ] }),
          new TableRow({ children: [
            makeCell("發票金額", { width: metaWidths[0], fill: "D9EAF7", bold: true, size: 20 }),
            makeCell(money(record.invoiceAmount), { width: metaWidths[1], align: "left", size: 20 }),
            makeCell("發票號碼", { width: metaWidths[2], fill: "D9EAF7", bold: true, size: 20 }),
            makeCell(record.invoiceNo || "", { width: metaWidths[3], align: "left", size: 20 })
          ] })
        ];
        const headers = ["項次", "用品名稱／規格", "用品照片", "用途說明", "擺放（使用）地點"];
        const detailRows = [new TableRow({ tableHeader: true, children: headers.map((v, i) => makeCell(v, { width: detailWidths[i], fill: "1F4E79", bold: true, color: "FFFFFF", size: 18, margins: { top: 130, bottom: 130, left: 55, right: 55 } })) })];
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          let photoParagraph = new Paragraph({ text: "" });
          if (line.photo && line.photo.startsWith("data:image/")) {
            const bytes = Uint8Array.from(atob(line.photo.split(",")[1]), ch => ch.charCodeAt(0));
            photoParagraph = new Paragraph({ alignment: "center", children: [new ImageRun({ data: bytes, transformation: { width: 95, height: 72 } })] });
          }
          const photoCell = new TableCell({ width: { size: detailWidths[2], type: WidthType.DXA }, verticalAlign: "center", margins: { top: 120, bottom: 120, left: 70, right: 70 }, children: [photoParagraph] });
          detailRows.push(new TableRow({ height: { value: 2088, rule: "atLeast" }, children: [
            makeCell(i + 1, { width: detailWidths[0], size: 18 }),
            makeCell(line.item || "", { width: detailWidths[1], size: 18 }),
            photoCell,
            makeCell(line.purpose || "", { width: detailWidths[3], size: 18 }),
            makeCell(line.location || "", { width: detailWidths[4], size: 18 })
          ] }));
        }
        children.push(
          new Paragraph({ alignment: "center", spacing: { before: 0, after: 240 }, children: [new TextRun({ text: "雜支用品採購及核銷紀錄表", font, size: 36, bold: true, color: "1F4E79" })] }),
          new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, columnWidths: metaWidths, borders, rows: metaRows }),
          new Paragraph({ text: "", spacing: { after: 40 } }),
          new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, columnWidths: detailWidths, borders, rows: detailRows }),
          new Paragraph({ spacing: { before: 160, after: 40 }, children: [new TextRun({ text: "核銷檢附資料：請依規定檢附發票或收據，並填寫用品用途及實際擺放（使用）地點。", font, size: 18, color: "595959" })] })
        );
      });
      const docxFile = new Document({ sections: [{ properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 792, bottom: 792, left: 792, right: 792 } } }, children }] });
      const blob = await Packer.toBlob(docxFile);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = selectedRecords.length === 1
        ? `雜支用品採購及核銷紀錄表_${selectedRecords[0].invoiceNo || selectedRecords[0].invoiceDate || "未命名"}.docx`
        : `雜支用品採購及核銷紀錄表_合併${selectedRecords.length}筆.docx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) { setError("Word 檔案產生失敗：" + e.message); }
  }

  function toggleSelected(id) {
    setSelectedIds(current => current.includes(id) ? current.filter(v => v !== id) : [...current, id]);
  }
  function toggleAllSelected(checked) {
    setSelectedIds(current => checked ? [...new Set([...current, ...filtered.map(x => x.id)])] : current.filter(id => !filtered.some(x => x.id === id)));
  }
  async function downloadSelectedWord() {
    const records = filtered.filter(x => selectedIds.includes(x.id));
    if (!records.length) { setError("請先勾選要合併下載的採購紀錄。"); return; }
    await downloadWord(records);
  }

  async function savePurchase(e) {
    e.preventDefault(); setBusy(true); setError("");
    try {
      const validLines = form.lineItems.map(v=>({...v,item:v.item.trim(),purpose:v.purpose.trim(),location:v.location.trim()}));
      if (!form.buyer) throw new Error("請選擇採購人。");
      if (!validLines.length || validLines.some(v=>!v.item || !v.purpose || !v.location)) throw new Error("請完整填寫每個品項的名稱、用途及選擇擺放地點。");
      if (JSON.stringify(validLines).length > 850000) throw new Error("同一張發票的照片總容量過大，請減少照片或先縮小圖片後再儲存。");
      const payload = { buyer: form.buyer, invoiceDate: form.invoiceDate, invoiceAmount: Number(form.invoiceAmount || 0), invoiceNo: form.invoiceNo, lineItems: validLines, item: validLines[0].item, purpose: validLines[0].purpose, location: validLines[0].location, photo: validLines[0].photo || "", updatedAt: serverTimestamp(), createdBy: editing?.createdBy || user.uid };
      if (editing) await updateDoc(doc(db, "purchases", editing.id), payload);
      else await addDoc(collection(db, "purchases"), { ...payload, createdAt: serverTimestamp() });
      setFormOpen(false); setEditing(null); setForm({ ...blank, lineItems: [blankLine()] });
    } catch (e) { setError("儲存失敗：" + e.message + "。請確認 Firestore 與使用者角色設定。"); }
    finally { setBusy(false); }
  }

  async function removeItem(item) {
    if (!isAdmin || !confirm("確定刪除此筆採購紀錄？")) return;
    try { await deleteDoc(doc(db, "purchases", item.id)); } catch (e) { setError(e.message); }
  }

  function openSettings() { setBuyerDraft(buyerOptions.join("\n")); setLocationDraft(locationOptions.join("\n")); setPage("settings"); }

  async function saveOptions() {
    if (!isAdmin) return;
    const clean = value => [...new Set(value.split(/\r?\n/).map(v=>v.trim()).filter(Boolean))];
    try {
      await setDoc(doc(db, "budgets", "system-options"), { year: "system-options", buyerOptions: clean(buyerDraft), locationOptions: clean(locationDraft), updatedAt: serverTimestamp() });
      setError("");
    } catch (e) { setError("儲存選單設定失敗：" + e.message); }
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
    const labels = ["採購人","發票日期","發票金額","發票號碼","項次","用品名稱／規格","用途說明","擺放（使用）地點"];
    const rows = [labels, ...filtered.flatMap(x=>getLines(x).map((v,i)=>[x.buyer,x.invoiceDate,x.invoiceAmount,x.invoiceNo,i+1,v.item,v.purpose,v.location]))];
    const csv = "\uFEFF" + rows.map(row => row.map(v => '"' + String(v).replaceAll('"','""') + '"').join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a"); a.href = url; a.download = "資源教室雜支採購紀錄_" + year + ".csv"; a.click(); URL.revokeObjectURL(url);
  }

  if (!firebaseReady) return <div className="setup"><div className="setup-card"><div className="brand-mark">RR</div><h1>資源教室雜支管理系統</h1><p>尚未完成 Firebase 前端設定。</p><ol><li>複製 .env.example 並命名為 .env.local</li><li>填入 Firebase Web App 的六項設定</li><li>重新啟動 npm run dev</li></ol></div></div>;

  if (!user) return <div className="login-wrap"><form className="login-card" onSubmit={handleAuth}><div className="brand-mark">RR</div><p className="eyebrow">RESOURCE ROOM</p><h1>資源教室雜支管理系統</h1><p className="muted">採購紀錄管理</p><label>電子郵件<input type="email" required value={email} onChange={e=>setEmail(e.target.value)} placeholder="name@example.com"/></label><label>密碼<input type="password" required minLength="6" value={password} onChange={e=>setPassword(e.target.value)} placeholder="至少 6 個字元"/></label><button className="primary full" disabled={busy}>{busy ? "處理中…" : authMode === "login" ? "登入系統" : "建立帳號"}</button><button type="button" className="link-button" onClick={()=>setAuthMode(authMode==="login"?"register":"login")}>{authMode==="login"?"尚未有帳號？建立帳號":"已有帳號？返回登入"}</button>{error&&<p className="error">{error}</p>}</form></div>;

  return <div className="app-shell">
    <aside className="sidebar"><div className="brand"><div className="brand-mark small">RR</div><div><b>資源教室</b><span>雜支管理系統</span></div></div><nav><button className={page==="dashboard"?"active":""} onClick={()=>setPage("dashboard")}><LayoutDashboard size={18}/>總覽儀表板</button><button className={page==="purchases"?"active":""} onClick={()=>setPage("purchases")}><ReceiptText size={18}/>採購紀錄</button><button className={page==="budget"?"active":""} onClick={()=>setPage("budget")}><Wallet size={18}/>年度經費</button>{isAdmin&&<button className={page==="settings"?"active":""} onClick={openSettings}><Pencil size={18}/>選單設定</button>}</nav><div className="side-bottom"><div className="role-chip"><ShieldCheck size={15}/>{role==="admin"?"管理者":role==="staff"?"承辦人":"查詢者"}</div><div className="user-email">{user.email}</div><button className="logout" onClick={()=>signOut(auth)}><LogOut size={17}/>登出</button></div></aside>
    <main className="main"><header className="topbar"><div><p className="eyebrow">RESOURCE ROOM / EXPENSES</p><h1>{page==="dashboard"?"總覽儀表板":page==="purchases"?"採購紀錄":page==="settings"?"選單設定":"年度經費管理"}</h1></div><div className="top-actions"><select value={year} onChange={e=>setYear(e.target.value)}>{Array.from({length:6},(_,i)=>String(new Date().getFullYear()-i)).map(y=><option key={y}>{y}</option>)}</select>{canEdit&&<button className="primary" onClick={openNew}><Plus size={17}/>新增採購</button>}</div></header>
      {error&&<div className="alert">{error}<button onClick={()=>setError("")}><X size={16}/></button></div>}
      {profile && !profile.role && <div className="alert">尚未設定使用者角色，目前以查詢者權限登入。請管理者在 Firestore 的 users/{user.uid} 文件設定 role。</div>}
      {page==="dashboard"&&<><section className="stats"><div className="stat-card"><span>年度發票金額</span><strong>{money(total)}</strong><small>{year} 年已登錄採購紀錄</small></div><div className="stat-card"><span>採購筆數</span><strong>{filtered.length} 筆</strong><small>依發票日期統計</small></div><div className="stat-card"><span>本年度剩餘經費</span><strong>{money(Number(budget)-total)}</strong><small>核定經費扣除登錄金額</small></div><div className="stat-card"><span>年度核定經費</span><strong>{money(budget)}</strong><small>由年度經費頁面設定</small></div></section><section className="panel"><div className="panel-heading"><div><h2>近期採購紀錄</h2><p>依發票日期排序</p></div><button className="text-button" onClick={()=>setPage("purchases")}>查看全部 →</button></div><PurchaseTable items={filtered.slice(0,5)} onEdit={openEdit} onDelete={removeItem} onWord={downloadWord} canEdit={canEdit} isAdmin={isAdmin}/></section></>}
      {page==="purchases"&&<section className="panel"><div className="panel-heading"><div><h2>採購紀錄明細</h2><p>依表格欄位登錄用品、照片、用途及擺放地點</p></div><div className="table-tools"><div className="search"><Search size={16}/><input placeholder="搜尋用品、發票、地點…" value={search} onChange={e=>setSearch(e.target.value)}/></div><button className="secondary" onClick={exportCsv}><Download size={16}/>匯出 CSV</button><button className="secondary" onClick={downloadSelectedWord} disabled={!selectedIds.some(id=>filtered.some(x=>x.id===id))}><FileDown size={16}/>合併下載 Word（{selectedIds.filter(id=>filtered.some(x=>x.id===id)).length}）</button></div></div><PurchaseTable items={filtered} onEdit={openEdit} onDelete={removeItem} onWord={downloadWord} canEdit={canEdit} isAdmin={isAdmin} selectedIds={selectedIds} onToggleSelected={toggleSelected} allSelected={filtered.length>0&&filtered.every(x=>selectedIds.includes(x.id))} onToggleAll={toggleAllSelected} selectionEnabled/></section>}
      {page==="settings"&&isAdmin&&<section className="panel settings-panel"><div className="panel-heading"><div><h2>採購紀錄選單設定</h2><p>請將每個選項分行輸入，儲存後會套用於新增及編輯紀錄。</p></div></div><div className="settings-grid"><label>採購人名單<textarea rows="8" value={buyerDraft} onChange={e=>setBuyerDraft(e.target.value)} placeholder={"例如：\n王小明\n陳小華"}/><small>每行一位採購人</small></label><label>存放／使用地點名單<textarea rows="8" value={locationDraft} onChange={e=>setLocationDraft(e.target.value)} placeholder={"例如：\n資源教室辦公室\n資源教室諮商室\n活動器材室"}/><small>每行一個地點</small></label></div><div className="settings-actions"><button className="primary" onClick={saveOptions}>儲存選單設定</button></div></section>}{page==="budget"&&<section className="panel budget-panel"><div className="panel-heading"><div><h2>{year} 年度經費</h2><p>依採購紀錄中的發票金額統計</p></div></div><div className="budget-number"><span>核定經費</span><strong>{money(budget)}</strong></div><div className="progress"><i style={{width:Math.min(100,budget?total/budget*100:0)+"%"}}/></div><div className="budget-grid"><div><span>採購發票金額</span><b>{money(total)}</b></div><div><span>採購筆數</span><b>{filtered.length} 筆</b></div><div><span>剩餘經費</span><b>{money(Number(budget)-total)}</b></div></div>{isAdmin&&<div className="budget-edit"><label>設定年度核定經費<input type="number" min="0" value={budgetInput} onChange={e=>setBudgetInput(e.target.value)} placeholder="輸入金額"/></label><button className="primary" onClick={saveBudget}>儲存預算</button></div>}</section>}
    </main>
    {formOpen&&<div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setFormOpen(false)}}><form className="modal purchase-modal" onSubmit={savePurchase}><div className="modal-head"><div><p className="eyebrow">PURCHASE RECORD</p><h2>{editing?"編輯採購紀錄":"新增採購紀錄"}</h2></div><button type="button" className="icon-button" onClick={()=>setFormOpen(false)}><X/></button></div>
      <div className="form-grid purchase-fields">
        <label>採購人<select required value={form.buyer} onChange={e=>setForm({...form,buyer:e.target.value})}><option value="">請選擇採購人</option>{[...new Set([...buyerOptions,form.buyer].filter(Boolean))].map(v=><option key={v} value={v}>{v}</option>)}</select></label>
        <label>發票日期<input required type="date" value={form.invoiceDate} onChange={e=>setForm({...form,invoiceDate:e.target.value})}/></label>
        <label>發票金額<input required type="number" min="0" value={form.invoiceAmount} onChange={e=>setForm({...form,invoiceAmount:e.target.value})} placeholder="請輸入金額"/></label>
        <label>發票號碼<input value={form.invoiceNo} onChange={e=>setForm({...form,invoiceNo:e.target.value})} placeholder="請輸入發票號碼"/></label>
        <div className="wide line-items-heading"><h3>採購品項</h3><button type="button" className="secondary" onClick={addLine}><Plus size={16}/>新增品項</button></div>
        {form.lineItems.map((line,index)=><section className="line-item-card wide" key={index}><div className="line-item-title"><b>品項 {index+1}</b>{form.lineItems.length>1&&<button type="button" className="text-button" onClick={()=>removeLine(index)}>移除此品項</button>}</div>
          <label className="wide">用品名稱／規格<input required value={line.item} onChange={e=>updateLine(index,"item",e.target.value)} placeholder="請輸入用品名稱及規格"/></label>
          <label className="wide">用品照片</label>
          <div className="photo-upload wide" tabIndex="0" onPaste={e=>handlePaste(e,index)}>
            {line.photo?<img className="photo-preview" src={line.photo} alt={`品項${index+1}照片預覽`}/>:<div className="photo-placeholder"><ImagePlus size={30}/><b>點擊選取照片，或在此按 Ctrl+V 貼上</b><span>可貼上螢幕截圖或複製的圖片</span></div>}
            <div className="photo-actions"><button type="button" className="secondary" onClick={()=>fileInput.current?.[index]?.click()}><Upload size={16}/>選取檔案上傳</button><span><ClipboardPaste size={15}/> Ctrl+V 貼上圖片</span>{line.photo&&<button type="button" className="text-button" onClick={()=>updateLine(index,"photo","")}>移除照片</button>}</div>
            <input ref={el=>{if(!fileInput.current)fileInput.current=[];fileInput.current[index]=el;}} type="file" accept="image/*" hidden onChange={e=>{if(e.target.files?.[0])receivePhoto(e.target.files[0],index);}}/>
          </div>
          <label className="wide">用途說明<textarea required rows="3" value={line.purpose} onChange={e=>updateLine(index,"purpose",e.target.value)} placeholder="請說明此品項用途"/></label>
          <label className="wide">擺放（使用）地點<select required value={line.location} onChange={e=>updateLine(index,"location",e.target.value)}><option value="">請選擇存放／使用地點</option>{[...new Set([...locationOptions,line.location].filter(Boolean))].map(v=><option key={v} value={v}>{v}</option>)}</select></label>
        </section>)}
      </div>
      <p className="photo-note">每個品項可分別上傳照片；照片會自動壓縮後儲存於採購紀錄中，本系統不使用 Firebase Storage；若品項較多，請留意整張發票照片總容量。</p>
      <div className="modal-foot"><button type="button" className="secondary" onClick={()=>setFormOpen(false)}>取消</button><button className="primary" disabled={busy}>{busy?"儲存中…":"儲存紀錄"}</button></div>
    </form></div>}
  </div>;
}

function PurchaseTable({items,onEdit,onDelete,canEdit,isAdmin,onWord,selectedIds=[],onToggleSelected=()=>{},allSelected=false,onToggleAll=()=>{},selectionEnabled=false}) {
  if (!items.length) return <div className="empty">目前沒有採購紀錄，新增第一筆資料吧。</div>;
  return <div className="table-wrap"><table><thead><tr>{selectionEnabled&&<th><input aria-label="全選採購紀錄" type="checkbox" checked={allSelected} onChange={e=>onToggleAll(e.target.checked)}/></th>}<th>採購人</th><th>發票日期</th><th>發票金額</th><th>發票號碼</th><th>品項明細（名稱／照片／用途／地點）</th><th>操作</th></tr></thead><tbody>{items.map(x=><tr key={x.id}>{selectionEnabled&&<td><input aria-label={"選取發票 "+(x.invoiceNo||x.invoiceDate||"紀錄")} type="checkbox" checked={selectedIds.includes(x.id)} onChange={()=>onToggleSelected(x.id)}/></td>}<td>{x.buyer||"—"}</td><td>{x.invoiceDate||"—"}</td><td className="amount">{money(x.invoiceAmount)}</td><td>{x.invoiceNo||"—"}</td><td><div className="invoice-lines">{getLines(x).map((v,i)=><div className="invoice-line" key={i}><b>{i+1}. {v.item||"—"}</b>{v.photo&&<img className="table-photo" src={v.photo} alt="用品照片"/>}<span>{v.purpose||"—"}</span><small>地點：{v.location||"—"}</small></div>)}</div></td><td><div className="row-actions">{<button title="下載 Word" onClick={()=>onWord(x)}><FileDown size={15}/></button>}{canEdit&&<button title="編輯" onClick={()=>onEdit(x)}><Pencil size={15}/></button>}{isAdmin&&<button title="刪除" onClick={()=>onDelete(x)}><Trash2 size={15}/></button>}</div></td></tr>)}</tbody></table></div>;
}
