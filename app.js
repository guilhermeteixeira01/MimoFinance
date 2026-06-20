let produtos = [];
let custosGlobais = [];
let materiaisGlobais = [];

function fmt(v) {
  return 'R$ ' + Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

async function carregar() {
  try {
    const res = await fetch('/api/dados');
    const data = await res.json();
    produtos = data.produtos || [];
    custosGlobais = data.custosGlobais || [];
    materiaisGlobais = data.materiaisGlobais || [];
  } catch (e) {
    console.error('Erro ao carregar dados:', e);
  }
  renderizar();
  renderizarCustosGlobais();
  renderizarMateriaisGlobais();
}

async function salvar() {
  try {
    await fetch('/api/dados', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ produtos, custosGlobais, materiaisGlobais }, null, 2)
    });
  } catch (e) {
    console.error('Erro ao salvar dados:', e);
  }
}

/**
 * Retorna o custo fixo diário total (total mensal ÷ 30).
 */
function getCustoFixoDiario() {
  return custosGlobais.reduce((s, c) => s + (Number(c.valor) || 0), 0) / 30;
}

/**
 * Calcula todos os valores de um produto.
 *
 * custoTotal = materiais + investimento + rateio de custos fixos por unidade
 *   → rateio = (custo fixo diário) / (unidades por dia definidas no produto)
 * precoVenda = custoTotal / (1 - margem/100)
 *   → margem é sempre sobre o preço de venda (não sobre o custo)
 *   → Ex.: custo R$10, margem 30% → preço = R$14,29; lucro = R$4,29
 *
 * retornoInvestimento = quantas unidades precisa vender para cobrir só o investimento
 */
function calcProduto(p) {
  const custoMateriais = (p.materiais || []).reduce(
    (s, m) => s + (Number(m.qtd) || 0) * (Number(m.valorUnit) || 0), 0
  );
  const investimento = Number(p.investimento) || 0;

  // Rateio de custo fixo: custo fixo diário ÷ unidades/dia deste produto
  // (só entra no cálculo se o toggle "rateioAtivo" estiver ligado)
  const rateioAtivo = p.rateioAtivo !== false;
  const unidadesPorDia = Number(p.unidadesPorDia) || 0;
  const custoFixoDiario = getCustoFixoDiario();
  const rateioCustoFixo = (rateioAtivo && unidadesPorDia > 0 && custoFixoDiario > 0)
    ? custoFixoDiario / unidadesPorDia
    : 0;

  const custoTotal = custoMateriais + investimento + rateioCustoFixo;

  let margem = Number(p.margem);
  if (isNaN(margem)) margem = 30;
  if (margem < 0)    margem = 0;
  if (margem >= 100) margem = 99;

  const precoVenda = custoTotal > 0 ? custoTotal / (1 - margem / 100) : 0;
  const lucro      = precoVenda - custoTotal;
  const markup     = custoTotal > 0 ? ((precoVenda / custoTotal) - 1) * 100 : 0;

  // Quantas unidades vender para recuperar o investimento
  const unidadesParaRecuperar = (lucro > 0 && investimento > 0)
    ? Math.ceil(investimento / lucro)
    : 0;

  return { custoMateriais, investimento, rateioAtivo, rateioCustoFixo, custoTotal, margem, precoVenda, lucro, markup, unidadesParaRecuperar };
}

// ── Abas ──────────────────────────────────────────────────
function mostrarAba(aba, navEl) {
  document.querySelectorAll('.aba-content').forEach(el => el.style.display = 'none');
  document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
  const target = document.getElementById('aba-' + aba);
  if (target) target.style.display = '';
  if (navEl) navEl.classList.add('active');
}

// ── Materiais Globais ──────────────────────────────────────
function adicionarMaterialGlobal() {
  const nomeEl   = document.getElementById('mg-nome');
  const valorEl  = document.getElementById('mg-valor');
  const unidEl   = document.getElementById('mg-unidade');

  const nome   = nomeEl.value.trim();
  const valor  = parseFloat(valorEl.value);
  const unidade = unidEl.value.trim() || 'un';

  if (!nome || isNaN(valor) || valor < 0) return;

  materiaisGlobais.push({ id: Date.now(), nome, valorUnit: valor, unidade });
  nomeEl.value  = '';
  valorEl.value = '';
  unidEl.value  = '';

  document.getElementById('form-panel-mat-global').classList.remove('open');
  salvar();
  renderizarMateriaisGlobais();
}

function removerMaterialGlobal(idx) {
  if (!confirm(`Remover "${materiaisGlobais[idx].nome}"? Ele continuará nos produtos onde foi usado.`)) return;
  materiaisGlobais.splice(idx, 1);
  salvar();
  renderizarMateriaisGlobais();
  renderizar(); // atualiza dropdown nos produtos abertos
}

function editarMaterialGlobal(idx, campo, v) {
  if (campo === 'nome')      materiaisGlobais[idx].nome     = v;
  if (campo === 'valorUnit') materiaisGlobais[idx].valorUnit = parseFloat(v) || 0;
  if (campo === 'unidade')   materiaisGlobais[idx].unidade  = v;
  salvar();
  renderizarMateriaisGlobais();
  renderizar(); // re-calcula produtos que usam este material
}

function renderizarMateriaisGlobais() {
  const lista = document.getElementById('lista-materiais-globais');
  if (!lista) return;

  if (materiaisGlobais.length === 0) {
    lista.innerHTML = '<div class="cg-empty"><i class="ti ti-packages"></i> Nenhum material cadastrado ainda</div>';
    return;
  }

  lista.innerHTML = materiaisGlobais.map((m, idx) => `
    <div class="cg-item mg-item">
      <div class="cg-icon-wrap" style="background:rgba(255,45,135,0.12);border:1px solid rgba(255,45,135,0.28);color:var(--pink2)">
        <i class="ti ti-box"></i>
      </div>
      <div class="cg-info" style="flex:1">
        <input class="cg-nome-edit" type="text" value="${m.nome}"
          onchange="editarMaterialGlobal(${idx}, 'nome', this.value)" />
        <span class="cg-tipo-badge">
          <input class="mg-unidade-edit" type="text" value="${m.unidade || 'un'}" title="Unidade"
            onchange="editarMaterialGlobal(${idx}, 'unidade', this.value)" />
        </span>
      </div>
      <div class="cg-valor-wrap">
        <span class="cg-prefix">R$</span>
        <input class="cg-valor-edit" type="number" min="0" step="0.01"
          value="${(Number(m.valorUnit) || 0).toFixed(2)}"
          onchange="editarMaterialGlobal(${idx}, 'valorUnit', this.value)" />
      </div>
      <button class="btn-icon" onclick="removerMaterialGlobal(${idx})" title="Remover">
        <i class="ti ti-trash"></i>
      </button>
    </div>`).join('');
}

// ── Adicionar material do catálogo a um produto ────────────
function adicionarMaterialDoCatalogo(pi) {
  const card = document.querySelector(`.product-card[data-index="${pi}"]`);
  if (!card) return;
  const sel = card.querySelector('.mat-catalogo-sel');
  const qtdEl = card.querySelector('.mat-catalogo-qtd');
  if (!sel) return;

  const mgId = parseInt(sel.value);
  const qtd  = parseFloat(qtdEl.value) || 1;
  if (!mgId) return;

  const mg = materiaisGlobais.find(m => m.id === mgId);
  if (!mg) return;

  if (!produtos[pi].materiais) produtos[pi].materiais = [];
  produtos[pi].materiais.push({
    id: Date.now(),
    nome: mg.nome,
    valorUnit: mg.valorUnit,
    qtd,
    mgId: mg.id   // referência ao catálogo (informativo)
  });

  sel.value    = '';
  qtdEl.value  = '1';
  salvar(); renderizar();
}



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
  renderizarCustosGlobais(); // já chama renderizar() internamente
}

function editarCustoGlobal(idx, campo, v) {
  if (campo === 'valor') custosGlobais[idx].valor = parseFloat(v) || 0;
  else if (campo === 'nome') custosGlobais[idx].nome = v;
  salvar();
  renderizarCustosGlobais(); // já chama renderizar() internamente
}

function editarUnidadesPorDia(pi, v) {
  const val = parseFloat(v);
  produtos[pi].unidadesPorDia = isNaN(val) || val <= 0 ? 0 : val;
  salvar(); renderizar();
}

function toggleRateioCustoFixo(pi) {
  const ativoAtual = produtos[pi].rateioAtivo !== false;
  produtos[pi].rateioAtivo = !ativoAtual;
  salvar(); renderizar();
}

function renderizarCustosGlobais() {
  const lista = document.getElementById('lista-custos-globais');
  if (!lista) return;

  const totalGlobal = custosGlobais.reduce((s, c) => s + (Number(c.valor) || 0), 0);
  const diarioGlobal = totalGlobal / 30;

  const elTotalGlobal = document.getElementById('total-custos-globais');
  if (elTotalGlobal) elTotalGlobal.textContent = fmt(totalGlobal);

  const elDiarioGlobal = document.getElementById('custo-fixo-diario');
  if (elDiarioGlobal) elDiarioGlobal.textContent = fmt(diarioGlobal);

  // Atualiza produtos pois o rateio de custo fixo pode ter mudado
  renderizar();

  if (custosGlobais.length === 0) {
    lista.innerHTML = '<div class="cg-empty"><i class="ti ti-receipt-off"></i> Nenhum custo fixo cadastrado</div>';
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
    const { custoMateriais, investimento, rateioAtivo, rateioCustoFixo, custoTotal, margem, precoVenda, lucro, markup, unidadesParaRecuperar } = calcProduto(p);
    const unidadesPorDia = Number(p.unidadesPorDia) || 0;
    const temCustoFixo = getCustoFixoDiario() > 0;

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

    // Bloco de retorno do investimento (só aparece se tiver investimento)
    const retornoHtml = investimento > 0 ? `
      <div class="retorno-row">
        <i class="ti ti-chart-arrows-vertical"></i>
        <span class="retorno-label">Retorno do investimento</span>
        <div class="retorno-pills">
          <span class="retorno-pill pill-blue">
            <i class="ti ti-coin"></i> Investimento: ${fmt(investimento)}
          </span>
          <span class="retorno-pill pill-mint">
            <i class="ti ti-receipt"></i> Lucro por unidade: ${fmt(lucro)}
          </span>
          <span class="retorno-pill pill-purple">
            <i class="ti ti-package"></i>
            ${unidadesParaRecuperar > 0
              ? `Recupera em <strong>${unidadesParaRecuperar} venda${unidadesParaRecuperar > 1 ? 's' : ''}</strong>`
              : 'Defina margem para calcular'}
          </span>
        </div>
      </div>` : '';

    return `
    <div class="product-card" data-index="${pi}">

      <!-- Cabeçalho -->
      <div class="product-header">
        <input class="product-nome-edit" type="text" value="${p.nome}" title="Nome do produto"
          onchange="editarNomeProduto(${pi}, this.value)" />
        <div class="product-header-badges">
          <span class="badge-custo"><i class="ti ti-coin"></i> Custo: ${fmt(custoTotal)}</span>
          <span class="badge-venda"><i class="ti ti-tag"></i> Preço sugerido: ${fmt(precoVenda)}</span>
        </div>
        <button class="btn-icon btn-remove-produto" onclick="removerProduto(${pi})" title="Remover produto">
          <i class="ti ti-trash"></i>
        </button>
      </div>

      <!-- Materiais -->
      <div class="materiais-lista">
        ${materiaisHtml || '<div class="materiais-empty">Nenhum material adicionado ainda</div>'}
      </div>

      <!-- Adicionar material -->
      <div class="material-add-row">
        ${materiaisGlobais.length > 0 ? `
        <div class="mat-catalogo-row">
          <i class="ti ti-packages" style="color:var(--pink2);font-size:15px;flex-shrink:0"></i>
          <select class="mat-catalogo-sel">
            <option value="">— Escolher do catálogo —</option>
            ${materiaisGlobais.map(mg => `<option value="${mg.id}">${mg.nome} (${fmt(mg.valorUnit)}/${mg.unidade || 'un'})</option>`).join('')}
          </select>
          <span class="mat-x">x</span>
          <input type="number" class="mat-catalogo-qtd" placeholder="Qtd" min="0.01" step="0.01" value="1" style="max-width:70px" />
          <button class="btn-add-mini btn-catalogo" onclick="adicionarMaterialDoCatalogo(${pi})">
            <i class="ti ti-plus"></i> Usar
          </button>
        </div>
        <div class="mat-divider"><span></span></div>` : ''}
      </div>

      <!-- Investimento -->
      <div class="investimento-row">
        <div class="investimento-left">
          <i class="ti ti-cash"></i>
          <div class="investimento-texts">
            <span class="investimento-label">Meu investimento neste produto</span>
            <span class="investimento-hint">moldes, ferramentas, material inicial — valor que quero recuperar nas vendas</span>
          </div>
        </div>
        <div class="investimento-right">
          <div class="investimento-input-wrap">
            <span class="mat-prefix">R$</span>
            <input type="number" class="investimento-edit" min="0" step="0.01"
              value="${investimento > 0 ? investimento.toFixed(2) : ''}"
              placeholder="0,00"
              title="Valor de investimento"
              onchange="editarInvestimento(${pi}, this.value)" />
          </div>
          ${investimento > 0
            ? `<button class="btn-inv-clear" onclick="editarInvestimento(${pi}, 0)" title="Zerar investimento">
                <i class="ti ti-x"></i>
              </button>`
            : ''}
        </div>
      </div>

      <!-- Retorno do investimento -->
      ${retornoHtml}

      <!-- Rateio de custos fixos -->
      ${temCustoFixo ? `
      <div class="custo-fixo-row${rateioAtivo ? '' : ' custo-fixo-inativo'}">
        <div class="custo-fixo-left">
          <i class="ti ti-receipt-2"></i>
          <div class="custo-fixo-texts">
            <div class="custo-fixo-label-row">
              <span class="custo-fixo-label">Rateio de custos fixos</span>
              <label class="toggle-switch" title="${rateioAtivo ? 'Desativar rateio de custo fixo' : 'Ativar rateio de custo fixo'}">
                <input type="checkbox" ${rateioAtivo ? 'checked' : ''} onchange="toggleRateioCustoFixo(${pi})" />
                <span class="toggle-slider"></span>
              </label>
            </div>
            <span class="custo-fixo-hint">${rateioAtivo ? 'Quantas unidades deste produto você produz por dia?' : 'Desativado — este produto não recebe rateio de custo fixo'}</span>
          </div>
        </div>
        ${rateioAtivo ? `
        <div class="custo-fixo-right">
          <div class="custo-fixo-input-wrap">
            <input type="number" class="custo-fixo-unid-edit" min="0.1" step="0.1"
              value="${unidadesPorDia > 0 ? unidadesPorDia : ''}"
              placeholder="unid/dia"
              title="Unidades produzidas por dia"
              onchange="editarUnidadesPorDia(${pi}, this.value)" />
            <span class="custo-fixo-unid-label">unid/dia</span>
          </div>
          ${rateioCustoFixo > 0 ? `
          <div class="custo-fixo-pills">
            <span class="retorno-pill pill-amber">
              <i class="ti ti-receipt-2"></i> Custo fixo/unidade: <strong>${fmt(rateioCustoFixo)}</strong>
            </span>
          </div>` : `<span class="custo-fixo-zero-hint">Informe as unidades/dia para calcular</span>`}
        </div>` : ''}
      </div>` : ''}

      <!-- Margem e resultados -->
      <div class="margem-row">
        <div class="margem-input-group">
          <i class="ti ti-percentage"></i>
          <label>Quero ganhar</label>
          <input type="number" class="margem-edit" min="0" max="99" step="1" value="${margem}"
            title="Margem de lucro sobre o preço de venda" onchange="editarMargem(${pi}, this.value)" />
          <span>% de margem</span>
        </div>

        <div class="resultados-grid">
          <div class="res-bloco res-materiais">
            <span class="res-label"><i class="ti ti-tool"></i> Materiais</span>
            <strong class="res-valor">${fmt(custoMateriais)}</strong>
          </div>
          ${investimento > 0 ? `
          <div class="res-bloco res-investimento">
            <span class="res-label"><i class="ti ti-cash"></i> Investimento</span>
            <strong class="res-valor">${fmt(investimento)}</strong>
          </div>` : ''}
          ${rateioCustoFixo > 0 ? `
          <div class="res-bloco res-custo-fixo">
            <span class="res-label"><i class="ti ti-receipt-2"></i> Custos fixos</span>
            <strong class="res-valor" style="color:var(--amber)">${fmt(rateioCustoFixo)}</strong>
          </div>` : ''}
          <div class="res-bloco res-custo-total">
            <span class="res-label"><i class="ti ti-stack-2"></i> Custo total</span>
            <strong class="res-valor">${fmt(custoTotal)}</strong>
          </div>
          <div class="res-bloco res-venda">
            <span class="res-label"><i class="ti ti-tag"></i> Preço de venda</span>
            <strong class="res-valor">${fmt(precoVenda)}</strong>
          </div>
          <div class="res-bloco res-lucro">
            <span class="res-label"><i class="ti ti-trending-up"></i> Lucro / unidade</span>
            <strong class="res-valor">${fmt(lucro)}</strong>
          </div>
          <div class="res-bloco res-markup">
            <span class="res-label"><i class="ti ti-percentage"></i> Markup s/ custo</span>
            <strong class="res-valor">${markup.toFixed(1)}%</strong>
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
  if (campo === 'nome')           m.nome      = v;
  else if (campo === 'valorUnit') m.valorUnit = parseFloat(v) || 0;
  else if (campo === 'qtd')       m.qtd       = parseFloat(v) || 0;
  salvar(); renderizar();
}

document.addEventListener('DOMContentLoaded', () => {
  carregar();
  // inicia mostrando a aba visao-geral
  mostrarAba('visao-geral', document.querySelector('.nav-item'));

  const nomeProdutoInput = document.getElementById('nome-produto');
  if (nomeProdutoInput) {
    nomeProdutoInput.addEventListener('keydown', e => { if (e.key === 'Enter') adicionarProduto(); });
  }
  const cgValorInput = document.getElementById('cg-valor');
  if (cgValorInput) {
    cgValorInput.addEventListener('keydown', e => { if (e.key === 'Enter') adicionarCustoGlobal(); });
  }
  const mgValorInput = document.getElementById('mg-valor');
  if (mgValorInput) {
    mgValorInput.addEventListener('keydown', e => { if (e.key === 'Enter') adicionarMaterialGlobal(); });
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