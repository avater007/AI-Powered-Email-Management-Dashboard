import { useEffect, useState } from "react";
import { api, setToken, getToken } from "./api.js";
import "./styles.css";

const CLIENT = "Priya", ASSIST = "Alex";
const NAMES = { assistant: "Assistant to reply", client: "Client to reply", none: "No reply needed", review: "Needs review" };
const SEGS = [
  ["all", "Inbox", () => true], ["assistant", "Assistant to reply", e => e.cls === "assistant" && !e.done],
  ["client", "Client to reply", e => e.cls === "client" && !e.done], ["review", "Needs review", e => e.cls === "review" && !e.done],
  ["none", "No reply needed", e => e.cls === "none"], ["action", "Action required", e => ["assistant", "client"].includes(e.cls) && !e.done],
  ["wait", "Waiting for response", e => e.wait], ["meet", "Meetings", e => e.meet],
  ["imp", "Important", e => e.imp], ["arch", "Archived", e => e.arch]
];
const Chip = ({ e }) => <span className={"chip c-" + e.cls}><i />{NAMES[e.cls]}</span>;

export default function App() {
  const [me, setMe] = useState(null), [ready, setReady] = useState(false);
  useEffect(() => {
    if (!getToken()) return setReady(true);
    api("/me").then(setMe).catch(() => setToken(null)).finally(() => setReady(true));
  }, []);
  if (!ready) return null;
  if (!me) return <Login onAuth={setMe} />;
  if (!me.accounts.length) return <Connect onDone={setMe} />;
  return <Shell me={me} setMe={setMe} />;
}

const Logo = () => <div className="logo"><b />Relay</div>;

function Login({ onAuth }) {
  const [email, setEmail] = useState(""), [password, setPw] = useState(""), [err, setErr] = useState(""), [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true); setErr("");
    try { const d = await api("/auth", { method: "POST", body: { email, password } }); setToken(d.token); onAuth(d.user); }
    catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  return <div className="hero"><Logo />
    <h1>Know who needs to reply, before you open a single email.</h1>
    <p>Relay reads your client's inbox and tells you what you handle, what needs the client, and what can be ignored.</p>
    <input className="field" placeholder="Work email" value={email} onChange={e => setEmail(e.target.value)} />
    <input className="field" type="password" placeholder="Password (new emails sign up automatically)" value={password} onChange={e => setPw(e.target.value)} />
    {err && <p style={{ color: "var(--cl)" }}>{err}</p>}
    <button className="btn pri" style={{ width: "100%", padding: 11 }} disabled={busy} onClick={go}>{busy ? "Signing in…" : "Log in or sign up"}</button>
  </div>;
}

function Connect({ onDone }) {
  const [prov, setProv] = useState(null), [prog, setProg] = useState(0), [err, setErr] = useState("");
  const msgs = ["Authorizing…", "Reading folders…", "Importing conversations…", "AI is classifying who should reply…"];
  const start = async p => {
    setProv(p); setProg(8); setErr("");
    const t = setInterval(() => setProg(x => Math.min(x + 9, 90)), 400);
    try { const u = await api("/accounts", { method: "POST", body: { provider: p } }); setProg(100); setTimeout(() => onDone(u), 400); }
    catch (e) { setErr(e.message); setProv(null); } finally { clearInterval(t); }
  };
  if (prov) return <div className="hero"><Logo /><div className="steps"><div style={{ width: prog + "%" }} /></div><h1>Syncing {prov}…</h1><p>{msgs[Math.min(3, Math.floor(prog / 25))]}</p></div>;
  return <div className="hero"><Logo /><div className="steps"><div style={{ width: "60%" }} /></div>
    <h1>Connect your client's inbox</h1><p>Relay reads mail and saves drafts. It never sends without your approval.</p>
    {[["Gmail", "#d9473b", "Gmail / Google Workspace"], ["Outlook", "#1a6fd1", "Outlook / Microsoft 365"]].map(([p, c, n]) =>
      <button key={p} className="prov" onClick={() => start(p)}><b style={{ background: c }}>{p[0]}</b><span><strong>{n}</strong><br /><small>Simulated OAuth in this prototype</small></span></button>)}
    {err && <p style={{ color: "var(--cl)" }}>{err}</p>}</div>;
}

function Shell({ me, setMe }) {
  const [emails, setEmails] = useState(null), [role, setRole] = useState("assistant"), [modal, setModal] = useState(false), [toast, setToast] = useState(""), [error, setError] = useState("");
  const load = () => api("/emails").then(setEmails).catch(e => setError(e.message));
  useEffect(() => { load(); }, []);
  const say = m => { setToast(m); setTimeout(() => setToast(""), 2400); };
  const act = async (id, body, msg) => { try { await api("/emails/" + id, { method: "PATCH", body }); await load(); msg && say(msg); } catch (e) { say(e.message); } };
  return <>
    <header className="top"><Logo />
      <button className="sync" onClick={() => setModal(true)}><span className="dot" />{me.accounts.length} account{me.accounts.length > 1 ? "s" : ""} · synced just now</button>
      <div className="seg">{["assistant", "client"].map(r => <button key={r} className={role === r ? "on" : ""} onClick={() => setRole(r)}>{r === "assistant" ? "Assistant view" : "Client view"}</button>)}</div>
    </header>
    {error ? <div className="empty"><b>Couldn't load your inbox</b>{error}<br /><button className="btn" onClick={() => { setError(""); load(); }}>Try again</button></div>
      : role === "client" ? <ClientView emails={emails} act={act} />
      : <Dashboard emails={emails} act={act} load={load} say={say} />}
    {modal && <Accounts me={me} setMe={setMe} close={() => setModal(false)} say={say} />}
    {toast && <div className="toast">{toast}</div>}
  </>;
}

function Dashboard({ emails, act, load, say }) {
  const [seg, setSeg] = useState("all"), [q, setQ] = useState(""), [sel, setSel] = useState(null), [chat, setChat] = useState(false);
  const [drafts, setDrafts] = useState({}), [msgs, setMsgs] = useState([]), [qi, setQi] = useState("");
  if (!emails) return <div className="wrap"><div className="listcol"><div className="list">{[1, 2, 3, 4, 5].map(i => <div key={i} className="sk" />)}</div></div></div>;
  const live = emails.filter(e => !e.arch), f = SEGS.find(s => s[0] === seg)[2], ql = q.toLowerCase();
  const list = emails.filter(e => (seg === "arch" ? e.arch : !e.arch) && f(e) && (!ql || (e.from + e.subj + e.summ + e.org).toLowerCase().includes(ql)));
  const cur = emails.find(e => e._id === sel);
  const stats = [["Unread", live.filter(e => e.unread).length, "all"], ["Assistant to reply", live.filter(SEGS[1][2]).length, "assistant"], ["Client to reply", live.filter(SEGS[2][2]).length, "client"], ["Needs review", live.filter(SEGS[3][2]).length, "review"]];
  const open = id => { setSel(id); setChat(false); act(id, { unread: false }); };

  const getDraft = async () => { const d = await api(`/emails/${cur._id}/draft`, { method: "POST" }); setDrafts({ ...drafts, [cur._id]: d.text }); say("Draft ready for your review"); };
  const send = async () => { await api(`/emails/${cur._id}/send`, { method: "POST", body: { text: drafts[cur._id] } }); const d = { ...drafts }; delete d[cur._id]; setDrafts(d); await load(); say("Reply sent"); };
  const sim = async () => { const r = await api(`/emails/${cur._id}/simulate`, { method: "POST" }); await load(); say(`New message. AI re-checked: ${NAMES[r.before]} → ${NAMES[r.after]}`); };
  const ask = async text => {
    if (!text.trim()) return; setQi(""); setMsgs(m => [...m, { me: 1, text }]);
    const r = await api("/ask", { method: "POST", body: { q: text, selected: sel } });
    setMsgs(m => [...m, { text: r.text, ids: r.ids }]);
  };

  return <div className="wrap">
    <nav className="side">{SEGS.map(([k, n, fn], i) => <span key={k} style={{ display: "contents" }}>{[1, 5, 9].includes(i) && <hr />}
      <button className={seg === k ? "on" : ""} onClick={() => { setSeg(k); setChat(false); }}>{n}<small>{k === "arch" ? emails.filter(e => e.arch).length : live.filter(fn).length}</small></button></span>)}</nav>
    <div className="listcol">
      <div className="stats">{stats.map(s => <button key={s[0]} className="stat" onClick={() => setSeg(s[2])}><b>{s[1]}</b><span>{s[0]}</span></button>)}</div>
      <div className="search"><input placeholder="Search emails" value={q} onChange={e => setQ(e.target.value)} /><button className="btn" onClick={() => setChat(true)}>Ask AI</button></div>
      <div className="list">{list.length ? list.map(e =>
        <button key={e._id} className={`row cl-${e.cls}${e.unread ? " unread" : ""}${sel === e._id ? " sel" : ""}${e.done ? " done" : ""}`} onClick={() => open(e._id)}>
          <div className="l1"><span className="from">{e.imp && "★ "}{e.from}</span><span className="when">{e.when}</span></div>
          <div className="sub">{e.subj}</div>
          <div className="l3"><Chip e={e} /><span className="tag">{e.conf < 0.6 ? "Low confidence" : e.manual ? "Set by you" : Math.round(e.conf * 100) + "% sure"}</span>{e.done && <span className="tag">✓ Done</span>}{e.note && <span className="tag">· {e.note}</span>}</div>
        </button>) : <div className="empty"><b>Nothing here</b>{q ? `No conversations match “${q}”.` : "This segment is clear. Nice work."}</div>}</div>
    </div>

    {chat ? <div className="detail"><button className="btn back" onClick={() => setChat(false)}>‹ Back</button><h2>Ask about your emails</h2>
      <div className="card ask">{msgs.map((m, i) => m.me ? <div key={i} className="bub me">{m.text}</div> :
        <div key={i} className="bub">{m.text}{(m.ids || []).map(id => { const e = emails.find(x => x._id === id); return e && <button key={id} onClick={() => open(id)}>{e.from}: {e.subj}</button>; })}</div>)}
        <div className="sugg">{["Which emails require the client's attention?", "What am I waiting for a response on?", "Show me emails that need review", "Summarize this conversation", "Why has this email been assigned to the client?"].map(s => <button key={s} onClick={() => ask(s)}>{s}</button>)}</div>
        <div className="search" style={{ margin: 0 }}><input placeholder="Ask anything…" value={qi} onChange={e => setQi(e.target.value)} onKeyDown={e => e.key === "Enter" && ask(qi)} /><button className="btn pri" onClick={() => ask(qi)}>Ask</button></div></div></div>
    : cur ? <div className="detail"><button className="btn back" onClick={() => setSel(null)}>‹ Back</button>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}><Chip e={cur} />{cur.imp && <span className="chip c-none">★ Important</span>}{cur.wait && <span className="chip c-none">Waiting for response</span>}</div>
      <h2 style={{ marginTop: 8 }}>{cur.subj}</h2><div className="tag">{cur.from} · {cur.org} · {cur.addr}</div>
      <div className="card ai"><h4>AI summary</h4><p>{cur.summ}</p>
        <h4 style={{ marginTop: 10 }}>Why {NAMES[cur.cls].toLowerCase()}{cur.manual ? " (set manually)" : ` · ${Math.round(cur.conf * 100)}% confidence`}</h4>
        <p>{cur.manual ? "You changed this classification. AI keeps it until you reset it." : cur.why}</p>
        {cur.note && <p><strong>Note:</strong> {cur.note}</p>}
        {cur.dates?.length > 0 && <><h4 style={{ marginTop: 10 }}>Dates found</h4>{cur.dates.map(d => <p key={d}>📅 {d}</p>)}</>}</div>
      <div className="acts"><label className="tag">Reply owner <select value={cur.cls} onChange={e => act(cur._id, { cls: e.target.value }, "Classification updated")}>{Object.entries(NAMES).map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select></label>
        {cur.manual && <button className="btn sm" onClick={() => act(cur._id, { reset: true }, "Back to AI classification")}>Reset to AI</button>}
        <button className="btn sm" onClick={() => act(cur._id, { imp: !cur.imp })}>{cur.imp ? "Remove star" : "Mark important"}</button>
        <button className="btn sm" onClick={() => { act(cur._id, { unread: true }, "Marked unread"); setSel(null); }}>Mark unread</button>
        <button className="btn sm" onClick={() => act(cur._id, { done: !cur.done }, cur.done ? "Reopened" : "Marked completed")}>{cur.done ? "Reopen" : "Mark completed"}</button>
        <button className="btn sm" onClick={() => { act(cur._id, { arch: !cur.arch }, cur.arch ? "Unarchived" : "Archived"); setSel(null); }}>{cur.arch ? "Unarchive" : "Archive"}</button></div>
      <div className="card"><h4>Conversation ({cur.t.length})</h4>{cur.t.map((m, i) => <div key={i} className="msg"><div className="mh"><b>{m.f}</b><span>{m.w}</span></div><p>{m.b}</p></div>)}
        {cur.next && <button className="btn sm" style={{ marginTop: 8 }} onClick={sim}>Simulate new reply arriving</button>}</div>
      <div className="card"><h4>Reply</h4>{drafts[cur._id] === undefined
        ? <><p className="tag">Let AI prepare a draft. You review and approve before anything is sent.</p><button className="btn pri" onClick={getDraft}>Draft reply with AI</button></>
        : <><textarea value={drafts[cur._id]} onChange={e => setDrafts({ ...drafts, [cur._id]: e.target.value })} />
          <div className="acts"><button className="btn pri" onClick={send}>Approve and send</button><button className="btn" onClick={getDraft}>Regenerate</button><button className="btn" onClick={() => { const d = { ...drafts }; delete d[cur._id]; setDrafts(d); }}>Discard</button></div></>}</div>
    </div>
    : <div className="detail"><div className="empty"><b>Select a conversation</b>AI shows who should reply and why. Or press Ask AI.</div></div>}
  </div>;
}

function ClientView({ emails, act }) {
  const [open, setOpen] = useState(null);
  if (!emails) return <div className="client"><div className="sk" /></div>;
  const l = emails.filter(e => e.cls === "client" && !e.done && !e.arch);
  return <div className="client"><div className="tag">Hello, {CLIENT}</div>
    <h1>{l.length ? `${l.length} thing${l.length > 1 ? "s" : ""} need you` : "You're all clear"}</h1><div className="tag">Everything else is handled by {ASSIST}.</div>
    {l.length ? l.map(e => <div className="cc" key={e._id}>
      <div className="meta">{e.from} · {e.org} · {e.when}</div><h3>{e.subj}</h3><p>{e.summ}</p>
      <div className="why"><strong>Why you:</strong> {e.why}</div>
      {open === e._id && e.t.map((m, i) => <div key={i} className="msg"><div className="mh"><b>{m.f}</b><span>{m.w}</span></div><p>{m.b}</p></div>)}
      <div className="acts"><button className="btn sm" onClick={() => setOpen(open === e._id ? null : e._id)}>{open === e._id ? "Hide" : "Read original"}</button>
        <button className="btn pri sm" onClick={() => act(e._id, { done: true, note: `${CLIENT} marked this handled` }, `Marked handled. ${ASSIST} can see this.`)}>Mark handled</button>
        <button className="btn sm" onClick={() => act(e._id, { cls: "assistant", note: `${CLIENT} asked you to take over` }, `${ASSIST} will take it from here`)}>Ask {ASSIST} to take over</button></div>
    </div>) : <div className="empty"><b>Inbox zero for you</b>New items that need your reply will appear here.</div>}
    <p className="tag" style={{ textAlign: "center" }}>Changes here update {ASSIST}'s dashboard instantly.</p></div>;
}

function Accounts({ me, setMe, close, say }) {
  const add = async p => { setMe(await api("/accounts", { method: "POST", body: { provider: p } })); say(p + " connected"); };
  const rm = async p => { setMe(await api("/accounts/" + p, { method: "DELETE" })); say("Account disconnected"); };
  return <div className="modal"><div className="card"><h4>Connected accounts</h4>
    {me.accounts.map(a => <div key={a} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid var(--ln)" }}>
      <span><strong>{a}</strong><br /><small className="tag">Last synced just now</small></span><button className="btn sm" onClick={() => rm(a)}>Disconnect</button></div>)}
    <div className="acts">{["Gmail", "Outlook"].filter(p => !me.accounts.includes(p)).map(p => <button key={p} className="btn sm" onClick={() => add(p)}>+ {p}</button>)}
      <button className="btn pri sm" style={{ marginLeft: "auto" }} onClick={close}>Done</button></div></div></div>;
}
