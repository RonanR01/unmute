import { createRequire } from "node:module";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// Draws Tysta's site visuals as HTML pages, one per image, plus one per
// frame of the demo video. render.sh turns them into PNG and MP4 files.
// The data shown is made up; the design tokens and component styles come
// from the design system (tokens.json, bundle.css).
const HERE = import.meta.dir;
const REPO = join(HERE, "../..");
const require = createRequire(`${REPO}/package.json`);
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const lucide = require("lucide-react");

const [OUT] = process.argv.slice(2);
if (!OUT) {
  console.error("Usage : bun scripts/visuels/generate.mjs <dossier>");
  process.exit(2);
}
mkdirSync(OUT, { recursive: true });

const icon = (name, cls = "") =>
  renderToStaticMarkup(React.createElement(lucide[name], { className: cls }));

const tokens = JSON.parse(readFileSync(join(HERE, "tokens.json"), "utf8"));
const colors = (theme) =>
  tokens.color.tokens
    .map(
      (t) =>
        `--${t.name}:${typeof t.value === "string" ? t.value : (t.value[theme] ?? t.value.fir)};`,
    )
    .join("");
const vars = ["spacing", "radius"]
  .flatMap((f) => tokens[f].tokens.map((t) => `--${t.name}:${t.value};`))
  .join("");
const bundle = readFileSync(join(HERE, "bundle.css"), "utf8").replace(
  /@import[^;]+;/,
  "",
);
const fontDir = `${REPO}/node_modules/@fontsource-variable/rethink-sans/files`;
const fontFace = ["latin", "latin-ext"]
  .map(
    (s) =>
      `@font-face{font-family:"Rethink Sans Variable";src:url("file://${fontDir}/rethink-sans-${s}-wght-normal.woff2") format("woff2");font-weight:400 800;}`,
  )
  .join("");

const FLOWS = [
  "M-20 22c90-30 150 16 236 6s128-40 222-20 140 44 232 22 160-40 250-14 90 20 140 6",
  "M-20 52c70-18 140 28 226 14s134-46 224-24 132 50 226 26 166-34 248-14 84 12 136 2",
  "M-20 84c96-34 152 20 232 8s118-30 210-10 160 46 242 22 144-48 232-20 98 28 164 12",
  "M-20 116c74-20 144 24 224 10s140-40 228-16 128 34 220 14 172-38 254-12 88 16 134 4",
  "M-20 150c88-28 148 22 230 10s122-34 214-12 150 40 236 20 154-42 240-16 96 22 160 8",
  "M-20 186c66-16 136 26 220 12s138-38 226-16 134 36 224 16 164-36 250-12 90 14 140 2",
  "M-20 224c92-30 146 18 228 8s126-32 216-12 146 38 232 18 158-40 244-14 94 20 160 6",
];
const HILL = [];
const topo = ({ hill = false, cls = "", style = "" } = {}) =>
  `<svg class="uw-topo ${cls}" style="${style}" viewBox="0 0 1040 250" preserveAspectRatio="xMidYMin slice">${[...FLOWS, ...(hill ? HILL : [])].map((d) => `<path d="${d}"/>`).join("")}</svg>`;
const CLIMB_NAMES = [
  "Plaine",
  "Colline",
  "Plateau",
  "Col",
  "Crête",
  "Sommet",
  "Ciel",
];
const climb = (level) => {
  const pts = [62, 52, 46, 34, 26, 12, 4].map((y, i) => [50 + i * 100, y]);
  const d = (a, b) =>
    pts
      .slice(a, b + 1)
      .map(([x, y], i) => `${i ? "L" : "M"}${x} ${y}`)
      .join(" ");
  const cls = (i) => (i === level ? "here" : i < level ? "done" : "");
  return `<div class="uw-climb"><div class="track"><svg viewBox="0 0 700 72" preserveAspectRatio="none" aria-hidden="true"><path class="ahead" d="${d(level, 6)}"/><path d="${d(0, level)}"/></svg>${pts.map(([x, y], i) => `<i class="${cls(i)}" style="left:${x / 7}%;top:${y}px"></i>`).join("")}</div><ol aria-label="Les sept paliers de l'ascension">${CLIMB_NAMES.map((n, i) => `<li class="${cls(i)}">${n}</li>`).join("")}</ol></div>`;
};
const MARK = `<svg viewBox="0 0 28 28"><circle cx="14" cy="14" r="13"/><path d="M5 12c3-3 5 2 9 0s6-3 9 0"/><path d="M6 17c3-2 5 2 8 0s5-2 8 0"/></svg>`;
const logo = (cls = "") =>
  `<span class="uw-logo ${cls}">${MARK}<span>tysta</span></span>`;
const emblem = (name, locked = false) =>
  `<span class="uw-emblem ${locked ? "uw-emblem--locked" : ""}"><svg viewBox="0 0 64 64"><circle class="disc" cx="32" cy="32" r="30"/>${locked ? "" : `<circle cx="32" cy="32" r="25.5" stroke-width="0.75" opacity="0.4"/><path d="M9 44c7-5 11 3 19 0s12-5 18-1 7 2 9 0" stroke-width="0.9" opacity="0.35"/><path d="M12 50c6-4 10 2 17 0s11-4 16-1 5 1 7 0" stroke-width="0.9" opacity="0.25"/>`}</svg>${icon(name, "picto")}</span>`;

const NAV = [
  ["today", "Home", "Aujourd'hui"],
  ["dictations", "Mic", "Dictées"],
  ["insights", "BarChart3", "Insights"],
  ["badges", "Award", "Badges"],
  ["dictionary", "BookOpen", "Dictionnaire"],
  ["settings", "SlidersHorizontal", "Paramètres"],
];
const windowOf = (active, content) => `<div class="win" data-theme="fir">
  <div class="lights"><i style="background:#ff5f57"></i><i style="background:#febc2e"></i><i style="background:#28c840"></i></div>
  <aside>${logo()}<nav class="uw-nav" style="width:auto;padding:0">${NAV.map(([id, i, l]) => `<button class="uw-nav-item"${id === active ? ' aria-current="page"' : ""}>${icon(i)}<span>${l}</span></button>`).join("")}</nav></aside>
  <main>${content}</main>
</div>`;

const head = (title, subtitle, action = "") =>
  `<div class="uw-row" style="justify-content:space-between;align-items:flex-end"><div class="uw-stack" style="gap:6px"><h1>${title}</h1><p class="sub">${subtitle}</p></div>${action}</div>`;

// A fixed year of activity ending on 17 November 2026.
const WEEKS = 46;
const heat = () => {
  let seed = 11;
  const next = () =>
    (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  const end = new Date(2026, 10, 17, 12);
  const start = new Date(end);
  start.setDate(end.getDate() - ((end.getDay() + 6) % 7) - (WEEKS - 1) * 7);
  let cells = "";
  const months = [];
  const fmt = new Intl.DateTimeFormat("fr", { month: "short" });
  let last = -1;
  for (let w = 0; w < WEEKS; w++) {
    const first = new Date(start);
    first.setDate(start.getDate() + w * 7);
    if (
      first.getMonth() !== last &&
      (!months.length || w - months[months.length - 1][0] >= 3)
    )
      months.push([w, fmt.format(first).replace(/^./, (c) => c.toUpperCase())]);
    last = first.getMonth();
    for (let d = 0; d < 7; d++) {
      const date = new Date(first);
      date.setDate(first.getDate() + d);
      if (date > end) {
        cells += `<i style="visibility:hidden"></i>`;
        continue;
      }
      const ramp = 0.35 + (w / WEEKS) * 0.45;
      const active = next() < (d > 4 ? 0.12 : ramp);
      const level = active ? 1 + Math.floor(next() * 4) : 0;
      cells += `<i${level ? ` class="l${level}"` : ""}></i>`;
    }
  }
  return `<div style="position:relative;height:20px;margin-left:34px" class="cap">${months.map(([w, m]) => `<span style="position:absolute;left:${w * 20}px;text-transform:capitalize">${m}</span>`).join("")}</div>
  <div style="display:flex"><div class="cap" style="position:relative;width:34px">${[
    ["Lun.", 0],
    ["Mer.", 2],
    ["Ven.", 4],
  ]
    .map(
      ([l, r]) =>
        `<span style="position:absolute;top:${r * 20}px;line-height:16px">${l}</span>`,
    )
    .join("")}</div><div class="uw-heat">${cells}</div></div>`;
};

const figure = (label, value, note) =>
  `<div class="uw-stack" style="gap:4px;flex:1 1 140px"><span class="uw-note">${label}</span><span class="uw-measure uw-measure--sm uw-measure--signal">${value}</span><span class="uw-note">${note}</span></div>`;

const insights = windowOf(
  "insights",
  `${head("Insights", "Votre usage de la dictée, calculé sur cette machine.", `<button class="uw-btn">${icon("Share2")}Partager mes insights</button>`)}
  <div class="uw-keynumbers uw-fir" data-theme="fir">${topo()}<div class="uw-keynumber"><span class="uw-label">Mots dictés</span><strong>48 260</strong></div><div class="uw-keynumber"><span class="uw-label">Débit moyen</span><strong>148<span class="uw-unit">mots par minute</span></strong></div><div class="uw-keynumber"><span class="uw-label">Durée d'usage</span><strong>5 h 26</strong></div></div>
  <section><div class="uw-row" style="justify-content:space-between"><h2>Activité</h2><div class="uw-heat-legend"><span>Moins</span><i style="background:var(--color-edge)"></i><i style="background:var(--color-heat-1)"></i><i style="background:var(--color-heat-2)"></i><i style="background:var(--color-heat-3)"></i><i style="background:var(--color-signal)"></i><span>Plus</span></div></div>
  <div class="uw-card uw-fir" data-theme="fir" style="gap:24px"><div>${heat()}</div><div class="uw-row" style="gap:32px;padding-top:20px;border-top:1px solid var(--color-edge);align-items:flex-start">${figure("Jours actifs", "142", "Sur 46 semaines")}${figure("Plus longue journée", "18 min", "Mardi 3 novembre")}${figure("Série en cours", "12", "Jours d'affilée")}</div></div></section>
  <section><h2>Profil de voix</h2><div class="uw-row" style="align-items:stretch">${[
    [
      "Votre catchphrase",
      "du coup",
      `Dite <span class="uw-mark">86</span> fois`,
      false,
    ],
    ["Part d'anglais", "12 %", "De vos mots dictés", true],
    [
      "Mot de remplissage",
      "en fait",
      `Dit <span class="uw-mark">41</span> fois`,
      false,
    ],
  ]
    .map(
      ([l, v, n, m]) =>
        `<div class="uw-card" style="flex:1 1 220px"><span class="uw-label">${l}</span><span class="uw-measure uw-measure--md ${m ? "uw-measure--signal" : ""}">${v}</span><span class="uw-label">${n}</span></div>`,
    )
    .join("")}</div></section>`,
);

const DAYS = [
  [
    "Aujourd'hui",
    [
      [
        "14:32",
        "Bonjour Claire, merci pour votre retour. Je vous confirme la réunion de jeudi à 10 h pour valider la maquette, et je vous envoie l'ordre du jour d'ici demain.",
      ],
      [
        "11:05",
        "Pense à relancer l'équipe sur le planning de la semaine prochaine, et à réserver la salle pour l'atelier de mardi.",
      ],
      [
        "09:48",
        "Du coup, on garde la première version du parcours d'inscription : elle est plus courte et les tests montrent qu'elle est mieux comprise.",
      ],
      [
        "09:12",
        "Note pour le compte rendu : trois points à traiter avant la fin du mois, le budget, le calendrier et le choix du prestataire.",
      ],
    ],
  ],
  [
    "Hier",
    [
      [
        "17:40",
        "Merci à tous pour l'atelier de cet après-midi. Vous trouverez ci-joint la synthèse et les prochaines étapes.",
      ],
      [
        "15:21",
        "Idée pour l'article : expliquer pourquoi on parle trois fois plus vite qu'on ne tape, avec un exemple concret.",
      ],
      ["10:03", "Rappel : envoyer le devis signé avant vendredi."],
    ],
  ],
];
const dictations = windowOf(
  "dictations",
  `<div style="display:flex;gap:32px;position:relative">${topo({ hill: true, cls: "uw-topo--fade", style: "height:256px;inset:-32px -32px auto -32px;width:calc(100% + 64px)" })}
  <div class="uw-stack" style="gap:28px;flex:1;min-width:0;position:relative">${head("Dictées", "Tout ce que vous avez dicté, du plus récent au plus ancien.")}
  ${DAYS.map(([day, rows]) => `<div class="uw-stack" style="gap:12px"><div class="day">${day}</div><div class="uw-list">${rows.map(([t, p], i) => `<article class="uw-dictation"><time>${t}</time><p>${p}</p><div><button class="uw-icon-btn"${day === "Aujourd'hui" && i === 0 ? ' aria-pressed="true"' : ""}>${icon(day === "Aujourd'hui" && i === 0 ? "Pause" : "Play")}</button><button class="uw-icon-btn">${icon("Copy")}</button></div></article>`).join("")}</div></div>`).join("")}</div>
  <div class="uw-stack" style="width:240px;flex:none;position:relative"><div class="day" style="padding-top:10px">Depuis le début</div>${[
    ["Mots dictés", "48 260", ""],
    ["Débit moyen", "148", "mots par minute"],
    ["Durée d'usage", "5 h 26", ""],
  ]
    .map(
      ([l, v, u]) =>
        `<div class="uw-card uw-card--row"><span class="uw-label">${l}</span><span class="uw-row" style="gap:0;align-items:baseline"><span class="uw-measure uw-measure--lg uw-measure--signal">${v}</span>${u ? `<span class="uw-unit" style="font-size:14px">${u}</span>` : ""}</span></div>`,
    )
    .join("")}</div></div>`,
);

const fr = JSON.parse(
  readFileSync(`${REPO}/src/i18n/locales/fr/translation.json`, "utf8"),
).badges;
const BADGES = [
  ["first_draft", "Feather", "earned", "3 février 2026"],
  ["big_talker", "MessagesSquare", "earned", "22 mai 2026"],
  ["tour_de_france", "Bike", "progress", [2140, 3500]],
  ["eternal_flame", "Flame", "progress", [12, 100]],
  ["comeback", "Undo2", "earned", "7 septembre 2026"],
  ["inbox_zero", "MailCheck", "progress", [9, 20]],
  ["tgv", "TrainFront", "new", "16 novembre 2026"],
  ["shakespeare", "Quote", "todo"],
  ["coffee_break", "Coffee", "earned", "12 mars 2026"],
];
const nf = new Intl.NumberFormat("fr");
const badgeCard = ([id, pic, state, extra]) => {
  const { name, description } = fr.items[id];
  const earned = state === "earned" || state === "new";
  const status = earned
    ? `<span style="font-size:13px;padding-top:4px">Obtenu le ${extra}</span>`
    : state === "progress"
      ? `<div class="uw-progress"><span class="uw-gauge"><b style="width:${Math.round((extra[0] / extra[1]) * 100)}%"></b></span><span class="count"><b>${nf.format(extra[0])}</b> / ${nf.format(extra[1])}</span></div>`
      : `<span class="uw-note" style="padding-top:4px">À décrocher</span>`;
  return `<div class="uw-badge ${earned ? "uw-badge--earned" : ""} ${state === "new" ? "uw-badge--new" : ""}" style="max-width:none">${emblem(pic, !earned)}<div><h3${earned ? "" : ' style="opacity:.8"'}>${name}${state === "new" ? ` <span class="uw-tag uw-tag--solid" style="margin-inline-start:8px;vertical-align:middle">Nouveau</span>` : ""}</h3><p>${description}</p>${status}</div></div>`;
};
const badges = windowOf(
  "badges",
  `${head("Badges", "Ce que votre voix a déjà accompli, et ce qui reste à décrocher.")}
  <div class="uw-card uw-fir" data-theme="fir" style="gap:20px;padding:28px">${topo({ hill: true })}<div class="uw-row" style="position:relative;justify-content:space-between;align-items:flex-end;gap:16px 32px"><div class="uw-stack" style="gap:6px"><span class="uw-label">Votre statut</span><span class="uw-measure" style="font-size:30px">Col</span></div><div class="uw-row" style="gap:32px"><div class="uw-stack" style="gap:4px"><span class="uw-note">Mots dictés</span><span class="uw-measure uw-measure--sm uw-measure--signal">48 260</span></div><div class="uw-stack" style="gap:4px"><span class="uw-note">Badges</span><span class="uw-measure uw-measure--sm uw-measure--signal">11<span class="uw-unit" style="font-size:14px;margin-inline-start:4px">/ 29</span></span></div></div></div>${climb(3)}<div class="uw-stack" style="position:relative;gap:8px"><span class="uw-gauge" style="flex:none"><b style="width:66%"></b></span><span class="uw-note">Encore 11 740 mots avant le palier Crête</span></div></div>
  <section><h2>${fr.categories.volume}</h2><div class="grid">${BADGES.slice(0, 6).map(badgeCard).join("")}</div></section>
  <section><h2>${fr.categories.style}</h2><div class="grid">${BADGES.slice(6).map(badgeCard).join("")}</div></section>`,
);

const css = `${fontFace}:root,[data-theme="fir"]{${colors("fir")}}[data-theme="light"]{${colors("light")}}:root{${vars}--font-ui:"Rethink Sans Variable",system-ui,sans-serif;}${bundle}
html,body{margin:0;background:transparent;font-family:var(--font-ui);color:var(--color-text);-webkit-font-smoothing:antialiased}
*,*::before{box-sizing:border-box}
button{font-family:inherit}
.win{color:var(--color-text);position:relative;width:1280px;height:800px;display:flex;background:var(--color-chrome);border-radius:12px;overflow:hidden;font-size:15px;line-height:24px}
.lights{position:absolute;left:18px;top:16px;display:flex;gap:8px}.lights i{width:12px;height:12px;border-radius:50%}
aside{width:208px;flex:none;padding:60px 12px 24px;display:flex;flex-direction:column;gap:28px}aside>.uw-logo{padding:0 12px}
main{flex:1;min-width:0;margin:8px 8px 8px 0;padding:32px;border:1px solid var(--color-edge);border-radius:16px;background:var(--color-background);overflow:hidden;display:flex;flex-direction:column;gap:32px}
main>*{flex:none}
h1{margin:0;font-size:28px;line-height:1.25;font-weight:700;letter-spacing:-0.025em}h2{margin:0;font-size:18px;line-height:28px;font-weight:600}
.sub{margin:0;color:var(--color-ink-3)}section{display:flex;flex-direction:column;gap:16px}
.cap{font-size:12px;line-height:16px;color:var(--color-ink-3)}.sig{color:var(--color-signal);font-weight:600}
.day{font-size:14px;line-height:20px;font-weight:600;color:var(--color-ink-3)}
.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}
.stage{position:relative;width:1600px;height:1000px;overflow:hidden;background:var(--color-background);display:flex;align-items:center;justify-content:center}
.stage .win{box-shadow:0 40px 80px -30px rgba(14,42,34,.45)}
.stage>.uw-topo{opacity:.14;height:100%}`;

const doc = (body) =>
  `<!doctype html><html lang="fr"><head><meta charset="utf-8"><style>${css}${extraCss}</style></head><body>${body}</body></html>`;

const light = (win) =>
  win.replace('class="win" data-theme="fir"', 'class="win" data-theme="light"');
const pages = {
  "tysta-insights": [insights, 1280, 800],
  "tysta-dictees": [dictations, 1280, 800],
  "tysta-badges": [badges, 1280, 800],
  "tysta-insights-clair": [light(insights), 1280, 800],
  "tysta-dictees-clair": [light(dictations), 1280, 800],
  "tysta-badges-clair": [light(badges), 1280, 800],
  "tysta-hero-sapin": [
    `<div class="stage" data-theme="fir"><svg class="uw-topo" viewBox="0 0 1040 250" preserveAspectRatio="none">${FLOWS.map((d) => `<path d="${d}"/>`).join("")}</svg>${insights}</div>`,
    1600,
    1000,
  ],
  "tysta-hero": [
    `<div class="stage" data-theme="light"><svg class="uw-topo" viewBox="0 0 1040 250" preserveAspectRatio="none">${FLOWS.map((d) => `<path d="${d}"/>`).join("")}</svg>${insights}</div>`,
    1600,
    1000,
  ],
};
// ---- Site assets beyond the three screens ----
const extraCss = `
.field{min-height:44px;padding:0 14px;display:flex;align-items:center;border:1px solid var(--color-line-strong);border-radius:10px;background:var(--color-background);font-size:15px}
.words{display:flex;flex-direction:column;background:var(--color-surface);border:1px solid var(--color-edge);border-radius:14px}
.words>div{display:flex;align-items:center;gap:8px;padding:6px 8px 6px 20px;font-size:15px}.words>div+div{border-top:1px solid var(--color-edge)}
.cols{display:grid;grid-auto-flow:column;grid-template-rows:repeat(10,auto);gap:6px 40px}
.canvas{position:relative;overflow:hidden;background:var(--color-background);color:var(--color-text);font-family:var(--font-ui)}
.canvas>.uw-topo{height:100%;opacity:.14}
.mail{position:absolute;left:50%;top:48px;transform:translateX(-50%);width:760px;height:400px;background:#fff;border:1px solid var(--color-edge);border-radius:12px;box-shadow:0 30px 60px -30px rgba(14,42,34,.35);display:flex;flex-direction:column;color:#0e2a22;font-size:14px;overflow:hidden}
.mail .bar{height:40px;display:flex;align-items:center;gap:8px;padding:0 16px;background:#eef1ee;border-bottom:1px solid var(--color-edge)}
.mail .bar i{width:12px;height:12px;border-radius:50%}.mail .bar b{flex:1;text-align:center;font-weight:600;font-size:13px;color:#4a6359;margin-right:60px}
.mail .row{display:flex;gap:10px;padding:10px 20px;border-bottom:1px solid #e3ebe5}.mail .row span:first-child{color:#4a6359;width:44px}
.mail .body{flex:1;padding:18px 20px;font-size:15px;line-height:1.65}
.caret{display:inline-block;width:2px;height:18px;margin-left:1px;vertical-align:-3px;background:#0e2a22}
.pill{position:absolute;left:50%;bottom:34px;transform:translateX(-50%);height:40px;min-width:172px;padding:0 16px;display:flex;align-items:center;justify-content:center;gap:10px;border-radius:999px;background:#0e2a22;border:1px solid #1f4a3a;color:#f4f7f6;font-size:13px;font-weight:500;box-shadow:0 10px 26px -10px rgba(0,0,0,.5)}
.pill .swave{width:110px;height:20.6px;overflow:visible;fill:none;stroke:#ffd60a;stroke-width:1;stroke-linecap:round;stroke-linejoin:round}.pill .swave .front{stroke-width:1.4}.pill .swave .back{opacity:.6}.pill .swave .back.far{opacity:.38}
.keys{position:absolute;left:50%;bottom:96px;transform:translateX(-50%);display:flex;gap:6px;font-size:13px;color:var(--color-ink-3);align-items:center}
.keys kbd{font-family:inherit;min-width:30px;height:28px;padding:0 8px;display:inline-flex;align-items:center;justify-content:center;border:1px solid var(--color-line-strong);border-radius:7px;background:var(--color-surface);color:var(--color-text);font-weight:600}
.og h1{margin:0;font-size:64px;line-height:1.04;font-weight:700;letter-spacing:-.03em}
.blk{position:absolute;border-radius:16px}
`;
// The overlay's waveform (src/overlay/Waveform.tsx): the voice as a strip
// chart, read at `now` seconds into a made-up sentence.
const W = 96,
  H = 18,
  SPAN = 1.6,
  MAXA = H / 2 - 1,
  REST = 0.5;
const CURVES = [
  { band: 0, wl: 22, off: 0 },
  { band: 1, wl: 31, off: 2.1 },
  { band: 2, wl: 15, off: 4.2 },
];
// Syllables: start (s), length (s), loudness, low/high balance.
const SYL = [];
{
  let t = 0.15,
    k = 0;
  while (t < 5) {
    const len = 0.12 + ((k * 37) % 11) / 60;
    SYL.push([t, len, 0.55 + ((k * 53) % 9) / 20, ((k * 29) % 7) / 6]);
    t += len + (k % 5 === 4 ? 0.32 : 0.05);
    k++;
  }
}
const voice = (t, band) => {
  let v = 0;
  for (const [s0, len, loud, tilt] of SYL) {
    if (t < s0 || t > s0 + len + 0.25) continue;
    const rise = Math.min(1, (t - s0) / 0.04),
      fall = t > s0 + len ? Math.exp(-(t - s0 - len) / 0.08) : 1;
    const w = band === 0 ? 1 : band === 1 ? 1 - 0.6 * tilt : 0.4 + 0.6 * tilt;
    v = Math.max(v, loud * w * rise * fall);
  }
  return Math.pow(Math.min(1, v), 0.6);
};
const waves = (now) => {
  const path = (c, cls) => {
    let d = "";
    for (let x = 0; x <= W; x += 2) {
      const time = now - (1 - x / W) * SPAN;
      const level = time < 0 ? 0 : voice(time, c.band);
      const taper = Math.pow(Math.sin((Math.PI * x) / W), 0.6);
      const y =
        H / 2 +
        (REST + level * (MAXA - REST)) *
          taper *
          Math.sin(((time * 1000 * W) / 1600 / c.wl) * 2 * Math.PI + c.off);
      d += `${x ? "L" : "M"}${x} ${y.toFixed(2)}`;
    }
    return `<path class="${cls}" d="${d}"/>`;
  };
  return `<svg class="swave" viewBox="0 0 ${W} ${H}">${path(CURVES[2], "back far")}${path(CURVES[1], "back")}${path(CURVES[0], "front")}</svg>`;
};
const DICTATED =
  "Bonjour Claire, merci pour votre retour. Je vous confirme la réunion de jeudi à 10 h pour valider la maquette, et je vous envoie l'ordre du jour d'ici demain.";
const mail = (
  body,
  extra = "",
) => `<div class="canvas" data-theme="light" style="width:1000px;height:625px"><svg class="uw-topo" viewBox="0 0 1040 250" preserveAspectRatio="none">${FLOWS.map((d) => `<path d="${d}"/>`).join("")}</svg>
<div class="mail"><div class="bar"><i style="background:#ff5f57"></i><i style="background:#febc2e"></i><i style="background:#28c840"></i><b>Nouveau message</b></div><div class="row"><span>À</span><span>claire@exemple.fr</span></div><div class="row"><span>Objet</span><span>Réunion de jeudi</span></div><div class="body">${body}</div></div>${extra}</div>`;
const pill = (content) => `<div class="pill">${content}</div>`;
const recording = (now) => pill(waves(now));

const shareBadge = `<div class="uw-share uw-fir" data-theme="fir" style="zoom:3">${topo()}${logo()}<div class="mid">${emblem("TrainFront").replace('class="uw-emblem ', 'class="uw-emblem uw-emblem--lg ')}<span class="lbl" style="margin-top:14px">Badge obtenu</span><span class="ttl">TGV</span><span class="lbl" style="font-weight:400;font-size:12.6px;max-width:260px">Plus de 180 mots par minute.</span><span class="lbl" style="font-size:10px">16 novembre 2026</span></div><span class="foot">Col · 48 260 mots dictés</span></div>`;
const shareInsights = `<div class="uw-share uw-fir" data-theme="fir" style="zoom:3">${topo()}${logo()}<div class="mid" style="gap:16px"><span class="ttl" style="font-size:22.6px">Ma voix en chiffres</span><div><div class="lbl">Mots dictés</div><div class="val">48 260</div></div><div><div class="lbl">Débit moyen</div><div class="val">148 <small>mots/min</small></div></div><div><div class="lbl">Durée d'usage</div><div class="val">5 h 26</div></div><div><div class="lbl">Ma catchphrase</div><div class="ttl" style="font-size:18.6px">« du coup »</div></div></div><span class="foot">Col · 48 260 mots dictés</span></div>`;

const TOP = [
  "projet",
  "client",
  "maquette",
  "réunion",
  "équipe",
  "jeudi",
  "valider",
  "retour",
  "planning",
  "atelier",
  "budget",
  "version",
  "envoyer",
  "semaine",
  "document",
  "idée",
  "point",
  "devis",
  "parcours",
  "test",
  "synthèse",
  "matin",
  "prochaine",
  "lancement",
  "priorité",
  "message",
  "article",
  "exemple",
  "étape",
  "calendrier",
];
const profile = windowOf(
  "insights",
  `<section style="gap:16px"><div class="uw-row" style="justify-content:space-between"><div class="uw-stack" style="gap:4px"><h2>Mon profil de voix</h2><span class="uw-note">Dernière actualisation : 17 novembre 2026</span></div><button class="uw-btn uw-btn--primary">${icon("RefreshCw")}Actualiser mon profil</button></div>
<div class="uw-row" style="align-items:stretch">${[
    [
      "Ma catchphrase",
      "du coup",
      `Dite <span class="uw-mark">86</span> fois`,
      false,
    ],
    [
      "Mon mot le plus utilisé",
      "projet",
      `Utilisé <span class="uw-mark">212</span> fois`,
      false,
    ],
    ["Part d'anglais", "12 %", "de mes mots dictés", true],
  ]
    .map(
      ([l, v, n, m]) =>
        `<div class="uw-card" style="flex:1 1 220px"><span class="uw-label">${l}</span><span class="uw-measure uw-measure--md ${m ? "uw-measure--signal" : ""}">${v}</span><span class="uw-label">${n}</span></div>`,
    )
    .join("")}</div>
<div class="uw-card" style="gap:16px"><div><div style="font-size:15px;font-weight:600">Mes 30 mots les plus utilisés</div><div class="uw-note">Avec leur nombre d'occurrences, hors mots de liaison comme « le », « de » ou « et ».</div></div><div class="cols">${TOP.map(
    (w, i) => {
      const c = Math.round(212 * Math.pow(0.9, i));
      return `<div class="uw-rank"><span class="n">${i + 1}</span><span class="w">${w}</span><span class="uw-gauge"><b style="width:${Math.round((c / 212) * 100)}%"></b></span><span class="c">${c}</span></div>`;
    },
  ).join("")}</div></div></section>`,
);
const WORDS = [
  "Tysta",
  "Kubernetes",
  "RGPD",
  "Maëlys",
  "Saint-Malo",
  "onboarding",
  "Figma",
];
const dictionary = windowOf(
  "dictionary",
  `<div class="uw-stack" style="gap:28px;max-width:720px">${head("Dictionnaire", "Les noms propres, le jargon et les marques que Tysta doit écrire à votre façon.")}
<div class="uw-row" style="align-items:flex-end;gap:12px"><label class="uw-stack" style="flex:1;gap:6px;font-size:14px;color:var(--color-ink-3)">Nouveau mot<span class="field" style="color:var(--color-text)">Hélioscope<span class="caret" style="background:var(--color-text)"></span></span></label><button class="uw-btn uw-btn--primary" style="padding:0 20px">Ajouter</button></div>
<div class="words">${WORDS.map((w) => `<div><span style="flex:1">${w}</span><button class="uw-icon-btn">${icon("Pencil")}</button><button class="uw-icon-btn">${icon("Trash2")}</button></div>`).join("")}</div></div>`,
);

const og = `<div class="canvas og" data-theme="light" style="width:1200px;height:630px"><svg class="uw-topo" viewBox="0 0 1040 250" preserveAspectRatio="none">${FLOWS.map((d) => `<path d="${d}"/>`).join("")}</svg>
<div style="position:absolute;left:72px;top:64px">${logo("uw-logo--lg")}</div>
<div style="position:absolute;left:72px;bottom:72px;width:560px" class="uw-stack"><h1>Votre voix écrit. Tysta la <span class="uw-mark" style="font-weight:700">mesure</span>.</h1><span style="font-size:24px;line-height:1.4;color:var(--color-ink-3)">La dictée locale : rien ne quitte votre machine.</span></div>
<div class="uw-keynumbers uw-fir" data-theme="fir" style="position:absolute;right:72px;top:150px;width:400px;flex-direction:column">${topo()}${[
  ["Mots dictés", "48 260"],
  ["Débit moyen", "148 <span class='uw-unit'>mots par minute</span>"],
  ["Durée d'usage", "5 h 26"],
]
  .map(
    ([l, v]) =>
      `<div class="uw-keynumber" style="flex:none;padding:24px 28px;border-inline-start:0"><span class="uw-label">${l}</span><strong>${v}</strong></div>`,
  )
  .join("")}</div></div>`;

const blog = (blocks, theme) =>
  `<div class="canvas" data-theme="${theme}" style="width:1600px;height:900px">${blocks.map(([c, x, y, w, h]) => `<div class="blk" style="background:var(--color-${c});left:${x}px;top:${y}px;width:${w}px;height:${h}px"></div>`).join("")}<svg class="uw-topo" style="opacity:.5;stroke-width:1.2" viewBox="0 0 1040 250" preserveAspectRatio="none">${FLOWS.map((d) => `<path d="${d}"/>`).join("")}</svg></div>`;

Object.assign(pages, {
  "tysta-dictionnaire-clair": [light(dictionary), 1280, 800, 2],
  "tysta-dictionnaire": [dictionary, 1280, 800, 2],
  "tysta-profil-de-voix-clair": [light(profile), 1280, 800, 2],
  "tysta-profil-de-voix": [profile, 1280, 800, 2],
  "tysta-dictee-en-cours": [
    mail(
      `${DICTATED.slice(0, 0)}<span class="caret"></span>`,
      recording(2.05) +
        `<div class="keys"><kbd>⌥</kbd><kbd>Espace</kbd><span>maintenu</span></div>`,
    ),
    1000,
    625,
    2,
  ],
  "tysta-partage-badge": [shareBadge, 1080, 1350, 1],
  "tysta-partage-insights": [shareInsights, 1080, 1350, 1],
  "tysta-og": [og, 1200, 630, 1],
  "tysta-blog-1": [
    blog(
      [
        ["signal", 980, 120, 420, 520],
        ["logo-primary", 1420, -40, 300, 420],
        ["text", 1420, 400, 300, 240],
        ["surface-raised", 620, 360, 340, 400],
      ],
      "fir",
    ),
    1600,
    900,
    1,
  ],
  "tysta-blog-2": [
    blog(
      [
        ["text", 120, 140, 520, 300],
        ["signal", 120, 460, 520, 300],
        ["logo-primary", 660, 140, 300, 620],
        ["moss", 980, 300, 500, 300],
      ],
      "light",
    ),
    1600,
    900,
    1,
  ],
  "tysta-blog-3": [
    blog(
      [
        ["logo-primary", 200, -60, 360, 560],
        ["signal", 580, 240, 700, 260],
        ["surface-raised", 580, 520, 340, 300],
        ["moss", 940, 520, 340, 300],
      ],
      "fir",
    ),
    1600,
    900,
    1,
  ],
});
// The demo video, one page per frame.
const FPS = 12,
  SECONDS = 10;
for (let f = 0; f < FPS * SECONDS; f++) {
  const t = f / FPS;
  const blink = Math.floor(t * 2) % 2 === 0;
  const caret = `<span class="caret" style="opacity:${blink ? 1 : 0}"></span>`;
  const keys = `<div class="keys"><kbd>⌥</kbd><kbd>Espace</kbd><span>maintenu</span></div>`;
  let body = caret,
    extra = "";
  if (t >= 1.5 && t < 5.5) extra = recording(t - 1.5) + keys;
  else if (t >= 5.5 && t < 6.5)
    extra = pill(
      `${icon("LoaderCircle").replace("<svg", `<svg style="width:16px;height:16px;stroke-width:2;transform:rotate(${Math.round(t * 720)}deg)"`)}Transcription…`,
    );
  else if (t >= 6.5) body = DICTATED + caret;
  pages[`video/f${String(f).padStart(3, "0")}`] = [
    mail(body, extra),
    1000,
    625,
    1,
  ];
}
mkdirSync(join(OUT, "video"), { recursive: true });

for (const [name, [body, w, h, dsf = 2]] of Object.entries(pages)) {
  writeFileSync(join(OUT, `${name}.html`), doc(body));
  console.log(name, w, h, dsf);
}
