/* =========================================================================
   Shared logic for nota.html and factuur.html
   Each page sets `window.DOC_CONFIG = { mode: "nota" | "factuur", storageKey }`
   before loading this file.
   ========================================================================= */

(function () {
  const CONFIG = window.DOC_CONFIG || { mode: "nota", storageKey: "straver-service-nota" };
  const MODE = CONFIG.mode;
  const STORAGE_KEY = CONFIG.storageKey;
  const DEFAULT_RATE = 35;
  const BTW_RATES = [21, 9, 0];

  let lines = MODE === "factuur"
    ? [
        { type: "uren", omschrijving: "Werkzaamheden", aantal: 1, tarief: DEFAULT_RATE, btw: 21 },
        { type: "aanrij", omschrijving: "Aanrijkosten", aantal: 1, tarief: 0, btw: 21 }
      ]
    : [
        { type: "uren", omschrijving: "Werkzaamheden", aantal: 1, tarief: DEFAULT_RATE },
        { type: "aanrij", omschrijving: "Aanrijkosten", aantal: 1, tarief: 0 }
      ];

  // Field ids shared by both modes, plus factuur-only ones (guarded with exists() checks)
  const FIELD_IDS = [
    "bizName","bizPostcode","bizHuisnr","bizStreet","bizCity","bizPhone","bizEmail",
    "bizKvk","bizBtw",
    "notaNr","notaDate","payTerm",
    "clientName","clientPostcode","clientHuisnr","clientStreet","clientCity",
    "payName","iban"
  ].filter(id => document.getElementById(id));

  function exists(id){ return !!document.getElementById(id); }
  function val(id){ const el = document.getElementById(id); return el ? el.value : ""; }
  function setText(id, text){ const el = document.getElementById(id); if(el) el.textContent = text; }

  /* ---------------- Formatting helpers ---------------- */

  // "1321LA" / "1321 la" -> "1321 LA"
  function formatPostcodeValue(raw){
    if(!raw) return raw;
    const clean = raw.replace(/\s+/g, "").toUpperCase();
    const m = clean.match(/^([1-9][0-9]{3})([A-Z]{2})$/);
    if(m) return m[1] + " " + m[2];
    return raw;
  }

  function attachPostcodeFormatter(id){
    const el = document.getElementById(id);
    if(!el) return;
    el.addEventListener("blur", () => {
      el.value = formatPostcodeValue(el.value);
      renderPreview();
      saveState();
    });
  }

  // Loosely format IBAN into groups of 4 on blur: "NL00BANK0000000000" -> "NL00 BANK 0000 0000 00"
  function formatIbanValue(raw){
    if(!raw) return raw;
    const clean = raw.replace(/\s+/g, "").toUpperCase();
    if(!/^[A-Z]{2}[0-9A-Z]{6,32}$/.test(clean)) return raw;
    return clean.match(/.{1,4}/g).join(" ");
  }
  function attachIbanFormatter(id){
    const el = document.getElementById(id);
    if(!el) return;
    el.addEventListener("blur", () => {
      el.value = formatIbanValue(el.value);
      renderPreview();
      saveState();
    });
  }

  // Capitalize first letter of street / city on blur (small nicety)
  function attachTitleCaseFormatter(id){
    const el = document.getElementById(id);
    if(!el) return;
    el.addEventListener("blur", () => {
      const v = el.value.trim();
      if(v) el.value = v.charAt(0).toUpperCase() + v.slice(1);
      renderPreview();
      saveState();
    });
  }

  /* ---------------- Persistence ---------------- */

  function saveState(){
    try{
      const data = { fields: {}, lines };
      FIELD_IDS.forEach(id => data.fields[id] = val(id));
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      const status = document.getElementById("saveStatus");
      if(status){
        status.textContent = "Opgeslagen ✓";
        clearTimeout(status._t);
        status._t = setTimeout(() => status.textContent = "", 1500);
      }
    }catch(e){ /* localStorage unavailable — fail silently */ }
  }

  function loadState(){
    try{
      const raw = localStorage.getItem(STORAGE_KEY);
      if(!raw) return false;
      const data = JSON.parse(raw);
      if(data.fields){
        FIELD_IDS.forEach(id => {
          if(id in data.fields){
            const el = document.getElementById(id);
            if(el) el.value = data.fields[id];
          }
        });
      }
      if(Array.isArray(data.lines) && data.lines.length){
        lines = data.lines;
      }
      return true;
    }catch(e){ return false; }
  }

  /* ---------------- Address autofill (PDOK Locatieserver) ---------------- */

  async function autofillAddress(prefix){
    if(!exists(prefix + "Postcode") || !exists(prefix + "Huisnr")) return;
    const postcodeRaw = val(prefix + "Postcode").trim();
    const huisnr = val(prefix + "Huisnr").trim();
    const hint = document.getElementById(prefix + "AutofillHint");

    document.getElementById(prefix + "Postcode").value = formatPostcodeValue(postcodeRaw);
    const postcodeClean = postcodeRaw.replace(/\s+/g, "");

    if(!/^[1-9][0-9]{3}[A-Za-z]{2}$/.test(postcodeClean) || !huisnr){
      return;
    }

    if(hint) hint.textContent = "Adres opzoeken…";

    try{
      const query = `${postcodeClean} ${huisnr}`;
      const url = `https://api.pdok.nl/bzk/locatieserver/search/v3_1/free?q=${encodeURIComponent(query)}&fq=type:adres&rows=1`;
      const res = await fetch(url);
      if(!res.ok) throw new Error("request failed");
      const data = await res.json();
      const doc = data && data.response && data.response.docs && data.response.docs[0];
      if(doc){
        if(doc.straatnaam) document.getElementById(prefix + "Street").value = doc.straatnaam;
        if(doc.woonplaatsnaam) document.getElementById(prefix + "City").value = doc.woonplaatsnaam;
        if(hint) hint.textContent = "Straat en plaats automatisch ingevuld ✓";
        renderPreview();
        saveState();
      }else{
        if(hint) hint.textContent = "Geen adres gevonden — vul zelf aan.";
      }
    }catch(e){
      if(hint) hint.textContent = "Opzoeken mislukt (geen verbinding?) — vul zelf aan.";
    }
  }

  /* ---------------- Line items ---------------- */

  const linesEl = document.getElementById("lines");
  const itemsBody = document.getElementById("itemsBody");

  function fmtEuro(n){
    return "€ " + (n || 0).toLocaleString("nl-NL", {minimumFractionDigits:2, maximumFractionDigits:2});
  }

  function lineDescriptionPlaceholder(type){
    if(type === "uren") return "Onderhoud cv-ketel";
    if(type === "aanrij") return "Aanrijkosten (voorrijden)";
    return "Materiaalkosten";
  }

  function escapeAttr(s){ return String(s).replace(/"/g, "&quot;"); }
  function escapeHtml(s){ return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }

  function btwOptionsHtml(selected){
    return BTW_RATES.map(r => `<option value="${r}" ${Number(selected)===r?"selected":""}>${r}% btw</option>`).join("");
  }

  function renderControls(){
    if(!linesEl) return;
    linesEl.innerHTML = "";
    lines.forEach((line, i) => {
      const card = document.createElement("div");
      card.className = "line-card";
      card.innerHTML = `
        <button type="button" class="remove" data-i="${i}" title="Regel verwijderen">✕</button>
        <div class="line-grid">
          <div class="full">
            <label>Omschrijving</label>
            <input type="text" data-field="omschrijving" data-i="${i}" value="${escapeAttr(line.omschrijving)}" placeholder="${lineDescriptionPlaceholder(line.type)}">
          </div>
          <div>
            <label>Type</label>
            <select data-field="type" data-i="${i}">
              <option value="uren" ${line.type==="uren"?"selected":""}>Uren (standaard €${DEFAULT_RATE}/u)</option>
              <option value="aanrij" ${line.type==="aanrij"?"selected":""}>Aanrijkosten</option>
              <option value="overig" ${line.type==="overig"?"selected":""}>Overig</option>
            </select>
          </div>
          <div>
            <label>${line.type === "uren" ? "Aantal uur" : "Aantal"}</label>
            <input type="number" step="0.25" min="0" data-field="aantal" data-i="${i}" value="${line.aantal}" placeholder="${line.type === 'uren' ? '2' : '1'}">
          </div>
          <div>
            <label>Tarief per eenheid (excl. btw)</label>
            <input type="number" step="0.01" min="0" data-field="tarief" data-i="${i}" value="${line.tarief}" placeholder="${line.type === 'uren' ? DEFAULT_RATE : '0'}">
          </div>
          ${MODE === "factuur" ? `
          <div>
            <label>Btw-tarief</label>
            <select data-field="btw" data-i="${i}">${btwOptionsHtml(line.btw)}</select>
          </div>` : ``}
        </div>
      `;
      linesEl.appendChild(card);
    });

    linesEl.querySelectorAll("input, select").forEach(el => {
      el.addEventListener("input", onLineChange);
      el.addEventListener("change", onLineChange);
    });
    linesEl.querySelectorAll(".remove").forEach(btn => {
      btn.addEventListener("click", () => {
        lines.splice(Number(btn.dataset.i), 1);
        renderControls();
        renderPreview();
        saveState();
      });
    });
  }

  function onLineChange(e){
    const i = Number(e.target.dataset.i);
    const field = e.target.dataset.field;
    let value = e.target.value;

    if(field === "type"){
      lines[i].type = value;
      if(value === "uren" && (!lines[i].tarief || lines[i].tarief == 0)) lines[i].tarief = DEFAULT_RATE;
      renderControls();
    } else if(field === "aantal" || field === "tarief" || field === "btw"){
      lines[i][field] = parseFloat(value) || 0;
    } else {
      lines[i][field] = value;
    }
    renderPreview();
    saveState();
  }

  /* ---------------- Preview rendering ---------------- */

  function formatDateNL(isoDate){
    const months = ["januari","februari","maart","april","mei","juni","juli","augustus","september","oktober","november","december"];
    const [y,m,d] = isoDate.split("-").map(Number);
    return `${d} ${months[m-1]} ${y}`;
  }

  function renderPreview(){
    // business
    setText("pvBizName", val("bizName") || "—");
    const bizStreet = val("bizStreet"), bizHuisnr = val("bizHuisnr");
    const bizPostcode = val("bizPostcode"), bizCity = val("bizCity");
    setText("pvBizStreet", [bizStreet, bizHuisnr].filter(Boolean).join(" "));
    setText("pvBizPostcodeCity", [bizPostcode, bizCity].filter(Boolean).join(" "));
    setText("pvBizContact", [val("bizPhone"), val("bizEmail")].filter(Boolean).join(" · "));
    if(exists("pvBizKvkBtw")){
      const kvk = val("bizKvk"), btwnr = val("bizBtw");
      const parts = [];
      if(kvk) parts.push("KVK " + kvk);
      if(btwnr) parts.push("BTW " + btwnr);
      setText("pvBizKvkBtw", parts.join(" · "));
    }

    // document meta
    setText("pvNotaNr", val("notaNr") || "—");
    setText("pvNotaNr2", val("notaNr") || "—");
    const dateVal = val("notaDate");
    setText("pvDate", dateVal ? formatDateNL(dateVal) : "—");
    setText("pvTerm", val("payTerm") || "—");

    // client
    setText("pvClientName", val("clientName") || "[Naam klant]");
    const clientStreet = val("clientStreet"), clientHuisnr = val("clientHuisnr");
    const clientPostcode = val("clientPostcode"), clientCity = val("clientCity");
    setText("pvClientStreet", [clientStreet, clientHuisnr].filter(Boolean).join(" ") || "[Straatnaam 12]");
    setText("pvClientCity", [clientPostcode, clientCity].filter(Boolean).join(" ") || "[1234 AB Plaats]");

    // payment
    setText("pvPayName", val("payName") || "—");
    setText("pvIban", val("iban") || "—");

    // items
    if(itemsBody){
      itemsBody.innerHTML = "";
      let subtotal = 0;
      let btwTotal = 0;
      const btwBuckets = {};

      lines.forEach(line => {
        const bedrag = (line.aantal || 0) * (line.tarief || 0);
        subtotal += bedrag;
        const unitLabel = line.type === "uren" ? "u" : "x";
        let btwCell = "";
        if(MODE === "factuur"){
          const rate = line.btw || 0;
          const btwBedrag = bedrag * (rate / 100);
          btwTotal += btwBedrag;
          btwBuckets[rate] = (btwBuckets[rate] || 0) + btwBedrag;
          btwCell = `<td class="num">${rate}%</td>`;
        }
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td>${escapeHtml(line.omschrijving || "")}</td>
          <td class="num">${line.aantal} ${unitLabel}</td>
          <td class="num">${fmtEuro(line.tarief || 0)}</td>
          ${btwCell}
          <td class="num">${fmtEuro(bedrag)}</td>
        `;
        itemsBody.appendChild(tr);
      });

      if(MODE === "factuur"){
        setText("pvSubtotal", fmtEuro(subtotal));
        const btwBreakdownEl = document.getElementById("pvBtwBreakdown");
        if(btwBreakdownEl){
          btwBreakdownEl.innerHTML = Object.keys(btwBuckets)
            .sort((a,b) => b - a)
            .filter(rate => Number(rate) > 0 || btwBuckets[rate] > 0 || Object.keys(btwBuckets).length === 1)
            .map(rate => `<tr><td colspan="4" class="sub-label">Btw ${rate}%</td><td class="num">${fmtEuro(btwBuckets[rate])}</td></tr>`)
            .join("");
        }
        setText("pvTotal", fmtEuro(subtotal + btwTotal));
      }else{
        setText("pvTotal", fmtEuro(subtotal));
      }
    }
  }

  /* ---------------- Wire-up ---------------- */

  function initFieldListeners(){
    FIELD_IDS.forEach(id => {
      const el = document.getElementById(id);
      if(!el) return;
      el.addEventListener("input", () => { renderPreview(); saveState(); });
      el.addEventListener("change", () => { renderPreview(); saveState(); });
    });

    ["bizPostcode","clientPostcode"].forEach(attachPostcodeFormatter);
    ["iban"].forEach(attachIbanFormatter);
    ["bizStreet","bizCity","clientStreet","clientCity","clientName"].forEach(attachTitleCaseFormatter);

    ["bizPostcode","bizHuisnr"].forEach(id => {
      const el = document.getElementById(id);
      if(el) el.addEventListener("blur", () => autofillAddress("biz"));
    });
    ["clientPostcode","clientHuisnr"].forEach(id => {
      const el = document.getElementById(id);
      if(el) el.addEventListener("blur", () => autofillAddress("client"));
    });

    const addBtn = document.getElementById("addLine");
    if(addBtn) addBtn.addEventListener("click", () => {
      lines.push(MODE === "factuur"
        ? { type: "overig", omschrijving: "", aantal: 1, tarief: 0, btw: 21 }
        : { type: "overig", omschrijving: "", aantal: 1, tarief: 0 });
      renderControls();
      renderPreview();
      saveState();
    });

    const resetBtn = document.getElementById("resetBtn");
    if(resetBtn) resetBtn.addEventListener("click", () => {
      lines = MODE === "factuur"
        ? [
            { type: "uren", omschrijving: "Werkzaamheden", aantal: 1, tarief: DEFAULT_RATE, btw: 21 },
            { type: "aanrij", omschrijving: "Aanrijkosten", aantal: 1, tarief: 0, btw: 21 }
          ]
        : [
            { type: "uren", omschrijving: "Werkzaamheden", aantal: 1, tarief: DEFAULT_RATE },
            { type: "aanrij", omschrijving: "Aanrijkosten", aantal: 1, tarief: 0 }
          ];
      renderControls();
      renderPreview();
      saveState();
    });

    const clearBtn = document.getElementById("clearSavedBtn");
    if(clearBtn) clearBtn.addEventListener("click", () => {
      try{ localStorage.removeItem(STORAGE_KEY); }catch(e){}
      location.reload();
    });

    const printBtn = document.getElementById("printBtn");
    if(printBtn) printBtn.addEventListener("click", () => window.print());
  }

  function init(){
    loadState();
    if(!val("notaDate")){
      const el = document.getElementById("notaDate");
      if(el) el.value = new Date().toISOString().slice(0,10);
    }
    initFieldListeners();
    renderControls();
    renderPreview();
  }

  document.addEventListener("DOMContentLoaded", init);
})();