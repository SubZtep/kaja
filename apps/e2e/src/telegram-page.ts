/** The chat window of the fake Telegram: what the recorded video shows, and what a scenario types into. */
export const CHAT_PAGE = `<!doctype html>
<html><head><meta charset="utf-8"><title>Telegram (fake)</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body { margin: 0; height: 100vh; display: flex; justify-content: center; background: #0e1621; font: 15px/1.4 system-ui, sans-serif; color: #f5f5f5; }
  #app { width: 560px; height: 100%; display: flex; flex-direction: column; background: #0e1621; border-inline: 1px solid #1b2836; }
  header { padding: 12px 16px; background: #17212b; display: flex; align-items: center; gap: 12px; border-bottom: 1px solid #0a121a; }
  header .avatar { width: 38px; height: 38px; border-radius: 50%; background: #2b5278; display: grid; place-items: center; font-weight: 700; }
  header .name { font-weight: 600; } header .sub { font-size: 12px; color: #6c7883; }
  #log { flex: 1; overflow-y: auto; padding: 14px; display: flex; flex-direction: column; gap: 6px; }
  .msg { max-width: 82%; display: flex; flex-direction: column; gap: 4px; }
  .msg.user { align-self: flex-end; align-items: flex-end; } .msg.bot { align-self: flex-start; }
  .bubble { padding: 8px 12px; border-radius: 14px; white-space: pre-wrap; word-break: break-word; }
  .user .bubble { background: #2b5278; border-bottom-right-radius: 4px; } .bot .bubble { background: #182533; border-bottom-left-radius: 4px; }
  .bubble img { max-width: 100%; border-radius: 8px; display: block; margin-bottom: 4px; }
  .bubble pre, .bubble code { background: #0003; padding: 1px 4px; border-radius: 4px; font-family: ui-monospace, monospace; }
  .bubble pre { padding: 6px 8px; overflow-x: auto; } .bubble a { color: #6ab3f3; }
  .buttons { display: flex; flex-direction: column; gap: 4px; width: 100%; } .row { display: flex; gap: 4px; }
  .btn { flex: 1; padding: 8px; border: 0; border-radius: 8px; background: #2b3b4c; color: #6ab3f3; font: inherit; cursor: pointer; }
  .btn:hover { background: #34475b; }
  footer { display: flex; gap: 8px; padding: 10px; background: #17212b; align-items: center; }
  #input { flex: 1; padding: 10px 14px; border-radius: 20px; border: 0; background: #0e1621; color: inherit; font: inherit; outline: none; }
  #send { padding: 9px 16px; border: 0; border-radius: 20px; background: #2b5278; color: #fff; font: inherit; cursor: pointer; }
  #attach { color: #6c7883; cursor: pointer; font-size: 20px; } #file { display: none; }
</style></head>
<body><div id="app">
  <header><div class="avatar">K</div><div><div class="name">Kaja</div><div class="sub">bot</div></div></header>
  <div id="log"></div>
  <footer><label id="attach" for="file">📎</label><input id="file" type="file" accept="image/*">
    <input id="input" placeholder="Message" autocomplete="off"><button id="send">Send</button></footer>
</div>
<script>
  const ALLOWED = new Set(["B", "STRONG", "I", "EM", "U", "S", "CODE", "PRE", "A"])
  // Telegram's HTML subset only: anything else shows as text
  function clean(html) {
    const doc = new DOMParser().parseFromString("<body>" + html + "</body>", "text/html")
    const walk = node => {
      const out = document.createDocumentFragment()
      for (const child of node.childNodes) {
        if (child.nodeType === 3) out.append(child.textContent)
        else if (child.nodeType === 1 && ALLOWED.has(child.tagName)) {
          const el = document.createElement(child.tagName)
          if (child.tagName === "A") el.setAttribute("href", child.getAttribute("href") || "#")
          el.append(walk(child)); out.append(el)
        } else if (child.nodeType === 1) out.append(walk(child))
      }
      return out
    }
    return walk(doc.body)
  }
  const log = document.getElementById("log")
  let shown = ""
  async function post(path, body) { await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }) }
  function render(messages) {
    const key = JSON.stringify(messages)
    if (key === shown) return
    shown = key
    const stick = log.scrollTop + log.clientHeight >= log.scrollHeight - 40
    log.replaceChildren(...messages.map(m => {
      const wrap = document.createElement("div"); wrap.className = "msg " + m.from; wrap.dataset.id = m.id
      const bubble = document.createElement("div"); bubble.className = "bubble"
      if (m.photo) { const img = document.createElement("img"); img.src = m.photo; bubble.append(img) }
      bubble.append(clean(m.text || m.caption || "")); wrap.append(bubble)
      if (m.buttons.length) {
        const box = document.createElement("div"); box.className = "buttons"
        for (const row of m.buttons) {
          const r = document.createElement("div"); r.className = "row"
          for (const b of row) {
            const btn = document.createElement("button"); btn.className = "btn"; btn.textContent = b.text
            btn.onclick = () => post("/user/callback", { messageId: m.id, data: b.callback_data })
            r.append(btn)
          }
          box.append(r)
        }
        wrap.append(box)
      }
      return wrap
    }))
    if (stick) log.scrollTop = log.scrollHeight
  }
  async function poll() { try { render(await (await fetch("/state")).json()) } catch {} setTimeout(poll, 250) }
  poll()
  const input = document.getElementById("input")
  const send = () => { const text = input.value.trim(); if (!text) return; input.value = ""; post("/user/message", { text }) }
  document.getElementById("send").onclick = send
  input.addEventListener("keydown", e => { if (e.key === "Enter") send() })
  document.getElementById("file").onchange = async e => {
    const file = e.target.files[0]; if (!file) return
    const data = btoa(String.fromCharCode(...new Uint8Array(await file.arrayBuffer())))
    await post("/user/photo", { data, mime: file.type, caption: input.value.trim() }); input.value = ""; e.target.value = ""
  }
</script></body></html>`
