/* =========================
   변수 및 초기화 설정
========================= */
let stocks = JSON.parse(localStorage.getItem("stocks") || "[]");
let prices = JSON.parse(localStorage.getItem("prices") || "{}");
let cash = Number(localStorage.getItem("cash") || 0);
let exchangeRate = 1350;
let barChart, pieChart, historyChart; // 변동 그래프 변수 추가

const colorPalette = [
  '#10b981', '#4f46e5', '#f59e0b', '#ef4444', '#8b5cf6', 
  '#06b6d4', '#ec4899', '#f97316', '#14b8a6', '#6366f1'
];

async function init() {
  loadCash();
  await getExchangeRate();
  if (stocks.length > 0) await refreshPrices();
  showTab('asset'); 
  render();           // 메인 렌더링 (리스트 + Bar + Pie)
  renderHistory();    // 텍스트 히스토리 렌더링
  renderHistoryChart(); // 자산 추이 그래프 렌더링
}

/* =========================
   🌍 데이터 통신 및 저장
========================= */
async function getExchangeRate() {
  try {
    const res = await fetch("https://open.er-api.com/v6/latest/USD");
    const data = await res.json();
    exchangeRate = data.rates.KRW;
    const el = document.getElementById("exchange-rate");
    if (el) el.innerText = `환율: 1 USD = ${exchangeRate.toLocaleString()} KRW`;
  } catch (err) { console.error("환율 로드 실패", err); }
}

async function getPrice(symbol) {
  const API_KEY = '831c116330c04eedb39cc260b03e7ba8'; 
  const url = `https://api.twelvedata.com/price?symbol=${symbol}&apikey=${API_KEY}`;
  try {
    const res = await fetch(url);
    const data = await res.json();
    if (data.status === "error" || !data.price) return null;
    return { price: parseFloat(data.price), currency: (symbol.includes(".KS") || symbol.includes(".KQ")) ? "KRW" : "USD" };
  } catch (err) { return null; }
}

async function refreshPrices() {
  for (let stock of stocks) {
    const quote = await getPrice(stock.symbol);
    if (quote) prices[stock.symbol] = quote.price;
  }
  savePrices();
}

/* =========================
   ➕ 자산 관리 로직
========================= */
function setCash() {
  const cashInput = document.getElementById("cashInput");
  cash = Number(cashInput.value) || 0;
  saveCash();
  render();
}

async function addStock() {
  const symbolInput = document.getElementById("symbol");
  const qtyInput = document.getElementById("quantity");
  const buyInput = document.getElementById("buyPrice");
  const symbol = symbolInput.value.toUpperCase().trim();
  const quantity = Number(qtyInput.value);
  const buyPrice = Number(buyInput.value);

  if (!symbol || quantity <= 0) return alert("올바른 값을 입력하세요.");
  const quote = await getPrice(symbol);
  if (!quote) return alert("종목 정보를 가져올 수 없습니다.");

  stocks.push({ symbol, quantity, buyPrice, currency: quote.currency });
  prices[symbol] = quote.price;
  saveStocks(); savePrices();
  symbolInput.value = ""; qtyInput.value = ""; buyInput.value = "";
  render();
}

/* =========================
   🎨 UI 및 비중 렌더링
========================= */
function render() {
  const list = document.getElementById("stock-list");
  if (!list) return;
  list.innerHTML = "";

  let currentStockValueTotal = 0;
  stocks.forEach(s => {
    let v = (prices[s.symbol] || 0) * s.quantity;
    if (s.currency === "USD") v *= exchangeRate;
    currentStockValueTotal += v;
  });
  const totalAssets = cash + currentStockValueTotal;

  // 현금 비중 표시
  const cashDiv = document.createElement("div");
  const cashWeight = totalAssets > 0 ? ((cash / totalAssets) * 100).toFixed(1) : 0;
  cashDiv.className = "stock-card";
  cashDiv.style = "border:2px solid #10b981; padding:15px; margin:10px 0; border-radius:12px; background:#f0fdf4;";
  cashDiv.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:center;">
      <strong>💰 보유 현금</strong>
      <span style="font-size:0.85rem; background:#10b981; color:#fff; padding:2px 8px; border-radius:10px;">비중 ${cashWeight}%</span>
    </div>
    <div style="margin-top:10px; font-size:1.1rem; font-weight:bold;">${Math.floor(cash).toLocaleString()}원</div>
  `;
  list.appendChild(cashDiv);

  // 종목 카드 리스트
  stocks.forEach((stock) => {
    const currentPrice = prices[stock.symbol] || 0;
    const isUSD = stock.currency === "USD";
    const currentTotal = (currentPrice * stock.quantity) * (isUSD ? exchangeRate : 1);
    const weight = totalAssets > 0 ? ((currentTotal / totalAssets) * 100).toFixed(1) : 0;
    const profit = currentTotal - (stock.buyPrice * stock.quantity * (isUSD ? exchangeRate : 1));
    const percent = (stock.buyPrice > 0) ? (profit / (stock.buyPrice * stock.quantity * (isUSD ? exchangeRate : 1))) * 100 : 0;

    const div = document.createElement("div");
    div.className = "stock-card";
    div.style = "border:1px solid #ddd; padding:15px; margin:10px 0; border-radius:12px; background:#fff; cursor:pointer;";
    div.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <strong>${stock.symbol}</strong>
        <span style="font-size:0.8rem; color:#666;">비중 ${weight}%</span>
      </div>
      <div style="margin-top:8px; font-weight:bold; color:${profit >= 0 ? '#ef4444' : '#3b82f6'}">
        수익: ${Math.floor(profit).toLocaleString()}원 (${percent.toFixed(2)}%)
      </div>
      <input type="checkbox" class="select-stock" style="margin-top:10px;" onclick="event.stopPropagation()">
    `;
    div.onclick = () => { showTab('news'); renderNews(stock.symbol); };
    list.appendChild(div);
  });

  updateTotalAndProfit(totalAssets);
  renderCharts(totalAssets);
}

function updateTotalAndProfit(totalAssets) {
  let totalInvested = 0;
  stocks.forEach(s => {
    let bV = s.buyPrice * s.quantity;
    if (s.currency === "USD") bV *= exchangeRate;
    totalInvested += bV;
  });
  const currentStockValue = totalAssets - cash;
  const totalProfit = currentStockValue - totalInvested;
  const totalPercent = totalInvested > 0 ? (totalProfit / totalInvested) * 100 : 0;

  document.getElementById("total").innerText = `총 자산: ${Math.floor(totalAssets).toLocaleString()}원`;
  const pEl = document.getElementById("profit");
  pEl.style.color = totalProfit >= 0 ? "#ef4444" : "#3b82f6";
  pEl.innerText = `총 수익: ${Math.floor(totalProfit).toLocaleString()}원 (${totalPercent.toFixed(2)}%)`;
}

/* =========================
   📈 차트 관리 (전역 변수 이름 변경으로 충돌 방지)
========================= */
let myBarChart = null;
let myPieChart = null;
let myHistoryChart = null;

/* =========================
   📊 1. 종목 비중 차트 (Bar & Pie)
========================= */
function renderCharts(totalAssets) {
  const ctxBar = document.getElementById("barChart");
  const ctxPie = document.getElementById("pieChart");
  if (!ctxBar || !ctxPie) return;

  const labels = ["현금", ...stocks.map(s => s.symbol)];
  const values = [cash, ...stocks.map(s => {
    let v = (prices[s.symbol] || 0) * s.quantity;
    return s.currency === "USD" ? v * exchangeRate : v;
  })];
  const backgroundColors = labels.map((_, i) => colorPalette[i % colorPalette.length]);

  // [무한 루프 방지 핵심] 기존 차트가 있으면 완전히 삭제 후 재생성
  if (myBarChart) {
    myBarChart.destroy();
  }
  if (myPieChart) {
    myPieChart.destroy();
  }

  myBarChart = new Chart(ctxBar, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        label: '자산 가치(원)',
        data: values,
        backgroundColor: backgroundColors
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false, // HTML/CSS에서 정의한 높이에 따름
      plugins: { legend: { display: false } }
    }
  });

  myPieChart = new Chart(ctxPie, {
    type: 'pie',
    data: {
      labels: labels,
      datasets: [{
        data: values,
        backgroundColor: backgroundColors
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false
    }
  });
}

/* =========================
   📈 2. 자산 추이 그래프 (Line)
========================= */
function renderHistoryChart() {
  const ctx = document.getElementById("historyChart");
  if (!ctx) return;

  const history = JSON.parse(localStorage.getItem("history") || "[]");
  if (history.length === 0) return;

  const labels = history.map(h => h.date);
  const data = history.map(h => h.total);

  // [무한 루프 방지 핵심]
  if (myHistoryChart) {
    myHistoryChart.destroy();
  }

  myHistoryChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [{
        label: '총 자산 추이',
        data: data,
        borderColor: '#4f46e5',
        backgroundColor: 'rgba(79, 70, 229, 0.1)',
        fill: true,
        tension: 0.4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          beginAtZero: false // 변동성을 직관적으로 보여주기 위해 false 설정
        }
      }
    }
  });
}

/* =========================
   📅 스냅샷 저장 (그래프 자동 갱신)
========================= */
function saveSnapshot() {
  const history = JSON.parse(localStorage.getItem("history") || "[]");
  const now = new Date();
  const today = `${now.getMonth() + 1}/${now.getDate()}`;

  let currentStockValueTotal = 0;
  stocks.forEach(s => {
    let v = (prices[s.symbol] || 0) * s.quantity;
    if (s.currency === "USD") v *= exchangeRate;
    currentStockValueTotal += v;
  });
  const totalAssets = Math.round(cash + currentStockValueTotal);

  const existingIdx = history.findIndex(h => h.date === today);
  if (existingIdx > -1) history[existingIdx].total = totalAssets;
  else history.push({ date: today, total: totalAssets });

  if (history.length > 14) history.shift();

  localStorage.setItem("history", JSON.stringify(history));
  renderHistory();
  renderHistoryChart(); // 그래프 즉시 반영
  alert(`오늘의 자산(${totalAssets.toLocaleString()}원)이 기록되었습니다.`);
}

function renderHistory() {
  const history = JSON.parse(localStorage.getItem("history") || "[]");
  const el = document.getElementById("history");
  if (!el) return;
  if (history.length === 0) {
    el.innerHTML = "<p style='color:#999;'>기록된 데이터가 없습니다.</p>";
    return;
  }
  el.innerHTML = history.slice().reverse().map(h => `
    <div style="display:flex; justify-content:space-between; padding:8px 0; border-bottom:1px dashed #eee;">
      <span>${h.date}</span>
      <strong>${h.total.toLocaleString()}원</strong>
    </div>
  `).join("");
}

/* ... 기타 유틸리티 (saveStocks, savePrices, loadCash, showTab, deleteSelected) 동일 ... */
function saveStocks() { localStorage.setItem("stocks", JSON.stringify(stocks)); }
function savePrices() { localStorage.setItem("prices", JSON.stringify(prices)); }
function saveCash() { localStorage.setItem("cash", cash); }
function loadCash() { 
  cash = Number(localStorage.getItem("cash") || 0); 
  if(document.getElementById("cashInput")) document.getElementById("cashInput").value = cash;
}

/* =========================
   🔄 탭 전환 함수 (뉴스 리스트 포함)
========================= */
function showTab(tab) {
  const assetTab = document.getElementById("asset-tab");
  const newsTab = document.getElementById("news-tab");
  const assetBtn = document.getElementById("asset-btn");
  const newsBtn = document.getElementById("news-btn");

  if (tab === "asset") {
    assetTab.style.display = "block";
    newsTab.style.display = "none";
    assetBtn.classList.add("active");
    newsBtn.classList.remove("active");
  } else {
    assetTab.style.display = "none";
    newsTab.style.display = "block";
    assetBtn.classList.remove("active");
    newsBtn.classList.add("active");
    renderNewsStockList(); // 뉴스 탭 진입 시 종목 리스트 갱신
  }
}

function renderNewsStockList() {
  const container = document.getElementById("news-stock-list");
  if (!container) return;
  container.innerHTML = "";

  stocks.forEach(stock => {
    const btn = document.createElement("button");
    btn.innerText = stock.symbol;
    btn.style = "margin:5px; padding:10px; border-radius:8px; border:1px solid #4f46e5; background:white; cursor:pointer;";
    btn.onclick = () => renderNews(stock.symbol);
    container.appendChild(btn);
  });
}

function renderNews(symbol) {
  const newsDiv = document.getElementById("news");
  if (!newsDiv) return;
  
  const query = encodeURIComponent(symbol);
  newsDiv.innerHTML = `
    <div style="margin-top:20px; padding:15px; background:#f8fafc; border-radius:10px;">
      <h4>${symbol} 관련 소식</h4>
      <p>최신 뉴스를 보려면 아래 링크를 확인하세요.</p>
      <a href="https://www.google.com/search?q=${query}+주가+뉴스" target="_blank" style="color:#4f46e5; font-weight:bold;">🔗 Google 뉴스 바로가기</a>
    </div>
  `;
}


function deleteSelected() {
  const checks = document.querySelectorAll(".select-stock");
  stocks = stocks.filter((_, i) => !checks[i].checked);
  saveStocks(); render();
}

init();
