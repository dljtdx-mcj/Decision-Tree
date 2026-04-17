(() => {
  if (!window.APP_CONFIG || !window.APP_CONFIG.models) return;

  const models = window.APP_CONFIG.models;
  const state = {
    modelIndex: 0,
    params: {},
    playbackValue: 50, // 0 to 100 representing probability mapping
    playTimer: null,
    chartObj: null,
    diagramStep: -1, // -1 means show full diagram
    maxDiagramStep: 0,
    diagramTransform: { x: 0, y: 0, scale: 1 },
    drag: { active: false, startX: 0, startY: 0, origX: 0, origY: 0 }
  };

  const dom = {
    tabs: document.querySelectorAll('.top-tab'),
    panels: document.querySelectorAll('.tab-panel'),
    switcher: document.getElementById('model-switcher'),
    metaCard: document.getElementById('model-meta-card'),
    paramForm: document.getElementById('param-form'),
    smartTip: document.getElementById('smart-tip'),
    diagramStage: document.getElementById('diagram-stage'),
    diagramContainer: document.getElementById('diagram-container'),
    chartCanvas: document.getElementById('primary-chart'),
    table: document.getElementById('result-table'),
    feedbackChip: document.getElementById('feedback-chip'),
    stepHeadline: document.getElementById('step-headline'),
    stepExplainer: document.getElementById('step-explainer'),
    codeBlock: document.getElementById('code-block'),
    playBtn: document.getElementById('play-btn'),
    pauseBtn: document.getElementById('pause-btn'),
    playbackRange: document.getElementById('playback-range'),
    playbackLabel: document.getElementById('playback-step-label'),
    stepDrawBtn: document.getElementById('step-draw-btn'),
    fullDrawBtn: document.getElementById('full-draw-btn')
  };

  function currentModel() { return models[state.modelIndex]; }

  function initState() {
    models.forEach(m => {
      state.params[m.id] = {};
      m.params.forEach(p => state.params[m.id][p.key] = p.value);
    });
  }

  function bindTabs() {
    dom.tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        dom.tabs.forEach(t => t.classList.toggle('active', t === tab));
        dom.panels.forEach(p => p.classList.toggle('active', p.id === `tab-${tab.dataset.tab}`));
      });
    });
  }

  function renderSwitcher() {
    dom.switcher.innerHTML = models.map((m, idx) => `
      <div class="model-card-btn ${idx === state.modelIndex ? 'active' : ''}" data-idx="${idx}">
        <h3>${m.name}</h3>
        <p>${m.desc}</p>
      </div>
    `).join('');
    dom.switcher.querySelectorAll('.model-card-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        stopPlayback();
        state.modelIndex = Number(btn.dataset.idx);
        state.playbackValue = 50;
        state.diagramStep = -1; // 切换模型时重置为完整显示
        rerenderAll();
      });
    });
  }

  function renderMeta() {
    const m = currentModel();
    dom.metaCard.innerHTML = `
      <h3>${m.name} · ${m.source}</h3>
      <p>${m.summary}</p>
    `;
    dom.feedbackChip.textContent = m.type;
  }

  function renderForm() {
    const m = currentModel();
    const pVals = state.params[m.id];
    dom.paramForm.innerHTML = m.params.map(p => `
      <div class="param-item">
        <div class="param-top">
          <span class="param-label">${p.label}</span>
          <input type="number" class="param-number" data-key="${p.key}" value="${pVals[p.key]}" min="${p.min}" max="${p.max}" step="${p.step}">
        </div>
        <div style="font-size:12px; color:#64748b;">${p.desc}</div>
      </div>
    `).join('');

    dom.paramForm.querySelectorAll('input').forEach(inp => {
      inp.addEventListener('change', () => {
        state.params[m.id][inp.dataset.key] = Number(inp.value);
        updateData(); // 数值改变时只刷新数据和图表，不改变画树进度
      });
    });
  }

  // --- Core Calculation Logic ---
  function calculateData() {
    const m = currentModel();
    const isSingle = m.id === 'single';
    const series = [];
    const points = 21;

    for (let i = 0; i <= 100; i += 5) {
      let probVar = i / 100;
      let row = { p: probVar };

      if (isSingle) {
        let remain = 1 - probVar;
        let p2 = remain * (5/9), p3 = remain * (2/9), p4 = remain * (2/9);

        row.ev1 = 180*probVar + 90*p2 - 30*p3 - 60*p4;
        row.ev2 = 120*probVar + 60*p2 + 20*p3 - 10*p4;
        row.ev3 =  80*probVar + 30*p2 + 40*p3 + 10*p4;
        row.best = Math.max(row.ev1, row.ev2, row.ev3);
        row.bestName = row.ev1 === row.best ? 'A1(大型)' : (row.ev2 === row.best ? 'A2(中型)' : 'A3(租赁)');
      } else {
        let pRain = probVar;
        let pNoRain = 1 - pRain;
        let evZ1 = 0.5 * (-30000) + 0.3 * (-22500) + 0.2 * (-15000);
        let evZ2 = -25000;
        let bestZ = Math.max(evZ1, evZ2);

        row.evX2 = pNoRain * 0 + pRain * bestZ;
        row.evX1 = -15000;
        row.best = Math.max(row.evX1, row.evX2);
        row.bestName = row.evX1 === row.best ? 'X1(紧急加班)' : 'X2(正常施工)';
      }
      series.push(row);
    }
    return series;
  }

  function updateData() {
    const data = calculateData();
    const m = currentModel();
    const currentIdx = Math.round(state.playbackValue / 5);
    const currentRow = data[currentIdx];

    // Update Chart
    const labels = data.map(d => `${Math.round(d.p * 100)}%`);
    const datasets = m.id === 'single'
      ? [
          { label: '方案 A1', data: data.map(d => d.ev1), borderColor: '#0d9488', tension: 0.1 },
          { label: '方案 A2', data: data.map(d => d.ev2), borderColor: '#f59e0b', tension: 0.1 },
          { label: '方案 A3', data: data.map(d => d.ev3), borderColor: '#6366f1', tension: 0.1 }
        ]
      : [
          { label: '方案 X1(加班)', data: data.map(d => d.evX1), borderColor: '#0d9488', tension: 0.1 },
          { label: '方案 X2(正常)', data: data.map(d => d.evX2), borderColor: '#f43f5e', tension: 0.1 }
        ];

    if (state.chartObj) state.chartObj.destroy();
    state.chartObj = new Chart(dom.chartCanvas, {
      type: 'line',
      data: { labels, datasets },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          annotation: {
            annotations: {
              line1: { type: 'line', xMin: currentIdx, xMax: currentIdx, borderColor: '#334155', borderWidth: 2, borderDash: [5, 5] }
            }
          }
        }
      }
    });

    // Update Table
    const isSingle = m.id === 'single';
    let ths = isSingle ? `<th>核心概率(P1)</th><th>A1 期望值</th><th>A2 期望值</th><th>A3 期望值</th><th>最优方案</th>`
                       : `<th>下雨概率</th><th>X1 期望成本</th><th>X2 期望成本</th><th>最优方案</th>`;

    dom.table.innerHTML = `
      <thead><tr>${ths}</tr></thead>
      <tbody>
        ${data.filter((_, i) => i % 2 === 0).map((row, i) => {
          let trClass = (i * 2 === currentIdx) ? 'highlight-row' : '';
          let tds = isSingle 
            ? `<td>${(row.p*100).toFixed(0)}%</td><td>${row.ev1.toFixed(1)}</td><td>${row.ev2.toFixed(1)}</td><td>${row.ev3.toFixed(1)}</td><td>${row.bestName}</td>`
            : `<td>${(row.p*100).toFixed(0)}%</td><td>${row.evX1}</td><td>${row.evX2.toFixed(0)}</td><td>${row.bestName}</td>`;
          return `<tr class="${trClass}">${tds}</tr>`;
        }).join('')}
      </tbody>
    `;

    // Smart Tip
    let tip = isSingle
      ? `当高需求好状态的概率 P1 = ${(currentRow.p*100).toFixed(0)}% 时，最优选择为 <strong>${currentRow.bestName}</strong>，期望收益为 ${currentRow.best.toFixed(2)} 万元。观察图表可知，不同概率区间的最优方案会发生交叉反转。`
      : `当后期下雨概率为 ${(currentRow.p*100).toFixed(0)}% 时，最优方案是 <strong>${currentRow.bestName}</strong>，期望损失为 ${currentRow.best.toFixed(0)} 元。由于 X1 成本固定，当降雨概率超过某个阈值时，直接采取 X1(紧急加班) 会更划算。`;
    dom.smartTip.innerHTML = `💡 ${tip}`;

    renderDiagram(currentRow);
  }

  // --- 分步 SVG Diagram Rendering ---
  function renderDiagram(row) {
    const m = currentModel();
    let steps = []; // 存储每一步要绘制的 SVG 字符串
    const w = 800, h = 460;

    const buildNode = (type, x, y, label, val = null) => {
      let shape = '';
      if (type === 'dec') shape = `<rect x="${x-15}" y="${y-15}" width="30" height="30" fill="#fff" stroke="#0d9488" stroke-width="3"/>`;
      if (type === 'state') shape = `<circle cx="${x}" cy="${y}" r="15" fill="#fff" stroke="#f59e0b" stroke-width="3"/>`;
      if (type === 'res') shape = `<polygon points="${x},${y-15} ${x+15},${y+10} ${x-15},${y+10}" fill="#e2e8f0" stroke="#64748b" stroke-width="2"/>`;

      let text = `<text x="${x}" y="${y-20}" text-anchor="middle" font-size="12" font-weight="bold" fill="#334155">${label}</text>`;
      let valText = val !== null ? `<text x="${x+20}" y="${y+5}" font-size="13" font-weight="bold" fill="#0f766e">${val}</text>` : '';
      return `<g>${shape}${text}${valText}</g>`;
    };

    const buildLine = (x1, y1, x2, y2, label = '') => {
      let line = `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#94a3b8" stroke-width="2"/>`;
      let text = label ? `<text x="${(x1+x2)/2}" y="${(y1+y2)/2 - 5}" font-size="11" fill="#64748b" text-anchor="middle">${label}</text>` : '';
      return line + text;
    };

    if (m.id === 'single') {
      let remain = 1 - row.p;
      let p2 = remain * (5/9), p3 = remain * (2/9), p4 = remain * (2/9);

      steps.push(buildNode('dec', 100, 230, '决策点')); // Step 1

      [
        { id: 'A1', y: 80, ev: row.ev1.toFixed(1) },
        { id: 'A2', y: 230, ev: row.ev2.toFixed(1) },
        { id: 'A3', y: 380, ev: row.ev3.toFixed(1) }
      ].forEach(s => {
        steps.push(buildLine(115, 230, 285, s.y, s.id) + buildNode('state', 300, s.y, s.id, s.ev)); // 枝条 + 状态节点

        let rY = s.y - 45;
        ['T1', 'T2', 'T3', 'T4'].forEach((t, i) => {
          let pVal = i===0 ? row.p : i===1 ? p2 : i===2 ? p3 : p4;
          steps.push(buildLine(315, s.y, 485, rY, `${t}(${pVal.toFixed(2)})`) + buildNode('res', 500, rY, '')); // 结果枝条
          rY += 30;
        });
      });
    } else {
      steps.push(buildNode('dec', 80, 230, '阶段一 X')); // Step 1

      steps.push(buildLine(95, 230, 285, 100, 'X1 加班') + buildNode('res', 300, 100, '', '-15000'));
      steps.push(buildLine(95, 230, 285, 300, 'X2 正常') + buildNode('state', 300, 300, 'Y', row.evX2.toFixed(0)));
      steps.push(buildLine(315, 300, 485, 200, `无雨(${(1-row.p).toFixed(2)})`) + buildNode('res', 500, 200, '', '0'));
      steps.push(buildLine(315, 300, 485, 380, `下雨(${(row.p).toFixed(2)})`) + buildNode('dec', 500, 380, '阶段二 Z', '-24750'));
      steps.push(buildLine(515, 380, 635, 330, 'Z1 紧急') + buildNode('state', 650, 330, 'R', '-24750'));

      steps.push(buildLine(665, 330, 735, 280, '省1天(0.5)') + buildNode('res', 750, 280, '', '-30000'));
      steps.push(buildLine(665, 330, 735, 330, '省2天(0.3)') + buildNode('res', 750, 330, '', '-22500'));
      steps.push(buildLine(665, 330, 735, 380, '省3天(0.2)') + buildNode('res', 750, 380, '', '-15000'));

      steps.push(buildLine(515, 380, 635, 430, 'Z2 正常') + buildNode('res', 650, 430, '', '-25000'));
    }

    state.maxDiagramStep = steps.length;

    // -1 表示完整显示，或者当前步数溢出时纠正
    if (state.diagramStep === -1 || state.diagramStep > state.maxDiagramStep) {
      state.diagramStep = state.maxDiagramStep;
    }

    // 更新按钮文字
    if (state.diagramStep >= state.maxDiagramStep) {
      dom.stepDrawBtn.textContent = '从头分步画树';
    } else {
      dom.stepDrawBtn.textContent = `绘制下一步 (${state.diagramStep}/${state.maxDiagramStep})`;
    }

    // 根据步数截取 SVG 并渲染
    let svgStr = steps.slice(0, state.diagramStep).join('');
    dom.diagramContainer.innerHTML = `<svg width="100%" height="100%" viewBox="0 0 ${w} ${h}">${svgStr}</svg>`;
  }

  function renderStepsCode() {
    const m = currentModel();
    dom.stepHeadline.innerHTML = `<h3>${m.name} 计算过程</h3><p>${m.summary}</p>`;
    dom.stepExplainer.innerHTML = m.steps.map(s => `<div class="step-block"><h4>${s.t}</h4><p>${s.c}</p></div>`).join('');
    dom.codeBlock.textContent = m.code;
  }

  function rerenderAll() {
    renderSwitcher();
    renderMeta();
    renderForm();
    renderStepsCode();

    dom.playbackRange.value = state.playbackValue;
    dom.playbackLabel.textContent = `核心概率：${state.playbackValue}%`;
    updateData();

    if(window.MathJax) window.MathJax.typesetPromise();
  }

  // --- Controls ---
  function stopPlayback() {
    if (state.playTimer) { clearInterval(state.playTimer); state.playTimer = null; }
  }
  function startPlayback() {
    stopPlayback();
    state.playTimer = setInterval(() => {
      state.playbackValue += 5;
      if (state.playbackValue > 100) state.playbackValue = 0;
      dom.playbackRange.value = state.playbackValue;
      dom.playbackLabel.textContent = `核心概率：${state.playbackValue}%`;
      updateData(); // 自动播放时依然保留画树进度
    }, 600);
  }

  dom.playBtn.addEventListener('click', startPlayback);
  dom.pauseBtn.addEventListener('click', stopPlayback);
  dom.playbackRange.addEventListener('input', (e) => {
    stopPlayback();
    state.playbackValue = Number(e.target.value);
    dom.playbackLabel.textContent = `核心概率：${state.playbackValue}%`;
    updateData();
  });

  // --- 画树交互事件 ---
  dom.stepDrawBtn.addEventListener('click', () => {
    if (state.diagramStep >= state.maxDiagramStep) {
      state.diagramStep = 1; // 重新从第一步开始画
    } else {
      state.diagramStep++; // 画下一步
    }
    updateData(); // 重新触发渲染
  });

  dom.fullDrawBtn.addEventListener('click', () => {
    state.diagramStep = state.maxDiagramStep; // 恢复完整显示
    updateData();
  });

  // --- Drag interaction for diagram ---
  dom.diagramStage.addEventListener('mousedown', e => {
    state.drag.active = true; state.drag.startX = e.clientX; state.drag.startY = e.clientY;
    state.drag.origX = state.diagramTransform.x; state.drag.origY = state.diagramTransform.y;
    dom.diagramStage.classList.add('dragging');
  });
  window.addEventListener('mousemove', e => {
    if (!state.drag.active) return;
    state.diagramTransform.x = state.drag.origX + (e.clientX - state.drag.startX);
    state.diagramTransform.y = state.drag.origY + (e.clientY - state.drag.startY);
    dom.diagramContainer.style.transform = `translate(${state.diagramTransform.x}px, ${state.diagramTransform.y}px) scale(${state.diagramTransform.scale})`;
  });
  window.addEventListener('mouseup', () => { state.drag.active = false; dom.diagramStage.classList.remove('dragging'); });
  dom.diagramStage.addEventListener('wheel', e => {
    e.preventDefault();
    state.diagramTransform.scale = Math.min(2.5, Math.max(0.5, state.diagramTransform.scale + (e.deltaY < 0 ? 0.1 : -0.1)));
    dom.diagramContainer.style.transform = `translate(${state.diagramTransform.x}px, ${state.diagramTransform.y}px) scale(${state.diagramTransform.scale})`;
  });

  initState();
  bindTabs();
  rerenderAll();
})();
