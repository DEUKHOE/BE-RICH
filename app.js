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
/* =========================
   🌍 데이터 통신 보완 (한국 주식 대응)
========================= */
async function getPrice(symbol) {
  const API_KEY = '831c116330c04eedb39cc260b03e7ba8'; 
  
  // 1. 심볼 변환 (005930.KS -> 005930)
  let cleanSymbol = symbol.toUpperCase().trim();
  let isKorean = false;

  if (cleanSymbol.endsWith(".KS") || cleanSymbol.endsWith(".KQ")) {
    isKorean = true;
    cleanSymbol = cleanSymbol.split(".")[0]; // 숫자 부분만 추출
  }

  // 2. URL 생성 (한국 주식은 명확하게 하기 위해 :XKRX를 붙이기도 함)
  // Twelve Data 무료플랜에서는 숫자 심볼만으로도 인식하는 경우가 많습니다.
  const url = `https://api.twelvedata.com/price?symbol=${cleanSymbol}&apikey=${API_KEY}`;

  try {
    const res = await fetch(url);
    const data = await res.json();
    
    // API 에러 핸들링 (분당 호출 횟수 초과 등)
    if (data.code === 429) {
      console.error("API 호출 한도 초과! 1분 뒤에 시도하세요.");
      return null;
    }

    if (!data.price) {
      console.error(`${symbol} 가격을 찾을 수 없음:`, data.message);
      return null;
    }

    return { 
      price: parseFloat(data.price), 
      currency: isKorean ? "KRW" : "USD" 
    };
  } catch (err) { 
    console.error("네트워크 에러:", err);
    return null; 
  }
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
  // Number()는 소수점을 보존하지만, 명확하게 parseFloat를 써주는 것도 좋습니다.
  const quantity = parseFloat(qtyInput.value); 
  const buyPrice = parseFloat(buyInput.value);

  if (!symbol || isNaN(quantity) || quantity <= 0) return alert("올바른 값을 입력하세요.");
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
   🎨 UI 및 비중 렌더링 (버그 수정 완료)
========================= */
function render() {
  const list = document.getElementById("stock-list");
  if (!list) return;
  list.innerHTML = "";

  let currentStockValueTotal = 0;
  stocks.forEach(s => {
    let v = (prices[s.symbol] || 0) * s.quantity;
    // [버그 수정] 통화가 USD일 때만 환율을 곱함 (BTC/KRW는 제외)
    if (s.currency === "USD") v *= exchangeRate;
    currentStockValueTotal += v;
  });
  const totalAssets = cash + currentStockValueTotal;

  // 현금 카드 생성 로직 (기존과 동일)
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

  // 종목 카드 리스트 (환율 중복 계산 방지 적용)
  stocks.forEach((stock, index) => {
    const currentPrice = prices[stock.symbol] || 0;
    const isKRW = stock.currency === "KRW" || stock.symbol.includes("/KRW");
    
    // 현재 가치: KRW 계열이면 환율 안 곱함
    const currentTotal = (currentPrice * stock.quantity) * (isKRW ? 1 : exchangeRate);
    const weight = totalAssets > 0 ? ((currentTotal / totalAssets) * 100).toFixed(1) : 0;
    
    // 수익 계산: 매수 시점 원화 가치와 현재 원화 가치 비교
    const buyTotal = (stock.buyPrice * stock.quantity) * (isKRW ? 1 : exchangeRate);
    const profit = currentTotal - buyTotal;
    const percent = buyTotal > 0 ? (profit / buyTotal) * 100 : 0;

    const div = document.createElement("div");
    div.className = "stock-card";
    div.style = "border:1px solid #ddd; padding:15px; margin:10px 0; border-radius:12px; background:#fff;";
    div.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <strong>${stock.symbol} <span style="font-size:0.7rem; color:#999;">(${stock.quantity})</span></strong>
        <span style="font-size:0.8rem; color:#666;">비중 ${weight}%</span>
      </div>
      <div style="margin-top:8px; font-weight:bold; color:${profit >= 0 ? '#ef4444' : '#3b82f6'}">
        수익: ${Math.floor(profit).toLocaleString()}원 (${percent.toFixed(2)}%)
      </div>
      <div style="margin-top:10px; display:flex; gap:10px; align-items:center;">
        <button onclick="event.stopPropagation(); editStock(${index})" style="padding:5px 12px; font-size:0.8rem; border:1px solid #4f46e5; background:white; color:#4f46e5; border-radius:6px;">수정</button>
        <input type="checkbox" class="select-stock" style="margin-left:auto; width:18px; height:18px;">
      </div>
    `;
    list.appendChild(div);
  });

  updateTotalAndProfit(totalAssets);
  renderCharts(totalAssets);
}

/* =========================
   📊 그래프 상시 숫자 표시 및 오류 수정
========================= */
function renderCharts(totalAssets) {
  const ctxBar = document.getElementById("barChart");
  const ctxPie = document.getElementById("pieChart");

  if (!ctxBar || !ctxPie) {
    console.error("차트를 그릴 canvas 엘리먼트를 찾을 수 없습니다.");
    return;
  }

  // 데이터가 없을 때의 예외 처리
  const hasData = stocks.length > 0 || cash > 0;
  if (!hasData) {
    console.warn("표시할 자산 데이터가 없습니다.");
    return;
  }

  const labels = ["현금", ...stocks.map(s => s.symbol)];
  const values = [cash, ...stocks.map(s => {
    let v = (prices[s.symbol] || 0) * s.quantity;
    const isKRW = s.currency === "KRW" || s.symbol.includes("/KRW");
    return isKRW ? v : v * exchangeRate;
  })];
  
  const backgroundColors = labels.map((_, i) => colorPalette[i % colorPalette.length]);

  if (myBarChart) myBarChart.destroy();
  if (myPieChart) myPieChart.destroy();

  try {
    // 파이 차트
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
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom' }
        }
      }
    });

    // 막대 차트
    myBarChart = new Chart(ctxBar, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [{
          data: values,
          backgroundColor: backgroundColors
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: { beginAtZero: true, ticks: { display: false } }
        },
        plugins: {
          legend: { display: false }
        }
      }
    });
    console.log("차트 렌더링 완료");
  } catch (err) {
    console.error("차트 생성 중 오류 발생:", err);
  }
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
   💰 총 자산 및 수익률 텍스트 업데이트
========================= */
function updateTotalAndProfit(totalAssets) {
  const totalEl = document.getElementById("total");
  const profitEl = document.getElementById("profit");
  if (!totalEl || !profitEl) return;

  // 총 자산 표시
  totalEl.innerText = `총 자산: ${Math.floor(totalAssets).toLocaleString()}원`;

  // 수익금 및 수익률 계산 (모든 종목 합산)
  let totalProfit = 0;
  let totalBuyValue = 0;

  stocks.forEach(s => {
    const currentPrice = prices[s.symbol] || 0;
    const isKRW = s.currency === "KRW" || s.symbol.includes("/KRW");
    
    const currentVal = (currentPrice * s.quantity) * (isKRW ? 1 : exchangeRate);
    const buyVal = (s.buyPrice * s.quantity) * (isKRW ? 1 : exchangeRate);
    
    totalProfit += (currentVal - buyVal);
    totalBuyValue += buyVal;
  });

  const totalPercent = totalBuyValue > 0 ? ((totalProfit / totalBuyValue) * 100).toFixed(2) : 0;
  
  profitEl.style.color = totalProfit >= 0 ? "#ef4444" : "#3b82f6";
  profitEl.innerText = `총 수익: ${Math.floor(totalProfit).toLocaleString()}원 (${totalPercent}%)`;
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

function resetAll() {
  if (confirm("모든 자산 데이터와 히스토리가 삭제됩니다. 정말 초기화할까요?")) {
    localStorage.clear();
    location.reload(); // 페이지 새로고침하여 초기 상태로 복구
  }
}

init();
