# Translation glossary

Tone, typography and terms per language, settled in the 2026-11 review. `/translate` reads this before translating; add a term here when a new one is settled.

## All languages

- the ellipsis is one character, "…", never "..."
- prompts that take y/N keep `[y/N]`: the code only accepts y or yes

## hu-HU

- tone: informal "te"; dash " – " (never " — "); quotes „ ”; avoid "a(z) {param}" by rephrasing ("ezzel: {x}")
- persona = persona (personák) · ability = képesség · skill = készség · tool = eszköz · device = készülék (not eszköz, that is "tool")
- session = munkamenet · a chat/conversation = beszélgetés · chat (the feature, model task) = csevegés, csevegőmodell
- sandbox = sandbox · marketplace = piactér · provider = szolgáltató · key = kulcs · token = token
- dashboard = irányítópult · AI agent = AI-ügynök · turn = kör (prefer rephrasing) · commit = commit
- hyphenate name + noun: Telegram-bot, Telegram-link, Telegram-fiók, Kaja-fiók, MCP-szerver, API-kulcs
- Privacy Policy = Adatkezelési tájékoztató · Terms of Service = Felhasználási feltételek
- button "Get Telegram link" = „Telegram-link kérése” (API messages quote it)

## de-DE

- tone: informal "du"; dash " – "; quotes „ “; Kaja is "er/ihm" (der Agent)
- persona = Persona · ability = Fähigkeit · skill = Skill · tool = Tool · device = Gerät
- session = Sitzung · chat = Chat · conversation = Unterhaltung · turn = rephrase (never "Zug"); round = Runde
- sandbox = Sandbox (Sandboxes) · marketplace = Marketplace · provider = Anbieter (never "Provider") · key = Schlüssel · token = Token (Tokens)
- approval of a command/tool = Freigabe, buttons Erlauben / Ablehnen, done: Erlaubt / Abgelehnt; device or email approval = genehmigen
- row (database) = Eintrag · usage (CLI) = Verwendung · human check = "Prüfung, ob du ein Mensch bist"
- button "Get Telegram link" = „Telegram-Link holen“

## fr-FR

- tone: informal "tu" (never "vous"); dash " — "; quotes « »; a space before : ; ? !
- avoid the "imperative + en" forms (Crées-en, Lances-en): name the noun instead ("Lance un sandbox")
- persona = persona (une) · ability = capacité · skill = compétence · tool = outil · device = appareil
- session = session · chat = chat · conversation = conversation · turn = rephrase ("une fois ta demande traitée"); round = tour
- sandbox = sandbox (un, les sandboxes) · marketplace = marketplace (le) · provider = fournisseur · key = clé · token = token
- pair = appairer · tap = "appuie sur" · Enter = Entrée · Esc = Échap · link (Telegram linkage) = liaison
- prompts keep [y/N]: the code only accepts y/yes
- button "Get Telegram link" = « Obtenir le lien Telegram »

## es-ES

- tone: informal "tú"; no " — " as a separator (use ":"); quotes « »; recent events in pretérito perfecto ("no se ha podido", "ha fallado", "has escrito")
- avoid gendered address ("¿Eres nuevo?", "¿Despierto?"): rephrase
- persona = persona (la) · ability = habilidad · skill = skill (la) · tool = herramienta · device = dispositivo
- session = sesión · chat = chat · conversation = conversación · turn = rephrase; round = ronda
- sandbox = sandbox (el, los sandboxes) · marketplace = marketplace (el) · provider = proveedor · key = clave · token = token
- computer = ordenador (not "equipo") · Enter = Intro · Kaja cloud = la nube de Kaja (wizard option name stays "Kaja Cloud")
- pair/link = vincular · device login = inicio de sesión del dispositivo · row (database) = fila
- hook program kinds are masculine nouns (reproductor de sonido, notificador, sintetizador de voz): they fill "un {what}" / "ningún {what}"
- button "Get Telegram link" = «Obtener enlace de Telegram»

## pt-BR

- tone: informal "você"; dash " — "; quotes “ ”; avoid gendered address ("conectado", "novo por aqui", "você mesmo"): rephrase
- persona = persona (a) · ability = habilidade · skill = skill (a) · tool = ferramenta · device = dispositivo
- session = sessão · chat = chat · conversation = conversa · turn = rephrase; round = rodada
- sandbox = sandbox (o, os sandboxes) · marketplace = marketplace (o) · provider = provedor · key = chave · token = token
- off = desativado/desativada (never "off") · up/down = no ar / fora do ar · pair = parear · request (approval) = solicitação, (HTTP) = requisição
- hook program kinds are masculine nouns (player de som, notificador, sintetizador de voz)
- button "Get Telegram link" = “Obter link do Telegram”

## ja-JP

- tone: polite です/ます, no お客様 style; full-width ？ ！ （ ） and a full-width ： at the end of a line; ": " (half-width, with a space) only before a value, path or code
- no " — ": end the sentence with 。 instead; no space between "Kaja" and Japanese text; a space around {params}, commands and file names
- persona = ペルソナ · ability = アビリティ · skill = スキル · tool = ツール · device = デバイス
- session = セッション · chat = チャット · conversation = 会話 · turn = rephrase ("Kajaが応答を終えると"); round = ラウンド
- sandbox = サンドボックス · marketplace = マーケットプレイス · provider = プロバイダー · key = キー · token = トークン
- sign in / out = サインイン / サインアウト (never ログイン) · link (Telegram) = 連携 · pair = ペアリング · row (database) = レコード
- button "Get Telegram link" = 「Telegramリンクを取得」

## ko-KR

- tone: 해요체 throughout (했어요, 돼요, 이에요/예요; instructions 하세요), never 합니다체; the two sign-up consent lines stay formal (동의합니다)
- no " — ": end the sentence instead; quotes “ ”; CLI help lines are terse noun phrases (…표시, …실행)
- avoid 은(는)/이(가)/을(를)/(으)로 after a {param} when a noun can follow it ("{label} 페르소나로", "{path} 파일이")
- persona = 페르소나 · ability = 어빌리티 · skill = 스킬 · tool = 도구 · device = 기기
- session = 세션 · chat = 채팅 · conversation = 대화 · turn = rephrase ("Kaja가 답변을 마치면"); round = 회
- sandbox = 샌드박스 · marketplace = 마켓플레이스 · provider = 제공업체 (never "provider") · key = 키 · token = 토큰 · id = ID
- sign in / out = 로그인 / 로그아웃 · link and pair = 연결 · row (database) = 레코드 · approve / decline = 승인 / 거절
- button "Get Telegram link" = “Telegram 링크 받기”

## zh-TW

- tone: 你 (never 您); full-width punctuation ，。：？！（）「」; no " — " (use ， or ：); Taiwan wording (晚安, not 晚上好; no 白嫖, 登陸)
- persona = 角色 · ability = 能力 · skill = 技能 · tool = 工具 · tricks (marketing) = 本領 · device = 裝置
- session = 工作階段 · chat = 聊天 · conversation = 對話 · turn = rephrase ("Kaja 回覆完之後"); round = 輪
- sandbox = 沙箱 · marketplace = 市集 · provider = 供應商 · key = 金鑰 · bot or auth token = 權杖 · LLM token = token · id = ID
- hooks = 掛鉤 · approve / decline = 核准 / 拒絕 · pair = 配對 · link = 連結 · row (database) = 資料列
- button "Get Telegram link" = 「取得 Telegram 連結」

## nan-TW

- Taiwanese Hokkien in Han-ji; full-width punctuation; no " — " (use ， or ：); keep the draft's wording unless it is clearly wrong
- open choice for a native reviewer: the files write possessive ê as 个 (the MOE standard is 的, with 个 for the classifier)
- persona = 角色 · ability = 能力 · skill = 技能 · tool = 工具 · tricks (marketing) = 步數 · device = 裝置
- session = 工作階段 · a chat, to chat = 開講 · chat (model task) = 聊天 · turn = rephrase
- sandbox = 沙箱 · marketplace = 市集 · provider = 供應商 · key = 金鑰 · bot or auth token = 權杖 · LLM token = token · id = ID
- hooks = 掛鉤 · approve / decline = 核准 / 拒絕 · pair = 配對 · link = 連結 · we (Kaja's side) = 阮, not 咱
- button "Get Telegram link" = 「提 Telegram 連結」

## en-US

- en-GB wording with US spelling and vocabulary only: color, summarize, canceled, "doesn't have" for "hasn't got", "check" a box for "tick"
