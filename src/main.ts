import * as THREE from 'three';

type PendulumMode = 'large' | 'small' | 'driven' | 'damped' | 'chaotic' | 'other';

type PendulumParams = {
  length: number;
  gravity: number;
  damping: number;
  mass: number;
  theta0: number;
  driveAmplitude: number;
  driveFrequency: number;
  mode: PendulumMode;
};

type PendulumState = {
  theta: number;
  omega: number;
};

type SamplePoint = {
  t: number;
  theta: number;
  omega: number;
  ek: number;
  ep: number;
  energy: number;
};

function mustGetElement<T extends Element>(selector: string, root: ParentNode = document): T {
  const element = root.querySelector(selector);
  if (!element) {
    throw new Error(`Missing required element: ${selector}`);
  }
  return element as T;
}

class PendulumEngine {
  private state: PendulumState;
  private time = 0;

  constructor(initialTheta = Math.PI / 4, initialOmega = 0) {
    this.state = { theta: initialTheta, omega: initialOmega };
  }

  public reset(theta: number, omega = 0) {
    this.state.theta = theta;
    this.state.omega = omega;
    this.time = 0;
  }

  private acceleration(theta: number, omega: number, params: PendulumParams, time: number, includeDamping = true) {
    const drive = params.mode === 'driven'
      ? params.driveAmplitude * Math.cos(params.driveFrequency * time)
      : 0;
    const chaosDrive = params.mode === 'chaotic'
      ? params.driveAmplitude * Math.cos(params.driveFrequency * time)
      : 0;
    const nonlinear = params.mode === 'small'
      ? -(params.gravity / params.length) * theta
      : -(params.gravity / params.length) * Math.sin(theta);
    const dampingBoost = params.mode === 'damped' ? params.damping * 1.4 : params.damping;
    return nonlinear + drive + chaosDrive - (includeDamping ? dampingBoost * omega : 0);
  }

  public step(dt: number, params: PendulumParams) {
    const s = this.state;
    const t = this.time;
    const damping = params.mode === 'damped' ? params.damping * 1.4 : params.damping;
    const halfDamping = Math.exp((-damping * dt) / 2);
    s.omega *= halfDamping;
    const initialAcceleration = this.acceleration(s.theta, s.omega, params, t, false);
    const nextTheta = s.theta + s.omega * dt + 0.5 * initialAcceleration * dt * dt;
    const nextAcceleration = this.acceleration(nextTheta, s.omega, params, t + dt, false);
    s.omega += 0.5 * (initialAcceleration + nextAcceleration) * dt;
    s.theta = nextTheta;
    s.omega *= halfDamping;
    this.time += dt;
    return { ...s };
  }

  public getState() {
    return { ...this.state };
  }
}

const app = mustGetElement<HTMLDivElement>('#app');

app.innerHTML = `
  <div class="shell">
    <div class="bg-orb orb-1"></div>
    <div class="bg-orb orb-2"></div>
    <div class="bg-orb orb-3"></div>

    <header class="topbar glass">
      <div>
        <div class="eyebrow">WebGL / Three.js 虚拟仿真实验 2.0</div>
        <h1>非线性阻尼单摆实验平台 NEO</h1>
        <p>支持 Velocity Verlet 数值积分、轨迹示踪、能量监测与相图分析。</p>
      </div>
      <div class="badge glass-badge">实验状态：在线</div>
    </header>

    <main class="workspace">
      <aside class="control-panel card glass single-panel" id="controlPanel">
        <div class="panel-section panel-shell-head">
          <div class="card-head control-panel-head">
            <div>
              <h2>实验参数</h2>
              <span>Controls</span>
            </div>
            <button class="secondary panel-toggle" id="panelToggleBtn" type="button" aria-expanded="true">
              <span class="panel-toggle-icon" aria-hidden="true">◂</span>
              <span class="panel-toggle-label">收起窗格</span>
            </button>
          </div>
          <div class="panel-collapse-hint">窗口变窄时可折叠左侧实验窗格</div>
          <div class="panel-scroll-tip" id="panelScrollTip">
            <span class="panel-scroll-tip-icon" aria-hidden="true">↓</span>
            <span>向下滚动查看更多</span>
          </div>
          <div class="grid">
            <label>
              <span>摆长 L (cm)</span>
              <div class="range-with-input">
                <input id="length" type="range" min="0.5" max="3.5" step="0.01" value="1.5" />
                <input id="lengthNumber" class="value-input" type="number" min="0.5" max="3.5" step="0.01" value="1.50" />
              </div>
              <strong id="lengthValue"></strong>
            </label>
            <label>
              <span>重力 g</span>
              <div class="range-with-input">
                <input id="gravity" type="range" min="0" max="20" step="0.1" value="9.8" />
                <input id="gravityNumber" class="value-input" type="number" min="0" max="20" step="0.1" value="9.8" />
              </div>
              <strong id="gravityValue"></strong>
            </label>
            <label>
              <span>阻尼 b</span>
              <div class="range-with-input">
                <input id="damping" type="range" min="0" max="2" step="0.01" value="0.06" />
                <input id="dampingNumber" class="value-input" type="number" min="0" max="2" step="0.01" value="0.06" />
              </div>
              <strong id="dampingValue"></strong>
            </label>
            <label>
              <span>初始角度 θ₀</span>
              <div class="range-with-input">
                <input id="theta0" type="range" min="0" max="1.57" step="0.01" value="0.09" />
                <input id="theta0Number" class="value-input" type="number" min="0" max="90" step="1" value="5" />
              </div>
              <div class="mode-grid" id="modeGrid">
                <button class="mode-card active" type="button" data-mode="large">
                  <span class="mode-icon">∿</span>
                  <strong>大角度振动</strong>
                </button>
                <button class="mode-card" type="button" data-mode="small">
                  <span class="mode-icon">≈</span>
                  <strong>小角度振动</strong>
                </button>
                <button class="mode-card" type="button" data-mode="driven">
                  <span class="mode-icon">⚡</span>
                  <strong>受迫振动</strong>
                </button>
                <button class="mode-card" type="button" data-mode="damped">
                  <span class="mode-icon">⊣</span>
                  <strong>阻尼振动</strong>
                </button>
                <button class="mode-card" type="button" data-mode="chaotic">
                  <span class="mode-icon">✦</span>
                  <strong>混沌振动</strong>
                </button>
                <button class="mode-card" type="button" data-mode="other">
                  <span class="mode-icon">…</span>
                  <strong>其他类型</strong>
                </button>
              </div>
              <div class="slider-ticks" aria-hidden="true">
                <span>0°</span>
                <span>15°</span>
                <span>30°</span>
                <span>45°</span>
                <span>60°</span>
                <span>75°</span>
                <span>90°</span>
              </div>
              <strong id="theta0Value"></strong>
            </label>
          </div>
          <div class="actions">
            <button id="toggleBtn" type="button" aria-pressed="true">暂停</button>
            <button class="secondary" id="resetBtn" type="button">重置实验</button>
          </div>
          <div class="visual-toggle-group">
            <div class="visual-toggle-title">可视化显示</div>
            <label class="visual-toggle switch-row">
              <span>能量图</span>
              <div class="visual-toggle-row">
                <input id="energyToggle" type="checkbox" checked />
                <strong id="energyToggleLabel">开启</strong>
              </div>
            </label>
            <label class="visual-toggle switch-row">
              <span>相图</span>
              <div class="visual-toggle-row">
                <input id="phaseToggle" type="checkbox" checked />
                <strong id="phaseToggleLabel">开启</strong>
              </div>
            </label>
            <div class="visual-range-card">
              <div class="visual-range-head">
                <span>θ 轴范围</span>
                <strong><span id="phaseThetaRangeNumber">3.2</span> rad</strong>
              </div>
              <div class="range-with-input compact-range">
                <input id="phaseThetaRange" type="range" min="0.5" max="8" step="0.1" value="3.2" />
                <input id="phaseThetaRangeNumberInput" class="value-input" type="number" min="0.5" max="8" step="0.1" value="3.2" />
              </div>
            </div>
            <div class="visual-range-card">
              <div class="visual-range-head">
                <span>ω 轴范围</span>
                <strong><span id="phaseOmegaRangeNumber">6.5</span> rad/s</strong>
              </div>
              <div class="range-with-input compact-range">
                <input id="phaseOmegaRange" type="range" min="0.5" max="20" step="0.1" value="6.5" />
                <input id="phaseOmegaRangeNumberInput" class="value-input" type="number" min="0.5" max="20" step="0.1" value="6.5" />
              </div>
            </div>
            <label class="visual-toggle switch-row">
              <span>三维摆动场景</span>
              <div class="visual-toggle-row">
                <input id="sceneToggle" type="checkbox" checked />
                <strong id="sceneToggleLabel">开启</strong>
              </div>
            </label>
          </div>
        </div>

        <div class="panel-section panel-divider">
          <div class="card-head">
            <h2>实时数据</h2>
            <span>Live</span>
          </div>
          <div class="stats-grid">
            <div><span>θ</span><strong id="thetaReadout"></strong></div>
            <div><span>ω</span><strong id="omegaReadout"></strong></div>
            <div><span>Ek</span><strong id="ekReadout"></strong></div>
            <div><span>Ep</span><strong id="epReadout"></strong></div>
            <div><span>E</span><strong id="eReadout"></strong></div>
            <div><span>能量漂移</span><strong id="energyDriftReadout">0.00%</strong></div>
            <div><span>记录数</span><strong id="recordCountReadout">0</strong></div>
          </div>
        </div>

        <section class="card glass lab-card compact-card">
          <div class="card-head lab-card-head">
            <div>
              <h2>单摆法测 g</h2>
              <span>Formal Lab Report</span>
            </div>
            <button class="secondary lab-toggle" id="labToggleBtn" type="button" aria-expanded="true">
              <span class="lab-toggle-icon" aria-hidden="true">▾</span>
              <span class="lab-toggle-label">收起</span>
            </button>
          </div>
          <div class="lab-body" id="labBody">
            <div class="lab-body-inner">
              <div class="report-section report-intro">
                <div>
                  <span>实验目标</span>
                  <strong>由单摆周期测定当地重力加速度</strong>
                </div>
                <div>
                  <span>核心公式</span>
                  <strong>g = 4π²l / T²</strong>
                  <div class="lab-formula-note">其中 l 以 m 计，T 以 s 计</div>
                </div>
              </div>
              <div class="report-section">
                <div class="section-title">一、实验步骤</div>
                <ol class="lab-steps">
                  <li>测量摆球直径 <b>d</b> 和摆线长度 <b>l绳</b>。</li>
                  <li>由 <b>l = l绳 + d/2</b> 计算摆长（统一按 cm 记录），并设定 <b>n = 50</b>。</li>
                  <li>将摆球拉离平衡位置，小角度、无初速度释放。</li>
                  <li>记录 <b>50</b> 次全振动总时间 <b>T总</b>。</li>
                  <li>计算单次周期 <b>T = T总 / n</b>，再代入公式求 <b>g</b>。</li>
                </ol>
              </div>
              <div class="report-section">
                <div class="section-title">二、实验数据（对应报告表格）</div>
                <div class="report-table-grid">
                  <label><span>姓名</span><input id="studentName" type="text" placeholder="填写姓名" /></label>
                  <label><span>学号</span><input id="studentId" type="text" placeholder="填写学号" /></label>
                  <label><span>班级</span><input id="className" type="text" placeholder="填写班级" /></label>
                  <label><span>日期</span><input id="reportDate" type="date" /></label>
                  <label><span>同组人员</span><input id="groupMembers" type="text" placeholder="填写同组人员" /></label>
                  <label><span>摆球直径 d (cm)</span><input id="ballDiameter" type="number" min="0.1" step="0.01" value="2.00" /></label>
                  <label><span>摆线长度 l绳 (cm)</span><input id="stringLength" type="number" min="1" step="0.1" value="73.00" /></label>
                  <label><span>测量周期数 n</span><input id="cycleCount" type="number" min="1" step="1" value="50" /></label>
                  <label><span>50 次全振动总时间 T总 (s)</span><input id="totalTimeInput" type="number" min="0.1" step="0.01" placeholder="例如 87.20" /></label>
                </div>
              </div>
              <div class="report-section">
                <div class="section-title">三、表格结果</div>
                <div class="lab-metrics lab-metrics-report">
                  <label class="report-result-editable">
                    <span>摆长 l</span>
                    <input id="pendulumLengthReadout" type="text" value="0.00 cm" />
                  </label>
                  <div><span>单次周期 T</span><strong id="periodInput">--</strong></div>
                  <div><span>计算值 g</span><strong id="gravityResultReadout">--</strong></div>
                  <div><span>相对误差</span><strong id="gErrorReadout">--</strong></div>
                  <div class="lab-metrics-note">由 cm 换算为 m 后计算，可直接导出实验报告</div>
                </div>
              </div>
              <div class="actions lab-actions">
                <button id="calculateGBtn">计算重力加速度</button>
                <button class="secondary" id="useStopwatchBtn">用秒表填入 T总</button>
                <button class="secondary" id="exportPdfBtn">导出实验报告</button>
              </div>
              <div class="lab-hint">默认按实验指导书：l = l绳 + d/2，n = 50，使用小角度摆动结果。</div>
            </div>
          </div>
        </section>

        <div class="panel-section panel-divider">
          <div class="card-head">
            <h2>AI 对话助手</h2>
            <span id="aiStatusReadout">准备就绪</span>
          </div>
          <div class="ai-help">你可以直接向 AI 询问实验原理、数据分析和报告总结。</div>
          <div class="ai-config-grid">
            <div class="ai-config-static">
              <span>模型</span>
              <strong>自动轮询</strong>
            </div>
            <div class="ai-config-static">
              <span>推理强度</span>
              <strong>实验上下文</strong>
            </div>
          </div>
          <div class="ai-chat" id="aiChat"></div>
          <div class="ai-quick-actions">
            <button class="secondary" data-ai-prompt="帮我总结当前摆动实验的关键数据">总结数据</button>
            <button class="secondary" data-ai-prompt="如何通过单摆实验测重力加速度">实验原理</button>
            <button class="secondary" data-ai-prompt="如果阻尼变大，实验现象会怎样">参数分析</button>
          </div>
          <div class="ai-input-row">
            <textarea id="aiInput" rows="3" maxlength="1200" placeholder="输入问题，例如：为什么初始角度变大时周期会变化？"></textarea>
            <div class="ai-input-actions">
              <button id="aiSendBtn">发送</button>
              <button class="secondary" id="aiStopBtn" disabled>停止生成</button>
            </div>
          </div>
        </div>

        <div class="panel-section panel-divider">
          <div class="card-head">
            <h2>实验记录与分析</h2>
            <span>Logs</span>
          </div>
          <div class="record-actions">
            <button id="recordBtn">开始记录</button>
            <button class="secondary" id="clearRecordBtn">清空记录</button>
            <button class="secondary" id="exportCsvBtn">导出 CSV</button>
          </div>
          <div class="stopwatch-card">
            <div class="stopwatch-head">
              <span>秒表</span>
              <strong id="stopwatchState">等待开始</strong>
            </div>
            <div class="stopwatch-time" id="stopwatchTime">00:00.000</div>
            <div class="stopwatch-meta">
              <div><span>已完成摆动</span><strong id="swingCountReadout">0 / 10</strong></div>
              <div><span>目标</span><strong>10 次</strong></div>
            </div>
            <div class="record-actions stopwatch-actions">
              <button id="stopwatchBtn">开始秒表</button>
              <button class="secondary" id="stopwatchResetBtn">重置秒表</button>
            </div>
          </div>

          <div class="mini-tabs" id="analysisTabs" role="tablist" aria-label="实验分析视图">
            <button class="mini-tab active" type="button" role="tab" aria-selected="true" data-panel="record">记录</button>
            <button class="mini-tab" type="button" role="tab" aria-selected="false" data-panel="energy">能量</button>
            <button class="mini-tab" type="button" role="tab" aria-selected="false" data-panel="phase">相图</button>
          </div>

          <div class="analysis-panel active" role="tabpanel" data-panel="record">
            <div class="record-list" id="recordList"></div>
          </div>
          <div class="analysis-panel" role="tabpanel" data-panel="energy" hidden>
            <canvas id="energyCanvas" width="420" height="240"></canvas>
          </div>
          <div class="analysis-panel" role="tabpanel" data-panel="phase" hidden>
            <canvas id="phaseCanvas" width="420" height="240"></canvas>
          </div>
        </div>
      </aside>

      <section class="scene-panel card glass">
        <div class="scene-header">
          <div>
            <h2>三维摆动场景</h2>
            <p>实时映射角位移到 rotation.z，并显示质点运动轨迹。</p>
          </div>
          <div class="scene-header-right">
            <div class="legend">
              <span><i class="dot dot-a"></i> 摆球轨迹</span>
              <span><i class="dot dot-b"></i> 相图</span>
            </div>
            <div class="mode-badge" data-mode-tag>大角度 · 大角度振动</div>
          </div>
        </div>
        <div class="scene-debug glass" id="sceneDebug">
          <div><span>Canvas</span><strong id="sceneDebugCanvas">--</strong></div>
          <div><span>Parent</span><strong id="sceneDebugParent">--</strong></div>
          <div><span>Renderer</span><strong id="sceneDebugRenderer">--</strong></div>
          <div><span>Camera</span><strong id="sceneDebugCamera">--</strong></div>
        </div>
        <div class="scene-frame glass">
          <div class="scene-frame-highlight"></div>
          <div class="scene-mode-overlay" data-mode-tag>大角度 · 大角度振动</div>
          <canvas id="sceneCanvas"></canvas>
        </div>
      </section>
    </main>

    <div class="report-overlay" id="reportOverlay" aria-hidden="true">
      <div class="report-overlay-backdrop" id="reportOverlayBackdrop"></div>
      <div class="report-overlay-panel glass">
        <div class="report-overlay-header">
          <div>
            <h2>编辑报告</h2>
            <p>可在页面内直接填写、修改并导出实验报告</p>
          </div>
          <div class="report-overlay-actions">
            <button class="secondary" id="reportOverlaySaveBtn" type="button">导出实验报告</button>
            <button class="secondary" id="reportOverlayCloseBtn" type="button">关闭</button>
          </div>
        </div>
        <iframe id="reportOverlayFrame" title="可编辑实验报告"></iframe>
      </div>
    </div>

    <footer class="site-footer">
      <div class="container footer-inner">
        <div class="footer-content">
          <p>非线性阻尼单摆虚拟仿真实验平台 · 基于 WebGL 与 Three.js 自主开发</p>
        </div>
      </div>
    </footer>
  </div>
`;

const style = document.createElement('style');
style.textContent = `
  :root {
    color-scheme: dark;
    --bg: #08101b;
    --bg-2: #0d1724;
    --panel: rgba(14, 22, 35, 0.92);
    --panel-2: rgba(18, 28, 42, 0.96);
    --line: rgba(255, 255, 255, 0.1);
    --text: rgba(248, 251, 255, 0.95);
    --muted: rgba(216, 226, 243, 0.72);
    --accent: #87aef8;
    --accent-2: #68d6c2;
    --accent-3: #f38bd9;
    --shadow: 0 18px 42px rgba(0, 0, 0, 0.28);
    --shadow-soft: 0 10px 24px rgba(0, 0, 0, 0.16);
    --ease-out: cubic-bezier(0.22, 1, 0.36, 1);
    --ease-soft: cubic-bezier(0.25, 0.8, 0.25, 1);
    --dur-fast: 160ms;
    --dur-med: 240ms;
    --dur-slow: 360ms;
  }
  * { box-sizing: border-box; }
  html, body, #app {
    margin: 0;
    width: 100%;
    min-height: 100%;
    height: 100%;
    font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', system-ui, sans-serif;
    background:
      radial-gradient(circle at 16% 14%, rgba(137, 180, 255, 0.18), transparent 22%),
      radial-gradient(circle at 82% 16%, rgba(120, 234, 216, 0.12), transparent 20%),
      radial-gradient(circle at 52% 88%, rgba(255, 146, 228, 0.1), transparent 22%),
      linear-gradient(180deg, var(--bg) 0%, var(--bg-2) 52%, #051019 100%);
    color: var(--text);
    overflow: auto;
  }
  .shell {
    position: relative;
    width: min(100%, 1560px);
    min-height: 100dvh;
    height: auto;
    display: flex;
    flex-direction: column;
    gap: 14px;
    margin: 0 auto;
    padding: 14px;
    box-sizing: border-box;
    isolation: isolate;
    overflow: visible;
    --mx: 50%;
    --my: 20%;
    --pulse: 1;
    --pulse-soft: 0.5;
  }
  .bg-orb {
    position: absolute; inset: auto;
    width: 340px; height: 340px; border-radius: 50%; filter: blur(46px); opacity: 0.5; pointer-events: none;
  }
  .orb-1 { top: -90px; left: -100px; background: rgba(143, 184, 255, 0.2); }
  .orb-2 { top: 80px; right: -90px; background: rgba(132, 240, 221, 0.16); }
  .orb-3 { bottom: -110px; left: 20%; background: rgba(255, 147, 234, 0.1); }
  .glass {
    position: relative;
    background:
      linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.02)),
      var(--panel);
    border: 1px solid var(--line);
    box-shadow: inset 0 1px 0 rgba(255,255,255,0.05), var(--shadow);
    backdrop-filter: blur(10px) saturate(120%);
    -webkit-backdrop-filter: blur(10px) saturate(120%);
    overflow: hidden;
    transition: transform var(--dur-med) var(--ease-out), box-shadow var(--dur-med) var(--ease-out), border-color var(--dur-fast) var(--ease-soft), filter var(--dur-fast) var(--ease-soft);
  }
  .glass::before {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: inherit;
    background: linear-gradient(135deg, rgba(255,255,255,0.08), transparent 42%, rgba(255,255,255,0.03) 72%, transparent 100%);
    pointer-events: none;
    opacity: 0.9;
    transition: opacity var(--dur-fast) var(--ease-soft), transform var(--dur-med) var(--ease-out), background var(--dur-fast) var(--ease-soft);
  }
  .glass::after {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: inherit;
    border: 1px solid rgba(255,255,255,0.08);
    pointer-events: none;
    transition: border-color 180ms ease, opacity 180ms ease;
  }
  .glass:hover {
    transform: translateY(-1px);
    border-color: rgba(255,255,255,0.16);
    box-shadow: inset 0 1px 0 rgba(255,255,255,0.08), 0 16px 34px rgba(0, 0, 0, 0.22);
    filter: brightness(1.01);
  }
  .control-panel::-webkit-scrollbar {
    width: 10px;
  }
  .control-panel::-webkit-scrollbar-track {
    background: rgba(255,255,255,0.04);
    border-radius: 999px;
    margin: 10px 0;
  }
  .control-panel::-webkit-scrollbar-thumb {
    background: linear-gradient(180deg, rgba(143,184,255,0.72), rgba(132,240,221,0.5));
    border-radius: 999px;
    border: 2px solid rgba(14, 20, 34, 0.72);
  }
  .control-panel::-webkit-scrollbar-thumb:hover {
    background: linear-gradient(180deg, rgba(143,184,255,0.92), rgba(132,240,221,0.72));
  }
  .glass:hover::before {
    opacity: 1;
    transform: translateY(-2px);
  }
  .glass:hover::after {
    border-color: rgba(255,255,255,0.14);
  }
  .topbar {
    display: flex;
    justify-content: space-between;
    gap: 16px;
    align-items: center;
    padding: 16px 18px;
    border-radius: 18px;
    position: relative;
    overflow: hidden;
  }
  .topbar::before {
    content: '';
    position: absolute;
    inset: 0;
    background: linear-gradient(180deg, rgba(255,255,255,0.08), transparent 36%);
    pointer-events: none;
  }
  .topbar::after {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: inherit;
    box-shadow: inset 0 1px 0 rgba(255,255,255,0.08);
    pointer-events: none;
  }
  .eyebrow { font-size: 12px; letter-spacing: .18em; text-transform: uppercase; color: var(--accent-2); margin-bottom: 8px; }
  .topbar h1, .card h2 { margin: 0; letter-spacing: -0.03em; }
  .topbar h1 { font-size: 26px; line-height: 1.08; }
  .topbar p { margin: 7px 0 0; color: var(--muted); max-width: 720px; font-size: 13px; line-height: 1.55; }
  .glass-badge {
    padding: 8px 12px;
    border-radius: 999px;
    color: #fff;
    font-weight: 600;
    white-space: nowrap;
    background: rgba(255,255,255,0.06);
    border: 1px solid var(--line);
    box-shadow: inset 0 1px 0 rgba(255,255,255,0.06);
    letter-spacing: 0.02em;
  }
  .workspace {
    flex: 1;
    display: grid;
    grid-template-columns: minmax(360px, 404px) minmax(0, 1fr);
    gap: 16px;
    min-height: 0;
    height: auto;
    overflow: visible;
    align-items: stretch;
  }
  .workspace > * { min-width: 0; }
  .workspace.is-panel-collapsed { grid-template-columns: 76px minmax(0, 1fr); }
  .control-panel {
    display: flex;
    flex-direction: column;
    gap: 12px;
    min-height: 0;
    height: 100%;
    max-height: 100%;
    overflow-y: auto;
    overflow-x: hidden;
    -webkit-overflow-scrolling: touch;
    overscroll-behavior: contain;
    padding-right: 10px;
    padding-bottom: 12px;
    align-content: start;
    scrollbar-gutter: stable;
    position: relative;
  }
  .panel-scroll-tip {
    position: sticky;
    top: 8px;
    align-self: flex-end;
    margin-left: auto;
    margin-right: 6px;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 6px 10px;
    border-radius: 999px;
    font-size: 11px;
    line-height: 1;
    color: rgba(255,255,255,0.88);
    background: rgba(255,255,255,0.08);
    border: 1px solid rgba(255,255,255,0.08);
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
    box-shadow: 0 6px 18px rgba(0,0,0,0.14);
    pointer-events: none;
    z-index: 3;
    will-change: opacity, transform, filter;
    transition: opacity var(--dur-slow) var(--ease-out), transform var(--dur-slow) var(--ease-out), filter var(--dur-slow) var(--ease-out);
  }
  .panel-scroll-tip::after {
    content: '';
    position: absolute;
    inset: -8px;
    border-radius: inherit;
    background: radial-gradient(circle, rgba(255,255,255,0.18), transparent 65%);
    opacity: 0.45;
    filter: blur(8px);
    pointer-events: none;
    z-index: -1;
    transition: opacity var(--dur-slow) var(--ease-out), transform var(--dur-slow) var(--ease-out);
  }
  .panel-scroll-tip.is-hidden {
    opacity: 0;
    transform: translateY(-10px) scale(0.96);
    filter: blur(4px);
  }
  .panel-scroll-tip.is-hidden::after {
    opacity: 0;
    transform: scale(0.92);
  }
  .panel-scroll-tip-icon {
    display: inline-block;
    animation: panelArrowBounce 1.15s var(--ease-soft) infinite;
    transform-origin: 50% 55%;
  }
  @keyframes panelArrowBounce {
    0%, 100% { transform: translateY(0); }
    50% { transform: translateY(3px); }
  }
  .control-panel.is-collapsed .panel-scroll-tip {
    opacity: 0;
    transform: translateY(-10px) scale(0.96);
    filter: blur(4px);
  }
  .control-panel::after {
    content: '';
    position: sticky;
    left: 0;
    right: 0;
    bottom: 0;
    height: 28px;
    margin-top: auto;
    pointer-events: none;
    background: linear-gradient(180deg, transparent, rgba(11, 18, 32, 0.65));
    opacity: 0.95;
    z-index: 2;
  }
  .card {
    border-radius: 18px;
    padding: 14px;
    position: relative;
    overflow: hidden;
    flex: 0 0 auto;
  }
  .control-panel > .card { min-width: 0; }
  .single-panel { display: flex; flex-direction: column; gap: 16px; }
  .panel-section {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 2px 2px 0;
  }
  .panel-section + .panel-section { margin-top: 2px; }
  .panel-shell-head {
    padding-bottom: 10px;
    border-bottom: 1px solid rgba(255,255,255,0.08);
  }
  .control-panel-head { align-items: center; }
  .panel-toggle {
    min-width: 96px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    transition: transform var(--dur-med) var(--ease-out), opacity var(--dur-med) var(--ease-out), background var(--dur-med) var(--ease-out), box-shadow var(--dur-med) var(--ease-out);
  }
  .panel-toggle-icon {
    display: inline-block;
    transition: transform var(--dur-med) var(--ease-out);
    transform-origin: 50% 55%;
    font-size: 12px;
    line-height: 1;
  }
  .panel-toggle.is-collapsed .panel-toggle-icon {
    transform: rotate(180deg);
  }
  .panel-toggle-label { transition: opacity 180ms ease; }
  .panel-collapse-hint {
    color: var(--muted);
    font-size: 12px;
    line-height: 1.4;
    margin-top: -2px;
  }
  .control-panel.is-collapsed {
    min-width: 76px;
    width: 76px;
    padding-right: 0;
    padding-left: 0;
    overflow: hidden;
  }
  .control-panel.is-collapsed::before,
  .control-panel.is-collapsed::after {
    opacity: 0;
  }
  .panel-scroll-tip.is-hidden {
    opacity: 0;
    transform: translateY(-6px) scale(0.98);
  }
  .control-panel.is-collapsed .panel-section:not(.panel-shell-head),
  .control-panel.is-collapsed .panel-collapse-hint,
  .control-panel.is-collapsed .control-panel-head > div > span,
  .control-panel.is-collapsed .control-panel-head > div > h2 {
    display: none;
  }
  .control-panel.is-collapsed .control-panel-head {
    flex-direction: column;
    align-items: center;
    gap: 8px;
    margin-bottom: 0;
  }
  .control-panel.is-collapsed .panel-toggle {
    min-width: 60px;
    width: 60px;
    padding: 10px 0;
    writing-mode: vertical-rl;
    text-orientation: mixed;
    letter-spacing: 0.08em;
  }
  .control-panel.is-collapsed .panel-toggle-icon {
    transform: rotate(90deg);
  }
  .control-panel.is-collapsed .panel-toggle-label { display: none; }
  .panel-divider {
    padding-top: 14px;
    border-top: 1px solid rgba(255,255,255,0.08);
  }
  .compact-card { margin-bottom: 0; }
  .card-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 9px; }
  .card-head span { font-size: 12px; color: var(--muted); letter-spacing: 0.08em; text-transform: uppercase; }
  .card::before {
    content: '';
    position: absolute;
    inset: 0;
    background: radial-gradient(circle at var(--mx) var(--my), rgba(255,255,255,0.12), transparent 16%), linear-gradient(135deg, rgba(255,255,255,0.12), transparent 28%, transparent 72%, rgba(255,255,255,0.05));
    pointer-events: none;
    mix-blend-mode: screen;
    transition: opacity var(--dur-fast) var(--ease-soft);
  }
  .card::after {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: inherit;
    box-shadow: inset 0 1px 0 rgba(255,255,255,0.12), inset 0 -1px 0 rgba(255,255,255,0.03);
    pointer-events: none;
  }
  .grid { display: grid; gap: 14px; }
  label { display: grid; gap: 8px; }
  .slider-ticks {
    display: grid;
    grid-template-columns: repeat(7, minmax(0, 1fr));
    gap: 4px;
    margin-top: -2px;
    font-size: 11px;
    color: rgba(226, 235, 255, 0.62);
    letter-spacing: 0.01em;
    user-select: none;
  }
  .slider-ticks span {
    text-align: center;
    white-space: nowrap;
  }
  label span { color: var(--muted); font-size: 13px; }
  label strong { font-size: 13px; color: #fff; }
  input[type='range'] {
    width: 100%;
    height: 24px;
    appearance: none;
    background: transparent;
    margin: 0;
    cursor: pointer;
  }
  input[type='range']::-webkit-slider-runnable-track {
    height: 7px;
    border-radius: 999px;
    background: linear-gradient(180deg, rgba(255,255,255,0.16), rgba(255,255,255,0.07));
    border: 1px solid rgba(255,255,255,0.1);
    box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.22);
  }
  input[type='range']::-webkit-slider-thumb {
    appearance: none;
    width: 22px;
    height: 22px;
    margin-top: -8px;
    border-radius: 50%;
    background:
      radial-gradient(circle at 35% 30%, rgba(255,255,255,0.98), rgba(255,255,255,0.44) 24%, rgba(225,233,255,0.96) 44%, rgba(128,154,233,0.96) 72%, rgba(70,90,166,0.98) 100%);
    border: 1px solid rgba(255,255,255,0.38);
    box-shadow:
      0 10px 18px rgba(0, 0, 0, 0.24),
      inset 0 1px 1px rgba(255,255,255,0.42),
      inset 0 -1px 1px rgba(0,0,0,0.12);
  }
  input[type='range']::-moz-range-track {
    height: 7px;
    border-radius: 999px;
    background: linear-gradient(180deg, rgba(255,255,255,0.16), rgba(255,255,255,0.07));
    border: 1px solid rgba(255,255,255,0.1);
    box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.22);
  }
  input[type='range']::-moz-range-thumb {
    width: 22px;
    height: 22px;
    border-radius: 50%;
    background:
      radial-gradient(circle at 35% 30%, rgba(255,255,255,0.98), rgba(255,255,255,0.44) 24%, rgba(225,233,255,0.96) 44%, rgba(128,154,233,0.96) 72%, rgba(70,90,166,0.98) 100%);
    border: 1px solid rgba(255,255,255,0.38);
    box-shadow:
      0 10px 18px rgba(0, 0, 0, 0.24),
      inset 0 1px 1px rgba(255,255,255,0.42),
      inset 0 -1px 1px rgba(0,0,0,0.12);
  }
  .actions { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 16px; }
  .range-with-input {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 96px;
    gap: 10px;
    align-items: center;
  }
  .value-input {
    width: 100%;
    min-width: 0;
    border-radius: 12px;
    border: 1px solid rgba(255,255,255,0.14);
    background: rgba(255,255,255,0.06);
    color: var(--text);
    padding: 8px 10px;
    outline: none;
    font: inherit;
    text-align: center;
  }
  .value-input:focus {
    border-color: rgba(143,184,255,0.5);
    box-shadow: 0 0 0 4px rgba(143,184,255,0.12);
  }
  .mode-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 8px;
    margin-top: 10px;
  }
  .mode-card {
    min-height: 64px;
    padding: 10px 10px;
    border-radius: 12px;
    border: 1px solid rgba(255,255,255,0.1);
    background: rgba(255,255,255,0.03);
    color: rgba(255,255,255,0.78);
    display: grid;
    place-items: center;
    gap: 6px;
    text-align: center;
    box-shadow: none;
  }
  .mode-card.active {
    background: linear-gradient(180deg, rgba(111,255,233,0.1), rgba(154,191,255,0.08));
    border-color: rgba(154,191,255,0.55);
    color: #fff;
    box-shadow: inset 0 1px 0 rgba(255,255,255,0.08);
  }
  .mode-icon { font-size: 18px; line-height: 1; }
  .mode-card strong { font-size: 13px; }
  .visual-toggle-group {
    display: grid;
    gap: 10px;
    margin-top: 10px;
    padding: 14px;
    border-radius: 18px;
    border: 1px solid rgba(255,255,255,0.08);
    background:
      linear-gradient(180deg, rgba(255,255,255,0.05), rgba(255,255,255,0.03)),
      rgba(255,255,255,0.03);
    box-shadow: inset 0 1px 0 rgba(255,255,255,0.04);
  }
  .visual-toggle-title { color: #fff; font-size: 13px; font-weight: 700; letter-spacing: 0.02em; margin-bottom: 2px; }
  .visual-toggle {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 4px 0;
  }
  .visual-toggle + .visual-toggle { border-top: 1px solid rgba(255,255,255,0.08); padding-top: 10px; }
  .visual-toggle span { color: var(--muted); font-size: 13px; }
  .visual-toggle-row { display: inline-flex; align-items: center; gap: 10px; }
  .switch-row input { width: 18px; height: 18px; accent-color: var(--accent-2); }
  .visual-toggle strong { font-size: 13px; color: #fff; }
  .visual-range-card {
    padding: 10px 12px 12px;
    border-radius: 14px;
    background: rgba(8, 13, 24, 0.35);
    border: 1px solid rgba(255,255,255,0.07);
  }
  .visual-range-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 10px;
    color: #fff;
    font-size: 13px;
    font-weight: 600;
  }
  .visual-range-head span { color: var(--muted); font-weight: 600; }
  .visual-range-head strong { color: #fff; font-size: 12px; }
  .compact-range { gap: 10px; }
  .compact-range .value-input { width: 80px; }
  button {
    position: relative;
    border: 1px solid rgba(255,255,255,0.18);
    border-radius: 12px;
    padding: 10px 14px;
    font-weight: 600;
    color: white;
    cursor: pointer;
    background: linear-gradient(180deg, rgba(255,255,255,0.12), rgba(255,255,255,0.06));
    box-shadow:
      inset 0 1px 0 rgba(255,255,255,0.16),
      inset 0 -1px 0 rgba(0,0,0,0.16),
      0 8px 18px rgba(0, 0, 0, 0.16);
    transition: transform 160ms ease, box-shadow 160ms ease, filter 160ms ease, background 160ms ease;
    overflow: hidden;
  }
  button:hover {
    transform: translateY(-1px) scale(1.01);
    filter: brightness(1.06);
  }
  button:active {
    transform: translateY(0) scale(0.99);
  }
  button::before {
    content: '';
    position: absolute;
    inset: 0;
    background: linear-gradient(135deg, rgba(255,255,255,0.28), transparent 38%, transparent 62%, rgba(255,255,255,0.08));
    opacity: 0.85;
    pointer-events: none;
  }
  button:hover { transform: translateY(-1px); filter: brightness(1.05); background: linear-gradient(180deg, rgba(255,255,255,0.16), rgba(255,255,255,0.08)); }
  button:active { transform: translateY(0); box-shadow: inset 0 1px 0 rgba(255,255,255,0.14), 0 4px 10px rgba(0,0,0,0.14); }
  button.secondary { background: rgba(255,255,255,0.08); }
  button.secondary::before { background: linear-gradient(135deg, rgba(255,255,255,0.14), transparent 40%); }
  .stats-grid {
    display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px;
  }
  .stats-grid-compact {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
  .report-section {
    margin-bottom: 10px;
    padding: 13px 13px;
    border-radius: 16px;
    background: rgba(255,255,255,0.04);
    border: 1px solid rgba(255,255,255,0.08);
  }
  .lab-card-head { align-items: center; }
  .lab-card-head > div { display: flex; flex-direction: column; gap: 2px; }
  .lab-body {
    display: grid;
    grid-template-rows: 1fr;
    transition: grid-template-rows var(--dur-med) var(--ease-out), opacity var(--dur-med) var(--ease-out), transform var(--dur-med) var(--ease-out);
    overflow: hidden;
  }
  .lab-body-inner {
    min-height: 0;
    display: grid;
    gap: 10px;
    overflow: hidden;
  }
  .lab-body.is-collapsed {
    grid-template-rows: 0fr;
    opacity: 0;
    transform: translateY(-4px);
    pointer-events: none;
  }
  .lab-toggle {
    min-width: 92px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
  }
  .lab-toggle-icon {
    display: inline-block;
    transition: transform 240ms ease;
    transform-origin: 50% 55%;
    font-size: 12px;
    line-height: 1;
  }
  .lab-toggle.is-collapsed .lab-toggle-icon {
    transform: rotate(-180deg);
  }
  .lab-toggle-label {
    transition: opacity 180ms ease;
  }
  .report-intro {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
  }
  .report-intro span { display: block; color: var(--muted); font-size: 12px; margin-bottom: 4px; }
  .report-intro strong { font-size: 13px; }
  .section-title { font-size: 12px; letter-spacing: .08em; text-transform: uppercase; color: var(--muted); margin-bottom: 8px; }
  .lab-steps {
    margin: 0;
    padding-left: 18px;
    display: grid;
    gap: 6px;
    color: rgba(245,248,255,0.92);
    line-height: 1.45;
    font-size: 13px;
  }
  .lab-steps b { color: #fff; font-weight: 700; }
  .lab-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
    align-items: start;
  }
  .lab-grid-compact { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .lab-grid label {
    display: grid;
    gap: 6px;
    align-content: start;
  }
  .lab-grid span {
    color: var(--muted);
    font-size: 12px;
    line-height: 1.25;
  }
  .report-table-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
  }
  .report-table-grid label {
    display: grid;
    gap: 6px;
  }
  .report-table-grid input,
  .lab-grid input {
    width: 100%;
    min-width: 0;
    margin-top: 0;
    border-radius: 12px;
    border: 1px solid rgba(255,255,255,0.14);
    background: rgba(255,255,255,0.06);
    color: var(--text);
    padding: 9px 10px;
    outline: none;
  }
  .report-table-grid input:focus,
  .lab-grid input:focus {
    border-color: rgba(143,184,255,0.5);
    box-shadow: 0 0 0 4px rgba(143,184,255,0.12);
  }
  .lab-actions { grid-template-columns: 1fr 1fr; margin-top: 10px; }
  .lab-stepper {
    display: grid;
    gap: 6px;
  }
  .lab-stepper div {
    padding: 9px 10px;
    border-radius: 12px;
    background: rgba(255,255,255,0.04);
    border: 1px solid rgba(255,255,255,0.08);
    display: flex;
    justify-content: space-between;
    gap: 10px;
    align-items: center;
  }
  .lab-stepper span { color: var(--muted); font-size: 12px; }
  .lab-stepper strong { font-size: 13px; }
  .lab-metrics {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
  }
  .lab-metrics-report {
    margin-top: 0;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .lab-metrics-note {
    grid-column: 1 / -1;
    color: var(--muted);
    font-size: 12px;
    margin-top: -2px;
  }
  .lab-formula-note {
    color: var(--muted);
    font-size: 12px;
    margin-top: 4px;
  }
  .lab-metrics div,
  .report-result-editable {
    padding: 9px 10px;
    border-radius: 12px;
    background: rgba(255,255,255,0.05);
    border: 1px solid rgba(255,255,255,0.08);
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .report-result-editable { padding: 10px; }
  .report-result-editable input {
    width: 100%;
    border: 0;
    background: transparent;
    color: #fff;
    font-size: 15px;
    outline: none;
    padding: 0;
  }
  .lab-metrics span { color: var(--muted); font-size: 12px; }
  .lab-metrics strong { font-size: 15px; }
  .lab-hint { margin-top: 10px; color: var(--muted); font-size: 12px; line-height: 1.5; }
  .stats-grid div {
    padding: 12px; border-radius: 18px; background: linear-gradient(180deg, rgba(255,255,255,0.08), rgba(255,255,255,0.045)); border: 1px solid rgba(255,255,255,0.1);
    display: flex; flex-direction: column; gap: 5px;
    box-shadow: inset 0 1px 0 rgba(255,255,255,0.06);
  }
  .stats-grid-compact div { padding: 11px; }
  .stats-grid span { color: var(--muted); font-size: 12px; }
  .stats-grid strong { font-size: 18px; }
  .ai-help {
    color: var(--muted);
    font-size: 12px;
    line-height: 1.55;
    margin-bottom: 10px;
  }
  .ai-status {
    color: var(--accent-2);
  }
  .ai-help-inline { margin-top: -2px; }
  .ai-config-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
    margin-bottom: 10px;
  }
  .ai-config-static {
    padding: 10px 12px;
    border-radius: 12px;
    border: 1px solid rgba(255,255,255,0.14);
    background: rgba(255,255,255,0.06);
    display: grid;
    gap: 4px;
  }
  .ai-config-static span {
    color: var(--muted);
    font-size: 12px;
  }
  .ai-config-static strong {
    color: var(--text);
    font-weight: 650;
    font-size: 14px;
  }
  .ai-env-note {
    grid-column: 1 / -1;
    margin-top: 2px;
  }
  .ai-chat {
    display: grid;
    gap: 8px;
    max-height: 220px;
    overflow: auto;
    padding-right: 4px;
    margin-bottom: 10px;
  }
  .ai-message {
    padding: 10px 12px;
    border-radius: 16px;
    line-height: 1.5;
    font-size: 12px;
    border: 1px solid rgba(255,255,255,0.08);
    background: rgba(255,255,255,0.05);
  }
  .ai-message.user {
    background: rgba(154,191,255,0.12);
    margin-left: 18px;
  }
  .ai-message.assistant {
    background: rgba(132,240,221,0.1);
    margin-right: 18px;
  }
  .ai-message strong {
    display: block;
    margin-bottom: 4px;
    color: #fff;
    font-size: 12px;
  }
  .ai-quick-actions {
    display: grid;
    gap: 8px;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    margin-bottom: 10px;
  }
  .ai-input-row {
    display: grid;
    gap: 8px;
  }
  .ai-input-actions {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 8px;
  }
  .ai-input-row textarea {
    width: 100%;
    resize: vertical;
    min-height: 84px;
    border-radius: 14px;
    border: 1px solid rgba(255,255,255,0.14);
    background: rgba(255,255,255,0.06);
    color: var(--text);
    padding: 10px 12px;
    outline: none;
    font: inherit;
  }
  .ai-input-row textarea:focus {
    border-color: rgba(143,184,255,0.5);
    box-shadow: 0 0 0 4px rgba(143,184,255,0.12);
  }
  .record-actions { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; margin-bottom: 8px; }
  .record-actions button { min-height: 44px; }
  .stopwatch-card {
    padding: 12px;
    border-radius: 18px;
    background: rgba(255,255,255,0.06);
    border: 1px solid rgba(255,255,255,0.08);
    margin-bottom: 8px;
  }
  .stopwatch-head {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    align-items: baseline;
    color: var(--muted);
    margin-bottom: 10px;
  }
  .stopwatch-head strong { color: rgba(245,248,255,0.95); font-size: 12px; }
  .stopwatch-time {
    font-size: 34px;
    font-weight: 700;
    letter-spacing: -0.03em;
    margin-bottom: 10px;
  }
  .stopwatch-meta {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
    margin-bottom: 12px;
  }
  .stopwatch-meta div {
    padding: 10px 12px;
    border-radius: 14px;
    background: rgba(255,255,255,0.05);
    border: 1px solid rgba(255,255,255,0.08);
    display: grid;
    gap: 4px;
  }
  .stopwatch-meta span { color: var(--muted); font-size: 12px; }
  .stopwatch-meta strong { font-size: 16px; }
  .stopwatch-actions { margin-bottom: 0; }
  .record-list {
    max-height: 170px;
    overflow: auto;
    display: grid;
    gap: 8px;
    padding-right: 4px;
  }
  .record-item {
    padding: 10px 12px;
    border-radius: 14px;
    background: rgba(255,255,255,0.05);
    border: 1px solid rgba(255,255,255,0.08);
    color: rgba(245,248,255,0.92);
    font-size: 12px;
    line-height: 1.45;
  }
  .record-item strong { display: block; font-size: 13px; margin-bottom: 4px; }
  .mini-tabs {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;
    margin: 10px 0 8px;
    padding: 6px;
    border-radius: 999px;
    background: rgba(255,255,255,0.04);
    border: 1px solid rgba(255,255,255,0.06);
  }
  .mini-tab {
    padding: 10px 8px;
    border-radius: 999px;
    font-size: 12px;
    opacity: 0.82;
    background: transparent;
    border-color: transparent;
    box-shadow: none;
  }
  .mini-tab.active {
    background: linear-gradient(180deg, rgba(143,184,255,0.22), rgba(132,240,221,0.12));
    opacity: 1;
    box-shadow: inset 0 1px 0 rgba(255,255,255,0.18);
  }
  .mini-tab:focus-visible,
  button:focus-visible {
    outline: 2px solid var(--accent-2);
    outline-offset: 2px;
  }
  .analysis-panel {
    display: none;
  }
  .analysis-panel.active {
    display: block;
  }
  .chart-card canvas {
    width: 100%; display: block; border-radius: 18px;
    background: linear-gradient(180deg, rgba(255,255,255,0.045), rgba(255,255,255,0.02));
    transition: transform 180ms ease, filter 180ms ease;
  }
  .chart-card.compact-card canvas { max-height: 168px; }
  .chart-card:hover canvas {
    transform: scale(1.01);
    filter: brightness(1.04);
  }
  .analysis-panel[hidden] { display: none !important; }
  .scene-panel {
    display: flex;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
    position: sticky;
    top: 14px;
    align-self: start;
    width: auto;
    height: calc(100dvh - 28px);
    overflow: hidden;
    padding: 14px;
  }
  .scene-panel > .scene-frame {
    min-height: 0;
    flex: 1;
  }
  .scene-header {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    align-items: center;
    margin-bottom: 8px;
    padding-bottom: 8px;
    border-bottom: 1px solid rgba(255,255,255,0.08);
  }
  .scene-header-right {
    display: grid;
    justify-items: end;
    gap: 8px;
  }
  .mode-badge,
  .scene-mode-overlay {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    border-radius: 999px;
    border: 1px solid color-mix(in srgb, var(--mode-color, #9abfff) 60%, rgba(255,255,255,0.18));
    background: linear-gradient(180deg, color-mix(in srgb, var(--mode-color, #9abfff) 24%, rgba(255,255,255,0.08)), rgba(255,255,255,0.05));
    color: #fff;
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.02em;
    box-shadow: 0 0 0 1px rgba(255,255,255,0.06), 0 10px 24px color-mix(in srgb, var(--mode-glow, #9abfff) 18%, transparent);
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
  }
  .scene-mode-overlay {
    position: absolute;
    left: 18px;
    top: 16px;
    z-index: 3;
    pointer-events: none;
  }
  .scene-header p { color: var(--muted); margin: 4px 0 0; }
  .scene-debug {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 8px;
    margin-bottom: 12px;
    padding: 10px 12px;
    border-radius: 18px;
    min-height: 0;
    background: rgba(255,255,255,0.05);
    border: 1px solid rgba(255,255,255,0.08);
  }
  .scene-debug div {
    display: grid;
    gap: 4px;
    min-width: 0;
  }
  .scene-debug span { color: var(--muted); font-size: 11px; letter-spacing: 0.06em; text-transform: uppercase; }
  .scene-debug strong {
    font-size: 12px;
    font-variant-numeric: tabular-nums;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .legend { display: flex; gap: 14px; color: var(--muted); font-size: 12px; flex-wrap: wrap; }
  .legend span { display: inline-flex; align-items: center; gap: 8px; }
  .dot { width: 10px; height: 10px; border-radius: 999px; display: inline-block; box-shadow: 0 0 12px currentColor; }
  .dot-a { background: var(--accent-2); color: var(--accent-2); }
  .dot-b { background: var(--accent-3); color: var(--accent-3); }
  .scene-frame {
    position: relative;
    flex: 1;
    min-height: 0;
    height: 100%;
    padding: 12px;
    border-radius: 20px;
    overflow: hidden;
    transform: translateZ(0);
    background: linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0.02));
    box-shadow:
      0 24px 64px rgba(0, 0, 0, 0.32),
      inset 0 1px 0 rgba(255,255,255,0.08),
      inset 0 -1px 0 rgba(255,255,255,0.03);
    transition: transform 180ms ease, box-shadow 180ms ease, filter 180ms ease;
  }
  .scene-frame:hover {
    transform: translateY(-1px);
    box-shadow:
      0 28px 64px rgba(0, 0, 0, 0.34),
      0 10px 20px rgba(0, 0, 0, 0.12),
      inset 0 1px 0 rgba(255,255,255,0.16),
      inset 0 -1px 0 rgba(255,255,255,0.04);
    filter: brightness(1.01);
  }
  .scene-frame:hover::after {
    opacity: 1;
    transform: translateY(-1px);
  }
  .scene-frame-highlight {
    position: absolute;
    inset: 5px 8px auto 8px;
    height: 48px;
    border-radius: 999px;
    background: linear-gradient(180deg, rgba(255,255,255,0.52), rgba(255,255,255,0.18), transparent);
    opacity: calc(0.26 + var(--pulse) * 0.18);
    filter: blur(4px);
    pointer-events: none;
    z-index: 2;
    animation: shimmer 7s linear infinite, breathe 9s ease-in-out infinite;
  }
  .scene-frame::before {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: inherit;
    border: 1px solid rgba(255,255,255,0.12);
    box-shadow:
      inset 0 1px 0 rgba(255,255,255,0.1),
      inset 0 -1px 0 rgba(255,255,255,0.04);
    pointer-events: none;
    z-index: 2;
  }
  .scene-frame::after {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: inherit;
    background:
      radial-gradient(circle at var(--scene-mx, 50%) var(--scene-my, 20%), rgba(255,255,255,0.22), transparent 20%),
      radial-gradient(circle at calc(var(--scene-mx, 50%) + 8%) calc(var(--scene-my, 20%) + 8%), rgba(143,184,255,0.14), transparent 18%),
      linear-gradient(145deg, rgba(255,255,255,0.3), transparent 18%, transparent 72%, rgba(255,255,255,0.18)),
      linear-gradient(180deg, rgba(255,255,255,0.12), transparent 22%, transparent 84%, rgba(0,0,0,0.2));
    pointer-events: none;
    mix-blend-mode: screen;
    z-index: 2;
    transition: opacity 180ms ease, transform 260ms ease;
  }
  .scene-frame::selection { background: transparent; }
  .report-overlay {
    position: fixed;
    inset: 0;
    display: none;
    z-index: 50;
  }
  .report-overlay.is-open { display: block; }
  .report-overlay-backdrop {
    position: absolute;
    inset: 0;
    background: rgba(3, 7, 15, 0.72);
    backdrop-filter: blur(6px);
  }
  .report-overlay-panel {
    position: absolute;
    inset: 18px;
    width: min(980px, calc(100vw - 36px));
    height: calc(100vh - 36px);
    display: flex;
    flex-direction: column;
    gap: 10px;
    border-radius: 22px;
    overflow: hidden;
    padding: 12px;
    background: rgba(8, 12, 22, 0.92);
    margin: 0 auto;
    left: 0;
    right: 0;
    transform: none;
  }
  .report-overlay-header {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    align-items: center;
  }
  .report-overlay-header h2 {
    margin: 0;
    font-size: 18px;
  }
  .report-overlay-header p {
    margin: 4px 0 0;
    color: var(--muted);
    font-size: 12px;
  }
  .report-overlay-actions {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }
  #reportOverlayFrame {
    width: 100%;
    flex: 1;
    min-height: 0;
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 16px;
    background: #fff;
    overflow: auto;
  }
  #reportOverlayFrame:focus { outline: none; }
  .report-overlay-panel.is-printing .report-overlay-header,
  .report-overlay-panel.is-printing .report-overlay-actions {
    display: none;
  }
  .report-overlay-panel.is-printing {
    inset: 0;
    width: 100%;
    max-width: none;
    height: 100%;
    border-radius: 0;
    padding: 0;
    background: #fff;
    transform: none;
    left: 0;
    right: 0;
    margin: 0;
  }
  .report-overlay-panel.is-printing #reportOverlayFrame {
    border: 0;
    border-radius: 0;
  }
  @media print {
    .report-overlay { background: transparent !important; }
    .report-overlay-backdrop { display: none !important; }
    .report-overlay-panel { inset: 0 !important; width: 100% !important; height: 100% !important; background: #fff !important; box-shadow: none !important; border-radius: 0 !important; padding: 0 !important; left: 0 !important; right: 0 !important; transform: none !important; }
    .report-overlay-header, .report-overlay-actions { display: none !important; }
    #reportOverlayFrame { border: 0 !important; border-radius: 0 !important; }
    body.printing .report-overlay-backdrop,
    body.printing .report-overlay-header,
    body.printing .report-overlay-actions { display: none !important; }
    body.printing .report-overlay-panel { inset: 0 !important; width: 100% !important; height: 100% !important; border-radius: 0 !important; background: #fff !important; padding: 0 !important; box-shadow: none !important; left: 0 !important; right: 0 !important; transform: none !important; }
    body.printing #reportOverlayFrame { border: 0 !important; border-radius: 0 !important; }
  }
  .site-footer {
    margin-top: 0;
    padding: 6px 0 0;
    color: rgba(226, 235, 255, 0.64);
    font-size: 11px;
  }
  .footer-inner {
    width: 100%;
    display: flex;
    justify-content: center;
  }
  .footer-content {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: center;
    gap: 6px 8px;
    text-align: center;
    line-height: 1.45;
  }
  .footer-link {
    color: inherit;
    text-decoration: none;
    transition: color 160ms ease, opacity 160ms ease;
  }
  .footer-link:hover {
    color: #ffffff;
  }
  .divider {
    opacity: 0.32;
    margin: 0 1px;
  }
  .footer-content p {
    margin: 0;
  }
  @keyframes breathe {
    0%, 100% { transform: translateY(0) scale(1); }
    50% { transform: translateY(-1px) scale(1.01); }
  }
  @keyframes floatGlow {
    0%, 100% { filter: brightness(1); }
    50% { filter: brightness(1.035); }
  }
  @keyframes shimmer {
    0% { transform: translateX(-2%); }
    50% { transform: translateX(2%); }
    100% { transform: translateX(-2%); }
  }
  #sceneCanvas {
    position: relative;
    z-index: 1;
    width: 100%;
    height: 100%;
    display: block;
    border-radius: 22px;
    background:
      radial-gradient(circle at center, rgba(255,255,255,0.1), rgba(255,255,255,0.02) 34%, rgba(5,8,16,0.98) 100%),
      linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.01));
    box-shadow:
      inset 0 0 0 1px rgba(255,255,255,0.08),
      inset 0 10px 24px rgba(255,255,255,0.03);
    transition: transform 200ms ease, filter 200ms ease;
    min-height: 0;
    touch-action: none;
  }
  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after {
      animation-duration: 0.01ms !important;
      animation-iteration-count: 1 !important;
      scroll-behavior: auto !important;
      transition-duration: 0.01ms !important;
    }
  }
  @media (max-width: 1320px) {
    .workspace { grid-template-columns: minmax(290px, 340px) minmax(0, 1fr); gap: 10px; }
    .stats-grid-compact { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .report-intro { grid-template-columns: 1fr; }
  }
  @media (max-width: 1200px) {
    body, html, #app { overflow: auto; }
    .shell { overflow: visible; height: auto; min-height: 100dvh; width: min(100%, 1180px); }
    .workspace { grid-template-columns: 1fr; overflow: visible; }
    .control-panel {
      order: 2;
      overflow-y: auto;
      overflow-x: hidden;
      max-height: none;
      height: auto;
      padding-right: 6px;
      width: 100%;
    }
    .control-panel.is-collapsed { width: 76px; }
    .stats-grid-compact { grid-template-columns: repeat(3, minmax(0, 1fr)); }
    .report-intro { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .scene-panel { min-height: 0; position: sticky; top: 10px; width: 100%; height: 40vh; padding: 10px; }
  }
  @media (max-width: 1080px) {
    .control-panel { width: 100%; }
    .control-panel.is-collapsed { width: 76px; }
    .workspace.is-panel-collapsed { grid-template-columns: 76px minmax(0, 1fr); }
    .panel-toggle { min-width: 60px; }
    .panel-toggle-label { display: none; }
    .scene-panel { width: calc(100vw - 24px); }
  }
  @media (max-width: 860px) {
    .stats-grid-compact { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .lab-grid-compact { grid-template-columns: 1fr; }
    .lab-actions { grid-template-columns: 1fr; }
    .record-actions { grid-template-columns: 1fr; }
  }
  @media (max-width: 700px) {
    .shell { padding: 8px; gap: 8px; }
    .topbar { padding: 12px; }
    .workspace { gap: 8px; }
    .card { padding: 12px; }
    .record-actions { grid-template-columns: 1fr; }
    .lab-result { grid-template-columns: 1fr; }
    .scene-debug { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .topbar { align-items: flex-start; flex-direction: column; }
    .glass-badge { width: 100%; text-align: center; }
    .scene-panel { position: relative; top: auto; height: min(58vh, 460px); }
    .ai-quick-actions { grid-template-columns: 1fr; }
    .ai-input-actions { grid-template-columns: 1fr; }
    button { min-height: 44px; }
  }
  @media (max-width: 430px) {
    .stats-grid-compact { grid-template-columns: 1fr 1fr; }
    .mini-tabs { gap: 4px; padding: 4px; }
    .mini-tab { font-size: 11px; padding: 9px 4px; }
    .scene-header-right, .legend { display: none; }
  }
`;
document.head.appendChild(style);

const yearEl = document.getElementById('year');
if (yearEl) yearEl.textContent = String(new Date().getFullYear());

const lengthInput = mustGetElement<HTMLInputElement>('#length');
const lengthNumberInput = mustGetElement<HTMLInputElement>('#lengthNumber');
const gravityInput = mustGetElement<HTMLInputElement>('#gravity');
const gravityNumberInput = mustGetElement<HTMLInputElement>('#gravityNumber');
const dampingInput = mustGetElement<HTMLInputElement>('#damping');
const dampingNumberInput = mustGetElement<HTMLInputElement>('#dampingNumber');
const theta0Input = mustGetElement<HTMLInputElement>('#theta0');
const theta0NumberInput = mustGetElement<HTMLInputElement>('#theta0Number');
const toggleBtn = mustGetElement<HTMLButtonElement>('#toggleBtn');
const resetBtn = mustGetElement<HTMLButtonElement>('#resetBtn');
const sceneCanvas = mustGetElement<HTMLCanvasElement>('#sceneCanvas');
const phaseCanvas = mustGetElement<HTMLCanvasElement>('#phaseCanvas');
const energyCanvas = mustGetElement<HTMLCanvasElement>('#energyCanvas');
const sceneDebugCanvas = mustGetElement<HTMLSpanElement>('#sceneDebugCanvas');
const sceneDebugParent = mustGetElement<HTMLSpanElement>('#sceneDebugParent');
const sceneDebugRenderer = mustGetElement<HTMLSpanElement>('#sceneDebugRenderer');
const sceneDebugCamera = mustGetElement<HTMLSpanElement>('#sceneDebugCamera');
const aiStatusReadout = mustGetElement<HTMLSpanElement>('#aiStatusReadout');
const aiChat = mustGetElement<HTMLDivElement>('#aiChat');
const aiInput = mustGetElement<HTMLTextAreaElement>('#aiInput');
const aiSendBtn = mustGetElement<HTMLButtonElement>('#aiSendBtn');
const aiStopBtn = mustGetElement<HTMLButtonElement>('#aiStopBtn');
const recordBtn = mustGetElement<HTMLButtonElement>('#recordBtn');
const clearRecordBtn = mustGetElement<HTMLButtonElement>('#clearRecordBtn');
const exportCsvBtn = mustGetElement<HTMLButtonElement>('#exportCsvBtn');
const studentNameInput = mustGetElement<HTMLInputElement>('#studentName');
const studentIdInput = mustGetElement<HTMLInputElement>('#studentId');
const classNameInput = mustGetElement<HTMLInputElement>('#className');
const reportDateInput = mustGetElement<HTMLInputElement>('#reportDate');
const groupMembersInput = mustGetElement<HTMLInputElement>('#groupMembers');
const ballDiameterInput = mustGetElement<HTMLInputElement>('#ballDiameter');
const stringLengthInput = mustGetElement<HTMLInputElement>('#stringLength');
const cycleCountInput = mustGetElement<HTMLInputElement>('#cycleCount');
const totalTimeInput = mustGetElement<HTMLInputElement>('#totalTimeInput');
const periodInput = mustGetElement<HTMLSpanElement>('#periodInput');
const calculateGBtn = mustGetElement<HTMLButtonElement>('#calculateGBtn');
const useStopwatchBtn = mustGetElement<HTMLButtonElement>('#useStopwatchBtn');
const stopwatchBtn = mustGetElement<HTMLButtonElement>('#stopwatchBtn');
const stopwatchResetBtn = mustGetElement<HTMLButtonElement>('#stopwatchResetBtn');
const stopwatchTimeReadout = mustGetElement<HTMLDivElement>('#stopwatchTime');
const labToggleBtn = mustGetElement<HTMLButtonElement>('#labToggleBtn');
const labBody = mustGetElement<HTMLDivElement>('#labBody');
const panelToggleBtn = mustGetElement<HTMLButtonElement>('#panelToggleBtn');
const panelScrollTip = mustGetElement<HTMLDivElement>('#panelScrollTip');
const leftPanel = mustGetElement<HTMLElement>('.control-panel');
const workspace = mustGetElement<HTMLElement>('.workspace');
leftPanel.addEventListener('wheel', (event) => {
  const maxScrollTop = leftPanel.scrollHeight - leftPanel.clientHeight;
  if (maxScrollTop <= 0) return;
  event.preventDefault();
  leftPanel.scrollTop = Math.min(maxScrollTop, Math.max(0, leftPanel.scrollTop + event.deltaY));
}, { passive: false });
leftPanel.addEventListener('scroll', () => {
  const scrolled = leftPanel.scrollTop > 12;
  leftPanel.classList.toggle('is-scrolled', scrolled);
  panelScrollTip.classList.toggle('is-hidden', scrolled);
});
const stopwatchStateReadout = mustGetElement<HTMLSpanElement>('#stopwatchState');
const swingCountReadout = mustGetElement<HTMLSpanElement>('#swingCountReadout');
const recordCountReadout = mustGetElement<HTMLSpanElement>('#recordCountReadout');
const recordList = mustGetElement<HTMLDivElement>('#recordList');
const analysisTabs = mustGetElement<HTMLDivElement>('#analysisTabs');
const analysisPanels = Array.from(document.querySelectorAll<HTMLElement>('.analysis-panel'));
let activeAnalysisPanel: 'record' | 'energy' | 'phase' = 'record';
const modeGrid = mustGetElement<HTMLDivElement>('#modeGrid');
const modeCards = Array.from(document.querySelectorAll<HTMLButtonElement>('.mode-card'));
const energyToggle = mustGetElement<HTMLInputElement>('#energyToggle');
const phaseToggle = mustGetElement<HTMLInputElement>('#phaseToggle');
const phaseThetaRangeInput = mustGetElement<HTMLInputElement>('#phaseThetaRange');
const phaseThetaRangeNumberInput = mustGetElement<HTMLInputElement>('#phaseThetaRangeNumberInput');
const phaseOmegaRangeInput = mustGetElement<HTMLInputElement>('#phaseOmegaRange');
const phaseOmegaRangeNumberInput = mustGetElement<HTMLInputElement>('#phaseOmegaRangeNumberInput');
const sceneToggle = mustGetElement<HTMLInputElement>('#sceneToggle');
phaseThetaRangeInput.addEventListener('input', () => {
  phaseThetaRange = Number(phaseThetaRangeInput.value);
  phaseThetaRangeNumberInput.value = phaseThetaRange.toFixed(1);
  drawPhaseChart();
});
phaseThetaRangeNumberInput.addEventListener('input', () => {
  phaseThetaRange = Number(phaseThetaRangeNumberInput.value);
  phaseThetaRangeInput.value = phaseThetaRange.toFixed(1);
  drawPhaseChart();
});
phaseOmegaRangeInput.addEventListener('input', () => {
  phaseOmegaRange = Number(phaseOmegaRangeInput.value);
  phaseOmegaRangeNumberInput.value = phaseOmegaRange.toFixed(1);
  drawPhaseChart();
});
phaseOmegaRangeNumberInput.addEventListener('input', () => {
  phaseOmegaRange = Number(phaseOmegaRangeNumberInput.value);
  phaseOmegaRangeInput.value = phaseOmegaRange.toFixed(1);
  drawPhaseChart();
});
const energyToggleLabel = mustGetElement<HTMLSpanElement>('#energyToggleLabel');
const phaseToggleLabel = mustGetElement<HTMLSpanElement>('#phaseToggleLabel');
const sceneToggleLabel = mustGetElement<HTMLSpanElement>('#sceneToggleLabel');
const valueLabels = {
  length: mustGetElement<HTMLSpanElement>('#lengthValue'),
  gravity: mustGetElement<HTMLSpanElement>('#gravityValue'),
  damping: mustGetElement<HTMLSpanElement>('#dampingValue'),
  theta0: mustGetElement<HTMLSpanElement>('#theta0Value'),
  theta: mustGetElement<HTMLSpanElement>('#thetaReadout'),
  omega: mustGetElement<HTMLSpanElement>('#omegaReadout'),
  ek: mustGetElement<HTMLSpanElement>('#ekReadout'),
  ep: mustGetElement<HTMLSpanElement>('#epReadout'),
  e: mustGetElement<HTMLSpanElement>('#eReadout'),
  energyDrift: mustGetElement<HTMLSpanElement>('#energyDriftReadout'),
};
const pendulumLengthReadout = mustGetElement<HTMLInputElement>('#pendulumLengthReadout');
const periodInputReadout = mustGetElement<HTMLSpanElement>('#periodInput');
const gravityResultReadout = mustGetElement<HTMLSpanElement>('#gravityResultReadout');
const gErrorReadout = mustGetElement<HTMLSpanElement>('#gErrorReadout');
const exportPdfBtn = mustGetElement<HTMLButtonElement>('#exportPdfBtn');

const params: PendulumParams = { length: 1.5, gravity: 9.8, damping: 0.06, mass: 1, theta0: 5 * Math.PI / 180, driveAmplitude: 0.8, driveFrequency: 1.6, mode: 'large' };
const engine = new PendulumEngine(params.theta0, 0);
let running = true;
let last = performance.now();
let simTime = 0;
const stateTrail: Array<{ x: number; y: number }> = [];
const phaseTrail: Array<{ theta: number; omega: number }> = [];
const energySamples: SamplePoint[] = [];
const experimentRecords: Array<{ t: number; theta: number; omega: number; energy: number; id: number; cycle: number }> = [];
type ConversationRole = 'user' | 'assistant';
type ConversationMessage = { role: ConversationRole; content: string };
const aiMessages: Array<{ role: 'user' | 'assistant'; title: string; content: string }> = [];
const conversationHistory: ConversationMessage[] = [];
let recording = false;
let recordId = 1;
let recordCycle = 0;
let lastPointerX = window.innerWidth * 0.5;
let lastPointerY = window.innerHeight * 0.2;
let stopwatchRunning = false;
let stopwatchStart = 0;
let stopwatchElapsed = 0;
let swingCount = 0;
let lastTheta = engine.getState().theta;
let lastOmega = engine.getState().omega;
let stopwatchFinished = false;
let measuredGravity = 0;
let energyVisualEnabled = true;
let phaseVisualEnabled = true;
let phaseThetaRange = 3.2;
let phaseOmegaRange = 6.5;
let sceneVisualEnabled = true;
let paramsDirty = true;
let renderedRecordCount = -1;
let rendererWidth = 0;
let rendererHeight = 0;
const FIXED_STEP = 0.00001;
const MAX_SUBSTEPS_PER_FRAME = 5000;
const DISPLAY_STEP = 1 / 60;
const IDLE_RENDER_STEP = 1 / 30;
let simulationAccumulator = 0;
let displayAccumulator = 0;
let referenceEnergy = 0;
let maxEnergyDrift = 0;
let sceneNeedsRender = true;
let pendingPointerEvent: PointerEvent | null = null;
let pointerFrameRequested = false;
let aiRenderFrameRequested = false;

const renderer = new THREE.WebGLRenderer({ canvas: sceneCanvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setClearColor(0x000000, 0);
const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x07101f, 9, 24);
const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
camera.position.set(0, 2.7, 7.6);
camera.lookAt(0, -0.6, 0);
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let isDraggingBob = false;
const lights = [
  new THREE.HemisphereLight(0xaecaff, 0x14203d, 1.8),
  new THREE.DirectionalLight(0xffffff, 2.6),
  new THREE.PointLight(0x8bb6ff, 1.8, 26),
  new THREE.SpotLight(0xffffff, 2.2, 30, Math.PI / 6, 0.45, 1),
  new THREE.AmbientLight(0xb9c8ff, 0.28),
];
const spotLight = lights[3] as THREE.SpotLight;
lights[1].position.set(5, 8, 6);
lights[2].position.set(-4, 3, 4);
spotLight.position.set(0, 7, 6);
spotLight.target.position.set(0, 0, 0);
lights.forEach((light) => scene.add(light));
scene.add(spotLight.target);
const pivot = new THREE.Group();
scene.add(pivot);
const support = new THREE.Mesh(
  new THREE.CylinderGeometry(0.055, 0.055, 4.8, 20),
  new THREE.MeshPhysicalMaterial({ color: 0xdbe7ff, metalness: 0.7, roughness: 0.18, clearcoat: 0.6, clearcoatRoughness: 0.08 }),
);
support.position.set(0, 1.55, 0);
scene.add(support);
const supportCap = new THREE.Mesh(
  new THREE.SphereGeometry(0.08, 24, 24),
  new THREE.MeshPhysicalMaterial({ color: 0xffffff, metalness: 0.85, roughness: 0.05, clearcoat: 1 }),
);
supportCap.position.set(0, 3.95, 0);
scene.add(supportCap);
const rodGeom = new THREE.CylinderGeometry(0.022, 0.03, 1, 24);
const rodMat = new THREE.MeshPhysicalMaterial({ color: 0xf7fbff, metalness: 0.72, roughness: 0.14, clearcoat: 0.8, clearcoatRoughness: 0.05 });
const rod = new THREE.Mesh(rodGeom, rodMat);
rod.position.y = -0.5;
pivot.add(rod);
const bob = new THREE.Mesh(
  new THREE.SphereGeometry(0.17, 96, 96),
  new THREE.MeshPhysicalMaterial({
    color: 0xaeb8c8,
    metalness: 1,
    roughness: 0.16,
    clearcoat: 0.2,
    clearcoatRoughness: 0.08,
    reflectivity: 1,
    sheen: 0,
  }),
);
bob.position.y = -1;
pivot.add(bob);
const bobHighlight = new THREE.Mesh(
  new THREE.SphereGeometry(0.175, 96, 96),
  new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.24 }),
);
bobHighlight.position.y = -1;
pivot.add(bobHighlight);
const bobGlow = new THREE.Mesh(
  new THREE.SphereGeometry(0.28, 48, 48),
  new THREE.MeshBasicMaterial({ color: 0x7fdcff, transparent: true, opacity: 0.18 }),
);
bobGlow.position.y = -1;
pivot.add(bobGlow);
const base = new THREE.Mesh(
  new THREE.CircleGeometry(4.6, 64),
  new THREE.MeshPhysicalMaterial({ color: 0x0f1730, roughness: 0.95, metalness: 0.05, clearcoat: 0.12 }),
);
base.rotation.x = -Math.PI / 2;
base.position.y = -2.6;
scene.add(base);
const trailPositions = new Float32Array(240 * 3);
const trailGeometry = new THREE.BufferGeometry();
const trailPositionAttribute = new THREE.BufferAttribute(trailPositions, 3);
trailPositionAttribute.setUsage(THREE.DynamicDrawUsage);
trailGeometry.setAttribute('position', trailPositionAttribute);
trailGeometry.setDrawRange(0, 0);
const trailLine = new THREE.Line(trailGeometry, new THREE.LineBasicMaterial({ color: 0x6fffe9, transparent: true, opacity: 0.9 }));
scene.add(trailLine);
const grid = new THREE.GridHelper(6, 12, 0x4066c4, 0x1a2854);
grid.position.y = -1.69;
scene.add(grid);
scene.environment = null;
scene.background = new THREE.Color(0x08101d);
let focusLift = 0;
let visualLength = params.length;
let visualTheta = engine.getState().theta;
function easeFocusLift(lengthValue: number) {
  const t = Math.min(Math.max((lengthValue - 0.9) / 1.8, 0), 1);
  const eased = t * t * (3 - 2 * t);
  return 0.02 + eased * 1.02;
}

const scenePointer = new THREE.Vector2();
function updateScenePointer(event: PointerEvent) {
  const rect = sceneCanvas.getBoundingClientRect();
  scenePointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  scenePointer.y = -(((event.clientY - rect.top) / rect.height) * 2 - 1);
}

function getBobWorldPosition() {
  const pos = new THREE.Vector3();
  bob.getWorldPosition(pos);
  return pos;
}

function setPendulumFromPointer(event: PointerEvent) {
  const rect = sceneCanvas.getBoundingClientRect();
  const nx = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  const ny = -(((event.clientY - rect.top) / rect.height) * 2 - 1);
  const lengthMeters = params.length / 100;
  const worldX = nx * lengthMeters * 1.2;
  const worldY = -Math.sqrt(Math.max(lengthMeters ** 2 - worldX ** 2, 0));
  const theta = Math.atan2(worldX, -worldY || -0.0001);
  const current = engine.getState();
  engine.reset(theta, current.omega * 0.85);
  simTime = 0;
  resetEnergyTracking();
  if (recording) {
    pushExperimentRecord(theta, current.omega * 0.85);
    renderRecords();
  }
  if (Math.abs(ny) > 2) return;
}

function getModeMeta(mode: PendulumMode) {
  const meta: Record<PendulumMode, { label: string; short: string; color: string; glow: string }> = {
    large: { label: '大角度振动', short: '大角度', color: '#9abfff', glow: '#9abfff' },
    small: { label: '小角度振动', short: '小角度', color: '#8cf1e0', glow: '#8cf1e0' },
    driven: { label: '受迫振动', short: '受迫', color: '#ffcc66', glow: '#ffcc66' },
    damped: { label: '阻尼振动', short: '阻尼', color: '#ff9bec', glow: '#ff9bec' },
    chaotic: { label: '混沌振动', short: '混沌', color: '#ff7ce8', glow: '#ff7ce8' },
    other: { label: '其他类型', short: '其他', color: '#cbd5ff', glow: '#cbd5ff' },
  };
  return meta[mode];
}

function updateModeTags() {
  const meta = getModeMeta(params.mode);
  const modeTagText = `${meta.short} · ${meta.label}`;
  const modeTag = document.querySelectorAll<HTMLElement>('[data-mode-tag]');
  modeTag.forEach((el) => {
    el.textContent = modeTagText;
    el.style.setProperty('--mode-color', meta.color);
    el.style.setProperty('--mode-glow', meta.glow);
  });
}

function updateLabels() {
  valueLabels.length.textContent = `${(params.length * 100).toFixed(2)} cm`;
  valueLabels.gravity.textContent = `${params.gravity.toFixed(1)}${params.gravity === 0 ? '（理想化）' : ''}`;
  valueLabels.damping.textContent = params.damping.toFixed(2);
  valueLabels.theta0.textContent = `${(params.theta0 * 180 / Math.PI).toFixed(0)}°`;
  const pendulumLength = Number(stringLengthInput.value) / 100 + Number(ballDiameterInput.value) / 200;
  pendulumLengthReadout.value = `${(pendulumLength * 100).toFixed(2)} cm`;
  phaseThetaRangeNumberInput.value = phaseThetaRange.toFixed(1);
  phaseOmegaRangeNumberInput.value = phaseOmegaRange.toFixed(1);
  phaseThetaRangeInput.value = phaseThetaRange.toFixed(1);
  phaseOmegaRangeInput.value = phaseOmegaRange.toFixed(1);
  modeCards.forEach((card) => {
    const isActive = card.dataset.mode === params.mode;
    card.classList.toggle('active', isActive);
    card.setAttribute('aria-pressed', String(isActive));
  });
  updateModeTags();
}

function switchAnalysisPanel(panel: 'record' | 'energy' | 'phase') {
  activeAnalysisPanel = panel;
  analysisTabs.querySelectorAll<HTMLButtonElement>('.mini-tab').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.panel === panel);
    btn.setAttribute('aria-selected', String(btn.dataset.panel === panel));
  });
  analysisPanels.forEach((node) => {
    const isActive = node.dataset.panel === panel;
    node.classList.toggle('active', isActive);
    node.hidden = !isActive;
  });
  if (panel === 'energy' && energyVisualEnabled) drawEnergyChart();
  if (panel === 'phase' && phaseVisualEnabled) drawPhaseChart();
}

let labCollapsed = false;
function setLabCollapsed(collapsed: boolean) {
  labCollapsed = collapsed;
  labBody.classList.toggle('is-collapsed', collapsed);
  labToggleBtn.classList.toggle('is-collapsed', collapsed);
  labToggleBtn.setAttribute('aria-expanded', String(!collapsed));
  const label = labToggleBtn.querySelector<HTMLSpanElement>('.lab-toggle-label');
  if (label) label.textContent = collapsed ? '展开' : '收起';
}

let panelCollapsed = false;
function setPanelCollapsed(collapsed: boolean) {
  panelCollapsed = collapsed;
  leftPanel.classList.toggle('is-collapsed', collapsed);
  workspace.classList.toggle('is-panel-collapsed', collapsed);
  panelToggleBtn.classList.toggle('is-collapsed', collapsed);
  panelToggleBtn.setAttribute('aria-expanded', String(!collapsed));
  const label = panelToggleBtn.querySelector<HTMLSpanElement>('.panel-toggle-label');
  if (label) label.textContent = collapsed ? '展开窗格' : '收起窗格';
}

function syncParams() {
  params.length = Number(lengthInput.value);
  params.gravity = Number(gravityInput.value);
  params.damping = Number(dampingInput.value);
  params.theta0 = Number(theta0Input.value);
  lengthNumberInput.value = params.length.toFixed(2);
  gravityNumberInput.value = params.gravity.toFixed(1);
  dampingNumberInput.value = params.damping.toFixed(2);
  theta0NumberInput.value = String(Math.round((params.theta0 * 180) / Math.PI));
  updateLabels();
  resetEnergyTracking();
  paramsDirty = false;
}

function getLabLengthMeters() {
  return Number(stringLengthInput.value) / 100 + Number(ballDiameterInput.value) / 200;
}

function calculateGravityFromInputs(totalTimeSeconds: number) {
  const n = Math.max(1, Number(cycleCountInput.value));
  const T = totalTimeSeconds / n;
  const lCm = getLabLengthMeters();
  const l = lCm / 100;
  const g = (4 * Math.PI * Math.PI * l) / (T * T);
  return { g, l, T, n, lCm };
}

function updateGravityResult(totalTimeSeconds: number) {
  const { g, l, T, n, lCm } = calculateGravityFromInputs(totalTimeSeconds);
  measuredGravity = g;
  gravityResultReadout.textContent = `${g.toFixed(4)} m/s²`;
  gErrorReadout.textContent = params.gravity > 0 ? `${(((g - params.gravity) / params.gravity) * 100).toFixed(2)}%` : '理想化模型';
  pendulumLengthReadout.value = `${lCm.toFixed(2)} cm`;
  totalTimeInput.value = totalTimeSeconds.toFixed(2);
  periodInput.textContent = T.toFixed(4);
  periodInputReadout.textContent = `${T.toFixed(4)} s`;
  cycleCountInput.value = String(n);
  return { g, l, T, n, lCm };
}

function formatSigned(value: number) {
  return `${value >= 0 ? '+' : ''}${value.toFixed(3)}`;
}

function computeEnergy(theta: number, omega: number) {
  const ek = 0.5 * params.mass * (params.length * omega) ** 2;
  const ep = params.mass * params.gravity * params.length * (1 - Math.cos(theta));
  return { ek, ep, total: ek + ep };
}

function resetEnergyTracking() {
  const state = engine.getState();
  referenceEnergy = computeEnergy(state.theta, state.omega).total;
  maxEnergyDrift = 0;
}

function updateEnergyReadout(theta: number, omega: number) {
  const { ek, ep, total } = computeEnergy(theta, omega);
  valueLabels.theta.textContent = formatSigned(theta);
  valueLabels.omega.textContent = formatSigned(omega);
  valueLabels.ek.textContent = ek.toFixed(3);
  valueLabels.ep.textContent = ep.toFixed(3);
  valueLabels.e.textContent = total.toFixed(3);
  const conservative = params.damping === 0 && params.mode !== 'damped' && params.mode !== 'driven' && params.mode !== 'chaotic';
  if (conservative && referenceEnergy > 0) {
    const drift = ((total - referenceEnergy) / referenceEnergy) * 100;
    maxEnergyDrift = Math.max(maxEnergyDrift, Math.abs(drift));
    valueLabels.energyDrift.textContent = `${drift >= 0 ? '+' : ''}${drift.toFixed(2)}%`;
    valueLabels.energyDrift.title = `最大绝对漂移 ${maxEnergyDrift.toFixed(2)}%`;
  } else {
    valueLabels.energyDrift.textContent = '—';
    valueLabels.energyDrift.title = '阻尼或外力模式下，能量变化包含物理耗散或外部做功';
  }
}

function pushEnergySample(theta: number, omega: number) {
  const { ek, ep, total } = computeEnergy(theta, omega);
  const sample = { t: simTime, theta, omega, ek, ep, energy: total };
  energySamples.push(sample);
  if (energySamples.length > 240) energySamples.shift();
}

function pushExperimentRecord(theta: number, omega: number) {
  const { total } = computeEnergy(theta, omega);
  experimentRecords.push({ t: simTime, theta, omega, energy: total, id: recordId++, cycle: recordCycle + 1 });
  if (experimentRecords.length > 120) experimentRecords.shift();
}


function clearCanvas(ctx: CanvasRenderingContext2D) {
  const { width, height } = ctx.canvas;
  ctx.clearRect(0, 0, width, height);
}

function drawChartAxes(ctx: CanvasRenderingContext2D, padding: number, title: string) {
  const { width, height } = ctx.canvas;
  ctx.fillStyle = '#dce7ff';
  ctx.font = '600 12px Inter, system-ui, sans-serif';
  ctx.fillText(title, padding, 18);
  ctx.strokeStyle = 'rgba(165, 184, 241, 0.16)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(padding, height - padding);
  ctx.lineTo(width - padding, height - padding);
  ctx.moveTo(padding, padding);
  ctx.lineTo(padding, height - padding);
  ctx.stroke();
}

function drawArrow(ctx: CanvasRenderingContext2D, fromX: number, fromY: number, toX: number, toY: number, color: string) {
  const angle = Math.atan2(toY - fromY, toX - fromX);
  const headLength = 8;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(fromX, fromY);
  ctx.lineTo(toX, toY);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(toX, toY);
  ctx.lineTo(toX - headLength * Math.cos(angle - Math.PI / 6), toY - headLength * Math.sin(angle - Math.PI / 6));
  ctx.lineTo(toX - headLength * Math.cos(angle + Math.PI / 6), toY - headLength * Math.sin(angle + Math.PI / 6));
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function drawChartTicks(
  ctx: CanvasRenderingContext2D,
  originX: number,
  originY: number,
  width: number,
  height: number,
  xTicks: Array<{ x: number; label: string }>,
  yTicks: Array<{ y: number; label: string }>,
  opts: { fontSize: number; xOffset: number; yOffset: number } = { fontSize: 11, xOffset: 8, yOffset: 24 },
) {
  ctx.save();
  ctx.strokeStyle = 'rgba(165, 184, 241, 0.18)';
  ctx.fillStyle = 'rgba(220, 231, 255, 0.8)';
  ctx.font = `${opts.fontSize}px Inter, system-ui, sans-serif`;
  xTicks.forEach((tick) => {
    const x = originX + tick.x * width;
    ctx.beginPath();
    ctx.moveTo(x, originY - 4);
    ctx.lineTo(x, originY + 4);
    ctx.stroke();
    ctx.fillText(tick.label, x - opts.xOffset, originY + opts.yOffset);
  });
  yTicks.forEach((tick) => {
    const y = originY - tick.y * height;
    ctx.beginPath();
    ctx.moveTo(originX - 4, y);
    ctx.lineTo(originX + 4, y);
    ctx.stroke();
    ctx.fillText(tick.label, originX - opts.yOffset, y + 4);
  });
  ctx.restore();
}

function drawEnergyChart() {
  const ctx = energyCanvas.getContext('2d');
  if (!ctx) return;
  clearCanvas(ctx);
  const padding = Math.max(26, Math.min(42, Math.floor(energyCanvas.width * 0.08)));
  const chartTop = Math.max(52, Math.floor(energyCanvas.height * 0.18));
  const chartBottom = energyCanvas.height - Math.max(34, Math.floor(energyCanvas.height * 0.14));
  const chartHeight = Math.max(1, chartBottom - chartTop);
  const chartWidth = Math.max(1, energyCanvas.width - padding * 2);
  drawChartAxes(ctx, padding, '能量 / 时间');
  if (energySamples.length < 2) return;
  const values = energySamples.flatMap((p) => [p.ek, p.ep, p.energy]);
  const maxEnergy = Math.max(...values, 0.001);
  const minEnergy = Math.min(...values, 0);
  const yFor = (value: number) => chartBottom - ((value - minEnergy) / (maxEnergy - minEnergy || 1)) * chartHeight;
  const xFor = (index: number) => padding + (index / (energySamples.length - 1)) * chartWidth;
  const drawSeries = (series: Array<number>, strokeStyle: string) => {
    ctx.beginPath();
    series.forEach((value, i) => {
      const x = xFor(i);
      const y = yFor(value);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = strokeStyle;
    ctx.lineWidth = 2.4;
    ctx.stroke();
  };

  drawSeries(energySamples.map((p) => p.ek), '#6fffe9');
  drawSeries(energySamples.map((p) => p.ep), '#ff7ce8');
  drawSeries(energySamples.map((p) => p.energy), '#ffcc66');

  const latest = energySamples[energySamples.length - 1];
  const lastX = xFor(energySamples.length - 1);
  const drawPoint = (value: number, color: string) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(lastX, yFor(value), 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.32)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(lastX, yFor(value), 7.5, 0, Math.PI * 2);
    ctx.stroke();
  };
  drawPoint(latest.ek, '#6fffe9');
  drawPoint(latest.ep, '#ff7ce8');
  drawPoint(latest.energy, '#ffcc66');

  drawChartTicks(
    ctx,
    padding,
    chartBottom,
    chartWidth,
    chartHeight,
    [
      { x: 0, label: '0%' },
      { x: 0.25, label: '25%' },
      { x: 0.5, label: '50%' },
      { x: 0.75, label: '75%' },
      { x: 1, label: '100%' },
    ],
    [
      { y: 0, label: `${minEnergy.toFixed(1)}` },
      { y: 0.5, label: `${((minEnergy + maxEnergy) / 2).toFixed(1)}` },
      { y: 1, label: `${maxEnergy.toFixed(1)}` },
    ],
    { fontSize: 11, xOffset: 8, yOffset: 18 },
  );

  const legendY = Math.max(26, Math.min(40, Math.floor(energyCanvas.height * 0.12)));
  const modeLabel = params.mode === 'small'
    ? '模式：小角度近似'
    : params.mode === 'large'
      ? '模式：大角度非线性'
      : params.mode === 'driven'
        ? '模式：受迫振动'
        : params.mode === 'damped'
          ? '模式：阻尼振动'
          : params.mode === 'chaotic'
            ? '模式：混沌振动'
            : '模式：其他';
  ctx.save();
  ctx.font = '700 11px Inter, system-ui, sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.fillText(modeLabel, padding, legendY - 18);
  ctx.restore();
  const legendItems = [
    { label: 'Ek', color: '#6fffe9', value: latest.ek, accent: '动能' },
    { label: 'Ep', color: '#ff7ce8', value: latest.ep, accent: '势能' },
    { label: 'E', color: '#ffcc66', value: latest.energy, accent: '总能量' },
  ];
  const legendCardWidth = 128;
  const legendCardHeight = 38;
  let legendX = padding;
  ctx.font = '600 11px Inter, system-ui, sans-serif';
  legendItems.forEach((item) => {
    ctx.save();
    const gradient = ctx.createLinearGradient(legendX, legendY - 16, legendX + legendCardWidth, legendY + 18);
    gradient.addColorStop(0, 'rgba(255,255,255,0.10)');
    gradient.addColorStop(1, 'rgba(255,255,255,0.05)');
    ctx.fillStyle = gradient;
    ctx.strokeStyle = 'rgba(255,255,255,0.14)';
    ctx.lineWidth = 1;
    roundRect(ctx, legendX, legendY - 12, legendCardWidth, legendCardHeight, 14);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = item.color;
    ctx.shadowColor = item.color;
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.arc(legendX + 18, legendY + 6, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(255,255,255,0.94)';
    ctx.fillText(item.label, legendX + 32, legendY - 2);
    ctx.fillStyle = 'rgba(255,255,255,0.64)';
    ctx.font = '500 10px Inter, system-ui, sans-serif';
    ctx.fillText(item.accent, legendX + 32, legendY + 10);
    ctx.fillStyle = item.color;
    ctx.font = '700 12px Inter, system-ui, sans-serif';
    ctx.fillText(`${item.value.toFixed(2)} J`, legendX + 72, legendY + 3);
    ctx.restore();
    legendX += legendCardWidth + 10;
  });
}


function drawPhaseChart() {
  const ctx = phaseCanvas.getContext('2d');
  if (!ctx) return;
  clearCanvas(ctx);
  const padding = Math.max(34, Math.min(48, Math.floor(phaseCanvas.width * 0.09)));
  const chartTop = Math.max(40, Math.floor(phaseCanvas.height * 0.16));
  const chartBottom = phaseCanvas.height - Math.max(48, Math.floor(phaseCanvas.height * 0.18));
  const chartHeight = Math.max(1, chartBottom - chartTop);
  const chartWidth = Math.max(1, phaseCanvas.width - padding * 2);
  drawChartAxes(ctx, padding, '相图 / θ-ω');
  if (phaseTrail.length < 2) return;
  const thetaRange = Math.max(0.5, phaseThetaRange);
  const omegaRange = Math.max(0.5, phaseOmegaRange);
  const xFor = (theta: number) => padding + ((theta + thetaRange) / (thetaRange * 2)) * chartWidth;
  const yFor = (omega: number) => chartBottom - ((omega + omegaRange) / (omegaRange * 2)) * chartHeight;

  const xZero = xFor(0);
  const yZero = yFor(0);
  ctx.save();
  ctx.strokeStyle = 'rgba(165, 184, 241, 0.22)';
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(xZero, chartTop);
  ctx.lineTo(xZero, chartBottom);
  ctx.moveTo(padding, yZero);
  ctx.lineTo(padding + chartWidth, yZero);
  ctx.stroke();
  ctx.restore();

  const thetaTickCount = 6;
  const omegaTickCount = 6;
  const thetaTicks = Array.from({ length: thetaTickCount * 2 + 1 }, (_, index) => {
    const value = -thetaRange + (index * thetaRange) / thetaTickCount;
    return { x: (value + thetaRange) / (thetaRange * 2), label: value.toFixed(thetaRange < 2 ? 1 : 0) };
  });
  const omegaTicks = Array.from({ length: omegaTickCount * 2 + 1 }, (_, index) => {
    const value = -omegaRange + (index * omegaRange) / omegaTickCount;
    return { y: (value + omegaRange) / (omegaRange * 2), label: value.toFixed(omegaRange < 2 ? 1 : 0) };
  });
  drawChartTicks(ctx, padding, chartBottom, chartWidth, chartHeight, thetaTicks, omegaTicks, { fontSize: 11, xOffset: 8, yOffset: 20 });

  const modeLabel = params.mode === 'small'
    ? '模式：小角度近似'
    : params.mode === 'large'
      ? '模式：大角度非线性'
      : params.mode === 'driven'
        ? '模式：受迫振动'
        : params.mode === 'damped'
          ? '模式：阻尼振动'
          : params.mode === 'chaotic'
            ? '模式：混沌振动'
            : '模式：其他';
  ctx.save();
  ctx.font = '700 11px Inter, system-ui, sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.fillText(modeLabel, padding, chartTop - 10);
  ctx.restore();

  const tailWindow = Math.min(20, phaseTrail.length - 1);
  for (let i = 1; i < phaseTrail.length; i++) {
    const prev = phaseTrail[i - 1];
    const curr = phaseTrail[i];
    const distanceFromLatest = phaseTrail.length - i;
    const fade = Math.max(0.08, 1 - distanceFromLatest / Math.max(1, phaseTrail.length));
    const isTail = distanceFromLatest <= tailWindow;
    ctx.save();
    ctx.globalAlpha = isTail ? 0.06 + fade * 0.94 : 0.22 + fade * 0.58;
    ctx.strokeStyle = isTail ? 'rgba(255, 124, 232, 0.28)' : 'rgba(255, 124, 232, 0.92)';
    ctx.lineWidth = isTail ? 1.3 : 2.6;
    if (isTail) ctx.setLineDash([2, 6]);
    drawArrow(ctx, xFor(prev.theta), yFor(prev.omega), xFor(curr.theta), yFor(curr.omega), ctx.strokeStyle as string);
    ctx.restore();
  }

  ctx.save();
  for (let i = 1; i <= tailWindow; i++) {
    const prev = phaseTrail[phaseTrail.length - i - 1];
    const curr = phaseTrail[phaseTrail.length - i];
    const alpha = (tailWindow - i + 1) / tailWindow;
    ctx.globalAlpha = 0.08 * alpha;
    ctx.strokeStyle = '#ff7ce8';
    ctx.lineWidth = 5 + alpha * 4;
    ctx.beginPath();
    ctx.moveTo(xFor(prev.theta), yFor(prev.omega));
    ctx.lineTo(xFor(curr.theta), yFor(curr.omega));
    ctx.stroke();
  }
  ctx.restore();

  const latest = phaseTrail[phaseTrail.length - 1];
  const x = xFor(latest.theta);
  const y = yFor(latest.omega);
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(x, y, 5.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#ff7ce8';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x, y, 9, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = 'rgba(255,255,255,0.86)';
  ctx.font = '600 11px Inter, system-ui, sans-serif';
  const labelY = Math.min(phaseCanvas.height - 10, chartBottom + 22);
  ctx.fillText(`当前点 θ=${latest.theta.toFixed(2)} rad`, padding, labelY);
  ctx.fillText(`ω=${latest.omega.toFixed(2)} rad/s`, padding + 170, labelY);
  ctx.fillText(`范围 θ±${thetaRange.toFixed(1)} / ω±${omegaRange.toFixed(1)}`, padding + 320, labelY);
}


function updateScene() {
  const { theta, omega } = engine.getState();
  visualLength += (params.length - visualLength) * 0.065;
  visualTheta += (theta - visualTheta) * 0.16;
  const wobble = Math.sin(simTime * 6.5) * Math.min(Math.abs(omega) * 0.03, 0.12);
  pivot.rotation.z = visualTheta + wobble;
  const lenScale = visualLength;
  const rodLift = easeFocusLift(lenScale);
  focusLift += (rodLift - focusLift) * 0.045;
  pivot.position.y = focusLift;
  rod.scale.y = lenScale;
  rod.position.y = -0.5 * lenScale;
  bob.position.y = -lenScale;
  bobHighlight.position.y = -lenScale;
  bobGlow.position.y = -lenScale;

  const sway = Math.min(Math.abs(omega) * 0.06, 0.16);
  const pulse = 1 + Math.min(Math.abs(theta) * 0.015, 0.05);
  bob.scale.setScalar(pulse);
  bobHighlight.scale.setScalar(pulse * 1.01);
  bobGlow.scale.setScalar(1.12 + sway);

  const x = lenScale * Math.sin(visualTheta);
  const y = -lenScale * Math.cos(visualTheta) + focusLift;
  stateTrail.push({ x, y });
  if (stateTrail.length > 240) stateTrail.shift();
  stateTrail.forEach((point, index) => {
    const offset = index * 3;
    trailPositions[offset] = point.x;
    trailPositions[offset + 1] = point.y;
    trailPositions[offset + 2] = 0;
  });
  trailPositionAttribute.needsUpdate = true;
  trailGeometry.setDrawRange(0, stateTrail.length);
  sceneNeedsRender = true;
}

function getSceneSize() {
  const rect = sceneCanvas.parentElement?.getBoundingClientRect() ?? sceneCanvas.getBoundingClientRect();
  const width = Math.max(1, Math.floor(rect.width));
  const height = Math.max(1, Math.floor(rect.height));
  return { width, height, rect };
}

function updateSceneDebug() {
  const canvasRect = sceneCanvas.getBoundingClientRect();
  const parentRect = sceneCanvas.parentElement?.getBoundingClientRect();
  sceneDebugCanvas.textContent = `${sceneCanvas.width}×${sceneCanvas.height} / css ${Math.round(canvasRect.width)}×${Math.round(canvasRect.height)}`;
  sceneDebugParent.textContent = parentRect
    ? `${Math.round(parentRect.width)}×${Math.round(parentRect.height)}`
    : 'n/a';
  sceneDebugRenderer.textContent = renderer.domElement ? 'ready' : 'missing';
  sceneDebugCamera.textContent = `fov ${camera.fov} | asp ${camera.aspect.toFixed(2)} | z ${camera.position.z.toFixed(2)}`;
  updateModeTags();
}

function resizeRendererIfNeeded() {
  const { width, height } = getSceneSize();
  const targetPixelRatio = Math.min(window.devicePixelRatio || 1, window.innerWidth < 900 ? 1.5 : 2);
  const pixelRatioChanged = renderer.getPixelRatio() !== targetPixelRatio;
  const needsResize = rendererWidth !== width || rendererHeight !== height || pixelRatioChanged;
  if (!needsResize) return false;
  if (pixelRatioChanged) renderer.setPixelRatio(targetPixelRatio);
  renderer.setSize(width, height, false);
  rendererWidth = width;
  rendererHeight = height;
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  sceneNeedsRender = true;
  return true;
}

function render() {
  const resized = resizeRendererIfNeeded();
  if (!resized && !sceneNeedsRender) return;
  renderer.render(scene, camera);
  sceneNeedsRender = false;
  if (resized) updateSceneDebug();
}

function updateLightTheme(clientX: number, clientY: number) {
  const root = document.documentElement;
  const x = (clientX / window.innerWidth) * 100;
  const y = (clientY / window.innerHeight) * 100;
  root.style.setProperty('--mx', `${x.toFixed(2)}%`);
  root.style.setProperty('--my', `${y.toFixed(2)}%`);
  const pulse = 0.55 + ((clientX + clientY) / (window.innerWidth + window.innerHeight)) * 0.32;
  root.style.setProperty('--pulse', pulse.toFixed(3));
  root.style.setProperty('--pulse-soft', (pulse * 0.58).toFixed(3));
}

function updateCardGlow(event: PointerEvent) {
  const target = event.target as HTMLElement | null;
  const card = target?.closest?.('.glass') as HTMLElement | null;
  if (!card) return;
  const rect = card.getBoundingClientRect();
  const x = ((event.clientX - rect.left) / rect.width) * 100;
  const y = ((event.clientY - rect.top) / rect.height) * 100;
  card.style.setProperty('--card-x', `${x.toFixed(2)}%`);
  card.style.setProperty('--card-y', `${y.toFixed(2)}%`);
}

function updateSceneGlow(event: PointerEvent) {
  const rect = sceneCanvas.getBoundingClientRect();
  const x = ((event.clientX - rect.left) / rect.width) * 100;
  const y = ((event.clientY - rect.top) / rect.height) * 100;
  sceneCanvas.style.setProperty('--scene-mx', `${x.toFixed(2)}%`);
  sceneCanvas.style.setProperty('--scene-my', `${y.toFixed(2)}%`);
  pointer.set(x / 50 - 1, -(y / 50 - 1));
}

function queuePointerVisualUpdate(event: PointerEvent) {
  lastPointerX = event.clientX;
  lastPointerY = event.clientY;
  pendingPointerEvent = event;
  if (pointerFrameRequested) return;
  pointerFrameRequested = true;
  requestAnimationFrame(() => {
    pointerFrameRequested = false;
    const latestEvent = pendingPointerEvent;
    pendingPointerEvent = null;
    if (!latestEvent) return;
    updateLightTheme(latestEvent.clientX, latestEvent.clientY);
    updateCardGlow(latestEvent);
    if (latestEvent.target === sceneCanvas) updateSceneGlow(latestEvent);
  });
}

function formatStopwatch(ms: number) {
  const total = Math.max(0, ms);
  const minutes = Math.floor(total / 60000);
  const seconds = Math.floor((total % 60000) / 1000);
  const millis = Math.floor(total % 1000);
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(millis).padStart(3, '0')}`;
}

function updateStopwatchDisplay() {
  stopwatchTimeReadout.textContent = formatStopwatch(stopwatchElapsed);
  swingCountReadout.textContent = `${Math.min(swingCount, 10)} / 10`;
  if (stopwatchFinished) {
    stopwatchStateReadout.textContent = '已完成 10 次摆动';
  } else if (stopwatchRunning) {
    stopwatchStateReadout.textContent = '计时中';
  } else if (stopwatchElapsed > 0) {
    stopwatchStateReadout.textContent = '已暂停';
  } else {
    stopwatchStateReadout.textContent = '等待开始';
  }
}

function resetStopwatch() {
  stopwatchRunning = false;
  stopwatchStart = 0;
  stopwatchElapsed = 0;
  swingCount = 0;
  stopwatchFinished = false;
  lastTheta = engine.getState().theta;
  lastOmega = engine.getState().omega;
  stopwatchBtn.textContent = '开始秒表';
  updateStopwatchDisplay();
}

function markSwingCrossing(theta: number, omega: number, prevTheta: number, prevOmega: number) {
  const crossedUp = prevTheta < 0 && theta >= 0 && omega > 0;
  const crossedDown = prevTheta > 0 && theta <= 0 && omega < 0;
  const validCross = crossedUp || crossedDown;
  const meaningfulSpeed = Math.abs(omega) > 0.02 || Math.abs(prevOmega) > 0.02;
  return validCross && meaningfulSpeed;
}

function handleStopwatch(theta: number, omega: number) {
  if (!stopwatchRunning || stopwatchFinished) {
    lastTheta = theta;
    lastOmega = omega;
    return;
  }
  if (markSwingCrossing(theta, omega, lastTheta, lastOmega)) {
    swingCount += 1;
    recordCycle = swingCount;
    if (recording) {
      pushExperimentRecord(theta, omega);
      renderRecords();
    }
    if (swingCount >= 10) {
      stopwatchFinished = true;
      stopwatchRunning = false;
      stopwatchElapsed = performance.now() - stopwatchStart;
      stopwatchBtn.textContent = '重新开始';
    }
  }
  lastTheta = theta;
  lastOmega = omega;
}

function renderRecords() {
  recordCountReadout.textContent = String(experimentRecords.length);
  recordList.innerHTML = experimentRecords.length
    ? experimentRecords
        .slice()
        .reverse()
        .map((item) => {
          const time = item.t.toFixed(2);
          return `<div class="record-item"><strong>第 ${item.cycle} 周期 · #${item.id} · t=${time}s</strong>θ=${item.theta.toFixed(3)} rad · ω=${item.omega.toFixed(3)} rad/s · E=${item.energy.toFixed(3)} J</div>`;
        })
        .join('')
    : '<div class="record-item">尚无记录。开始记录后，系统将按每次摆动周期自动保存实验数据。</div>';
  renderedRecordCount = experimentRecords.length;
}

function getAiConfig() {
  return {
    endpoint: '/api/chat',
    apiKey: 'server-side',
  };
}

function saveAiConfig() {
  return;
}

function persistConversation(responseId: string | undefined) {
  if (responseId) localStorage.setItem('scnet-ai-previous-response-id', responseId);
  localStorage.setItem('scnet-ai-history', JSON.stringify(conversationHistory));
}

function restoreConversation() {
  try {
    const raw = localStorage.getItem('scnet-ai-history');
    if (!raw) return;
    const parsed = JSON.parse(raw) as ConversationMessage[];
    if (!Array.isArray(parsed)) return;
    conversationHistory.splice(0, conversationHistory.length, ...parsed.slice(-12));
  } catch {
    conversationHistory.length = 0;
  }
}

function renderAiMessages() {
  aiChat.innerHTML = aiMessages
    .map((msg, index) => {
      const safeTitle = msg.title.replace(/[&<>]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[ch] as string));
      const safeContent = msg.content.replace(/[&<>]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[ch] as string)).replace(/\n/g, '<br />');
      return `<div class="ai-message ${msg.role}" data-ai-index="${index}"><strong>${safeTitle}</strong><span>${safeContent}</span></div>`;
    })
    .join('');
  aiChat.scrollTop = aiChat.scrollHeight;
}

function setAiStatus(text: string) {
  aiStatusReadout.textContent = text;
  aiStatusReadout.classList.toggle('ai-status', text.includes('生成') || text.includes('发送') || text.includes('请求'));
}

function setAiConfigStatus() {
  const key = getAiConfig().apiKey;
  setAiStatus(key ? '已配置' : '未配置');
}

function setMode(mode: PendulumMode) {
  params.mode = mode;
  modeCards.forEach((card) => card.classList.toggle('active', card.dataset.mode === mode));
  if (mode === 'small') {
    dampingInput.value = '0.02';
    theta0Input.value = '0.09';
  } else if (mode === 'large') {
    dampingInput.value = '0.06';
    theta0Input.value = '0.70';
  } else if (mode === 'driven') {
    dampingInput.value = '0.04';
  } else if (mode === 'damped') {
    dampingInput.value = '0.18';
  } else if (mode === 'chaotic') {
    dampingInput.value = '0.08';
    gravityInput.value = '11.0';
    theta0Input.value = '1.00';
  } else if (mode === 'other') {
    theta0Input.value = '0.35';
  }
  updateLabels();
  syncParams();
  resetExperiment();
}

function setVisualState(kind: 'energy' | 'phase' | 'scene', enabled: boolean) {
  if (kind === 'energy') {
    energyVisualEnabled = enabled;
    energyToggle.checked = enabled;
    energyToggleLabel.textContent = enabled ? '开启' : '关闭';
    if (!enabled) clearCanvas(energyCanvas.getContext('2d')!);
    else if (activeAnalysisPanel === 'energy') drawEnergyChart();
    return;
  }
  if (kind === 'phase') {
    phaseVisualEnabled = enabled;
    phaseToggle.checked = enabled;
    phaseToggleLabel.textContent = enabled ? '开启' : '关闭';
    if (!enabled) clearCanvas(phaseCanvas.getContext('2d')!);
    else if (activeAnalysisPanel === 'phase') drawPhaseChart();
    return;
  }
  sceneVisualEnabled = enabled;
  sceneToggle.checked = enabled;
  sceneToggleLabel.textContent = enabled ? '开启' : '关闭';
  sceneCanvas.style.opacity = enabled ? '' : '0';
  sceneCanvas.style.pointerEvents = enabled ? '' : 'none';
  if (enabled) sceneNeedsRender = true;
}

function formatAiContent(content: string) {
  const text = content.trim();
  if (!text) return '';
  return text
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^\s*[-*•]\s+/gm, '')
    .replace(/^#+\s*/gm, '')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\$(.+?)\$/g, '$1')
    .replace(/\u3000+/g, ' ');
}

function appendAiMessage(role: 'user' | 'assistant', title: string, content: string) {
  aiMessages.push({ role, title, content: formatAiContent(content) });
  if (aiMessages.length > 12) aiMessages.shift();
  renderAiMessages();
}

function normalizeAiAnswerText(text: string) {
  return formatAiContent(text)
    .replace(/\n{2,}/g, ' ')
    .replace(/\s+([，。！？；：])/g, '$1')
    .trim();
}

function updateAiMessage(index: number, content: string) {
  const message = aiMessages[index];
  if (!message) return;
  message.content = formatAiContent(content);
  if (aiRenderFrameRequested) return;
  aiRenderFrameRequested = true;
  requestAnimationFrame(() => {
    aiRenderFrameRequested = false;
    renderAiMessages();
  });
}

function summarizeExperiment() {
  const latest = experimentRecords[experimentRecords.length - 1];
  const theta = latest?.theta ?? engine.getState().theta;
  const omega = latest?.omega ?? engine.getState().omega;
  const { ek, ep, total } = computeEnergy(theta, omega);
  return `当前摆长 ${(params.length).toFixed(2)} cm，阻尼 ${params.damping.toFixed(2)}，初始角度 ${(params.theta0 * 180 / Math.PI).toFixed(0)}°。最近数据 θ=${theta.toFixed(3)} rad，ω=${omega.toFixed(3)} rad/s，机械能约 ${total.toFixed(3)} J。Ek=${ek.toFixed(3)} J，Ep=${ep.toFixed(3)} J。`;
}

function buildPhysicsAiMessages(question: string) {
  const state = engine.getState();
  const { ek, ep, total } = computeEnergy(state.theta, state.omega);
  const totalTime = Number(totalTimeInput.value);
  const cycleCount = Math.max(1, Number(cycleCountInput.value) || 1);
  const measuredPeriod = Number.isFinite(totalTime) && totalTime > 0 ? totalTime / cycleCount : null;
  const labLength = getLabLengthMeters();
  const calculatedGravity = measuredPeriod
    ? (4 * Math.PI * Math.PI * labLength) / (measuredPeriod * measuredPeriod)
    : null;
  const conservative = params.damping === 0 && params.mode !== 'damped' && params.mode !== 'driven' && params.mode !== 'chaotic';
  const contextData = {
    parameters: {
      mode: params.mode,
      mode_label: getModeMeta(params.mode).label,
      length_m: params.length,
      gravity_m_s2: params.gravity,
      damping: params.damping,
      mass_kg: params.mass,
      initial_angle_deg: (params.theta0 * 180) / Math.PI,
      drive_amplitude: params.driveAmplitude,
      drive_frequency_hz: params.driveFrequency,
    },
    current_state: {
      simulation_time_s: simTime,
      angle_rad: state.theta,
      angle_deg: (state.theta * 180) / Math.PI,
      angular_velocity_rad_s: state.omega,
      kinetic_energy_j: ek,
      potential_energy_j: ep,
      total_energy_j: total,
      running,
    },
    measurement: {
      string_length_cm: Number(stringLengthInput.value) || null,
      ball_diameter_cm: Number(ballDiameterInput.value) || null,
      effective_length_m: Number.isFinite(labLength) ? labLength : null,
      cycle_count: cycleCount,
      total_time_s: Number.isFinite(totalTime) && totalTime > 0 ? totalTime : null,
      period_s: measuredPeriod,
      calculated_gravity_m_s2: Number.isFinite(measuredGravity) && measuredGravity > 0 ? measuredGravity : calculatedGravity,
      gravity_error_percent: measuredPeriod && params.gravity > 0
        ? ((calculatedGravity! - params.gravity) / params.gravity) * 100
        : null,
    },
    observation: {
      recorded_samples: experimentRecords.length,
      recent_records: experimentRecords.slice(-10).map((record) => ({
        time_s: record.t,
        angle_rad: record.theta,
        angular_velocity_rad_s: record.omega,
        total_energy_j: record.energy,
        cycle: record.cycle,
      })),
      energy_drift_percent: conservative ? maxEnergyDrift : null,
    },
    numerical_method: {
      integrator: 'velocity Verlet',
      fixed_step_us: 10,
      chart_refresh_hz: 60,
      note: conservative ? '可用能量漂移评估长期稳定性' : '阻尼或外力模式下能量变化包含物理耗散或外部做功',
    },
  };
  const systemPrompt = [
    '你是大学物理实验指导教师，负责指导非线性单摆数字孪生实验。',
    '只依据实验上下文和用户问题回答；上下文中的 null 或缺失值不得臆造。',
    '先给出可执行的结论，再解释公式、单位和计算依据；所有数值都要标明单位。',
    '区分测量事实、数值模拟结果和物理推断；发现数据不足或不一致时明确指出。',
    '小角度近似应检查摆角是否足够小（通常约 10° 以内）；大角度时说明简谐周期公式的局限。',
    '区分阻尼导致的能量耗散与受迫振动导致的外部做功，不要把能量变化直接判定为数值误差。',
    '涉及实验报告时按“结论”“依据与计算”“误差与改进”三段回答；普通提问保持简洁。',
    '使用中文纯文本，不使用 Markdown 表格、代码围栏或无关长篇背景。',
  ].join('\n');
  const priorHistory = conversationHistory.slice(0, -1).map((msg) => ({ role: msg.role, content: msg.content }));
  return [
    { role: 'system', content: systemPrompt },
    ...priorHistory,
    {
      role: 'user',
      content: `实验上下文（JSON）：\n${JSON.stringify(contextData, null, 2)}\n\n当前问题：${question}\n\n请先引用上下文中的关键事实，再给出物理解释或操作建议。`,
    },
  ];
}

type ChatCompletionChunk = {
  id?: string;
  choices?: Array<{ delta?: { content?: string }; finish_reason?: string | null }>;
};

let aiAbortController: AbortController | null = null;
let aiStreaming = false;
let aiActiveAssistantIndex = -1;
let aiActiveUserText = '';
let aiActiveAssistantText = '';

async function callScnetChatStream(question: string, onDelta: (chunk: string) => void) {
  const { endpoint } = getAiConfig();
  if (getAiConfig().endpoint === '') {
    throw new Error('密钥不可用，请检查是否已正确配置 AI 服务密钥。');
  }
  aiAbortController = new AbortController();
  aiStreaming = true;
  aiStopBtn.disabled = false;
  aiStopBtn.textContent = '停止生成';
  const response = await fetch(endpoint, {
    method: 'POST',
    signal: aiAbortController.signal,
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
        messages: buildPhysicsAiMessages(question),
    }),
  });
  if (!response.ok || !response.body) {
    if (response.status === 401) throw new Error('密钥不可用，请检查是否已正确配置 AI 服务密钥。');
    if (response.status === 403) throw new Error('当前账号没有权限使用该模型，请确认模型权限或额度。');
    if (response.status === 429) throw new Error('请求太频繁了，请稍后再试。');
    if (response.status >= 500) throw new Error('AI 服务暂时不可用，请稍后再试。');
    throw new Error('请求失败，请稍后再试。');
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let fullText = '';
  let responseId = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      if (!line.startsWith('data:')) continue;
      const dataText = line.slice(5).trim();
      if (!dataText || dataText === '[DONE]') continue;
      let parsed: ChatCompletionChunk | null = null;
      try {
        parsed = JSON.parse(dataText) as ChatCompletionChunk;
      } catch {
        continue;
      }
      if (typeof parsed?.id === 'string') responseId = parsed.id;
      const delta = parsed?.choices?.[0]?.delta?.content;
      if (typeof delta === 'string' && delta) {
        fullText += delta;
        onDelta(fullText);
      }
    }
  }
  if (responseId) localStorage.setItem('scnet-ai-previous-response-id', responseId);
  aiStreaming = false;
  aiAbortController = null;
  aiStopBtn.disabled = true;
  aiStopBtn.textContent = '停止生成';
  return fullText.trim();
}

function generateAiReply(question: string) {
  const lower = question.toLowerCase();
  if (lower.includes('总结') || lower.includes('数据')) {
    return summarizeExperiment();
  }
  if (lower.includes('原理') || lower.includes('公式')) {
    return '小角度单摆的周期近似满足 T = 2π√(l/g)。实验中通过测量总周期时间 T总，再用 g = 4π²l / T² 计算重力加速度。';
  }
  if (lower.includes('阻尼')) {
    return '阻尼会让振幅随时间衰减，能量逐步损失。阻尼越大，摆动衰减越快，轨迹在相图中也会更快收缩。';
  }
  return '我可以帮你分析当前实验参数、解释公式，或者整理成实验报告。';
}

function seedAiConversation() {
  if (aiMessages.length > 0) return;
  appendAiMessage('assistant', 'AI 助手', '你好，我可以帮你分析当前实验。你可以直接问我现在数据是否合理、应该怎么调参数、或者报告怎么写更简洁。');
}

function exportRecordsToCsv() {
  if (experimentRecords.length === 0) {
    exportCsvBtn.textContent = '暂无可导出数据';
    window.setTimeout(() => {
      exportCsvBtn.textContent = '导出 CSV';
    }, 1500);
    return;
  }
  const { g, l, T, n } = calculateGravityFromInputs(Number(totalTimeInput.value) || 0);
  const labHeader = ['d_cm', 'l_shaft_cm', 'l_m', 'n', 'T_total_s', 'T_s', 'g_calc_ms2'];
  const labRow = [
    Number(ballDiameterInput.value).toFixed(2),
    Number(stringLengthInput.value).toFixed(2),
    l.toFixed(4),
    String(n),
    (Number(totalTimeInput.value) || 0).toFixed(2),
    T.toFixed(4),
    g.toFixed(6),
  ];
  const header = ['id', 'time_s', 'theta_rad', 'omega_rad_s', 'energy_j'];
  const rows = experimentRecords.map((item) => [
    item.id,
    item.t.toFixed(4),
    item.theta.toFixed(6),
    item.omega.toFixed(6),
    item.energy.toFixed(6),
  ]);
  const csv = [
    labHeader,
    labRow,
    [],
    header,
    ...rows,
  ]
    .map((row) => (row.length === 0 ? '' : row.map((value) => `"${String(value).split('"').join('""')}"`).join(',')))
    .join('\r\n');
  const blob = new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `pendulum-records-${new Date().toISOString().replace(/[:.]/g, '-')}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function resetExperiment() {
  engine.reset(params.theta0, 0);
  simTime = 0;
  simulationAccumulator = 0;
  displayAccumulator = 0;
  resetEnergyTracking();
  stateTrail.length = 0;
  trailGeometry.setDrawRange(0, 0);
  phaseTrail.length = 0;
  energySamples.length = 0;
  experimentRecords.length = 0;
  recordId = 1;
  recording = false;
  recordCycle = 0;
  recordBtn.textContent = '开始记录';
  recordBtn.style.background = '';
  resetStopwatch();
  renderRecords();
  updateEnergyReadout(params.theta0, 0);
  if (sceneVisualEnabled) {
    updateScene();
    render();
  }
}

function fillStopwatchToLabInput() {
  if (stopwatchElapsed <= 0) return;
  totalTimeInput.value = (stopwatchElapsed / 1000).toFixed(2);
  updateGravityResult(stopwatchElapsed / 1000);
}

function getReportData() {
  const lengthCm = pendulumLengthReadout.value || `${(getLabLengthMeters() * 100).toFixed(2)} cm`;
  const periodText = periodInputReadout.textContent || '--';
  const gravityText = gravityResultReadout.textContent || '--';
  const errorText = gErrorReadout.textContent || '--';
  return {
    name: studentNameInput.value.trim(),
    studentId: studentIdInput.value.trim(),
    className: classNameInput.value.trim(),
    reportDate: reportDateInput.value,
    groupName: '',
    groupMembers: groupMembersInput.value.trim(),
    eq1: '',
    eq2: '',
    eq3: '',
    eq4: '',
    eq5: '',
    eq6: '',
    eq7: '',
    eq8: '',
    ballDiameter: ballDiameterInput.value,
    stringLength: stringLengthInput.value,
    cycleCount: cycleCountInput.value,
    totalTime: totalTimeInput.value,
    x1: '',
    x2: '',
    l1: lengthCm.replace(/\s*cm$/i, ''),
    un: '',
    d1: ballDiameterInput.value,
    d2: '',
    d3: '',
    davg: ballDiameterInput.value,
    dzero: '',
    dmean: ballDiameterInput.value,
    ud: '',
    lvalue: lengthCm.replace(/\s*cm$/i, ''),
    lerr: '',
    n: cycleCountInput.value || '50',
    ttotal: totalTimeInput.value,
    period: periodText,
    gcalc: gravityText,
    conclusion: '通过单摆测量周期，结合公式 g = 4π²l / T² 计算得出重力加速度，并与理论值比较求得相对误差。',
    lengthCm,
    gravity: gravityText,
    error: errorText,
  };
}

function openEditableReportOverlay() {
  const overlay = mustGetElement<HTMLDivElement>('#reportOverlay');
  const frame = mustGetElement<HTMLIFrameElement>('#reportOverlayFrame');
  const closeBtn = mustGetElement<HTMLButtonElement>('#reportOverlayCloseBtn');
  const saveBtn = mustGetElement<HTMLButtonElement>('#reportOverlaySaveBtn');
  const backdrop = mustGetElement<HTMLDivElement>('#reportOverlayBackdrop');
  const data = getReportData();
  const storageKey = 'pendulum-report-draft';
  const savedDraft = (() => {
    try {
      const raw = localStorage.getItem(storageKey);
      return raw ? JSON.parse(raw) as Record<string, string> : null;
    } catch {
      return null;
    }
  })();
  const draft = savedDraft ? { ...data, ...savedDraft } : data;
  draft.lengthCm = draft.lengthCm || data.lengthCm;
  draft.l1 = draft.l1 || draft.lengthCm || data.lengthCm;
  draft.lvalue = draft.lvalue || draft.lengthCm || data.lengthCm;
  draft.davg = draft.davg || draft.ballDiameter || data.ballDiameter;
  draft.dmean = draft.dmean || draft.ballDiameter || data.ballDiameter;
  const hasSavedDraft = Boolean(savedDraft);
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>实验报告编辑页</title><style>
    @page { size: A4 portrait; margin: 10mm 12mm; }
    html, body { margin: 0; padding: 0; }
    body {
      font-family: "Songti SC", SimSun, "Times New Roman", serif;
      color: #111;
      background: #f2f2ee;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .toolbar {
      position: sticky;
      top: 0;
      z-index: 5;
      display: flex;
      gap: 8px;
      align-items: center;
      justify-content: space-between;
      padding: 10px 14px;
      background: rgba(245, 245, 240, 0.96);
      border-bottom: 1px solid #cfcfc7;
      backdrop-filter: blur(6px);
    }
    .toolbar .left { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
    .toolbar .title { font-size: 13px; font-weight: 700; }
    .toolbar button {
      border: 1px solid #333;
      background: #fff;
      color: #111;
      border-radius: 6px;
      padding: 7px 12px;
      cursor: pointer;
      font: inherit;
    }
    .toolbar button.primary { background: #111; color: #fff; }
    .page {
      width: min(760px, calc(100vw - 36px));
      margin: 12px auto 18px;
      box-sizing: border-box;
      padding: 20px 26px 26px;
      background: #fff;
      border: 1px solid #bdbdb3;
      box-shadow: 0 8px 24px rgba(0,0,0,0.08);
    }
    .title1 { text-align: center; font-size: 19px; font-weight: 700; margin: 0 0 10px; letter-spacing: 0.02em; }
    .meta { width: 100%; border-collapse: collapse; margin-bottom: 8px; table-layout: fixed; font-size: 10px; }
    .meta td { padding: 2px 3px 4px; vertical-align: bottom; white-space: nowrap; }
    .paper-field, .paper-textarea {
      border: 0; border-bottom: 1px solid #111; outline: none; background: transparent; color:#111;
      font: inherit; width: 100%; padding: 0 2px 1px; min-height: 18px; box-sizing: border-box;
    }
    .paper-field.center { text-align: center; }
    .paper-field.inline { display:inline-block; width:auto; min-width: 88px; }
    .paper-textarea { resize: vertical; min-height: 54px; line-height: 1.5; }
    .section-title { font-weight: 700; margin: 7px 0 4px; font-size: 12px; }
    .small-note { font-size: 9.8px; line-height: 1.45; margin-top: 4px; }
    ol { margin: 4px 0 6px 18px; padding: 0; line-height: 1.38; font-size: 10px; }
    .formula { text-align: center; font-size: 15px; margin: 8px 0 6px; line-height: 1.5; }
    .table-box { width: 100%; border-collapse: collapse; table-layout: fixed; font-size: 9.5px; margin: 6px 0 8px; }
    .table-box th, .table-box td { border: 1px solid #111; text-align: center; padding: 3px 2px; word-break: break-all; vertical-align: middle; }
    .table-box th { font-weight: 700; }
    .equipment-grid { display:grid; grid-template-columns: repeat(2, 1fr); gap:6px 14px; margin:4px 0 6px; }
    .equipment-grid .item { font-size:10px; white-space:nowrap; }
    .equipment-input { border:0; border-bottom:1px solid #111; background:transparent; outline:none; font:inherit; width:100%; padding:0 2px; min-height:18px; }
    .page-break { page-break-before: always; }
    .right { text-align:right; }
    .center { text-align:center; }
    .muted { color:#333; }
    @media print { .toolbar { display:none; } body { background:#fff; } .page { margin:0 auto; box-shadow:none; border:0; width:100%; padding: 0; } }
  </style></head><body>
    <div class="toolbar">
      <div class="left">
        <div class="title">可编辑实验报告</div>
        <div class="small-note" id="draftHint">先修改内容，再导出实验报告</div>
      </div>
    </div>
    <div class="page">
      <div class="title1">实验一 用单摆法测量重力加速度</div>
      <table class="meta">
        <tr>
          <td>姓&nbsp;&nbsp;名：<input class="paper-field" data-field="name" value="${draft.name || ''}" /></td>
          <td>学&nbsp;&nbsp;号：<input class="paper-field" data-field="studentId" value="${draft.studentId || ''}" /></td>
          <td>班&nbsp;&nbsp;级：<input class="paper-field" data-field="className" value="${draft.className || ''}" /></td>
          <td>日&nbsp;&nbsp;期：<input class="paper-field" data-field="reportDate" type="date" value="${draft.reportDate || ''}" /></td>
        </tr>
        <tr>
          <td>组&nbsp;&nbsp;别：<input class="paper-field" data-field="groupName" value="${draft.groupName || ''}" /></td>
          <td colspan="3">同组人员：<input class="paper-field" data-field="groupMembers" value="${draft.groupMembers || ''}" /></td>
        </tr>
      </table>
      <div class="section-title">【实验目的】</div>
      <ol><li>学会用单摆法测定重力加速度；</li><li>学习使用计时仪器（多功能计时器）；</li><li>掌握用不确定度方法计算误差；</li><li>学会用作图法计算斜率。</li></ol>
      <div class="section-title">【实验器仪】</div>
      <div class="small-note">1．实验器仪（请按下列项目填写）：</div>
      <div class="equipment-grid">
        <div class="item">（1）<input class="paper-field" data-field="eq1" value="${draft.eq1 || ''}" placeholder="________________" /></div>
        <div class="item">（2）<input class="paper-field" data-field="eq2" value="${draft.eq2 || ''}" placeholder="________________" /></div>
        <div class="item">（3）<input class="paper-field" data-field="eq3" value="${draft.eq3 || ''}" placeholder="________________" /></div>
        <div class="item">（4）<input class="paper-field" data-field="eq4" value="${draft.eq4 || ''}" placeholder="________________" /></div>
      </div>
      <div class="equipment-grid">
        <div class="item">（5）<input class="paper-field" data-field="eq5" value="${draft.eq5 || ''}" placeholder="________________" /></div>
        <div class="item">（6）<input class="paper-field" data-field="eq6" value="${draft.eq6 || ''}" placeholder="________________" /></div>
        <div class="item">（7）<input class="paper-field" data-field="eq7" value="${draft.eq7 || ''}" placeholder="________________" /></div>
        <div class="item">（8）<input class="paper-field" data-field="eq8" value="${draft.eq8 || ''}" placeholder="________________" /></div>
      </div>
      <div class="section-title">【实验原理】</div>
      <div class="small-note">把一个金属小球挂在一根细长的线上，如图所示。如果细线的质量比小球的质量小很多，而球的直径又比细线的长度小很多，则此装置可看作是不计质量的细线系住一个质点的单摆。略去空气阻力和浮力以及线的伸长，在摆角很小时，可以认为单摆作简谐振动，其振动周期为：</div>
      <div class="formula">T = 2π √(l / g)　　　g = 4π²l / T²</div>
      <div class="small-note center">式中 l 是悬点 O 到小球球心的距离，g 是重力加速度，T 为周期。</div>
      <div class="section-title">【实验数据记录】</div>
      <div class="small-note" style="margin-bottom:4px;">1．固定摆长，测定 g。</div>
      <div class="small-note">（1）测定摆长（摆长 l 取 100cm 左右）。</div>
      <div class="small-note">①先用带米尺测量悬点 O 到小球最低点 A 的距离 l<sub>1</sub>：</div>
      <table class="table-box">
        <tr><th>悬点 O 的位置 x1 / cm</th><th>小球最低点 A 的位置 x2 / cm</th><th>l1 = |x1 - x2| / cm</th><th>U<sub>n</sub> / cm</th></tr>
        <tr><td><input class="paper-field center" data-field="x1" value="${draft.x1 || ''}" /></td><td><input class="paper-field center" data-field="x2" value="${draft.x2 || ''}" /></td><td><input class="paper-field center" data-field="l1" value="${draft.l1 || draft.lengthCm || data.lengthCm}" /></td><td><input class="paper-field center" data-field="un" value="${draft.un || ''}" /></td></tr>
      </table>
      <div class="small-note">②用游标卡尺多次测量小球的直径 d：</div>
      <table class="table-box">
        <tr><th>次数</th><th>1</th><th>2</th><th>3</th><th>平均</th><th>卡尺零点</th><th>直径 d 平均值</th><th>U<sub>d</sub></th></tr>
        <tr><td>d / cm</td><td><input class="paper-field center" data-field="d1" value="${draft.d1 || draft.ballDiameter || ''}" /></td><td><input class="paper-field center" data-field="d2" value="${draft.d2 || ''}" /></td><td><input class="paper-field center" data-field="d3" value="${draft.d3 || ''}" /></td><td><input class="paper-field center" data-field="davg" value="${draft.davg || ''}" /></td><td><input class="paper-field center" data-field="dzero" value="${draft.dzero || ''}" /></td><td><input class="paper-field center" data-field="dmean" value="${draft.dmean || ''}" /></td><td><input class="paper-field center" data-field="ud" value="${draft.ud || ''}" /></td></tr>
      </table>
      <div class="small-note">③摆长为 l = l1 - d / 2，求出摆长 l 的不确定度 U<sub>l</sub> 和相对不确定度 U<sub>rl</sub>。</div>
      <div class="formula" style="font-size:14px;">l = <input class="paper-field center inline" data-field="lvalue" value="${draft.lvalue || ''}" /> ± <input class="paper-field center inline" data-field="lerr" value="${draft.lerr || ''}" /> cm</div>
      <div class="page-break"></div>
      <div class="section-title">（2）测量单摆周期。</div>
      <div class="small-note">使用小角度摆动，记录 50 次全振动总时间 T总，并计算单次周期 T。</div>
      <div class="small-note">使用小角度摆动，记录 50 次全振动总时间 T总，并计算单次周期 T。</div>
      <table class="table-box">
        <tr><th style="width:22%">测量次数</th><th style="width:14%">n</th><th>总时间 T总 / s</th><th>单次周期 T / s</th><th>计算值 g / (m·s⁻²)</th><th>相对误差</th></tr>
        <tr><td>实验结果</td><td><input class="paper-field center" data-field="n" value="${draft.n || '50'}" /></td><td><input class="paper-field center" data-field="ttotal" value="${draft.ttotal || draft.totalTime || ''}" /></td><td><input class="paper-field center" data-field="period" value="${draft.period || ''}" /></td><td><input class="paper-field center" data-field="gcalc" value="${draft.gcalc || draft.gravity || ''}" /></td><td><input class="paper-field center" data-field="error" value="${draft.error || ''}" /></td></tr>
      </table>
      <div class="section-title">【实验结论】</div>
      <textarea class="paper-textarea" data-field="conclusion">${draft.conclusion || '通过单摆测量周期，结合公式 g = 4π²l / T² 计算得出重力加速度，并与理论值比较求得相对误差。'}</textarea>
      <div class="section-title">【实验数据汇总】</div>
      <table class="table-box">
        <tr><th style="width:28%">项目</th><th>内容</th></tr>
        <tr><td>姓名</td><td><input class="paper-field" data-field="name2" value="${draft.name || ''}" /></td></tr>
        <tr><td>学号</td><td><input class="paper-field" data-field="sid2" value="${draft.studentId || ''}" /></td></tr>
        <tr><td>班级</td><td><input class="paper-field" data-field="class2" value="${draft.className || ''}" /></td></tr>
        <tr><td>日期</td><td><input class="paper-field" data-field="date2" type="date" value="${draft.reportDate || ''}" /></td></tr>
        <tr><td>同组人员</td><td><input class="paper-field" data-field="group2" value="${draft.groupMembers || ''}" /></td></tr>
      </table>
      <div class="small-note right muted">页面由实验平台自动生成，可直接导出实验报告。</div>
    </div>
    <script>
      const draftHint = document.getElementById('draftHint');
      const storageKey = '${storageKey}';
      function serializeDraft() {
        const out = {};
        document.querySelectorAll('[data-field]').forEach((el) => {
          const key = el.getAttribute('data-field');
          if (!key) return;
          out[key] = 'value' in el ? el.value : el.textContent;
        });
        return out;
      }
      function syncMirrorValues() {
        const map = serializeDraft();
        document.title = '实验一 用单摆法测量重力加速度 - ' + (map.name || '实验报告');
      }
      function saveDraft() {
        try {
          localStorage.setItem(storageKey, JSON.stringify(serializeDraft()));
        } catch {}
        if (draftHint) draftHint.textContent = '已恢复上次填写内容 刷新网站后删除草稿';
        syncMirrorValues();
      }
      function exportReport() {
        saveDraft();
        try {
          const exportHtml = '<!doctype html><html><head><meta charset="utf-8"><title>实验一 用单摆法测量重力加速度</title><style>' +
            '@page { size: A4 portrait; margin: 10mm 12mm; }' +
            'html, body { margin:0; padding:0; }' +
            'body { font-family:"Songti SC", SimSun, "Times New Roman", serif; color:#111; background:#fff; -webkit-print-color-adjust: exact; print-color-adjust: exact; }' +
            '.page { width:100%; box-sizing:border-box; padding:0; }' +
            '.title1 { text-align:center; font-size:19px; font-weight:700; margin:0 0 10px; }' +
            '.meta { width:100%; border-collapse:collapse; margin-bottom:8px; table-layout:fixed; font-size:10px; }' +
            '.meta td { padding:2px 3px 4px; vertical-align:bottom; white-space:nowrap; }' +
            '.paper-field, .paper-textarea { border:0; border-bottom:1px solid #111; outline:none; background:transparent; color:#111; font:inherit; width:100%; padding:0 2px 1px; min-height:18px; box-sizing:border-box; }' +
            '.paper-field.center { text-align:center; }' +
            '.paper-field.inline { display:inline-block; width:auto; min-width:88px; }' +
            '.paper-textarea { resize:vertical; min-height:54px; line-height:1.5; }' +
            '.section-title { font-weight:700; margin:7px 0 4px; font-size:12px; }' +
            '.small-note { font-size:9.8px; line-height:1.45; margin-top:4px; }' +
            'ol { margin:4px 0 6px 18px; padding:0; line-height:1.38; font-size:10px; }' +
            '.formula { text-align:center; font-size:15px; margin:8px 0 6px; line-height:1.5; }' +
            '.table-box { width:100%; border-collapse:collapse; table-layout:fixed; font-size:9.5px; margin:6px 0 8px; }' +
            '.table-box th, .table-box td { border:1px solid #111; text-align:center; padding:3px 2px; word-break:break-all; vertical-align:middle; }' +
            '.equipment-grid { display:grid; grid-template-columns: repeat(2, 1fr); gap:6px 14px; margin:4px 0 6px; }' +
            '.equipment-grid .item { font-size:10px; white-space:nowrap; }' +
            '.page-break { page-break-before:always; }' +
            '.right { text-align:right; } .center { text-align:center; } .muted { color:#333; }' +
            '</style></head><body><div class="page">' + frame.contentDocument?.body.innerHTML + '</div></body></html>';
          const blob = new Blob([exportHtml], { type: 'text/html;charset=utf-8' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = 'pendulum-report-' + new Date().toISOString().replace(/[:.]/g, '-') + '.html';
          document.body.appendChild(a);
          a.click();
          a.remove();
          window.setTimeout(() => URL.revokeObjectURL(url), 2000);
        } catch {}
      }
      if (draftHint && ${hasSavedDraft ? 'true' : 'false'}) {
        draftHint.textContent = '已恢复上次填写内容 刷新网站后删除草稿';
      }
      document.addEventListener('input', saveDraft);
      saveDraft();
    </script>
  </body></html>`;
  overlay.classList.add('is-open');
  overlay.setAttribute('aria-hidden', 'false');
  frame.srcdoc = html;
  const saveDraftFromFrame = () => {
    try {
      const doc = frame.contentDocument;
      if (!doc) return;
      const draftData: Record<string, string> = {};
      doc.querySelectorAll('[data-field]').forEach((el) => {
        const key = el.getAttribute('data-field');
        if (!key) return;
        draftData[key] = 'value' in el ? (el as HTMLInputElement | HTMLTextAreaElement).value : el.textContent || '';
      });
      localStorage.setItem(storageKey, JSON.stringify(draftData));
    } catch {
      // noop
    }
  };
  const close = () => {
    saveDraftFromFrame();
    overlay.classList.remove('is-open');
    overlay.setAttribute('aria-hidden', 'true');
    frame.srcdoc = '';
  };
  backdrop.onclick = close;
  closeBtn.onclick = close;
  saveBtn.onclick = () => {
    saveDraftFromFrame();
    const doc = frame.contentDocument;
    if (!doc) return;
    const exportHtml = '<!doctype html><html><head><meta charset="utf-8"><title>实验一 用单摆法测量重力加速度</title><style>' +
      '@page { size: A4 portrait; margin: 10mm 12mm; }' +
      'html, body { margin:0; padding:0; }' +
      'body { font-family:"Songti SC", SimSun, "Times New Roman", serif; color:#111; background:#fff; -webkit-print-color-adjust: exact; print-color-adjust: exact; }' +
      '.page { width:100%; box-sizing:border-box; padding:0; }' +
      '.title1 { text-align:center; font-size:19px; font-weight:700; margin:0 0 10px; }' +
      '.meta { width:100%; border-collapse:collapse; margin-bottom:8px; table-layout:fixed; font-size:10px; }' +
      '.meta td { padding:2px 3px 4px; vertical-align:bottom; white-space:nowrap; }' +
      '.paper-field, .paper-textarea { border:0; border-bottom:1px solid #111; outline:none; background:transparent; color:#111; font:inherit; width:100%; padding:0 2px 1px; min-height:18px; box-sizing:border-box; }' +
      '.paper-field.center { text-align:center; }' +
      '.paper-field.inline { display:inline-block; width:auto; min-width:88px; }' +
      '.paper-textarea { resize:vertical; min-height:54px; line-height:1.5; }' +
      '.section-title { font-weight:700; margin:7px 0 4px; font-size:12px; }' +
      '.small-note { font-size:9.8px; line-height:1.45; margin-top:4px; }' +
      'ol { margin:4px 0 6px 18px; padding:0; line-height:1.38; font-size:10px; }' +
      '.formula { text-align:center; font-size:15px; margin:8px 0 6px; line-height:1.5; }' +
      '.table-box { width:100%; border-collapse:collapse; table-layout:fixed; font-size:9.5px; margin:6px 0 8px; }' +
      '.table-box th, .table-box td { border:1px solid #111; text-align:center; padding:3px 2px; word-break:break-all; vertical-align:middle; }' +
      '.equipment-grid { display:grid; grid-template-columns: repeat(2, 1fr); gap:6px 14px; margin:4px 0 6px; }' +
      '.equipment-grid .item { font-size:10px; white-space:nowrap; }' +
      '.page-break { page-break-before:always; }' +
      '.right { text-align:right; } .center { text-align:center; } .muted { color:#333; }' +
      '</style></head><body><div class="page">' + doc.body.innerHTML + '</div></body></html>';
    const blob = new Blob([exportHtml], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'pendulum-report-' + new Date().toISOString().replace(/[:.]/g, '-') + '.html';
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 2000);
  };
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay || event.target === backdrop) close();
  });
  document.addEventListener('keydown', function onEscape(event) {
    if (event.key === 'Escape') {
      close();
      document.removeEventListener('keydown', onEscape);
    }
  });
}

function syncLabPreview() {
  const totalTime = Number(totalTimeInput.value);
  const l = getLabLengthMeters();
  pendulumLengthReadout.textContent = `${(l * 100).toFixed(2)} cm`;
  const n = Math.max(1, Number(cycleCountInput.value) || 1);
  if (Number.isFinite(totalTime) && totalTime > 0) {
    const T = totalTime / n;
    periodInput.textContent = T.toFixed(4);
    periodInputReadout.textContent = `${T.toFixed(4)} s`;
    const g = (4 * Math.PI * Math.PI * l) / (T * T);
    gravityResultReadout.textContent = `${g.toFixed(4)} m/s²`;
    gErrorReadout.textContent = params.gravity > 0 ? `${(((g - params.gravity) / params.gravity) * 100).toFixed(2)}%` : '理想化模型';
    measuredGravity = g;
  } else {
    periodInput.textContent = '--';
    periodInputReadout.textContent = '--';
    gravityResultReadout.textContent = '--';
    gErrorReadout.textContent = '--';
  }
}

function loop(now: number) {
  if (document.hidden) {
    last = now;
    requestAnimationFrame(loop);
    return;
  }
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;
  if (paramsDirty) syncParams();
  let stepped = false;
  if (running && !isDraggingBob) {
    simulationAccumulator = Math.min(simulationAccumulator + dt, FIXED_STEP * MAX_SUBSTEPS_PER_FRAME);
    let steps = 0;
    while (simulationAccumulator >= FIXED_STEP && steps < MAX_SUBSTEPS_PER_FRAME) {
      const steppedState = engine.step(FIXED_STEP, params);
      simulationAccumulator -= FIXED_STEP;
      simTime += FIXED_STEP;
      steps += 1;
      stepped = true;
      handleStopwatch(steppedState.theta, steppedState.omega);
    }
  }
  if (!stepped) handleStopwatch(engine.getState().theta, engine.getState().omega);
  displayAccumulator += dt;
  const targetDisplayStep = running || isDraggingBob ? DISPLAY_STEP : IDLE_RENDER_STEP;
  if (displayAccumulator < targetDisplayStep) {
    requestAnimationFrame(loop);
    return;
  }
  displayAccumulator %= targetDisplayStep;
  const { theta, omega } = engine.getState();
  if (stepped || phaseTrail.length === 0) {
    phaseTrail.push({ theta, omega });
    if (phaseTrail.length > 260) phaseTrail.shift();
    pushEnergySample(theta, omega);
  }
  updateEnergyReadout(theta, omega);
  updateStopwatchDisplay();
  if (stopwatchRunning) {
    stopwatchElapsed = now - stopwatchStart;
  }
  if (recording) {
    recordCycle = swingCount;
  }
  if (sceneVisualEnabled && (stepped || isDraggingBob || sceneNeedsRender)) {
    updateScene();
  }
  if (energyVisualEnabled && activeAnalysisPanel === 'energy') {
    drawEnergyChart();
  } else if (!energyVisualEnabled) {
    clearCanvas(energyCanvas.getContext('2d')!);
  }
  if (phaseVisualEnabled && activeAnalysisPanel === 'phase') {
    drawPhaseChart();
  } else if (!phaseVisualEnabled) {
    clearCanvas(phaseCanvas.getContext('2d')!);
  }
  if (renderedRecordCount !== experimentRecords.length) renderRecords();
  if (sceneVisualEnabled) render();
  requestAnimationFrame(loop);
}

function bindRangePair(
  rangeInput: HTMLInputElement,
  numberInput: HTMLInputElement,
  normalizeRange: (value: number) => number,
  normalizeNumber: (value: number) => number = normalizeRange,
  formatNumber: (rangeValue: number) => string = (value) => value.toFixed(numberInput === gravityNumberInput ? 1 : 2),
) {
  const syncFromRange = () => {
    const value = normalizeRange(Number(rangeInput.value));
    rangeInput.value = String(value);
    numberInput.value = formatNumber(value);
    syncParams();
  };
  const syncFromNumber = () => {
    const parsedValue = Number(numberInput.value);
    if (!Number.isFinite(parsedValue)) {
      numberInput.value = formatNumber(Number(rangeInput.value));
      return;
    }
    const value = normalizeNumber(parsedValue);
    rangeInput.value = String(value);
    numberInput.value = formatNumber(value);
    syncParams();
  };
  rangeInput.addEventListener('input', syncFromRange);
  numberInput.addEventListener('input', syncFromNumber);
}

bindRangePair(lengthInput, lengthNumberInput, (value) => Math.min(3.5, Math.max(0.5, value)));
bindRangePair(gravityInput, gravityNumberInput, (value) => Math.min(20, Math.max(0, value)));
bindRangePair(dampingInput, dampingNumberInput, (value) => Math.min(2, Math.max(0, value)));
bindRangePair(
  theta0Input,
  theta0NumberInput,
  (value) => Math.min(1.57, Math.max(0, value)),
  (value) => Math.min(1.57, Math.max(0, value * Math.PI / 180)),
  (value) => `${Math.round((value * 180) / Math.PI)}`,
);
ballDiameterInput.addEventListener('input', syncLabPreview);
stringLengthInput.addEventListener('input', syncLabPreview);
cycleCountInput.addEventListener('input', syncLabPreview);
totalTimeInput.addEventListener('input', syncLabPreview);
document.addEventListener('pointermove', (event) => {
  queuePointerVisualUpdate(event);
});
sceneCanvas.addEventListener('pointerdown', (event) => {
  updateScenePointer(event);
  updateSceneGlow(event);
  const rect = sceneCanvas.getBoundingClientRect();
  const ndcX = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  const ndcY = -(((event.clientY - rect.top) / rect.height) * 2 - 1);
  pointer.set(ndcX, ndcY);
  raycaster.setFromCamera(pointer, camera);
  const intersects = raycaster.intersectObject(bob, true);
  if (intersects.length > 0) {
    isDraggingBob = true;
    sceneCanvas.setPointerCapture(event.pointerId);
  }
});
sceneCanvas.addEventListener('pointermove', (event) => {
  updateScenePointer(event);
  if (!isDraggingBob) return;
  const rect = sceneCanvas.getBoundingClientRect();
  const localX = (event.clientX - rect.left) / rect.width;
  const clampedX = Math.min(0.98, Math.max(0.02, localX));
  const theta = (clampedX - 0.5) * Math.PI * 1.8;
  const current = engine.getState();
  engine.reset(theta, current.omega * 0.92);
  simTime = 0;
  resetEnergyTracking();
});
sceneCanvas.addEventListener('pointerup', (event) => {
  if (isDraggingBob) {
    isDraggingBob = false;
    sceneCanvas.releasePointerCapture(event.pointerId);
  }
});
sceneCanvas.addEventListener('pointercancel', () => {
  isDraggingBob = false;
});
toggleBtn.addEventListener('click', () => {
  running = !running;
  toggleBtn.textContent = running ? '暂停' : '继续';
  toggleBtn.setAttribute('aria-pressed', String(running));
  toggleBtn.setAttribute('aria-label', running ? '暂停仿真' : '继续仿真');
  toggleBtn.title = running ? '暂停仿真（空格键）' : '继续仿真（空格键）';
});
recordBtn.addEventListener('click', () => {
  if (!recording) {
    recording = true;
    recordCycle = swingCount;
    pushExperimentRecord(engine.getState().theta, engine.getState().omega);
    renderRecords();
    recordBtn.textContent = '停止记录';
    recordBtn.style.background = 'linear-gradient(180deg, rgba(132,240,221,0.95), rgba(80,170,155,0.9))';
    return;
  }
  recording = false;
  recordBtn.textContent = '开始记录';
  recordBtn.style.background = '';
});
clearRecordBtn.addEventListener('click', () => {
  experimentRecords.length = 0;
  renderRecords();
});
exportCsvBtn.addEventListener('click', exportRecordsToCsv);
exportPdfBtn.addEventListener('click', openEditableReportOverlay);
restoreConversation();
renderAiMessages();

async function sendAiQuestion() {
  const text = aiInput.value.trim();
  if (!text || aiStreaming) return;
  if (getAiConfig().endpoint === '') {
    appendAiMessage('assistant', '系统', '未检测到 VITE_DASHSCOPE_API_KEY，请先在环境变量中配置 API Key。');
    setAiStatus('缺少 API Key');
    return;
  }
  saveAiConfig();
  appendAiMessage('user', '你', text);
  const assistantIndex = aiMessages.length;
  aiActiveAssistantIndex = assistantIndex;
  aiActiveUserText = text;
  aiActiveAssistantText = '';
  appendAiMessage('assistant', '模型', '');
  conversationHistory.push({ role: 'user', content: text });
  if (conversationHistory.length > 12) conversationHistory.splice(0, conversationHistory.length - 12);
  aiInput.value = '';
  aiSendBtn.disabled = true;
  aiSendBtn.textContent = '生成中...';
  aiStopBtn.disabled = false;
  setAiStatus('正在生成');
  let responseId = '';
  try {
    responseId = await callScnetChatStream(text, (partial) => {
      aiActiveAssistantText = partial;
      updateAiMessage(assistantIndex, partial);
    });
    const latestAssistant = aiMessages[assistantIndex]?.content ?? aiActiveAssistantText;
    conversationHistory.push({ role: 'assistant', content: latestAssistant });
    if (conversationHistory.length > 12) conversationHistory.splice(0, conversationHistory.length - 12);
    persistConversation(responseId || undefined);
    setAiStatus('已完成');
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      if (aiActiveAssistantText) {
        updateAiMessage(assistantIndex, aiActiveAssistantText);
      } else {
        aiMessages.splice(assistantIndex, 1);
        renderAiMessages();
      }
      setAiStatus('已停止');
    } else {
      const message = error instanceof Error ? error.message : '请求失败，请稍后再试。';
      aiMessages.splice(assistantIndex, 1);
      renderAiMessages();
      appendAiMessage('assistant', '系统', message);
      conversationHistory.pop();
      setAiStatus('请求失败');
    }
  } finally {
    aiStreaming = false;
    aiAbortController = null;
    aiActiveAssistantIndex = -1;
    aiActiveUserText = '';
    aiActiveAssistantText = '';
    aiStopBtn.disabled = true;
    aiSendBtn.disabled = false;
    aiSendBtn.textContent = '发送';
    aiInput.focus();
  }
}

aiSendBtn.addEventListener('click', () => {
  void sendAiQuestion();
});
aiInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    aiSendBtn.click();
  }
});
panelToggleBtn.addEventListener('click', () => {
  setPanelCollapsed(!panelCollapsed);
});
labToggleBtn.addEventListener('click', () => {
  setLabCollapsed(!labCollapsed);
});
calculateGBtn.addEventListener('click', () => {
  const totalTime = Number(totalTimeInput.value);
  if (Number.isFinite(totalTime) && totalTime > 0) {
    updateGravityResult(totalTime);
    calculateGBtn.textContent = '已计算';
    window.setTimeout(() => { calculateGBtn.textContent = '计算重力加速度'; }, 1200);
  } else {
    totalTimeInput.focus();
    totalTimeInput.setCustomValidity('请输入大于 0 的总时间');
    totalTimeInput.reportValidity();
    totalTimeInput.addEventListener('input', () => totalTimeInput.setCustomValidity(''), { once: true });
  }
});
analysisTabs.addEventListener('click', (event) => {
  const target = event.target as HTMLElement;
  const button = target.closest<HTMLButtonElement>('.mini-tab');
  if (!button?.dataset.panel) return;
  switchAnalysisPanel(button.dataset.panel as 'record' | 'energy' | 'phase');
});
document.querySelectorAll<HTMLButtonElement>('[data-ai-prompt]').forEach((button) => {
  button.addEventListener('click', () => {
    aiInput.value = button.dataset.aiPrompt ?? '';
    void sendAiQuestion();
  });
});
aiStopBtn.addEventListener('click', () => {
  if (aiAbortController) aiAbortController.abort();
});
setAiConfigStatus();
setVisualState('energy', true);
setVisualState('phase', true);
setVisualState('scene', true);
energyToggle.addEventListener('change', () => setVisualState('energy', energyToggle.checked));
phaseToggle.addEventListener('change', () => setVisualState('phase', phaseToggle.checked));
sceneToggle.addEventListener('change', () => setVisualState('scene', sceneToggle.checked));
modeGrid.addEventListener('click', (event) => {
  const target = event.target as HTMLElement;
  const card = target.closest<HTMLButtonElement>('.mode-card');
  if (!card?.dataset.mode) return;
  setMode(card.dataset.mode as PendulumMode);
});
useStopwatchBtn.addEventListener('click', fillStopwatchToLabInput);
stopwatchBtn.addEventListener('click', () => {
  if (stopwatchFinished) {
    resetStopwatch();
    stopwatchRunning = true;
    stopwatchStart = performance.now();
    stopwatchBtn.textContent = '暂停秒表';
    return;
  }
  if (!stopwatchRunning && stopwatchElapsed === 0) {
    stopwatchRunning = true;
    stopwatchStart = performance.now();
    stopwatchBtn.textContent = '暂停秒表';
    return;
  }
  stopwatchRunning = !stopwatchRunning;
  if (stopwatchRunning) {
    stopwatchStart = performance.now() - stopwatchElapsed;
    stopwatchBtn.textContent = '暂停秒表';
  } else {
    stopwatchElapsed = performance.now() - stopwatchStart;
    stopwatchBtn.textContent = '继续秒表';
  }
});
stopwatchResetBtn.addEventListener('click', resetStopwatch);
resetBtn.addEventListener('click', resetExperiment);
document.addEventListener('keydown', (event) => {
  const target = event.target as HTMLElement | null;
  if (target?.matches('input, textarea, select, [contenteditable="true"]')) return;
  if (event.key === ' ') {
    event.preventDefault();
    toggleBtn.click();
  } else if (event.key.toLowerCase() === 'r') {
    resetBtn.click();
  }
});

updateLightTheme(window.innerWidth * 0.5, window.innerHeight * 0.2);
updateLabels();
syncLabPreview();
resetEnergyTracking();
updateEnergyReadout(engine.getState().theta, engine.getState().omega);
updateStopwatchDisplay();
renderRecords();
seedAiConversation();
setAiConfigStatus();
switchAnalysisPanel('record');
requestAnimationFrame(loop);
