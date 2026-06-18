let produtos = [];
let custosGlobais = [];

function fmt(v) {
  return 'R$ ' + Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

async function carregar() {
  try {
    const res = await fetch('/api/dados');
    const data = await res.json();
    produtos = data.produtos || [];
    custosGlobais = data.custosGlobais || [];
  } catch (e) {
    console.error('Erro ao carregar dados:', e);
  }
  renderizar();
  renderizarCustosGlobais();
}

async function salvar() {
  try {
    await fetch('/api/dados', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ produtos, custosGlobais }, null, 2)
    });
  } catch (e) {
    console.error('Erro ao salvar dados:', e);
  }
}

/**
 * Calcula custo, preço de venda sugerido, lucro e markup de um produto.
 * Custo = materiais + investimento individual do produto.
 * Custos globais NÃO entram no cálculo — são só informativos.
 *
 * Margem sobre o preço de venda:
 *   precoVenda = custoTotal / (1 - margem/100)
 *   Ex.: custo R$10, margem 20% → preço = R$12,50, lucro = R$2,50
 */
function calcProduto(p) {
  const custoMateriais = (p.materiais || []).reduce(
    (s, m) => s + (Number(m.qtd) || 0) * (Number(m.valorUnit) || 0), 0
  );
  const investimento = Number(p.investimento) || 0;
  const custoTotal   = custoMateriais + investimento;

  let margem = Number(p.margem);
  if (isNaN(margem)) margem = 30;
  if (margem < 0)    margem = 0;
  if (margem >= 100) margem = 99;

  const precoVenda = custoTotal > 0 ? custoTotal / (1 - margem / 100) : 0;
  const lucro      = precoVenda - custoTotal;
  const markup     = custoTotal > 0 ? ((precoVenda / custoTotal) - 1) * 100 : 0;

  return { custoMateriais, investimento, custoTotal, margem, precoVenda, lucro, markup };
}

// ── Custos Globais (informativos) ──────────────────────────────────

const TIPOS_CUSTO = [
  { valor: 'luz',        label: 'Conta de Luz',      icon: 'ti-bolt' },
  { valor: 'agua',       label: 'Conta de Água',     icon: 'ti-droplet' },
  { valor: 'internet',   label: 'Internet',           icon: 'ti-wifi' },
  { valor: 'aluguel',    label: 'Aluguel',            icon: 'ti-home' },
  { valor: 'tempo',      label: 'Tempo Trabalhado',   icon: 'ti-clock' },
  { valor: 'transporte', label: 'Transporte',         icon: 'ti-car' },
  { valor: 'embalagem',  label: 'Embalagens Gerais',  icon: 'ti-package' },
  { valor: 'marketing',  label: 'Marketing',          icon: 'ti-speakerphone' },
  { valor: 'outros',     label: 'Outros',             icon: 'ti-dots-circle-horizontal' },
];

function getTipoCusto(tipo) {
  return TIPOS_CUSTO.find(t => t.valor === tipo) || TIPOS_CUSTO[TIPOS_CUSTO.length - 1];
}

function adicionarCustoGlobal() {
  const tipoEl  = document.getElementById('cg-tipo');
  const nomeEl  = document.getElementById('cg-nome');
  const valorEl = document.getElementById('cg-valor');

  const tipo  = tipoEl.value;
  const nome  = nomeEl.value.trim() || getTipoCusto(tipo).label;
  const valor = parseFloat(valorEl.value);

  if (isNaN(valor) || valor < 0) return;

  custosGlobais.push({ id: Date.now(), tipo, nome, valor });
  nomeEl.value  = '';
  valorEl.value = '';

  const panel = document.getElementById('form-panel-global');
  if (panel) panel.classList.remove('open');

  salvar();
  renderizarCustosGlobais();
}

function removerCustoGlobal(idx) {
  custosGlobais.splice(idx, 1);
  salvar();
  renderizarCustosGlobais();
}

function editarCustoGlobal(idx, campo, v) {
  if (campo === 'valor') custosGlobais[idx].valor = parseFloat(v) || 0;
  else if (campo === 'nome') custosGlobais[idx].nome = v;
  salvar();
  renderizarCustosGlobais();
}

function renderizarCustosGlobais() {
  const lista = document.getElementById('lista-custos-globais');
  if (!lista) return;

  const totalGlobal = custosGlobais.reduce((s, c) => s + (Number(c.valor) || 0), 0);

  const elTotalGlobal = document.getElementById('total-custos-globais');
  if (elTotalGlobal) elTotalGlobal.textContent = fmt(totalGlobal);

  if (custosGlobais.length === 0) {
    lista.innerHTML = '<div class="cg-empty"><i class="ti ti-receipt-off"></i> Nenhum custo global cadastrado</div>';
    return;
  }

  lista.innerHTML = custosGlobais.map((c, idx) => {
    const info = getTipoCusto(c.tipo);
    const pct  = totalGlobal > 0 ? ((c.valor / totalGlobal) * 100).toFixed(1) : '0.0';
    return `
    <div class="cg-item">
      <div class="cg-icon-wrap"><i class="ti ${info.icon}"></i></div>
      <div class="cg-info">
        <input class="cg-nome-edit" type="text" value="${c.nome}"
          onchange="editarCustoGlobal(${idx}, 'nome', this.value)" />
        <span class="cg-tipo-badge">${info.label}</span>
      </div>
      <div class="cg-valor-wrap">
        <span class="cg-prefix">R$</span>
        <input class="cg-valor-edit" type="number" min="0" step="0.01"
          value="${(Number(c.valor) || 0).toFixed(2)}"
          onchange="editarCustoGlobal(${idx}, 'valor', this.value)" />
      </div>
      <span class="cg-pct">${pct}% do total</span>
      <button class="btn-icon" onclick="removerCustoGlobal(${idx})" title="Remover">
        <i class="ti ti-trash"></i>
      </button>
    </div>`;
  }).join('');
}

// ── Produtos ──────────────────────────────────────────────

function renderizar() {
  let custoGeral = 0, lucroGeral = 0;
  produtos.forEach(p => {
    const c = calcProduto(p);
    custoGeral += c.custoTotal;
    lucroGeral += c.lucro;
  });

  const elTotalProdutos = document.getElementById('total-produtos');
  const elCustoGeral    = document.getElementById('custo-geral');
  const elLucroGeral    = document.getElementById('lucro-geral');
  if (elTotalProdutos) elTotalProdutos.textContent = produtos.length;
  if (elCustoGeral)    elCustoGeral.textContent    = fmt(custoGeral);
  if (elLucroGeral)    elLucroGeral.textContent    = fmt(lucroGeral);

  const lista = document.getElementById('lista-produtos');
  if (!lista) return;

  if (produtos.length === 0) {
    lista.innerHTML = '<div class="empty-state"><i class="ti ti-package-off"></i><br>Nenhum produto cadastrado ainda</div>';
    return;
  }

  lista.innerHTML = produtos.map((p, pi) => {
    const { custoMateriais, investimento, custoTotal, margem, precoVenda, lucro, markup } = calcProduto(p);

    const materiaisHtml = (p.materiais || []).map((m, mi) => {
      const subtotal = (Number(m.qtd) || 0) * (Number(m.valorUnit) || 0);
      return `
        <div class="material-row">
          <input class="mat-nome-edit" type="text" value="${m.nome}" title="Nome do material"
            onchange="editarMaterial(${pi}, ${mi}, 'nome', this.value)" />
          <div class="mat-vals">
            <span class="mat-prefix">R$</span>
            <input class="mat-valor-edit" type="number" min="0" step="0.01" value="${(Number(m.valorUnit) || 0).toFixed(2)}"
              title="Valor unitário" onchange="editarMaterial(${pi}, ${mi}, 'valorUnit', this.value)" />
            <span class="mat-x">x</span>
            <input class="mat-qtd-edit" type="number" min="0" step="1" value="${Number(m.qtd) || 0}"
              title="Quantidade" onchange="editarMaterial(${pi}, ${mi}, 'qtd', this.value)" />
          </div>
          <span class="mat-subtotal">${fmt(subtotal)}</span>
          <button class="btn-icon" onclick="removerMaterial(${pi}, ${mi})" title="Remover material">
            <i class="ti ti-trash"></i>
          </button>
        </div>`;
    }).join('');

    return `
    <div class="product-card" data-index="${pi}">
      <div class="product-header">
        <input class="product-nome-edit" type="text" value="${p.nome}" title="Nome do produto"
          onchange="editarNomeProduto(${pi}, this.value)" />
        <div class="product-header-badges">
          <span class="badge-custo"><i class="ti ti-coin"></i> Custo: ${fmt(custoTotal)}</span>
          <span class="badge-venda"><i class="ti ti-tag"></i> Venda sugerida: ${fmt(precoVenda)}</span>
        </div>
        <button class="btn-icon btn-remove-produto" onclick="removerProduto(${pi})" title="Remover produto">
          <i class="ti ti-trash"></i>
        </button>
      </div>

      <div class="materiais-lista">
        ${materiaisHtml || '<div class="materiais-empty">Nenhum material adicionado ainda</div>'}
      </div>

      <!-- Investimento individual -->
      <div class="investimento-row">
        <div class="investimento-left">
          <i class="ti ti-cash"></i>
          <span class="investimento-label">Meu investimento neste produto</span>
          <span class="investimento-hint">(valor que quero recuperar)</span>
        </div>
        <div class="investimento-input-wrap">
          <span class="mat-prefix">R$</span>
          <input type="number" class="investimento-edit" min="0" step="0.01"
            value="${investimento > 0 ? investimento.toFixed(2) : ''}"
            placeholder="0,00"
            title="Valor de investimento individual"
            onchange="editarInvestimento(${pi}, this.value)" />
        </div>
        ${investimento > 0 ? `<span class="investimento-badge">+${fmt(investimento)} no custo</span>` : ''}
      </div>

      <div class="material-add-row">
        <input type="text" class="mat-add-nome" placeholder="Nome do material" />
        <span class="mat-prefix">R$</span>
        <input type="number" class="mat-add-valor" placeholder="Valor" min="0" step="0.01" />
        <span class="mat-x">x</span>
        <input type="number" class="mat-add-qtd" placeholder="Qtd" min="1" step="1" value="1" />
        <button class="btn-add-mini" onclick="adicionarMaterial(${pi})">
          <i class="ti ti-plus"></i> Material
        </button>
      </div>

      <div class="margem-row">
        <div class="margem-input-group">
          <i class="ti ti-percentage"></i>
          <label>Quero ganhar</label>
          <input type="number" class="margem-edit" min="0" max="99" step="1" value="${margem}"
            title="Margem de lucro desejada" onchange="editarMargem(${pi}, this.value)" />
          <span>% de margem</span>
        </div>
        <div class="margem-resultados">
          <div class="margem-res-item">
            <span class="margem-res-label">Custo materiais</span>
            <strong class="margem-res-markup">${fmt(custoMateriais)}</strong>
          </div>
          ${investimento > 0 ? `
          <div class="margem-res-item">
            <span class="margem-res-label">Investimento</span>
            <strong style="font-family:var(--mono);font-size:14px;color:var(--blue)">${fmt(investimento)}</strong>
          </div>` : ''}
          <div class="margem-res-item">
            <span class="margem-res-label">Custo total</span>
            <strong style="font-family:var(--mono);font-size:14px;color:var(--red)">${fmt(custoTotal)}</strong>
          </div>
          <div class="margem-res-item">
            <span class="margem-res-label">Preço de venda</span>
            <strong class="margem-res-venda">${fmt(precoVenda)}</strong>
          </div>
          <div class="margem-res-item">
            <span class="margem-res-label">Lucro líquido</span>
            <strong class="margem-res-lucro">${fmt(lucro)}</strong>
          </div>
          <div class="margem-res-item">
            <span class="margem-res-label">Markup s/ custo</span>
            <strong class="margem-res-markup">${markup.toFixed(1)}%</strong>
          </div>
        </div>
      </div>
    </div>`;
  }).join('');
}

function adicionarProduto() {
  const nomeInput = document.getElementById('nome-produto');
  const nome = nomeInput.value.trim();
  if (!nome) return;

  produtos.push({ id: Date.now(), nome, margem: 30, investimento: 0, materiais: [] });

  nomeInput.value = '';
  const panel = document.getElementById('form-panel-produto');
  if (panel) panel.classList.remove('open');

  salvar(); renderizar();
}

function removerProduto(pi) {
  if (!confirm(`Remover o produto "${produtos[pi].nome}"?`)) return;
  produtos.splice(pi, 1);
  salvar(); renderizar();
}

function editarNomeProduto(pi, v) {
  produtos[pi].nome = v;
  salvar();
}

function editarMargem(pi, v) {
  let margem = parseFloat(v);
  if (isNaN(margem)) margem = 0;
  if (margem < 0)    margem = 0;
  if (margem >= 100) margem = 99;
  produtos[pi].margem = margem;
  salvar(); renderizar();
}

function editarInvestimento(pi, v) {
  const val = parseFloat(v);
  produtos[pi].investimento = isNaN(val) || val < 0 ? 0 : val;
  salvar(); renderizar();
}

function adicionarMaterial(pi) {
  const card = document.querySelector(`.product-card[data-index="${pi}"]`);
  if (!card) return;

  const nomeEl  = card.querySelector('.mat-add-nome');
  const valorEl = card.querySelector('.mat-add-valor');
  const qtdEl   = card.querySelector('.mat-add-qtd');

  const nome  = nomeEl.value.trim();
  const valor = parseFloat(valorEl.value);
  const qtd   = parseFloat(qtdEl.value) || 1;

  if (!nome || isNaN(valor) || valor < 0) return;

  if (!produtos[pi].materiais) produtos[pi].materiais = [];
  produtos[pi].materiais.push({ id: Date.now(), nome, valorUnit: valor, qtd });

  salvar(); renderizar();
}

function removerMaterial(pi, mi) {
  produtos[pi].materiais.splice(mi, 1);
  salvar(); renderizar();
}

function editarMaterial(pi, mi, campo, v) {
  const m = produtos[pi].materiais[mi];
  if (campo === 'nome')      m.nome      = v;
  else if (campo === 'valorUnit') m.valorUnit = parseFloat(v) || 0;
  else if (campo === 'qtd')  m.qtd       = parseFloat(v) || 0;
  salvar(); renderizar();
}

document.addEventListener('DOMContentLoaded', () => {
  carregar();
  const nomeProdutoInput = document.getElementById('nome-produto');
  if (nomeProdutoInput) {
    nomeProdutoInput.addEventListener('keydown', e => { if (e.key === 'Enter') adicionarProduto(); });
  }
  const cgValorInput = document.getElementById('cg-valor');
  if (cgValorInput) {
    cgValorInput.addEventListener('keydown', e => { if (e.key === 'Enter') adicionarCustoGlobal(); });
  }
});

// ── Update Box ──────────────────────────────────────────────
function fmtBytes(bytes) {
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + ' KB/s';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB/s';
}
function fmtMB(bytes) {
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}
function showUpdateBox() {
  document.getElementById('update-box').classList.add('visible');
}
function instalarUpdate() {
  if (window.updater) window.updater.installUpdate();
}

if (window.updater) {
  window.updater.onUpdateAvailable((data) => {
    document.getElementById('update-title').textContent = `Nova versão ${data.version}`;
    document.getElementById('update-subtitle').textContent = 'Iniciando download...';
    document.getElementById('update-icon').className = 'update-icon downloading';
    showUpdateBox();
  });
  window.updater.onUpdateProgress((data) => {
    const bar = document.getElementById('update-bar');
    const pct = document.getElementById('update-pct');
    const speed = document.getElementById('update-speed');
    const transferred = document.getElementById('update-transferred');
    showUpdateBox();
    bar.style.width = data.percent + '%';
    pct.textContent = data.percent + '%';
    speed.textContent = fmtBytes(data.bytesPerSecond);
    transferred.textContent = fmtMB(data.transferred) + ' / ' + fmtMB(data.total);
    document.getElementById('update-subtitle').textContent = 'Baixando atualização...';
    document.getElementById('update-icon').className = 'update-icon downloading';
  });
  window.updater.onUpdateDownloaded((data) => {
    const bar = document.getElementById('update-bar');
    const restart = document.getElementById('btn-restart');
    const wrap = document.getElementById('update-progress-wrap');
    bar.style.width = '100%';
    bar.classList.add('done');
    document.getElementById('update-pct').textContent = '100%';
    document.getElementById('update-speed').textContent = '';
    document.getElementById('update-transferred').textContent = '';
    document.getElementById('update-title').textContent = `Versão ${data.version} pronta`;
    document.getElementById('update-subtitle').textContent = 'Download concluído ✓';
    document.getElementById('update-icon').className = 'update-icon done';
    document.getElementById('update-icon').innerHTML = '<i class="ti ti-check"></i>';
    setTimeout(() => { wrap.style.display = 'none'; restart.classList.add('visible'); }, 800);
    showUpdateBox();
  });
  window.updater.onUpdateError((data) => {
    const errEl = document.getElementById('update-error-msg');
    errEl.textContent = 'Erro: ' + data.message;
    errEl.style.display = 'block';
    document.getElementById('update-progress-wrap').style.display = 'none';
    document.getElementById('update-icon').className = 'update-icon error';
    document.getElementById('update-icon').innerHTML = '<i class="ti ti-alert-triangle"></i>';
    showUpdateBox();
  });
}
