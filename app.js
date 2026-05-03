let stocks = [];
let prices = {};
let barChart;
let pieChart;
let colorMap = {};
let cash = 0;
let exchangeRate = 1300;


function getToday() {
  return new Date().toISOString().split("T")[0];
}


function autoSaveSnapshot() {
  const history = JSON.parse(localStorage.getItem("history") || "[]");

  const today = new Date().toISOString().split("T")[0];
  const total = calculateTotal();

  const existing = history.find(h => h.date === today);

  if (existing) {
    // 오늘 이미 있으면 덮어쓰기
    existing.total = total;
  } else {
    // 없으면 추가
    history.push({
      date: today,
      total
    });
  }

  localStorage.setItem("history", JSON.stringify(history));
}


function getTotalAssets(values) {
  return values.reduce((sum, v) => sum + v, 0);
}

function saveCash() {
  localStorage.setItem("cash", cash);
}

function loadCash() {
  cash = Number(localStorage.getItem("cash") || 0);
}

function getColor(symbol) {
  if (colorMap[symbol]) return colorMap[symbol];

  const colors = [
    "#4f46e5",
    "#06b6d4",
    "#22c55e",
    "#f59e0b",
    "#ef4444",
    "#a855f7",
    "#14b8a6",
    "#f97316"
  ];

  const color = colors[Object.keys(colorMap).length % colors.length];
  colorMap[symbol] = color;

  return color;
}

/* =========================
   🌍 환율 가져오기
========================= */
async function getExchangeRate() {
  try {
    const res = await fetch("https://open.er-api.com/v6/latest/USD");
    const data = await res.json();

    exchangeRate = data.rates.KRW;

    const el = document.getElementById("exchange-rate");
    if (el) {
      el.innerText =
        "환율: 1 USD = " + exchangeRate.toLocaleString() + " KRW";
    }
  } catch (err) {
    console.error("환율 실패:", err);
  }
}

/* =========================
   📈 주식 가격 가져오기
========================= */
async function getPrice(symbol) {
  try {
    // 🇰🇷 한국 주식
    if (symbol.endsWith(".KS")) {
      const res = await fetch(
        `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${symbol}`
      );
      const data = await res.json();
      const result = data.quoteResponse.result[0];

      if (!result) return null;

      return {
        price: result.regularMarketPrice,
        currency: "KRW",
      };
    }

    // 🌍 해외 주식
    const API_KEY = "5FREZBJ18A6Y6PXY";

    const res = await fetch(
      `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${symbol}&apikey=${API_KEY}`
    );

    const data = await res.json();
    const price = data["Global Quote"]?.["05. price"];

    if (!price) return null;

    return {
      price: Number(price),
      currency: "USD",
    };
  } catch (err) {
    console.error(err);
    return null;
  }
}

/* =========================
   ➕ 종목 추가
========================= */
async function addStock() {
  const symbol = document.getElementById("symbol").value;
  const quantity = Number(document.getElementById("quantity").value);

const raw = document.getElementById("buyPrice").value;
const buyPrice = Number(raw);

if (raw === "" || isNaN(buyPrice)) {
  alert("값을 정확히 입력하세요");
  return;
}


  const quote = await getPrice(symbol);
  if (!quote) {
    alert("종목을 찾을 수 없음");
    return;
  }

  stocks.push({
    symbol,
    quantity,
    buyPrice,
    currency: quote.currency,
  });

  prices[symbol] = quote.price;


  savePrices();
  saveStocks();

  render();
}

/* =========================
   💰 총 자산 계산
========================= */
function calculateTotal() {
  let total = cash; // ⭐ 현금 포함

  stocks.forEach((stock) => {
    let value = stock.quantity * prices[stock.symbol];

    if (stock.currency === "USD") {
      value *= exchangeRate;
    }

    total += value;
  });

  return Math.round(total);
}

function calculateProfit() {
  let invested = 0;
  let current = 0;

  stocks.forEach(s => {
    const priceNow = prices[s.symbol];
    if (!priceNow || isNaN(priceNow)) return;
    const buyPrice = s.buyPrice;

    // ⭐ 방어
    if (!priceNow || !buyPrice || isNaN(priceNow) || isNaN(buyPrice)) return;

    let buy = buyPrice * s.quantity;
    let now = priceNow * s.quantity;

    if (s.currency === "USD") {
      buy *= exchangeRate;
      now *= exchangeRate;
    }

    invested += buy;
    current += now;
  });

  const profit = current - invested;
  const percent = invested > 0 ? (profit / invested) * 100 : 0;

  return { invested, current, profit, percent };
}

function renderProfit() {
  const { profit, percent } = calculateProfit();

  const el = document.getElementById("profit");

  if (!el) return;

 el.innerText =
  `수익: ${Math.floor(profit).toLocaleString()}원 (${percent.toFixed(1)}%)`;
}


function getStockProfits() {
  return stocks.map(s => {
    const priceNow = prices[s.symbol];

    if (!priceNow || !s.buyPrice) return null;

    const buyTotal = s.buyPrice * s.quantity;
    const nowTotal = priceNow * s.quantity;

    const profit = s.currency === "USD"
      ? (nowTotal - buyTotal) * exchangeRate
      : (nowTotal - buyTotal);

    const percent = buyTotal > 0
      ? (profit / (buyTotal * (s.currency === "USD" ? exchangeRate : 1))) * 100
      : 0;

    return {
      symbol: s.symbol,
      profit,
      percent
    };
  }).filter(Boolean);
}

function renderStockProfit() {
  const list = document.getElementById("stock-profit-list");
  if (!list) return;

  const data = getStockProfits();

  list.innerHTML = "";

  data.forEach(item => {
    const div = document.createElement("div");

    const color = item.profit >= 0 ? "green" : "red";

    div.innerHTML = `
      <div style="color:${color}">
        ${item.symbol}  
        ${item.percent.toFixed(2)}%  
        (${item.profit.toLocaleString()}원)
      </div>
    `;

    list.appendChild(div);
  });
}



/* =========================
   📊 그래프
========================= */
function renderCharts() {
  // 1️⃣ 라벨 (주식)
  const labels = stocks.map(s => s.symbol);

  // 2️⃣ 값 계산 (주식 + 현금용)
  const stockValues = stocks.map(s => {
    const price = prices[s.symbol];
    if (!price) return 0;

    const value = s.quantity * price;

    return s.currency === "USD"
      ? value * exchangeRate
      : value;
  });

  // 💰 현금 추가
  const allLabels = [...labels];
  const allValues = [...stockValues];
  const colors = stocks.map(s => getColor(s.symbol));

  if (cash > 0) {
    allLabels.push("💰 현금");
    allValues.push(cash);
    colors.push("#facc15");
  }

    const allValuesInt = allValues.map(v => Math.floor(v));

  // 3️⃣ 전체 자산
  const finalTotal = allValues.reduce((a, b) => a + b, 0);

  // 4️⃣ 퍼센트 라벨 생성 (핵심)
  const labelsWithPercent = allLabels.map((label, i) => {
    const percent = finalTotal > 0
      ? ((allValues[i] / finalTotal) * 100).toFixed(1)
      : 0;

    return `${label} (${percent}%)`;
  });

  // 5️⃣ 차트 초기화
  if (barChart) barChart.destroy();
  if (pieChart) pieChart.destroy();

  const ctxBar = document.getElementById("barChart");
  const ctxPie = document.getElementById("pieChart");

  if (!ctxBar || !ctxPie) return;

  // 📊 막대 그래프
  barChart = new Chart(ctxBar, {
    type: "bar",
    data: {
      labels: labelsWithPercent,
      datasets: [{
        label: `총 자산: ${Math.floor(finalTotal).toLocaleString()}원`,
        data: allValuesInt,
        backgroundColor: colors
      }]
    },
    options: {
      plugins: {
        tooltip: {
          callbacks: {
            label: function(context) {
                const value = Math.floor(context.raw);
                const percent = Math.floor((value / finalTotal) * 100);

                return `${value.toLocaleString()}원 (${percent}%)`;
                }
          }
        }
      }
    }
  });

  // 🥧 원형 그래프
  pieChart = new Chart(ctxPie, {
    type: "pie",
    data: {
      labels: labelsWithPercent,
      datasets: [{
        data: allValuesInt,
        backgroundColor: colors
      }]
    },
    options: {
      plugins: {
        tooltip: {
          callbacks: {
            label: function(context) {
              const value = context.raw;
              const percent = finalTotal > 0
                ? ((value / finalTotal) * 100).toFixed(1)
                : 0;

              return `${Math.floor(value).toLocaleString()}원 (${Math.floor(percent)}%)`;
            }
          }
        }
      }
    }
  });
}

function setCash() {
  const value = Number(document.getElementById("cashInput").value);

  cash = value;

  saveCash();
  render();
}


/* =========================
   🎨 화면 렌더링
========================= */
async function render() {
  await refreshPrices(); // ⭐ 핵심 추가
  const list = document.getElementById("stock-list");
  list.innerHTML = "";

stocks.forEach((stock, index) => {
  const price = prices[stock.symbol] || 0;

  const nowValue = price * stock.quantity;
  const buyValue = stock.buyPrice * stock.quantity;

  const nowKRW = stock.currency === "USD"
    ? nowValue * exchangeRate
    : nowValue;

  const buyKRW = stock.currency === "USD"
    ? buyValue * exchangeRate
    : buyValue;

const profit = Math.floor(nowKRW - buyKRW);
const percentRaw = buyKRW > 0 ? (profit / buyKRW) * 100 : 0;
const percent = Number(percentRaw.toFixed(1));
  const div = document.createElement("div");

  const color = profit >= 0 ? "#22c55e" : "#ef4444";

div.innerHTML = `
  <div style="border:1px solid #ddd; padding:12px; margin:8px; border-radius:10px;">

    <input type="checkbox" class="select-stock" data-index="${index}" />

    <strong>${stock.symbol}</strong><br/>

    <!-- ✔ 수정 가능 -->
    수량:
    <input type="number"
      value="${stock.quantity}"
      onchange="updateQuantity(${index}, this.value)"
      style="width:60px;" />

    <br/>

    매입가:
    <input type="number"
      value="${stock.buyPrice}"
      onchange="updateBuyPrice(${index}, this.value)"
      style="width:80px;" />

    <br/>

    현재가: ${price}<br/>

    <span style="color:${color}">
      수익: ${profit.toLocaleString()}원 (${percent}%)
    </span>

  </div>
`;

  // 👉 뉴스 연결 (나중 단계)
  div.onclick = () => renderNews(stock.symbol);

  list.appendChild(div);
});

const total = Math.floor(calculateTotal());

document.getElementById("total").innerText =
  "총 자산: " + total.toLocaleString() + "원";

  renderCharts();
  renderProfit();
  renderStockProfit();
  renderNewsStockList();
}

/* =========================
   ✏️ 수량 수정
========================= */
function updateQuantity(index, value) {
  stocks[index].quantity = Number(value);

  saveStocks();

  clearTimeout(window.renderTimer);
  window.renderTimer = setTimeout(() => {
    render();
  }, 100);
}

/* =========================
   🗑 선택 삭제
========================= */
function deleteSelected() {
  const checkboxes = document.querySelectorAll(".select-stock");

  stocks = stocks.filter((_, i) => {
    const cb = [...checkboxes].find(c => Number(c.dataset.index) === i);
    return !(cb && cb.checked);
  });

  saveStocks();
  render();
}

/* =========================
   💾 저장 / 불러오기
========================= */
function saveStocks() {
  localStorage.setItem("stocks", JSON.stringify(stocks));
}

function loadStocks() {
  stocks = JSON.parse(localStorage.getItem("stocks") || "[]");
}

function savePrices() {
  localStorage.setItem("prices", JSON.stringify(prices));
}

function loadPrices() {
  prices = JSON.parse(localStorage.getItem("prices") || "{}");
}

function loadHistory() {
  return JSON.parse(localStorage.getItem("history") || "[]");
}

/* =========================
   📊 히스토리
========================= */
function saveSnapshot() {
  const history = JSON.parse(localStorage.getItem("history") || "[]");

  const total = calculateTotal();

  if (!total || isNaN(total)) return; // ⭐ 방어

  history.push({
    date: new Date().toISOString().split("T")[0],
    total: Number(total)
  });

  localStorage.setItem("history", JSON.stringify(history));
}

function renderHistory() {
  const history = JSON.parse(localStorage.getItem("history") || "[]");
  const ul = document.getElementById("history");

  ul.innerHTML = "";

  history.forEach(item => {
    if (!item || typeof item.total !== "number") return; // ⭐ 핵심 방어

    const li = document.createElement("li");
    li.innerText = `${item.date} - ${item.total.toLocaleString()}원`;
    ul.appendChild(li);
  });
}


let historyChart;

function renderHistoryChart() {
  const history = loadHistory();

  const today = new Date().toISOString().split("T")[0];

  // ⭐ 같은 날짜는 마지막 값만 남기기
  const filtered = [];

  history.forEach(item => {
    if (!item || !item.date) return;

    const existing = filtered.find(h => h.date === item.date);

    if (existing) {
      existing.total = item.total; // 덮어쓰기
    } else {
      filtered.push(item);
    }
  });

  const labels = filtered.map(h => h.date);
  const data = filtered.map(h => h.total);

  if (historyChart) historyChart.destroy();

  const ctx = document.getElementById("historyChart");
  if (!ctx) return;

  historyChart = new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [{
        label: "자산 변화",
        data,
        borderColor: "#4f46e5",
        backgroundColor: "rgba(79, 70, 229, 0.2)",
        fill: true,
        tension: 0.3
      }]
    }
  });
}


async function getNews(keyword) {
  const API_KEY = "9a5356806279fa3e87a387d4c1fe6a14";

  try {
    const res = await fetch(
      `https://gnews.io/api/v4/search?q=${keyword}&lang=en&max=10&apikey=${API_KEY}`
    );

    const data = await res.json();

    console.log("뉴스 응답:", data);

    return data.articles || [];

  } catch (err) {
    console.error(err);
    return [];
  }
}


async function renderNews(symbol) {
  const newsEl = document.getElementById("news");

  newsEl.innerHTML = `<p>🔍 ${symbol} 뉴스 불러오는 중...</p>`;

  let articles = await getNews(symbol);

  if (articles.length === 0) {
    articles = await getNews(fallbackKeyword(symbol));
  }

  newsEl.innerHTML = `<h4>📰 ${symbol} 뉴스</h4>`;

  if (!articles.length) {
    newsEl.innerHTML += "<p>뉴스 없음</p>";
    return;
  }

  articles.forEach(a => {
    const div = document.createElement("div");

    div.innerHTML = `
      <div style="
        border:1px solid #eee;
        padding:10px;
        margin:10px 0;
        border-radius:10px;
      ">
        ${a.image ? `
          <img src="${a.image}"
            style="width:100%; max-height:120px; object-fit:cover; border-radius:8px;">
        ` : ""}

        <a href="${a.url}" target="_blank"
          style="font-weight:bold; text-decoration:none;">
          ${a.title}
        </a>

        <div style="font-size:12px; color:gray;">
          ${a.source.name} · ${a.publishedAt.split("T")[0]}
        </div>
      </div>
    `;

    newsEl.appendChild(div);
  });
}

function fallbackKeyword(symbol) {
  const map = {
    "NVDA": "NVIDIA",
    "AAPL": "Apple",
    "TSLA": "Tesla",
    "MSFT": "Microsoft",
    "005930.KS": "Samsung Electronics"
  };

  return map[symbol] || symbol;
}

function fallbackKeyword(symbol) {
  if (symbol.includes(".KS")) return "삼성전자";
  if (symbol === "AAPL") return "Apple";
  if (symbol === "TSLA") return "Tesla";
  if (symbol === "MSFT") return "Microsoft";
  return symbol;
}

function showTab(tab) {
  document.getElementById("asset-tab").style.display =
    tab === "asset" ? "block" : "none";

  document.getElementById("news-tab").style.display =
    tab === "news" ? "block" : "none";

  // 👇 선택된 탭 강조
  document.querySelectorAll("#tabbar button").forEach(btn => {
    btn.style.color = "#999";
  });

  document.getElementById(tab + "-btn").style.color = "#4f46e5";
}


function renderNewsStockList() {
  const el = document.getElementById("news-stock-list");
  el.innerHTML = "";

  stocks.forEach(stock => {
    const div = document.createElement("div");

    div.innerHTML = `
      <div style="
        border:1px solid #ddd;
        padding:12px;
        margin:8px 0;
        border-radius:10px;
        cursor:pointer;
        background:white;
        box-shadow:0 2px 6px rgba(0,0,0,0.05);
        font-weight:bold;
      ">
        📈 ${stock.symbol}
      </div>
    `;

    // 👉 클릭 이벤트 (핵심)
    div.onclick = () => renderNews(stock.symbol);

    el.appendChild(div);
  });
}


/* =========================
   🔄 초기화
========================= */
function resetAll() {
  if (!confirm("전체 삭제할까요?")) return;

  stocks = [];
  prices = {};

  localStorage.clear();

  render();
  renderHistory();
}

function updateBuyPrice(index, value) {
  const num = Number(value);

  if (value === "" || isNaN(num)) {
    alert("값을 정확히 입력하세요");
    return;
  }

  stocks[index].buyPrice = num;

  saveStocks();
  render();
}


function updateBuyPrice(index, value) {
  const num = Number(value);

  if (value === "" || isNaN(num)) {
    alert("값을 정확히 입력하세요");
    return;
  }

  stocks[index].buyPrice = num;

  saveStocks();

  // ⭐ 핵심: 반드시 render
  render();
}

async function refreshPrices() {
  for (let stock of stocks) {
    const quote = await getPrice(stock.symbol);
    if (quote) {
      prices[stock.symbol] = quote.price;
    }
  }
}

/* =========================
   🚀 시작
========================= */
async function init() {
  await getExchangeRate();

  loadCash();
  loadPrices();
  loadStocks();

  await render();
  renderHistory();

  // ⭐ 핵심: 오늘 데이터만 자동 갱신
  autoSaveSnapshot();

  setTimeout(renderHistoryChart, 0);
}

init();



