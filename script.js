// ===== Navegação mobile & smooth =====
const menuToggle = document.querySelector('.menu-toggle');
const navLinks = document.querySelector('.nav-links');
menuToggle?.addEventListener('click', () => {
  navLinks.classList.toggle('active');
  const icon = menuToggle.querySelector('i');
  navLinks.classList.contains('active')
    ? icon.classList.replace('bx-menu', 'bx-x')
    : icon.classList.replace('bx-x', 'bx-menu');
});
document.querySelectorAll('a[href^="#"]').forEach(a => {
  a.addEventListener('click', e => {
    e.preventDefault();
    const id = a.getAttribute('href');
    const t = document.querySelector(id);
    if (!t) return;
    window.scrollTo({ top: t.getBoundingClientRect().top + window.pageYOffset - 80, behavior: 'smooth' });
    navLinks?.classList.remove('active');
  });
});

// ===== Estado =====
let ctx = {
  profissionalNome: null,
  profissionalId: null,
  profissionalDocId: null, // ✅ doc id em /profissionais/{id}
  wa: null,
  colecao: null,
  profKey: null,
  fimExpediente: null,
  diasFolga: null
};

let agendamentoContexto = {
  nomeCliente: '',
  sobrenomeCliente: '',
  telefoneCliente: '',
  produtos: [],
  totalProdutos: 0,
  raclub: { status: 'nao' },
  servico: null // {nome, valor, tempoMin}
};

// ✅✅✅ AJUSTE CRÍTICO: pegar os elementos corretos do HTML
// (no HTML: <input id="data"> e <select id="hora">)
const dataInput = document.getElementById('data');
const horaSelect = document.getElementById('hora');

// ===== Constantes =====
const REVIEW_URL = document.getElementById('btnAvaliarGoogle')?.getAttribute('href') || '';

const PRODUTOS = [
  { nome: "Pomada Líquida DA Force MEN", preco: 39.99 },
  { nome: "Leave-in", preco: 39.99 },
  { nome: "Tônico Capilar Dom Pelo", preco: 49.99 },
  { nome: "Balm Para Barba", preco: 39.99 },
  { nome: "Pomada Modeladora - Efeito Teia", preco: 34.99 },
  { nome: "Pomada Modeladora - Efeito Seco ", preco: 34.99 },
];

const SERVICOS = [
  // vazio (carrega do Firestore)
];

// ===== Dados dinâmicos (Firestore) =====
let HORARIO_FUNCIONAMENTO = { inicio: '09:00', fim: '18:30' }; // fallback
let SERVICOS_REMOTE = null;        // [{id,nome,valor,tempoMin}]
let PROFISSIONAIS_REMOTE = null;   // [{id,nome,fotoUrl,whatsapp,colecao,fimExpediente?,diasFolga?}]

const toBRL = (n) => (Number(n) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

// ===== Helpers (profissionalId) =====
function getProfIdFromCollection(col) {
  const c = (col || '').trim();
  if (!c) return null;
  if (c.startsWith('reservas_')) return c.replace(/^reservas_/, '').trim() || null;
  return null;
}

// ===== Helpers (nome para regras) =====
function getProfKeyFromName(nome) {
  const n = (nome || '').trim();
  if (!n) return null;
  // pega o primeiro nome (Rodrigo dos Anjos -> Rodrigo)
  return n.split(/\s+/)[0].trim();
}
function getFimExpedienteEfetivo() {
  // prioridade: ctx.fimExpediente (do Firestore/btn) -> mapa por primeiro nome -> horário global
  const key = ctx.profKey || getProfKeyFromName(ctx.profissionalNome) || null;
  if (ctx.fimExpediente) return ctx.fimExpediente;
  if (key && MAPA_FIM_EXPEDIENTE[key]) return MAPA_FIM_EXPEDIENTE[key];
  return HORARIO_FUNCIONAMENTO.fim || '18:30';
}
function getDiasFolgaEfetivo() {
  // prioridade: ctx.diasFolga (do Firestore/btn) -> mapa por primeiro nome -> []
  if (Array.isArray(ctx.diasFolga)) return ctx.diasFolga;
  const key = ctx.profKey || getProfKeyFromName(ctx.profissionalNome) || null;
  return (key && DIAS_FOLGA[key]) ? DIAS_FOLGA[key] : [];
}

// ===== Helpers de modal (ACESSÍVEIS) =====
let __lastActiveEl = null;

function __getFocusable(container) {
  return container.querySelectorAll(
    'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])'
  );
}
function __trapKeydown(e) {
  if (e.key !== 'Tab') return;
  const focusables = __getFocusable(e.currentTarget);
  if (!focusables.length) return;
  const first = focusables[0];
  const last = focusables[focusables.length - 1];
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault(); last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault(); first.focus();
  }
}
function abrirModal(id) {
  const el = document.getElementById(id);
  if (!el) return;
  __lastActiveEl = document.activeElement;

  el.style.display = 'flex';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.removeAttribute('aria-hidden');

  const focusables = __getFocusable(el);
  (focusables[0] || el).focus();

  el.addEventListener('keydown', __trapKeydown);

  el.__escHandler = (ev) => { if (ev.key === 'Escape') fecharModal(id); };
  document.addEventListener('keydown', el.__escHandler);
}
function fecharModal(id) {
  const el = document.getElementById(id);
  if (!el) return;

  el.style.display = 'none';
  el.setAttribute('aria-hidden', 'true');
  el.removeAttribute('aria-modal');
  el.removeEventListener('keydown', __trapKeydown);

  if (el.__escHandler) {
    document.removeEventListener('keydown', el.__escHandler);
    delete el.__escHandler;
  }
  if (__lastActiveEl && typeof __lastActiveEl.focus === 'function') {
    __lastActiveEl.focus();
  }
}
window.fecharModal = fecharModal;

// ===== Persistência (RA Club) =====
function salvarContextoSessao() {
  try {
    sessionStorage.setItem('agendamentoCtx', JSON.stringify(agendamentoContexto));
    sessionStorage.setItem('ctx', JSON.stringify(ctx));
  } catch { }
}
function restaurarContextoSessao() {
  try {
    const c1 = sessionStorage.getItem('agendamentoCtx');
    const c2 = sessionStorage.getItem('ctx');
    if (c1) agendamentoContexto = JSON.parse(c1);
    if (c2) ctx = JSON.parse(c2);
  } catch { }
}
function tentarRetomarPosCheckout() {
  const flag = sessionStorage.getItem('raclubCheckoutRedirect');
  if (flag === '1') {
    sessionStorage.removeItem('raclubCheckoutRedirect');
    restaurarContextoSessao();
    if (ctx?.colecao && (ctx?.profissionalNome || ctx?.profissionalId)) {
      agendamentoContexto.raclub = { status: 'assinar_link' };
      fecharModal('modalRAClub');
      abrirModalAgendamento();
    }
  }
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') tentarRetomarPosCheckout();
});

// ===== Fluxo Nome → Produtos → RA Club → Agendamento =====
const nomeClienteInput = document.getElementById('nomeCliente');
const sobrenomeClienteInput = document.getElementById('sobrenomeCliente');
const telefoneClienteInput = document.getElementById('telefoneCliente');

const onlyDigits = (s) => (s || '').replace(/\D/g, '');

document.getElementById('btnClienteContinuar')?.addEventListener('click', () => {
  const nome = (nomeClienteInput.value || '').trim();
  const sobrenome = (sobrenomeClienteInput.value || '').trim();
  const telefoneRaw = (telefoneClienteInput.value || '').trim();
  const telDigits = onlyDigits(telefoneRaw);

  if (!nome) { alert('Informe o nome.'); nomeClienteInput.focus(); return; }
  if (!sobrenome) { alert('Informe o sobrenome.'); sobrenomeClienteInput.focus(); return; }
  if (telDigits.length < 10 || telDigits.length > 13) {
    alert('Informe um telefone válido com DDD (ex.: 81999999999).');
    telefoneClienteInput.focus();
    return;
  }

  agendamentoContexto.nomeCliente = nome;
  agendamentoContexto.sobrenomeCliente = sobrenome;
  agendamentoContexto.telefoneCliente = telDigits.startsWith('55') ? telDigits : ('55' + telDigits);

  fecharModal('modalCliente');
  abrirModalProdutos();
});

// Produtos
const produtosContainer = document.getElementById('produtosContainer');
const prodTotalSpan = document.getElementById('prodTotal');
const btnProdutosPular = document.getElementById('btnProdutosPular');
const btnProdutosContinuar = document.getElementById('btnProdutosContinuar');

function renderProdutos() {
  produtosContainer.innerHTML = '';
  PRODUTOS.forEach((p, i) => {
    const card = document.createElement('div');
    card.className = 'prod-card';
    card.dataset.index = i;
    card.innerHTML = `
      <div class="p-name">${p.nome}</div>
      <div class="p-price">${toBRL(p.preco)}</div>
      <small class="muted">Toque para selecionar</small>
    `;
    card.addEventListener('click', () => toggleProduto(i, card));
    produtosContainer.appendChild(card);
  });
}
function toggleProduto(index, cardEl) {
  const item = PRODUTOS[index];
  const exists = agendamentoContexto.produtos.find(pr => pr.nome === item.nome);
  if (exists) {
    agendamentoContexto.produtos = agendamentoContexto.produtos.filter(pr => pr.nome !== item.nome);
    cardEl.classList.remove('active');
  } else {
    agendamentoContexto.produtos.push({ nome: item.nome, preco: item.preco });
    cardEl.classList.add('active');
  }
  agendamentoContexto.totalProdutos = agendamentoContexto.produtos.reduce((s, it) => s + (it.preco || 0), 0);
  prodTotalSpan.textContent = toBRL(agendamentoContexto.totalProdutos);
}
function abrirModalProdutos() {
  agendamentoContexto.produtos = [];
  agendamentoContexto.totalProdutos = 0;
  prodTotalSpan.textContent = toBRL(0);
  renderProdutos();
  abrirModal('modalProdutos');
}
btnProdutosPular?.addEventListener('click', () => { fecharModal('modalProdutos'); abrirModalRAClub(); });
btnProdutosContinuar?.addEventListener('click', () => { fecharModal('modalProdutos'); abrirModalRAClub(); });

// RA Club
const btnRAJaMembro = document.getElementById('btnRAJaMembro');
const btnRANao = document.getElementById('btnRANao');
const btnRAAssinar = document.getElementById('btnRAAssinar');
function abrirModalRAClub() { abrirModal('modalRAClub'); }
btnRAJaMembro?.addEventListener('click', () => { agendamentoContexto.raclub = { status: 'membro' }; fecharModal('modalRAClub'); abrirModalAgendamento(); });
btnRANao?.addEventListener('click', () => { agendamentoContexto.raclub = { status: 'nao' }; fecharModal('modalRAClub'); abrirModalAgendamento(); });
if (btnRAAssinar) {
  const RA_CLUB_CHECKOUT_URL = btnRAAssinar.getAttribute('href') || '';
  btnRAAssinar.addEventListener('click', () => {
    agendamentoContexto.raclub = { status: 'assinar_link' };
    salvarContextoSessao();
    sessionStorage.setItem('raclubCheckoutRedirect', '1');
    if (!RA_CLUB_CHECKOUT_URL) alert('Link de checkout não configurado.');
  });
}

// STEP base para os horários (igual no admin)
const STEP_MIN = 30;

const MAPA_FIM_EXPEDIENTE = {
  'Rodrigo': '18:30',
  'Melqui': '17:30',
  'João': '18:30' // João Victor -> primeiro nome "João"
};

const DIAS_FOLGA = {
  'João': [0, 2],
  'Rodrigo': [0],
  'Melqui': [0]
};

function folgaMsg(profNome) {
  const key = getProfKeyFromName(profNome) || profNome;
  if (key === 'João') return 'João Victor não atende às terças nem aos domingos. Por favor, escolha outro dia.';
  if (key === 'Rodrigo' || key === 'Melqui') return `${key} não atende aos domingos. Por favor, escolha outro dia.`;
  return 'Profissional indisponível para esta data. Escolha outro dia.';
}

const hhmmToMin = (hhmm) => {
  const [h, m] = String(hhmm || '00:00').split(':').map(Number);
  return (h * 60) + (m || 0);
};
const minToHHMM = (min) => {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};

function getServicoSelecionadoTempoMin() {
  const t = Number(agendamentoContexto?.servico?.tempoMin);
  return Number.isFinite(t) && t > 0 ? t : 30; // fallback
}

function gerarSlotsDoDia(inicioHHMM, fimHHMM, passoMin, duracaoMin) {
  const ini = hhmmToMin(inicioHHMM);
  const fim = hhmmToMin(fimHHMM);
  const ultimoInicio = fim - duracaoMin;
  const out = [];
  for (let t = ini; t <= ultimoInicio; t += passoMin) out.push(minToHHMM(t));
  return out;
}

// Compat: reagendamento
function fillHorasForProf(profNome, selectEl, duracaoMinOpt) {
  const dur = Number(duracaoMinOpt) || 30;
  const passo = STEP_MIN; // ✅ passo fixo

  const fimEfetivo = getFimExpedienteEfetivo();
  const lista = gerarSlotsDoDia(
    HORARIO_FUNCIONAMENTO.inicio || '09:00',
    fimEfetivo || '18:30',
    passo,
    dur
  );

  const target = selectEl || horaSelect;
  if (!target) return;

  target.innerHTML =
    `<option value="">Selecione um horário</option>` +
    lista.map(h => `<option value="${h}">${h}</option>`).join('');
}

function intervalosConflitam(aIni, aFim, bIni, bFim) {
  return aIni < bFim && bIni < aFim;
}

async function getReservasIntervalosByDate(colecao, ymd) {
  const col = (colecao || '').trim();
  if (!col) return [];
  const q = query(collection(db, col), where("data", "==", ymd));
  const snap = await getDocs(q);
  const items = [];
  snap.forEach(d => {
    const row = d.data() || {};
    const h = row.hora;
    if (!h) return;

    // se for bloqueado sem cliente, ainda ocupa o slot (correto)
    const tempo = Number(row.servicoTempoMin ?? row.tempoMin ?? row.duracaoMin);
    const dur = Number.isFinite(tempo) && tempo > 0 ? tempo : 30;
    const ini = hhmmToMin(h);
    items.push({ ini, fim: ini + dur });
  });
  return items;
}

async function preencherHorasDisponiveis() {
  const ymd = dataInput?.value;
  const col = ctx?.colecao;

  const dur = getServicoSelecionadoTempoMin();
  const passo = STEP_MIN; // ✅ passo fixo

  if (!horaSelect) return;

  horaSelect.innerHTML = `<option value="">Selecione um horário</option>`;
  if (!ymd || !col) return;

  // ✅ disponibilidade do dia via Firestore (semana + exceção geral + exceção prof)
  let disp = null;
  try {
    disp = await getDisponibilidadeDia(ymd, ctx.profissionalDocId);
  } catch (e) {
    console.warn('[DISP] Falha ao ler disponibilidade, usando fallback.', e);
  }

  if (disp?.fechado === true) {
    horaSelect.innerHTML = `<option value="">Indisponível nesta data</option>`;
    return;
  }

  const inicioEfetivo = (disp?.inicio || HORARIO_FUNCIONAMENTO.inicio || '09:00');
  const fimEfetivo = (disp?.fim || getFimExpedienteEfetivo() || '18:30');

  const lista = gerarSlotsDoDia(inicioEfetivo, fimEfetivo, passo, dur);

  horaSelect.innerHTML =
    `<option value="">Selecione um horário</option>` +
    lista.map(h => `<option value="${h}">${h}</option>`).join('');

  try {
    const reservas = await getReservasIntervalosByDate(col, ymd);

    for (const opt of horaSelect.options) {
      const val = opt.value;
      if (!val) continue;

      const ini = hhmmToMin(val);
      const fim = ini + dur;

      const ocupado = reservas.some(r => intervalosConflitam(ini, fim, r.ini, r.fim));
      opt.disabled = ocupado;
      opt.classList.toggle('reservado', ocupado);
      if (ocupado && horaSelect.value === val) horaSelect.value = '';
    }
  } catch (e) {
    console.error("Erro ao carregar horários:", e);
    alert("Não foi possível consultar os horários agora.");
  }
}

function resetSelectVisual(selectEl) {
  const target = selectEl || horaSelect;
  if (!target) return;
  for (const opt of target.options) {
    if (!opt.value) continue;
    opt.disabled = false;
    opt.classList.remove('reservado');
  }
}

function weekdayFromYMD(ymd) {
  return new Date(`${ymd}T12:00:00`).getDay();
}

// ===== Disponibilidade via Firestore (semana + exceções) =====
const CFG_SEMANA_DOC = ['config', 'semana'];
const CFG_HORARIOS_DOC = ['config', 'horarios']; // fallback antigo
const CFG_EXCECOES_BASE = ['config', 'excecoes', 'dias']; // config/excecoes/dias/{ymd}

async function readSemana() {
  // Preferencial: config/semana
  try {
    const ref = doc(db, ...CFG_SEMANA_DOC);
    const snap = await getDoc(ref);
    if (snap.exists()) return snap.data() || null;
  } catch { }

  // Fallback: config/horarios
  try {
    const ref = doc(db, ...CFG_HORARIOS_DOC);
    const snap = await getDoc(ref);
    if (snap.exists()) {
      const d = snap.data() || {};
      return {
        weekdays: [1, 2, 3, 4, 5, 6], // seg-sáb
        dayStart: d.inicio || '09:00',
        dayEnd: d.fim || '18:30'
      };
    }
  } catch { }

  return null;
}

async function readExcecaoGeral(ymd) {
  try {
    const ref = doc(db, ...CFG_EXCECOES_BASE, ymd);
    const snap = await getDoc(ref);
    return snap.exists() ? (snap.data() || null) : null;
  } catch {
    return null;
  }
}

async function readExcecaoProf(profDocId, ymd) {
  if (!profDocId) return null;
  try {
    const ref = doc(db, 'profissionais', profDocId, 'excecoes', ymd);
    const snap = await getDoc(ref);
    return snap.exists() ? (snap.data() || null) : null;
  } catch {
    return null;
  }
}

// prioridade: prof > geral > semana
async function getDisponibilidadeDia(ymd, profDocId) {
  const semana = await readSemana();
  const excG = await readExcecaoGeral(ymd);
  const excP = await readExcecaoProf(profDocId, ymd);

  if (excP && excP.fechado === true) return { fechado: true };
  if (excP && excP.inicio && excP.fim) return { fechado: false, inicio: excP.inicio, fim: excP.fim, fonte: 'prof' };

  if (excG && excG.fechado === true) return { fechado: true };
  if (excG && excG.inicio && excG.fim) return { fechado: false, inicio: excG.inicio, fim: excG.fim, fonte: 'geral' };

  const w = weekdayFromYMD(ymd);
  const weekdays = Array.isArray(semana?.weekdays) ? semana.weekdays : [1, 2, 3, 4, 5, 6];
  if (!weekdays.includes(w)) return { fechado: true };

  return {
    fechado: false,
    inicio: semana?.dayStart || HORARIO_FUNCIONAMENTO.inicio || '09:00',
    fim: semana?.dayEnd || HORARIO_FUNCIONAMENTO.fim || '18:30',
    fonte: 'semana'
  };
}

function dataPermitidaParaProf(ymd, profNome = ctx.profissionalNome) {
  if (!ymd) return true;
  const folgas = getDiasFolgaEfetivo();
  const w = weekdayFromYMD(ymd);
  return !folgas.includes(w);
}

async function abrirModalAgendamento() {
  if (!dataInput || !horaSelect) return;

  const hoje = new Date();
  const y = hoje.getFullYear();
  const m = String(hoje.getMonth() + 1).padStart(2, "0");
  const d = String(hoje.getDate()).padStart(2, "0");
  dataInput.min = `${y}-${m}-${d}`;
  dataInput.value = "";

  const folgas = getDiasFolgaEfetivo();
  if (folgas.length) dataInput.title = "Este profissional não atende em alguns dias da semana.";
  else dataInput.removeAttribute('title');

  await preencherHorasDisponiveis();

  horaSelect.value = "";
  resetSelectVisual(horaSelect);

  const display = document.getElementById('servicoDisplay');
  display.value = agendamentoContexto.servico
    ? `${agendamentoContexto.servico.nome} — ${toBRL(agendamentoContexto.servico.valor)}`
    : '';

  abrirModal('modal');
}

// Botões dos profissionais (agendar)
bindProfButtons();

// ===== Firebase =====
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  initializeFirestore,
  doc, getDoc, setDoc, serverTimestamp,
  collection, query, where, getDocs, writeBatch, runTransaction, deleteField
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
 
};
const app = initializeApp(firebaseConfig);
const db = initializeFirestore(app, { experimentalAutoDetectLongPolling: true });

// ===== Carregar Config/Serviços/Profissionais do Firestore =====
async function carregarHorarioFuncionamento() {
  try {
    const ref = doc(db, 'config', 'horarios');
    const snap = await getDoc(ref);
    if (snap.exists()) {
      const d = snap.data() || {};
      if (d.inicio) HORARIO_FUNCIONAMENTO.inicio = d.inicio;
      if (d.fim) HORARIO_FUNCIONAMENTO.fim = d.fim;
    }
  } catch (e) {
    console.warn('[CFG] Não foi possível carregar horário de funcionamento:', e);
  }
  const elTxt = document.getElementById('horarioFuncionamentoTexto');
  if (elTxt) {
    elTxt.textContent = `Seg-Sáb: ${HORARIO_FUNCIONAMENTO.inicio} às ${HORARIO_FUNCIONAMENTO.fim}`;
  }
}

async function carregarServicos() {
  try {
    const snap = await getDocs(collection(db, 'servicos'));
    const arr = [];
    snap.forEach(docu => {
      const d = docu.data() || {};
      arr.push({
        id: docu.id,
        nome: (d.nome || d.servicoNome || '').trim(),
        valor: Number(d.valor ?? d.preco ?? d.servicoValor ?? 0),
        tempoMin: Number(d.tempoMin ?? d.tempo ?? d.duracaoMin ?? 30),
      });
    });
    arr.sort((a, b) => (a.nome || '').localeCompare(b.nome || '', 'pt-BR'));
    SERVICOS_REMOTE = arr.filter(s => s.nome);
  } catch (e) {
    console.warn('[SERVICOS] Não foi possível carregar serviços:', e);
    SERVICOS_REMOTE = null;
  }
}

async function carregarProfissionais() {
  try {
    const snap = await getDocs(collection(db, 'profissionais'));
    const arr = [];
    snap.forEach(docu => {
      const d = docu.data() || {};
      arr.push({
        id: docu.id,
        nome: (d.nome || '').trim(),
        fotoUrl: (d.fotoUrl || d.foto || '').trim(),
        whatsapp: (d.whatsapp || d.wa || '').trim(),
        colecao: (d.colecao || d.collection || (d.slug ? `reservas_${d.slug}` : '')).trim(),

        // ✅ NOVO: opcional por profissional
        fimExpediente: (d.fimExpediente || d.fim || d.horarioFim || '').trim() || null,
        diasFolga: Array.isArray(d.diasFolga) ? d.diasFolga : (Array.isArray(d.folgas) ? d.folgas : null),
      });
    });
    arr.sort((a, b) => (a.nome || '').localeCompare(b.nome || '', 'pt-BR'));
    PROFISSIONAIS_REMOTE = arr.filter(p => p.nome && p.colecao);
  } catch (e) {
    console.warn('[PROFISSIONAIS] Não foi possível carregar profissionais:', e);
    PROFISSIONAIS_REMOTE = null;
  }
}

function getServicosAtivos() {
  const base = Array.isArray(SERVICOS_REMOTE) && SERVICOS_REMOTE.length
    ? SERVICOS_REMOTE.map(s => ({ nome: s.nome, valor: s.valor, tempoMin: s.tempoMin }))
    : SERVICOS.slice(1).map(s => ({ ...s, tempoMin: s.tempoMin ?? 30 }));

  return [{ nome: 'Selecionar...', valor: null, tempoMin: null, placeholder: true }, ...base];
}

function renderProfissionaisNoSite() {
  const container = document.getElementById('profissionaisContainer');
  if (!container) return;

  const lista = Array.isArray(PROFISSIONAIS_REMOTE) && PROFISSIONAIS_REMOTE.length
    ? PROFISSIONAIS_REMOTE
    : [
      { id: '', nome: 'Rodrigo dos Anjos', fotoUrl: './assets/ra-rodrigo.jpg', whatsapp: '5581985082010', colecao: 'reservas_rodrigotorre2', fimExpediente: '18:30', diasFolga: [0] }
    ];

  container.innerHTML = '';

  lista.forEach((p) => {
    const card = document.createElement('div');
    card.className = 'haircut';

    const dataFim = p.fimExpediente ? `data-fim="${p.fimExpediente}"` : '';
    const dataFolga = Array.isArray(p.diasFolga) ? `data-folgas='${JSON.stringify(p.diasFolga)}'` : '';

    // ✅ AJUSTE: FECHAR OS BOTÕES CORRETAMENTE
    card.innerHTML = `
      <img src="${p.fotoUrl || './assets/ra-rodrigo.jpg'}" alt="${p.nome}" class="service-img">
      <div class="haircut-info">
        <strong>${p.nome}</strong>
        <div class="btn-actions">

          <button class="button-contact openModalBtn"
            data-pro="${p.nome}"
            data-prodoc="${p.id || ''}"
            data-wa="${p.whatsapp || ''}"
            data-col="${p.colecao}"
            ${dataFim}
            ${dataFolga}
          >
            <i class='bx bx-calendar'></i> Agende Seu Horário
          </button>

          <button class="button-secondary openReagendaBtn"
            data-pro="${p.nome}"
            data-prodoc="${p.id || ''}"
            data-wa="${p.whatsapp || ''}"
            data-col="${p.colecao}"
            ${dataFim}
            ${dataFolga}
          >
            <i class='bx bx-refresh'></i> Reagendar seu horário
          </button>

        </div>
      </div>
    `;
    container.appendChild(card);
  });

  bindProfButtons();
  bindReagendaButtons(); // ✅ AJUSTE: garantir bind após render
}

// separa o bind para reusar após render
function bindProfButtons() {
  document.querySelectorAll('.openModalBtn').forEach(btn => {
    if (btn.__bound) return;
    btn.__bound = true;
    btn.addEventListener('click', () => {
      ctx.profissionalNome = (btn.dataset.pro || 'Profissional').trim();
      ctx.profissionalDocId = (btn.dataset.prodoc || '').trim() || null;

      ctx.profKey = getProfKeyFromName(ctx.profissionalNome);
      ctx.wa = (btn.dataset.wa || '5581999999999').trim();
      ctx.colecao = (btn.dataset.col || 'reservas').trim();
      ctx.profissionalId = getProfIdFromCollection(ctx.colecao) || null;

      // ✅ NOVO: fim e folgas por profissional via dataset
      ctx.fimExpediente = (btn.dataset.fim || '').trim() || null;
      try {
        ctx.diasFolga = btn.dataset.folgas ? JSON.parse(btn.dataset.folgas) : null;
      } catch {
        ctx.diasFolga = null;
      }

      // se trocou profissional, revalidar data/hora (evita ficar selecionado algo inválido)
      if (dataInput?.value) {
        // recalcula horas com fim novo
        preencherHorasDisponiveis();
      }

      salvarContextoSessao();
      abrirModal('modalCliente');
    });
  });

  // seu reagendamento (abaixo) usa querySelectorAll('.openReagendaBtn') mais embaixo
}

// ✅ AJUSTE: bind do reagendamento precisa acontecer depois que os botões existem no DOM
function bindReagendaButtons() {
  document.querySelectorAll('.openReagendaBtn').forEach(btn => {
    if (btn.__bound) return;
    btn.__bound = true;

    btn.addEventListener('click', () => {
      ctx.profissionalNome = (btn.dataset.pro || 'Profissional').trim();
      ctx.profissionalDocId = (btn.dataset.prodoc || '').trim() || null;

      ctx.profKey = getProfKeyFromName(ctx.profissionalNome);
      ctx.wa = (btn.dataset.wa || '5581999999999').trim();
      ctx.colecao = (btn.dataset.col || 'reservas').trim();
      ctx.profissionalId = getProfIdFromCollection(ctx.colecao) || null;

      ctx.fimExpediente = (btn.dataset.fim || '').trim() || null;
      try {
        ctx.diasFolga = btn.dataset.folgas ? JSON.parse(btn.dataset.folgas) : null;
      } catch {
        ctx.diasFolga = null;
      }

      // prepara modal
      reaResultados.innerHTML = '';
      reaStepBusca.classList.remove('hidden');
      reaStepMover.classList.add('hidden');
      reaNome.value = '';
      reaSobrenome.value = '';

      abrirModal('modalReagendar');
    });
  });
}

// Inicialização do site (dados dinâmicos)
(async function initSite() {
  await Promise.all([
    carregarHorarioFuncionamento(),
    carregarServicos(),
    carregarProfissionais(),
  ]);
  renderProfissionaisNoSite();
})();

const confirmarBtn = document.getElementById('confirmarBtn');
const toKey = (ymd, hhmm) => `${ymd}_${hhmm}`;
const normalizeHora = (h) => (h || '').padStart(5, "0");

// ---- consultar horários ocupados para a data
async function getReservasByDate(colecao, ymd) {
  const col = (colecao || '').trim();
  if (!col) return new Set();
  const q = query(collection(db, col), where("data", "==", ymd));
  const snap = await getDocs(q);
  const horasOcupadas = new Set();
  snap.forEach(d => { const row = d.data(); if (row?.hora) horasOcupadas.add(row.hora); });
  return horasOcupadas;
}
async function carregarIndisponiveis() {
  await preencherHorasDisponiveis();
}

dataInput?.addEventListener('input', async () => {
  if (!dataInput.value) return;

  try {
    const disp = await getDisponibilidadeDia(dataInput.value, ctx.profissionalDocId);
    if (disp?.fechado === true) {
      alert('Indisponível nesta data. Escolha outro dia.');
      dataInput.value = "";
      resetSelectVisual(horaSelect);
      horaSelect.value = "";
    }
  } catch {
    // se falhar, não trava o usuário aqui — deixa o preencherHorasDisponiveis lidar
  }
});

// ===== Modal de Serviço =====
const servicoDisplay = document.getElementById('servicoDisplay');
const servicoLista = document.getElementById('servicoLista');
const servicoCancelar = document.getElementById('servicoCancelar');
const servicoConfirmarWpp = document.getElementById('servicoConfirmarWpp');

const svcSearch = document.getElementById('svcSearch');
let svcFilterText = "";
const norm = (s) => (s || "").normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

function getFilteredServicos() {
  const base = getServicosAtivos().slice(1);
  if (!svcFilterText.trim()) return [{ nome: 'Selecionar...', valor: null, placeholder: true }, ...base];
  const f = norm(svcFilterText);
  const filtered = base.filter(s => norm(s.nome).includes(f));
  return [{ nome: 'Selecionar...', valor: null, placeholder: true }, ...filtered];
}

function renderListaServicos() {
  const items = getFilteredServicos();
  servicoLista.innerHTML = items.map((s) => {
    const checked = agendamentoContexto.servico
      ? (agendamentoContexto.servico.nome === s.nome ? 'checked' : '')
      : (s.placeholder ? 'checked' : '');
    const sub = s.placeholder ? '' : `<div class="svc-muted">${s.valor != null ? toBRL(s.valor) : ''}</div>`;
    return `
      <label class="svc-row" data-nome="${s.nome}">
        <div class="svc-left">
          <div class="svc-name">${s.nome}</div>
          ${sub}
        </div>
        <input class="svc-radio" type="radio" name="svc" value="${s.nome}" ${checked} />
      </label>
    `;
  }).join('');

  servicoLista.querySelectorAll('.svc-row').forEach(row => {
    row.addEventListener('click', () => {
      const radio = row.querySelector('input[type="radio"]');
      if (!radio) return;
      radio.checked = true;
    });
  });
}

async function abrirServico() {
  // ✅ garante serviços remotos carregados (evita parecer que não filtra)
  if (!SERVICOS_REMOTE) {
    await carregarServicos();
  }

  svcFilterText = "";
  if (svcSearch) svcSearch.value = "";
  renderListaServicos();
  abrirModal('servicoModal');
}

servicoDisplay?.addEventListener('click', () => { abrirServico(); });
servicoCancelar?.addEventListener('click', () => fecharModal('servicoModal'));
svcSearch?.addEventListener('input', (e) => { svcFilterText = e.target.value || ""; renderListaServicos(); });

servicoConfirmarWpp?.addEventListener('click', async () => {
  const sel = servicoLista.querySelector('input[name="svc"]:checked');
  if (!sel) { alert('Selecione um serviço.'); return; }
  const nomeSel = sel.value;
  const s = getServicosAtivos().find(x => x.nome === nomeSel);
  if (!s || s.placeholder) { alert('Selecione um serviço.'); return; }

  agendamentoContexto.servico = { nome: s.nome, valor: s.valor, tempoMin: s.tempoMin ?? 30 };
  servicoDisplay.value = `${s.nome} — ${toBRL(s.valor)}`;
  fecharModal('servicoModal');

  await preencherHorasDisponiveis();

  if (dataInput.value && horaSelect.value) {
    confirmarBtn.click();
  }
});

// ===== Confirmar agendamento =====
const confResumo = document.getElementById('confResumo');
const btnOkConfirmacao = document.getElementById('btnOkConfirmacao');
btnOkConfirmacao?.addEventListener('click', () => fecharModal('modalConfirmacao'));

confirmarBtn?.addEventListener('click', async () => {
  const data = dataInput?.value;
  const hora = horaSelect?.value;
  if (!data || !hora) { alert("Selecione data e horário."); return; }

  if (!dataPermitidaParaProf(data, ctx.profissionalNome)) {
    alert(folgaMsg(ctx.profissionalNome));
    return;
  }

  if (!(agendamentoContexto.nomeCliente && agendamentoContexto.sobrenomeCliente)) {
    alert("Informe nome e sobrenome.");
    abrirModal('modalCliente');
    return;
  }
  if (!agendamentoContexto.telefoneCliente || agendamentoContexto.telefoneCliente.length < 12) {
    alert("Informe um telefone válido com DDD.");
    abrirModal('modalCliente');
    return;
  }

  if (!agendamentoContexto.servico) { alert("Selecione o serviço."); abrirServico(); return; }
  if (!ctx.colecao) { alert("Profissional não definido."); return; }
  if (!ctx.profissionalId) ctx.profissionalId = getProfIdFromCollection(ctx.colecao) || null;

  confirmarBtn.disabled = true;
  const originalText = confirmarBtn.textContent;
  confirmarBtn.textContent = "Reservando...";

  try {
    const hhmm = normalizeHora(hora);
    const col = (ctx.colecao || '').trim();
    const ref = doc(db, col, toKey(data, hhmm));
    const snap = await getDoc(ref);
    if (snap.exists()) {
      await carregarIndisponiveis();
      alert("Este horário já foi reservado. Escolha outro, por favor.");
      return;
    }

    const isRaClub = agendamentoContexto?.raclub?.status === 'membro';
    const nomeCompleto = `${agendamentoContexto.nomeCliente} ${agendamentoContexto.sobrenomeCliente}`.trim();

    await setDoc(ref, {
      data,
      hora: hhmm,

      // mantém seus campos
      profissional: ctx.profissionalId || 'rodrigotorre2',
      profissionalNome: ctx.profissionalNome || null,

      clienteNome: agendamentoContexto.nomeCliente,
      clienteSobrenome: agendamentoContexto.sobrenomeCliente,
      clienteNomeCompleto: nomeCompleto,
      clienteNomeLower: (agendamentoContexto.nomeCliente || '').toLowerCase(),
      clienteSobrenomeLower: (agendamentoContexto.sobrenomeCliente || '').toLowerCase(),
      clienteTelefone: agendamentoContexto.telefoneCliente,

      servicoNome: agendamentoContexto.servico?.nome || null,
      servicoValor: agendamentoContexto.servico?.valor ?? null,
      servicoTempoMin: Number(agendamentoContexto.servico?.tempoMin) || 30,

      produtos: agendamentoContexto.produtos || [],
      totalProdutos: agendamentoContexto.totalProdutos || 0,
      raclub: agendamentoContexto.raclub || { status: 'nao' },
      raclubMembro: isRaClub,
      clienteTipo: isRaClub ? 'raclub' : 'cliente',
      tags: isRaClub ? ['raclub'] : [],
      createdAt: serverTimestamp()
    });

    await carregarIndisponiveis();

    const dataBR = new Date(`${data}T00:00:00`).toLocaleDateString('pt-BR');
    const servicoTxt = agendamentoContexto.servico
      ? `${agendamentoContexto.servico.nome} (${toBRL(agendamentoContexto.servico.valor)})`
      : '—';

    let produtosTxt = "Sem produtos adicionais";
    if (agendamentoContexto.produtos.length) {
      const list = agendamentoContexto.produtos.map(p => `${p.nome} (${toBRL(p.preco)})`).join(', ');
      produtosTxt = `${list} • Total: ${toBRL(agendamentoContexto.totalProdutos)}`;
    }

    let raclubTxt = "Não";
    if (agendamentoContexto.raclub.status === 'membro') raclubTxt = "Membro";
    else if (agendamentoContexto.raclub.status === 'assinar' || agendamentoContexto.raclub.status === 'assinar_link') raclubTxt = "Deseja assinar";

    if (confResumo) {
      confResumo.innerHTML = `
        <div class="line"><span class="label">Cliente:</span><span>${nomeCompleto}</span></div>
        <div class="line"><span class="label">Profissional:</span><span>${ctx.profissionalNome}</span></div>
        <div class="line"><span class="label">Profissional ID:</span><span>${ctx.profissionalId}</span></div>
        <div class="line"><span class="label">Data:</span><span>${dataBR}</span></div>
        <div class="line"><span class="label">Hora:</span><span>${hhmm}</span></div>
        <div class="line"><span class="label">Serviço:</span><span>${servicoTxt}</span></div>
        <div class="line"><span class="label">Produtos:</span><span>${produtosTxt}</span></div>
        <div class="line"><span class="label">RA Club:</span><span>${raclubTxt}</span></div>
      `;
    }
    fecharModal('modal');
    abrirModal('modalConfirmacao');
  } catch (err) {
    console.error("[RESERVA]", err);
    alert("Não foi possível concluir a reserva. Tente novamente.");
  } finally {
    confirmarBtn.disabled = false;
    confirmarBtn.textContent = originalText || "Agendar";
  }
});

// Util
function formatDateBR(ymd) {
  if (!ymd) return "";
  const [y, m, d] = ymd.split("-");
  return `${d}/${m}/${y}`;
}

// Fechar modal clicando fora
window.addEventListener('click', (e) => {
  document.querySelectorAll('.modal').forEach(m => {
    if (e.target === m) m.style.display = 'none';
  });
});

// Retomar fluxo pós-checkout
tentarRetomarPosCheckout();

// ---------------------------------------------------------------------
//        REAGENDAMENTO (ATÔMICO: guarda a DocumentReference)
// ---------------------------------------------------------------------
const reaStepBusca = document.getElementById('reaStepBusca');
const reaStepMover = document.getElementById('reaStepMover');
const reaNome = document.getElementById('reaNome');
const reaSobrenome = document.getElementById('reaSobrenome');
const reaBuscarBtn = document.getElementById('reaBuscarBtn');
const reaResultados = document.getElementById('reaResultados');
const reaEscolhido = document.getElementById('reaEscolhido');
const reaData = document.getElementById('reaData');
const reaHora = document.getElementById('reaHora');
const reaConfirmarBtn = document.getElementById('reaConfirmarBtn');

let reservaSelecionada = null;

// abrir modal a partir do cartão do profissional
document.querySelectorAll('.openReagendaBtn').forEach(btn => {
  btn.addEventListener('click', () => {
    ctx.profissionalNome = (btn.dataset.pro || 'Profissional').trim();
    ctx.profissionalDocId = (btn.dataset.prodoc || '').trim() || null;

    ctx.profKey = getProfKeyFromName(ctx.profissionalNome);
    ctx.wa = (btn.dataset.wa || '5581999999999').trim();
    ctx.colecao = (btn.dataset.col || 'reservas').trim();
    ctx.profissionalId = getProfIdFromCollection(ctx.colecao) || null;

    ctx.fimExpediente = (btn.dataset.fim || '').trim() || null;
    try {
      ctx.diasFolga = btn.dataset.folgas ? JSON.parse(btn.dataset.folgas) : null;
    } catch {
      ctx.diasFolga = null;
    }

    reaResultados.innerHTML = '';
    reaStepBusca.classList.remove('hidden');
    reaStepMover.classList.add('hidden');
    reaNome.value = '';
    reaSobrenome.value = '';

    abrirModal('modalReagendar');
  });
});

async function buscarAgendamentosPorNome(colecao, nomeLower, sobrenomeLower) {
  const q1 = query(collection(db, colecao), where('clienteNomeLower', '==', nomeLower));
  const snap = await getDocs(q1);
  const out = [];
  snap.forEach(d => {
    const row = d.data();
    if ((row?.clienteSobrenomeLower || '') === sobrenomeLower) {
      out.push({ id: d.id, ref: d.ref, ...row });
    }
  });
  return out;
}

function renderResultados(list) {
  if (!list.length) {
    reaResultados.innerHTML = `<div class="muted">Nenhum agendamento encontrado para esse nome.</div>`;
    return;
  }
  list.sort((a, b) => (a.data + a.hora).localeCompare(b.data + b.hora));
  reaResultados.innerHTML = list.map((r, idx) => `
    <div class="rea-item">
      <div class="rea-line"><strong>Data:</strong> ${formatDateBR(r.data)} • <strong>Hora:</strong> ${r.hora}</div>
      <div class="rea-line"><strong>Serviço:</strong> ${r.servicoNome || '—'}</div>
      <button type="button" data-i="${idx}" class="reaSelectBtn">Selecionar</button>
    </div>
  `).join('');

  document.querySelectorAll('.reaSelectBtn').forEach(btn => {
    btn.addEventListener('click', () => {
      const i = Number(btn.dataset.i);
      const chosen = list[i];
      reservaSelecionada = {
        idAntigo: chosen.id,
        refAntigo: chosen.ref,
        dataAntiga: chosen.data,
        horaAntiga: chosen.hora,
        docData: chosen
      };

      const hoje = new Date();
      const y = hoje.getFullYear();
      const m = String(hoje.getMonth() + 1).padStart(2, "0");
      const d = String(hoje.getDate()).padStart(2, "0");
      reaData.min = `${y}-${m}-${d}`;
      reaData.value = '';

      reaEscolhido.innerHTML = `
        <strong>Agendamento atual:</strong> ${formatDateBR(chosen.data)} às ${chosen.hora}
        ${chosen.servicoNome ? ` • ${chosen.servicoNome}` : ''}
      `;

      fillHorasForProf(
        ctx.profissionalNome,
        reaHora,
        reservaSelecionada?.docData?.servicoTempoMin || 30
      );

      resetSelectVisual(reaHora);

      reaStepBusca.classList.add('hidden');
      reaStepMover.classList.remove('hidden');
    });
  });
}

reaBuscarBtn?.addEventListener('click', async () => {
  const nome = (reaNome.value || '').trim().toLowerCase();
  const sobrenome = (reaSobrenome.value || '').trim().toLowerCase();

  if (!nome || !sobrenome) {
    alert('Informe nome e sobrenome para buscar.');
    return;
  }
  if (!ctx.colecao) { alert('Profissional não definido.'); return; }

  try {
    reaResultados.innerHTML = 'Carregando...';
    const itens = await buscarAgendamentosPorNome(ctx.colecao, nome, sobrenome);
    renderResultados(itens);
  } catch (e) {
    console.error('[Reagendar][buscar]', e);
    reaResultados.innerHTML = '<div class="muted">Erro ao buscar. Tente novamente.</div>';
  }
});

reaData?.addEventListener('change', async () => {
  if (!reaData.value) return;

  const ymd = reaData.value;
  const dur = Number(reservaSelecionada?.docData?.servicoTempoMin) || 30;
  const passo = STEP_MIN;

  // 1) disponibilidade do dia (semana + exceções)
  try {
    const disp = await getDisponibilidadeDia(ymd, ctx.profissionalDocId);
    if (disp?.fechado === true) {
      alert('Indisponível nesta data. Escolha outro dia.');
      reaData.value = '';
      resetSelectVisual(reaHora);
      reaHora.value = '';
      return;
    }
  } catch {
    // segue — erro será tratado no grid
  }

  // 2) gera slots válidos para a duração do serviço
  const inicioEfetivo = HORARIO_FUNCIONAMENTO.inicio || '09:00';
  const fimEfetivo = getFimExpedienteEfetivo() || '18:30';

  const lista = gerarSlotsDoDia(inicioEfetivo, fimEfetivo, passo, dur);

  reaHora.innerHTML =
    `<option value="">Selecione um horário</option>` +
    lista.map(h => `<option value="${h}">${h}</option>`).join('');

  // 3) bloqueia por conflito de intervalo
  try {
    const reservas = await getReservasIntervalosByDate(ctx.colecao, ymd);

    for (const opt of reaHora.options) {
      const val = opt.value;
      if (!val) continue;

      const ini = hhmmToMin(val);
      const fim = ini + dur;

      const conflita = reservas.some(r => intervalosConflitam(ini, fim, r.ini, r.fim));

      const eMesmoSlot =
        reservaSelecionada &&
        reservaSelecionada.dataAntiga === ymd &&
        reservaSelecionada.horaAntiga === val;

      const disabled = conflita && !eMesmoSlot;
      opt.disabled = disabled;
      opt.classList.toggle('reservado', disabled);
    }
  } catch (e) {
    console.error('[Reagendar][disponibilidade]', e);
    alert('Não foi possível consultar horários desta data.');
  }
});

function sanitize(obj) {
  Object.keys(obj).forEach(k => { if (obj[k] === undefined) delete obj[k]; });
  return obj;
}

function buildPayloadFromOld(oldDoc = {}, overrides = {}) {
  const nomeCompleto = oldDoc.clienteNomeCompleto ||
    [oldDoc.clienteNome, oldDoc.clienteSobrenome].filter(Boolean).join(' ') || '';

  return sanitize({
    ...oldDoc,
    data: overrides.data,
    hora: normalizeHora(overrides.hora),
    profissional: overrides.profissionalId || oldDoc.profissional,
    profissionalNome: overrides.profissionalNome || oldDoc.profissionalNome || null,
    reagendadoDe: overrides.reagendadoDe || null,
    updatedAt: serverTimestamp(),
    createdAt: oldDoc.createdAt,
    clienteNomeCompleto: nomeCompleto
  });
}

reaConfirmarBtn?.addEventListener('click', async () => {
  if (!reservaSelecionada || !reservaSelecionada.refAntigo) {
    alert('Selecione um agendamento para reagendar.');
    return;
  }
  const novaData = reaData.value;
  const novaHora = normalizeHora(reaHora.value);

  if (!novaData || !novaHora) { alert('Selecione a nova data e hora.'); return; }
  if (!dataPermitidaParaProf(novaData, ctx.profissionalNome)) { alert(folgaMsg(ctx.profissionalNome)); return; }

  const col = (ctx.colecao || '').trim();
  const idNovo = toKey(novaData, novaHora);
  const refNovo = doc(db, col, idNovo);
  const refAntigo = reservaSelecionada.refAntigo;

  const mudouSlot = !(reservaSelecionada.dataAntiga === novaData && reservaSelecionada.horaAntiga === novaHora);

  if (!ctx.profissionalId) ctx.profissionalId = getProfIdFromCollection(ctx.colecao) || null;

  try {
    await runTransaction(db, async (tx) => {
      const oldSnap = await tx.get(refAntigo);
      if (!oldSnap.exists()) throw new Error('Agendamento original não existe mais.');

      if (mudouSlot) {
        const newSnap = await tx.get(refNovo);
        if (newSnap.exists()) throw new Error('Este novo horário já está reservado.');
      }

      const base = oldSnap.data() || {};

      if (mudouSlot) {
        const payloadNew = buildPayloadFromOld(base, {
          data: novaData,
          hora: novaHora,
          profissionalId: ctx.profissionalId || 'rodrigotorre2',
          profissionalNome: ctx.profissionalNome || null,
          reagendadoDe: refAntigo.id
        });
        tx.set(refNovo, payloadNew);
        tx.delete(refAntigo);
      } else {
        const payloadSame = buildPayloadFromOld(base, {
          data: novaData,
          hora: novaHora,
          profissionalId: ctx.profissionalId || 'rodrigotorre2',
          profissionalNome: ctx.profissionalNome || null,
          reagendadoDe: refAntigo.id
        });
        payloadSame.bloqueado = deleteField();
        tx.set(refAntigo, payloadSame, { merge: true });
      }
    });
  } catch (txErr) {
    console.warn('[Reagendar][transaction falhou], tentando fallback:', txErr?.message || txErr);
    try {
      const oldSnap = await getDoc(refAntigo);
      if (!oldSnap.exists()) throw new Error('Agendamento original não existe mais.');

      if (mudouSlot) {
        const newSnap = await getDoc(refNovo);
        if (newSnap.exists()) throw new Error('Este novo horário já está reservado.');
        const base = oldSnap.data() || {};
        const payload = buildPayloadFromOld(base, {
          data: novaData,
          hora: novaHora,
          profissionalId: ctx.profissionalId || 'rodrigotorre2',
          profissionalNome: ctx.profissionalNome || null,
          reagendadoDe: refAntigo.id
        });
        const batch = writeBatch(db);
        batch.set(refNovo, payload);
        batch.delete(refAntigo);
        await batch.commit();
      } else {
        const base = oldSnap.data() || {};
        const payload = buildPayloadFromOld(base, {
          data: novaData,
          hora: novaHora,
          profissionalId: ctx.profissionalId || 'rodrigotorre2',
          profissionalNome: ctx.profissionalNome || null,
          reagendadoDe: refAntigo.id
        });
        payload.bloqueado = deleteField();
        await setDoc(refAntigo, payload, { merge: true });
      }
    } catch (fbErr) {
      console.error('[Reagendar][fallback erro]', fbErr);
      alert(fbErr?.message || 'Não foi possível reagendar agora. Tente novamente.');
      return;
    }
  }

  try {
    const base = reservaSelecionada.docData || {};
    const dataBR = new Date(`${novaData}T00:00:00`).toLocaleDateString('pt-BR');
    if (confResumo) {
      confResumo.innerHTML = `
        <div class="line"><span class="label">Cliente:</span><span>${base.clienteNomeCompleto || (base.clienteNome + ' ' + base.clienteSobrenome)}</span></div>
        <div class="line"><span class="label">Profissional:</span><span>${ctx.profissionalNome}</span></div>
        <div class="line"><span class="label">Profissional ID:</span><span>${ctx.profissionalId}</span></div>
        <div class="line"><span class="label">Nova data:</span><span>${dataBR}</span></div>
        <div class="line"><span class="label">Nova hora:</span><span>${novaHora}</span></div>
        <div class="line"><span class="label">Serviço:</span><span>${base.servicoNome || '—'}</span></div>
      `;
    }
    fecharModal('modalReagendar');
    abrirModal('modalConfirmacao');
  } catch (e) {
    console.error('[Reagendar][resumo]', e);
  }
});