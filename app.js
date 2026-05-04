/* =========================
   변수 및 초기화 설정
========================= */
let stocks = JSON.parse(localStorage.getItem("stocks") || "[]");
let prices = JSON.parse(localStorage.getItem("prices") || "{}");
let cash = Number(localStorage.getItem("cash") || 0);
let exchangeRate = 1350;
let barChart, pieChart;

// 초기 로드
async function init() {
  loadCash();
  await getExchangeRate();
  if (stocks.length > 0) {
    await refreshPrices();
  }
  showTab('asset'); 
  render();
  renderHistory();
  
  // 에러 방지: 정의되지 않은 autoSaveSnapshot 호출 삭제 또는 빈 함수 처리
  console.log("애플리케이션 초기화 완료");
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

async function getPrice(symbol) {
  const API_KEY = '831c116330c04eedb39cc260b03e7ba8'; 
  const url = `https://api.twelvedata.com/price?symbol=${symbol}&apikey=${API_KEY}`;

  try {
    const res = await fetch(url);
    const data = await res.json();
    if (data.status === "error" || !data.price) return null;

    const upperSymbol = symbol.toUpperCase();
    const isKRW = upperSymbol.includes("KRW") || upperSymbol.includes(".KS") || upperSymbol.includes(".KQ");

    return {
      price: parseFloat(data.price),
      currency: isKRW ? "KRW" : "USD"
    };
  } catch (err) {
    return null;
  }
}

async function refreshPrices() {
  for (let stock of stocks) {
    const quote = await getPrice(stock.symbol);
    if (quote) prices[stock.symbol] = quote.price;
  }
  savePrices();
}

/* =========================
   ➕ 종목 및 현금 관리
========================= */
function setCash() {
  const cashInput = document.getElementById("cashInput");
  if (!cashInput) return;
  cash = Number(cashInput.value);
  saveCash();
  render(); 
  alert("현금이 저장되었습니다!");
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
  if (!quote) return alert("종목 정보를 가져올 수 없습니다. (심볼 확인)");

  stocks.push({ symbol, quantity, buyPrice, currency: quote.currency });
  prices[symbol] = quote.price;
  
  saveStocks();
  savePrices();
  symbolInput.value = ""; qtyInput.value = ""; buyInput.value = "";
  render();
}

/* =========================
   🎨 UI 렌더링 및 자산 계산
========================= */
function render() {
  const list = document.getElementById("stock-list");
  if (!list) return;
  list.innerHTML = "";

  stocks.forEach((stock, index) => {
    const currentPrice = prices[stock.symbol] || 0;
    const isUSD = stock.currency === "USD";
    const buyTotal = stock.buyPrice * stock.quantity;
    const currentTotal = currentPrice * stock.quantity;
    const profit = currentTotal - buyTotal;
    const profitKRW = isUSD ? profit * exchangeRate : profit;
    const percent = buyTotal > 0 ? (profit / buyTotal) * 100 : 0;
    const color = profit >= 0 ? "#ef4444" : "#3b82f6";

    const div = document.createElement("div");
    div.className = "stock-card";
    div.style = "border:1px solid #ddd; padding:15px; margin:10px 0; border-radius:12px; background:#fff; cursor:pointer;";
    div.innerHTML = `
      <div style="display:flex; justify-content:space-between;">
        <strong>${stock.symbol}</strong>
        <input type="checkbox" class="select-stock" onclick="event.stopPropagation()">
      </div>
      <div style="font-size:0.9rem; color:#666; margin-top:5px;">
        수량: ${stock.quantity} / 매입가: ${stock.buyPrice.toLocaleString()} ${stock.currency}
      </div>
      <div style="margin-top:10px; font-weight:bold; color:${color}">
        수익: ${Math.floor(profitKRW).toLocaleString()}원 (${percent.toFixed(2)}%)
      </div>
    `;
    div.onclick = () => { showTab('news'); renderNews(stock.symbol); };
    list.appendChild(div);
  });

  updateTotalAndProfit();
  renderCharts();
}

function updateTotalAndProfit() {
  let currentStockValue = 0;
  let totalInvested = 0;

  stocks.forEach(s => {
    const price = prices[s.symbol] || 0;
    let bV = s.buyPrice * s.quantity;
    let nV = price * s.quantity;
    if (s.currency === "USD") { 
      bV *= exchangeRate; 
      nV *= exchangeRate; 
    }
    totalInvested += bV;
    currentStockValue += nV;
  });

  const totalAssets = cash + currentStockValue;
  const totalProfit = currentStockValue - totalInvested;
  const totalPercent = totalInvested > 0 ? (totalProfit / totalInvested) * 100 : 0;

  const totalEl = document.getElementById("total");
  if (totalEl) totalEl.innerText = `총 자산: ${Math.floor(totalAssets).toLocaleString()}원`;
  
  const cashDisplay = document.getElementById("cash-display");
  if (cashDisplay) cashDisplay.innerText = `보유 현금: ${Math.floor(cash).toLocaleString()}원`;

  const pEl = document.getElementById("profit");
  if (pEl) {
    pEl.style.color = totalProfit >= 0 ? "#ef4444" : "#3b82f6";
    pEl.innerText = `총 수익: ${Math.floor(totalProfit).toLocaleString()}원 (${totalPercent.toFixed(2)}%)`;
  }
}

/* =========================
   📰 뉴스 기능 (CORS 대응 및 보강)
========================= */
function showTab(tab) {
  const assetTab = document.getElementById("asset-tab");
  const newsTab = document.getElementById("news-tab");
  if (assetTab) assetTab.style.display = tab === "asset" ? "block" : "none";
  if (newsTab) newsTab.style.display = tab === "news" ? "block" : "none";
  if(tab === 'news') renderNewsStockList();
}

function renderNewsStockList() {
  const container = document.getElementById("news-stock-list");
  if (!container) return;
  container.innerHTML = stocks.map(s => `
    <button onclick="renderNews('${s.symbol}')" style="margin:5px; padding:8px 15px; border-radius:20px; border:1px solid #4f46e5; background:#fff; cursor:pointer;">${s.symbol}</button>
  `).join("");
}

async function renderNews(symbol) {
  const newsEl = document.getElementById("news");
  if (!newsEl) return;
  newsEl.innerHTML = "🔍 뉴스 로드 중 (CORS 정책 확인 중)...";
  
  // GNews API (무료 플랜은 CORS 이슈가 있을 수 있음)
  const API_KEY = "9a5356806279fa3e87a387d4c1fe6a14";
  const url = `https://gnews.io/api/v4/search?q=${symbol}&lang=ko&max=5&apikey=${API_KEY}`;

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error('뉴스 데이터 응답 실패');
    const data = await res.json();
    
    if (data.articles && data.articles.length > 0) {
      newsEl.innerHTML = `<h3>📰 ${symbol} 뉴스</h3>` + data.articles.map(a => `
        <div style="margin-bottom:15px; border-bottom:1px solid #eee; padding-bottom:10px;">
          <a href="${a.url}" target="_blank" style="text-decoration:none; color:#333; font-weight:bold;">${a.title}</a>
          <p style="font-size:0.8rem; color:#666; margin:5px 0;">${a.source.name}</p>
        </div>
      `).join("");
    } else {
      newsEl.innerHTML = "관련 뉴스가 없습니다.";
    }
  } catch (err) { 
    newsEl.innerHTML = `<p style="color:red;">뉴스 로드 실패: 브라우저 CORS 차단 또는 API 한도 초과</p>
    <p><small>해당 심볼(${symbol})을 네이버 뉴스에서 직접 보시려면 아래 링크를 클릭하세요.</small></p>
    <a href="https://search.naver.com/search.naver?where=news&query=${symbol}" target="_blank" style="color:#4f46e5;">네이버 뉴스 보기</a>`;
  }
}

/* =========================
   📊 차트 및 데이터 저장
========================= */
function renderCharts() {
  const ctxBar = document.getElementById("barChart");
  const ctxPie = document.getElementById("pieChart");
  if (!ctxBar) return;

  const labels = stocks.map(s => s.symbol);
  const values = stocks.map(s => {
    let v = (prices[s.symbol] || 0) * s.quantity;
    return s.currency === "USD" ? v * exchangeRate : v;
  });

  if (barChart) barChart.destroy();
  barChart = new Chart(ctxBar, { 
    type: 'bar', 
    data: { labels, datasets: [{ label: '가치(원)', data: values, backgroundColor: '#4f46e5' }] },
    options: { responsive: true, maintainAspectRatio: false }
  });

  if (ctxPie) {
    if (pieChart) pieChart.destroy();
    pieChart = new Chart(ctxPie, {
      type: 'pie',
      data: {
        labels: [...labels, "현금"],
        datasets: [{
          data: [...values, cash],
          backgroundColor: ['#4f46e5', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#6b7280']
        }]
      },
      options: { responsive: true, maintainAspectRatio: false }
    });
  }
}

function saveSnapshot() {
  const history = JSON.parse(localStorage.getItem("history") || "[]");
  const today = new Date().toISOString().split("T")[0];
  let stockVal = 0;
  stocks.forEach(s => {
    let v = (prices[s.symbol] || 0) * s.quantity;
    if (s.currency === "USD") v *= exchangeRate;
    stockVal += v;
  });
  const total = Math.round(cash + stockVal);
  const idx = history.findIndex(h => h.date === today);
  if (idx > -1) history[idx].total = total; else history.push({ date: today, total });
  localStorage.setItem("history", JSON.stringify(history));
  renderHistory();
  alert("현재 자산이 저장되었습니다!");
}

function renderHistory() {
  const history = JSON.parse(localStorage.getItem("history") || "[]");
  const el = document.getElementById("history");
  if (el) el.innerHTML = history.slice().reverse().slice(0, 5).map(h => `<li>${h.date}: ${h.total.toLocaleString()}원</li>`).join("");
}

// 헬퍼 함수들
function saveStocks() { localStorage.setItem("stocks", JSON.stringify(stocks)); }
function savePrices() { localStorage.setItem("prices", JSON.stringify(prices)); }
function saveCash() { localStorage.setItem("cash", cash); }
function loadCash() { 
  cash = Number(localStorage.getItem("cash") || 0); 
  const input = document.getElementById("cashInput");
  if(input) input.value = cash;
}

function deleteSelected() {
  const checks = document.querySelectorAll(".select-stock");
  stocks = stocks.filter((_, i) => !checks[i].checked);
  saveStocks(); render();
}

function resetAll() { if(confirm("초기화할까요?")) { localStorage.clear(); location.reload(); } }

// 실행
init();
