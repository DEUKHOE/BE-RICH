/* =========================
   변수 및 초기화 설정
========================= */
let stocks = JSON.parse(localStorage.getItem("stocks") || "[]");
let prices = JSON.parse(localStorage.getItem("prices") || "{}");
let cash = Number(localStorage.getItem("cash") || 0);
let exchangeRate = 1350;
let barChart, pieChart;

async function init() {
  loadCash();
  await getExchangeRate();
  if (stocks.length > 0) {
    await refreshPrices();
  }
  showTab('asset'); 
  render();
  renderHistory();
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
  } catch (err) { console.error("환율 로드 실패", err); }
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
    return { price: parseFloat(data.price), currency: isKRW ? "KRW" : "USD" };
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
   ➕ 종목 및 현금 관리
========================= */
function setCash() {
  const cashInput = document.getElementById("cashInput");
  cash = Number(cashInput.value) || 0;
  saveCash();
  render();
  alert("현금이 반영되었습니다!");
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
   🎨 UI 렌더링 및 비중 계산
========================= */
function render() {
  const list = document.getElementById("stock-list");
  if (!list) return;
  list.innerHTML = "";

  // 1. 총 자산 먼저 계산 (비중 계산용)
  let currentStockValueTotal = 0;
  stocks.forEach(s => {
    let v = (prices[s.symbol] || 0) * s.quantity;
    if (s.currency === "USD") v *= exchangeRate;
    currentStockValueTotal += v;
  });
  const totalAssets = cash + currentStockValueTotal;

  // 2. 현금 카드 상단에 추가
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

  // 3. 종목 리스트 렌더링
  stocks.forEach((stock) => {
    const currentPrice = prices[stock.symbol] || 0;
    const isUSD = stock.currency === "USD";
    const buyTotal = stock.buyPrice * stock.quantity;
    const currentTotal = (currentPrice * stock.quantity) * (isUSD ? exchangeRate : 1);
    const weight = totalAssets > 0 ? ((currentTotal / totalAssets) * 100).toFixed(1) : 0;
    
    const profit = currentTotal - (buyTotal * (isUSD ? exchangeRate : 1));
    const percent = buyTotal > 0 ? (profit / (buyTotal * (isUSD ? exchangeRate : 1))) * 100 : 0;
    const color = profit >= 0 ? "#ef4444" : "#3b82f6";

    const div = document.createElement("div");
    div.className = "stock-card";
    div.style = "border:1px solid #ddd; padding:15px; margin:10px 0; border-radius:12px; background:#fff; cursor:pointer;";
    div.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <strong>${stock.symbol}</strong>
        <span style="font-size:0.8rem; color:#666;">비중 ${weight}%</span>
      </div>
      <div style="font-size:0.85rem; color:#888; margin-top:4px;">수량: ${stock.quantity} / 매입가: ${stock.buyPrice.toLocaleString()}${stock.currency}</div>
      <div style="margin-top:8px; font-weight:bold; color:${color}">
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
  let currentStockValue = 0;
  stocks.forEach(s => {
    let bV = s.buyPrice * s.quantity;
    let nV = (prices[s.symbol] || 0) * s.quantity;
    if (s.currency === "USD") { bV *= exchangeRate; nV *= exchangeRate; }
    totalInvested += bV; currentStockValue += nV;
  });

  const totalProfit = currentStockValue - totalInvested;
  const totalPercent = totalInvested > 0 ? (totalProfit / totalInvested) * 100 : 0;

  document.getElementById("total").innerText = `총 자산: ${Math.floor(totalAssets).toLocaleString()}원`;
  const pEl = document.getElementById("profit");
  pEl.style.color = totalProfit >= 0 ? "#ef4444" : "#3b82f6";
  pEl.innerText = `총 수익: ${Math.floor(totalProfit).toLocaleString()}원 (${totalPercent.toFixed(2)}%)`;
}

/* =========================
   📊 차트 (현금 포함 및 비중 표시)
========================= */
function renderCharts(totalAssets) {
  const ctxBar = document.getElementById("barChart");
  const ctxPie = document.getElementById("pieChart");
  if (!ctxBar) return;

  const labels = ["현금", ...stocks.map(s => s.symbol)];
  const values = [cash, ...stocks.map(s => {
    let v = (prices[s.symbol] || 0) * s.quantity;
    return s.currency === "USD" ? v * exchangeRate : v;
  })];

  if (barChart) barChart.destroy();
  barChart = new Chart(ctxBar, {
    type: 'bar',
    data: { labels, datasets: [{ label: '가치(원)', data: values, backgroundColor: '#4f46e5' }] },
    options: { responsive: true, plugins: { legend: { display: false } } }
  });

  if (ctxPie) {
    if (pieChart) pieChart.destroy();
    pieChart = new Chart(ctxPie, {
      type: 'pie',
      data: {
        labels,
        datasets: [{
          data: values,
          backgroundColor: ['#10b981', '#4f46e5', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4']
        }]
      },
      options: {
        plugins: {
          tooltip: {
            callbacks: {
              label: (item) => {
                const val = item.raw;
                const pct = totalAssets > 0 ? ((val / totalAssets) * 100).toFixed(1) : 0;
                return ` ${item.label}: ${Math.floor(val).toLocaleString()}원 (${pct}%)`;
              }
            }
          }
        }
      }
    });
  }
}

/* =========================
   📰 뉴스 기능 (네이버/구글 뉴스 백업 추가)
========================= */
function showTab(tab) {
  document.getElementById("asset-tab").style.display = tab === "asset" ? "block" : "none";
  document.getElementById("news-tab").style.display = tab === "news" ? "block" : "none";
  if(tab === 'news') renderNewsStockList();
}

function renderNewsStockList() {
  const container = document.getElementById("news-stock-list");
  if (!container) return;
  container.innerHTML = stocks.map(s => `
    <button onclick="renderNews('${s.symbol}')" style="margin:5px; padding:8px 15px; border-radius:20px; border:1px solid #4f46e5; background:#fff;">${s.symbol}</button>
  `).join("");
}

async function renderNews(symbol) {
  const newsEl = document.getElementById("news");
  newsEl.innerHTML = `🔍 ${symbol} 뉴스 검색 중...`;
  
  const API_KEY = "9a5356806279fa3e87a387d4c1fe6a14";
  const url = `https://gnews.io/api/v4/search?q=${symbol}&lang=ko&max=5&apikey=${API_KEY}`;

  try {
    const res = await fetch(url);
    const data = await res.json();
    if (!data.articles || data.articles.length === 0) throw new Error();

    newsEl.innerHTML = `<h3>📰 ${symbol} 뉴스</h3>` + data.articles.map(a => `
      <div style="margin-bottom:12px; border-bottom:1px solid #eee; padding-bottom:8px;">
        <a href="${a.url}" target="_blank" style="text-decoration:none; color:#333; font-weight:bold;">${a.title}</a>
      </div>
    `).join("");
  } catch (err) {
    newsEl.innerHTML = `
      <div style="padding:20px; text-align:center; background:#f9fafb; border-radius:10px;">
        <p style="color:#666;">실시간 뉴스 API 한도가 초과되었습니다.</p>
        <p style="font-weight:bold; margin:10px 0;">아래 버튼을 눌러 소식을 확인하세요!</p>
        <div style="display:flex; gap:10px; justify-content:center;">
          <a href="https://search.naver.com/search.naver?where=news&query=${symbol}" target="_blank" style="padding:10px 15px; background:#03c75a; color:#fff; text-decoration:none; border-radius:5px;">네이버 뉴스</a>
          <a href="https://www.google.com/search?q=${symbol}&tbm=nws" target="_blank" style="padding:10px 15px; background:#4285f4; color:#fff; text-decoration:none; border-radius:5px;">구글 뉴스</a>
        </div>
      </div>`;
  }
}

/* =========================
   기타 유틸리티
========================= */
function saveStocks() { localStorage.setItem("stocks", JSON.stringify(stocks)); }
function savePrices() { localStorage.setItem("prices", JSON.stringify(prices)); }
function saveCash() { localStorage.setItem("cash", cash); }
function loadCash() { 
  cash = Number(localStorage.getItem("cash") || 0); 
  if(document.getElementById("cashInput")) document.getElementById("cashInput").value = cash;
}
function renderHistory() {
  const history = JSON.parse(localStorage.getItem("history") || "[]");
  const el = document.getElementById("history");
  if (el) el.innerHTML = history.slice().reverse().slice(0, 5).map(h => `<li>${h.date}: ${h.total.toLocaleString()}원</li>`).join("");
}
function deleteSelected() {
  const checks = document.querySelectorAll(".select-stock");
  stocks = stocks.filter((_, i) => !checks[i].checked);
  saveStocks(); render();
}
function resetAll() { if(confirm("초기화할까요?")) { localStorage.clear(); location.reload(); } }

init();
