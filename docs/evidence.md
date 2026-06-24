# Evidence

本文档作为 `交易 Infra` 赛道的`可核查使用记录`材料，提供当前 demo 场景的样本输入、关键输出、风控结果和告警结果，方便评委直接核查。

## Evidence Type

本项目提供以下可核查证据：

- 样本输入 / 输出
- Demo 场景运行记录
- 可复现回放结果

相关仓库：

- Repository
  `https://github.com/Ly12346/agent-flight-recorder`

## Scenario 1 · normal-trade

### Input

- Tool: `sentiment-analyst`
  - symbol: `BTCUSDT`
- Tool: `technical-analysis`
  - symbol: `BTCUSDT`
  - timeframe: `1h`

### Key Output

- Sentiment:
  - fearGreedIndex: `44`
  - sentiment: `中性`
- Technical:
  - trend: `看多`
  - breakout: `true`

### Decision

- chosenHypothesis:
  `趋势延续概率较高`
- confidence:
  `0.74`

### Action

- actionType:
  `开仓`
- side:
  `做多`
- size:
  `0.2`
- leverage:
  `2`

### Expected Result

- trace status:
  `completed`
- policy hits:
  `0`
- alerts:
  `0`

## Scenario 2 · oversized-position

### Input

- Tool: `macro-news`
  - symbol: `BTCUSDT`
- Tool: `technical-analysis`
  - symbol: `BTCUSDT`
  - timeframe: `4h`

### Key Output

- News summary:
  `ETF 资金流叙事仍然偏正面。`
- Technical:
  - trend: `看多`
  - volatility: `高`

### Decision

- chosenHypothesis:
  `动量足以支持激进入场`
- confidence:
  `0.61`

### Action

- actionType:
  `开仓`
- side:
  `做多`
- size:
  `2.5`
- leverage:
  `7`

### Expected Result

- trace status:
  `blocked`
- policy hits:
  - `仓位上限`
  - `杠杆上限`
- alerts:
  - `仓位已拦截`
  - `杠杆限制触发`

## Scenario 3 · signal-conflict

### Input

- Tool: `sentiment-analyst`
  - symbol: `BTCUSDT`
- Tool: `technical-analysis`
  - symbol: `BTCUSDT`
  - timeframe: `1h`

### Key Output

- Sentiment:
  - fearGreedIndex: `22`
  - sentiment: `极度恐惧`
- Technical:
  - trend: `看多`
  - breakout: `true`

### Decision

- signalsSeen:
  - `极度恐惧`
  - `看多突破`
- conflictsDetected:
  - `情绪与技术面冲突`
- confidence:
  `0.51`

### Action

- actionType:
  `开仓`
- side:
  `做多`
- size:
  `0.4`
- leverage:
  `3`

### Expected Result

- trace status:
  `completed`
- policy hits:
  - `信号冲突审查`
  - `最低置信度`
- alerts:
  - `信号冲突审查`
  - `低置信度决策`

## Scenario 4 · stale-data

### Input

- Tool: `market-snapshot`
  - symbol: `BTCUSDT`
- Tool: `technical-analysis`
  - symbol: `BTCUSDT`
  - timeframe: `1h`

### Key Output

- Market snapshot:
  - price: `68120`
  - dataAgeMinutes: `47`
  - stale: `true`
- Technical:
  - trend: `看多`
  - snapshotAgeMinutes: `44`

### Decision

- chosenHypothesis:
  `趋势仍偏积极，但数据已经过期`
- confidence:
  `0.66`

### Action

- actionType:
  `开仓`
- side:
  `做多`
- size:
  `0.3`
- leverage:
  `2`

### Expected Result

- trace status:
  `blocked`
- policy hits:
  - `过期数据护栏`
- alerts:
  - `过期数据已拦截`

## Scenario 5 · revenge-trading

### Input

- Tool: `portfolio-state`
  - symbol: `BTCUSDT`
- Tool: `technical-analysis`
  - symbol: `BTCUSDT`
  - timeframe: `15m`

### Key Output

- Portfolio state:
  - recentLossStreak: `3`
  - pnl24h: `-1280`
  - cooldownActive: `true`
- Technical:
  - trend: `看多`
  - breakout: `true`
  - volatility: `高`

### Decision

- signalsSeen:
  - `近期连续亏损`
  - `报复性冲动`
  - `看多突破`
- conflictsDetected:
  - `冷静期违规`
- confidence:
  `0.57`

### Action

- actionType:
  `开仓`
- side:
  `做多`
- size:
  `0.5`
- leverage:
  `3`

### Expected Result

- trace status:
  `blocked`
- policy hits:
  - `信号冲突审查`
  - `冷静期违规`
- alerts:
  - `信号冲突审查`
  - `冷静期违规`

## How To Reproduce

```bash
cd /opt/homebrew/agent-flight-recorder
corepack pnpm install
corepack pnpm build
corepack pnpm --filter @afr/demo-sample-agent demo all
corepack pnpm --filter @afr/api demo
corepack pnpm --filter @afr/dashboard demo
```

## Verification Surface

评委可以通过以下方式核查：

- 仓库代码
- Demo 场景按钮
- Dashboard 回放结果
- `GET /replay/:traceId`
- `GET /incidents/:traceId/report`
- `GET /incidents/:traceId/adapters`
- `GET /analytics/anomalies`
