window.APP_CONFIG = {
  models: [
    {
      id: 'single',
      name: '单级决策问题',
      source: '例题 9-3 (车辆类型选择)',
      type: '单阶段风险型',
      desc: '只有一个层次的决策。在决策树模型中体现为只有一个决策节点。',
      summary: '某物流公司开通新线路，需选择大型卡车(A1)、中型卡车(A2)或租赁车辆(A3)。运营状态受市场需求和燃料价格影响。',
      params: [
        { key: 'payoff1', label: 'A1 最佳收益', value: 180, min: 100, max: 200, step: 10, desc: 'A1 在 T1 状态下的收益' }
      ],
      steps: [
        { t: '1. 画决策树', c: '从左至右画出决策节点（正方形），引出三个方案枝 A1, A2, A3。每个方案枝末端画状态节点（圆形），再引出四个状态枝 T1, T2, T3, T4，末端标记对应的益损值。' },
        { t: '2. 计算各方案期望值', c: '从右向左计算：<br>EV(A1) = 180×P(T1) + 90×P(T2) - 30×P(T3) - 60×P(T4)<br>EV(A2) = 120×P(T1) + 60×P(T2) + 20×P(T3) - 10×P(T4)<br>EV(A3) = 80×P(T1) + 30×P(T2) + 40×P(T3) + 10×P(T4)' },
        { t: '3. 比较、剪枝、决策', c: '比较各状态节点的期望值。因为目标是“收益最大化”，所以选取期望值最大的方案枝保留，其余画“//”符号予以剪枝。' }
      ],
      code: `# 单级决策树 Python 求解示例
def solve_single_level(p_t1, p_t2, p_t3, p_t4):
    # 各方案在不同状态下的益损值表
    payoffs = {
        'A1': [180, 90, -30, -60],
        'A2': [120, 60, 20, -10],
        'A3': [80, 30, 40, 10]
    }
    probs = [p_t1, p_t2, p_t3, p_t4]
    
    expected_values = {}
    for plan, values in payoffs.items():
        # 计算期望值: sum(收益 * 概率)
        ev = sum(v * p for v, p in zip(values, probs))
        expected_values[plan] = ev
        
    # 取最大值对应的方案
    best_plan = max(expected_values, key=expected_values.get)
    return best_plan, expected_values

# 运行教材默认概率
best, evs = solve_single_level(0.1, 0.5, 0.2, 0.2)
print(f"各方案期望值: {evs}")
print(f"最优方案: {best}")`
    },
    {
      id: 'multi',
      name: '多级决策问题',
      source: '例题 9-4 (修路天气延期)',
      type: '多阶段风险型',
      desc: '问题中有两个或两个以上层次的决策，需要从最末一级决策点开始逆向推导计算。',
      summary: '修筑公路前15天是否紧急加班(X1/X2)。若下雨延期，第二阶段是否再次紧急加班(Z1/Z2)。',
      params: [
        { key: 'cost_x1', label: 'X1 增加班费', value: 15000, min: 10000, max: 20000, step: 1000, desc: '第一阶段直接加班的固定成本' }
      ],
      steps: [
        { t: '1. 分阶段画树', c: '第一阶段决策点 X：X1(直接加班), X2(正常)。<br>X2 引出天气状态节点 Y(无雨/下雨)。<br>下雨状态引出第二阶段决策点 Z：Z1(紧急加班), Z2(正常)。' },
        { t: '2. 计算最末级期望 (节点 Z)', c: '对于 Z 点：<br>EV(Z1) = 0.5×(-30000) + 0.3×(-22500) + 0.2×(-15000) = -24750元<br>EV(Z2) = -25000元<br>比较后，节点 Z 取最优(损失最小)：-24750元 (选 Z1)' },
        { t: '3. 计算前一级期望 (节点 Y 与 X)', c: '对于状态节点 Y：<br>EV(Y) = P(无雨)×0 + P(下雨)×EV(Z) = 0.3×0 + 0.7×(-24750) = -17325元<br>对于起始决策点 X：<br>EV(X1) = -15000元, EV(X2) = EV(Y) = -17325元' },
        { t: '4. 最终决策', c: '因为目标是“经济损失最小化”(负值最大化)，-15000 > -17325，因此最终在起点选择 X1 (前15天加班突击)。' }
      ],
      code: `# 多阶段决策树 Python 逆向推导示例
def solve_multi_level(p_rain):
    p_no_rain = 1 - p_rain
    
    # ---------------- 阶段二 (节点 Z) ----------------
    # Z1 (紧急加班) 的预期损失
    ev_z1 = 0.5 * (-30000) + 0.3 * (-22500) + 0.2 * (-15000)
    # Z2 (正常施工) 的固定损失
    ev_z2 = -25000
    
    # Z节点决策: 取损失最小(数值最大)
    best_z_val = max(ev_z1, ev_z2) 
    
    # ---------------- 阶段一 (节点 Y 和 X) ----------------
    # Y节点状态期望值
    ev_y = p_no_rain * 0 + p_rain * best_z_val
    
    # X节点方案
    ev_x1 = -15000 # 直接加班
    ev_x2 = ev_y   # 正常施工
    
    # X节点决策
    if ev_x1 > ev_x2:
        return "选择 X1 (前15天突击加班)", ev_x1, ev_x2
    else:
        return "选择 X2 (正常施工)", ev_x1, ev_x2

decision, x1_cost, x2_cost = solve_multi_level(0.7)
print(f"X1期望损失: {x1_cost}, X2期望损失: {x2_cost}")
print(f"最终决策: {decision}")`
    }
  ]
};
