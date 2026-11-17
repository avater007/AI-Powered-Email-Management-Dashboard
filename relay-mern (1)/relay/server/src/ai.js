// Classification, drafting and Q&A. Uses an LLM when LLM_API_KEY is set, otherwise rules.
const K = {
  none: ["receipt","newsletter","unsubscribe","no reply needed","all sorted","no action"],
  client: ["approve","sign ","signature","confidential","personally","compensation","your decision","your thoughts","sign-off","board"],
  assistant: ["reschedule","availability","invoice","booking","schedule","calendar","slot","guest list"]
};

export function ruleClassify(e) {
  const last = e.t[e.t.length - 1];
  const txt = (e.t.map(m => m.b).join(" ") + " " + e.subj + " " + e.addr).toLowerCase();
  const hit = k => K[k].filter(w => txt.includes(w));
  const n = hit("none"), c = hit("client"), a = hit("assistant");
  const first = e.from.split(" ")[0];
  if (last.me) return { cls: "none", conf: 0.9, wait: true, why: `Alex sent the last message, so we are waiting on ${first}.` };
  if (n.length && !c.length) return { cls: "none", conf: 0.94, wait: false, why: `Looks informational or resolved ("${n[0]}").` };
  if (c.length > a.length) return { cls: "client", conf: Math.min(0.97, 0.66 + 0.1 * (c.length - a.length) + 0.05 * c.length), wait: false, why: `Asks for the client's personal input or approval ("${c[0].trim()}").` };
  if (a.length > c.length) return { cls: "assistant", conf: Math.min(0.95, 0.7 + 0.08 * (a.length - c.length)), wait: false, why: `Routine logistics ("${a[0]}") the assistant can handle.` };
  return { cls: "review", conf: 0.38, wait: false, why: "Unclear what is needed or who should answer. Flagged for review." };
}

async function callLLM(system, user, max = 500) {
  const r = await fetch(process.env.LLM_URL, {
    method: "POST",
    headers: { "content-type": "application/json", ...JSON.parse(process.env.LLM_HEADERS || "{}") },
    body: JSON.stringify({ model: process.env.LLM_MODEL || "your-model-name", max_tokens: max, system, messages: [{ role: "user", content: user }] })
  });
  if (!r.ok) throw new Error("LLM " + r.status);
  return (await r.json()).content.map(b => b.text || "").join("");
}
const json = s => JSON.parse(s.replace(/```json|```/g, "").trim());
const thread = e => e.t.map(m => `${m.f} (${m.w}): ${m.b}`).join("\n---\n");

export async function classify(e) {
  if (e.manual) return e;                      // never override a human decision
  let r;
  if (process.env.LLM_URL) {
    try {
      r = json(await callLLM(
        `You triage email for a personal assistant (Alex) working for a client (Priya). Decide who must reply next.
cls: "assistant" (scheduling, logistics, routine business), "client" (decisions, approvals, sensitive, needs her personal voice), "none" (newsletters, receipts, resolved, FYI, or we sent the last message), "review" if unsure.
Return ONLY JSON: {"cls":"","conf":0-1,"why":"one sentence","summ":"1-2 sentence summary","wait":bool (true if we already replied and await them),"dates":["important dates"]}`,
        `Subject: ${e.subj}\nFrom: ${e.from} <${e.addr}>\n\n${thread(e)}`));
    } catch (err) { console.warn("LLM classify failed, using rules:", err.message); }
  }
  r = r || ruleClassify(e);
  e.cls = r.conf < 0.6 ? "review" : r.cls;     // low confidence always goes to human review
  e.conf = r.conf; e.why = r.why; e.wait = !!r.wait;
  if (r.summ) e.summ = r.summ;
  if (r.dates?.length) e.dates = r.dates;
  return e;
}

export async function draft(e) {
  if (process.env.LLM_URL) {
    try { return await callLLM("Write a concise, warm, professional reply from Alex, personal assistant to Priya Mehta. Plain text, sign off 'Alex'. Never commit Priya to anything she hasn't approved.", thread(e)); } catch {}
  }
  const f = e.from.split(" ")[0];
  return `Hi ${f},\n\nThanks for your message. I'll look into this and come back to you shortly.\n\nBest,\nAlex`;
}

export async function ask(q, emails, selected) {
  const ctx = emails.map(e => ({ id: String(e._id), from: e.from, subj: e.subj, cls: e.cls, wait: e.wait, done: e.done, summ: e.summ, why: e.why }));
  if (process.env.LLM_URL) {
    try {
      return json(await callLLM(`Answer questions about this inbox. Return ONLY JSON {"text":"answer","ids":["relevant email ids"]}.\nInbox: ${JSON.stringify(ctx)}\nSelected id: ${selected || "none"}`, q, 700));
    } catch {}
  }
  const l = q.toLowerCase(), live = emails.filter(e => !e.arch && !e.done), pick = (t, a) => ({ text: a.length ? t : "Nothing right now.", ids: a.map(e => String(e._id)) });
  const cur = emails.find(e => String(e._id) === selected);
  if (/waiting/.test(l)) return pick("Waiting on others:", live.filter(e => e.wait));
  if (/review/.test(l)) return pick("Needs your review:", live.filter(e => e.cls === "review"));
  if (/client|attention/.test(l) && !/why/.test(l)) return pick("Needs the client:", live.filter(e => e.cls === "client"));
  if (/action|assistant/.test(l)) return pick("Assistant to reply:", live.filter(e => e.cls === "assistant"));
  if (cur && /summar/.test(l)) return { text: cur.summ, ids: [] };
  if (cur && /why/.test(l)) return { text: cur.why, ids: [] };
  return { text: "Try: which emails need the client, what am I waiting on, or open an email and ask me to summarize it.", ids: [] };
}
