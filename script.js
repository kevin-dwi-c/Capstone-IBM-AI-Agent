/* ============================================================
   PocketBuddy – script.js
   Multi-month edition: setiap bulan memiliki budget, pemasukan,
   dan pengeluaran tersendiri. Navigasi ‹ › di header.
   ============================================================ */

'use strict';

// ============================================================
// CONSTANTS
// ============================================================

/** Kunci penyimpanan localStorage (multi-month) */
const LS_KEY_DATA   = 'pb_data';      // Objek { "YYYY-MM": { budget, incomes, expenses } }
const LS_KEY_CLEAN  = 'pb_cleaned';   // Flag: sudah dibersihkan bulan ini ("YYYY-MM")

/** Kunci lama (single-month) – digunakan untuk migrasi */
const LS_KEY_OLD_BUDGET   = 'pb_budget';
const LS_KEY_OLD_INCOMES  = 'pb_incomes';
const LS_KEY_OLD_EXPENSES = 'pb_expenses';

/** Daftar kategori */
const CATEGORIES = ['Makan', 'Jajan', 'Transport', 'Kuliah', 'Lainnya'];

/** Metadata tiap kategori: warna, ikon, warna latar */
const CAT_META = {
  Makan:     { color: '#0d9488', icon: '🍜', bg: '#ccfbf1' },
  Jajan:     { color: '#f97316', icon: '🧋', bg: '#fff7ed' },
  Transport: { color: '#3b82f6', icon: '🛵', bg: '#eff6ff' },
  Kuliah:    { color: '#8b5cf6', icon: '📚', bg: '#f5f3ff' },
  Lainnya:   { color: '#94a3b8', icon: '📦', bg: '#f1f5f9' },
};

// ============================================================
// STATE
// ============================================================

/**
 * Seluruh data multi-bulan.
 * Shape: { "YYYY-MM": { budget: {...}, incomes: [...], expenses: [...] }, ... }
 */
let allData = {};

/** Bulan yang sedang ditampilkan, format "YYYY-MM" */
let activeMonth = currentMonthKey();

// ============================================================
// CHART INSTANCES
// ============================================================
let donutChart     = null;
let cashflowChart  = null;

/** Tab aktif pada chart cashflow: 'all' | 'expense' | 'income' */
let cfTab = 'all';

// ============================================================
// MONTH KEY HELPERS
// ============================================================

/**
 * Kembalikan key bulan ini: "YYYY-MM"
 * @returns {string}
 */
function currentMonthKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Tambah/kurangi bulan dari sebuah key "YYYY-MM".
 * @param {string} ym  "YYYY-MM"
 * @param {number} delta  positif = maju, negatif = mundur
 * @returns {string}
 */
function shiftMonth(ym, delta) {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Bandingkan dua key "YYYY-MM". Kembalikan -1/0/1.
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
function cmpMonth(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Kembalikan label bulan dari key "YYYY-MM", misal "Oktober 2026".
 * @param {string} ym
 * @returns {string}
 */
function monthLabel(ym) {
  const [y, m] = ym.split('-').map(Number);
  const names = ['Januari','Februari','Maret','April','Mei','Juni',
                 'Juli','Agustus','September','Oktober','November','Desember'];
  return `${names[m - 1]} ${y}`;
}

/**
 * Kembalikan jumlah hari dalam bulan dari key "YYYY-MM".
 * @param {string} ym
 * @returns {number}
 */
function daysInMonth(ym) {
  const [y, m] = ym.split('-').map(Number);
  return new Date(y, m, 0).getDate();
}

/**
 * Kembalikan tanggal default untuk input transaksi di bulan `ym`:
 * - bulan ini → hari ini
 * - bulan lain → tanggal 1
 * @param {string} ym
 * @returns {string} YYYY-MM-DD
 */
function defaultDateForMonth(ym) {
  const today = todayISO();
  return today.startsWith(ym) ? today : `${ym}-01`;
}

// ============================================================
// DATA HELPERS
// ============================================================

/** Default data kosong untuk satu bulan. */
function emptyMonthData() {
  return {
    budget: { total: 0, categories: Object.fromEntries(CATEGORIES.map(c => [c, 0])) },
    incomes:  [],
    expenses: [],
  };
}

/**
 * Ambil data bulan `ym`. Buat kosong jika belum ada.
 * @param {string} ym
 * @returns {{ budget, incomes, expenses }}
 */
function getMonthData(ym) {
  if (!allData[ym]) allData[ym] = emptyMonthData();
  return allData[ym];
}

/** Alias: data bulan aktif. */
function active() { return getMonthData(activeMonth); }

// ============================================================
// LOCALSTORAGE
// ============================================================

/** Simpan allData ke localStorage. */
function saveState() {
  localStorage.setItem(LS_KEY_DATA, JSON.stringify(allData));
}

/**
 * Muat allData dari localStorage.
 * Jika ada data lama (single-month), migrasi otomatis.
 */
function loadState() {
  try {
    const raw = localStorage.getItem(LS_KEY_DATA);
    if (raw) {
      allData = JSON.parse(raw) || {};
    } else {
      // --- MIGRASI DATA LAMA ---
      migrateLegacyData();
    }
  } catch (e) {
    console.warn('PocketBuddy: gagal memuat localStorage, mulai fresh.', e);
    allData = {};
  }
}

/**
 * Kelompokkan data lama (flat) ke struktur per-bulan.
 * Budget lama → budget bulan ini.
 * Transaksi lama → dikelompokkan berdasarkan tanggal.
 */
function migrateLegacyData() {
  try {
    const oldBudget   = JSON.parse(localStorage.getItem(LS_KEY_OLD_BUDGET));
    const oldIncomes  = JSON.parse(localStorage.getItem(LS_KEY_OLD_INCOMES))  || [];
    const oldExpenses = JSON.parse(localStorage.getItem(LS_KEY_OLD_EXPENSES)) || [];

    if (!oldBudget && !oldIncomes.length && !oldExpenses.length) return;

    const thisMonth = currentMonthKey();

    // Budget lama → bulan ini
    if (oldBudget && oldBudget.total > 0) {
      getMonthData(thisMonth).budget = oldBudget;
    }

    // Pemasukan lama → kelompokkan berdasarkan bulan tanggal
    oldIncomes.forEach(t => {
      if (!t.date) return;
      const ym = t.date.slice(0, 7);
      getMonthData(ym).incomes.push(t);
    });

    // Pengeluaran lama → kelompokkan berdasarkan bulan tanggal
    oldExpenses.forEach(t => {
      if (!t.date) return;
      const ym = t.date.slice(0, 7);
      getMonthData(ym).expenses.push(t);
    });

    // Bersihkan kunci lama
    localStorage.removeItem(LS_KEY_OLD_BUDGET);
    localStorage.removeItem(LS_KEY_OLD_INCOMES);
    localStorage.removeItem(LS_KEY_OLD_EXPENSES);

    saveState();
    console.info('PocketBuddy: migrasi data lama selesai.');
  } catch (e) {
    console.warn('PocketBuddy: migrasi gagal.', e);
  }
}

/**
 * Hapus data yang lebih lama dari bulan lalu (relatif terhadap hari ini).
 * Flag pembersihan dikunci ke bulan berjalan — bukan tanggal — agar
 * saat bulan berganti, pembersihan tetap berjalan meski di hari yang sama.
 * @returns {boolean} true jika ada yang dihapus
 */
function cleanOldData() {
  const curMonth  = currentMonthKey();   // "YYYY-MM" bulan ini
  const lastMonth = shiftMonth(curMonth, -1);

  // Jalankan sekali per bulan-kalender (bukan per hari)
  if (localStorage.getItem(LS_KEY_CLEAN) === curMonth) return false;

  let removed = false;
  Object.keys(allData).forEach(ym => {
    if (cmpMonth(ym, lastMonth) < 0) {
      delete allData[ym];
      removed = true;
    }
  });

  if (removed) saveState();
  localStorage.setItem(LS_KEY_CLEAN, curMonth);
  return removed;
}

// ============================================================
// MONEY INPUT HELPERS
// ============================================================

function formatThousands(num) {
  const n = String(num).replace(/\D/g, '');
  if (!n) return '';
  return parseInt(n, 10).toLocaleString('id-ID');
}

function getRawValue(input) {
  const cleaned = input.value.replace(/\./g, '').replace(/,/g, '').trim();
  return cleaned === '' ? NaN : parseFloat(cleaned);
}

function setMoneyValue(input, num) {
  input.value = num > 0 ? formatThousands(num) : '';
}

function initMoneyInputs() {
  document.querySelectorAll('input[data-money]').forEach(input => {
    input.addEventListener('input', function () {
      const raw = this.value.replace(/\D/g, '');
      this.value = raw ? parseInt(raw, 10).toLocaleString('id-ID') : '';
    });
    input.addEventListener('keydown', function (e) {
      const allowed = ['Backspace','Delete','ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Tab','Enter','Home','End'];
      if (allowed.includes(e.key) || e.ctrlKey || e.metaKey) return;
      if (!/^\d$/.test(e.key)) e.preventDefault();
    });
  });
}

// ============================================================
// UTILITY FUNCTIONS
// ============================================================

function formatRupiah(num) {
  const n = Math.abs(Math.round(num));
  return (num < 0 ? '-Rp' : 'Rp') + n.toLocaleString('id-ID');
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function formatDate(iso) {
  if (!iso) return '-';
  const [y, m, d] = iso.split('-').map(Number);
  const names = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
  return `${d} ${names[m - 1]} ${y}`;
}

function showToast(message, type = 'success') {
  const toast = document.getElementById('toast');
  const colors = { success: '#0F9D8A', error: '#ef4444', warning: '#f97316' };
  toast.style.background = colors[type] || colors.success;
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2800);
}

/**
 * Hari ini dalam format YYYY-MM-DD (lokal).
 */
function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function animateValue(el, newText) {
  if (!el) return;
  el.textContent = newText;
  el.classList.remove('count-updated');
  void el.offsetWidth;
  el.classList.add('count-updated');
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 11) return 'Selamat pagi 👋';
  if (h < 15) return 'Selamat siang 👋';
  if (h < 19) return 'Selamat sore 👋';
  return 'Selamat malam 👋';
}

// ============================================================
// COMPUTED HELPERS (scoped to activeMonth)
// ============================================================

function totalIncome() {
  const d = active();
  return (d.budget.total || 0) + d.incomes.reduce((s, t) => s + t.amount, 0);
}

function totalExpense() {
  return active().expenses.reduce((s, t) => s + t.amount, 0);
}

function expenseByCategory() {
  const result = Object.fromEntries(CATEGORIES.map(c => [c, 0]));
  active().expenses.forEach(e => {
    if (result[e.category] !== undefined) result[e.category] += e.amount;
  });
  return result;
}


/**
 * Hitung sisa/hari sesuai konteks bulan:
 * - bulan ini: balance / sisa hari (inkl. hari ini)
 * - bulan depan: balance / total hari bulan
 * - bulan lalu: kembalikan null (tampilkan "Bulan selesai")
 * @param {number} balance
 * @returns {{ value: number|null, label: string }}
 */
function computeDaily(balance) {
  const cur = currentMonthKey();
  const cmp = cmpMonth(activeMonth, cur);

  if (cmp < 0) {
    // Bulan lalu
    return { value: null, label: 'Bulan selesai' };
  }
  if (cmp === 0) {
    // Bulan ini
    const now  = new Date();
    const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    const rem  = Math.max(1, last.getDate() - now.getDate() + 1);
    return { value: balance > 0 ? balance / rem : 0, label: `${rem} hari tersisa` };
  }
  // Bulan depan
  const total = daysInMonth(activeMonth);
  return { value: balance > 0 ? balance / total : 0, label: `${total} hari` };
}

// ============================================================
// RENDER: HEADER MONTH PICKER
// ============================================================

function renderMonthPicker() {
  const cur      = currentMonthKey();
  const prevBound = shiftMonth(cur, -1); // batas bawah: bulan lalu
  const nextBound = shiftMonth(cur,  1); // batas atas: bulan depan

  document.getElementById('header-month').textContent     = monthLabel(activeMonth);
  document.getElementById('header-greeting').textContent  = getGreeting();

  // ‹ dinonaktifkan jika sudah berada di bulan lalu (batas bawah)
  document.getElementById('btn-prev-month').disabled = (cmpMonth(activeMonth, prevBound) <= 0);
  // › dinonaktifkan jika sudah berada di bulan depan (batas atas)
  document.getElementById('btn-next-month').disabled = (cmpMonth(activeMonth, nextBound) >= 0);
}

// ============================================================
// RENDER: DASHBOARD (HERO CARD)
// ============================================================

function renderDashboard() {
  const d       = active();
  const income  = (d.budget.total || 0) + d.incomes.reduce((s, t) => s + t.amount, 0);
  const expense = d.expenses.reduce((s, t) => s + t.amount, 0);
  const balance = income - expense;
  const { value: dailyVal, label: dailyLabel } = computeDaily(balance);

  const balEl = document.getElementById('dash-balance');
  animateValue(balEl, formatRupiah(balance));
  balEl.style.color = balance < 0 ? '#fca5a5' : '#ffffff';

  document.getElementById('dash-days').textContent =
    balance < 0 ? '⚠️ Saldo minus!' : dailyLabel;

  animateValue(document.getElementById('dash-income'),  formatRupiah(income));
  animateValue(document.getElementById('dash-expense'), formatRupiah(expense));

  const dailyEl = document.getElementById('dash-daily');
  if (dailyVal === null) {
    animateValue(dailyEl, 'Bulan selesai');
    dailyEl.className = 'pb-mini-value text-slate-300';
  } else {
    animateValue(dailyEl, formatRupiah(dailyVal));
    dailyEl.className = 'pb-mini-value ' + (dailyVal >= 0 ? 'text-sky-300' : 'text-red-300');
  }
}

// ============================================================
// RENDER: BUDGET PROGRESS BARS
// ============================================================

function renderBudgetProgress() {
  const container  = document.getElementById('budget-progress-container');
  const byCategory = expenseByCategory();
  const d          = active();

  if (d.budget.total === 0) {
    container.innerHTML = `
      <div class="tx-empty">
        <span class="text-3xl">🎯</span>
        <span class="font-semibold text-slate-500">Belum ada budget</span>
        <span class="text-xs">Atur budget bulanmu di atas!</span>
      </div>`;
    return;
  }

  container.innerHTML = CATEGORIES.map(cat => {
    const meta     = CAT_META[cat];
    const budgeted = d.budget.categories[cat] || 0;
    const spent    = byCategory[cat] || 0;
    const pct      = budgeted > 0 ? Math.min((spent / budgeted) * 100, 100) : 0;
    const over     = budgeted > 0 && spent > budgeted;
    const near     = budgeted > 0 && !over && (spent / budgeted) >= 0.8;

    let fillClass = 'ok';
    if (over) fillClass = 'danger';
    else if (near) fillClass = 'warning';

    let warnHtml = '';
    if (over) {
      warnHtml = `<span class="progress-warning-label text-red-500">⚠️ Melebihi budget ${formatRupiah(spent - budgeted)}!</span>`;
    } else if (near) {
      warnHtml = `<span class="progress-warning-label text-orange-500">🟡 Hampir habis! (${Math.round((spent/budgeted)*100)}%)</span>`;
    }

    return `
      <div class="progress-wrap">
        <div class="progress-header">
          <span class="progress-cat-label">
            <span style="background:${meta.bg};border-radius:0.4rem;padding:0.1rem 0.3rem;font-size:0.9rem;">${meta.icon}</span>
            ${cat}
          </span>
          <span style="color:${meta.color};font-size:0.75rem;">
            ${budgeted > 0 ? formatRupiah(spent) + ' / ' + formatRupiah(budgeted) : 'Belum diatur'}
          </span>
        </div>
        <div class="progress-track">
          <div class="progress-fill ${fillClass}" style="width:${pct}%"></div>
        </div>
        ${warnHtml}
      </div>`;
  }).join('');
}

// ============================================================
// RENDER: CHARTS
// ============================================================

function renderDonutChart() {
  const ctx     = document.getElementById('chart-donut').getContext('2d');
  const emptyEl = document.getElementById('chart-donut-empty');
  const hasData = active().expenses.length > 0;

  emptyEl.style.display = hasData ? 'none' : 'flex';

  const byCategory = expenseByCategory();
  const data   = CATEGORIES.map(c => byCategory[c]);
  const colors = CATEGORIES.map(c => CAT_META[c].color);

  if (donutChart) {
    donutChart.data.datasets[0].data = data;
    donutChart.update();
    return;
  }

  donutChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: CATEGORIES.map(c => `${CAT_META[c].icon} ${c}`),
      datasets: [{ data, backgroundColor: colors, borderWidth: 2, borderColor: '#fff', hoverOffset: 8 }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '64%',
      plugins: {
        legend: { position: 'bottom', labels: { font: { size: 10 }, padding: 8, boxWidth: 10 } },
        tooltip: { callbacks: { label: ctx => ` ${ctx.label}: ${formatRupiah(ctx.raw)}` } },
      },
    },
  });
}

// ============================================================
// CASHFLOW CHART HELPERS
// ============================================================

/**
 * Format angka menjadi label singkat untuk Y-axis.
 * ≥1.000.000 → "Rp1jt", ≥1.000 → "Rp500rb", else "Rp500"
 * @param {number} v
 * @returns {string}
 */
function shortRupiah(v) {
  if (v === 0) return 'Rp0';
  if (v >= 1_000_000) return `Rp${(v / 1_000_000).toFixed(v % 1_000_000 === 0 ? 0 : 1)}jt`;
  if (v >= 1_000)     return `Rp${(v / 1_000).toFixed(v % 1_000 === 0 ? 0 : 0)}rb`;
  return `Rp${v}`;
}

/**
 * Definisikan 5 rentang tanggal dalam sebulan.
 * Rentang ke-5 menyesuaikan panjang bulan (misal: 29–28/29/30/31).
 * @returns {Array<{label: string, start: number, end: number}>}
 */
function cashflowRanges() {
  const lastDay = daysInMonth(activeMonth);
  return [
    { label: '1–7',          start: 1,  end: 7           },
    { label: '8–14',         start: 8,  end: 14          },
    { label: '15–21',        start: 15, end: 21          },
    { label: '22–28',        start: 22, end: 28          },
    { label: `29–${lastDay}`, start: 29, end: lastDay    },
  ];
}

/**
 * Jumlah pengeluaran per rentang tanggal.
 * @returns {number[]} array 5 nilai
 */
function expenseByCashflowRange() {
  const ranges = cashflowRanges();
  return ranges.map(r => {
    return active().expenses
      .filter(e => {
        const day = parseInt(e.date.split('-')[2], 10);
        return day >= r.start && day <= r.end;
      })
      .reduce((s, e) => s + e.amount, 0);
  });
}

/**
 * Jumlah pemasukan (budget + income entries) per rentang tanggal.
 * Budget total dianggap masuk di hari-1.
 * @returns {number[]} array 5 nilai
 */
function incomeByCashflowRange() {
  const ranges = cashflowRanges();
  const d = active();
  // Semua income entries (bukan budget)
  const entries = d.incomes;
  return ranges.map((r, idx) => {
    let total = entries
      .filter(inc => {
        const day = parseInt(inc.date.split('-')[2], 10);
        return day >= r.start && day <= r.end;
      })
      .reduce((s, inc) => s + inc.amount, 0);
    // Tambahkan budget ke rentang pertama (hari 1)
    if (idx === 0 && d.budget.total) total += d.budget.total;
    return total;
  });
}

// ============================================================
// RENDER: CASHFLOW CHART (bar chart dual-dataset per rentang)
// ============================================================

function renderCashflowChart() {
  const canvas  = document.getElementById('chart-bar');
  const emptyEl = document.getElementById('chart-bar-empty');
  const d       = active();
  const hasData = d.expenses.length > 0 || d.incomes.length > 0 || d.budget.total > 0;

  emptyEl.style.display = hasData ? 'none' : 'flex';

  // Update totals row below chart
  const totalExpEl = document.getElementById('cf-total-expense');
  const totalIncEl = document.getElementById('cf-total-income');
  if (totalExpEl) totalExpEl.textContent = formatRupiah(totalExpense());
  if (totalIncEl) totalIncEl.textContent = formatRupiah(totalIncome());

  const labels   = cashflowRanges().map(r => r.label);
  const expData  = expenseByCashflowRange();
  const incData  = incomeByCashflowRange();

  // Dataset visibility berdasarkan tab aktif
  const showExp = cfTab === 'all' || cfTab === 'expense';
  const showInc = cfTab === 'all' || cfTab === 'income';

  const datasets = [
    {
      label: 'Pengeluaran',
      data: expData,
      backgroundColor: 'rgba(249,115,22,0.80)',
      borderColor: '#f97316',
      borderWidth: 1.5,
      borderRadius: 5,
      hidden: !showExp,
      order: 1,
    },
    {
      label: 'Pemasukan',
      data: incData,
      backgroundColor: 'rgba(15,157,138,0.72)',
      borderColor: '#0F9D8A',
      borderWidth: 1.5,
      borderRadius: 5,
      hidden: !showInc,
      order: 2,
    },
  ];

  // Jika chart sudah ada, update data (tidak re-create agar animasi lebih halus)
  if (cashflowChart) {
    cashflowChart.data.labels = labels;
    cashflowChart.data.datasets[0].data   = expData;
    cashflowChart.data.datasets[0].hidden = !showExp;
    cashflowChart.data.datasets[1].data   = incData;
    cashflowChart.data.datasets[1].hidden = !showInc;
    cashflowChart.update();
    return;
  }

  const ctx = canvas.getContext('2d');
  cashflowChart = new Chart(ctx, {
    type: 'bar',
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: item => ` ${item.dataset.label}: ${formatRupiah(item.raw)}`,
          },
        },
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            font: { size: 9 },
            callback: v => shortRupiah(v),
          },
          grid: {
            color: '#e2e8f0',
            borderDash: [4, 4],  // dashed grid lines
          },
        },
        x: {
          ticks: { font: { size: 9 }, maxRotation: 0 },
          grid: { display: false },
        },
      },
    },
  });
}

/**
 * Inisialisasi event listener tab pada chart cashflow.
 * Dipanggil sekali saat init().
 */
function initCashflowTabs() {
  document.querySelectorAll('[data-cf-tab]').forEach(btn => {
    btn.addEventListener('click', () => {
      // Update tab state
      cfTab = btn.dataset.cfTab;

      // Update active class
      document.querySelectorAll('[data-cf-tab]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      // Re-render chart dengan visibilitas dataset baru
      renderCashflowChart();
    });
  });
}

// ============================================================
// RENDER: TRANSACTION LIST
// ============================================================

function renderTransactionList() {
  const container = document.getElementById('transaction-list');
  const d = active();

  const all = [
    ...d.incomes.map(t  => ({ ...t, type: 'income' })),
    ...d.expenses.map(t => ({ ...t, type: 'expense' })),
  ].sort((a, b) => (b.date > a.date ? 1 : b.date < a.date ? -1 : 0));

  if (all.length === 0) {
    container.innerHTML = `
      <div class="tx-empty">
        <span class="text-5xl">🗒️</span>
        <span class="font-semibold text-slate-500">Belum ada transaksi</span>
        <span class="text-xs text-slate-400">Yuk, mulai catat pemasukan atau pengeluaranmu!</span>
      </div>`;
    return;
  }

  container.innerHTML = all.map(tx => {
    const isIncome  = tx.type === 'income';
    const sign      = isIncome ? '+' : '-';
    const meta      = isIncome ? null : CAT_META[tx.category];
    const iconBg    = isIncome ? '#ccfbf1' : (meta?.bg || '#f1f5f9');
    const icon      = isIncome ? '💵' : (meta?.icon || '📦');
    const badgeCls  = isIncome ? 'tx-badge-income' : 'tx-badge-expense';
    const badgeLbl  = isIncome ? 'Pemasukan Lain' : tx.category;
    const desc      = isIncome ? (tx.source || '-') : (tx.note || tx.category);
    const amtColor  = isIncome ? '#0F9D8A' : '#f97316';

    return `
      <div class="tx-item" data-id="${tx.id}" data-type="${tx.type}">
        <div class="flex items-center gap-3 min-w-0">
          <div class="tx-cat-icon" style="background:${iconBg};">${icon}</div>
          <div class="min-w-0">
            <div class="flex items-center gap-1.5 flex-wrap">
              <span class="tx-badge ${badgeCls}">${badgeLbl}</span>
            </div>
            <p class="font-semibold text-slate-700 truncate leading-tight text-xs mt-0.5">${desc}</p>
            <p class="text-xs text-slate-400">${formatDate(tx.date)}</p>
          </div>
        </div>
        <div class="flex items-center gap-1.5 shrink-0 ml-2">
          <span class="font-bold text-sm whitespace-nowrap" style="color:${amtColor};">
            ${sign}${formatRupiah(tx.amount)}
          </span>
          ${isIncome ? `
            <button class="btn-edit-income p-1 text-blue-400 hover:text-blue-600 transition-colors rounded" data-id="${tx.id}" title="Edit">✏️</button>
          ` : `
            <button class="btn-edit-expense p-1 text-blue-400 hover:text-blue-600 transition-colors rounded" data-id="${tx.id}" title="Edit">✏️</button>
          `}
          <button class="btn-delete-tx p-1 text-red-300 hover:text-red-500 transition-colors rounded" data-id="${tx.id}" data-type="${tx.type}" title="Hapus">🗑️</button>
        </div>
      </div>`;
  }).join('');
}

// ============================================================
// RENDER ALL
// ============================================================

function renderAll() {
  renderMonthPicker();
  renderDashboard();
  renderBudgetProgress();
  renderDonutChart();
  renderCashflowChart();
  renderTransactionList();
  refreshBudgetUI();
  refreshDateDefaults();
}

// ============================================================
// BUDGET FORM HELPERS
// ============================================================

/** Sembunyikan form, tampilkan ringkasan budget. */
function showBudgetSummary(total) {
  document.getElementById('form-budget').classList.add('hidden');
  const el = document.getElementById('budget-summary');
  el.classList.remove('hidden');
  el.classList.add('flex');
  document.getElementById('budget-summary-amount').textContent = formatRupiah(total);
}

/** Tampilkan form, sembunyikan ringkasan. */
function showBudgetForm() {
  document.getElementById('budget-summary').classList.add('hidden');
  document.getElementById('budget-summary').classList.remove('flex');
  document.getElementById('form-budget').classList.remove('hidden');
}

/**
 * Refresh tampilan budget (form vs ringkasan) dan tombol "Salin".
 * Dipanggil tiap kali bulan aktif berubah.
 */
function refreshBudgetUI() {
  const d    = active();
  const prev = shiftMonth(activeMonth, -1);
  const prevData = getMonthData(prev);

  // Isi form dengan nilai tersimpan bulan aktif
  setMoneyValue(document.getElementById('total-budget'), d.budget.total || 0);
  CATEGORIES.forEach(cat => {
    const input = document.querySelector(`[data-cat="${cat}"]`);
    if (input) setMoneyValue(input, d.budget.categories[cat] || 0);
  });

  // Tampilkan/sembunyikan berdasarkan apakah budget sudah diatur
  if (d.budget.total > 0) {
    showBudgetSummary(d.budget.total);
  } else {
    showBudgetForm();
  }

  // Tombol salin: hanya tampil jika bulan ini/depan belum ada budget DAN bulan lalu punya budget
  const canCopy = d.budget.total === 0 && prevData.budget.total > 0;
  document.getElementById('btn-copy-budget-wrap').classList.toggle('hidden', !canCopy);
}

/**
 * Set tanggal default di kedua form transaksi sesuai bulan aktif.
 */
function refreshDateDefaults() {
  const def = defaultDateForMonth(activeMonth);
  const incomeDate  = document.getElementById('income-date');
  const expenseDate = document.getElementById('expense-date');

  // Hanya ganti jika tidak sedang dalam mode edit
  if (!document.getElementById('income-edit-id').value)  incomeDate.value  = def;
  if (!document.getElementById('expense-edit-id').value) expenseDate.value = def;

  // Set min/max agar tanggal dibatasi dalam bulan aktif
  const [y, m] = activeMonth.split('-').map(Number);
  const firstDay = `${activeMonth}-01`;
  const lastDay  = `${activeMonth}-${String(daysInMonth(activeMonth)).padStart(2, '0')}`;

  [incomeDate, expenseDate].forEach(el => {
    el.min = firstDay;
    el.max = lastDay;
  });
}

// ============================================================
// MONTH NAVIGATION
// ============================================================

/**
 * Ganti bulan aktif ke `ym`, destroy chart instance lama,
 * batalkan mode edit, dan render ulang.
 * @param {string} ym  key "YYYY-MM" tujuan
 */
function navigateToMonth(ym) {
  const prevBound = shiftMonth(currentMonthKey(), -1);
  const nextBound = shiftMonth(currentMonthKey(),  1);

  // Klem agar tidak keluar jendela 3 bulan
  if (cmpMonth(ym, prevBound) < 0) ym = prevBound;
  if (cmpMonth(ym, nextBound) > 0) ym = nextBound;

  if (ym === activeMonth) return; // tidak ada perubahan

  activeMonth = ym;

  // Destroy chart instances agar re-create dengan data bulan baru
  if (donutChart)    { donutChart.destroy();    donutChart    = null; }
  if (cashflowChart) { cashflowChart.destroy(); cashflowChart = null; }

  cancelEditMode();
  cancelEditIncomeMode();
  renderAll();
}

function initMonthPicker() {
  document.getElementById('btn-prev-month').addEventListener('click', () => {
    // Mundur SATU bulan dari bulan yang sedang ditampilkan
    navigateToMonth(shiftMonth(activeMonth, -1));
  });

  document.getElementById('btn-next-month').addEventListener('click', () => {
    // Maju SATU bulan dari bulan yang sedang ditampilkan
    navigateToMonth(shiftMonth(activeMonth, 1));
  });
}

// ============================================================
// FORM: BUDGET SETUP
// ============================================================

function initBudgetForm() {
  document.getElementById('btn-edit-budget').addEventListener('click', showBudgetForm);

  // Salin budget bulan lalu
  document.getElementById('btn-copy-budget').addEventListener('click', () => {
    const prev     = shiftMonth(activeMonth, -1);
    const prevData = getMonthData(prev);
    if (!prevData.budget.total) return;

    // Terapkan ke form
    setMoneyValue(document.getElementById('total-budget'), prevData.budget.total);
    CATEGORIES.forEach(cat => {
      const input = document.querySelector(`[data-cat="${cat}"]`);
      if (input) setMoneyValue(input, prevData.budget.categories[cat] || 0);
    });
    showToast('Budget bulan lalu disalin ke form. Klik Simpan untuk mengonfirmasi.', 'warning');
  });

  document.getElementById('form-budget').addEventListener('submit', e => {
    e.preventDefault();
    const total = getRawValue(document.getElementById('total-budget'));

    if (!total || total <= 0) {
      showToast('Total uang bulanan harus lebih dari 0.', 'error');
      return;
    }

    const categories = {};
    CATEGORIES.forEach(cat => {
      const input = document.querySelector(`[data-cat="${cat}"]`);
      categories[cat] = getRawValue(input) || 0;
    });

    const catSum = Object.values(categories).reduce((s, v) => s + v, 0);
    if (catSum > total) {
      showToast(`Total budget melebihi uang bulanan sebesar ${formatRupiah(catSum - total)}`, 'error');
      return;
    }

    active().budget = { total, categories };
    saveState();
    showBudgetSummary(total);
    renderAll();
    showToast('Budget berhasil disimpan! 💾');
  });
}

// ============================================================
// FORM: PEMASUKAN
// ============================================================

function initIncomeForm() {
  document.getElementById('form-income').addEventListener('submit', e => {
    e.preventDefault();
    const editId = document.getElementById('income-edit-id').value;
    const source = document.getElementById('income-source').value.trim();
    const amount = getRawValue(document.getElementById('income-amount'));
    const date   = document.getElementById('income-date').value;

    if (!source) { showToast('Sumber pemasukan tidak boleh kosong.', 'error'); return; }
    if (isNaN(amount) || amount <= 0) {
      showToast('Nominal pemasukan harus lebih dari Rp0.', 'error'); return;
    }
    if (!date) { showToast('Tanggal pemasukan harus diisi.', 'error'); return; }

    // Validasi tanggal harus dalam bulan aktif
    if (!date.startsWith(activeMonth)) {
      showToast(`Tanggal harus berada di bulan ${monthLabel(activeMonth)}.`, 'error'); return;
    }

    if (editId) {
      const idx = active().incomes.findIndex(t => t.id === editId);
      if (idx !== -1) {
        active().incomes[idx] = { ...active().incomes[idx], source, amount, date };
        showToast('Pemasukan berhasil diperbarui! ✏️');
      }
      cancelEditIncomeMode();
    } else {
      active().incomes.push({ id: generateId(), source, amount, date });
      document.getElementById('form-income').reset();
      document.getElementById('income-amount').value = '';
      refreshDateDefaults();
      showToast(`Pemasukan ${formatRupiah(amount)} ditambahkan! ✅`);
    }

    saveState();
    renderAll();
  });

  document.getElementById('btn-income-cancel').addEventListener('click', cancelEditIncomeMode);
}

function enterEditIncomeMode(income) {
  document.getElementById('income-edit-id').value = income.id;
  document.getElementById('income-source').value  = income.source;
  setMoneyValue(document.getElementById('income-amount'), income.amount);
  document.getElementById('income-date').value    = income.date;
  document.getElementById('btn-income-submit').textContent = 'Simpan Perubahan';
  document.getElementById('btn-income-cancel').classList.remove('hidden');
  document.getElementById('form-income').scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function cancelEditIncomeMode() {
  document.getElementById('income-edit-id').value = '';
  document.getElementById('form-income').reset();
  document.getElementById('income-amount').value  = '';
  refreshDateDefaults();
  document.getElementById('btn-income-submit').textContent = 'Tambah Pemasukan';
  document.getElementById('btn-income-cancel').classList.add('hidden');
}

// ============================================================
// FORM: PENGELUARAN (CRUD)
// ============================================================

function initExpenseForm() {
  document.getElementById('form-expense').addEventListener('submit', e => {
    e.preventDefault();
    const editId   = document.getElementById('expense-edit-id').value;
    const amount   = getRawValue(document.getElementById('expense-amount'));
    const category = document.getElementById('expense-category').value;
    const date     = document.getElementById('expense-date').value;
    const note     = document.getElementById('expense-note').value.trim();

    if (isNaN(amount) || amount <= 0) {
      showToast('Nominal pengeluaran harus lebih dari Rp0.', 'error'); return;
    }
    if (!category) {
      showToast('Pilih kategori pengeluaran terlebih dahulu.', 'error'); return;
    }
    if (!date) {
      showToast('Tanggal pengeluaran harus diisi.', 'error'); return;
    }

    // Validasi tanggal harus dalam bulan aktif
    if (!date.startsWith(activeMonth)) {
      showToast(`Tanggal harus berada di bulan ${monthLabel(activeMonth)}.`, 'error'); return;
    }

    if (editId) {
      const idx = active().expenses.findIndex(ex => ex.id === editId);
      if (idx !== -1) {
        active().expenses[idx] = { ...active().expenses[idx], amount, category, date, note };
        showToast('Pengeluaran berhasil diperbarui! ✏️');
      }
      cancelEditMode();
    } else {
      active().expenses.push({ id: generateId(), amount, category, date, note });
      showToast(`Pengeluaran ${formatRupiah(amount)} ditambahkan! ✅`);
      document.getElementById('form-expense').reset();
      document.getElementById('expense-amount').value = '';
      refreshDateDefaults();
    }

    saveState();
    renderAll();
  });

  document.getElementById('btn-expense-cancel').addEventListener('click', cancelEditMode);
}

function enterEditMode(expense) {
  document.getElementById('expense-edit-id').value  = expense.id;
  setMoneyValue(document.getElementById('expense-amount'), expense.amount);
  document.getElementById('expense-category').value = expense.category;
  document.getElementById('expense-date').value     = expense.date;
  document.getElementById('expense-note').value     = expense.note || '';
  document.getElementById('btn-expense-submit').textContent = 'Simpan Perubahan';
  document.getElementById('btn-expense-cancel').classList.remove('hidden');
  document.getElementById('form-expense').scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function cancelEditMode() {
  document.getElementById('expense-edit-id').value  = '';
  document.getElementById('form-expense').reset();
  document.getElementById('expense-amount').value   = '';
  refreshDateDefaults();
  document.getElementById('btn-expense-submit').textContent = 'Tambah Pengeluaran';
  document.getElementById('btn-expense-cancel').classList.add('hidden');
}

// ============================================================
// MODAL KONFIRMASI HAPUS
// ============================================================

let pendingDeleteCallback = null;

function showConfirmModal(message, onConfirm) {
  document.getElementById('modal-message').textContent = message;
  document.getElementById('modal-confirm').classList.remove('hidden');
  pendingDeleteCallback = onConfirm;
}

function hideConfirmModal() {
  document.getElementById('modal-confirm').classList.add('hidden');
  pendingDeleteCallback = null;
}

function initModal() {
  document.getElementById('modal-cancel').addEventListener('click', hideConfirmModal);
  document.getElementById('modal-confirm-btn').addEventListener('click', () => {
    if (pendingDeleteCallback) pendingDeleteCallback();
    hideConfirmModal();
  });
  document.getElementById('modal-confirm').addEventListener('click', e => {
    if (e.target === document.getElementById('modal-confirm')) hideConfirmModal();
  });
}

// ============================================================
// EVENT DELEGATION: EDIT & DELETE DARI LIST
// ============================================================

function initTransactionListEvents() {
  document.getElementById('transaction-list').addEventListener('click', e => {
    const editIncomeBtn  = e.target.closest('.btn-edit-income');
    const editExpenseBtn = e.target.closest('.btn-edit-expense');
    const deleteBtn      = e.target.closest('.btn-delete-tx');

    if (editIncomeBtn) {
      const income = active().incomes.find(t => t.id === editIncomeBtn.dataset.id);
      if (income) enterEditIncomeMode(income);
      return;
    }

    if (editExpenseBtn) {
      const expense = active().expenses.find(ex => ex.id === editExpenseBtn.dataset.id);
      if (expense) enterEditMode(expense);
      return;
    }

    if (deleteBtn) {
      const { id, type } = deleteBtn.dataset;
      showConfirmModal(
        type === 'income' ? 'Hapus data pemasukan ini?' : 'Hapus data pengeluaran ini?',
        () => {
          if (type === 'income')
            active().incomes  = active().incomes.filter(t => t.id !== id);
          else
            active().expenses = active().expenses.filter(t => t.id !== id);
          saveState();
          renderAll();
          showToast('Transaksi dihapus.', 'warning');
        }
      );
    }
  });

  document.getElementById('btn-clear-all').addEventListener('click', () => {
    const d = active();
    if (d.incomes.length === 0 && d.expenses.length === 0) {
      showToast('Tidak ada transaksi untuk dihapus.', 'error');
      return;
    }
    showConfirmModal('Hapus SEMUA transaksi bulan ini?', () => {
      active().incomes  = [];
      active().expenses = [];
      saveState();
      renderAll();
      showToast('Semua transaksi dihapus.', 'warning');
    });
  });
}

// ============================================================
// INIT
// ============================================================

/**
 * Periksa apakah bulan kalender sudah berganti sejak terakhir kali
 * ditampilkan. Jika ya, geser jendela dan tampilkan bulan ini.
 * Dipanggil saat init dan saat tab kembali aktif (visibilitychange).
 */
function checkMonthRollover() {
  const cur = currentMonthKey();

  // Jika bulan aktif bukan salah satu dari tiga bulan yang valid, reset ke bulan ini
  const prevBound = shiftMonth(cur, -1);
  const nextBound = shiftMonth(cur,  1);
  if (cmpMonth(activeMonth, prevBound) < 0 || cmpMonth(activeMonth, nextBound) > 0) {
    activeMonth = cur;
  }

  // Jalankan pembersihan data lama (idempoten per bulan)
  const cleaned = cleanOldData();
  if (cleaned) {
    setTimeout(() => showToast('Data lebih dari bulan lalu otomatis dibersihkan.', 'warning'), 600);
  }
}

function init() {
  // 1. Muat data (termasuk migrasi data lama jika perlu)
  loadState();

  // 2. Periksa rollover bulan dan bersihkan data lama
  checkMonthRollover();

  // 3. Pasang pemformatan input nominal
  initMoneyInputs();

  // 4. Pasang navigasi bulan
  initMonthPicker();

  // 5. Pasang event listener form, modal & cashflow tabs
  initBudgetForm();
  initIncomeForm();
  initExpenseForm();
  initModal();
  initTransactionListEvents();
  initCashflowTabs();

  // 6. Render tampilan awal
  renderAll();

  // 7. Pantau pergantian bulan saat tab kembali aktif
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    const curNow = currentMonthKey();
    // Jika bulan aktif tidak lagi dalam jendela 3 bulan yang valid, geser ke bulan ini
    const prevB = shiftMonth(curNow, -1);
    const nextB = shiftMonth(curNow,  1);
    if (cmpMonth(activeMonth, prevB) < 0 || cmpMonth(activeMonth, nextB) > 0) {
      // Bulan berganti: pindah ke bulan ini, destroy chart, re-render
      activeMonth = curNow;
      if (donutChart)    { donutChart.destroy();    donutChart    = null; }
      if (cashflowChart) { cashflowChart.destroy(); cashflowChart = null; }
      checkMonthRollover();
      renderAll();
      showToast(`Selamat datang di ${monthLabel(curNow)}! 🎉`);
    }
  });
}

document.addEventListener('DOMContentLoaded', init);
