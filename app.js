/* =========================================================
   NDF Scan PWA v0.3
   Architecture :
   - Google Vision API (free tier 1000/mois) pour OCR
   - Parsing regex côté client (gratuit)
   - SheetJS pour la génération .xlsm en préservant le format
   - Service Worker pour le hors-ligne complet
   - Queue offline : si pas de réseau, les scans s'empilent et
     se traitent automatiquement au retour de connexion
   ========================================================= */

const CATEGORIES = [
  { key: 'KM',        label: 'Nombre de KM réalisés',  row: 23, vat: 0,    isKm: true, keywords: ['km', 'kilom'] },
  { key: 'CARBURANT', label: 'Carburant',              row: 24, vat: 0.20,
    keywords: ['total', 'esso', 'bp ', 'shell', 'avia', 'leclerc', 'carrefour', 'super u',
               'sp95', 'sp98', 'gazole', 'gnr', 'diesel', 'carburant', 'station', 'pompe'] },
  { key: 'PEAGE',     label: 'Péage',                  row: 25, vat: 0.20,
    keywords: ['aprr', 'vinci', 'sanef', 'asf', 'cofiroute', 'escota', 'sapn', 'péage', 'peage', 'autoroute'] },
  { key: 'PARKING',   label: 'Parking',                row: 26, vat: 0.20,
    keywords: ['indigo', 'effia', 'q-park', 'qpark', 'parking', 'parc auto', 'horodateur', 'saemes'] },
  { key: 'TAXI',      label: 'Taxi',                   row: 27, vat: 0.20,
    keywords: ['taxi', 'uber', 'bolt', 'g7', 'heetch', 'kapten', 'vtc', 'marcel'] },
  { key: 'SNCF',      label: 'SNCF',                   row: 28, vat: 0,
    keywords: ['sncf', 'tgv', 'inoui', 'ouigo', 'intercités', 'ter ', 'thalys'] },
  { key: 'REPAS_MIDI',label: 'Repas midi',             row: 29, vat: 0.10,
    keywords: ['restaurant', 'brasserie', 'bistrot', 'café', 'snack', 'sandwich', 'paul ',
               'pret ', 'mcdonald', 'subway', 'boulangerie'] },
  { key: 'REPAS_SOIR',label: 'Repas soir',             row: 30, vat: 0.10, keywords: [] },
  { key: 'INVITATION',label: 'Invitation restaurant',  row: 31, vat: 0.10, keywords: [] },
  { key: 'HOTEL',     label: 'Hôtel',                  row: 32, vat: 0.10,
    keywords: ['hotel', 'hôtel', 'ibis', 'mercure', 'novotel', 'campanile', 'kyriad', 'b&b',
               'accor', 'best western', 'nuit', 'chambre', 'séjour'] },
  { key: 'AVION',     label: "Billets d'avion/bagage", row: 33, vat: 0,
    keywords: ['air france', 'ryanair', 'easyjet', 'transavia', 'volotea', 'vueling',
               'aéroport', 'aeroport', 'vol ', 'bagage'] },
  { key: 'ENTRETIEN', label: 'Entretien VDS',          row: 34, vat: 0.20,
    keywords: ['vidange', 'pneu', 'révision', 'réparation', 'norauto', 'feu vert', 'garage', 'midas'] },
  { key: 'ABONNEMENT',label: 'Abonnement',             row: 36, vat: 0.20, keywords: ['abonnement'] },
  { key: 'FOURNITURE',label: 'Achat fourniture',       row: 37, vat: 0.20,
    keywords: ['bureau vallée', 'office depot', 'fourniture'] },
  { key: 'MATERIEL',  label: 'Achat matériel évènement',row: 38, vat: 0.20, keywords: [] },
  { key: 'GOODIES',   label: 'Goodies',                row: 39, vat: 0.20, keywords: [] },
  { key: 'AUTRE',     label: 'Autres (à préciser)',    row: 40, vat: 0.20, keywords: [] }
];

const STORAGE_KEY = 'ndfscan_tickets_v3';
const IDENTITY_KEY = 'ndfscan_identity_v3';
const APIKEY_KEY = 'ndfscan_gvision_key_v1';
const QUOTA_KEY = 'ndfscan_quota_v1';
const QUEUE_KEY = 'ndfscan_queue_v1';   // tickets en attente d'OCR (mode offline)
const INSTALL_DISMISSED_KEY = 'ndfscan_install_dismissed_v1';

let tickets = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
let pendingQueue = JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]');
let editingTicket = null;
let deferredInstallPrompt = null;

/* ---------- PWA install + Service Worker ---------- */
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
  if (!localStorage.getItem(INSTALL_DISMISSED_KEY)) {
    document.getElementById('installPrompt').style.display = 'flex';
  }
});

function installPWA() {
  if (deferredInstallPrompt) {
    deferredInstallPrompt.prompt();
    deferredInstallPrompt.userChoice.then(() => {
      deferredInstallPrompt = null;
      document.getElementById('installPrompt').style.display = 'none';
    });
  }
}

function dismissInstall() {
  document.getElementById('installPrompt').style.display = 'none';
  localStorage.setItem(INSTALL_DISMISSED_KEY, '1');
}

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(err => console.warn('SW register failed:', err));
}

/* ---------- Online / offline status ---------- */
function updateNetStatus() {
  const el = document.getElementById('netStatus');
  if (navigator.onLine) {
    el.textContent = '● en ligne';
    el.className = 'online-badge';
    el.style.color = '#d1fae5';
    // Au retour en ligne, tenter de vider la queue
    if (pendingQueue.length > 0) processQueue();
  } else {
    el.textContent = '● hors ligne';
    el.className = 'offline-badge';
    el.style.color = '';
  }
}
window.addEventListener('online', updateNetStatus);
window.addEventListener('offline', updateNetStatus);

/* ---------- Init ---------- */
function init() {
  const id = JSON.parse(localStorage.getItem(IDENTITY_KEY) || '{}');
  ['nom','prenom','mois','immat'].forEach(f => { if (id[f]) document.getElementById(f).value = id[f]; });
  ['nom','prenom','mois','immat'].forEach(f => {
    document.getElementById(f).addEventListener('input', saveIdentity);
  });
  const sel = document.getElementById('edCategory');
  CATEGORIES.forEach(c => {
    const o = document.createElement('option'); o.value = c.key; o.textContent = c.label; sel.appendChild(o);
  });
  sel.addEventListener('change', () => {
    document.getElementById('edKmRow').style.display = sel.value === 'KM' ? 'block' : 'none';
  });
  if (!localStorage.getItem(APIKEY_KEY)) {
    document.getElementById('apiKeyBanner').style.display = 'block';
  } else {
    updateQuotaDisplay();
  }
  updateNetStatus();
  updateQueueBadge();
  renderTickets();
  // Si on est en ligne au démarrage et qu'il y a une queue, on traite
  if (navigator.onLine && pendingQueue.length > 0) processQueue();
}

function saveIdentity() {
  const id = {};
  ['nom','prenom','mois','immat'].forEach(f => id[f] = document.getElementById(f).value);
  localStorage.setItem(IDENTITY_KEY, JSON.stringify(id));
}

function promptApiKey() {
  const k = prompt('Colle ta clé API Google Cloud Vision :\n\n' +
                   '1. Va sur https://console.cloud.google.com/\n' +
                   '2. Crée un projet → active "Cloud Vision API"\n' +
                   '3. Identifiants → "Créer une clé API"\n' +
                   '4. Restreins la clé à l\'API Vision (sécurité)\n\n' +
                   'La clé est stockée uniquement sur ton téléphone.');
  if (k && k.trim()) {
    localStorage.setItem(APIKEY_KEY, k.trim());
    document.getElementById('apiKeyBanner').style.display = 'none';
    updateQuotaDisplay();
    toast('Clé enregistrée ✓');
  }
}

function getQuotaThisMonth() {
  const data = JSON.parse(localStorage.getItem(QUOTA_KEY) || '{}');
  return (data[new Date().toISOString().slice(0,7)] || 0);
}

function incrementQuota() {
  const data = JSON.parse(localStorage.getItem(QUOTA_KEY) || '{}');
  const now = new Date().toISOString().slice(0,7);
  data[now] = (data[now] || 0) + 1;
  localStorage.setItem(QUOTA_KEY, JSON.stringify(data));
  updateQuotaDisplay();
}

function updateQuotaDisplay() {
  if (!localStorage.getItem(APIKEY_KEY)) return;
  const used = getQuotaThisMonth();
  document.getElementById('quotaUsed').textContent = used;
  document.getElementById('quotaPct').textContent = Math.round(used/10) + '%';
  document.getElementById('quotaInfo').style.display = 'flex';
  if (used > 900) {
    const i = document.getElementById('quotaInfo');
    i.style.background = '#fef3c7'; i.style.borderColor = '#f59e0b'; i.style.color = '#78350f';
  }
}

function toast(msg, ms=2500) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), ms);
}

function updateQueueBadge() {
  const badge = document.getElementById('queueBadge');
  if (pendingQueue.length > 0) {
    badge.textContent = pendingQueue.length + ' en attente';
    badge.style.display = 'inline-block';
  } else {
    badge.style.display = 'none';
  }
}

/* ---------- Capture + OCR ---------- */
async function handleFile(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async (e) => {
    const dataUrl = e.target.result;
    document.getElementById('preview-img').src = dataUrl;
    document.getElementById('preview-img').style.display = 'block';

    const apiKey = localStorage.getItem(APIKEY_KEY);

    // Pas de clé API : ouvre directement l'éditeur en saisie manuelle
    if (!apiKey) {
      openEditor({
        id: 'tk_' + Date.now(), image: dataUrl, ocrRaw: '(pas de clé API — saisie manuelle)',
        date: todayISO(), ttc: '', category: 'AUTRE',
        motif: '', site: '', odm: '', trajet: '', merchant: ''
      });
      return;
    }

    // Hors ligne : mettre en queue
    if (!navigator.onLine) {
      pendingQueue.push({ id: 'tk_' + Date.now(), image: dataUrl, addedAt: Date.now() });
      localStorage.setItem(QUEUE_KEY, JSON.stringify(pendingQueue));
      updateQueueBadge();
      document.getElementById('preview-img').style.display = 'none';
      toast('📥 Ticket mis en attente (hors ligne)');
      return;
    }

    // En ligne : on traite tout de suite
    document.getElementById('processing').style.display = 'block';
    try {
      const ocrText = await googleVisionOCR(dataUrl, apiKey);
      incrementQuota();
      const extracted = parseTicket(ocrText);
      document.getElementById('processing').style.display = 'none';
      openEditor({
        id: 'tk_' + Date.now(),
        image: dataUrl, ocrRaw: ocrText,
        date: extracted.date || todayISO(),
        ttc: extracted.ttc || '',
        category: extracted.category || 'AUTRE',
        motif: '', site: '', odm: '', trajet: '',
        merchant: extracted.merchant || ''
      });
    } catch (err) {
      document.getElementById('processing').style.display = 'none';
      // En cas d'échec réseau, on bascule en queue plutôt que de perdre le scan
      pendingQueue.push({ id: 'tk_' + Date.now(), image: dataUrl, addedAt: Date.now() });
      localStorage.setItem(QUEUE_KEY, JSON.stringify(pendingQueue));
      updateQueueBadge();
      document.getElementById('preview-img').style.display = 'none';
      toast('⚠️ Erreur réseau — ticket mis en attente');
      console.error(err);
    }
  };
  reader.readAsDataURL(file);
}

/* Traite tous les tickets en attente (appelée au retour en ligne) */
async function processQueue() {
  const apiKey = localStorage.getItem(APIKEY_KEY);
  if (!apiKey || !navigator.onLine || pendingQueue.length === 0) return;
  toast(`🔄 Traitement de ${pendingQueue.length} ticket(s) en attente…`);

  while (pendingQueue.length > 0 && navigator.onLine) {
    const item = pendingQueue[0];
    try {
      const ocrText = await googleVisionOCR(item.image, apiKey);
      incrementQuota();
      const extracted = parseTicket(ocrText);
      // On l'ajoute directement aux tickets validés avec les valeurs détectées
      // (l'utilisateur pourra ensuite éditer si besoin)
      tickets.push({
        id: item.id,
        image: item.image,
        ocrRaw: ocrText,
        date: extracted.date || todayISO(),
        ttc: extracted.ttc || 0,
        category: extracted.category || 'AUTRE',
        motif: '', site: '', odm: '', trajet: '',
        merchant: extracted.merchant || '',
        needsReview: true // marqueur pour signaler à l'utilisateur
      });
      pendingQueue.shift();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(tickets));
      localStorage.setItem(QUEUE_KEY, JSON.stringify(pendingQueue));
    } catch (err) {
      console.error('Queue process error:', err);
      break; // on retentera plus tard
    }
  }
  updateQueueBadge();
  renderTickets();
  if (pendingQueue.length === 0) toast('✓ File d\'attente traitée');
}

async function googleVisionOCR(dataUrl, apiKey) {
  const base64 = dataUrl.split(',')[1];
  const url = `https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`;
  const body = {
    requests: [{
      image: { content: base64 },
      features: [{ type: 'DOCUMENT_TEXT_DETECTION' }]
    }]
  };
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const errBody = await res.text();
    throw new Error('Google Vision HTTP ' + res.status + ' : ' + errBody.slice(0, 200));
  }
  const data = await res.json();
  const ann = data.responses?.[0];
  if (ann?.error) throw new Error('Vision : ' + ann.error.message);
  return ann?.fullTextAnnotation?.text || '';
}

function addManualTicket() {
  openEditor({
    id: 'tk_' + Date.now(), image: '', ocrRaw: '(saisie manuelle)',
    date: todayISO(), ttc: '', category: 'AUTRE',
    motif: '', site: '', odm: '', trajet: '', merchant: ''
  });
}

/* ---------- Parsing OCR → structuré ---------- */
function parseTicket(ocrText) {
  const text = ocrText.toLowerCase();
  const result = { date: null, ttc: null, category: null, merchant: null };

  // DATE
  const datePatterns = [
    /(\d{2})[\/\-\.](\d{2})[\/\-\.](\d{4})/,
    /(\d{2})[\/\-\.](\d{2})[\/\-\.](\d{2})\b/,
    /(\d{4})[\/\-](\d{2})[\/\-](\d{2})/
  ];
  for (const re of datePatterns) {
    const m = ocrText.match(re);
    if (m) {
      let d, mo, y;
      if (m[1].length === 4) { y = m[1]; mo = m[2]; d = m[3]; }
      else { d = m[1]; mo = m[2]; y = m[3].length === 2 ? '20' + m[3] : m[3]; }
      const dt = new Date(`${y}-${mo}-${d}`);
      if (!isNaN(dt) && dt.getFullYear() >= 2024 && dt < new Date(Date.now() + 7*86400000)) {
        result.date = `${y}-${mo}-${d}`;
        break;
      }
    }
  }

  // MONTANT TTC : on note chaque montant trouvé et on garde le mieux scoré
  const amountRe = /(\d{1,4}[,.]\d{2})\s*(?:€|eur)?/gi;
  const candidates = [];
  ocrText.split('\n').forEach((line, idx) => {
    const lineL = line.toLowerCase();
    let weight = 1;
    if (/total\s*(ttc|net|général|à payer)/i.test(lineL)) weight = 100;
    else if (/\bttc\b/i.test(lineL)) weight = 50;
    else if (/à payer|montant dû|net à payer|montant ttc/i.test(lineL)) weight = 80;
    else if (/\btotal\b/i.test(lineL)) weight = 30;
    else if (/sous-total|sous total/i.test(lineL)) weight = 5;
    else if (/tva|t\.v\.a/i.test(lineL)) weight = 2;

    let m;
    while ((m = amountRe.exec(line)) !== null) {
      const val = parseFloat(m[1].replace(',', '.'));
      if (val > 0 && val < 10000) candidates.push({ value: val, weight });
    }
    amountRe.lastIndex = 0;
  });
  if (candidates.length > 0) {
    candidates.sort((a, b) => (b.weight * 1000 + b.value) - (a.weight * 1000 + a.value));
    result.ttc = candidates[0].value;
  }

  // CATÉGORIE
  let bestCat = null, bestScore = 0;
  for (const cat of CATEGORIES) {
    let score = 0;
    for (const kw of cat.keywords) {
      if (text.includes(kw)) score += kw.length;
    }
    if (score > bestScore) { bestScore = score; bestCat = cat.key; }
  }
  result.category = bestCat || 'AUTRE';

  // MARCHAND
  const firstLines = ocrText.split('\n').slice(0, 5).map(l => l.trim()).filter(l => l.length > 2);
  const capLine = firstLines.find(l => l === l.toUpperCase() && /[A-Z]/.test(l) && l.length < 40);
  result.merchant = (capLine || firstLines[0] || '').slice(0, 40);

  return result;
}

/* ---------- Éditeur ---------- */
function openEditor(t) {
  editingTicket = t;
  if (t.image) {
    document.getElementById('editorImg').src = t.image;
    document.getElementById('editorImg').style.display = 'block';
  } else {
    document.getElementById('editorImg').style.display = 'none';
  }
  document.getElementById('edDate').value = t.date;
  document.getElementById('edTTC').value = t.ttc;
  document.getElementById('edCategory').value = t.category;
  document.getElementById('edMerchant').value = t.merchant;
  document.getElementById('edMotif').value = t.motif;
  document.getElementById('edSite').value = t.site;
  document.getElementById('edODM').value = t.odm;
  document.getElementById('edTrajet').value = t.trajet;
  document.getElementById('edOcrRaw').textContent = t.ocrRaw || '';
  document.getElementById('edKmRow').style.display = t.category === 'KM' ? 'block' : 'none';
  document.getElementById('editorOverlay').style.display = 'block';
}

function cancelEdit() {
  document.getElementById('editorOverlay').style.display = 'none';
  document.getElementById('preview-img').style.display = 'none';
  editingTicket = null;
}

function saveTicket() {
  if (!editingTicket) return;
  const t = editingTicket;
  t.date = document.getElementById('edDate').value;
  t.ttc = parseFloat(document.getElementById('edTTC').value);
  t.category = document.getElementById('edCategory').value;
  t.merchant = document.getElementById('edMerchant').value.trim();
  t.motif = document.getElementById('edMotif').value.trim();
  t.site = document.getElementById('edSite').value.trim().toUpperCase();
  t.odm = document.getElementById('edODM').value.trim();
  t.trajet = document.getElementById('edTrajet').value.trim();
  t.needsReview = false;
  if (!t.date || isNaN(t.ttc) || t.ttc <= 0) { alert('Date et montant TTC obligatoires.'); return; }

  const idx = tickets.findIndex(x => x.id === t.id);
  if (idx >= 0) tickets[idx] = t; else tickets.push(t);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tickets));
  cancelEdit();
  renderTickets();
  toast('Ticket enregistré ✓');
}

function editTicket(id) { const t = tickets.find(x => x.id === id); if (t) openEditor(t); }
function deleteTicket(id) {
  if (!confirm('Supprimer ce ticket ?')) return;
  tickets = tickets.filter(x => x.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tickets));
  renderTickets();
}

function renderTickets() {
  const list = document.getElementById('ticketList');
  document.getElementById('ticketCount').textContent = tickets.length;
  if (tickets.length === 0) {
    list.innerHTML = '<div class="empty">Aucun ticket scanné pour l\'instant.</div>';
    document.getElementById('summary').style.display = 'none';
    document.getElementById('genBtn').disabled = true;
    return;
  }
  list.innerHTML = '';
  tickets.sort((a,b) => a.date.localeCompare(b.date));
  let totalTTC = 0;
  tickets.forEach(t => {
    const cat = CATEGORIES.find(c => c.key === t.category);
    const ht = +(t.ttc / (1 + cat.vat)).toFixed(2);
    const tva = +(t.ttc - ht).toFixed(2);
    totalTTC += t.ttc;
    const div = document.createElement('div');
    div.className = 'ticket';
    const reviewBadge = t.needsReview ? '<span class="badge" style="background:#fef3c7;color:#92400e;">à vérifier</span>' : '';
    div.innerHTML = `
      <div class="ticket-head">
        <strong>${t.ttc.toFixed(2)} € <span class="badge ok">${cat.label}</span> ${reviewBadge}</strong>
        <div style="display:flex; gap:6px;">
          <button class="secondary" style="width:auto; padding:6px 10px; font-size:12px;" onclick="editTicket('${t.id}')">✎</button>
          <button class="danger" style="width:auto; padding:6px 10px; font-size:12px;" onclick="deleteTicket('${t.id}')">×</button>
        </div>
      </div>
      <div class="ticket-meta">
        <span>📅 ${formatDate(t.date)}</span>
        ${t.merchant ? `<span>🏪 ${t.merchant}</span>` : ''}
        ${t.motif ? `<span>📝 ${t.motif}</span>` : ''}
        ${t.site ? `<span>🏢 ${t.site}</span>` : ''}
        <span>HT ${ht.toFixed(2)} · TVA ${tva.toFixed(2)}</span>
      </div>`;
    list.appendChild(div);
  });
  const totalHT = tickets.reduce((s,t) => {
    const c = CATEGORIES.find(c=>c.key===t.category); return s + t.ttc/(1+c.vat);
  }, 0);
  document.getElementById('totalTTC').textContent = totalTTC.toFixed(2) + ' €';
  document.getElementById('totalHT').textContent = totalHT.toFixed(2) + ' €';
  document.getElementById('totalTVA').textContent = (totalTTC - totalHT).toFixed(2) + ' €';
  document.getElementById('summary').style.display = 'grid';
  document.getElementById('genBtn').disabled = false;
}

function formatDate(iso) {
  if (!iso) return '';
  const [y,m,d] = iso.split('-');
  return `${d}/${m}/${y}`;
}
function todayISO() { return new Date().toISOString().slice(0,10); }

/* ---------- Génération NDF .xlsm ---------- */
async function generateNDF() {
  const nom = document.getElementById('nom').value.trim();
  const prenom = document.getElementById('prenom').value.trim();
  const mois = document.getElementById('mois').value;
  const immat = document.getElementById('immat').value.trim();
  if (!nom || !prenom || !mois || !immat) { alert('Identité, mois et immat. obligatoires.'); return; }

  const byDate = {};
  tickets.forEach(t => { (byDate[t.date] = byDate[t.date] || []).push(t); });
  const dates = Object.keys(byDate).sort();
  if (dates.length > 5) {
    if (!confirm(`Tu as ${dates.length} dates différentes mais le template n'en accepte que 5.\n` +
                 `Seules les 5 premières seront exportées. Continuer ?`)) return;
  }

  try {
    const resp = await fetch('NDF_VIERGE.xlsm');
    if (!resp.ok) throw new Error('Template NDF_VIERGE.xlsm introuvable');
    const arrayBuffer = await resp.arrayBuffer();
    const wb = XLSX.read(arrayBuffer, { type: 'array', cellStyles: true, bookVBA: true, cellFormula: true });
    const ws = wb.Sheets['NDF_VIERGE'];

    const setCell = (addr, value, type='s') => {
      const existing = ws[addr] || {};
      ws[addr] = { ...existing, v: value, t: type, w: undefined };
      delete ws[addr].f;
    };

    setCell('L9', nom.toUpperCase());
    setCell('N9', prenom);
    setCell('L12', mois);
    setCell('N12', immat);

    const DATE_COLS = ['F', 'J', 'N', 'R', 'V'];
    dates.slice(0, 5).forEach((date, i) => {
      const col = DATE_COLS[i];
      ws[col + '16'] = { v: dateToExcelSerial(date), t: 'n', z: 'dd/mm/yyyy' };

      const motifs = [...new Set(byDate[date].map(t => t.motif).filter(Boolean))].join(' / ');
      if (motifs) setCell(col + '18', motifs);
      const site = byDate[date].map(t => t.site).find(Boolean);
      if (site) setCell(col + '21', site);
      const odm = byDate[date].map(t => t.odm).find(Boolean);
      if (odm) setCell(col + '20', odm);
      const trajet = byDate[date].map(t => t.trajet).find(Boolean);
      if (trajet) setCell(col + '22', trajet);

      const sums = {};
      byDate[date].forEach(t => { sums[t.category] = (sums[t.category] || 0) + t.ttc; });
      Object.entries(sums).forEach(([cat, ttc]) => {
        const c = CATEGORIES.find(x => x.key === cat);
        if (c) setCell(col + c.row, +ttc.toFixed(2), 'n');
      });
    });

    const out = XLSX.write(wb, { bookType: 'xlsm', type: 'array', bookVBA: true });
    const blob = new Blob([out], { type: 'application/vnd.ms-excel.sheet.macroEnabled.12' });
    const filename = `NDF_${nom.toUpperCase()}_${mois}.xlsm`;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast('NDF générée ✓');
  } catch (err) {
    alert('Erreur génération : ' + err.message);
    console.error(err);
  }
}

function dateToExcelSerial(iso) {
  const d = new Date(iso + 'T00:00:00Z');
  const epoch = new Date(Date.UTC(1899, 11, 30));
  return Math.floor((d - epoch) / 86400000);
}

function resetAll() {
  if (!confirm('Effacer tous les tickets et l\'identité ?')) return;
  tickets = [];
  pendingQueue = [];
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(IDENTITY_KEY);
  localStorage.removeItem(QUEUE_KEY);
  ['nom','prenom','mois','immat'].forEach(f => document.getElementById(f).value = '');
  renderTickets();
  updateQueueBadge();
  toast('Tout réinitialisé');
}

init();
