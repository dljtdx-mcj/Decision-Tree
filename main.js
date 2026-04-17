(() => {
  if (!window.APP_CONFIG || !window.APP_CONFIG.models) return;

  const models = window.APP_CONFIG.models;
  const state = {
    modelIndex: 0,
    params: {},
    playbackValue: 50, 
    playTimer: null,
    chartObj: null,
    diagramStep: -1, 
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
    // Set initial playback value from the first model's first param
    state.playbackValue = models[0].params[0].value;
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
        state.playbackValue = currentModel().params[0].value; 
        state.diagramStep = -1; 
        rerenderAll();
      });
    });
  }

  function renderMeta() {
    const m = currentModel();
    dom.metaCard.innerHTML = `
      <h3>${m.name} · ${m.source}</h3>
      <p style="font-size:13px;">${m.summary}</p>
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
        state.playbackValue = Number(inp.value);
        dom.playbackRange.value = state.playbackValue;
        updateData(); 
      });
    });
  }

  // --- Core Calculation Logic ---
  function calculateData() {
    const m = currentModel();
    const isSingle = m.id === 'single';
    const series = [];

    for (let i = 0; i <= 100; i += 5) {
      let probVar = i / 100;
      let row = { p: probVar };

      if (isSingle) {
        let remain = 1 - probVar;
        let p2 = remain * (2/6), p3 = remain * (3/6), p4 = remain * (1/6); // Fixed ratios based on original 0.2, 0.3, 0.1
        
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
        row.bestName = row.evX1 === row.best ? 'X1(前15天加班)' : 'X2(正常施工)';
      }
      series.push(row);
    }
    return series;
  }

  function updateData() {
    const data = calculateData();
    const m = currentModel();
    const currentIdx = Math.round(state.playbackValue / 5);
    const currentRow = data[currentIdx] || data[10]; // Fallback to 50% if undefined
    
    // Update Chart
    const labels = data.map(d => `${Math.round(d.p * 100)}%`);
    const datasets = m.id === 'single' 
      ? [
          { label: '方案 A1', data: data.map(d => d.ev1), borderColor: '#0d9488', tension: 0.1 },
          { label: '方案 A2', data: data.map(d => d.ev2), borderColor: '#f59e0b', tension: 0.1 },
          { label: '方案 A3', data: data.map(d => d.ev3), borderColor: '#6366f1', tension: 0.1 }
        ]
      : [
          { label: '方案 X1(直接加班)', data: data.map(d => d.evX1), borderColor: '#0d9488', tension: 0.1 },
          { label: '方案 X2(正常施工)', data: data.map(d => d.evX2), borderColor: '#f43f5e', tension: 0.1 }
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
    let ths = isSingle ? `<th>T1 概率</th><th>A1 期望值</th><th>A2 期望值</th><th>A3 期望值</th><th>最优方案</th>` 
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
      ? `当高需求状态 T1 概率为 ${(currentRow.p*100).toFixed(0)}% 时，最优选择为 <strong>${currentRow.bestName}</strong>，期望收益为 ${currentRow.best.toFixed(2)} 万元。改变概率会使各方案优势发生反转。`
      : `当后期下雨概率为 ${(currentRow.p*100).toFixed(0)}% 时，最优方案是 <strong>${currentRow.bestName}</strong>，期望损失为 ${currentRow.best.toFixed(0)} 元。因为 X1 成本固定，下雨风险极高时直接选 X1 止损更划算。`;
    dom.smartTip.innerHTML = `💡 ${tip}`;

    renderDiagram(currentRow);
  }

  // --- 高级防重叠绘图引擎 ---
  function renderDiagram(row) {
    const m = currentModel();
    let steps = []; 
    const w = 1000, h = 550; // 加宽画布，提供充足的间距

    // valPos 控制期望值显示的位置: 'bottom' (节点下方), 'right' (节点右侧)
    const buildNode = (type, x, y, label, val = null, valPos = 'bottom') => {
      let shape = '';
      if (type === 'dec') shape = `<rect x="${x-15}" y="${y-15}" width="30" height="30" fill="#fff" stroke="#0d9488" stroke-width="3"/>`;
      if (type === 'state') shape = `<circle cx="${x}" cy="${y}" r="15" fill="#fff" stroke="#f59e0b" stroke-width="3"/>`;
      if (type === 'res') shape = `<polygon points="${x},${y-15} ${x+15},${y+10} ${x-15},${y+10}" fill="#e2e8f0" stroke="#64748b" stroke-width="2"/>`;
      
      // 标签永远在节点正上方
      let text = label ? `<text x="${x}" y="${y-22}" text-anchor="middle" font-size="13" font-weight="bold" fill="#334155">${label}</text>` : '';
      
      // 期望值根据配置显示在下方或右侧，避免与连线重叠
      let valText = '';
      if (val !== null) {
          if (valPos === 'bottom') {
              valText = `<text x="${x}" y="${y+28}" text-anchor="middle" font-size="13" font-weight="bold" fill="#0f766e">${val}</text>`;
          } else if (valPos === 'right') {
              valText = `<text x="${x+20}" y="${y+5}" font-size="13" font-weight="bold" fill="#0f766e">${val}</text>`;
          }
      }
      return `<g>${shape}${text}${valText}</g>`;
    };

    // yOffset 让文字稍微漂浮在连线上方，防止穿线
    const buildLine = (x1, y1, x2, y2, label = '') => {
      let line = `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#94a3b8" stroke-width="2"/>`;
      let text = '';
      if (label) {
        // 如果线向下倾斜，文字稍微抬高一点防止切线
        let yOffset = y1 < y2 ? -12 : -8;
        text = `<text x="${(x1+x2)/2}" y="${(y1+y2)/2 + yOffset}" font-size="12" fill="#475569" text-anchor="middle">${label}</text>`;
      }
      return line + text;
    };

    if (m.id === 'single') {
      let remain = 1 - row.p;
      let p2 = remain * (2/6), p3 = remain * (3/6), p4 = remain * (1/6);
      
      // 题目原本的益损值矩阵
      const payoffs = {
          'A1': [180, 90, -30, -60],
          'A2': [120, 60, 20, -10],
          'A3': [80, 30, 40, 10]
      };

      steps.push(buildNode('dec', 100, 280, '决策点')); // Step 1
      
      [
        { id: 'A1', y: 100, ev: row.ev1.toFixed(1) },
        { id: 'A2', y: 280, ev: row.ev2.toFixed(1) },
        { id: 'A3', y: 460, ev: row.ev3.toFixed(1) }
      ].forEach(s => {
        // 节点间距拉大，x 从 100 跨越到 350
        steps.push(buildLine(115, 280, 335, s.y, `方案 ${s.id}`) + buildNode('state', 350, s.y, s.id, s.ev, 'bottom')); 
        
        let rY = s.y - 60;
        ['T1', 'T2', 'T3', 'T4'].forEach((t, i) => {
          let pVal = i===0 ? row.p : i===1 ? p2 : i===2 ? p3 : p4;
          let payoffVal = payoffs[s.id][i]; // 获取真实的益损值
          // x 从 350 跨越到 700
          steps.push(buildLine(365, s.y, 685, rY, `${t}(${pVal.toFixed(2)})`) + buildNode('res', 700, rY, '', payoffVal, 'right')); 
          rY += 40;
        });
      });
    } else {
      // 多级决策坐标重新映射，横向大幅度拉开
      steps.push(buildNode('dec', 80, 280, '点 X')); 
      
      steps.push(buildLine(95, 280, 285, 120, '方案 X1') + buildNode('res', 300, 120, '', '-15000', 'right'));
      steps.push(buildLine(95, 280, 285, 380, '方案 X2') + buildNode('state', 300, 380, '点 Y', row.evX2.toFixed(0), 'bottom'));
      
      steps.push(buildLine(315, 380, 535, 250, `无雨(${ (1-row.p).toFixed(2) })`) + buildNode('res', 550, 250, '', '0', 'right'));
      steps.push(buildLine(315, 380, 535, 480, `下雨(${ (row.p).toFixed(2) })`) + buildNode('dec', 550, 480, '点 Z', '-24750', 'bottom'));
      
      steps.push(buildLine(565, 480, 735, 400, '方案 Z1') + buildNode('state', 750, 400, '点 R', '-24750', 'bottom'));
      
      // 最右侧结果枝条
      steps.push(buildLine(765, 400, 885, 330, '省1天(0.5)') + buildNode('res', 900, 330, '', '-30000', 'right'));
      steps.push(buildLine(765, 400, 885, 400, '省2天(0.3)') + buildNode('res', 900, 400, '', '-22500', 'right'));
      steps.push(buildLine(765, 400, 885, 470, '省3天(0.2)') + buildNode('res', 900, 470, '', '-15000', 'right'));
      
      steps.push(buildLine(565, 480, 735, 530, '方案 Z2') + buildNode('res', 750, 530, '', '-25000', 'right'));
    }

    state.maxDiagramStep = steps.length;
    
    if (state.diagramStep === -1 || state.diagramStep > state.maxDiagramStep) {
      state.diagramStep = state.maxDiagramStep;
    }

    if (state.diagramStep >= state.maxDiagramStep) {
      dom.stepDrawBtn.textContent = '从头分步画树';
    } else {
      dom.stepDrawBtn.textContent = `绘制下一步 (${state.diagramStep}/${state.maxDiagramStep})`;
    }

    let svgStr = steps.slice(0, state.diagramStep).join('');
    dom.diagramContainer.innerHTML = `<svg width="100%" height="100%" viewBox="0 0 ${w} ${h}">${svgStr}</svg>`;
  }

  function renderStepsCode() {
    const m = currentModel();
    dom.stepHeadline.innerHTML = `<h3>${m.name} 计算过程</h3><p style="font-size:14px;line-height:1.6;">${m.summary}</p>`;
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
      updateData(); 
    }, 600);
  }

  dom.playBtn.addEventListener('click', startPlayback);
  dom.pauseBtn.addEventListener('click', stopPlayback);
  dom.playbackRange.addEventListener('input', (e) => {
    stopPlayback();
    state.playbackValue = Number(e.target.value);
    dom.playbackLabel.textContent = `核心概率：${state.playbackValue}%`;
    
    // 同步更新左侧的表单输入框的值
    const currentParamKey = currentModel().params[0].key;
    const inputEl = document.querySelector(`input[data-key="${currentParamKey}"]`);
    if(inputEl) inputEl.value = state.playbackValue;
    state.params[currentModel().id][currentParamKey] = state.playbackValue;
    
    updateData();
  });

  // --- 画树交互事件 ---
  dom.stepDrawBtn.addEventListener('click', () => {
    if (state.diagramStep >= state.maxDiagramStep) {
      state.diagramStep = 1; 
    } else {
      state.diagramStep++; 
    }
    updateData(); 
  });

  dom.fullDrawBtn.addEventListener('click', () => {
    state.diagramStep = state.maxDiagramStep; 
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
