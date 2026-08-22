/* =========================================================
   관리자 통계 페이지 - admin.js
   초보자용 한글 주석 포함
   ========================================================= */

/* =========================================================
   ★★★ 설정 — 여기 세 줄만 바꾸면 됩니다 ★★★
   ========================================================= */

// ↓↓↓ script.js에 넣은 값과 똑같이 넣으세요 ↓↓↓
const SUPABASE_URL = "https://ihxhbiqpguahmftgedka.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_H0mEZ30L0mlqEX6BCixcJw_qt4YsNXO";

// ↓↓↓ 관리자 비밀번호 (수업 전에 꼭 바꾸세요) ↓↓↓
const ADMIN_PASSWORD = "admin1234";

/* ---------------------------------------------------------
   ※ 꼭 알아두세요 — 이 비밀번호는 '진짜 보안'이 아닙니다.

   비밀번호가 이 파일 안에 그대로 적혀 있어서, 브라우저에서
   admin.js 파일을 열어보면 누구나 볼 수 있습니다.
   "우연히 들어오는 사람을 막는 자물쇠" 정도로만 생각하세요.

   데이터를 정말로 보호하려면 Supabase 쪽에서 막아야 합니다.
   (자세한 방법은 파일 맨 아래 설명을 참고하세요)
--------------------------------------------------------- */

// 최근 참여자 목록을 몇 명까지 불러올지
const LIST_LIMIT = 200;

// 유형 정보 (script.js의 것과 같은 색상·이름을 사용합니다)
const TYPE_INFO = {
  IDEA: { emoji: "💡", name: "아이디어 탐험가", color: "#f5a623" },
  ACTION: { emoji: "🚀", name: "실행 돌격대장", color: "#ef4d5a" },
  DATA: { emoji: "📊", name: "데이터 전략가", color: "#3b6ef6" },
  PEOPLE: { emoji: "🤝", name: "관계 연결자", color: "#22b07d" }
};
const TYPE_KEYS = ["IDEA", "ACTION", "DATA", "PEOPLE"];

/* ---------------------------------------------------------
   1) 화면 요소 가져오기
--------------------------------------------------------- */
const gate = document.getElementById("gate");
const dashboard = document.getElementById("dashboard");
const passwordInput = document.getElementById("password");
const gateError = document.getElementById("gate-error");
const btnUnlock = document.getElementById("btn-unlock");
const btnRefresh = document.getElementById("btn-refresh");
const btnCsv = document.getElementById("btn-csv");
const btnLock = document.getElementById("btn-lock");

const statusEl = document.getElementById("admin-status");
const contentEl = document.getElementById("admin-content");
const updatedAtEl = document.getElementById("updated-at");

// 불러온 데이터를 담아두는 곳 (CSV 저장할 때 다시 사용합니다)
let loadedRows = [];

/* ---------------------------------------------------------
   2) Supabase 연결하기
--------------------------------------------------------- */
let supabaseClient = null;

function initSupabase() {
  if (typeof window.supabase === "undefined") {
    console.warn("[Supabase] 라이브러리를 불러오지 못했습니다. 인터넷 연결을 확인하세요.");
    return;
  }
  if (SUPABASE_URL.indexOf("여기에") !== -1 || SUPABASE_ANON_KEY.indexOf("여기에") !== -1) {
    console.warn("[Supabase] admin.js 위쪽의 URL과 키를 먼저 입력하세요.");
    return;
  }
  try {
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    console.log("[Supabase] 연결 준비 완료");
  } catch (e) {
    console.error("[Supabase] 연결 생성 실패:", e);
    supabaseClient = null;
  }
}

/* ---------------------------------------------------------
   3) 비밀번호 확인 (잠금 해제)
   - 한 번 들어가면 탭을 닫을 때까지는 다시 묻지 않습니다.
     (sessionStorage = 탭을 닫으면 지워지는 임시 저장소)
--------------------------------------------------------- */
function unlock() {
  if (passwordInput.value !== ADMIN_PASSWORD) {
    gateError.textContent = "비밀번호가 올바르지 않습니다.";
    passwordInput.focus();
    return;
  }

  gateError.textContent = "";
  passwordInput.value = "";

  try {
    sessionStorage.setItem("admin_unlocked", "yes");
  } catch (e) {
    // 브라우저 설정에 따라 저장이 막힐 수 있지만, 화면 표시에는 문제없습니다.
    console.warn("세션 저장에 실패했습니다. 새로고침하면 다시 물어봅니다.", e);
  }

  showDashboard();
}

function showDashboard() {
  gate.hidden = true;
  dashboard.hidden = false;
  loadDashboard();
}

function lock() {
  try {
    sessionStorage.removeItem("admin_unlocked");
  } catch (e) {
    console.warn("세션 삭제 실패:", e);
  }
  dashboard.hidden = true;
  gate.hidden = false;
  passwordInput.value = "";
  gateError.textContent = "";
}

/* ---------------------------------------------------------
   4) 데이터 불러오기 (핵심)

   - 필요한 요청을 한꺼번에 보내고(Promise.all) 모두 끝나면 화면을 그립니다.
     ① 전체 인원 수         : 개수만 요청
     ② 유형별 인원 수 4개   : 개수만 요청
     ③ 최근 참여자 목록     : 실제 데이터 (최근 200명)
--------------------------------------------------------- */
async function loadDashboard() {
  setStatus("통계를 불러오는 중입니다...", false);
  contentEl.hidden = true;
  setButtonsDisabled(true);

  if (supabaseClient === null) {
    setStatus(
      "통계를 불러올 수 없습니다. admin.js의 Supabase URL과 키를 확인하세요. " +
        "(자세한 원인은 F12 → Console 탭에서 볼 수 있습니다)",
      true
    );
    setButtonsDisabled(false);
    return;
  }

  try {
    const requests = [
      // ① 전체 인원 (조건 없이 개수만)
      supabaseClient.from("test_results").select("*", { count: "exact", head: true }),

      // ② 유형별 인원
      ...TYPE_KEYS.map(function (key) {
        return supabaseClient
          .from("test_results")
          .select("*", { count: "exact", head: true })
          .eq("result_type", key);
      }),

      // ③ 최근 참여자 목록 (최신순)
      supabaseClient
        .from("test_results")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(LIST_LIMIT)
    ];

    const res = await Promise.all(requests);

    // 하나라도 오류가 있으면 전체를 실패로 처리합니다.
    for (let i = 0; i < res.length; i++) {
      if (res[i].error) {
        throw res[i].error;
      }
    }

    const total = res[0].count || 0;

    const counts = {};
    TYPE_KEYS.forEach(function (key, i) {
      counts[key] = res[i + 1].count || 0; // res[1]~res[4]가 유형별 결과
    });

    const rows = res[5].data || [];
    loadedRows = rows;

    console.log("[Supabase] 불러오기 성공 ✅ 전체 " + total + "명, 목록 " + rows.length + "건");

    // 화면 그리기
    renderSummary(total, counts, rows);
    renderTypeChart(counts, total);
    renderTrend(rows);
    renderList(rows, total);

    updatedAtEl.textContent = "마지막 업데이트 " + formatTime(new Date());
    setStatus("", false);
    contentEl.hidden = false;
  } catch (e) {
    console.error("[Supabase] 통계 불러오기 실패:", e.message || e);
    console.error("  · 상세 내용:", e);
    console.error(
      "  · 자주 나오는 원인: ① RLS의 select(읽기) 정책 미설정 " +
        "② test_results 테이블 없음 ③ URL·키 오타 ④ 인터넷 연결 문제"
    );
    setStatus("통계를 불러올 수 없습니다. (F12 → Console 탭에서 원인을 확인하세요)", true);
  }

  setButtonsDisabled(false);
}

/* ---------------------------------------------------------
   5) 요약 카드 3개 그리기
--------------------------------------------------------- */
function renderSummary(total, counts, rows) {
  // 전체 참여자
  document.getElementById("sum-total").innerHTML =
    total + '<span class="unit">명</span>';

  // 오늘 참여자 (불러온 목록에서 오늘 날짜만 셈)
  const todayKey = dateKey(new Date());
  let todayCount = 0;
  rows.forEach(function (r) {
    if (r.created_at && dateKey(new Date(r.created_at)) === todayKey) {
      todayCount++;
    }
  });
  document.getElementById("sum-today").innerHTML =
    todayCount + '<span class="unit">명</span>';

  // 가장 많은 유형
  const topEl = document.getElementById("sum-top");
  if (total === 0) {
    topEl.textContent = "-";
  } else {
    let topKey = TYPE_KEYS[0];
    TYPE_KEYS.forEach(function (k) {
      if (counts[k] > counts[topKey]) topKey = k;
    });
    const info = TYPE_INFO[topKey];
    topEl.innerHTML =
      info.emoji + " " + info.name + '<span class="unit">' + counts[topKey] + "명</span>";
  }
}

/* ---------------------------------------------------------
   6) 유형별 분포 막대 그리기
   - 참여자가 0명이어도 오류 없이 0%로 표시됩니다.
--------------------------------------------------------- */
function renderTypeChart(counts, total) {
  const chart = document.getElementById("type-chart");
  chart.innerHTML = "";

  // 가장 많은 유형을 진하게 표시하기 위해 최고 인원을 구합니다.
  let max = 0;
  TYPE_KEYS.forEach(function (k) {
    if (counts[k] > max) max = counts[k];
  });

  TYPE_KEYS.forEach(function (key) {
    const info = TYPE_INFO[key];
    const n = counts[key] || 0;

    // ★ 0으로 나누면 오류가 나므로 total이 0이면 0%로 둡니다.
    const percent = total === 0 ? 0 : Math.round((n / total) * 100);

    const row = document.createElement("div");
    row.className = "chart-row" + (n === max && max > 0 ? " top" : "");
    row.innerHTML =
      '<span class="chart-label">' + info.emoji + " " + info.name + "</span>" +
      '<span class="chart-track"><span class="chart-fill" style="background:' +
      info.color + '"></span></span>' +
      '<span class="chart-value stats-value">' + percent + "% · " + n + "명</span>";

    chart.appendChild(row);

    setTimeout(function () {
      row.querySelector(".chart-fill").style.width = percent + "%";
    }, 60);
  });
}

/* ---------------------------------------------------------
   7) 최근 7일 참여 추이 그리기 (세로 막대)
--------------------------------------------------------- */
function renderTrend(rows) {
  const trend = document.getElementById("trend-chart");
  trend.innerHTML = "";

  // (1) 최근 7일치 날짜 상자를 미리 만듭니다. (오늘이 맨 오른쪽)
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push({ key: dateKey(d), date: d, count: 0 });
  }

  // (2) 참여 기록을 날짜별로 세어 넣습니다.
  rows.forEach(function (r) {
    if (!r.created_at) return;
    const k = dateKey(new Date(r.created_at));
    const box = days.find(function (d) { return d.key === k; });
    if (box) box.count++;
  });

  // (3) 가장 많은 날을 기준으로 막대 높이를 정합니다.
  let max = 0;
  days.forEach(function (d) { if (d.count > max) max = d.count; });

  const dayNames = ["일", "월", "화", "수", "목", "금", "토"];

  days.forEach(function (d, i) {
    // ★ max가 0이어도 오류가 나지 않도록 처리
    const heightPercent = max === 0 ? 0 : Math.round((d.count / max) * 100);

    const col = document.createElement("div");
    col.className = "trend-col" + (d.count === 0 ? " zero" : "") + (i === 6 ? " today" : "");
    col.innerHTML =
      '<span class="trend-num">' + d.count + "</span>" +
      '<span class="trend-bar"></span>' +
      '<span class="trend-day">' +
      (i === 6 ? "오늘" : (d.date.getMonth() + 1) + "/" + d.date.getDate() +
        "(" + dayNames[d.date.getDay()] + ")") +
      "</span>";

    trend.appendChild(col);

    setTimeout(function () {
      // 막대 영역(전체 높이에서 글자 자리를 뺀 만큼)에 비율을 적용합니다.
      col.querySelector(".trend-bar").style.height = "calc((100% - 44px) * " + heightPercent / 100 + ")";
    }, 60);
  });
}

/* ---------------------------------------------------------
   8) 최근 참여자 목록(표) 그리기
--------------------------------------------------------- */
function renderList(rows, total) {
  const body = document.getElementById("list-body");
  const empty = document.getElementById("list-empty");
  const countLabel = document.getElementById("list-count");

  body.innerHTML = "";

  // 참여자가 없을 때
  if (rows.length === 0) {
    empty.hidden = false;
    countLabel.textContent = "";
    return;
  }
  empty.hidden = true;

  countLabel.textContent =
    total > rows.length
      ? "전체 " + total + "명 중 최근 " + rows.length + "명"
      : rows.length + "명";

  rows.forEach(function (r, i) {
    const info = TYPE_INFO[r.result_type] || { emoji: "❓", name: r.result_type || "알 수 없음", color: "#9aa0b5" };

    const tr = document.createElement("tr");
    tr.innerHTML =
      '<td class="rank">' + (i + 1) + "</td>" +
      '<td class="nick">' + escapeHtml(r.nickname) + "</td>" +
      '<td><span class="type-badge" style="background:' + info.color + '">' +
        info.emoji + " " + info.name + "</span></td>" +
      '<td class="num">' + numOrDash(r.idea_score) + "</td>" +
      '<td class="num">' + numOrDash(r.action_score) + "</td>" +
      '<td class="num">' + numOrDash(r.data_score) + "</td>" +
      '<td class="num">' + numOrDash(r.people_score) + "</td>" +
      '<td class="time">' + (r.created_at ? formatTime(new Date(r.created_at)) : "-") + "</td>";

    body.appendChild(tr);
  });
}

/* ---------------------------------------------------------
   9) CSV 파일로 저장하기
   - 엑셀에서 열었을 때 한글이 깨지지 않도록 맨 앞에 BOM을 붙입니다.
--------------------------------------------------------- */
function downloadCsv() {
  if (loadedRows.length === 0) {
    alert("저장할 데이터가 없습니다.");
    return;
  }

  const header = ["닉네임", "유형", "유형명", "IDEA", "ACTION", "DATA", "PEOPLE", "참여시각"];

  const lines = [header.join(",")];
  loadedRows.forEach(function (r) {
    const info = TYPE_INFO[r.result_type];
    lines.push([
      csvCell(r.nickname),
      csvCell(r.result_type),
      csvCell(info ? info.name : ""),
      numOrDash(r.idea_score),
      numOrDash(r.action_score),
      numOrDash(r.data_score),
      numOrDash(r.people_score),
      csvCell(r.created_at ? formatTime(new Date(r.created_at)) : "")
    ].join(","));
  });

  const csv = "﻿" + lines.join("\r\n"); // ﻿ = 엑셀 한글 깨짐 방지
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });

  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "창업가유형_참여자_" + dateKey(new Date()) + ".csv";
  a.click();
  URL.revokeObjectURL(a.href);
}

/* ---------------------------------------------------------
   10) 자주 쓰는 작은 도구 함수들
--------------------------------------------------------- */

// 화면 위쪽 상태 메시지 표시 (isError가 true면 빨간 상자)
function setStatus(text, isError) {
  statusEl.textContent = text;
  if (isError) {
    statusEl.classList.add("error");
  } else {
    statusEl.classList.remove("error");
  }
}

// 새로고침·CSV 버튼 잠그기 (불러오는 동안 중복 클릭 방지)
function setButtonsDisabled(disabled) {
  btnRefresh.disabled = disabled;
  btnCsv.disabled = disabled;
}

// 날짜를 "2026-08-22" 형태로 (같은 날인지 비교할 때 사용)
function dateKey(d) {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return d.getFullYear() + "-" + m + "-" + day;
}

// 시각을 "8/22 14:05" 형태로
function formatTime(d) {
  const h = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return (d.getMonth() + 1) + "/" + d.getDate() + " " + h + ":" + min;
}

// 숫자가 없으면 "-" 로 표시
function numOrDash(v) {
  return typeof v === "number" ? v : "-";
}

// 닉네임에 <, > 같은 글자가 있어도 화면이 깨지지 않게 바꿔줍니다.
function escapeHtml(text) {
  if (text === null || text === undefined) return "-";
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// CSV 칸 안에 쉼표나 따옴표가 있어도 깨지지 않게 감싸줍니다.
function csvCell(text) {
  if (text === null || text === undefined) return "";
  return '"' + String(text).replace(/"/g, '""') + '"';
}

/* ---------------------------------------------------------
   11) 버튼과 기능 연결하기
--------------------------------------------------------- */
btnUnlock.addEventListener("click", unlock);
btnRefresh.addEventListener("click", loadDashboard);
btnCsv.addEventListener("click", downloadCsv);
btnLock.addEventListener("click", lock);

// 비밀번호 칸에서 Enter를 눌러도 들어가지도록
passwordInput.addEventListener("keydown", function (e) {
  if (e.key === "Enter") unlock();
});
passwordInput.addEventListener("input", function () {
  gateError.textContent = "";
});

/* ---------------------------------------------------------
   12) 페이지가 열릴 때 실행
--------------------------------------------------------- */
initSupabase();

// 이미 들어온 적이 있으면(같은 탭) 비밀번호를 다시 묻지 않습니다.
let alreadyUnlocked = false;
try {
  alreadyUnlocked = sessionStorage.getItem("admin_unlocked") === "yes";
} catch (e) {
  alreadyUnlocked = false;
}

if (alreadyUnlocked) {
  showDashboard();
} else {
  passwordInput.focus();
}

/* =========================================================
   [데이터를 정말로 보호하고 싶다면]

   지금 구조는 anon(공개용) 키로 테이블을 읽습니다.
   즉, 비밀번호를 몰라도 기술을 아는 사람은 데이터를 볼 수 있습니다.
   수업 실습용으로는 괜찮지만, 실제 서비스라면 아래 중 하나를 쓰세요.

   방법 1) 관리자 페이지를 배포하지 않기
       admin.html · admin.css · admin.js 를 GitHub에 올리지 말고
       내 컴퓨터에서만 열어서 봅니다. (가장 간단하고 안전)

   방법 2) 읽기 권한을 없애고 집계만 공개하기
       Supabase SQL Editor에서 실행:

       -- 누구나 읽던 권한을 없앱니다
       drop policy "누구나 통계 조회 가능" on test_results;

       -- 개인정보 없이 '유형별 인원'만 돌려주는 함수를 만듭니다
       create or replace function get_type_stats()
       returns table(result_type text, cnt bigint)
       language sql security definer as $$
         select result_type, count(*) from test_results group by result_type;
       $$;

       이렇게 하면 테스트 페이지의 통계는 이 함수로 바꿔 쓰고,
       닉네임 목록은 Supabase 대시보드에 로그인해야만 볼 수 있습니다.

   방법 3) Supabase 로그인(Auth)을 붙여 관리자 계정만 읽게 하기
       가장 정석이지만 설정이 늘어나므로, 수업 이후 단계로 권합니다.
   ========================================================= */
