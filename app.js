// Formatters
const formatAmount = (num) => new Intl.NumberFormat('ko-KR').format(Math.round(num || 0)) + '원';
const formatNumber = (num, decimals = 1) => new Intl.NumberFormat('ko-KR', { maximumFractionDigits: decimals }).format(num);

// Global State
let currentMonth = 4;
let globalData = (dashboardData.months[currentMonth] || {}).global || { baseDate: '-', wirelessProgress: 0, wiredProgress: 0 };
let currentAgencyId = (dashboardData.months[currentMonth] && dashboardData.months[currentMonth].agencies && dashboardData.months[currentMonth].agencies.length > 0) 
    ? dashboardData.months[currentMonth].agencies[0].id 
    : null;
let allAgenciesSortState = { key: null, asc: true };
let allAgenciesSearchString = "";
let trendChart = null;

function getMonthData() { return dashboardData.months[currentMonth]; }

function switchMonth(month) {
    currentMonth = month;
    currentAgencyId = (getMonthData().agencies && getMonthData().agencies.length > 0) ? getMonthData().agencies[0].id : null;
    allAgenciesSortState = { key: null, asc: true };
    allAgenciesSearchString = '';
    const searchInput = document.getElementById('allAgenciesSearch');
    if (searchInput) searchInput.value = '';
    renderGlobalBadge();
    renderAllAgenciesSummary();
    renderAllAgenciesTable();
    updateAgencySelect();
    renderAgencyDetail();
}

function updateAgencySelect() {
    const select = document.getElementById('agencySelect');
    if (!select) return;
    const allAgencies = getMonthData().allAgencies;
    
    // Populate from ALL agencies in the summary table
    select.innerHTML = allAgencies.map(a => `<option value="${a.코드}">${a.대리점명}</option>`).join('');
    
    if (allAgencies.find(a => a.코드 === currentAgencyId)) {
        select.value = currentAgencyId;
    } else {
        currentAgencyId = allAgencies[0].코드;
        select.value = currentAgencyId;
    }
}

function init() {
    // 1. 네비게이션 라우팅 바인딩
    const navAll = document.getElementById('navAllAgencies');
    const navDetail = document.getElementById('navAgencyDetail');
    const navByAgent = document.getElementById('navByAgent');
    
    document.querySelectorAll('.menu-item').forEach(el => {
        el.addEventListener('click', (e) => {
            document.querySelectorAll('.menu-item').forEach(m => m.classList.remove('active'));
            e.currentTarget.classList.add('active');
            
            // View Switch
            document.querySelectorAll('.view-section').forEach(v => v.classList.remove('active'));
            if (e.currentTarget === navAll) {
                document.getElementById('viewAllAgencies').classList.add('active');
            } else if (e.currentTarget === navDetail) {
                document.getElementById('viewAgencyDetail').classList.add('active');
            } else if (e.currentTarget === navByAgent) {
                document.getElementById('viewByAgent').classList.add('active');
                renderByAgentView();
            }
        });
    });

    // 2. 전체 대리점 뷰 (View 1) 초기화
    initAllAgenciesView();

    // 3. 개별 대리점 뷰 (View 2) 초기화
    initAgencyDetailView();

    // 4. 담당별 뷰 (View 3) 초기화
    initByAgentView();

    if (typeof lucide !== 'undefined') lucide.createIcons();
}

let agentComparisonChart = null;
let selectedManager = null;

function initByAgentView() {
    const monthSelect = document.getElementById('agentMonthSelect');
    if(monthSelect) {
        monthSelect.addEventListener('change', (e) => {
            currentMonth = parseInt(e.target.value);
            renderByAgentView();
        });
    }

    const mSelect = document.getElementById('managerSelect');
    if(mSelect) {
        mSelect.addEventListener('change', (e) => {
            selectedManager = e.target.value;
            renderByAgentView();
        });
    }
}

function renderByAgentView() {
    const monthData = getMonthData();
    const agencies = monthData.agencies;
    
    // 1. Group data and get unique managers
    const managerData = agencies.reduce((acc, ag) => {
        const mgr = ag.manager || '기타';
        if (!acc[mgr]) {
            acc[mgr] = { 
                name: mgr, agencies: [], totalReward: 0, 
                achievedCount: 0, count: 0 
            };
        }
        acc[mgr].agencies.push(ag);
        acc[mgr].totalReward += ag.summary.totalAmount;
        if (ag.summary.totalAmount > 0) acc[mgr].achievedCount++;
        acc[mgr].count++;
        return acc;
    }, {});

    const managerNames = Object.keys(managerData).sort();
    
    // 2. Populate/Update Manager Dropdown
    const mSelect = document.getElementById('managerSelect');
    if (mSelect) {
        const currentVals = Array.from(mSelect.options).map(o => o.value);
        if (JSON.stringify(currentVals) !== JSON.stringify(managerNames)) {
            mSelect.innerHTML = managerNames.map(name => `<option value="${name}">${name}</option>`).join('');
        }
        if (!selectedManager && managerNames.length > 0) {
            selectedManager = managerNames[0];
        }
        mSelect.value = selectedManager;
    }

    // 3. Render only the selected manager's detail
    const container = document.getElementById('agentCardsContainer');
    container.innerHTML = '';

    if (!selectedManager || !managerData[selectedManager]) return;

    const mgr = managerData[selectedManager];
    
    // Sort agencies: underperforming (0 reward) first, then by name
    const sortedAgencies = [...mgr.agencies].sort((a, b) => {
        if (a.summary.totalAmount === 0 && b.summary.totalAmount > 0) return -1;
        if (a.summary.totalAmount > 0 && b.summary.totalAmount === 0) return 1;
        return a.name.localeCompare(b.name);
    });

    const section = document.createElement('section');
    section.className = 'agent-section';
    section.innerHTML = `
        <div class="agent-section-header">
            <div class="agent-profile">
                <div class="agent-avatar-circle">${mgr.name[0]}</div>
                <span class="agent-name-tag">${mgr.name} 담당 (관리 상세)</span>
            </div>
            <div class="agent-summary-pills">
                <div class="summary-pill">관리 <strong>${mgr.count}</strong></div>
                <div class="summary-pill">달성 <strong>${mgr.achievedCount}</strong></div>
                <div class="summary-pill">총액 <strong style="color:var(--primary-color)">${formatAmount(mgr.totalReward)}</strong></div>
            </div>
        </div>
        <div class="table-container" style="box-shadow:none; border:1px solid var(--border-color); border-radius:8px;">
            <table class="agent-inner-table">
                <thead>
                    <tr>
                        <th>대리점명</th>
                        <th class="text-right">무선 달성</th>
                        <th class="text-right">유선 달성</th>
                        <th class="text-right">ARPU</th>
                        <th class="text-right">수혜 금액</th>
                        <th>상태</th>
                    </tr>
                </thead>
                <tbody>
                    ${sortedAgencies.map(ag => {
                        const isUnder = ag.summary.totalAmount === 0;
                        return `
                            <tr class="${isUnder ? 'underperforming' : ''}">
                                <td style="font-weight:700;">${ag.name}</td>
                                <td class="text-right">${ag.summary.wirelessRate}%</td>
                                <td class="text-right">${ag.summary.wiredRate}%</td>
                                <td class="text-right">${ag.summary.retailArpuRate}%</td>
                                <td class="text-right" style="font-weight:700;">${formatAmount(ag.summary.totalAmount)}</td>
                                <td>
                                    ${isUnder ? 
                                        '<span style="color:#e11d48; font-size:0.7rem; font-weight:800;">[집중관리]</span>' : 
                                        '<span style="color:#10b981; font-size:0.75rem;">정상</span>'
                                    }
                                </td>
                            </tr>
                        `;
                    }).join('')}
                </tbody>
            </table>
        </div>
    `;
    container.appendChild(section);
}

/* ==========================================
 * View 1. 전체 대리점 통계 (All Agencies)
 * ========================================== */
function renderGlobalBadge() {
    const globalBadge = document.getElementById('allAgenciesGlobalBadge');
    if (!globalBadge) return;
    globalBadge.innerHTML = `
        <div class="global-info-pills">
            <div class="global-pill-group">
                <span class="global-pill-label">적용일자</span>
                <span class="global-pill-value date">${globalData.baseDate}</span>
            </div>
            <div class="global-pill-sep"></div>
            <div class="global-pill-group">
                <span class="global-pill-label">이동전화</span>
                <div class="global-pill-row">
                    <span class="global-pill-chip">영업 <strong>${globalData.wirelessDays}일</strong></span>
                    <span class="global-pill-chip">경과 <strong>${globalData.elapsedDays}일</strong></span>
                    <span class="global-pill-chip accent">진도율 <strong>${(globalData.wirelessProgress * 100).toFixed(1)}%</strong></span>
                </div>
            </div>
            <div class="global-pill-sep"></div>
            <div class="global-pill-group">
                <span class="global-pill-label">유선 개통</span>
                <div class="global-pill-row">
                    <span class="global-pill-chip">영업 <strong>${globalData.wiredDays}일</strong></span>
                    <span class="global-pill-chip">경과 <strong>${globalData.elapsedDays}일</strong></span>
                    <span class="global-pill-chip accent">진도율 <strong>${(globalData.wiredProgress * 100).toFixed(1)}%</strong></span>
                </div>
            </div>
        </div>
    `;
}

function initAllAgenciesView() {
    renderGlobalBadge();

    // 월 선택 이벤트
    const monthSelect = document.getElementById('allMonthSelect');
    if (monthSelect) {
        monthSelect.value = String(currentMonth);
        monthSelect.addEventListener('change', (e) => switchMonth(parseInt(e.target.value)));
    }

    // 서치박스 이벤트
    const searchInput = document.getElementById('allAgenciesSearch');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            allAgenciesSearchString = e.target.value.trim().toLowerCase();
            renderAllAgenciesTable();
        });
    }

    // 소트 헤더 이벤트
    document.querySelectorAll('.sortable').forEach(th => {
        th.addEventListener('click', () => {
            const key = th.getAttribute('data-sort');
            if (allAgenciesSortState.key === key) {
                allAgenciesSortState.asc = !allAgenciesSortState.asc;
            } else {
                allAgenciesSortState.key = key;
                allAgenciesSortState.asc = true;
            }
            
            // 모든 화살표 리셋
            document.querySelectorAll('.sortable').forEach(el => { el.classList.remove('asc', 'desc'); });
            th.classList.add(allAgenciesSortState.asc ? 'asc' : 'desc');
            
            renderAllAgenciesTable();
        });
    });

    // 요약 데이터 랜더링
    renderAllAgenciesSummary();
    renderAllAgenciesTable();
}

function renderAllAgenciesSummary() {
    const list = getMonthData().allAgencies;
    const prevMonth = getMonthData().global.prevMonth || {};

    // 전체 대리점 수
    const elTotal = document.getElementById('valTotalAgencies');
    if (elTotal) elTotal.textContent = list.length + '개';

    // 당월 수혜 대리점 수 & 금액
    const achievedList = list.filter(a => a['수혜금액'] > 0);
    const elAchieved = document.getElementById('valAchievedAgencies');
    if (elAchieved) elAchieved.textContent = achievedList.length + '개';

    const totalAchievedAmount = achievedList.reduce((sum, a) => sum + (a['수혜금액'] || 0), 0);
    const elTotalAmt = document.getElementById('valTotalAchievedAmount');
    if (elTotalAmt) elTotalAmt.textContent = formatAmount(totalAchievedAmount);

    // 전월 수혜 대리점 수 & 금액
    const elPrevCount = document.getElementById('valPrevAchievedAgencies');
    if (elPrevCount) elPrevCount.textContent = (prevMonth.achievedCount ?? '-') + '개';

    const elPrevAmt = document.getElementById('valPrevTotalAmount');
    if (elPrevAmt) elPrevAmt.textContent = prevMonth.totalAmount != null ? formatAmount(prevMonth.totalAmount) : '-';

    // 수혜 대리점 목록 (chip 형태)
    const elAchList = document.getElementById('listAchievedAgenciesStr');
    if (elAchList) {
        if (achievedList.length) {
            elAchList.innerHTML = achievedList.map(a => {
                const amt = formatAmount(a['수혜금액']);
                return `<span class="agency-chip"><span class="agency-chip-name">${a['대리점명']}</span><span class="agency-chip-amt">${amt}</span></span>`;
            }).join('');
        } else {
            elAchList.innerHTML = '<span style="color:var(--text-muted)">해당없음</span>';
        }
    }
}

function renderAllAgenciesTable() {
    let list = [...getMonthData().allAgencies];
    
    // 검색 필터
    if (allAgenciesSearchString) {
        list = list.filter(a => 
            a['대리점명'].toLowerCase().includes(allAgenciesSearchString) || 
            a['팀명'].toLowerCase().includes(allAgenciesSearchString)
        );
    }
    
    // 테이블 정렬
    if (allAgenciesSortState.key) {
        let key = allAgenciesSortState.key;
        list.sort((a, b) => {
            let valA = a[key]; let valB = b[key];
            if (typeof valA === 'string') {
                return allAgenciesSortState.asc ? valA.localeCompare(valB) : valB.localeCompare(valA);
            }
            return allAgenciesSortState.asc ? valA - valB : valB - valA;
        });
    }
    
    const tbody = document.getElementById('allAgenciesTableBody');
    tbody.innerHTML = '';
    
    // 진도율 기준선 (100% 포맷)
    const stdWireless = globalData.wirelessProgress;
    const stdWired = globalData.wiredProgress;

    const rateColorBadge = (rateObj, standardObj) => {
        // 진도율 보다 초과했으면 초록, 낮으면 빨강 텍스트 반환
        return rateObj >= standardObj ? `class="status-achieved"` : `class="status-missed"`;
    };

    list.forEach(item => {
        const tr = document.createElement('tr');
        
        // 달성 뱃지
        const achieveBadge = item['달성여부'] === '달성' 
            ? `<span class="status-badge excellent">달성</span>` 
            : `<span class="status-badge poor">미달성</span>`;
            
        // 최종 지급 그룹별 뱃지
        let groupBadge = `<span class="status-badge normal">${item['최종지급테이블']}</span>`;
        if(item['최종지급테이블'] === '1그룹') groupBadge = `<span class="status-badge excellent">${item['최종지급테이블']}</span>`;
        // TAC+ 뱃지
        const tacBadge = item['TACplus'] === 1 
            ? `<span class="status-badge excellent">달성</span>` 
            : `<span class="status-badge poor">미달성</span>`;

        tr.innerHTML = `
            <td><strong>${item['대리점명']}</strong><br><span style="font-size:0.75rem; color:var(--text-muted)">${item['팀명']}</span></td>
            <td><strong style="color:var(--primary-color)">${formatNumber(item['수혜금액'], 0)}</strong></td>
            <td>${tacBadge}</td>
            
            <td>${formatNumber(item['무선목표'])}</td>
            <td>${formatNumber(item['무선실적'])}</td>
            <td><span ${rateColorBadge(item['무선달성률'], stdWireless)}>${(item['무선달성률'] * 100).toFixed(1)}%</span></td>
            
            <td>${formatNumber(item['유선목표'])}</td>
            <td>${formatNumber(item['유선실적'])}</td>
            <td><span ${rateColorBadge(item['유선달성률'], stdWired)}>${(item['유선달성률'] * 100).toFixed(1)}%</span></td>
            <td>${(item['초고속달성률'] * 100).toFixed(1)}%</td>
            
            <td>${formatNumber(item['소매ARPU목표'])}</td>
            <td>${formatNumber(item['소매ARPU실적'])}</td>
            <td>${(item['소매ARPU달성률'] * 100).toFixed(1)}%</td>
            <td><strong>${item['ARPU달성그룹']}그룹</strong></td>
            
            <td>${formatNumber(item['유심목표'])}</td>
            <td>${(item['유심달성률'] * 100).toFixed(1)}%</td>
            <td>${formatNumber(item['유심실적가점'])}</td>
            
            <td>${(item['공통지원금등록률'] * 100).toFixed(1)}%</td>
            <td>${achieveBadge}</td>
            
            <td>${groupBadge}</td>
            
            <td>${item['고가기변']}</td>
            <td>${item['고가MNP']}</td>
            <td>${item['유심중고']}</td>
        `;

        tbody.appendChild(tr);
    });
}

/* ==========================================
 * View 2. 대리점별 상세 (Agency Detail)
 * ========================================== */
function initAgencyDetailView() {
    const badge = document.getElementById('businessDaysBadge');
    const remaining = globalData.totalBusinessDays - globalData.currentBusinessDay;
    badge.innerHTML = `<i data-lucide="calendar"></i> 기준일: ${globalData.baseDate} | 남은 영업일수: ${remaining}일`;

    updateAgencySelect();

    const agencySelect = document.getElementById('agencySelect');
    if (agencySelect) {
        agencySelect.addEventListener('change', (e) => {
            currentAgencyId = e.target.value;
            renderAgencyDetail();
        });
    }

    document.getElementById('modalCloseBtn').addEventListener('click', closeModal);
    document.getElementById('modalConfirmBtn').addEventListener('click', closeModal);

    renderAgencyDetail();
}

function renderAgencyDetail() {
    const monthData = getMonthData();
    const agency = monthData.agencies.find(a => a.id === currentAgencyId);
    
    if (!agency) {
        // Fallback: If data is missing in the agencies array, 
        // we can still show the summary from allAgencies if we want, 
        // but the user wants "Fake Data" in the file, so let's keep it simple.
        console.warn('Detailed data missing for:', currentAgencyId);
        return;
    }

    renderSummary(agency.summary);
    renderTargetStatus(agency.targetStatus);
    renderStrengths(agency.strengths);
    renderStoreTable(agency.stores);
    renderMonthlyTrendChart(currentAgencyId);
}

function renderSummary(summary) {
    const eValExtraAid = document.getElementById('valExtraAid');
    if (summary.extraAidStatus) {
        eValExtraAid.textContent = "달성 🟢";
        eValExtraAid.style.color = "var(--status-excellent-color)";
    } else {
        eValExtraAid.textContent = "미달성 🔴";
        eValExtraAid.style.color = "var(--status-poor-color)";
    }

    const rates = [
        { id: 'valWirelessRate', val: summary.wirelessRate },
        { id: 'valWiredRate', val: summary.wiredRate },
        { id: 'valRetailRate', val: summary.retailArpuRate },
        { id: 'valMnpRate', val: summary.usimMnpRate }
    ];

    rates.forEach(item => {
        const el = document.getElementById(item.id);
        el.textContent = item.val + '%';
        if (item.val < 100) {
            el.style.color = "var(--status-poor-color)";
        } else {
            el.style.color = "var(--text-main)";
        }
    });

    if (summary.commonAidDetails) {
        document.getElementById('itemCommonAid').title = `목표: ${summary.commonAidDetails.target}건\n등록률: ${summary.commonAidDetails.registerRate}%`;
    }
    if (summary.wirelessDetails) {
        document.getElementById('itemWireless').title = `목표: ${summary.wirelessDetails.target}\n실적: ${summary.wirelessDetails.current}\n달성률: ${summary.wirelessDetails.rate}%`;
    }
    if (summary.wiredDetails) {
        document.getElementById('itemWired').title = `목표: ${summary.wiredDetails.target}\n실적: ${summary.wiredDetails.current}\n달성률: ${summary.wiredDetails.rate}%`;
    }
    if (summary.retailDetails) {
        document.getElementById('itemRetail').title = `목표: ${summary.retailDetails.target}\n실적: ${summary.retailDetails.current}\n달성률: ${summary.retailDetails.rate}%`;
    }
    if (summary.mnpDetails) {
        document.getElementById('itemMnp').title = `목표: ${summary.mnpDetails.target}\n실적: ${summary.mnpDetails.current}\n달성률: ${summary.mnpDetails.rate}%`;
    }

    document.getElementById('valTotalAmount').textContent = formatAmount(summary.totalAmount);
    document.getElementById('valUnitPrice').textContent = formatAmount(summary.unitPrice || (summary.totalAmount / 35)); 
    document.getElementById('valHighUpgrade').textContent = formatNumber(summary.benefitHighUpgrade || 0, 0);
    document.getElementById('valHighMnp').textContent = formatNumber(summary.benefitHighMnp || 0, 0);
    document.getElementById('valGal26').textContent = formatNumber(summary.benefitGal26 || 0, 0);
}

function renderTargetStatus(target) {
    const currentRate = (target.currentScore / target.goalScore) * 100;
    
    document.getElementById('txtCurrentScore').textContent = target.currentScore.toFixed(1);
    document.getElementById('txtGoalScore').textContent = target.goalScore.toFixed(1);
    document.getElementById('txtScoreRate').textContent = currentRate.toFixed(1) + '%';
    
    const pbFill = document.getElementById('scoreProgressBar');
    pbFill.style.width = Math.min(100, Math.max(0, currentRate)) + '%';

    const missingBox = document.getElementById('missingScoreBox');
    const valMissing = document.getElementById('valMissingScore');
    const missingAmt = parseFloat((target.goalScore - target.currentScore).toFixed(1));
    
    missingBox.className = 'status-box';
    if (missingAmt <= 0) {
        valMissing.textContent = "목표 달성";
        missingBox.classList.add('good');
    } else if (missingAmt <= 30) {
        valMissing.textContent = missingAmt + "점";
        missingBox.classList.add('warn');
    } else {
        valMissing.textContent = missingAmt + "점";
        missingBox.classList.add('bad');
    }

    const businessDayBox = document.getElementById('businessDayStatusBox');
    const txtBizDay = document.getElementById('txtBusinessDayStatus');
    const targetForToday = target.goalScore * (globalData.currentBusinessDay / globalData.totalBusinessDays);
    
    businessDayBox.className = 'status-box wide';
    if (target.currentScore >= targetForToday) {
        txtBizDay.textContent = "영업일수에 맞게 잘 가고 있습니다 😄";
        businessDayBox.classList.add('good');
    } else {
        txtBizDay.textContent = "영업일수 대비 부족합니다 😟";
        businessDayBox.classList.add('warn');
    }

    const eBonusRate = document.getElementById('valBonusRate');
    eBonusRate.textContent = target.bonusUsageRate + '%';
    
    const bonusBox = document.getElementById('bonusRateBox');
    bonusBox.className = 'status-box';
    
    let bonusSubText = bonusBox.querySelector('.bonus-subtext');
    if (!bonusSubText) {
        bonusSubText = document.createElement('div');
        bonusSubText.className = 'bonus-subtext';
        bonusSubText.style.fontSize = '0.75rem';
        bonusSubText.style.marginTop = '6px';
        bonusSubText.style.fontWeight = 'bold';
        bonusBox.appendChild(bonusSubText);
    }
    
    if (target.bonusUsageRate <= 35) {
        bonusBox.classList.add('bad');
        bonusSubText.textContent = "가점 35% 이상 유지 필요!";
    } else {
        bonusBox.classList.add('good');
        bonusSubText.textContent = "가점 35% 이상 유지 중";
    }

    document.getElementById('aiSuggestionText').textContent = target.aiSuggestion;
}

function renderStrengths(strengths) {
    const list = document.getElementById('strengthTop5List');
    list.innerHTML = '';
    const medals = ['🥇', '🥈', '🥉', '🏅', '🏅'];

    if (!strengths || strengths.length === 0) {
        list.innerHTML = '<li class="no-data">강점 데이터가 없습니다.</li>';
        return;
    }

    strengths.slice(0, 5).forEach((st, idx) => {
        const li = document.createElement('li');
        li.style.cursor = 'pointer';
        li.innerHTML = `
            <span class="rank-badge">${medals[idx] || '🏅'}</span>
            <span class="strength-name">${st.name}</span>
            <span class="strength-score">${st.score}점</span>
        `;
        // 클릭 시 세부 실적 모달 열기
        li.onclick = () => openDetailModal();
        list.appendChild(li);
    });
}

// ---------------------------------------------------------
// 🌟 V2.5: 세부 실적 모달 (Detail Modal) 로직
// ---------------------------------------------------------
let currentSortType = 'score'; // 'score' or 'name'

function openDetailModal() {
    const agencyId = document.getElementById('agencySelect').value;
    const month = document.getElementById('monthSelect').value;
    const agency = dashboardData.months[month].agencies.find(a => a.id === agencyId);
    
    if (!agency || !agency.detailedItems) {
        alert('상세 실적 데이터가 없습니다.');
        return;
    }

    // 헤더 업데이트
    document.getElementById('detailModalTitle').textContent = `${agency.name} 세부 실적`;
    document.getElementById('detailModalDate').textContent = `기준일: ${dashboardData.months[month].global.baseDate}`;
    
    // 모달 활성화
    document.getElementById('detailModal').classList.add('active');
    
    renderDetailContent(agency);
}

function renderDetailContent(agency) {
    const items = [...agency.detailedItems];
    
    // 1. TOP 5 계산 (양수 점수만, 점수 내림차순, 동점 시 배율 우선)
    const top5 = items
        .filter(item => item.score > 0)
        .sort((a, b) => b.score - a.score || b.multiplier - a.multiplier)
        .slice(0, 5);

    const top5Grid = document.getElementById('detailTop5Grid');
    top5Grid.innerHTML = '';
    
    top5.forEach((item, idx) => {
        const card = document.createElement('div');
        card.className = `top5-card rank-${idx + 1}`;
        const medals = ['🥇', '🥈', '🥉', '4위', '5위'];
        card.innerHTML = `
            <div class="top5-rank">${idx < 3 ? medals[idx] : medals[idx]}</div>
            <div class="top5-name">${item.name}</div>
            <div class="top5-score">${item.score > 0 ? '+' : ''}${item.score}</div>
        `;
        top5Grid.appendChild(card);
    });

    // 2. 전체 리스트 렌더링
    renderDetailTable(agency);

    // 3. 하단 요약 계산
    const totalBonus = items.filter(i => i.score > 0).reduce((sum, i) => sum + i.score, 0);
    const deductionCount = items.filter(i => i.score < 0).length;
    const zeroCount = items.filter(i => i.score === 0).length;

    document.getElementById('detailTotalBonus').textContent = `+${totalBonus.toFixed(1)}`;
    document.getElementById('detailDeductionCount').textContent = `${deductionCount}건`;
    document.getElementById('detailZeroCount').textContent = `${zeroCount}건`;
}

function renderDetailTable(agency) {
    const tbody = document.getElementById('detailListBody');
    tbody.innerHTML = '';
    
    let sortedItems = [...agency.detailedItems];
    if (currentSortType === 'score') {
        sortedItems.sort((a, b) => b.score - a.score || b.multiplier - a.multiplier);
    } else {
        sortedItems.sort((a, b) => a.name.localeCompare(b.name));
    }

    sortedItems.forEach(item => {
        const tr = document.createElement('tr');
        let statusClass = 'status-zero';
        if (item.score > 0) statusClass = 'status-positive';
        else if (item.score < 0) statusClass = 'status-negative';

        tr.innerHTML = `
            <td>${item.name}</td>
            <td><span class="mult-tag">×${item.multiplier.toFixed(1)}</span></td>
            <td class="text-right">${item.performance}</td>
            <td class="text-right score-cell ${statusClass}">${item.score > 0 ? '+' : ''}${item.score}</td>
        `;
        tbody.appendChild(tr);
    });
}

// 이벤트 리스너 등록
document.addEventListener('DOMContentLoaded', () => {
    // 모달 닫기
    document.getElementById('detailModalCloseBtn').onclick = () => {
        document.getElementById('detailModal').classList.remove('active');
    };
    
    document.getElementById('detailModalConfirmBtn').onclick = () => {
        document.getElementById('detailModal').classList.remove('active');
    };

    // 배경 클릭 시 닫기
    document.getElementById('detailModal').onclick = (e) => {
        if (e.target.id === 'detailModal') {
            document.getElementById('detailModal').classList.remove('active');
        }
    };

    // 정렬 토글
    document.getElementById('sortByScore').onclick = function() {
        this.classList.add('active');
        document.getElementById('sortByName').classList.remove('active');
        currentSortType = 'score';
        const agencyId = document.getElementById('agencySelect').value;
        const month = document.getElementById('monthSelect').value;
        const agency = dashboardData.months[month].agencies.find(a => a.id === agencyId);
        renderDetailTable(agency);
    };

    document.getElementById('sortByName').onclick = function() {
        this.classList.add('active');
        document.getElementById('sortByScore').classList.remove('active');
        currentSortType = 'name';
        const agencyId = document.getElementById('agencySelect').value;
        const month = document.getElementById('monthSelect').value;
        const agency = dashboardData.months[month].agencies.find(a => a.id === agencyId);
        renderDetailTable(agency);
    };
});

function renderStoreTable(stores) {
    const tbody = document.getElementById('storeTableBody');
    tbody.innerHTML = '';
    
    if (!stores || !Array.isArray(stores)) {
        tbody.innerHTML = `<tr><td colspan="10" style="text-align:center; padding:40px; color:var(--text-muted);">매장 데이터가 없습니다.</td></tr>`;
        return;
    }

    stores.forEach(store => {
        const diffClass = (store.diffFrom3Months || 0) >= 0 ? 'positive' : 'negative';
        const diffIcon = (store.diffFrom3Months || 0) > 0 ? '▲' : ((store.diffFrom3Months || 0) < 0 ? '▼' : '-');
        const absDiff = Math.abs(store.diffFrom3Months || 0);
        
        let statusBadge = '';
        if (store.progressRate >= 100) {
            statusBadge = `<span class="status-badge excellent">우수 (100%이상)</span>`;
        } else if (store.progressRate >= 70) {
            statusBadge = `<span class="status-badge normal">보통 (70~100%)</span>`;
        } else {
            statusBadge = `<span class="status-badge poor">부진 (70%미만)</span>`;
        }

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><strong>${store.name}</strong></td>
            <td>${formatNumber(store.wirelessPoint)}</td>
            <td><strong>${store.wirelessPaymentTable}</strong></td>
            <td>${formatNumber(store.wiredPoint)}</td>
            <td><strong>${store.wiredPaymentTable}</strong></td>
            <td>${formatAmount(store.finalPayment)}</td>
            <td>${formatAmount(Math.round(store.finalPayment * 100 / (store.progressRate || 1)))}</td>
            <td class="diff-value ${diffClass}">${diffIcon} ${absDiff}%</td>
            <td>${store.progressRate}%</td>
            <td>${statusBadge}</td>
        `;

        tr.addEventListener('click', () => openModal(store));
        tbody.appendChild(tr);
    });
}

function renderMonthlyTrendChart(agencyId) {
    const ctx = document.getElementById('monthlyTrendChart');
    if (!ctx) return;

    // Collect data for Jan (1) to Apr (4)
    const labels = ['1월', '2월', '3월', '4월'];
    const dataValues = [];

    for (let m = 1; m <= 4; m++) {
        const monthData = dashboardData.months[m];
        if (!monthData) {
            dataValues.push(0);
            continue;
        }
        const agencySummary = monthData.allAgencies.find(a => (a.코드 || a.코드) === agencyId);
        dataValues.push(agencySummary ? agencySummary['수혜금액'] || 0 : 0);
    }

    if (trendChart) {
        trendChart.destroy();
    }

    trendChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: '수혜금액',
                data: dataValues,
                backgroundColor: 'rgba(37, 99, 235, 0.8)',
                borderColor: 'rgba(37, 99, 235, 1)',
                borderWidth: 1,
                borderRadius: 6,
                barThickness: 40,
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return '수혜금액: ' + new Intl.NumberFormat('ko-KR').format(context.raw) + '원';
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        callback: function(value) {
                            if (value >= 1000000) return (value / 1000000) + '백만';
                            if (value >= 10000) return (value / 10000) + '만';
                            return value;
                        }
                    },
                    grid: { color: 'rgba(0,0,0,0.05)' }
                },
                x: {
                    grid: { display: false }
                }
            }
        }
    });
}

// Modal Logic
function openModal(store) {
    document.getElementById('modalStoreName').textContent = store.name;
    document.getElementById('modalProgressRate').textContent = store.progressRate;
    document.getElementById('modalFinalAmount').textContent = formatAmount(store.finalPayment);
    document.getElementById('modalWireless').textContent = formatNumber(store.wirelessPoint) + ' P / ' + store.wirelessPaymentTable;
    document.getElementById('modalWired').textContent = formatNumber(store.wiredPoint) + ' P / ' + store.wiredPaymentTable;
    
    document.getElementById('storeModal').classList.add('active');
}

function closeModal() {
    document.getElementById('storeModal').classList.remove('active');
}

// document ready
function startApp() {
    try {
        init();
    } catch(e) {
        console.error('Dashboard init error:', e);
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startApp);
} else {
    startApp();
}
