/* =========================
   변수 및 초기화 설정
========================= */
let stocks = JSON.parse(localStorage.getItem("stocks") || "[]");
let prices = JSON.parse(localStorage.getItem("prices") || "{}");
let cash = Number(localStorage.getItem("cash") || 0);
let exchangeRate = 1350;
let barChart, pieChart, historyChart;
let colorMap = {};

const PROXY_URL = "https://corsproxy.io/?";

/* =========================
   초기 로드 (init) 수정
========================= */
async function init() {
  loadCash();
  await getExchangeRate();
  if (stocks.length > 0) {
    await refreshPrices();
  }
  
/* =========================
   탭 전환 함수 (UI 보강)
========================= */
function showTab(tab) {
  const assetTab = document.getElementById("asset-tab");
  const newsTab = document.getElementById("news-tab");
  const assetBtn = document.getElementById("asset-btn");
  const newsBtn = document.getElementById("news-btn");

  if (tab === "asset") {
    assetTab.style.display = "block";
    newsTab.style.display = "none";
    assetBtn.classList.add("active"); // CSS 클래스 활용 권장
    assetBtn.style.color = "#4f46e5";
    newsBtn.style.color = "#999";
  } else {
    assetTab.style.display = "none";
    newsTab.style.display = "block";
    assetBtn.style.color = "#999";
    newsBtn.style.color = "#4f46e5";
    renderNewsStockList(); // 뉴스 탭 클릭 시 리스트 갱신
  }
}


/* =========================
   🌍 환율 및 시세 데이터
========================= */
async function getExchangeRate() {
  try {
    const res = await fetch("https://open.er-api.com/v6/latest/USD");
    const data = await res.json();
    exchangeRate = data.rates.KRW;
    const el = document.getElementById("exchange-rate");
    if (el) el.innerText = `환율: 1 USD = ${exchangeRate.toLocaleString()} KRW`;
  } catch (err) {
    console.error("환율 로드 실패", err);
  }
}

/* =========================
   🌍 시세 데이터 가져오기 (원화/달러 자동 판별)
========================= */
async function getPrice(symbol) {
  const API_KEY = '831c116330c04eedb39cc260b03e7ba8'; 
  const url = `https://api.twelvedata.com/price?symbol=${symbol}&apikey=${API_KEY}`;

  try {
    const res = await fetch(url);
    const data = await res.json();
    
    if (data.status === "error" || !data.price) return null;

    const upperSymbol = symbol.toUpperCase();
    // KRW 포함 여부 또는 한국 거래소(.KS, .KQ) 여부 확인
    const isKRW = upperSymbol.includes("KRW") || upperSymbol.includes(".KS") || upperSymbol.includes(".KQ");

    return {
      price: parseFloat(data.price),
      currency: isKRW ? "KRW" : "USD"
    };
  } catch (err) {
    console.error("API 에러:", err);
    return null;
  }
}


/* =========================
   ➕ 종목 추가 및 관리
========================= */
async function addStock() {
  const symbolInput = document.getElementById("symbol");
  const qtyInput = document.getElementById("quantity");
  const buyInput = document.getElementById("buyPrice");

  const symbol = symbolInput.value.toUpperCase().trim();
  const quantity = Number(qtyInput.value);
  const buyPrice = Number(buyInput.value);

  if (!symbol || quantity <= 0) return alert("올바른 값을 입력하세요.");

  const quote = await getPrice(symbol);
  if (!quote) return alert("존재하지 않는 종목이거나 데이터를 가져올 수 없습니다.");

  stocks.push({
    symbol,
    quantity,
    buyPrice,
    currency: quote.currency
  });

  prices[symbol] = quote.price;
  
  saveStocks();
  savePrices();
  
  // 입력창 초기화
  symbolInput.value = "";
  qtyInput.value = "";
  buyInput.value = "";
  
  render();
}

function updateQuantity(index, value) {
  stocks[index].quantity = Number(value);
  saveStocks();
  renderCharts(); // 차트만 즉시 갱신 (성능)
  updateTotalAndProfit(); 
}

function updateBuyPrice(index, value) {
  stocks[index].buyPrice = Number(value);
  saveStocks();
  render();
}
/* =========================
   🎨 UI 렌더링 (개별 종목 계산 수정)
========================= */
function render() {
  const list = document.getElementById("stock-list");
  if (!list) return;
  list.innerHTML = "";

  stocks.forEach((stock, index) => {
    const currentPrice = prices[stock.symbol] || 0;
    const isUSD = stock.currency === "USD"; // 저장된 통화 정보 확인
    
    // 계산 로직
    const buyTotal = stock.buyPrice * stock.quantity;
    const currentTotal = currentPrice * stock.quantity;
    const profit = currentTotal - buyTotal;
    
    // ⭐ USD일 때만 환율 곱하기
    const profitKRW = isUSD ? profit * exchangeRate : profit;
    const percent = buyTotal > 0 ? (profit / buyTotal) * 100 : 0;
    const color = profit >= 0 ? "#ef4444" : "#3b82f6";

    const div = document.createElement("div");
    div.className = "stock-card";
    div.style = "border:1px solid #ddd; padding:15px; margin:10px 0; border-radius:12px; background:#fff; position:relative;";
    
    div.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
        <strong style="font-size:1.1rem;">${stock.symbol}</strong>
        <input type="checkbox" class="select-stock" data-index="${index}">
      </div>
      <div style="font-size:0.9rem; color:#666;">
        수량: <input type="number" value="${stock.quantity}" onchange="updateQuantity(${index}, this.value)" style="width:50px; border:1px solid #eee;">
        매입가: <input type="number" value="${stock.buyPrice}" onchange="updateBuyPrice(${index}, this.value)" style="width:80px; border:1px solid #eee;"> <b>${stock.currency}</b>
      </div>
      <div style="margin-top:10px; font-weight:bold; color:${color}">
        수익: ${Math.floor(profitKRW).toLocaleString()}원 (${percent.toFixed(2)}%)
      </div>
      <div style="font-size:0.8rem; color:#999; margin-top:5px;">
        현재가: ${currentPrice.toLocaleString()} ${stock.currency}
      </div>
    `;
    
    div.onclick = (e) => {
      if(e.target.tagName !== 'INPUT') {
        showTab('news');
        renderNews(stock.symbol);
      }
    };
    list.appendChild(div);
  });

  updateTotalAndProfit();
  renderCharts();
  renderNewsStockList();
}

/* =========================
   💰 총 자산 및 수익 계산 (환율 중복 방지)
========================= */
function updateTotalAndProfit() {
  let totalAssets = cash; 
  let totalInvested = 0;
  let currentStockValue = 0;

  stocks.forEach(s => {
    const price = prices[s.symbol] || 0;
    const isUSD = s.currency === "USD"; 
    
    let buyValue = s.buyPrice * s.quantity;
    let nowValue = price * s.quantity;

    // ⭐ USD일 때만 환율 적용 (KRW 종목은 그대로 합산)
    if (isUSD) {
      buyValue *= exchangeRate;
      nowValue *= exchangeRate;
    }

    totalInvested += buyValue;
    currentStockValue += nowValue;
  });

  totalAssets += currentStockValue;
  const totalProfit = currentStockValue - totalInvested;
  const totalPercent = totalInvested > 0 ? (totalProfit / totalInvested) * 100 : 0;

  document.getElementById("total").innerText = `총 자산: ${Math.floor(totalAssets).toLocaleString()}원`;
  const profitEl = document.getElementById("profit");
  profitEl.style.color = totalProfit >= 0 ? "#ef4444" : "#3b82f6";
  profitEl.innerText = `총 수익: ${Math.floor(totalProfit).toLocaleString()}원 (${totalPercent.toFixed(2)}%)`;
}


/* =========================
   📰 뉴스 기능 (뉴스 탭)
========================= */
function fallbackKeyword(symbol) {
  const map = {
    "AAPL": "Apple", "TSLA": "Tesla", "NVDA": "NVIDIA", "MSFT": "Microsoft",
    "GOOGL": "Alphabet", "AMZN": "Amazon", "META": "Meta Platforms",
    "005930.KS": "Samsung Electronics", "000660.KS": "SK Hynix"
  };
  return map[symbol] || symbol;
}

async function renderNews(symbol) {
  const newsEl = document.getElementById("news");
  newsEl.innerHTML = `<div class="loading">🔍 ${symbol} 관련 뉴스를 찾는 중...</div>`;

  const keyword = fallbackKeyword(symbol);
  const API_KEY = "9a5356806279fa3e87a387d4c1fe6a14"; // GNews
  
  try {
    const res = await fetch(`https://gnews.io/api/v4/search?q=${keyword}&lang=ko&max=5&apikey=${API_KEY}`);
    const data = await res.json();
    
    newsEl.innerHTML = `<h3>📰 ${keyword} 최신 뉴스</h3>`;
    
    if (!data.articles || data.articles.length === 0) {
      newsEl.innerHTML += "<p>검색된 뉴스가 없습니다.</p>";
      return;
    }

    data.articles.forEach(a => {
      const item = document.createElement("div");
      item.style = "margin-bottom:20px; border-bottom:1px solid #eee; padding-bottom:10px;";
      item.innerHTML = `
        <a href="${a.url}" target="_blank" style="text-decoration:none; color:#333; font-weight:bold;">${a.title}</a>
        <p style="font-size:0.8rem; color:#666; margin:5px 0;">${a.description.substring(0, 80)}...</p>
        <span style="font-size:0.7rem; color:#999;">${a.source.name} · ${a.publishedAt.split("T")[0]}</span>
      `;
      newsEl.appendChild(item);
    });
  } catch (err) {
    newsEl.innerHTML = "<p>뉴스 로드 중 오류가 발생했습니다.</p>";
  }
}

/* =========================
   📊 차트 및 기타 기능
========================= */
function renderCharts() {
  const ctxBar = document.getElementById("barChart");
  const ctxPie = document.getElementById("pieChart");
  if (!ctxBar || !ctxPie) return;

  const labels = stocks.map(s => s.symbol);
  const values = stocks.map(s => {
    let val = (prices[s.symbol] || 0) * s.quantity;
    return s.currency === "USD" ? val * exchangeRate : val;
  });

  if (cash > 0) {
    labels.push("현금");
    values.push(cash);
  }

  const colors = labels.map(l => getColor(l));

  if (barChart) barChart.destroy();
  barChart = new Chart(ctxBar, {
    type: 'bar',
    data: {
      labels,
      datasets: [{ label: '자산 가치(원)', data: values, backgroundColor: colors }]
    },
    options: { responsive: true, plugins: { legend: { display: false } } }
  });

  if (pieChart) pieChart.destroy();
  pieChart = new Chart(ctxPie, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{ data: values, backgroundColor: colors }]
    },
    options: { responsive: true }
  });
}

function renderHistoryChart() {
  const history = JSON.parse(localStorage.getItem("history") || "[]");
  const ctx = document.getElementById("historyChart");
  if (!ctx || history.length === 0) return;

  if (historyChart) historyChart.destroy();
  historyChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: history.map(h => h.date),
      datasets: [{
        label: '총 자산 추이',
        data: history.map(h => h.total),
        borderColor: '#4f46e5',
        tension: 0.2,
        fill: true,
        backgroundColor: 'rgba(79, 70, 229, 0.1)'
      }]
    }
  });
}

// 헬퍼 함수들
function saveStocks() { localStorage.setItem("stocks", JSON.stringify(stocks)); }
function savePrices() { localStorage.setItem("prices", JSON.stringify(prices)); }
function loadStocks() { stocks = JSON.parse(localStorage.getItem("stocks") || "[]"); }
function loadPrices() { prices = JSON.parse(localStorage.getItem("prices") || "{}"); }
function loadCash() { cash = Number(localStorage.getItem("cash") || 0); }
function saveCash() { localStorage.setItem("cash", cash); }

function setCash() {
  cash = Number(document.getElementById("cashInput").value);
  saveCash();
  render();
}

function deleteSelected() {
  const checkboxes = document.querySelectorAll(".select-stock");
  stocks = stocks.filter((_, i) => !checkboxes[i].checked);
  saveStocks();
  render();
}

function resetAll() {
  if (confirm("정말 초기화하시겠습니까?")) {
    localStorage.clear();
    location.reload();
  }
}

function getColor(s) {
  if (s === "현금") return "#facc15";
  if (!colorMap[s]) colorMap[s] = `hsl(${Math.random() * 360}, 70%, 60%)`;
  return colorMap[s];
}

function showTab(tab) {
  document.getElementById("asset-tab").style.display = tab === "asset" ? "block" : "none";
  document.getElementById("news-tab").style.display = tab === "news" ? "block" : "none";
  document.getElementById("asset-btn").style.color = tab === "asset" ? "#4f46e5" : "#999";
  document.getElementById("news-btn").style.color = tab === "news" ? "#4f46e5" : "#999";
}

/* =========================
   뉴스 탭: 보유 자산 카드 리스트 렌더링
========================= */
function renderNewsStockList() {
  const container = document.getElementById("news-stock-list");
  if (!container) return;
  container.innerHTML = "";

  if (stocks.length === 0) {
    container.innerHTML = "<p style='text-align:center; color:#999; padding:20px;'>보유 중인 주식이 없습니다.</p>";
    return;
  }

  stocks.forEach(s => {
    const card = document.createElement("div");
    card.className = "news-stock-card";
    card.style = `
      padding: 15px; 
      margin-bottom: 10px; 
      background: #f8fafc; 
      border: 1px solid #e2e8f0; 
      border-radius: 12px; 
      cursor: pointer;
      display: flex;
      justify-content: space-between;
      align-items: center;
    `;
    
    card.innerHTML = `
      <div>
        <strong style="font-size:1.1rem;">${s.symbol}</strong>
        <span style="font-size:0.8rem; color:#666; margin-left:10px;">뉴스 보기 &gt;</span>
      </div>
    `;
    
    // 카드 클릭 시 해당 종목 뉴스 로드
    card.onclick = () => renderNews(s.symbol);
    container.appendChild(card);
  });
}



function autoSaveSnapshot() {
  const history = JSON.parse(localStorage.getItem("history") || "[]");
  const today = new Date().toISOString().split("T")[0];
  
  // 총 자산 계산 (현금 + 현재 주식 가치)
  let currentStockValue = 0;
  stocks.forEach(s => {
    let val = (prices[s.symbol] || 0) * s.quantity;
    if (s.currency === "USD") val *= exchangeRate;
    currentStockValue += val;
  });
  const total = Math.round(cash + currentStockValue);

  const idx = history.findIndex(h => h.date === today);
  if (idx > -1) history[idx].total = total;
  else history.push({ date: today, total });

  localStorage.setItem("history", JSON.stringify(history));
}

function saveSnapshot() {
  autoSaveSnapshot();
  renderHistory();
  renderHistoryChart();
  alert("오늘의 자산 현황이 기록되었습니다.");
}

function renderHistory() {
  const history = JSON.parse(localStorage.getItem("history") || "[]");
  const el = document.getElementById("history");
  if (!el) return;
  el.innerHTML = history.reverse().slice(0, 5).map(h => 
    `<li style="font-size:0.9rem; margin-bottom:5px;">${h.date}: <b>${h.total.toLocaleString()}원</b></li>`
  ).join("");
}

// 실행
init();
