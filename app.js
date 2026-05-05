/* =========================
   변수 및 초기화 설정
========================= */
let stocks = JSON.parse(localStorage.getItem("stocks") || "[]");
let prices = JSON.parse(localStorage.getItem("prices") || "{}");
let cash = Number(localStorage.getItem("cash") || 0);
let exchangeRate = 1350;

/* =========================
   📈 차트 인스턴스 전역 관리
========================= */
let myBarChart = null;
let myPieChart = null;
let myHistoryChart = null;



const colorPalette = [
  '#10b981', '#4f46e5', '#f59e0b', '#ef4444', '#8b5cf6', 
  '#06b6d4', '#ec4899', '#f97316', '#14b8a6', '#6366f1'
];


/*
async function init() {
  loadCash();
  await getExchangeRate();
  if (stocks.length > 0) await refreshPrices();
  showTab('asset'); 
  render();           // 메인 렌더링 (리스트 + Bar + Pie)
  renderHistory();    // 텍스트 히스토리 렌더링
  renderHistoryChart(); // 자산 추이 그래프 렌더링
}*/

async function init() {
  try {
    loadCash(); // 1. 로컬 데이터 먼저 로드
    
    // 2. 환율 로드를 기다림 (성공하든 실패하든 다음으로 넘어감)
    await getExchangeRate(); 
    
    // 3. 종목 가격 업데이트
    if (stocks.length > 0) {
      await refreshPrices();
    }
    
    // 4. 모든 데이터 준비 후 UI 렌더링
    render();           
    renderHistory();    
    renderHistoryChart();
    showTab('asset');
    
  } catch (err) {
    console.error("초기화 중 오류:", err);
  }

  // init 함수 마지막 부분에 추가
setInterval(async () => {
    console.log("주가 자동 갱신 중...");
    await getExchangeRate()
    await refreshPrices();
    render(); // 가격 갱신 후 화면 다시 그리기
}, 600000); // 600000ms = 10분마다 갱신
}




/* =========================
   🌍 데이터 통신 및 저장
========================= */
/* 수정된 getExchangeRate */
async function getExchangeRate() {
  const el = document.getElementById("exchange-rate");
  try {
    // 주소 뒤에 ?_=(시간) 을 붙여 브라우저 캐시를 방지합니다.
    const res = await fetch(`https://open.er-api.com/v6/latest/USD?_=${new Date().getTime()}`);
    if (!res.ok) throw new Error("네트워크 응답 에러");
    
    const data = await res.json();
    exchangeRate = data.rates.KRW;
    
    if (el) el.innerText = `환율: 1 USD = ${exchangeRate.toLocaleString()} KRW`;
    return exchangeRate;
  } catch (err) {
    console.error("환율 로드 실패", err);
    return exchangeRate; 
  }
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

// 1초 쉬어가는 함수
const sleep = (ms) => new Promise(res => setTimeout(res, ms));

async function refreshPrices() {
  console.log("주가 업데이트 시작...");
  for (let stock of stocks) {
    const quote = await getPrice(stock.symbol);
    if (quote) {
      prices[stock.symbol] = quote.price;
      console.log(`${stock.symbol} 업데이트 완료: ${quote.price}`);
    }
    // 무료 API 제한을 피하기 위해 종목당 1초씩 대기 (권장)
    await sleep(1000); 
  }
  savePrices();
  console.log("모든 주가 업데이트 종료");
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

// 현금 입출금 처리
function adjustCash(type) {
  const amount = Number(document.getElementById("cashAmountInput").value) || 0;
  if (amount <= 0) return alert("금액을 입력하세요.");
  
  if (type === 'plus') {
    cash += amount;
  } else if (type === 'minus') {
    if (cash < amount) return alert("잔액이 부족합니다.");
    cash -= amount;
  }
  
  saveCash();
  document.getElementById("cashAmountInput").value = ""; // 입력창 초기화
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

function editStock(index) {
  const s = stocks[index];
  const newQty = prompt(`${s.symbol}의 새로운 수량을 입력하세요:`, s.quantity);
  const newPrice = prompt(`${s.symbol}의 새로운 평단가를 입력하세요:`, s.buyPrice);

  if (newQty !== null && newPrice !== null) {
    stocks[index].quantity = Number(newQty);
    stocks[index].buyPrice = Number(newPrice);
    saveStocks();
    render();
  }
}

/* =========================
   🎨 UI 및 비중 렌더링 (보완 완료)
========================= */
function render() {
  const list = document.getElementById("stock-list");
  if (!list) return;
  list.innerHTML = "";

  // 1. 총 자산 계산
  let currentStockValueTotal = 0;
  stocks.forEach(s => {
    let v = (prices[s.symbol] || 0) * s.quantity;
    if (s.currency === "USD") v *= exchangeRate;
    currentStockValueTotal += v;
  });
  const totalAssets = cash + currentStockValueTotal;

  // 2. 현금 비중 카드 생성
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

  // 3. 종목 카드 리스트 생성 (index 인자 추가로 editStock 오류 해결)
  stocks.forEach((stock, index) => {
    const currentPrice = prices[stock.symbol] || 0;
    const isUSD = stock.currency === "USD";
    
    // 현재 가치 계산 (환율 반영)
    const currentTotal = (currentPrice * stock.quantity) * (isUSD ? exchangeRate : 1);
    
    // 비중 계산
    const weight = totalAssets > 0 ? ((currentTotal / totalAssets) * 100).toFixed(1) : 0;
    
    // 수익 및 수익률 계산
    const buyTotal = (stock.buyPrice * stock.quantity) * (isUSD ? exchangeRate : 1);
    const profit = currentTotal - buyTotal;
    const percent = buyTotal > 0 ? (profit / buyTotal) * 100 : 0;

    const div = document.createElement("div");
    div.className = "stock-card";
    div.style = "border:1px solid #ddd; padding:15px; margin:10px 0; border-radius:12px; background:#fff; position:relative;";
    
    // 카드 내부 레이아웃
    div.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center;" onclick="showTab('news'); renderNews('${stock.symbol}')">
        <strong>${stock.symbol}</strong>
        <span style="font-size:0.8rem; color:#666;">비중 ${weight}%</span>
      </div>
      <div style="margin-top:8px; font-weight:bold; color:${profit >= 0 ? '#ef4444' : '#3b82f6'}" onclick="showTab('news'); renderNews('${stock.symbol}')">
        수익: ${Math.floor(profit).toLocaleString()}원 (${percent.toFixed(2)}%)
      </div>
      <div style="margin-top:10px; display:flex; gap:10px; align-items:center;">
        <!-- 수정 버튼: 클릭 시 카드 클릭 이벤트(뉴스 이동) 방지 -->
        <button onclick="event.stopPropagation(); editStock(${index})" style="padding:5px 12px; font-size:0.8rem; border:1px solid #4f46e5; background:white; color:#4f46e5; border-radius:6px; cursor:pointer; font-weight:bold;">수정</button>
        
        <!-- 삭제용 체크박스 -->
        <input type="checkbox" class="select-stock" style="margin-left:auto; width:18px; height:18px;" onclick="event.stopPropagation()">
      </div>
    `;
    
    list.appendChild(div);
  });

  // 4. 하단 총액 및 차트 업데이트
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
   📊 1. 종목 비중 차트 (Bar & Pie)
========================= */
function renderCharts() {
    const ctxBar = document.getElementById("barChart");
    const ctxPie = document.getElementById("pieChart");
    if (!ctxBar || !ctxPie) return;

    // 데이터 준비
    const labels = ["현금", ...stocks.map(s => s.symbol)];
    const values = [cash, ...stocks.map(s => {
        let v = (prices[s.symbol] || 0) * s.quantity;
        return s.currency === "USD" ? v * exchangeRate : v;
    })];
    const backgroundColors = labels.map((_, i) => colorPalette[i % colorPalette.length]);

    // [핵심] 기존 차트 파괴 (메모리 및 캔버스 초기화)
    if (myBarChart) myBarChart.destroy();
    if (myPieChart) myPieChart.destroy();

    // 차트 생성 시 responsive 옵션 최적화
    const chartOptions = {
        responsive: true,
        maintainAspectRatio: false, // 컨테이너 높이에 맞춤
        animation: false, // 무한 루프 시 시각적 떨림 방지
        plugins: {
            legend: { display: true, position: 'bottom' }
        }
    };

    myBarChart = new Chart(ctxBar, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{ label: '자산 가치(원)', data: values, backgroundColor: backgroundColors }]
        },
        options: { ...chartOptions, plugins: { legend: { display: false } } }
    });

    myPieChart = new Chart(ctxPie, {
        type: 'pie',
        data: {
            labels: labels,
            datasets: [{ data: values, backgroundColor: backgroundColors }]
        },
        options: chartOptions
    });
}

/* =========================
   📈 2. 자산 추이 그래프 (Line)
========================= */
// 차트 인스턴스 전역 변수 (중복 생성 방지)

function renderHistoryChart() {
  const ctx = document.getElementById("historyChart");
  if (!ctx) return;

  const history = JSON.parse(localStorage.getItem("history") || "[]");
  if (history.length === 0) return;

  // X축: 날짜, Y축: 자산 총액
  const labels = history.map(h => h.date);
  const data = history.map(h => h.total);

  // 기존 차트 파괴 (이게 없으면 버그가 생김)
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
        tension: 0.3, // 곡선 완만하게
        pointRadius: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false, // [중요] 애니메이션을 꺼야 루프에 안 빠짐
      plugins: {
        legend: { display: false }
      },
      scales: {
        y: {
          beginAtZero: false,
          ticks: {
            callback: (val) => val.toLocaleString() + '원'
          }
        }
      }
    }
  });
}

/* =========================
/* =========================
   📅 자산 스냅샷 저장 (Daily Update)
========================= */
function saveSnapshot() {
  const history = JSON.parse(localStorage.getItem("history") || "[]");
  const now = new Date();
  // '2024-05-20' 형식으로 날짜 고정 (Daily 기준)
  const today = now.toISOString().split('T')[0]; 

  // 현재 총 자산 계산
  let currentStockValueTotal = 0;
  stocks.forEach(s => {
    let v = (prices[s.symbol] || 0) * s.quantity;
    if (s.currency === "USD") v *= exchangeRate;
    currentStockValueTotal += v;
  });
  const totalAssets = Math.round(cash + currentStockValueTotal);

  // 같은 날짜 데이터가 있는지 확인
  const existingIdx = history.findIndex(h => h.date === today);
  
  if (existingIdx > -1) {
    // 오늘 이미 기록했다면 금액만 업데이트
    history[existingIdx].total = totalAssets;
  } else {
    // 새로운 날짜라면 추가
    history.push({ date: today, total: totalAssets });
  }

  // 최근 30일 데이터만 유지 (선택 사항)
  if (history.length > 30) history.shift();

  localStorage.setItem("history", JSON.stringify(history));
  
  // [중요] 렌더링 순서: 데이터 저장 -> 화면 텍스트 갱신 -> 차트 갱신
  renderHistory();
  renderHistoryChart(); 
  
  alert(`[${today}] 자산이 기록되었습니다: ${totalAssets.toLocaleString()}원`);
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
