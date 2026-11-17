import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { User, Email } from "./models.js";
import { classify, draft, ask } from "./ai.js";
import { SAMPLE } from "./seed.js";

const r = Router();
const sign = u => jwt.sign({ id: u._id }, process.env.JWT_SECRET, { expiresIn: "7d" });
const wrap = f => (q, s, n) => f(q, s, n).catch(n);

function auth(req, res, next) {
  try { req.uid = jwt.verify((req.headers.authorization || "").slice(7), process.env.JWT_SECRET).id; next(); }
  catch { res.status(401).json({ error: "Please log in again." }); }
}

// Sign up or log in in one step
r.post("/auth", wrap(async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: "Email and password are required." });
  let u = await User.findOne({ email });
  if (!u) u = await User.create({ email, hash: await bcrypt.hash(password, 10), accounts: [] });
  else if (!(await bcrypt.compare(password, u.hash))) return res.status(401).json({ error: "Wrong password." });
  res.json({ token: sign(u), user: { email: u.email, accounts: u.accounts } });
}));

r.use(auth);
r.get("/me", wrap(async (req, res) => { const u = await User.findById(req.uid); res.json({ email: u.email, accounts: u.accounts }); }));

// Simulated OAuth: marks the provider connected and imports sample mail, classified by AI
r.post("/accounts", wrap(async (req, res) => {
  const u = await User.findById(req.uid);
  if (!u.accounts.includes(req.body.provider)) u.accounts.push(req.body.provider);
  await u.save();
  if (!(await Email.exists({ user: u._id }))) {
    const docs = await Promise.all(SAMPLE.map(s => classify(new Email({ ...s, user: u._id }))));
    await Email.insertMany(docs);
  }
  res.json({ email: u.email, accounts: u.accounts });
}));
r.delete("/accounts/:p", wrap(async (req, res) => {
  const u = await User.findById(req.uid); u.accounts = u.accounts.filter(a => a !== req.params.p); await u.save();
  res.json({ email: u.email, accounts: u.accounts });
}));

r.get("/emails", wrap(async (req, res) => res.json(await Email.find({ user: req.uid }).sort({ _id: 1 }))));

// One endpoint for every assistant AND client action
r.patch("/emails/:id", wrap(async (req, res) => {
  const e = await Email.findOne({ _id: req.params.id, user: req.uid });
  if (!e) return res.status(404).json({ error: "Email not found." });
  const b = req.body;
  for (const k of ["imp", "unread", "arch", "done", "note"]) if (k in b) e[k] = b[k];
  if (b.cls) Object.assign(e, { cls: b.cls, manual: true, conf: 1 });      // manual correction
  if (b.reset) { e.manual = false; e.note = undefined; await classify(e); }  // hand back to AI
  await e.save(); res.json(e);
}));

// A new message arrives in an existing thread -> AI re-evaluates responsibility
r.post("/emails/:id/simulate", wrap(async (req, res) => {
  const e = await Email.findOne({ _id: req.params.id, user: req.uid });
  if (!e?.next) return res.status(400).json({ error: "No simulated reply for this thread." });
  const before = e.cls;
  e.t.push({ f: e.from, w: "Just now", b: e.next }); e.next = undefined; e.unread = true; e.done = false; e.manual = false;
  await classify(e); await e.save(); res.json({ email: e, before, after: e.cls });
}));

r.post("/emails/:id/draft", wrap(async (req, res) => {
  const e = await Email.findOne({ _id: req.params.id, user: req.uid });
  res.json({ text: await draft(e) });
}));
// Approval step: nothing leaves without this explicit call (real version would send via Gmail/Graph here)
r.post("/emails/:id/send", wrap(async (req, res) => {
  const e = await Email.findOne({ _id: req.params.id, user: req.uid });
  e.t.push({ f: "Alex (you)", w: "Just now", me: true, b: req.body.text });
  e.manual = false; e.done = false; await classify(e); await e.save(); res.json(e);
}));

r.post("/ask", wrap(async (req, res) => res.json(await ask(req.body.q, await Email.find({ user: req.uid }), req.body.selected))));
export default r;
