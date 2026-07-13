// product-config-algorithm-v2.js
// 基于《算法伪代码流程_第七轮修订版》完整实现
// 核心原则：算法推导全程全部按独栋处理，不考虑双拼转换

// ============================================================================
// 一、常量与工具函数
// ============================================================================

const TYPE_NAMES = {
  'light-steel': '轻钢厂房',
  'split': '分栋厂房',
  'layer': '分层厂房',
  'tower': '产业大厦',
  'support': '配套楼',
  'dorm': '配套宿舍'
};

function getProductName(id) {
  return TYPE_NAMES[id] || id;
}

function calcDensity(far) {
  if (far < 1.5) return 0.45;
  if (far < 2.0) return 0.42;
  return 0.40;
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function sum(arr) {
  return arr.reduce((a, b) => a + b, 0);
}

function uniqueSort(arr) {
  return [...new Set(arr)].sort((a, b) => a - b);
}

function computeUnitCap(type, floor, base) {
  if (type === 'light-steel') {
    return base * 2 + 200;
  }
  if (type === 'split' && floor === 3.5) {
    return base * 3.5;
  }
  return base * floor;
}

function computeTotalHeight(type, floor, standardHeight = 4.5) {
  if (type === 'light-steel') {
    return 13.2;
  }
  if (floor === 3.5) {
    // 3.5层建筑高度按4层计算（22.5m，已含女儿墙1.2m）
    return 22.5;
  }
  if (type === 'tower') {
    return 6.6 + standardHeight * (floor - 1) + 1.2;
  }
  if (type === 'dorm') {
    return 4.8 + 3.6 * (floor - 1) + 1.2;
  }
  if (floor === 1) {
    // split / layer / support 单层情况
    return 7.2 + 1.2;
  }
  // split / layer / support（N >= 2 时）
  return 7.2 + 5.1 + 4.5 * (floor - 2) + 1.2;
}

function createConfigs(type, floor, productOptions) {
  const areas = (productOptions[type] && productOptions[type].areas) || [];
  const configs = [];
  for (const area of areas) {
    const base = area;
    configs.push({
      id: type,
      type: getProductName(type),
      base,
      unitCap: computeUnitCap(type, floor, base),
      floors: floor,
      totalHeight: computeTotalHeight(type, floor)
    });
  }
  return configs;
}

// ============================================================================
// 二、输入验证
// ============================================================================

function validateInput(projectData, selectedProducts, productOptions) {
  const errors = [];

  // 基本参数校验
  if (projectData.landArea <= 0) errors.push('用地面积必须大于0');
  if (projectData.far <= 0) errors.push('容积率必须大于0');
  if (projectData.heightLimit <= 0) errors.push('限高必须大于0');
  if (projectData.ancillaryRatio < 0) errors.push('配套占比不能为负');
  if (projectData.rdRatio < 0) errors.push('科研办公占比不能为负');
  if (projectData.ancillaryRatio + projectData.rdRatio > 1) {
    errors.push('配套占比+科研占比不能超过1');
  }

  // 配套用房选择校验
  if (projectData.ancillaryRatio > 0) {
    if (!selectedProducts.has('dorm') && !selectedProducts.has('support')) {
      errors.push('配套用房未选择：R2>0时必须选择配套楼或配套宿舍');
    }

    const totalAncillary = projectData.landArea * projectData.far * projectData.ancillaryRatio;
    if (totalAncillary > 2400 && selectedProducts.has('support') && !selectedProducts.has('dorm')) {
      errors.push('配套用房面积未用尽，请勾选配套宿舍');
    }
  }

  // 厂房类型组合校验
  if (selectedProducts.has('layer') && selectedProducts.has('light-steel') && !selectedProducts.has('split')) {
    errors.push('未选择分栋厂房：选择分层厂房和轻钢厂房时必须选择分栋厂房');
  }

  // 层数类型数量校验
  if (selectedProducts.has('split') && productOptions['split']?.floors?.length > 2) {
    errors.push('分栋厂房层数类型超过2种');
  }
  if (selectedProducts.has('layer') && productOptions['layer']?.floors?.length > 2) {
    errors.push('分层厂房层数类型超过2种');
  }

  // 面积段选择校验
  for (const id of selectedProducts) {
    if (id === 'light-steel' || id === 'split' || id === 'layer' || id === 'tower' || id === 'support') {
      if (!productOptions[id] || !productOptions[id].areas || productOptions[id].areas.length === 0) {
        errors.push('请为「' + getProductName(id) + '」选择面积段');
      }
    }
    if (id === 'split' || id === 'layer') {
      if (!productOptions[id] || !productOptions[id].floors || productOptions[id].floors.length === 0) {
        errors.push('请为「' + getProductName(id) + '」选择层数');
      }
    }
  }

  return errors;
}

// ============================================================================
// 三、第零步：前置处理
// ============================================================================

function step0_preprocess(selectedProducts, productOptions, Hl) {
  let layerFloors = [];
  let splitFloors = [];
  let downgradedFloors = [];
  let layerDowngraded = false;
  const errors = [];

  // 0.1 分层厂房层数降级
  if (selectedProducts.has('layer')) {
    const originalLayerFloors = productOptions['layer'].floors || [];
    for (const floor of originalLayerFloors) {
      let currentFloor = floor;
      let totalH = computeTotalHeight('layer', currentFloor);

      while (totalH > Hl && currentFloor > 1) {
        currentFloor--;
        totalH = computeTotalHeight('layer', currentFloor);
      }

      if (totalH <= Hl) {
        if (currentFloor >= 5) {
          layerFloors.push(currentFloor);
          if (currentFloor < floor) layerDowngraded = true;
        } else if (currentFloor <= 4) {
          downgradedFloors.push(currentFloor);
        }
      } else {
        // currentFloor 已降到 1 层仍不满足限高
        errors.push('分层厂房层数=' + floor + '，即使降至1层仍超过限高' + Hl + 'm');
      }
    }

    if (layerFloors.length === 0) {
      selectedProducts.delete('layer');
    }
  }

  // 0.2 分栋厂房层数降级
  if (selectedProducts.has('split')) {
    const originalSplitFloors = productOptions['split'].floors || [];
    for (const floor of originalSplitFloors) {
      const totalH = computeTotalHeight('split', floor);
      if (totalH <= Hl) {
        splitFloors.push(floor);
      }
    }
    if (splitFloors.length === 0) {
      selectedProducts.delete('split');
    }
  }

  // 0.3 分层降级为分栋的合并处理
  if (downgradedFloors.length > 0) {
    selectedProducts.delete('layer');
    if (!selectedProducts.has('split')) {
      selectedProducts.add('split');
    }

    // 原始分层面积段直接合并到分栋（简化规则：不再还原双拼）
    const originalLayerAreas = (productOptions['layer'] && productOptions['layer'].areas) || [];
    const existingSplitAreas = (productOptions['split'] && productOptions['split'].areas) || [];
    const mergedAreas = uniqueSort([...existingSplitAreas, ...originalLayerAreas]);
    if (!productOptions['split']) {
      productOptions['split'] = { floors: [], areas: [] };
    }
    productOptions['split'].areas = mergedAreas;

    const convertedFloors = uniqueSort(downgradedFloors);
    const existingSplitFloors = productOptions['split'].floors || [];
    const mergedFloors = uniqueSort([...existingSplitFloors, ...convertedFloors]);
    productOptions['split'].floors = mergedFloors;
  }

  // 0.4 更新 productOptions 中的分层参数
  if (selectedProducts.has('layer') && layerFloors.length > 0) {
    productOptions['layer'].floors = layerFloors;
    // 面积段保持原始值，不转换
  }

  // 0.5 配套宿舍参考高度上限
  let referenceHeight = Hl;
  if (layerFloors.length > 0) {
    referenceHeight = Math.max(...layerFloors.map(f => computeTotalHeight('layer', f)));
  }
  // 注：若产业大厦存在，后续用 towerHeight 回填

  if (errors.length > 0) {
    return { error: errors.join('\n') };
  }

  return {
    selectedProducts,
    productOptions,
    layerFloors,
    splitFloors,
    referenceHeight,
    layerDowngraded
  };
}

// ============================================================================
// 四、步骤一：产业大厦
// ============================================================================

function step1_tower(selectedProducts, productOptions, targetRdArea, Hl) {
  const configs = [];
  let base = 0;
  let cap = 0;
  let towerHeight = 0;

  if (!selectedProducts.has('tower') || targetRdArea <= 0) {
    return { configs, base, cap, towerHeight };
  }

  // UI 已限制产业大厦面积段单选，areas[0] 即为用户选择值
  const areaRef = productOptions['tower'].areas[0];

  // 第一步：确定初始层数
  let floors = Math.max(3, Math.ceil(targetRdArea / areaRef));
  let standardHeight = 4.5;

  // 第二步：按默认标准层 4.5m 计算建筑高度
  let totalH = computeTotalHeight('tower', floors, standardHeight);

  // 第三步：超限后，先尝试降标准层到 4.2m
  if (totalH > Hl) {
    standardHeight = 4.2;
    totalH = computeTotalHeight('tower', floors, standardHeight);

    // 第四步：降标准层后仍超限，恢复 4.5m 并减层数
    if (totalH > Hl) {
      standardHeight = 4.5;
      floors = Math.max(3, Math.floor((Hl - 6.6 - 1.2) / standardHeight) + 1);
      totalH = computeTotalHeight('tower', floors, standardHeight);

      // 第五步：安全兜底
      if (totalH > Hl) {
        return { error: '限高不足，无法放置3层产业大厦' };
      }
    }
  }

  // 计算面积段
  let exactBase = targetRdArea / floors;
  let finalBase = Math.floor(exactBase / 50) * 50;
  let actualArea = finalBase * floors;

  if (Math.abs(actualArea - targetRdArea) / targetRdArea > 0.002) {
    finalBase = Math.floor(exactBase / 20) * 20;
    actualArea = finalBase * floors;
  }

  const paxLift = Math.max(1, Math.ceil(actualArea / 4000) - 2);

  configs.push({
    id: 'tower',
    type: '产业大厦',
    base: finalBase,
    unitCap: actualArea,
    floors,
    totalHeight: totalH,
    standardHeight,
    count: 1,
    elevator: paxLift + '客2货'
  });

  base = finalBase;
  cap = actualArea;
  towerHeight = totalH;

  return { configs, base, cap, towerHeight };
}

// ============================================================================
// 五、步骤二：配套用房
// ============================================================================

function buildSupport(supportCap) {
  let supportFloors;
  let totalH;
  let exactBase;

  if (supportCap < 1200) {
    supportFloors = 2;
    totalH = 12.9;
    exactBase = supportCap / 2;
  } else {
    supportFloors = 3;
    totalH = 18.0;  // 7.2 + 5.1 + 4.5 + 1.2
    exactBase = supportCap / 3;
  }

  // 第一次取整：50 的倍数
  let supportBase = Math.floor(exactBase / 50) * 50;
  let finalSupportCap = supportBase * supportFloors;

  // 第一次偏差检查
  if (Math.abs(finalSupportCap - supportCap) / supportCap > 0.002) {
    // 第二次取整：20 的倍数
    supportBase = Math.floor(exactBase / 20) * 20;
    finalSupportCap = supportBase * supportFloors;

    // 第二次偏差检查
    if (Math.abs(finalSupportCap - supportCap) / supportCap > 0.002) {
      // 第三次取整：10 的倍数
      supportBase = Math.floor(exactBase / 10) * 10;
      finalSupportCap = supportBase * supportFloors;
    }
  }

  return {
    config: {
      id: 'support',
      type: '配套楼',
      base: supportBase,
      unitCap: finalSupportCap,
      floors: supportFloors,
      totalHeight: totalH,
      count: 1
    },
    supportCap: finalSupportCap,
    supportBase
  };
}

function calc_dorm(dormCap, referenceHeight) {
  let estFloors = Math.max(2, Math.floor((referenceHeight - 4.8 - 1.2) / 3.6) + 1);
  let singleArea = dormCap / estFloors;

  let base;
  if (singleArea < 600) {
    base = 600;
  } else if (singleArea > 1200) {
    base = 1200;
  } else {
    base = Math.round(singleArea / 100) * 100;
  }

  let floors = Math.max(2, Math.ceil(dormCap / base));
  let totalH = computeTotalHeight('dorm', floors);

  if (totalH > referenceHeight) {
    totalH = 4.8 + 3.3 * (floors - 1) + 1.2;
    if (totalH > referenceHeight) {
      floors = Math.max(2, Math.floor((referenceHeight - 4.8 - 1.2) / 3.3) + 1);
      totalH = computeTotalHeight('dorm', floors);
    }
  }

  let exactBase = dormCap / floors;
  let finalBase = Math.floor(exactBase / 20) * 20;

  // 边界钳制：宿舍基底必须在 600-1200 之间
  finalBase = clamp(finalBase, 600, 1200);

  // 根据钳制后的 base 重新估算层数，尽量接近 dormCap，同时不超过参考高度
  floors = Math.max(2, Math.ceil(dormCap / finalBase));
  totalH = computeTotalHeight('dorm', floors);

  if (totalH > referenceHeight) {
    totalH = 4.8 + 3.3 * (floors - 1) + 1.2;
    if (totalH > referenceHeight) {
      floors = Math.max(2, Math.floor((referenceHeight - 4.8 - 1.2) / 3.3) + 1);
      totalH = computeTotalHeight('dorm', floors);
    }
  }

  const unitArea = finalBase * floors;

  return {
    config: {
      id: 'dorm',
      type: '配套宿舍',
      base: finalBase,
      unitCap: unitArea,
      floors,
      totalHeight: totalH,
      count: 1
    },
    base: finalBase,
    cap: unitArea
  };
}

function step2_ancillary(selectedProducts, productOptions, targetAncillaryArea, referenceHeight) {
  const configs = [];
  let base = 0;
  let cap = 0;

  if (!selectedProducts.has('dorm') && !selectedProducts.has('support')) {
    return { configs, base, cap };
  }

  const totalAncillary = targetAncillaryArea;

  // 情况1：totalAncillary <= 2400，用户仅选择配套楼
  if (totalAncillary <= 2400 && selectedProducts.has('support') && !selectedProducts.has('dorm')) {
    const supportResult = buildSupport(totalAncillary);
    configs.push(supportResult.config);
    base = supportResult.supportBase;
    cap = supportResult.supportCap;
  }
  // 情况2：totalAncillary <= 2400，用户同时选择配套楼和配套宿舍
  else if (totalAncillary <= 2400 && selectedProducts.has('support') && selectedProducts.has('dorm')) {
    const supportResult = buildSupport(totalAncillary);
    configs.push(supportResult.config);
    base = supportResult.supportBase;
    cap = supportResult.supportCap;
  }
  // 情况3：totalAncillary <= 2400，用户仅选择配套宿舍
  else if (totalAncillary <= 2400 && selectedProducts.has('dorm') && !selectedProducts.has('support')) {
    const dormResult = calc_dorm(totalAncillary, referenceHeight);
    configs.push(dormResult.config);
    base = dormResult.base;
    cap = dormResult.cap;
  }
  // 情况4：totalAncillary > 2400，用户仅选择配套宿舍
  else if (totalAncillary > 2400 && selectedProducts.has('dorm') && !selectedProducts.has('support')) {
    const dormResult = calc_dorm(totalAncillary, referenceHeight);
    configs.push(dormResult.config);
    base = dormResult.base;
    cap = dormResult.cap;
  }
  // 情况5：totalAncillary > 2400，用户同时选择配套楼和配套宿舍
  else if (totalAncillary > 2400 && selectedProducts.has('support') && selectedProducts.has('dorm')) {
    // 配套楼面积强制限定在 [1200, 2400]
    let supportCap;
    if (totalAncillary < 3600) {
      supportCap = 1200;
    } else {
      // totalAncillary >= 3600 时，使用用户选择的配套楼面积段，但钳制在 [1200, 2400]
      const userSupportArea = productOptions['support'].areas[0];
      supportCap = clamp(userSupportArea, 1200, 2400);
    }
    const supportResult = buildSupport(supportCap);
    configs.push(supportResult.config);
    base = supportResult.supportBase;
    cap = supportResult.supportCap;

    // 剩余给宿舍
    const dormCap = totalAncillary - supportResult.supportCap;
    if (dormCap > 0) {
      const dormResult = calc_dorm(dormCap, referenceHeight);
      configs.push(dormResult.config);
      base += dormResult.base;
      cap += dormResult.cap;
    }
  }

  return { configs, base, cap };
}

// ============================================================================
// 六、步骤三：厂房预处理
// ============================================================================

function factoryTypeEfficiency(t) {
  if (t.type === 'light-steel') return 2.1;
  return t.floors;
}

// FL 预处理：按 4/6/8 阈值分配固定栋数
// areas 需按从大到小传入
function allocateByFL(FL, areas) {
  const n = areas.length;
  const counts = new Array(n).fill(0);
  if (FL <= 4) {
    counts[0] = 1;
  } else if (FL <= 6) {
    for (let i = 0; i < n; i++) counts[i] = 1;
  } else if (FL <= 8) {
    for (let i = 0; i < n - 1; i++) counts[i] = 1;
    counts[n - 1] = 2;
  } else {
    for (let i = 0; i < n; i++) counts[i] = 2;
  }
  return counts;
}

function createFixedConfig(type, floor, base, count = 1) {
  return {
    id: type,
    type: getProductName(type),
    base,
    unitCap: computeUnitCap(type, floor, base),
    floors: floor,
    totalHeight: computeTotalHeight(type, floor),
    count,
    isFixed: true
  };
}

function buildTypeSideMap(bhConfigs, blConfigs) {
  const map = {};
  for (const c of bhConfigs) map[`${c.id}_${c.floors}`] = 'bh';
  for (const c of blConfigs) map[`${c.id}_${c.floors}`] = 'bl';
  return map;
}

function step3_factory_preprocess(selectedProducts, productOptions, layerFloors, splitFloors, targetBase, targetCap, fixedBase, fixedCap) {
  let fixedConfigs = [];
  let usedBase = 0;
  let usedCap = 0;

  const hasLightSteel = selectedProducts.has('light-steel');
  const hasSplit = selectedProducts.has('split');
  const hasLayer = selectedProducts.has('layer');

  let remainingCap = targetCap - fixedCap;

  // ============================================================
  // 情况一：分栋 + 轻钢组合 → 方案 B
  // ============================================================
  if (hasLightSteel && hasSplit) {
    // 有分层时，先固定 1 栋最低层数最小面积分层
    if (hasLayer && layerFloors.length > 0) {
      const minLayerFloor = Math.min(...layerFloors);
      const minLayerArea = Math.min(...productOptions['layer'].areas);
      const cfg = createFixedConfig('layer', minLayerFloor, minLayerArea, 1);
      fixedConfigs.push(cfg);
      usedBase += cfg.base;
      usedCap += cfg.unitCap;
      layerFloors = [];
      remainingCap -= cfg.unitCap;
    }

    // 方案 B：对较低层数分栋做手动分配（仅当有多种分栋层数时）
    if (splitFloors.length > 1) {
      const lowerFloor = Math.min(...splitFloors);
      const higherFloors = splitFloors.filter(f => f !== lowerFloor);
      const areas = [...productOptions['split'].areas].sort((a, b) => b - a);
      const maxArea = areas[0];
      const a = maxArea * lowerFloor;
      const FL = remainingCap / a;
      const counts = allocateByFL(FL, areas);
      for (let i = 0; i < areas.length; i++) {
        if (counts[i] > 0) {
          const cfg = createFixedConfig('split', lowerFloor, areas[i], counts[i]);
          fixedConfigs.push(cfg);
          usedBase += cfg.base * cfg.count;
          usedCap += cfg.unitCap * cfg.count;
          remainingCap -= cfg.unitCap * cfg.count;
        }
      }
      splitFloors = higherFloors;
    }

    const remainingBase = targetBase - fixedBase - usedBase;
    remainingCap = targetCap - fixedCap - usedCap;

    // B1：只剩轻钢
    if (splitFloors.length === 0) {
      const singleConfigs = createConfigs('light-steel', 2.1, productOptions);
      return {
        fixedConfigs,
        bhConfigs: [],
        blConfigs: [],
        singleConfigs,
        isSingleType: true,
        isCaseB: true,
        typeSideMap: {},
        remainingBase,
        remainingCap
      };
    }

    // B2：轻钢 + 较高层数分栋
    const higherFloor = splitFloors[0];
    const splitConfigs = createConfigs('split', higherFloor, productOptions);
    const lightSteelConfigs = createConfigs('light-steel', 2.1, productOptions);

    // 按实际平均效率决定哪一侧为 Bh/Bl
    const splitEff = splitConfigs.length
      ? splitConfigs.reduce((s, c) => s + c.unitCap / c.base, 0) / splitConfigs.length
      : higherFloor;
    const lightSteelEff = lightSteelConfigs.length
      ? lightSteelConfigs.reduce((s, c) => s + c.unitCap / c.base, 0) / lightSteelConfigs.length
      : 2.1;

    let bhConfigs, blConfigs;
    if (lightSteelEff > splitEff) {
      bhConfigs = lightSteelConfigs;
      blConfigs = splitConfigs;
    } else {
      bhConfigs = splitConfigs;
      blConfigs = lightSteelConfigs;
    }
    bhConfigs.forEach(c => { c.side = 'bh'; });
    blConfigs.forEach(c => { c.side = 'bl'; });

    return {
      fixedConfigs,
      bhConfigs,
      blConfigs,
      singleConfigs: [],
      isSingleType: false,
      isCaseB: true,
      isCaseB2: true,
      typeSideMap: buildTypeSideMap(bhConfigs, blConfigs),
      remainingBase,
      remainingCap
    };
  }

  // ============================================================
  // 情况二：四层分栋 + 六层分层（无轻钢）→ 方案 A
  // ============================================================
  if (hasSplit && hasLayer && !hasLightSteel) {
    if (splitFloors.length === 1 && splitFloors[0] === 4 &&
        layerFloors.length === 1 && layerFloors[0] === 6) {
      const bhConfigs = createConfigs('layer', 6, productOptions);
      bhConfigs.forEach(c => { c.side = 'bh'; });
      const blConfigs = createConfigs('split', 4, productOptions);
      blConfigs.forEach(c => { c.side = 'bl'; });

      return {
        fixedConfigs,
        bhConfigs,
        blConfigs,
        singleConfigs: [],
        isSingleType: false,
        isCaseA: true,
        typeSideMap: buildTypeSideMap(bhConfigs, blConfigs),
        remainingBase: targetBase - fixedBase,
        remainingCap: targetCap - fixedCap
      };
    }
  }

  // ============================================================
  // 情况三：通用 FL 预处理（不含轻钢）
  // ============================================================
  let totalLayerTypes = splitFloors.length + layerFloors.length;

  while (totalLayerTypes > 2) {
    let preprocessType;
    let preprocessFloors;
    if (layerFloors.length > 1) {
      preprocessType = 'layer';
      preprocessFloors = layerFloors;
    } else if (splitFloors.length > 1) {
      preprocessType = 'split';
      preprocessFloors = splitFloors;
    } else {
      break;
    }

    const maxFloor = Math.max(...preprocessFloors);
    const areas = [...productOptions[preprocessType].areas].sort((a, b) => b - a);
    const maxArea = areas[0];
    const a = maxArea * maxFloor;
    const FL = preprocessType === 'layer' ? remainingCap / a / 2 : remainingCap / a;
    const counts = allocateByFL(FL, areas);

    for (let i = 0; i < areas.length; i++) {
      if (counts[i] > 0) {
        const cfg = createFixedConfig(preprocessType, maxFloor, areas[i], counts[i]);
        fixedConfigs.push(cfg);
        usedBase += cfg.base * cfg.count;
        usedCap += cfg.unitCap * cfg.count;
        remainingCap -= cfg.unitCap * cfg.count;
      }
    }

    preprocessFloors = preprocessFloors.filter(f => f !== maxFloor);
    if (preprocessType === 'layer') {
      layerFloors = preprocessFloors;
    } else {
      splitFloors = preprocessFloors;
    }

    totalLayerTypes = splitFloors.length + layerFloors.length;
  }

  const remainingBase = targetBase - fixedBase - usedBase;
  remainingCap = targetCap - fixedCap - usedCap;

  // ============================================================
  // 剩余类型创建 Bh/Bl 或单一层数
  // ============================================================
  let bhConfigs = [];
  let blConfigs = [];
  const typeSideMap = {};

  const allTypes = [];
  if (hasSplit && splitFloors.length > 0) {
    for (const floor of splitFloors) {
      allTypes.push({ type: 'split', floors: floor });
    }
  }
  if (hasLayer && layerFloors.length > 0) {
    for (const floor of layerFloors) {
      allTypes.push({ type: 'layer', floors: floor });
    }
  }
  // 只剩轻钢时，把轻钢加入 allTypes 走单一层数流程
  if (allTypes.length === 0 && hasLightSteel) {
    allTypes.push({ type: 'light-steel', floors: 2.1 });
  }

  if (allTypes.length === 0) {
    return {
      fixedConfigs,
      bhConfigs: [],
      blConfigs: [],
      singleConfigs: [],
      isSingleType: true,
      typeSideMap,
      remainingBase,
      remainingCap
    };
  }

  if (allTypes.length === 1) {
    const t = allTypes[0];
    const singleConfigs = createConfigs(t.type, t.floors, productOptions);
    singleConfigs.forEach(c => { c.side = 'bh'; });
    typeSideMap[`${t.type}_${t.floors}`] = 'bh';
    return {
      fixedConfigs,
      bhConfigs: [],
      blConfigs: [],
      singleConfigs,
      isSingleType: true,
      typeSideMap,
      remainingBase,
      remainingCap
    };
  }

  // allTypes.length === 2
  const t1 = allTypes[0];
  const t2 = allTypes[1];
  const eff1 = factoryTypeEfficiency(t1);
  const eff2 = factoryTypeEfficiency(t2);

  if (eff1 >= eff2) {
    bhConfigs = createConfigs(t1.type, t1.floors, productOptions);
    blConfigs = createConfigs(t2.type, t2.floors, productOptions);
    typeSideMap[`${t1.type}_${t1.floors}`] = 'bh';
    typeSideMap[`${t2.type}_${t2.floors}`] = 'bl';
  } else {
    bhConfigs = createConfigs(t2.type, t2.floors, productOptions);
    blConfigs = createConfigs(t1.type, t1.floors, productOptions);
    typeSideMap[`${t2.type}_${t2.floors}`] = 'bh';
    typeSideMap[`${t1.type}_${t1.floors}`] = 'bl';
  }
  bhConfigs.forEach(c => { c.side = 'bh'; });
  blConfigs.forEach(c => { c.side = 'bl'; });

  return {
    fixedConfigs,
    bhConfigs,
    blConfigs,
    singleConfigs: [],
    isSingleType: false,
    typeSideMap,
    remainingBase,
    remainingCap
  };
}

function adjustFixedConfigs(factoryResult, targetBase, targetCap, fixedBase, fixedCap) {
  const fixedConfigs = factoryResult.fixedConfigs;
  let usedBase = sum(fixedConfigs.map(c => c.base * c.count));
  let usedCap = sum(fixedConfigs.map(c => c.unitCap * c.count));

  for (let i = fixedConfigs.length - 1; i >= 0; i--) {
    if (fixedConfigs[i].isFixed) {
      usedBase -= fixedConfigs[i].base * fixedConfigs[i].count;
      usedCap -= fixedConfigs[i].unitCap * fixedConfigs[i].count;
      fixedConfigs.splice(i, 1);
      const remainingBase = targetBase - fixedBase - usedBase;
      const remainingCap = targetCap - fixedCap - usedCap;
      if (remainingBase > 0 && remainingCap > 0) {
        return {
          fixedConfigs,
          bhConfigs: factoryResult.bhConfigs,
          blConfigs: factoryResult.blConfigs,
          typeSideMap: factoryResult.typeSideMap,
          remainingBase,
          remainingCap
        };
      }
    }
  }

  return null;
}

// ============================================================================
// 七、步骤四：Bh/Bl 核心算法
// ============================================================================

function solveIntegerEquation(targetCap, configs, targetBaseLimit) {
  const hasBaseLimit = targetBaseLimit != null && targetBaseLimit > 0 && targetBaseLimit !== Infinity;
  const realTargetBase = hasBaseLimit ? targetBaseLimit / 1.05 : 0;
  const k = configs.length;

  if (k === 0 || targetCap <= 0) {
    return { counts: configs.map(() => 0), totalCap: 0, totalBase: 0 };
  }

  if (k === 1) {
    const c = configs[0];
    let n = Math.max(1, Math.round(targetCap / c.unitCap));
    let bestN = n;
    let bestScore = Infinity;
    const searchRange = Math.max(50, Math.floor(n * 0.5));
    const startN = Math.max(1, n - searchRange);
    const endN = n + searchRange;
    for (let testN = startN; testN <= endN; testN++) {
      const testCap = c.unitCap * testN;
      const testBase = c.base * testN;
      if (hasBaseLimit && testBase > targetBaseLimit * 1.05) continue;
      const score = Math.abs(testCap - targetCap) + Math.abs(testBase - realTargetBase) * 2;
      if (score < bestScore) {
        bestScore = score;
        bestN = testN;
      }
    }
    return {
      counts: [bestN],
      totalCap: c.unitCap * bestN,
      totalBase: c.base * bestN
    };
  }

  function getSearchRange(targetVal, unitVal) {
    const estN = Math.max(0, Math.round(targetVal / unitVal));
    if (estN <= 3) return 6;
    if (estN <= 10) return 12;
    if (estN <= 30) return 25;
    if (estN <= 100) return 50;
    return 80;
  }

  let best = null;
  let bestScore = Infinity;
  const capLimitMul = hasBaseLimit ? 1.5 : 2.0;
  const baseLimitMul = hasBaseLimit ? 1.5 : 2.0;

  function dfs(idx, current, currentCap, currentBase) {
    if (idx === k - 1) {
      const c = configs[idx];
      const n = Math.max(0, Math.round((targetCap - currentCap) / c.unitCap));
      const range = getSearchRange(targetCap - currentCap, c.unitCap);
      for (let dn = -range; dn <= range; dn++) {
        const nn = Math.max(0, n + dn);
        const tc = currentCap + c.unitCap * nn;
        const tb = currentBase + c.base * nn;
        if (hasBaseLimit && tb > targetBaseLimit * 1.05) continue;
        if (hasBaseLimit && currentBase > targetBaseLimit * baseLimitMul) return;
        if (currentCap > targetCap * capLimitMul) return;

        const capDiff = Math.abs(tc - targetCap);
        const baseDiff = hasBaseLimit ? Math.abs(tb - realTargetBase) : 0;
        const allCounts = [...current, nn];
        const nonZeroCount = allCounts.filter(x => x > 0).length;
        const penalty = (k >= 2 && nonZeroCount < 2) ? 50000 : 0;
        const score = capDiff + baseDiff * 2 + penalty;

        if (score < bestScore) {
          bestScore = score;
          best = allCounts;
        }
      }
      return;
    }

    const c = configs[idx];
    const n = Math.max(0, Math.round((targetCap - currentCap) / c.unitCap));
    const range = getSearchRange(targetCap - currentCap, c.unitCap);
    for (let dn = -range; dn <= range; dn++) {
      const nn = Math.max(0, n + dn);
      const nextBase = currentBase + c.base * nn;
      const nextCap = currentCap + c.unitCap * nn;
      if (hasBaseLimit && nextBase > targetBaseLimit * baseLimitMul) continue;
      if (nextCap > targetCap * capLimitMul) continue;
      dfs(idx + 1, [...current, nn], nextCap, nextBase);
    }
  }

  dfs(0, [], 0, 0);

  if (!best) {
    // fallback：用最小面积段
    const sortedConfigs = [...configs].sort((a, b) => a.base - b.base);
    const minBase = sortedConfigs[0].base;
    const maxN = hasBaseLimit ? Math.floor(targetBaseLimit * 1.05 / minBase) : 200;
    if (maxN <= 0) {
      // 即使密度可能超限，也保证至少 2 栋最小面积段
      const result = configs.map(() => 0);
      const minIdx = configs.findIndex(c => c === sortedConfigs[0]);
      result[minIdx] = 2;
      return {
        counts: result,
        totalCap: sortedConfigs[0].unitCap * 2,
        totalBase: sortedConfigs[0].base * 2
      };
    }

    let bestN = Math.max(1, Math.min(maxN, Math.round(targetCap / sortedConfigs[0].unitCap)));
    let bestScore = Infinity;
    for (let n = 1; n <= maxN; n++) {
      const tc = sortedConfigs[0].unitCap * n;
      const tb = sortedConfigs[0].base * n;
      const score = Math.abs(tc - targetCap) + Math.abs(tb - realTargetBase) * 2;
      if (score < bestScore) {
        bestScore = score;
        bestN = n;
      }
    }

    const result = configs.map(() => 0);
    const minIdx = configs.findIndex(c => c === sortedConfigs[0]);
    result[minIdx] = bestN;
    return {
      counts: result,
      totalCap: sortedConfigs[0].unitCap * bestN,
      totalBase: sortedConfigs[0].base * bestN
    };
  }

  const totalCap = best.reduce((s, cnt, i) => s + configs[i].unitCap * cnt, 0);
  const totalBase = best.reduce((s, cnt, i) => s + configs[i].base * cnt, 0);
  return { counts: best, totalCap, totalBase };
}

function solveSingleType(configs, targetCap, targetBase) {
  const result = solveIntegerEquation(targetCap, configs, targetBase * 1.05);
  return result.counts;
}

// 单一层数流程：忽略建筑密度，优先满足容积率
function step4_single_layer(configs, remainingCap, remainingBase) {
  // targetBaseLimit 传 Infinity，让 solveIntegerEquation 只优化容积率
  const result = solveIntegerEquation(remainingCap, configs, Infinity);
  return {
    counts: result.counts,
    configs: configs,
    isSingleType: true,
    typeSideMap: { [`${configs[0].id}_${configs[0].floors}`]: 'bh' }
  };
}

function step4_core_algorithm(bhConfigs, blConfigs, remainingBase, remainingCap) {
  if (bhConfigs.length === 0 && blConfigs.length === 0) {
    return { counts: [], bhConfigs, blConfigs, isSingleType: true, typeSideMap: {} };
  }

  if (bhConfigs.length === 0) {
    const counts = solveSingleType(blConfigs, remainingCap, remainingBase);
    return {
      counts,
      bhConfigs: [],
      blConfigs,
      isSingleType: true,
      typeSideMap: { [blConfigs[0].id]: 'bl' }
    };
  }

  if (blConfigs.length === 0) {
    const counts = solveSingleType(bhConfigs, remainingCap, remainingBase);
    return {
      counts,
      bhConfigs,
      blConfigs: [],
      isSingleType: true,
      typeSideMap: { [bhConfigs[0].id]: 'bh' }
    };
  }

  const effBh = bhConfigs.reduce((s, c) => s + c.unitCap / c.base, 0) / bhConfigs.length;
  const effBl = blConfigs.reduce((s, c) => s + c.unitCap / c.base, 0) / blConfigs.length;
  const avgEff = remainingCap / remainingBase;
  const EPS = 1e-9;

  let targetCapBh, targetCapBl, targetBaseBh, targetBaseBl;
  if (avgEff > effBl + EPS && avgEff < effBh - EPS) {
    const x = (remainingCap - effBl * remainingBase) / (effBh - effBl);
    const y = remainingBase - x;
    targetCapBh = effBh * x;
    targetCapBl = effBl * y;
    targetBaseBh = x;
    targetBaseBl = y;
  } else if (avgEff >= effBh - EPS) {
    targetCapBh = remainingCap;
    targetCapBl = 0;
    targetBaseBh = remainingBase;
    targetBaseBl = 0;
  } else if (avgEff <= effBl + EPS) {
    targetCapBh = 0;
    targetCapBl = remainingCap;
    targetBaseBh = 0;
    targetBaseBl = remainingBase;
  } else {
    const x = remainingBase / 2;
    const y = remainingBase / 2;
    targetCapBh = effBh * x;
    targetCapBl = effBl * y;
    targetBaseBh = x;
    targetBaseBl = y;
  }

  const bhResult = solveIntegerEquation(targetCapBh, bhConfigs, targetBaseBh * 1.05);
  const blResult = solveIntegerEquation(targetCapBl, blConfigs, targetBaseBl * 1.05);

  let finalCounts = [...bhResult.counts, ...blResult.counts];
  const bhCount = sum(finalCounts.slice(0, bhConfigs.length));
  const blCount = sum(finalCounts.slice(bhConfigs.length));

  const typeSideMap = {};
  for (const c of bhConfigs) typeSideMap[`${c.id}_${c.floors}`] = 'bh';
  for (const c of blConfigs) typeSideMap[`${c.id}_${c.floors}`] = 'bl';

  let activeBhConfigs = bhConfigs;
  let activeBlConfigs = blConfigs;
  let isSingleType = false;

  if (bhCount === 0 && blCount > 0) {
    finalCounts = solveSingleType(blConfigs, remainingCap, remainingBase);
    activeBhConfigs = [];
    activeBlConfigs = blConfigs;
    isSingleType = true;
    for (const c of bhConfigs) delete typeSideMap[`${c.id}_${c.floors}`];
  } else if (blCount === 0 && bhCount > 0) {
    finalCounts = solveSingleType(bhConfigs, remainingCap, remainingBase);
    activeBhConfigs = bhConfigs;
    activeBlConfigs = [];
    isSingleType = true;
    for (const c of blConfigs) delete typeSideMap[`${c.id}_${c.floors}`];
  } else {
    activeBhConfigs = bhConfigs;
    activeBlConfigs = blConfigs;
    isSingleType = false;
  }

  return {
    counts: finalCounts,
    bhConfigs: activeBhConfigs,
    blConfigs: activeBlConfigs,
    isSingleType,
    typeSideMap
  };
}

function runNormalBhBl(bhConfigs, blConfigs, remainingBase, remainingCap, adjustedD) {
  const effBh = bhConfigs.reduce((s, c) => s + c.unitCap / c.base, 0) / bhConfigs.length;
  const effBl = blConfigs.reduce((s, c) => s + c.unitCap / c.base, 0) / blConfigs.length;

  const x = (remainingCap - effBl * remainingBase) / (effBh - effBl);
  const y = remainingBase - x;
  const targetCapBh = effBh * x;
  const targetCapBl = effBl * y;
  const targetBaseBh = x;
  const targetBaseBl = y;

  const bhResult = solveIntegerEquation(targetCapBh, bhConfigs, targetBaseBh * 1.05);
  const blResult = solveIntegerEquation(targetCapBl, blConfigs, targetBaseBl * 1.05);

  const finalCounts = [...bhResult.counts, ...blResult.counts];
  const typeSideMap = buildTypeSideMap(bhConfigs, blConfigs);

  return {
    counts: finalCounts,
    bhConfigs,
    blConfigs,
    isSingleType: false,
    typeSideMap,
    adjustedD
  };
}

// 方案 A / 方案 B2：不同产品类型时的 Bh/Bl，带密度调整
function step4_core_algorithm_with_adjustment(bhConfigs, blConfigs, remainingBase, remainingCap, projectData, D, warnings) {
  if (bhConfigs.length === 0 && blConfigs.length === 0) {
    return { counts: [], bhConfigs, blConfigs, isSingleType: true, typeSideMap: {}, adjustedD: null };
  }

  if (bhConfigs.length === 0) {
    const counts = solveSingleType(blConfigs, remainingCap, remainingBase);
    return {
      counts,
      bhConfigs: [],
      blConfigs,
      isSingleType: true,
      typeSideMap: buildTypeSideMap([], blConfigs),
      adjustedD: null
    };
  }

  if (blConfigs.length === 0) {
    const counts = solveSingleType(bhConfigs, remainingCap, remainingBase);
    return {
      counts,
      bhConfigs,
      blConfigs: [],
      isSingleType: true,
      typeSideMap: buildTypeSideMap(bhConfigs, []),
      adjustedD: null
    };
  }

  const S = projectData.landArea;
  const effBh = bhConfigs.reduce((s, c) => s + c.unitCap / c.base, 0) / bhConfigs.length;
  const effBl = blConfigs.reduce((s, c) => s + c.unitCap / c.base, 0) / blConfigs.length;
  const avgEff = remainingCap / remainingBase;
  const EPS = 1e-9;

  // 正常范围
  if (avgEff > effBl + EPS && avgEff < effBh - EPS) {
    return runNormalBhBl(bhConfigs, blConfigs, remainingBase, remainingCap, D);
  }

  // avgEff 低于 Bl：降低密度 D 以提高 avgEff
  if (avgEff <= effBl + EPS) {
    const adjustedD = D * 0.95;
    // remainingBase 已包含 fixedBase 和固定厂房的影响，按密度变化比例调整
    const newRemainingBase = remainingBase + S * (adjustedD - D);
    const newAvgEff = remainingCap / newRemainingBase;

    if (newAvgEff > effBl + EPS && newAvgEff < effBh - EPS) {
      return runNormalBhBl(bhConfigs, blConfigs, newRemainingBase, remainingCap, adjustedD);
    }

    // 仍不满足，抛弃 Bh，Bl 走单一层数
    warnings.push('产品选择与容积率不匹配');
    const counts = solveSingleType(blConfigs, remainingCap, newRemainingBase);
    return {
      counts,
      bhConfigs: [],
      blConfigs,
      isSingleType: true,
      typeSideMap: buildTypeSideMap([], blConfigs),
      adjustedD,
      discardedType: `${bhConfigs[0].id}_${bhConfigs[0].floors}`
    };
  }

  // avgEff 高于 Bh：提高密度 D 以降低 avgEff
  if (avgEff >= effBh - EPS) {
    const adjustedD = D * 1.05;
    const newRemainingBase = remainingBase + S * (adjustedD - D);
    const newAvgEff = remainingCap / newRemainingBase;

    if (newAvgEff > effBl + EPS && newAvgEff < effBh - EPS) {
      return runNormalBhBl(bhConfigs, blConfigs, newRemainingBase, remainingCap, adjustedD);
    }

    // 仍不满足，抛弃 Bl，Bh 走单一层数
    warnings.push('产品选择与容积率不匹配');
    const counts = solveSingleType(bhConfigs, remainingCap, newRemainingBase);
    return {
      counts,
      bhConfigs,
      blConfigs: [],
      isSingleType: true,
      typeSideMap: buildTypeSideMap(bhConfigs, []),
      adjustedD,
      discardedType: `${blConfigs[0].id}_${blConfigs[0].floors}`
    };
  }

  // 兜底
  return runNormalBhBl(bhConfigs, blConfigs, remainingBase, remainingCap, D);
}

// ============================================================================
// 八、步骤五：外层循环
// ============================================================================

function calcTotals(counts, bhConfigs, blConfigs, fixedFactoryConfigs) {
  let base = 0;
  let cap = 0;
  for (const c of fixedFactoryConfigs) {
    base += c.base * c.count;
    cap += c.unitCap * c.count;
  }
  const allConfigs = [...bhConfigs, ...blConfigs];
  for (let i = 0; i < counts.length; i++) {
    if (allConfigs[i] && counts[i] > 0) {
      base += allConfigs[i].base * counts[i];
      cap += allConfigs[i].unitCap * counts[i];
    }
  }
  return { base, cap };
}

function checkDistribution(counts, configs) {
  // 按 id + floors 分组，同产品同层数才参与分布判断
  const groups = {};

  for (let i = 0; i < configs.length; i++) {
    if (counts[i] > 0) {
      const id = configs[i].id;
      if (!['light-steel', 'split', 'layer'].includes(id)) continue;
      const key = `${id}_${configs[i].floors}`;
      if (!groups[key]) {
        groups[key] = { id, floor: configs[i].floors, indices: [], totalCount: 0 };
      }
      groups[key].indices.push(i);
      groups[key].totalCount += counts[i];
    }
  }

  for (const key of Object.keys(groups)) {
    const group = groups[key];
    if (group.totalCount < 5) continue;
    if (group.indices.length < 2) continue; // 至少两个面积段才存在分布不均
    for (const idx of group.indices) {
      const areaCount = counts[idx];
      const rest = group.totalCount - areaCount;
      if (areaCount > rest * 2) {
        return {
          needsOptimization: true,
          type: group.id,
          a: Math.min(...group.indices.map(i => configs[i].base)),
          b: Math.max(...group.indices.map(i => configs[i].base)),
          floor: group.floor
        };
      }
    }
  }

  // 返回总数最多的一组的边界信息，供 manualDistribute 备用
  let dominantKey = null;
  let dominantCount = 0;
  for (const key of Object.keys(groups)) {
    if (groups[key].totalCount > dominantCount) {
      dominantCount = groups[key].totalCount;
      dominantKey = key;
    }
  }

  if (dominantKey && groups[dominantKey].indices.length > 0) {
    const dGroup = groups[dominantKey];
    return {
      needsOptimization: false,
      type: dGroup.id,
      a: Math.min(...dGroup.indices.map(i => configs[i].base)),
      b: Math.max(...dGroup.indices.map(i => configs[i].base)),
      floor: dGroup.floor
    };
  }

  return { needsOptimization: false, type: null, a: null, b: null, floor: null };
}

// 强制重新平衡分布：将触发组中最大面积段的栋数转移到最小面积段
function rebalanceDistribution(counts, configs) {
  let changed = true;
  let currentCounts = [...counts];

  while (changed) {
    changed = false;
    const groups = {};
    for (let i = 0; i < configs.length; i++) {
      if (currentCounts[i] > 0) {
        const id = configs[i].id;
        if (!['light-steel', 'split', 'layer'].includes(id)) continue;
        const key = `${id}_${configs[i].floors}`;
        if (!groups[key]) {
          groups[key] = { id, floor: configs[i].floors, indices: [] };
        }
        groups[key].indices.push(i);
      }
    }

    for (const key of Object.keys(groups)) {
      const group = groups[key];
      if (group.indices.length < 2) continue;
      const totalCount = group.indices.reduce((s, i) => s + currentCounts[i], 0);
      if (totalCount < 5) continue;

      group.indices.sort((i, j) => configs[i].base - configs[j].base);
      const minIdx = group.indices[0];
      const maxIdx = group.indices[group.indices.length - 1];

      const maxCount = currentCounts[maxIdx];
      const rest = totalCount - maxCount;
      if (maxCount > rest * 2 && maxCount > 0 && currentCounts[maxIdx] > 1) {
        currentCounts[maxIdx]--;
        currentCounts[minIdx]++;
        changed = true;
      }
    }
  }

  return currentCounts;
}

function isMultipleOf(v, m) {
  return Math.abs(Math.round(v / m) * m - v) < 1e-9;
}

function roundUpTo(v, m) {
  if (isMultipleOf(v, m)) return Math.round(v);
  return Math.ceil(v / m) * m;
}

function manualDistribute(type, floor, S, a, b, precision = 10) {
  if (S < b) {
    const base = roundUpTo(S, precision);
    return [{ base, count: 1, unitCap: computeUnitCap(type, floor, base) }];
  }

  const refCount = Math.ceil(S * 2 / (a + b));

  if (refCount <= 3) {
    const unifiedBase = roundUpTo(S / refCount, precision);
    return [{ base: unifiedBase, count: refCount, unitCap: computeUnitCap(type, floor, unifiedBase) }];
  }

  // 根据总栋数选择分支参数
  let k; // bb = k, aa = ceil(2N/3) - k
  if (refCount <= 6) {
    k = 1;
  } else if (refCount <= 11) {
    k = 2;
  } else if (refCount <= 20) {
    k = 3;
  } else if (refCount <= 32) {
    k = 4;
  } else if (refCount <= 47) {
    k = 5;
  } else {
    k = 6;
  }

  let aa = Math.max(1, Math.ceil(refCount * 2 / 3) - k);
  let bb = k;
  let cc = refCount - aa - bb;

  if (cc <= 0) {
    // 栋数不足以分三种面积段，退化为统一面积段
    const unifiedBase = roundUpTo(S / refCount, precision);
    return [{ base: unifiedBase, count: refCount, unitCap: computeUnitCap(type, floor, unifiedBase) }];
  }

  const S1 = a * aa + b * bb;
  const remaining = S - S1;

  if (remaining <= 0) {
    // 极端情况，用两种面积段兜底
    return [
      { base: a, count: aa, unitCap: computeUnitCap(type, floor, a) },
      { base: b, count: bb, unitCap: computeUnitCap(type, floor, b) }
    ];
  }

  const cRaw = remaining / cc;
  let c = roundUpTo(cRaw, precision);
  c = clamp(c, a, b);

  // 如果中间面积段被压缩到与边界相同，说明 a/b 间距不足以分出三种面积段
  // 退化为两种面积段，并尽量均匀分配以避免分布不均
  if (c === a || c === b || Math.abs(c - a) < 20 || Math.abs(c - b) < 20) {
    // 优先让 aa 和 bb 接近，避免某一种占绝对多数
    const half = Math.floor(refCount / 2);
    const otherHalf = refCount - half;
    // 根据面积段大小分配：较小面积段给较多栋数，但不超过另一段的2倍
    const useAAsMajor = a < b;
    let aa2, bb2;
    if (useAAsMajor) {
      aa2 = Math.max(half, otherHalf);
      bb2 = Math.min(half, otherHalf);
    } else {
      aa2 = Math.min(half, otherHalf);
      bb2 = Math.max(half, otherHalf);
    }
    // 校验：如果 aa2 > 2*bb2 且可以调整，减少 aa2
    while (aa2 > bb2 * 2 && aa2 > bb2 + 1) {
      aa2--;
      bb2++;
    }
    return [
      { base: a, count: aa2, unitCap: computeUnitCap(type, floor, a) },
      { base: b, count: bb2, unitCap: computeUnitCap(type, floor, b) }
    ];
  }

  return [
    { base: a, count: aa, unitCap: computeUnitCap(type, floor, a) },
    { base: c, count: cc, unitCap: computeUnitCap(type, floor, c) },
    { base: b, count: bb, unitCap: computeUnitCap(type, floor, b) }
  ];
}

function mapOptimizedToCounts(optimized, counts, bhConfigs, blConfigs, type, typeSideMap, floor = null) {
  let allConfigs = [...bhConfigs, ...blConfigs];

  // 找到 type 对应的索引范围；若指定 floor，则只匹配同层数
  let typeIndices = [];
  for (let i = 0; i < allConfigs.length; i++) {
    if (allConfigs[i].id === type && (floor == null || allConfigs[i].floors === floor)) {
      typeIndices.push(i);
    }
  }

  // 清空原有 counts
  for (const i of typeIndices) counts[i] = 0;

  for (const opt of optimized) {
    // 优先查找完全匹配的 base
    let matchIdx = -1;
    for (const i of typeIndices) {
      if (allConfigs[i].base === opt.base) {
        matchIdx = i;
        break;
      }
    }

    if (matchIdx >= 0) {
      counts[matchIdx] += opt.count;
    } else {
      // 不存在则新增配置
      const refConfig = allConfigs[typeIndices[0]];
      const useFloor = floor != null ? floor : refConfig.floors;
      const totalHeight = refConfig.totalHeight;
      const side = typeSideMap[`${type}_${useFloor}`] || refConfig.side || 'bh';
      const newConfig = {
        id: type,
        type: getProductName(type),
        base: opt.base,
        unitCap: opt.unitCap,
        floors: useFloor,
        totalHeight: totalHeight,
        side
      };

      if (side === 'bh') {
        const insertIdx = bhConfigs.length;
        bhConfigs.push(newConfig);
        counts.splice(insertIdx, 0, opt.count);
      } else {
        blConfigs.push(newConfig);
        counts.push(opt.count);
      }

      // 更新 allConfigs 与 typeIndices，供后续 opt 继续匹配
      allConfigs = [...bhConfigs, ...blConfigs];
      typeIndices = [];
      for (let i = 0; i < allConfigs.length; i++) {
        if (allConfigs[i].id === type && (floor == null || allConfigs[i].floors === floor)) {
          typeIndices.push(i);
        }
      }
    }
  }

  return counts;
}

function enrichConfigs(configs, landArea, targetBaseForType, estimatedTotalCount) {
  if (configs.length === 0) return configs;

  let maxAdd;
  if (landArea <= 20000) maxAdd = 1;
  else if (landArea <= 50000) maxAdd = 2;
  else maxAdd = 3;

  const type = configs[0].id;
  const floor = configs[0].floors;
  const candidates = new Set();

  // 递减法（上限放宽到当前最大面积段 + 500，不再硬限制 1200）
  const maxBase = Math.max(...configs.map(c => c.base));
  const enrichUpper = maxBase + 500;
  for (const config of configs) {
    const x = config.base;
    if (x - 50 >= 300) candidates.add(x - 50);
    if (x + 50 <= enrichUpper) candidates.add(x + 50);
    if (x - 100 >= 300) candidates.add(x - 100);
  }

  // 内插法
  const sortedAreas = configs.map(c => c.base).sort((a, b) => a - b);
  for (let i = 0; i < sortedAreas.length - 1; i++) {
    const x1 = sortedAreas[i];
    const x2 = sortedAreas[i + 1];
    const mid = Math.round((x1 + x2) / 2 / 50) * 50;
    if (mid !== x1 && mid !== x2) candidates.add(mid);
  }

  const existingAreas = new Set(configs.map(c => c.base));

  const estCount = Math.max(1, estimatedTotalCount || 1);
  const targetBaseApprox = targetBaseForType / estCount;

  const filteredCandidates = [...candidates]
    .filter(area => !existingAreas.has(area))
    .map(area => {
      const eff = computeUnitCap(type, floor, area) / area;
      const targetEff = configs[0].unitCap / configs[0].base;
      return {
        area,
        effDiff: Math.abs(eff - targetEff),
        baseDiff: Math.abs(area - targetBaseApprox)
      };
    })
    .sort((a, b) => {
      if (a.effDiff !== b.effDiff) return a.effDiff - b.effDiff;
      return a.baseDiff - b.baseDiff;
    })
    .slice(0, maxAdd)
    .map(c => c.area);

  const newConfigs = [];
  for (const area of filteredCandidates) {
    newConfigs.push({
      id: type,
      type: getProductName(type),
      base: area,
      unitCap: computeUnitCap(type, floor, area),
      floors: floor,
      totalHeight: computeTotalHeight(type, floor),
      isEnriched: true
    });
  }

  const enrichedConfigs = [...configs, ...newConfigs];
  enrichedConfigs.sort((a, b) => a.base - b.base);
  return enrichedConfigs;
}

function fineTune(counts, configs, targetCap, targetBase, fixedBase, fixedCap) {
  const MAX_FINE_TUNE = 10;

  function calcTotalsLocal(cts) {
    let base = fixedBase, cap = fixedCap;
    for (let i = 0; i < configs.length; i++) {
      if (cts[i] > 0) {
        base += configs[i].base * cts[i];
        cap += configs[i].unitCap * cts[i];
      }
    }
    return { base, cap };
  }

  function scoreTotals(totals) {
    return Math.abs(totals.cap - targetCap) * 2 + Math.abs(totals.base - targetBase);
  }

  let bestCounts = [...counts];
  let bestTotals = calcTotalsLocal(bestCounts);
  let bestScore = scoreTotals(bestTotals);

  for (let round = 0; round < MAX_FINE_TUNE; round++) {
    const totals = calcTotalsLocal(counts);
    const farDiff = totals.cap - targetCap;
    const densityDiff = totals.base - targetBase;

    if (Math.abs(farDiff) <= targetCap * 0.005 && Math.abs(densityDiff) <= targetBase * 0.05) {
      return { counts, totals };
    }

    let improved = false;

    // 尝试同类型交换一栋配置
    for (let i = 0; i < configs.length; i++) {
      if (counts[i] <= 1) continue;
      for (let j = 0; j < configs.length; j++) {
        if (i === j) continue;
        if (configs[i].id !== configs[j].id) continue;
        const testCounts = [...counts];
        testCounts[i]--;
        testCounts[j]++;
        const testTotals = calcTotalsLocal(testCounts);
        if (testTotals.base > targetBase * 1.05) continue;
        const testScore = scoreTotals(testTotals);
        if (testScore < bestScore) {
          bestScore = testScore;
          bestCounts = testCounts;
          bestTotals = testTotals;
          improved = true;
        }
      }
    }

    // 尝试单栋加减
    for (let i = 0; i < configs.length; i++) {
      if (farDiff > 0 && counts[i] <= 0) continue;
      const testCounts = [...counts];
      if (farDiff > 0) {
        testCounts[i]--;
      } else {
        testCounts[i]++;
      }
      if (testCounts[i] < 0) continue;
      const testTotals = calcTotalsLocal(testCounts);
      if (testTotals.base > targetBase * 1.05) continue;
      const testScore = scoreTotals(testTotals);
      if (testScore < bestScore) {
        bestScore = testScore;
        bestCounts = testCounts;
        bestTotals = testTotals;
        improved = true;
      }
    }

    // 尝试组合调整：加一栋 A 同时减一栋 B
    for (let i = 0; i < configs.length; i++) {
      for (let j = 0; j < configs.length; j++) {
        if (i === j) continue;
        if (counts[j] <= 0) continue;
        const testCounts = [...counts];
        testCounts[i]++;
        testCounts[j]--;
        const testTotals = calcTotalsLocal(testCounts);
        if (testTotals.base > targetBase * 1.05) continue;
        const testScore = scoreTotals(testTotals);
        if (testScore < bestScore) {
          bestScore = testScore;
          bestCounts = testCounts;
          bestTotals = testTotals;
          improved = true;
        }
      }
    }

    if (!improved) break;
    counts = bestCounts;
  }

  return { counts, totals: calcTotalsLocal(counts) };
}

// 单一层数专用 fineTune：只调节容积率，不看密度
function fineTuneIgnoreDensity(counts, configs, targetCap, fixedBase, fixedCap) {
  const MAX = 20;
  const TOLERANCE = targetCap * 0.005;

  function calcCap(cts) {
    let cap = fixedCap;
    for (let i = 0; i < configs.length; i++) {
      if (cts[i] > 0) cap += configs[i].unitCap * cts[i];
    }
    return cap;
  }

  function calcBase(cts) {
    let base = fixedBase;
    for (let i = 0; i < configs.length; i++) {
      if (cts[i] > 0) base += configs[i].base * cts[i];
    }
    return base;
  }

  let bestCounts = [...counts];
  let bestCap = calcCap(bestCounts);
  let bestScore = Math.abs(bestCap - targetCap);

  for (let round = 0; round < MAX; round++) {
    const cap = calcCap(counts);
    if (Math.abs(cap - targetCap) <= TOLERANCE) {
      return { counts, totals: { base: calcBase(counts), cap } };
    }

    const farDiff = cap - targetCap;
    let improved = false;

    // 尝试单栋调整
    for (let i = 0; i < configs.length; i++) {
      if (farDiff > 0 && counts[i] <= 0) continue;
      const testCounts = [...counts];
      if (farDiff > 0) {
        testCounts[i]--;
      } else {
        testCounts[i]++;
      }
      if (testCounts[i] < 0) continue;
      const testCap = calcCap(testCounts);
      const testScore = Math.abs(testCap - targetCap);
      if (testScore < bestScore) {
        bestScore = testScore;
        bestCounts = testCounts;
        bestCap = testCap;
        improved = true;
      }
    }

    // 尝试组合调整：加一栋 A 同时减一栋 B
    for (let i = 0; i < configs.length; i++) {
      for (let j = 0; j < configs.length; j++) {
        if (i === j) continue;
        if (counts[j] <= 0) continue; // 不能减为负
        const testCounts = [...counts];
        testCounts[i]++;
        testCounts[j]--;
        const testCap = calcCap(testCounts);
        const testScore = Math.abs(testCap - targetCap);
        if (testScore < bestScore) {
          bestScore = testScore;
          bestCounts = testCounts;
          bestCap = testCap;
          improved = true;
        }
      }
    }

    if (!improved) break;
    counts = bestCounts;
  }

  return { counts, totals: { base: calcBase(counts), cap: calcCap(counts) } };
}

// 单一层数外层循环：只看容积率和分布，不看密度
function step5_single_layer_loop(finalCounts, configs, fixedFactoryConfigs, remainingCap, targetCap, fixedBase, fixedCap, landArea) {
  let counts = [...finalCounts];
  let currentConfigs = [...configs];

  const CAP_LO = targetCap * 0.995;
  const CAP_HI = targetCap * 1.005;

  const fixedFactoryBase = sum(fixedFactoryConfigs.map(c => c.base * c.count));
  const fixedFactoryCap = sum(fixedFactoryConfigs.map(c => c.unitCap * c.count));
  const totalFixedBase = fixedBase + fixedFactoryBase;
  const totalFixedCap = fixedCap + fixedFactoryCap;

  function calcTotalsLocal(counts, configs) {
    let base = totalFixedBase;
    let cap = totalFixedCap;
    for (let i = 0; i < counts.length; i++) {
      if (counts[i] > 0) {
        base += configs[i].base * counts[i];
        cap += configs[i].unitCap * counts[i];
      }
    }
    return { base, cap };
  }

  let singleTypeEnriched = false;
  let previousCap = null;

  for (let round = 0; round < 10; round++) {
    let totals = calcTotalsLocal(counts, currentConfigs);

    const distCheck = checkDistribution(counts, currentConfigs);

    // FAR 已满足且分布没问题，退出
    if (totals.cap >= CAP_LO && totals.cap <= CAP_HI && !distCheck.needsOptimization) {
      break;
    }

    // 如果连续两轮 cap 没有变化，说明已收敛，退出
    if (previousCap !== null && Math.abs(totals.cap - previousCap) < 1e-6) {
      break;
    }
    previousCap = totals.cap;

    const capDiffRate = Math.abs(totals.cap - targetCap) / targetCap;
    const needsEnrich = !singleTypeEnriched && capDiffRate > 0.003;

    if (!distCheck.needsOptimization && !needsEnrich) {
      // 没有优化需求，但 FAR 还没满足，尝试 fineTune
      const fineTuned = fineTuneIgnoreDensity(counts, currentConfigs, targetCap, totalFixedBase, totalFixedCap);
      counts = fineTuned.counts;
      totals = fineTuned.totals;
      if (totals.cap >= CAP_LO && totals.cap <= CAP_HI) break;
      continue;
    }

    if (needsEnrich) {
      const totalCount = sum(counts);
      const remainingBaseApprox = Math.max(1, targetCap / Math.max(...currentConfigs.map(c => c.unitCap / c.base)));
      const enrichedConfigs = enrichConfigs(currentConfigs, landArea, remainingBaseApprox, totalCount);
      const newCounts = solveIntegerEquation(remainingCap, enrichedConfigs, Infinity);
      currentConfigs = enrichedConfigs;
      counts = newCounts.counts;
      singleTypeEnriched = true;

      totals = calcTotalsLocal(counts, currentConfigs);
    }

    const distCheck2 = checkDistribution(counts, currentConfigs);
    if (distCheck2.needsOptimization) {
      const type = distCheck2.type;
      const floor = distCheck2.floor;
      const a = distCheck2.a;
      const b = distCheck2.b;

      const typeIndices = [];
      for (let i = 0; i < currentConfigs.length; i++) {
        if (currentConfigs[i].id === type && currentConfigs[i].floors === floor) typeIndices.push(i);
      }
      let S_type = 0;
      for (const i of typeIndices) S_type += currentConfigs[i].base * counts[i];

      const optimized = manualDistribute(type, floor, S_type, a, b);
      counts = mapOptimizedToCounts(optimized, counts, currentConfigs, [], type, {}, floor);
    }

    const fineTuned = fineTuneIgnoreDensity(counts, currentConfigs, targetCap, totalFixedBase, totalFixedCap);
    counts = fineTuned.counts;
    totals = fineTuned.totals;

    if (totals.cap >= CAP_LO && totals.cap <= CAP_HI) {
      const distCheckAfter = checkDistribution(counts, currentConfigs);
      if (!distCheckAfter.needsOptimization) break;
    }
  }

  // 强制最终分布平衡：循环结束后如果仍分布不均，强制转移栋数
  let finalDistCheck = checkDistribution(counts, currentConfigs);
  if (finalDistCheck.needsOptimization) {
    counts = rebalanceDistribution(counts, currentConfigs);
    // rebalance 后可能破坏 FAR，再微调一次
    const fineTuned = fineTuneIgnoreDensity(counts, currentConfigs, targetCap, totalFixedBase, totalFixedCap);
    counts = fineTuned.counts;
  }

  return { counts, configs: currentConfigs };
}

function detectOscillation(history) {
  if (history.length < 3) return false;
  const last3 = history.slice(-3);
  return (
    (last3[0] > 0 && last3[1] < 0 && last3[2] > 0) ||
    (last3[0] < 0 && last3[1] > 0 && last3[2] < 0)
  );
}

function step5_outer_loop(finalCounts, bhConfigs, blConfigs, fixedFactoryConfigs, remainingBase, remainingCap, targetBase, targetCap, fixedBase, fixedCap, isSingleType, landArea, typeSideMap, ignoreDensity = false) {
  let counts = [...finalCounts];
  let currentBhConfigs = [...bhConfigs];
  let currentBlConfigs = [...blConfigs];
  let currentTypeSideMap = { ...typeSideMap };
  const oscillationHistory = [];
  const totalsHistory = [];
  let singleTypeEnriched = false;

  const CAP_LO = targetCap * 0.995;
  const CAP_HI = targetCap * 1.005;

  const fixedFactoryBase = sum(fixedFactoryConfigs.map(c => c.base * c.count));
  const fixedFactoryCap = sum(fixedFactoryConfigs.map(c => c.unitCap * c.count));
  const totalFixedBase = fixedBase + fixedFactoryBase;
  const totalFixedCap = fixedCap + fixedFactoryCap;

  // 记录每轮结束后的状态，用于振荡时回退到最优
  let bestState = {
    counts: [...counts],
    bhConfigs: [...currentBhConfigs],
    blConfigs: [...currentBlConfigs],
    totals: { base: 0, cap: 0 },
    score: Infinity
  };

  function recordBest(totals) {
    const capDiff = Math.abs(totals.cap - targetCap);
    const densityDiff = Math.abs(totals.base - targetBase);
    // 单一层数时完全忽略密度
    const score = ignoreDensity ? capDiff : (capDiff * 2 + densityDiff);
    if (score < bestState.score) {
      bestState = {
        counts: [...counts],
        bhConfigs: [...currentBhConfigs],
        blConfigs: [...currentBlConfigs],
        totals: { ...totals },
        score
      };
    }
  }

  for (let round = 0; round < 10; round++) {
    let totals = calcTotals(counts, currentBhConfigs, currentBlConfigs, fixedFactoryConfigs);
    totals.base += fixedBase;
    totals.cap += fixedCap;
    recordBest(totals);

    const densityDiff = totals.base - targetBase;
    if (ignoreDensity) {
      oscillationHistory.push(0);
    } else {
      if (densityDiff > targetBase * 0.05) oscillationHistory.push(1);
      else if (densityDiff < -targetBase * 0.05) oscillationHistory.push(-1);
      else oscillationHistory.push(0);
    }
    if (oscillationHistory.length > 5) oscillationHistory.shift();

    let allConfigs = [...currentBhConfigs, ...currentBlConfigs];
    let distCheck = checkDistribution(counts, allConfigs);

    // 单一层数下，若容积率或密度偏差仍较大，也尝试 enrich 优化（仅一次）
    const capDiffRate = Math.abs(totals.cap - targetCap) / targetCap;
    const densityDiffRate = Math.abs(totals.base - targetBase) / targetBase;
    const needsEnrich = isSingleType && !singleTypeEnriched &&
                        (ignoreDensity ? capDiffRate > 0.003 : (capDiffRate > 0.003 || densityDiffRate > 0.01));

    if (!distCheck.needsOptimization && !detectOscillation(oscillationHistory) && !needsEnrich) {
      if (totals.cap >= CAP_LO && totals.cap <= CAP_HI) {
        break;
      }
    }

    // 振荡检测：近 4 轮 totals 形成 A-B-A-B 周期，直接回退到历史最优并结束
    totalsHistory.push({ base: totals.base, cap: totals.cap });
    if (totalsHistory.length > 6) totalsHistory.shift();
    if (totalsHistory.length >= 4) {
      const last = totalsHistory[totalsHistory.length - 1];
      const prev2 = totalsHistory[totalsHistory.length - 3];
      const prev1 = totalsHistory[totalsHistory.length - 2];
      const prev3 = totalsHistory[totalsHistory.length - 4];
      if (last.base === prev2.base && last.cap === prev2.cap &&
          prev1.base === prev3.base && prev1.cap === prev3.cap &&
          !(last.base === prev1.base && last.cap === prev1.cap)) {
        counts = bestState.counts;
        currentBhConfigs = bestState.bhConfigs;
        currentBlConfigs = bestState.blConfigs;
        break;
      }
    }

    if (distCheck.needsOptimization || detectOscillation(oscillationHistory) || needsEnrich) {
      const type = distCheck.type;
      const a = distCheck.a;
      const b = distCheck.b;
      const floor = distCheck.floor;

      // 若当前结果已满足 cap 与 density，优化以不恶化为前提
      const alreadyGood = ignoreDensity
        ? (totals.cap >= CAP_LO && totals.cap <= CAP_HI)
        : (totals.cap >= CAP_LO && totals.cap <= CAP_HI &&
           Math.abs(totals.base - targetBase) <= targetBase * 0.05);
      const snapshotCounts = alreadyGood ? [...counts] : null;
      const snapshotBh = alreadyGood ? [...currentBhConfigs] : null;
      const snapshotBl = alreadyGood ? [...currentBlConfigs] : null;

      if (isSingleType) {
        const targetConfigs = currentBhConfigs.length > 0 ? currentBhConfigs : currentBlConfigs;
        if (targetConfigs.length === 0) continue;

        const totalCount = sum(counts);
        const enrichedConfigs = enrichConfigs(targetConfigs, landArea, remainingBase, totalCount);
        const newCounts = solveIntegerEquation(remainingCap, enrichedConfigs, ignoreDensity ? Infinity : remainingBase * 1.05);
        singleTypeEnriched = true;

        if (targetConfigs === currentBhConfigs) {
          currentBhConfigs = enrichedConfigs;
        } else {
          currentBlConfigs = enrichedConfigs;
        }
        counts = newCounts.counts;

        // enrich 后重新计算 S_type
        allConfigs = [...currentBhConfigs, ...currentBlConfigs];
        const activeType = type || enrichedConfigs[0].id;
        const newTypeIndices = [];
        for (let i = 0; i < allConfigs.length; i++) {
          if (allConfigs[i].id === activeType) newTypeIndices.push(i);
        }
        let S_type = 0;
        for (const i of newTypeIndices) S_type += allConfigs[i].base * counts[i];

        totals = calcTotals(counts, currentBhConfigs, currentBlConfigs, fixedFactoryConfigs);
        totals.base += fixedBase;
        totals.cap += fixedCap;

        const distCheck2 = checkDistribution(counts, [...currentBhConfigs, ...currentBlConfigs]);
        if (distCheck2.needsOptimization || detectOscillation(oscillationHistory)) {
          const optimized = manualDistribute(activeType, floor || enrichedConfigs[0].floors, S_type, a || Math.min(...enrichedConfigs.map(c=>c.base)), b || Math.max(...enrichedConfigs.map(c=>c.base)));
          counts = mapOptimizedToCounts(optimized, counts, currentBhConfigs, currentBlConfigs, activeType, currentTypeSideMap);
        }
      } else {
        if (!type) continue;

        // 按 id + floor 精确计算该组的占地面积 S_type
        const typeIndices = [];
        for (let i = 0; i < allConfigs.length; i++) {
          if (allConfigs[i].id === type && allConfigs[i].floors === floor) typeIndices.push(i);
        }
        let S_type = 0;
        for (const i of typeIndices) S_type += allConfigs[i].base * counts[i];

        // 尝试 10/5/2 三种精度，选择 fineTune 后分布最好且指标最好的
        const precisions = [10, 5, 2];
        let bestState = null;
        let bestScore = Infinity;
        let bestDistOk = false;

        const currentScore = ignoreDensity
          ? Math.abs(totals.cap - targetCap)
          : (Math.abs(totals.cap - targetCap) * 2 + Math.abs(totals.base - targetBase));

        function evaluateCandidate(candidateCounts, candidateConfigs, candidateTotals, candidateBh, candidateBl) {
          const score = ignoreDensity
            ? Math.abs(candidateTotals.cap - targetCap)
            : (Math.abs(candidateTotals.cap - targetCap) * 2 + Math.abs(candidateTotals.base - targetBase));
          const inTolerance = ignoreDensity
            ? (candidateTotals.cap >= CAP_LO && candidateTotals.cap <= CAP_HI)
            : (candidateTotals.cap >= CAP_LO && candidateTotals.cap <= CAP_HI &&
               Math.abs(candidateTotals.base - targetBase) <= targetBase * 0.05);
          const notWorse = score <= currentScore * 1.05;
          const distOk = !checkDistribution(candidateCounts, candidateConfigs).needsOptimization;

          const candidateBetter = (!bestDistOk && distOk && (inTolerance || notWorse))
            || (bestDistOk === distOk && score < bestScore);

          if (candidateBetter) {
            bestState = {
              counts: candidateCounts,
              bhConfigs: candidateBh,
              blConfigs: candidateBl
            };
            bestScore = score;
            bestDistOk = distOk;
          }

          return distOk && inTolerance;
        }

        for (const precision of precisions) {
          const optimizedCandidate = manualDistribute(type, floor, S_type, a, b, precision);

          // 先评估 manualDistribute 的原始结果（不经过 fineTune）
          const rawBh = [...currentBhConfigs];
          const rawBl = [...currentBlConfigs];
          const rawCounts = mapOptimizedToCounts(optimizedCandidate, [...counts], rawBh, rawBl, type, currentTypeSideMap, floor);
          const rawAllConfigs = [...rawBh, ...rawBl];
          const rawTotals = calcTotals(rawCounts, rawBh, rawBl, fixedFactoryConfigs);
          rawTotals.base += fixedBase;
          rawTotals.cap += fixedCap;
          const rawGood = evaluateCandidate(rawCounts, rawAllConfigs, rawTotals, rawBh, rawBl);

          // 再评估经过 fineTune 后的结果
          const fineTuned = fineTune([...rawCounts], rawAllConfigs, targetCap, targetBase, totalFixedBase, totalFixedCap);
          const fineTunedGood = evaluateCandidate(fineTuned.counts, rawAllConfigs, fineTuned.totals, rawBh, rawBl);

          if ((rawGood || fineTunedGood) && bestDistOk) break;
        }

        if (bestState) {
          counts = bestState.counts;
          currentBhConfigs = bestState.bhConfigs;
          currentBlConfigs = bestState.blConfigs;
        }
      }

      // 若优化后整体指标比优化前差，回退到优化前状态
      // 注意：如果本次是因为分布不均触发的优化，允许指标轻微恶化，以优先满足分布规则
      if (alreadyGood && !distCheck.needsOptimization) {
        const newTotals = calcTotals(counts, currentBhConfigs, currentBlConfigs, fixedFactoryConfigs);
        newTotals.base += fixedBase;
        newTotals.cap += fixedCap;
        const oldCapDiff = Math.abs(totalsHistory[totalsHistory.length - 1].cap - targetCap);
        const newCapDiff = Math.abs(newTotals.cap - targetCap);
        const oldDensityDiff = Math.abs(totalsHistory[totalsHistory.length - 1].base - targetBase);
        const newDensityDiff = Math.abs(newTotals.base - targetBase);
        const shouldRevert = ignoreDensity
          ? (newCapDiff > oldCapDiff)
          : (newCapDiff > oldCapDiff || newDensityDiff > oldDensityDiff);
        if (shouldRevert) {
          counts = snapshotCounts;
          currentBhConfigs = snapshotBh;
          currentBlConfigs = snapshotBl;
        }
      }
    }

    allConfigs = [...currentBhConfigs, ...currentBlConfigs];
    const fineTuned = ignoreDensity
      ? fineTuneIgnoreDensity(counts, allConfigs, targetCap, totalFixedBase, totalFixedCap)
      : fineTune(counts, allConfigs, targetCap, targetBase, totalFixedBase, totalFixedCap);

    counts = fineTuned.counts;
    totals = fineTuned.totals;
    recordBest(totals);

    let distCheckAfterFineTune = checkDistribution(counts, allConfigs);

    // 如果 fineTune 后分布不均，强制 rebalance，再微调一次
    if (distCheckAfterFineTune.needsOptimization) {
      counts = rebalanceDistribution(counts, allConfigs);
      const rebalancedFineTuned = ignoreDensity
        ? fineTuneIgnoreDensity(counts, allConfigs, targetCap, totalFixedBase, totalFixedCap)
        : fineTune(counts, allConfigs, targetCap, targetBase, totalFixedBase, totalFixedCap);
      counts = rebalancedFineTuned.counts;
      totals = rebalancedFineTuned.totals;
      recordBest(totals);
      distCheckAfterFineTune = checkDistribution(counts, allConfigs);
    }

    const inToleranceAfterFineTune = ignoreDensity
      ? (totals.cap >= CAP_LO && totals.cap <= CAP_HI)
      : (totals.cap >= CAP_LO && totals.cap <= CAP_HI &&
         Math.abs(totals.base - targetBase) <= targetBase * 0.05);
    if (inToleranceAfterFineTune && !distCheckAfterFineTune.needsOptimization) {
      break;
    }
  }

  // 若因振荡退出，返回历史最优状态
  // 但当当前状态已满足容积率/密度要求时，优先保留当前状态
  if (bestState.score < Infinity) {
    const currentTotals = calcTotals(counts, currentBhConfigs, currentBlConfigs, fixedFactoryConfigs);
    currentTotals.base += fixedBase;
    currentTotals.cap += fixedCap;
    const currentInTolerance = ignoreDensity
      ? (currentTotals.cap >= CAP_LO && currentTotals.cap <= CAP_HI)
      : (currentTotals.cap >= CAP_LO && currentTotals.cap <= CAP_HI &&
         Math.abs(currentTotals.base - targetBase) <= targetBase * 0.05);
    if (!currentInTolerance) {
      counts = bestState.counts;
      currentBhConfigs = bestState.bhConfigs;
      currentBlConfigs = bestState.blConfigs;
    }
  }

  // 最终强制 rebalance：循环退出后再检查一次分布
  const finalConfigs = [...currentBhConfigs, ...currentBlConfigs];
  let finalDistCheck = checkDistribution(counts, finalConfigs);
  if (finalDistCheck.needsOptimization) {
    counts = rebalanceDistribution(counts, finalConfigs);
    const rebalancedFineTuned = ignoreDensity
      ? fineTuneIgnoreDensity(counts, finalConfigs, targetCap, totalFixedBase, totalFixedCap)
      : fineTune(counts, finalConfigs, targetCap, targetBase, totalFixedBase, totalFixedCap);
    counts = rebalancedFineTuned.counts;
  }

  return { counts, configs: [...currentBhConfigs, ...currentBlConfigs] };
}

// ============================================================================
// 九、主流程
// ============================================================================

function calculateProductConfig(inputProjectData, inputSelectedProducts, inputProductOptions) {
  // 支持模块调用和浏览器全局变量
  const projectData = inputProjectData || (typeof global !== 'undefined' ? global.projectData : null) || (typeof window !== 'undefined' ? window.projectData : null);
  let selectedProducts = inputSelectedProducts || (typeof global !== 'undefined' ? global.selectedProducts : null) || (typeof window !== 'undefined' ? window.selectedProducts : null);
  let productOptions = inputProductOptions || (typeof global !== 'undefined' ? global.productOptions : null) || (typeof window !== 'undefined' ? window.productOptions : null);

  // 输入验证
  const errors = validateInput(projectData, selectedProducts, productOptions);
  if (errors.length > 0) {
    return { error: errors.join('\n') };
  }

  const S = projectData.landArea;
  const F = projectData.far;
  const D = calcDensity(F);
  const R1 = projectData.rdRatio || 0;
  const R2 = projectData.ancillaryRatio || 0;
  const Hl = projectData.heightLimit || 150;

  const targetBase = S * D;
  const targetCap = S * F;
  const targetRdArea = targetCap * R1;
  const targetAncillaryArea = targetCap * R2;

  // 第零步：前置处理
  const result0 = step0_preprocess(selectedProducts, productOptions, Hl);
  if (result0.error) {
    return { error: result0.error };
  }
  selectedProducts = result0.selectedProducts;
  productOptions = result0.productOptions;
  const layerFloors = result0.layerFloors;
  const splitFloors = result0.splitFloors;
  let referenceHeight = result0.referenceHeight;

  // 步骤一：产业大厦
  const towerResult = step1_tower(selectedProducts, productOptions, targetRdArea, Hl);
  if (towerResult.error) {
    return { error: towerResult.error };
  }
  let allConfigs = [...towerResult.configs];
  let fixedBase = towerResult.base;
  let fixedCap = towerResult.cap;

  // 若产业大厦存在，用产业大厦高度作为宿舍参考高度
  if (towerResult.towerHeight > 0) {
    referenceHeight = towerResult.towerHeight;
  }

  // 步骤二：配套用房
  const ancillaryResult = step2_ancillary(selectedProducts, productOptions, targetAncillaryArea, referenceHeight);
  allConfigs = [...allConfigs, ...ancillaryResult.configs];
  fixedBase += ancillaryResult.base;
  fixedCap += ancillaryResult.cap;

  // 步骤三：厂房预处理
  let factoryResult = step3_factory_preprocess(
    selectedProducts,
    productOptions,
    layerFloors,
    splitFloors,
    targetBase,
    targetCap,
    fixedBase,
    fixedCap
  );

  // 若 remainingBase <= 0 或 remainingCap <= 0，说明固定产品已超过上限
  if (factoryResult.remainingBase <= 0 || factoryResult.remainingCap <= 0) {
    const adjustedResult = adjustFixedConfigs(factoryResult, targetBase, targetCap, fixedBase, fixedCap);
    if (!adjustedResult) {
      return { error: '固定产品超过建筑密度或容积率上限，请调整输入参数' };
    }
    factoryResult = adjustedResult;
  }

  const fixedFactoryConfigs = factoryResult.fixedConfigs;
  const bhConfigs = factoryResult.bhConfigs;
  const blConfigs = factoryResult.blConfigs;
  const singleConfigs = factoryResult.singleConfigs || [];
  let typeSideMap = factoryResult.typeSideMap;
  const remainingBase = factoryResult.remainingBase;
  const remainingCap = factoryResult.remainingCap;

  // 收集警告信息
  const warnings = [];
  let effectiveD = D;

  // 步骤四：判断是否为单一层数，是则走独立算法，否则走 Bh/Bl
  let coreResult;
  let useSingleLayerLoop = false;

  if (factoryResult.isSingleType) {
    // 步骤三已判定为单一层数（含方案 B1）
    coreResult = step4_single_layer(singleConfigs.length > 0 ? singleConfigs : [...bhConfigs, ...blConfigs], remainingCap, remainingBase);
    useSingleLayerLoop = true;
  } else if (factoryResult.isCaseA || factoryResult.isCaseB2) {
    // 方案 A / 方案 B2：不同产品类型，带密度调整
    coreResult = step4_core_algorithm_with_adjustment(
      bhConfigs, blConfigs, remainingBase, remainingCap,
      projectData, D, warnings
    );
    if (coreResult.adjustedD != null) {
      effectiveD = coreResult.adjustedD;
    }
    if (coreResult.isSingleType) {
      useSingleLayerLoop = true;
    }
  } else {
    const allFactoryConfigs = [...bhConfigs, ...blConfigs];
    const uniqueLayerTypes = new Set(allFactoryConfigs.map(c => `${c.id}_${c.floors}`));

    if (uniqueLayerTypes.size === 1) {
      // 自然单一层数
      coreResult = step4_single_layer(allFactoryConfigs, remainingCap, remainingBase);
      useSingleLayerLoop = true;
    } else if (uniqueLayerTypes.size === 2 && bhConfigs.length > 0 && blConfigs.length > 0) {
      // 两种层数，检查是否需要退化（avgEff 超出 [BlEff, BhEff]）
      const effBh = bhConfigs.reduce((s, c) => s + c.unitCap / c.base, 0) / bhConfigs.length;
      const effBl = blConfigs.reduce((s, c) => s + c.unitCap / c.base, 0) / blConfigs.length;
      const avgEff = remainingCap / remainingBase;
      const EPS = 1e-9;

      if (avgEff >= effBh - EPS) {
        coreResult = step4_single_layer(bhConfigs, remainingCap, remainingBase);
        useSingleLayerLoop = true;
      } else if (avgEff <= effBl + EPS) {
        coreResult = step4_single_layer(blConfigs, remainingCap, remainingBase);
        useSingleLayerLoop = true;
      } else {
        coreResult = step4_core_algorithm(bhConfigs, blConfigs, remainingBase, remainingCap);
      }
    } else {
      coreResult = step4_core_algorithm(bhConfigs, blConfigs, remainingBase, remainingCap);
    }
  }

  let finalCounts = coreResult.counts;
  let activeBhConfigs = coreResult.bhConfigs || (useSingleLayerLoop ? (coreResult.configs || []) : []);
  let activeBlConfigs = coreResult.blConfigs || [];
  const isSingleType = coreResult.isSingleType;
  typeSideMap = coreResult.typeSideMap;

  // 步骤五：外层循环优化
  // 单一层数时忽略密度，复用 step5_outer_loop 的优化能力
  // 若密度被调整，外层循环的密度检查使用 effectiveD
  const effectiveTargetBase = S * effectiveD;
  const outerResult = step5_outer_loop(
    finalCounts,
    activeBhConfigs,
    activeBlConfigs,
    fixedFactoryConfigs,
    remainingBase,
    remainingCap,
    effectiveTargetBase,
    targetCap,
    fixedBase,
    fixedCap,
    isSingleType,
    S,
    typeSideMap,
    useSingleLayerLoop // ignoreDensity
  );

  // 输出合并与字段补齐
  function enrichProduct(config, count) {
    const id = config.id;
    const base = config.base;
    let unitArea = config.unitArea != null ? config.unitArea : config.unitCap;
    const unitCap = config.unitCap;
    const floors = config.floors;

    // 轻钢厂房：单栋面积使用建筑面积规则（基底 + 400），而非计容面积
    if (id === 'light-steel') {
      unitArea = base + 400;
    }
    const totalHeight = config.totalHeight;

    let form = '独栋';
    let load;
    let elevator;
    const fl = { first: 7.2, second: 5.1, standard: 4.5, top: 4.5 };
    const flSuffix = { second: '', standard: '', top: '' };

    if (id === 'tower') {
      load = '首层2000kg，标准层350kg';
      fl.first = 6.6; fl.second = config.standardHeight || 4.5; fl.standard = config.standardHeight || 4.5; fl.top = config.standardHeight || 4.5;
      const paxLift = Math.max(1, Math.ceil(unitCap / 4000) - 2);
      elevator = paxLift + '客2货';
    } else if (id === 'dorm') {
      load = '标准层350kg';
      fl.first = 4.8; fl.second = 3.6; fl.standard = 3.6; fl.top = 3.6;
      const paxLift = Math.ceil(unitCap / 5000);
      elevator = paxLift + '客';
    } else if (id === 'support') {
      load = '首层2000kg，二层800kg，二层及以上500kg';
      if (floors === 2) {
        fl.second = 4.5;
      } else {
        fl.second = 5.1;
      }
      if (base < 1500) {
        elevator = '1客';
      } else if (base < 4000) {
        elevator = '1客1货';
      } else {
        elevator = '1客2货';
      }
    } else if (id === 'light-steel') {
      load = '首层2000kg';
      fl.first = 12; fl.second = 4.8; fl.standard = 3.6; fl.top = 3.6;
      flSuffix.second = '（夹）'; flSuffix.standard = '（夹）'; flSuffix.top = '（夹）';
      elevator = '无';
    } else if (id === 'split') {
      load = '首层2000kg，二层800kg，二层及以上500kg';
      // 分栋厂房按单元整栋面积（base × floors）判断电梯配置
      const splitUnitCap = unitCap;
      elevator = splitUnitCap < 1500 ? '1货' : (splitUnitCap < 4000 ? '1客1货' : '1客2货');
    } else if (id === 'layer') {
      form = '分层分户';
      load = '首层2000kg，二层800kg，二层及以上500kg';
      // 分层厂房按单元整栋面积判断电梯配置
      if (unitArea <= 4000) {
        elevator = '1客1货';
      } else if (unitArea <= 6000) {
        elevator = '1客2货';
      } else {
        elevator = '2客2货';
      }
    }

    let suffix = '';
    if (id === 'light-steel') suffix = '-D';
    else if (id === 'split') suffix = '-D';
    else if (id === 'layer') suffix = '-D';
    else if (id === 'tower') suffix = '-F';
    else if (id === 'dorm') suffix = '-F';
    else if (id === 'support') suffix = '-D';

    return {
      ...config,
      form,
      load,
      elevator,
      fl,
      flSuffix,
      count,
      unitArea,
      totalBase: base * count,
      totalArea: unitArea * count,
      totalCap: unitCap * count,
      productType: floors + 'F' + suffix + '(' + base + ')'
    };
  }

  const output = [];
  for (const config of allConfigs) {
    output.push(enrichProduct(config, config.count));
  }

  for (const config of fixedFactoryConfigs) {
    if (config.count > 0) {
      output.push(enrichProduct(config, config.count));
    }
  }

  for (let i = 0; i < outerResult.counts.length; i++) {
    const config = outerResult.configs[i];
    const count = outerResult.counts[i];
    if (count > 0) {
      output.push(enrichProduct(config, count));
    }
  }

  // 计算汇总
  let totalBase = 0, totalArea = 0, totalCap = 0, totalCount = 0;
  for (const p of output) {
    totalBase += p.totalBase;
    totalArea += p.totalArea;
    totalCap += p.totalCap;
    totalCount += p.count;
  }

  const actualDensity = totalBase / S;
  const actualFar = totalCap / S;

  return {
    products: output,
    totalBase,
    totalArea,
    totalCap,
    totalCount,
    warnings,
    adjustedD: effectiveD !== D ? effectiveD : null,
    _check: {
      targetDensity: effectiveD,
      actualDensity,
      targetFar: F,
      actualFar,
      targetBase: effectiveTargetBase,
      targetCap,
      farDiff: Math.abs(actualFar - F) / F,
      densityDiff: Math.abs(actualDensity - effectiveD) / effectiveD
    }
  };
}

// ============================================================================
// 十、导出
// ============================================================================

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    calculateProductConfig,
    validateInput
  };
}
