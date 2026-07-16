/**
 * financial-modules.js
 * 投资估算、静态投资分析、动态投资分析模块
 *
 * 核心原则：
 * 1. 投资估算完整版为源头，简化版由完整版汇总反推；
 * 2. 静态分析依赖投资估算结果；
 * 3. 所有输出金额保留两位小数。
 */

(function (global) {
  'use strict';

  const NS = {};
  global.FinancialModules = NS;

  // ==================== 工具函数 ====================
  function fmtNum(n, d) {
    d = d == null ? 2 : d;
    if (n == null || isNaN(n)) return '—';
    return Number(n).toFixed(d);
  }

  function round2(n) {
    if (n == null || isNaN(n)) return 0;
    return Math.round(Number(n) * 100) / 100;
  }

  function safeNum(v, def) {
    const n = parseFloat(v);
    return isNaN(n) ? (def == null ? 0 : def) : n;
  }

  function muFromArea(m2) {
    return m2 / 666.7;
  }

  NS.safeNum = safeNum;

  // ==================== 参考单价（按 INVESTMENT_ESTIMATE_DESIGN.md） ====================
  // 注：以下单价来自设计文档，后续如需调整可在此集中修改。
  const REFERENCE_PRICES = {
    // 前期费用（元/m²）
    preliminary: {
      survey: 10,         // 勘察费用，按用地面积
      planning: 77.05,    // 规划设计费，按地上总建面
      approval: 45,       // 报批报建费
      consulting: 20,     // 造价咨询服务费
      supervision: 25,    // 工程监理费
      temporary: 12,      // 临时工程费
      demolition: 0,      // 拆除工程，默认 0
      other: 0            // 其他
    },
    // 基础设施费（元/m²）
    infrastructure: {
      waterSupply: 100,         // 室外给水管网
      drainage: 45,             // 室外排水管网
      cable: 40,                // 室外电缆工程
      weakCurrent: 25,          // 室外弱电工程
      gas: 50,                  // 室外燃气管网
      powerDistribution: 50,    // 供配电设备及安装
      pumpRoom: 10,             // 水泵房设备及安装
      fire: 5,                  // 消防设备及安装
      road: 450                 // 小区车行道路工程，按道路面积
    },
    // 景观工程
    landscape: {
      demoLandscape: 450,   // 示范区景观，元/m²，工程量 1000
      hardPavement: 280,    // 硬质铺装，元/m²
      greening: 260,        // 非示范区绿化，元/m²
      entrance: 10,         // 出入口开口费，万元/个
      stoneSteps: 5,        // 室外石材台阶及散水，元/m²
      signs: 7,             // 标示标牌，元/m²
      wall: 1000,           // 围墙，元/m
      spongeCity: 80        // 海绵城市，元/m²
    },
    // 红线外市政工程费
    offsiteMunicipal: {
      powerCapacity: 290,       // 电力增容费/高可靠性用电，元/KVA
      waterDrainageConnection: 25 // 红线外给水、排水接驳费，元/m² 用地
    },
    // 大市政配套费默认（上海为 0，其他地区用户输入）
    municipalFeeDefault: 0
  };

  // ==================== 产品指标汇总 ====================
  function getProductMetrics(result) {
    const products = result && result.products ? result.products : [];
    const metrics = {
      lightSteelArea: 0,
      splitArea: 0,
      layerArea: 0,
      towerArea: 0,
      towerHeight: 0,
      dormArea: 0,
      supportArea: 0,
      splitSingleArea: 0,
      splitDuplexArea: 0,
      layerSingleArea: 0,
      layerMultiArea: 0,
      aboveGroundArea: 0,
      undergroundArea: 0,
      totalBuildingArea: 0,
      totalCap: 0
    };

    products.forEach(p => {
      if (p.type === '轻钢厂房') metrics.lightSteelArea += p.totalArea || 0;
      if (p.type === '分栋厂房') metrics.splitArea += p.totalArea || 0;
      if (p.type === '分层厂房') metrics.layerArea += p.totalArea || 0;
      if (p.type === '产业大厦') { metrics.towerArea += p.totalArea || 0; metrics.towerHeight = Math.max(metrics.towerHeight, p.totalHeight || 0); }
      if (p.type === '配套宿舍') metrics.dormArea += p.totalArea || 0;
      if (p.type === '配套楼') metrics.supportArea += p.totalArea || 0;

      if (p.type === '分栋厂房') {
        if (p.form === '独栋') metrics.splitSingleArea += p.totalArea || 0;
        else metrics.splitDuplexArea += p.totalArea || 0;
      }
      if (p.type === '分层厂房') {
        if (p.form === '独栋') metrics.layerSingleArea += p.totalArea || 0;
        else metrics.layerMultiArea += p.totalArea || 0;
      }
    });

    metrics.aboveGroundArea = result.totalArea || 0;
    metrics.totalCap = result.totalCap || 0;
    metrics.undergroundArea = (result.calculated && result.calculated.undergroundArea) || 0;
    metrics.totalBuildingArea = metrics.aboveGroundArea + metrics.undergroundArea;
    return metrics;
  }

  // ==================== 投资估算计算 ====================
  NS.calculateInvestmentEstimate = function (inputs, result, projectData) {
    inputs = inputs || {};
    const metrics = getProductMetrics(result);
    const pd = projectData || {};
    const calc = pd.calculated || {};

    const landArea = safeNum(pd.landArea, 0);
    const acre = muFromArea(landArea);
    const far = safeNum(pd.far, 0);
    const ancillaryRatio = safeNum(pd.ancillaryRatio, 0);
    const rdRatio = safeNum(pd.rdRatio, 0);
    const aboveGroundArea = metrics.aboveGroundArea;
    const undergroundArea = metrics.undergroundArea;
    const totalBuildingArea = metrics.totalBuildingArea;
    const greenRate = safeNum(pd.greenRate, 0.1);
    const buildingDensity = safeNum(calc.buildingDensity, 0);
    const roadRatio = 0.30;
    const roadArea = landArea * roadRatio;
    const wallLength = Math.sqrt(Math.max(landArea, 0)) * 4 * 1.2;

    // 用户输入
    const landPrice = safeNum(inputs.landPrice, 70);          // 万元/亩
    const municipalFee = safeNum(inputs.municipalFee, 0);     // 元/m² 用地
    const city = (inputs.city || pd.region || '').trim();
    const spongeCity = inputs.spongeCity != null ? !!inputs.spongeCity : (city === '上海' || city === '杭州');
    const financingRatio = safeNum(inputs.financingRatio, 0);
    const financingRate = safeNum(inputs.financingRate, 0.05);
    const devPhases = Math.max(1, Math.round(safeNum(inputs.devPhases, 1)));
    const phasePeriod = safeNum(inputs.phasePeriod, 2);

    // 一、土地配套费用
    const landTransferFee = round2(landPrice * acre);
    const deedTax = round2(landTransferFee * 0.03 + 10);
    const effectiveMunicipalFee = city === '上海' ? 0 : municipalFee;
    const municipalSupportingFee = round2(effectiveMunicipalFee * landArea / 10000);
    const powerKva = (aboveGroundArea * 70 + undergroundArea * 50) / 1000;
    const powerCapacityCost = round2(REFERENCE_PRICES.offsiteMunicipal.powerCapacity * powerKva / 10000);
    const waterDrainageCost = round2(REFERENCE_PRICES.offsiteMunicipal.waterDrainageConnection * landArea / 10000);
    const offsiteMunicipalTotal = round2(powerCapacityCost + waterDrainageCost);
    const landVAT = round2(offsiteMunicipalTotal * 0.06 / 1.06);

    const landCostItems = [
      { code: '1-1', name: '土地出让金', unit: '万元/亩', unitPrice: landPrice, quantity: acre, quantityFormula: "'规划指标'!B3/666.7", cost: landTransferFee, note: '单价×亩数' },
      { code: '1-2', name: '土地转让费（契税）', unit: '万元', unitPrice: round2(landPrice * 0.03 + 10 / acre), quantity: acre, quantityFormula: "'规划指标'!B3/666.7", cost: deedTax, costFormula: 'F4*0.03+10', note: '出让金×3%+10' },
      { code: '1-3', name: '拆迁补偿费', unit: '万元', unitPrice: 0, quantity: 0, cost: 0, note: '删除，不输出' },
      { code: '1-4', name: '大市政配套费', unit: '元/m²', unitPrice: effectiveMunicipalFee, quantity: landArea, quantityFormula: "'规划指标'!B3", cost: municipalSupportingFee, note: city === '上海' ? '上海默认0' : '' },
      { code: '1-5-2', name: '电力增容费/高可靠性用电', unit: '元/KVA', unitPrice: REFERENCE_PRICES.offsiteMunicipal.powerCapacity, quantity: powerKva, quantityFormula: "('规划指标'!B6*70+'规划指标'!B7*50)/1000", cost: powerCapacityCost, note: '(地上建面×70+地下建面×50)/1000' },
      { code: '1-5-3', name: '红线外给水、排水接驳费', unit: '元/m²', unitPrice: REFERENCE_PRICES.offsiteMunicipal.waterDrainageConnection, quantity: landArea, quantityFormula: "'规划指标'!B3", cost: waterDrainageCost, note: '按用地面积' },
      { code: '1-6', name: '其他费用', unit: '万元', unitPrice: 0, quantity: 0, cost: 0, note: '' },
      { code: '1-7', name: '其中增值税', unit: '万元', unitPrice: 0.06, quantity: offsiteMunicipalTotal, quantityFormula: 'F8+F9', cost: landVAT, costFormula: '(F8+F9)*0.06/1.06', note: '红线外市政×6%/1.06' }
    ];
    const landCostTotal = round2(landCostItems.reduce((s, it) => s + it.cost, 0));

    // 二、前期费用
    const pre = REFERENCE_PRICES.preliminary;
    const prelimItems = [
      { code: '2-1', name: '勘察费用', unit: '元/m²', unitPrice: pre.survey, quantity: landArea, quantityFormula: "'规划指标'!B3", cost: round2(pre.survey * landArea / 10000), note: '按用地面积' },
      { code: '2-2', name: '规划设计费', unit: '元/m²', unitPrice: pre.planning, quantity: aboveGroundArea, quantityFormula: "'规划指标'!B6", cost: round2(pre.planning * aboveGroundArea / 10000), note: '按地上总建面' },
      { code: '2-3', name: '报批报建费', unit: '元/m²', unitPrice: pre.approval, quantity: aboveGroundArea, quantityFormula: "'规划指标'!B6", cost: round2(pre.approval * aboveGroundArea / 10000), note: '按地上总建面' },
      { code: '2-4', name: '造价咨询服务费', unit: '元/m²', unitPrice: pre.consulting, quantity: aboveGroundArea, quantityFormula: "'规划指标'!B6", cost: round2(pre.consulting * aboveGroundArea / 10000), note: '按地上总建面' },
      { code: '2-5', name: '工程监理费', unit: '元/m²', unitPrice: pre.supervision, quantity: aboveGroundArea, quantityFormula: "'规划指标'!B6", cost: round2(pre.supervision * aboveGroundArea / 10000), note: '按地上总建面' },
      { code: '2-6', name: '临时工程费', unit: '元/m²', unitPrice: pre.temporary, quantity: aboveGroundArea, quantityFormula: "'规划指标'!B6", cost: round2(pre.temporary * aboveGroundArea / 10000), note: '按地上总建面' },
      { code: '2-7', name: '拆除工程', unit: '元/m²', unitPrice: pre.demolition, quantity: aboveGroundArea, quantityFormula: "'规划指标'!B6", cost: round2(pre.demolition * aboveGroundArea / 10000), note: '无拆除时为0' },
      { code: '2-8', name: '其他', unit: '元/m²', unitPrice: pre.other, quantity: aboveGroundArea, quantityFormula: "'规划指标'!B6", cost: round2(pre.other * aboveGroundArea / 10000), note: '' }
    ];
    const prelimSubtotal = round2(prelimItems.reduce((s, it) => s + it.cost, 0));
    const prelimVAT = round2(prelimSubtotal * 0.06 / 1.06);
    prelimItems.push({ code: '2-9', name: '其中增值税', unit: '万元', unitPrice: 0.06, quantity: prelimSubtotal, quantityFormula: 'SUM(F14:F21)', cost: prelimVAT, costFormula: 'SUM(F14:F21)*0.06/1.06', note: '前期小计×6%/1.06' });
    const prelimTotal = round2(prelimSubtotal + prelimVAT);

    // 三、建安工程成本
    // 3.1 基础设施费
    const infra = REFERENCE_PRICES.infrastructure;
    const infraItems = [
      { code: '3-1-1', name: '室外给水管网', unit: '元/m²', unitPrice: infra.waterSupply, quantity: aboveGroundArea, quantityFormula: "'规划指标'!B6", cost: round2(infra.waterSupply * aboveGroundArea / 10000), note: '' },
      { code: '3-1-2', name: '室外排水管网', unit: '元/m²', unitPrice: infra.drainage, quantity: aboveGroundArea, quantityFormula: "'规划指标'!B6", cost: round2(infra.drainage * aboveGroundArea / 10000), note: '' },
      { code: '3-1-3', name: '室外电缆工程', unit: '元/m²', unitPrice: infra.cable, quantity: aboveGroundArea, quantityFormula: "'规划指标'!B6", cost: round2(infra.cable * aboveGroundArea / 10000), note: '' },
      { code: '3-1-4', name: '室外弱电工程', unit: '元/m²', unitPrice: infra.weakCurrent, quantity: aboveGroundArea, quantityFormula: "'规划指标'!B6", cost: round2(infra.weakCurrent * aboveGroundArea / 10000), note: '' },
      { code: '3-1-5', name: '室外燃气管网', unit: '元/m²', unitPrice: infra.gas, quantity: aboveGroundArea, quantityFormula: "'规划指标'!B6", cost: round2(infra.gas * aboveGroundArea / 10000), note: '' },
      { code: '3-1-6', name: '供配电设备及安装', unit: '元/m²', unitPrice: infra.powerDistribution, quantity: aboveGroundArea, quantityFormula: "'规划指标'!B6", cost: round2(infra.powerDistribution * aboveGroundArea / 10000), note: '' },
      { code: '3-1-7', name: '水泵房设备及安装', unit: '元/m²', unitPrice: infra.pumpRoom, quantity: aboveGroundArea, quantityFormula: "'规划指标'!B6", cost: round2(infra.pumpRoom * aboveGroundArea / 10000), note: '' },
      { code: '3-1-8', name: '消防设备及安装', unit: '元/m²', unitPrice: infra.fire, quantity: aboveGroundArea, quantityFormula: "'规划指标'!B6", cost: round2(infra.fire * aboveGroundArea / 10000), note: '' },
      { code: '3-1-9', name: '小区车行道路工程', unit: '元/m²', unitPrice: infra.road, quantity: roadArea, quantityFormula: "'规划指标'!B11", cost: round2(infra.road * roadArea / 10000), note: '总用地×30%' }
    ];
    const infraTotal = round2(infraItems.reduce((s, it) => s + it.cost, 0));

    // 3.2 景观工程
    const land = REFERENCE_PRICES.landscape;
    const hardPavementArea = round2(landArea * Math.max(0, 1 - greenRate - roadRatio - buildingDensity));
    const nonDemoGreenArea = round2(Math.max(0, landArea * greenRate - 1000));
    const entranceCount = Math.min(4, Math.max(2, Math.ceil(landArea / 20000)));
    const spongeCityArea = spongeCity ? round2(landArea * greenRate + hardPavementArea) : 0;

    const landscapeItems = [
      { code: '3-2-1', name: '示范区景观', unit: '元/m²', unitPrice: land.demoLandscape, quantity: 1000, cost: round2(land.demoLandscape * 1000 / 10000), note: '固定1000㎡' },
      { code: '3-2-2', name: '硬质铺装', unit: '元/m²', unitPrice: land.hardPavement, quantity: hardPavementArea, quantityFormula: "'规划指标'!B3-'规划指标'!B3*'规划指标'!B10/100-'规划指标'!B11-'规划指标'!B3*'规划指标'!B9/100", cost: round2(land.hardPavement * hardPavementArea / 10000), note: '总用地-绿地-道路-建筑基底' },
      { code: '3-2-3', name: '非示范区绿化', unit: '元/m²', unitPrice: land.greening, quantity: nonDemoGreenArea, quantityFormula: "'规划指标'!B3*'规划指标'!B10/100-1000", cost: round2(land.greening * nonDemoGreenArea / 10000), note: '总用地×绿地率-1000' },
      { code: '3-2-4', name: '出入口开口费', unit: '万元/个', unitPrice: land.entrance, quantity: entranceCount, quantityFormula: "MIN(4,MAX(2,CEILING('规划指标'!B3/20000,1)))", cost: round2(land.entrance * entranceCount), note: 'ceil(总用地/20000),2~4个' },
      { code: '3-2-5', name: '室外石材台阶及散水', unit: '元/m²', unitPrice: land.stoneSteps, quantity: aboveGroundArea, quantityFormula: "'规划指标'!B6", cost: round2(land.stoneSteps * aboveGroundArea / 10000), note: '按地上总建面' },
      { code: '3-2-6', name: '标示标牌', unit: '元/m²', unitPrice: land.signs, quantity: aboveGroundArea, quantityFormula: "'规划指标'!B6", cost: round2(land.signs * aboveGroundArea / 10000), note: '按地上总建面' },
      { code: '3-2-7', name: '围墙', unit: '元/m', unitPrice: land.wall, quantity: wallLength, quantityFormula: "SQRT('规划指标'!B3)*4*1.2", cost: round2(land.wall * wallLength / 10000), note: '√总用地×4×1.2' },
      { code: '3-2-8', name: '海绵城市', unit: '元/m²', unitPrice: land.spongeCity, quantity: spongeCityArea, quantityFormula: spongeCity ? "'规划指标'!B3*'规划指标'!B10/100+'规划指标'!B3-'规划指标'!B3*'规划指标'!B10/100-'规划指标'!B11-'规划指标'!B3*'规划指标'!B9/100" : '0', cost: round2(land.spongeCity * spongeCityArea / 10000), note: spongeCity ? '总用地×绿地率+硬质铺装' : '未启用' }
    ];
    const landscapeTotal = round2(landscapeItems.reduce((s, it) => s + it.cost, 0));

    // 3.3 公建配套
    const publicFacilityItems = [
      { code: '3-3-1', name: '地下室', unit: '元/m²', unitPrice: 3700, quantity: undergroundArea, quantityFormula: "'规划指标'!B7", cost: round2(3700 * undergroundArea / 10000), note: '', ownArea: true, underground: true },
      { code: '3-3-2', name: '配套楼', unit: '元/m²', unitPrice: 2200, quantity: metrics.supportArea, quantityFormula: "'规划指标'!B19", cost: round2(2200 * metrics.supportArea / 10000), note: '', ownArea: true },
      { code: '3-3-3', name: '配套宿舍', unit: '元/m²', unitPrice: 2600, quantity: metrics.dormArea, quantityFormula: "'规划指标'!B20", cost: round2(2600 * metrics.dormArea / 10000), note: '', ownArea: true }
    ];
    const publicFacilityTotal = round2(publicFacilityItems.reduce((s, it) => s + it.cost, 0));

    // 3.4 单体建安成本
    let splitUnitPrice = 0;
    if (metrics.splitArea > 0) splitUnitPrice = (metrics.splitSingleArea * 2300 + metrics.splitDuplexArea * 2200) / metrics.splitArea;
    let layerUnitPrice = 0;
    if (metrics.layerArea > 0) layerUnitPrice = (metrics.layerSingleArea * 2400 + metrics.layerMultiArea * 2300) / metrics.layerArea;
    let towerUnitPrice = 0;
    const th = metrics.towerHeight;
    if (metrics.towerArea > 0) {
      if (th <= 50) towerUnitPrice = 2400;
      else if (th <= 60) towerUnitPrice = 2500;
      else if (th <= 80) towerUnitPrice = 2600;
      else if (th <= 100) towerUnitPrice = 2800;
      else towerUnitPrice = 3000;
    }

    const buildingItems = [
      { code: '3-4-1', name: '轻钢厂房', unit: '元/m²', unitPrice: 1500, quantity: metrics.lightSteelArea, quantityFormula: "'规划指标'!B14", cost: round2(1500 * metrics.lightSteelArea / 10000), note: '非计容建面', ownArea: true },
      { code: '3-4-2', name: '分栋厂房', unit: '元/m²', unitPrice: round2(splitUnitPrice), quantity: metrics.splitArea, quantityFormula: "'规划指标'!B15", cost: round2(splitUnitPrice * metrics.splitArea / 10000), note: '独栋2300/双拼2200加权', ownArea: true },
      { code: '3-4-3', name: '分层厂房', unit: '元/m²', unitPrice: round2(layerUnitPrice), quantity: metrics.layerArea, quantityFormula: "'规划指标'!B16", cost: round2(layerUnitPrice * metrics.layerArea / 10000), note: '独栋2400/双拼三拼2300加权', ownArea: true },
      { code: '3-4-4', name: '产业大厦', unit: '元/m²', unitPrice: round2(towerUnitPrice), quantity: metrics.towerArea, quantityFormula: "'规划指标'!B17", cost: round2(towerUnitPrice * metrics.towerArea / 10000), note: '按高度分档', ownArea: true }
    ];
    const buildingTotal = round2(buildingItems.reduce((s, it) => s + it.cost, 0));

    const constructionSubtotal = round2(infraTotal + landscapeTotal + publicFacilityTotal + buildingTotal);
    const constructionVAT = round2(constructionSubtotal * 0.09 / 1.09);
    const contingency = round2((landCostTotal + prelimTotal + constructionSubtotal) * 0.03);
    const constructionTotal = round2(constructionSubtotal + constructionVAT + contingency);

    // 四~六、开发间接费/营销费/公司管理费
    const indirectCost = 0;
    const marketingCost = 0;
    const managementCost = 0;

    // 七、财务费用
    const interestBase = landCostTotal + prelimTotal + constructionSubtotal;
    const totalConstructionPeriod = devPhases * phasePeriod;
    const avgInterestYears = totalConstructionPeriod / 2;
    const interestExpense = round2(interestBase * financingRatio * financingRate * avgInterestYears);
    const bankFee = interestExpense > 0 ? 30 : 0;
    const financialTotal = round2(interestExpense + bankFee);

    // 汇总
    const totalInvestment = round2(landCostTotal + prelimTotal + constructionTotal + indirectCost + marketingCost + managementCost + financialTotal);
    const unitGroundCost = totalBuildingArea > 0 ? round2(totalInvestment * 10000 / totalBuildingArea) : 0;
    const unitAboveGroundCost = aboveGroundArea > 0 ? round2(totalInvestment * 10000 / aboveGroundArea) : 0;

    return {
      inputs: {
        landPrice,
        municipalFee: effectiveMunicipalFee,
        city,
        spongeCity,
        financingRatio: financingRatio * 100,
        financingRate: financingRate * 100,
        devPhases,
        phasePeriod
      },
      metrics: {
        landArea,
        acre,
        far,
        ancillaryRatio,
        rdRatio,
        aboveGroundArea,
        undergroundArea,
        totalBuildingArea,
        greenRate,
        buildingDensity,
        roadRatio,
        roadArea,
        wallLength,
        ...metrics
      },
      landCost: { items: landCostItems, total: landCostTotal },
      preliminary: { items: prelimItems, total: prelimTotal },
      infrastructure: { items: infraItems, total: infraTotal },
      landscape: { items: landscapeItems, total: landscapeTotal },
      publicFacility: { items: publicFacilityItems, total: publicFacilityTotal },
      building: { items: buildingItems, total: buildingTotal },
      construction: { subtotal: constructionSubtotal, vat: constructionVAT, contingency: contingency, total: constructionTotal },
      indirect: { cost: indirectCost },
      marketing: { cost: marketingCost },
      management: { cost: managementCost },
      financial: { interest: interestExpense, bankFee: bankFee, total: financialTotal },
      summary: {
        totalInvestment,
        unitGroundCost,
        unitAboveGroundCost,
        landCostRatio: totalInvestment > 0 ? round2(landCostTotal / totalInvestment * 100) : 0,
        constructionRatio: totalInvestment > 0 ? round2(constructionTotal / totalInvestment * 100) : 0
      }
    };
  };

  // ==================== 简化版投资估算 ====================
  NS.simplifyInvestmentEstimate = function (full) {
    return [
      { code: '一', category: '土地配套费用', amount: full.landCost.total },
      { code: '二', category: '前期费用', amount: full.preliminary.total },
      { code: '三', category: '建安工程成本', amount: full.construction.total },
      { code: '四', category: '开发间接费', amount: full.indirect.cost },
      { code: '五', category: '营销费用', amount: full.marketing.cost },
      { code: '六', category: '公司管理费', amount: full.management.cost },
      { code: '七', category: '财务费用', amount: full.financial.total },
      { code: '合计', category: '发展成本合计', amount: full.summary.totalInvestment }
    ];
  };


  // ==================== 静态投资分析 ====================
  const SALE_PRIORITY = ['轻钢厂房', '分栋厂房', '分层厂房', '产业大厦'];
  const RENT_PRIORITY = ['产业大厦', '分层厂房', '分栋厂房', '轻钢厂房'];

  function allocateAreaByPriority(targetArea, areaByType, priority) {
    const allocation = {};
    let remaining = targetArea;
    priority.forEach(type => {
      if (remaining <= 0) return;
      const available = areaByType[type] || 0;
      const allocate = Math.min(remaining, available);
      allocation[type] = allocate;
      remaining -= allocate;
    });
    return { allocation, remaining };
  }

  NS.calculateStaticAnalysis = function (inputs, result, projectData, investmentEstimate) {
    inputs = inputs || {};
    const products = (result && result.products) || [];
    const pd = projectData || {};
    const inv = investmentEstimate || {};
    const metrics = inv.metrics || getProductMetrics(result);

    const totalCap = safeNum(result.totalCap, 0);
    const aboveGroundArea = safeNum(result.totalArea, 0);
    const ancillaryRatio = safeNum(pd.ancillaryRatio, 0);
    const rdRatio = safeNum(pd.rdRatio, 0);
    const supportArea = metrics.supportArea || 0;

    // 用户输入与默认费用率
    const saleRatio = safeNum(inputs.saleRatio, 0) / 100;
    const rentSplit = safeNum(inputs.rentSplit, 0);
    const priceSplit = safeNum(inputs.priceSplit, 0);
    const rentLayer = inputs.rentLayer != null ? safeNum(inputs.rentLayer, rentSplit) : rentSplit;
    const priceLayer = inputs.priceLayer != null ? safeNum(inputs.priceLayer, priceSplit) : priceSplit;
    const marketingRate = safeNum(inputs.marketingRate, 3.5) / 100;
    const managementRate = safeNum(inputs.managementRate, 3) / 100;
    const rentalOpRate = safeNum(inputs.rentalOpRate, 6) / 100;
    const occupancyRate = safeNum(inputs.occupancyRate, 90) / 100;
    const rentalPeriod = Math.max(1, Math.round(safeNum(inputs.rentalPeriod, 20)));
    const rentGrowthRate = safeNum(inputs.rentGrowthRate, 0) / 100;

    // 产品价格映射
    const priceMap = {};
    const rentMap = {};
    products.forEach(p => {
      if (p.type === '轻钢厂房') { priceMap[p.type] = priceSplit; rentMap[p.type] = rentSplit; }
      else if (p.type === '分栋厂房') { priceMap[p.type] = priceSplit; rentMap[p.type] = rentSplit; }
      else if (p.type === '分层厂房') { priceMap[p.type] = priceLayer; rentMap[p.type] = rentLayer; }
      else if (p.type === '产业大厦') { priceMap[p.type] = priceLayer; rentMap[p.type] = rentLayer; }
      else if (p.type === '配套宿舍') { priceMap[p.type] = 0; rentMap[p.type] = rentSplit; }
      else if (p.type === '配套楼') { priceMap[p.type] = 0; rentMap[p.type] = 0; }
    });

    // 按产品类型汇总建筑面积（同一类型可能含多个面积段/拼合形式）
    const areaByType = {};
    products.forEach(p => {
      areaByType[p.type] = (areaByType[p.type] || 0) + (p.totalArea || 0);
    });

    // 面积分配
    const saleableCapArea = round2(totalCap * Math.max(0, 1 - ancillaryRatio - rdRatio) * saleRatio);
    const rentableArea = round2(Math.max(0, aboveGroundArea - saleableCapArea - supportArea));

    // 销售分配
    const saleAlloc = allocateAreaByPriority(saleableCapArea, areaByType, SALE_PRIORITY);
    const soldAreaByType = saleAlloc.allocation;
    const soldAreaTotal = round2(Object.values(soldAreaByType).reduce((s, v) => s + v, 0));

    // 出租分配
    // 1. 配套宿舍强制全部出租
    const dormAreaTotal = areaByType['配套宿舍'] || 0;
    const rentedAreaByType = { '配套宿舍': Math.min(dormAreaTotal, rentableArea) };
    // 2. 剩余可租面积按优先级分配给厂房类产品
    const remainingRentable = round2(Math.max(0, rentableArea - rentedAreaByType['配套宿舍']));
    const remainingAreaByType = {};
    SALE_PRIORITY.forEach(type => {
      remainingAreaByType[type] = Math.max(0, (areaByType[type] || 0) - (soldAreaByType[type] || 0));
    });
    const rentAlloc = allocateAreaByPriority(remainingRentable, remainingAreaByType, RENT_PRIORITY);
    Object.assign(rentedAreaByType, rentAlloc.allocation);
    const rentedAreaTotal = round2(Object.values(rentedAreaByType).reduce((s, v) => s + v, 0));

    const RENT_DISPLAY_ORDER = ['产业大厦', '分层厂房', '分栋厂房', '轻钢厂房', '配套宿舍'];

    // 加权平均售价/租金
    let weightedSalePrice = 0;
    let weightedRent = 0;
    if (soldAreaTotal > 0) {
      weightedSalePrice = SALE_PRIORITY.reduce((s, type) => s + (soldAreaByType[type] || 0) * (priceMap[type] || 0), 0) / soldAreaTotal;
    }
    if (rentedAreaTotal > 0) {
      weightedRent = RENT_DISPLAY_ORDER.reduce((s, type) => s + (rentedAreaByType[type] || 0) * (rentMap[type] || 0), 0) / rentedAreaTotal;
    }
    weightedSalePrice = round2(weightedSalePrice);
    weightedRent = round2(weightedRent);

    // 销售测算
    const saleRevenue = round2(soldAreaTotal * weightedSalePrice);
    const landCostItems = inv.landCost ? inv.landCost.items : [];
    const landTransferFeeItem = landCostItems.find(it => it.code === '1-1');
    const deedTaxItem = landCostItems.find(it => it.code === '1-2');
    const landCostWithDeed = (landTransferFeeItem ? landTransferFeeItem.cost : 0) + (deedTaxItem ? deedTaxItem.cost : 0);
    const landCostPerArea = aboveGroundArea > 0 ? round2(landCostWithDeed * 10000 / aboveGroundArea) : 0;
    const unitCost = inv.summary ? round2(inv.summary.totalInvestment * 10000 / inv.metrics.totalBuildingArea) : 0;
    const landCostForSale = round2(soldAreaTotal * landCostPerArea / 10000);
    const constructionCostForSale = round2(soldAreaTotal * unitCost / 10000);
    const saleTaxSurcharge = round2(saleRevenue / 1.09 * 0.006);
    const marketingCostSale = round2(saleRevenue * marketingRate);
    const managementCostSale = round2(saleRevenue * managementRate);
    const financialCostSale = 0; // 简化处理
    const saleProfit = round2(saleRevenue - landCostForSale - constructionCostForSale - saleTaxSurcharge - marketingCostSale - managementCostSale - financialCostSale);
    const saleIncomeTax = round2(Math.max(0, saleProfit) * 0.25);
    const saleNetProfit = round2(saleProfit - saleIncomeTax);
    const saleNetMargin = saleRevenue > 0 ? round2(saleNetProfit / saleRevenue * 100) : 0;

    // 租赁测算（按元/m²/年口径）
    const monthlyRent = round2(weightedRent * 30);
    const yearlyRent = round2(monthlyRent * 12);
    const effectiveYearlyRent = round2(yearlyRent * occupancyRate);
    const taxSurcharge = round2(effectiveYearlyRent * 0.006);
    const propertyTax = round2(effectiveYearlyRent * 0.12);
    const landUseTax = 6;
    const rentalOpCost = round2(effectiveYearlyRent * rentalOpRate);
    const netRentPerSqm = round2(effectiveYearlyRent - taxSurcharge - propertyTax - landUseTax - rentalOpCost);
    const netRentalIncome = round2(netRentPerSqm * rentedAreaTotal / 10000);
    const rentalTotalInvestment = round2(rentedAreaTotal * unitCost / 10000);
    const noi = rentalTotalInvestment > 0 ? round2(netRentalIncome / rentalTotalInvestment * 100) : 0;

    // 租售面积分配明细
    const saleDetails = SALE_PRIORITY.map(type => {
      const area = soldAreaByType[type] || 0;
      const price = priceMap[type] || 0;
      return { type, area: round2(area), price: round2(price), revenue: round2(area * price) };
    });
    const rentDetails = RENT_DISPLAY_ORDER.map(type => {
      const area = rentedAreaByType[type] || 0;
      const rent = rentMap[type] || 0;
      return { type, area: round2(area), rent: round2(rent), annualRevenue: round2(area * rent * 365 * occupancyRate / 10000) };
    });

    // 综合汇总
    const totalInvestment = inv.summary ? inv.summary.totalInvestment : 0;
    const financingRatioInput = (inv && inv.inputs && inv.inputs.financingRatio) || 0;
    const fundingGap = round2(totalInvestment - (1 - financingRatioInput / 100) * totalInvestment - saleRevenue);
    const saleProfitCoverRatio = rentalTotalInvestment > 0 ? round2(saleNetProfit / rentalTotalInvestment * 100) : 0;
    const totalInvestmentReturn = totalInvestment > 0 ? round2(netRentalIncome / totalInvestment * 100) : 0;
    const paybackPeriod = netRentalIncome > 0 ? round2(totalInvestment / netRentalIncome) : 0;

    return {
      inputs: {
        saleRatio: saleRatio * 100,
        rentSplit,
        priceSplit,
        rentLayer,
        priceLayer,
        marketingRate: marketingRate * 100,
        managementRate: managementRate * 100,
        rentalOpRate: rentalOpRate * 100,
        occupancyRate: occupancyRate * 100,
        rentalPeriod,
        rentGrowthRate: rentGrowthRate * 100,
        landPrice: (inv && inv.inputs && inv.inputs.landPrice) || safeNum(inputs.landPrice, 0),
        municipalFee: safeNum(inputs.municipalFee, 0),
        financingRatio: financingRatioInput
      },
      metrics: {
        landArea: safeNum(pd.landArea, 0),
        far: safeNum(pd.far, 0),
        totalCap,
        aboveGroundArea,
        undergroundArea: safeNum((inv.metrics && inv.metrics.undergroundArea) || 0, 0),
        totalBuildingArea: (inv.metrics && inv.metrics.totalBuildingArea) || aboveGroundArea,
        saleableCapArea,
        rentableArea,
        supportArea,
        soldAreaTotal,
        rentedAreaTotal
      },
      constructionCost: { landCostPerArea, unitCost },
      sale: {
        weightedPrice: weightedSalePrice,
        details: saleDetails,
        totalRevenue: saleRevenue,
        landCost: landCostForSale,
        constructionCost: constructionCostForSale,
        taxSurcharge: saleTaxSurcharge,
        marketingCost: marketingCostSale,
        managementCost: managementCostSale,
        financialCost: financialCostSale,
        profit: saleProfit,
        incomeTax: saleIncomeTax,
        netProfit: saleNetProfit,
        netMargin: saleNetMargin
      },
      rent: {
        weightedRent,
        monthlyRent,
        yearlyRent,
        occupancyRate: occupancyRate * 100,
        effectiveYearlyRent,
        taxSurcharge,
        propertyTax,
        landUseTax,
        rentalOpCost,
        netRentPerSqm,
        netRentalIncome,
        rentalTotalInvestment,
        noi,
        details: rentDetails
      },
      summary: {
        totalInvestment,
        saleNetProfit,
        netRentalIncome,
        fundingGap,
        saleProfitCoverRatio,
        saleNetMargin,
        noi,
        totalInvestmentReturn,
        paybackPeriod
      }
    };
  };


  // ==================== 动态投资分析（占位框架） ====================
  NS.calculateDynamicAnalysis = function (inputs, result, projectData, staticAnalysis) {
    return {
      status: 'placeholder',
      message: '动态投资分析逻辑开发中，请明天继续。'
    };
  };

  // ==================== Excel 导出：样式与公式工具 ====================
  // 使用 xlsx-js-style（兼容 SheetJS API，支持写入样式）
  const STYLE = {
    fontName: '微软雅黑',
    headerFill: '0B2B5C',
    headerFont: 'FFFFFF',
    subtotalFill: 'E0F2FE',
    totalFill: '1E4E8C',
    totalFont: 'FFFFFF',
    borderColor: 'D1D5DB',
    textColor: '111827'
  };

  function cell(v, opts) {
    opts = opts || {};
    const c = { v: typeof v === 'number' ? round2(v) : v };
    if (opts.f) c.f = opts.f;
    c.s = {
      font: { name: STYLE.fontName, sz: opts.sz || 11, bold: !!opts.bold, color: { rgb: opts.fontColor || STYLE.textColor } },
      alignment: { horizontal: opts.align || (typeof v === 'number' ? 'right' : 'left'), vertical: 'center', wrapText: !!opts.wrap },
      border: {
        top: { style: 'thin', color: { rgb: STYLE.borderColor } },
        bottom: { style: 'thin', color: { rgb: STYLE.borderColor } },
        left: { style: 'thin', color: { rgb: STYLE.borderColor } },
        right: { style: 'thin', color: { rgb: STYLE.borderColor } }
      }
    };
    if (opts.fill) {
      c.s.fill = { patternType: 'solid', fgColor: { rgb: opts.fill } };
    }
    if (opts.numFmt) c.s.numFmt = opts.numFmt;
    return c;
  }

  function headerCell(v) { return cell(v, { bold: true, fill: STYLE.headerFill, fontColor: STYLE.headerFont, align: 'center', sz: 11 }); }
  function subtotalCell(v, f) { return cell(v, { bold: true, fill: STYLE.subtotalFill, numFmt: '#,##0.00', f: f }); }
  function totalCell(v, f) { return cell(v, { bold: true, fill: STYLE.totalFill, fontColor: STYLE.totalFont, numFmt: '#,##0.00', f: f }); }
  function moneyCell(v, f) { return cell(v, { numFmt: '#,##0.00', align: 'right', f: f }); }
  function numCell(v, f) { return cell(v, { numFmt: '#,##0.00', align: 'right', f: f }); }
  function textCell(v, indent) { return cell((indent || '') + v, { align: 'left' }); }

  function setWsMeta(ws, cols) {
    ws['!cols'] = cols.map(w => ({ wch: w }));
  }

  function encode(r, c) { return XLSX.utils.encode_cell({ r: r, c: c }); }
  function col(c) { return XLSX.utils.encode_col(c); }

  function addItems(ws, startRow, items, costCol) {
    items.forEach((it, idx) => {
      const r = startRow + idx;
      ws[encode(r, 0)] = textCell(it.code || '', '  ');
      ws[encode(r, 1)] = textCell(it.name, '  ');
      ws[encode(r, 2)] = textCell(it.unit || '');
      ws[encode(r, 3)] = numCell(it.unitPrice);
      // 工程量优先使用公式引用（如 '规划指标'!B3），回退到数值
      if (it.quantityFormula) {
        ws[encode(r, 4)] = numCell(it.quantity, it.quantityFormula);
      } else {
        ws[encode(r, 4)] = numCell(it.quantity);
      }
      const unit = it.unit || '';
      const hasDivide = unit.includes('元/m²') || unit.includes('元/m') || unit.includes('元/KVA');
      const formula = hasDivide ? `${col(3)}${r + 1}*${col(4)}${r + 1}/10000` : `${col(3)}${r + 1}*${col(4)}${r + 1}`;
      // 若 item 自定义了成本公式（如增值税），优先使用
      const costFormula = it.costFormula || formula;
      ws[encode(r, costCol)] = moneyCell(it.cost, costFormula);

      // 单位建面成本 / 单位地上建面成本分母规则
      let groundDenom, aboveDenom, groundDenomFormula, aboveDenomFormula;
      if (it.ownArea) {
        groundDenom = it.quantity || 1;
        aboveDenom = it.underground ? 0 : (it.quantity || 1);
        groundDenomFormula = it.quantityFormula || groundDenom;
        aboveDenomFormula = it.underground ? 0 : (it.quantityFormula || aboveDenom);
      } else {
        groundDenom = ws._totalBuildingArea || 1;
        aboveDenom = ws._aboveGroundArea || 1;
        groundDenomFormula = ws._totalBuildingAreaRef || 1;
        aboveDenomFormula = ws._aboveGroundAreaRef || 1;
      }
      ws[encode(r, costCol + 1)] = numCell(round2(it.cost * 10000 / groundDenom),
        `IF(${groundDenomFormula}=0,0,${col(costCol)}${r + 1}/${groundDenomFormula}*10000)`);
      if (aboveDenom === 0) {
        ws[encode(r, costCol + 2)] = numCell(0, null);
      } else {
        ws[encode(r, costCol + 2)] = numCell(round2(it.cost * 10000 / aboveDenom),
          `IF(${aboveDenomFormula}=0,0,${col(costCol)}${r + 1}/${aboveDenomFormula}*10000)`);
      }
      ws[encode(r, costCol + 3)] = textCell(it.note || '');
    });
    return startRow + items.length;
  }

  NS.downloadInvestmentEstimateExcel = function (fullEstimate, fileName) {
    if (typeof XLSX === 'undefined') { alert('Excel 导出库未加载，请检查网络。'); return; }
    const wb = XLSX.utils.book_new();

    // Sheet0：规划指标
    const ws0 = {};
    ws0[encode(0, 0)] = cell('规划指标', { bold: true, sz: 14 });
    ws0['!merge'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 2 } }];
    ['指标', '数值', '单位'].forEach((h, c) => ws0[encode(1, c)] = headerCell(h));
    const planningMetricRows = [
      ['总用地面积', round2(fullEstimate.metrics.landArea), 'm²'],
      ['容积率', round2(fullEstimate.metrics.far), '—'],
      ['计容总建筑面积', round2(fullEstimate.metrics.totalCap), 'm²'],
      ['地上总建筑面积', round2(fullEstimate.metrics.aboveGroundArea), 'm²'],
      ['地下总建筑面积', round2(fullEstimate.metrics.undergroundArea), 'm²'],
      ['总建筑面积', round2(fullEstimate.metrics.totalBuildingArea), 'm²'],
      ['建筑密度', round2(fullEstimate.metrics.buildingDensity * 100), '%'],
      ['绿地率', round2(fullEstimate.metrics.greenRate * 100), '%'],
      ['道路面积', round2(fullEstimate.metrics.roadArea), 'm²'],
      ['配套占比', round2(fullEstimate.metrics.ancillaryRatio * 100), '%'],
      ['研发办公占比', round2(fullEstimate.metrics.rdRatio * 100), '%'],
      ['轻钢厂房建筑面积', round2(fullEstimate.metrics.lightSteelArea), 'm²'],
      ['分栋厂房建筑面积', round2(fullEstimate.metrics.splitArea), 'm²'],
      ['分层厂房建筑面积', round2(fullEstimate.metrics.layerArea), 'm²'],
      ['产业大厦建筑面积', round2(fullEstimate.metrics.towerArea), 'm²'],
      ['产业大厦建筑高度', round2(fullEstimate.metrics.towerHeight), 'm'],
      ['配套楼建筑面积', round2(fullEstimate.metrics.supportArea), 'm²'],
      ['配套宿舍建筑面积', round2(fullEstimate.metrics.dormArea), 'm²'],
      ['分栋独栋建筑面积', round2(fullEstimate.metrics.splitSingleArea || 0), 'm²'],
      ['分栋双拼建筑面积', round2(fullEstimate.metrics.splitDuplexArea || 0), 'm²'],
      ['分层独栋建筑面积', round2(fullEstimate.metrics.layerSingleArea || 0), 'm²'],
      ['分层双拼/三拼建筑面积', round2(fullEstimate.metrics.layerMultiArea || 0), 'm²']
    ];
    planningMetricRows.forEach((row, idx) => {
      const r = idx + 2;
      ws0[encode(r, 0)] = textCell(row[0]);
      ws0[encode(r, 1)] = numCell(row[1]);
      ws0[encode(r, 2)] = textCell(row[2]);
    });
    ws0['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: planningMetricRows.length + 1, c: 2 } });
    setWsMeta(ws0, [24, 16, 12]);
    XLSX.utils.book_append_sheet(wb, ws0, '规划指标');

    // Sheet0.5：加权平均造价表
    const ws0_5 = {};
    ws0_5[encode(0, 0)] = cell('加权平均造价表', { bold: true, sz: 14 });
    ws0_5['!merge'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 5 } }];
    ['产品类型', '形态', '面积（㎡）', '单价（元/㎡）', '成本（万元）', '加权平均单价（元/㎡）']
      .forEach((h, c) => ws0_5[encode(1, c)] = headerCell(h));
    const m = fullEstimate.metrics;
    const costPriceRows = [];
    costPriceRows.push({ type: '轻钢厂房', form: '主体/火车头', area: m.lightSteelArea, areaRef: "'规划指标'!B14", price: 1500 });
    if (m.splitArea > 0) {
      costPriceRows.push({ type: '分栋厂房', form: '独栋', area: m.splitSingleArea, areaRef: "'规划指标'!B21", price: 2300 });
      if (m.splitDuplexArea > 0) costPriceRows.push({ type: '分栋厂房', form: '双拼', area: m.splitDuplexArea, areaRef: "'规划指标'!B22", price: 2200 });
    }
    if (m.layerArea > 0) {
      costPriceRows.push({ type: '分层厂房', form: '独栋', area: m.layerSingleArea, areaRef: "'规划指标'!B23", price: 2400 });
      if (m.layerMultiArea > 0) costPriceRows.push({ type: '分层厂房', form: '双拼/三拼', area: m.layerMultiArea, areaRef: "'规划指标'!B24", price: 2300 });
    }
    if (m.towerArea > 0) {
      const th = m.towerHeight;
      let towerPrice = 0;
      let towerBand = 50;
      if (th <= 50) { towerPrice = 2400; towerBand = 50; }
      else if (th <= 60) { towerPrice = 2500; towerBand = 60; }
      else if (th <= 80) { towerPrice = 2600; towerBand = 80; }
      else if (th <= 100) { towerPrice = 2800; towerBand = 100; }
      else { towerPrice = 3000; towerBand = 100; }
      costPriceRows.push({ type: '产业大厦', form: `H≤${towerBand}m`, area: m.towerArea, areaRef: "'规划指标'!B17", price: towerPrice });
    }
    costPriceRows.forEach((it, idx) => {
      const r = idx + 2; // 0-based
      const rowNum = r + 1; // 1-based
      ws0_5[encode(r, 0)] = textCell(it.type);
      ws0_5[encode(r, 1)] = textCell(it.form);
      ws0_5[encode(r, 2)] = numCell(it.area, it.areaRef);
      ws0_5[encode(r, 3)] = numCell(it.price);
      ws0_5[encode(r, 4)] = moneyCell(round2(it.area * it.price / 10000), `C${rowNum}*D${rowNum}/10000`);
      ws0_5[encode(r, 5)] = numCell(0);
    });
    // 计算每种类型的行范围（1-based）
    const typeRange = {};
    costPriceRows.forEach((it, idx) => {
      const rowNum = idx + 3;
      if (!typeRange[it.type]) typeRange[it.type] = { first: rowNum, last: rowNum };
      else typeRange[it.type].last = rowNum;
    });
    // 写入加权平均单价：有面积的子形态行显示该类型加权平均单价，面积为0的留空
    costPriceRows.forEach((it, idx) => {
      const r = idx + 2;
      const range = typeRange[it.type];
      if (it.area > 0 && range) {
        const formula = `IF(SUM(C${range.first}:C${range.last})=0,0,SUMPRODUCT(C${range.first}:C${range.last},D${range.first}:D${range.last})/SUM(C${range.first}:C${range.last}))`;
        ws0_5[encode(r, 5)] = numCell(0, formula);
      } else {
        ws0_5[encode(r, 5)] = textCell('—');
      }
    });
    const cprTotalRow = costPriceRows.length + 2; // 0-based
    const cprTotalRowNum = cprTotalRow + 1; // 1-based
    const cprDataLastRowNum = cprTotalRowNum - 1; // 1-based，最后一个数据行
    ws0_5[encode(cprTotalRow, 0)] = totalCell('合计');
    ws0_5[encode(cprTotalRow, 2)] = totalCell(0, `SUM(C3:C${cprDataLastRowNum})`);
    ws0_5[encode(cprTotalRow, 4)] = totalCell(0, `SUM(E3:E${cprDataLastRowNum})`);
    ws0_5[encode(cprTotalRow, 5)] = totalCell(0, `IF(C${cprTotalRowNum}=0,0,E${cprTotalRowNum}/C${cprTotalRowNum}*10000)`);
    ws0_5['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: cprTotalRow, c: 5 } });
    setWsMeta(ws0_5, [14, 16, 14, 14, 14, 18]);
    XLSX.utils.book_append_sheet(wb, ws0_5, '加权平均造价表');

    // Sheet1：完整版
    const ws = {};
    const cols = [10, 24, 14, 14, 16, 16, 16, 18, 28];
    const totalBuildingArea = fullEstimate.metrics.totalBuildingArea || 1;
    const aboveGroundArea = fullEstimate.metrics.aboveGroundArea || 1;
    ws._totalBuildingArea = totalBuildingArea;
    ws._aboveGroundArea = aboveGroundArea;
    ws._totalBuildingAreaRef = "'规划指标'!B8";
    ws._aboveGroundAreaRef = "'规划指标'!B6";

    ws[encode(0, 0)] = cell('投资估算表（完整版）', { bold: true, sz: 14, align: 'left' });
    ws['!merge'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 8 } }];

    ['科目编码', '成本科目', '指标单位', '成本指标', '工程量', '成本（万元）', '单位建面成本（元/㎡）', '单位地上建面成本（元/㎡）', '科目说明']
      .forEach((h, c) => ws[encode(1, c)] = headerCell(h));

    let row = 2;
    // 一、土地配套费用
    ws[encode(row, 0)] = textCell('一');
    ws[encode(row, 1)] = subtotalCell('土地配套费用');
    for (let c = 2; c <= 8; c++) ws[encode(row, c)] = cell('', { fill: STYLE.subtotalFill });
    const landStart = row + 1;
    row = addItems(ws, landStart, fullEstimate.landCost.items, 5, 4, 3);
    ws[encode(row, 1)] = subtotalCell('  小计');
    ws[encode(row, 5)] = subtotalCell(fullEstimate.landCost.total, `SUM(${col(5)}${landStart + 1}:${col(5)}${row})`);
    ws[encode(row, 6)] = numCell(0, `${col(5)}${row + 1}/${ws._totalBuildingAreaRef}*10000`);
    ws[encode(row, 7)] = numCell(0, `${col(5)}${row + 1}/${ws._aboveGroundAreaRef}*10000`);
    const landSubtotalRow = row + 1;
    row += 1;

    // 二、前期费用
    ws[encode(row, 0)] = textCell('二');
    ws[encode(row, 1)] = subtotalCell('前期费用');
    for (let c = 2; c <= 8; c++) ws[encode(row, c)] = cell('', { fill: STYLE.subtotalFill });
    const prelimStart = row + 1;
    row = addItems(ws, prelimStart, fullEstimate.preliminary.items, 5, 4, 3);
    ws[encode(row, 1)] = subtotalCell('  小计');
    ws[encode(row, 5)] = subtotalCell(fullEstimate.preliminary.total, `SUM(${col(5)}${prelimStart + 1}:${col(5)}${row})`);
    ws[encode(row, 6)] = numCell(0, `${col(5)}${row + 1}/${ws._totalBuildingAreaRef}*10000`);
    ws[encode(row, 7)] = numCell(0, `${col(5)}${row + 1}/${ws._aboveGroundAreaRef}*10000`);
    const prelimSubtotalRow = row + 1;
    row += 1;

    // 三、建安工程成本
    ws[encode(row, 0)] = textCell('三');
    ws[encode(row, 1)] = subtotalCell('建安工程成本');
    for (let c = 2; c <= 8; c++) ws[encode(row, c)] = cell('', { fill: STYLE.subtotalFill });
    row += 1;

    // 3.1 基础设施费
    ws[encode(row, 1)] = subtotalCell('  3.1 基础设施费');
    for (let c = 2; c <= 8; c++) ws[encode(row, c)] = cell('', { fill: STYLE.subtotalFill });
    const infraStart = row + 1;
    row = addItems(ws, infraStart, fullEstimate.infrastructure.items, 5, 4, 3);
    ws[encode(row, 1)] = subtotalCell('    小计');
    ws[encode(row, 5)] = subtotalCell(fullEstimate.infrastructure.total, `SUM(${col(5)}${infraStart + 1}:${col(5)}${row})`);
    ws[encode(row, 6)] = numCell(0, `${col(5)}${row + 1}/${ws._totalBuildingAreaRef}*10000`);
    ws[encode(row, 7)] = numCell(0, `${col(5)}${row + 1}/${ws._aboveGroundAreaRef}*10000`);
    const infraSubtotalRow = row + 1;
    row += 1;

    // 3.2 景观工程
    ws[encode(row, 1)] = subtotalCell('  3.2 景观工程');
    for (let c = 2; c <= 8; c++) ws[encode(row, c)] = cell('', { fill: STYLE.subtotalFill });
    const landStart2 = row + 1;
    row = addItems(ws, landStart2, fullEstimate.landscape.items, 5, 4, 3);
    ws[encode(row, 1)] = subtotalCell('    小计');
    ws[encode(row, 5)] = subtotalCell(fullEstimate.landscape.total, `SUM(${col(5)}${landStart2 + 1}:${col(5)}${row})`);
    ws[encode(row, 6)] = numCell(0, `${col(5)}${row + 1}/${ws._totalBuildingAreaRef}*10000`);
    ws[encode(row, 7)] = numCell(0, `${col(5)}${row + 1}/${ws._aboveGroundAreaRef}*10000`);
    const landscapeSubtotalRow = row + 1;
    row += 1;

    // 3.3 公建配套
    ws[encode(row, 1)] = subtotalCell('  3.3 公建配套');
    for (let c = 2; c <= 8; c++) ws[encode(row, c)] = cell('', { fill: STYLE.subtotalFill });
    const pubStart = row + 1;
    row = addItems(ws, pubStart, fullEstimate.publicFacility.items, 5, 4, 3);
    ws[encode(row, 1)] = subtotalCell('    小计');
    ws[encode(row, 5)] = subtotalCell(fullEstimate.publicFacility.total, `SUM(${col(5)}${pubStart + 1}:${col(5)}${row})`);
    ws[encode(row, 6)] = numCell(0, `${col(5)}${row + 1}/${ws._totalBuildingAreaRef}*10000`);
    ws[encode(row, 7)] = numCell(0, `${col(5)}${row + 1}/${ws._aboveGroundAreaRef}*10000`);
    const publicSubtotalRow = row + 1;
    row += 1;

    // 3.4 单体建安成本
    ws[encode(row, 1)] = subtotalCell('  3.4 单体建安成本');
    for (let c = 2; c <= 8; c++) ws[encode(row, c)] = cell('', { fill: STYLE.subtotalFill });
    const buildStart = row + 1;
    row = addItems(ws, buildStart, fullEstimate.building.items, 5, 4, 3);
    ws[encode(row, 1)] = subtotalCell('    小计');
    ws[encode(row, 5)] = subtotalCell(fullEstimate.building.total, `SUM(${col(5)}${buildStart + 1}:${col(5)}${row})`);
    ws[encode(row, 6)] = numCell(0, `${col(5)}${row + 1}/${ws._totalBuildingAreaRef}*10000`);
    ws[encode(row, 7)] = numCell(0, `${col(5)}${row + 1}/${ws._aboveGroundAreaRef}*10000`);
    const buildingSubtotalRow = row + 1;
    row += 1;

    // 不可预见费 + 增值税
    const constructionSubtotalFormula = `F${infraSubtotalRow}+F${landscapeSubtotalRow}+F${publicSubtotalRow}+F${buildingSubtotalRow}`;
    ws[encode(row, 1)] = textCell('  不可预见费', '  ');
    ws[encode(row, 5)] = moneyCell(fullEstimate.construction.contingency, `(${col(5)}${landSubtotalRow}+${col(5)}${prelimSubtotalRow}+${constructionSubtotalFormula})*0.03`);
    ws[encode(row, 6)] = numCell(0, `${col(5)}${row + 1}/${ws._totalBuildingAreaRef}*10000`);
    ws[encode(row, 7)] = numCell(0, `${col(5)}${row + 1}/${ws._aboveGroundAreaRef}*10000`);
    const contingencyRow = row + 1;
    row += 1;
    const constructionSubtotalCost = round2(fullEstimate.infrastructure.total + fullEstimate.landscape.total + fullEstimate.publicFacility.total + fullEstimate.building.total);
    ws[encode(row, 1)] = textCell('  其中增值税', '  ');
    ws[encode(row, 3)] = numCell(0.09 / 1.09, '0.09/1.09');
    ws[encode(row, 4)] = numCell(constructionSubtotalCost, constructionSubtotalFormula);
    ws[encode(row, 5)] = moneyCell(fullEstimate.construction.vat, `(${constructionSubtotalFormula})*0.09/1.09`);
    ws[encode(row, 6)] = numCell(0, `${col(5)}${row + 1}/${ws._totalBuildingAreaRef}*10000`);
    ws[encode(row, 7)] = numCell(0, `${col(5)}${row + 1}/${ws._aboveGroundAreaRef}*10000`);
    const constructionVATRow = row + 1;
    row += 1;
    ws[encode(row, 1)] = subtotalCell('  建安工程成本合计');
    ws[encode(row, 5)] = subtotalCell(fullEstimate.construction.total, `${constructionSubtotalFormula}+${col(5)}${contingencyRow}+${col(5)}${constructionVATRow}`);
    ws[encode(row, 6)] = numCell(0, `${col(5)}${row + 1}/${ws._totalBuildingAreaRef}*10000`);
    ws[encode(row, 7)] = numCell(0, `${col(5)}${row + 1}/${ws._aboveGroundAreaRef}*10000`);
    const constructionTotalRow = row + 1;
    row += 1;

    // 四~七
    const categoryRows = [];
    const avgInterestYears = (fullEstimate.inputs.devPhases * fullEstimate.inputs.phasePeriod) / 2;
    const finRatio = (fullEstimate.inputs.financingRatio || 0) / 100;
    const finRate = (fullEstimate.inputs.financingRate || 0) / 100;
    const categories = [
      { code: '四', name: '开发间接费', cost: fullEstimate.indirect.cost, f: '0' },
      { code: '五', name: '营销费用', cost: fullEstimate.marketing.cost, f: '0' },
      { code: '六', name: '公司管理费', cost: fullEstimate.management.cost, f: '0' },
      { code: '七', name: '财务费用', cost: fullEstimate.financial.total, f: `(${col(5)}${landSubtotalRow}+${col(5)}${prelimSubtotalRow}+${col(5)}${constructionTotalRow})*${finRatio}*${finRate}*${avgInterestYears}+${fullEstimate.financial.bankFee}` }
    ];
    categories.forEach(cat => {
      const catRow = row + 1; // 1-based Excel row
      categoryRows.push(catRow);
      ws[encode(row, 0)] = textCell(cat.code);
      ws[encode(row, 1)] = subtotalCell(cat.name);
      for (let c = 2; c <= 8; c++) ws[encode(row, c)] = cell('', { fill: STYLE.subtotalFill });
      ws[encode(row, 5)] = subtotalCell(cat.cost, cat.f);
      ws[encode(row, 6)] = numCell(0, `${col(5)}${catRow}/${ws._totalBuildingAreaRef}*10000`);
      ws[encode(row, 7)] = numCell(0, `${col(5)}${catRow}/${ws._aboveGroundAreaRef}*10000`);
      row += 1;
    });

    // 发展成本合计
    const totalRow = row + 1;
    ws[encode(row, 0)] = textCell('合计');
    ws[encode(row, 1)] = totalCell('发展成本合计');
    for (let c = 2; c <= 8; c++) ws[encode(row, c)] = cell('', { fill: STYLE.totalFill });
    ws[encode(row, 5)] = totalCell(fullEstimate.summary.totalInvestment, `${col(5)}${landSubtotalRow}+${col(5)}${prelimSubtotalRow}+${col(5)}${constructionTotalRow}+${col(5)}${categoryRows[0]}+${col(5)}${categoryRows[1]}+${col(5)}${categoryRows[2]}+${col(5)}${categoryRows[3]}`);
    ws[encode(row, 6)] = numCell(0, `${col(5)}${totalRow}/${ws._totalBuildingAreaRef}*10000`);
    ws[encode(row, 7)] = numCell(0, `${col(5)}${totalRow}/${ws._aboveGroundAreaRef}*10000`);
    row += 1;

    ws[encode(row, 1)] = textCell('单位建面成本（元/㎡）');
    ws[encode(row, 5)] = moneyCell(fullEstimate.summary.unitGroundCost, `${col(5)}${totalRow}/${ws._totalBuildingAreaRef}*10000`);
    row += 1;
    ws[encode(row, 1)] = textCell('单位地上建面成本（元/㎡）');
    ws[encode(row, 5)] = moneyCell(fullEstimate.summary.unitAboveGroundCost, `${col(5)}${totalRow}/${ws._aboveGroundAreaRef}*10000`);

    ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: row, c: 8 } });
    setWsMeta(ws, cols);
    XLSX.utils.book_append_sheet(wb, ws, '投资估算完整版');

    // Sheet2：简化版
    const ws2 = {};
    ws2[encode(0, 0)] = cell('投资估算表（简化版）', { bold: true, sz: 14 });
    ws2['!merge'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 3 } }];
    ['科目编码', '成本科目', '金额（万元）', '占比'].forEach((h, c) => ws2[encode(1, c)] = headerCell(h));
    const simple = NS.simplifyInvestmentEstimate(fullEstimate);
    const totalSimpleRow = simple.length + 2; // 1-based 合计行
    const fullRowMap = {
      '一': landSubtotalRow,
      '二': prelimSubtotalRow,
      '三': constructionTotalRow,
      '四': categoryRows[0],
      '五': categoryRows[1],
      '六': categoryRows[2],
      '七': categoryRows[3],
      '合计': totalRow
    };
    simple.forEach((it, idx) => {
      const r = idx + 2;
      const rowNum = r + 1; // 1-based
      const isTotal = it.code === '合计';
      const fullRow = fullRowMap[it.code];
      const amountFormula = fullRow ? `'投资估算完整版'!F${fullRow}` : null;
      ws2[encode(r, 0)] = isTotal ? totalCell(it.code) : textCell(it.code);
      ws2[encode(r, 1)] = isTotal ? totalCell(it.category) : textCell(it.category);
      ws2[encode(r, 2)] = isTotal ? totalCell(it.amount, amountFormula) : moneyCell(it.amount, amountFormula);
      ws2[encode(r, 3)] = isTotal ? totalCell('100%') : cell(0, { align: 'right', numFmt: '0.00"%"' });
      if (!isTotal) {
        ws2[encode(r, 3)].f = `IF($C$${totalSimpleRow}=0,0,C${rowNum}/$C$${totalSimpleRow}*100)`;
      }
    });
    ws2['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: simple.length + 1, c: 3 } });
    setWsMeta(ws2, [12, 24, 18, 12]);
    XLSX.utils.book_append_sheet(wb, ws2, '投资估算简化版');

    XLSX.writeFile(wb, fileName || '投资估算表.xlsx');
  };


  // ==================== 静态投资分析 Excel 导出 ====================
  NS.downloadStaticAnalysisExcel = function (staticResult, fileName) {
    if (typeof XLSX === 'undefined') { alert('Excel 导出库未加载，请检查网络。'); return; }
    const wb = XLSX.utils.book_new();
    let ssr = 0, rsr = 0;
    const saleDetailCount = (staticResult.sale && staticResult.sale.details && staticResult.sale.details.length) || 0;
    const rentDetailCount = (staticResult.rent && staticResult.rent.details && staticResult.rent.details.length) || 0;
    const saleAllocTotalRow = saleDetailCount + 4; // 1-based
    const rentAllocTotalRow = saleDetailCount + rentDetailCount + 8; // 1-based

    function addPlanningAndCost(ws, startRow) {
      ws[encode(startRow, 0)] = cell('一、规划指标', { bold: true, sz: 12 });
      ws['!merge'] = ws['!merge'] || [];
      ws['!merge'].push({ s: { r: startRow, c: 0 }, e: { r: startRow, c: 2 } });
      ['项目', '数值', '单位'].forEach((h, c) => ws[encode(startRow + 1, c)] = headerCell(h));
      const planning = [
        ['用地面积', round2(staticResult.metrics.landArea / 666.7), '亩'],
        ['用地面积', staticResult.metrics.landArea, 'm²'],
        ['容积率', staticResult.metrics.far, '—'],
        ['计容总建筑面积', staticResult.metrics.totalCap, 'm²'],
        ['地上总建筑面积', staticResult.metrics.aboveGroundArea, 'm²'],
        ['地下总建筑面积', staticResult.metrics.undergroundArea, 'm²'],
        ['总建筑面积', staticResult.metrics.totalBuildingArea, 'm²'],
        ['分割销售比例', staticResult.inputs.saleRatio, '%']
      ];
      planning.forEach((row, idx) => {
        const r = startRow + 2 + idx;
        ws[encode(r, 0)] = textCell(row[0]);
        ws[encode(r, 1)] = numCell(row[1]);
        ws[encode(r, 2)] = textCell(row[2]);
      });

      const costStart = startRow + planning.length + 3;
      ws[encode(costStart, 0)] = cell('二、建造成本', { bold: true, sz: 12 });
      ws['!merge'].push({ s: { r: costStart, c: 0 }, e: { r: costStart, c: 2 } });
      ['项目', '数值', '单位'].forEach((h, c) => ws[encode(costStart + 1, c)] = headerCell(h));
      const costRows = [
        ['土地价格', staticResult.inputs.landPrice || 0, '万元/亩'],
        ['土地含契税', staticResult.constructionCost.landCostPerArea, '元/㎡'],
        ['综合单方成本', staticResult.constructionCost.unitCost, '元/㎡']
      ];
      costRows.forEach((row, idx) => {
        const r = costStart + 2 + idx;
        ws[encode(r, 0)] = textCell(row[0]);
        ws[encode(r, 1)] = numCell(row[1]);
        ws[encode(r, 2)] = textCell(row[2]);
      });
      return { nextRow: costStart + costRows.length + 2, costStart };
    }

    // Sheet1：销售测算
    const ws1 = {};
    ws1['!merge'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 3 } }];
    ws1[encode(0, 0)] = cell('销售测算', { bold: true, sz: 14 });
    const planCost1 = addPlanningAndCost(ws1, 1);
    let row1 = planCost1.nextRow;
    const costStart1 = planCost1.costStart;
    ws1[encode(row1, 0)] = cell('三、销售测算', { bold: true, sz: 12 });
    ws1['!merge'].push({ s: { r: row1, c: 0 }, e: { r: row1, c: 3 } });
    ['项目', '数值', '单位', '说明'].forEach((h, c) => ws1[encode(row1 + 1, c)] = headerCell(h));
    const saleStartIdx = row1 + 2; // 0-based
    ssr = saleStartIdx + 1;        // 1-based，可售面积行
    const costLandTaxRow = costStart1 + 4; // 1-based，土地含契税
    const costUnitRow = costStart1 + 5;    // 1-based，综合单方成本
    const saleRows = [
      { name: '可售面积', value: staticResult.metrics.soldAreaTotal, unit: 'm²', desc: '', f: `'租售面积分配'!B${saleAllocTotalRow}` },
      { name: '加权平均售价', value: staticResult.sale.weightedPrice, unit: '万元/㎡', desc: '', f: `'租售面积分配'!E${saleAllocTotalRow}` },
      { name: '不含税售价', value: round2(staticResult.sale.weightedPrice / 1.09), unit: '万元/㎡', desc: '售价/1.09', f: `B${ssr + 1}/1.09` },
      { name: '销售收入', value: staticResult.sale.totalRevenue, unit: '万元', desc: '可售面积×加权平均售价', f: `B${ssr}*B${ssr + 1}` },
      { name: '减：土地成本', value: staticResult.sale.landCost, unit: '万元', desc: '', f: `B${ssr}*$B$${costLandTaxRow}/10000` },
      { name: '减：建安成本', value: staticResult.sale.constructionCost, unit: '万元', desc: '', f: `B${ssr}*$B$${costUnitRow}/10000` },
      { name: '减：税金及附加', value: staticResult.sale.taxSurcharge, unit: '万元', desc: '', f: `B${ssr + 3}/1.09*0.006` },
      { name: '减：土地增值税', value: 0, unit: '万元', desc: '', f: `'土地增值税测算表'!C14` },
      { name: '减：营销费用', value: staticResult.sale.marketingCost, unit: '万元', desc: '', f: `B${ssr + 3}*${staticResult.inputs.marketingRate / 100}` },
      { name: '减：管理费用', value: staticResult.sale.managementCost, unit: '万元', desc: '', f: `B${ssr + 3}*${staticResult.inputs.managementRate / 100}` },
      { name: '减：财务费用', value: staticResult.sale.financialCost, unit: '万元', desc: '', f: null },
      { name: '利润总额', value: staticResult.sale.profit, unit: '万元', desc: '', f: `B${ssr + 3}-SUM(B${ssr + 4}:B${ssr + 10})` },
      { name: '减：所得税', value: staticResult.sale.incomeTax, unit: '万元', desc: '', f: `MAX(B${ssr + 11}*0.25,0)` },
      { name: '净利润', value: staticResult.sale.netProfit, unit: '万元', desc: '', f: `B${ssr + 11}-B${ssr + 12}` },
      { name: '销售净利率', value: staticResult.sale.netMargin, unit: '%', desc: '', f: `IF(B${ssr + 3}=0,0,B${ssr + 13}/B${ssr + 3}*100)` }
    ];
    saleRows.forEach((row, idx) => {
      const r = saleStartIdx + idx;
      const isTotal = row.name === '净利润';
      ws1[encode(r, 0)] = isTotal ? totalCell(row.name) : textCell(row.name);
      ws1[encode(r, 1)] = isTotal ? totalCell(row.value, row.f) : moneyCell(row.value, row.f);
      ws1[encode(r, 2)] = textCell(row.unit);
      ws1[encode(r, 3)] = textCell(row.desc);
    });
    ws1['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: row1 + saleRows.length + 1, c: 3 } });
    setWsMeta(ws1, [22, 16, 12, 24]);
    XLSX.utils.book_append_sheet(wb, ws1, '销售测算');

    // Sheet2：租赁测算
    const ws2 = {};
    ws2['!merge'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 3 } }];
    ws2[encode(0, 0)] = cell('租赁测算', { bold: true, sz: 14 });
    const planCost2 = addPlanningAndCost(ws2, 1);
    let row2 = planCost2.nextRow;
    const costStart2 = planCost2.costStart;
    ws2[encode(row2, 0)] = cell('三、租赁测算', { bold: true, sz: 12 });
    ws2['!merge'].push({ s: { r: row2, c: 0 }, e: { r: row2, c: 3 } });
    ['项目', '数值', '单位', '说明'].forEach((h, c) => ws2[encode(row2 + 1, c)] = headerCell(h));
    const rentStartIdx = row2 + 2; // 0-based
    rsr = rentStartIdx + 1;        // 1-based，可租面积行
    const costUnitRow2 = costStart2 + 5; // 1-based，综合单方成本
    const rentRows = [
      { name: '可租面积', value: staticResult.metrics.rentableArea, unit: 'm²', desc: '', f: `'租售面积分配'!B${rentAllocTotalRow}` },
      { name: '加权平均租金', value: staticResult.rent.weightedRent, unit: '元/天/㎡', desc: '', f: `'租售面积分配'!E${rentAllocTotalRow}` },
      { name: '月租金', value: staticResult.rent.monthlyRent, unit: '元/月/㎡', desc: '日租金×30', f: `B${rsr + 1}*30` },
      { name: '年租金收入', value: staticResult.rent.yearlyRent, unit: '元/年/㎡', desc: '月租金×12', f: `B${rsr + 2}*12` },
      { name: '出租率', value: staticResult.rent.occupancyRate, unit: '%', desc: '', f: null },
      { name: '有效年租金', value: staticResult.rent.effectiveYearlyRent, unit: '元/年/㎡', desc: '年租金×出租率', f: `B${rsr + 3}*B${rsr + 4}/100` },
      { name: '减：税金及附加', value: staticResult.rent.taxSurcharge, unit: '元/年/㎡', desc: '', f: `B${rsr + 5}*0.006` },
      { name: '减：房产税', value: staticResult.rent.propertyTax, unit: '元/年/㎡', desc: '', f: `B${rsr + 5}*0.12` },
      { name: '减：土地使用税', value: staticResult.rent.landUseTax, unit: '元/㎡/年', desc: '', f: null },
      { name: '减：运营费用', value: staticResult.rent.rentalOpCost, unit: '元/年/㎡', desc: '', f: `B${rsr + 5}*${staticResult.inputs.rentalOpRate / 100}` },
      { name: '净租赁收入', value: staticResult.rent.netRentPerSqm, unit: '元/年/㎡', desc: '', f: `B${rsr + 5}-SUM(B${rsr + 6}:B${rsr + 9})` },
      { name: '净租赁收入总额', value: staticResult.rent.netRentalIncome, unit: '万元/年', desc: '', f: `B${rsr + 10}*B${rsr}/10000` },
      { name: '租赁总投', value: staticResult.rent.rentalTotalInvestment, unit: '万元', desc: '', f: `B${rsr}*$B$${costUnitRow2}/10000` },
      { name: 'NOI', value: staticResult.rent.noi, unit: '%', desc: '', f: `IF(B${rsr + 12}=0,0,B${rsr + 11}/B${rsr + 12}*100)` }
    ];
    rentRows.forEach((row, idx) => {
      const r = rentStartIdx + idx;
      const isKey = row.name === '净租赁收入' || row.name === 'NOI';
      ws2[encode(r, 0)] = isKey ? totalCell(row.name) : textCell(row.name);
      ws2[encode(r, 1)] = isKey ? totalCell(row.value, row.f) : moneyCell(row.value, row.f);
      ws2[encode(r, 2)] = textCell(row.unit);
      ws2[encode(r, 3)] = textCell(row.desc);
    });
    ws2['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: row2 + rentRows.length + 1, c: 3 } });
    setWsMeta(ws2, [22, 16, 14, 28]);
    XLSX.utils.book_append_sheet(wb, ws2, '租赁测算');

    // Sheet3：租售面积分配
    const ws3 = {};
    ws3[encode(0, 0)] = cell('租售面积分配', { bold: true, sz: 14 });
    ws3['!merge'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 5 } }];
    ws3[encode(1, 0)] = cell('一、销售面积分配', { bold: true, sz: 12 });
    ws3['!merge'].push({ s: { r: 1, c: 0 }, e: { r: 1, c: 5 } });
    ['产品类型', '销售面积（㎡）', '售价（万元/㎡）', '销售收入（万元）', '加权平均售价', '']
      .forEach((h, c) => ws3[encode(2, c)] = headerCell(h));
    staticResult.sale.details.forEach((it, idx) => {
      const r = idx + 3; // 0-based
      const rowNum = r + 1; // 1-based
      ws3[encode(r, 0)] = textCell(it.type);
      ws3[encode(r, 1)] = numCell(it.area);
      ws3[encode(r, 2)] = numCell(it.price);
      ws3[encode(r, 3)] = moneyCell(it.revenue, `B${rowNum}*C${rowNum}`);
      ws3[encode(r, 4)] = numCell(0);
    });
    const saleTotalIdx = staticResult.sale.details.length + 3; // 0-based
    const saleTotalRowNum = saleTotalIdx + 1; // 1-based
    const saleDataLastRowNum = saleTotalRowNum - 1; // 1-based，最后一个数据行
    ws3[encode(saleTotalIdx, 0)] = totalCell('合计');
    ws3[encode(saleTotalIdx, 1)] = totalCell(staticResult.metrics.soldAreaTotal, `SUM(B4:B${saleDataLastRowNum})`);
    ws3[encode(saleTotalIdx, 2)] = totalCell('—');
    ws3[encode(saleTotalIdx, 3)] = totalCell(staticResult.sale.totalRevenue, `SUM(D4:D${saleDataLastRowNum})`);
    ws3[encode(saleTotalIdx, 4)] = totalCell(staticResult.sale.weightedPrice, `IF(B${saleTotalRowNum}=0,0,D${saleTotalRowNum}/B${saleTotalRowNum})`);

    const rentAllocStartIdx = saleTotalIdx + 2; // 0-based title
    ws3[encode(rentAllocStartIdx, 0)] = cell('二、租赁面积分配', { bold: true, sz: 12 });
    ws3['!merge'].push({ s: { r: rentAllocStartIdx, c: 0 }, e: { r: rentAllocStartIdx, c: 5 } });
    const rentHeaderIdx = rentAllocStartIdx + 1;
    ['产品类型', '可租面积（㎡）', '租金（元/天/㎡）', '年租金收入（万元）', '加权平均租金', '']
      .forEach((h, c) => ws3[encode(rentHeaderIdx, c)] = headerCell(h));
    staticResult.rent.details.forEach((it, idx) => {
      const r = rentHeaderIdx + 1 + idx; // 0-based
      const rowNum = r + 1; // 1-based
      ws3[encode(r, 0)] = textCell(it.type);
      ws3[encode(r, 1)] = numCell(it.area);
      ws3[encode(r, 2)] = numCell(it.rent);
      ws3[encode(r, 3)] = moneyCell(it.annualRevenue, `B${rowNum}*C${rowNum}*365*${staticResult.inputs.occupancyRate / 100}/10000`);
      ws3[encode(r, 4)] = numCell(0);
    });
    const rentTotalIdx = rentHeaderIdx + 1 + staticResult.rent.details.length; // 0-based
    const rentTotalRowNum = rentTotalIdx + 1; // 1-based
    const rentDetailStartRowNum = rentHeaderIdx + 2; // 1-based
    const rentDataLastRowNum = rentTotalRowNum - 1; // 1-based，最后一个数据行
    ws3[encode(rentTotalIdx, 0)] = totalCell('合计');
    ws3[encode(rentTotalIdx, 1)] = totalCell(staticResult.metrics.rentedAreaTotal, `SUM(B${rentDetailStartRowNum}:B${rentDataLastRowNum})`);
    ws3[encode(rentTotalIdx, 2)] = totalCell('—');
    ws3[encode(rentTotalIdx, 3)] = totalCell(staticResult.rent.netRentalIncome, `SUM(D${rentDetailStartRowNum}:D${rentDataLastRowNum})`);
    ws3[encode(rentTotalIdx, 4)] = totalCell(staticResult.rent.weightedRent, `IF(B${rentTotalRowNum}=0,0,SUMPRODUCT(B${rentDetailStartRowNum}:B${rentDataLastRowNum},C${rentDetailStartRowNum}:C${rentDataLastRowNum})/B${rentTotalRowNum})`);

    ws3['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: rentTotalIdx, c: 5 } });
    setWsMeta(ws3, [16, 16, 16, 18, 16, 4]);
    XLSX.utils.book_append_sheet(wb, ws3, '租售面积分配');

    // Sheet4：土地增值税测算表
    const ws4 = {};
    ws4[encode(0, 0)] = cell('土地增值税测算表', { bold: true, sz: 14 });
    ws4['!merge'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 2 } }];
    ['序号', '项目', '金额（万元）', '公式/说明'].forEach((h, c) => ws4[encode(1, c)] = headerCell(h));
    const landTaxSaleRevenueCell = `'销售测算'!B${ssr + 3}`;
    const landTaxSoldAreaCell = `'销售测算'!B${ssr}`;
    const landTaxLandCostCell = `'销售测算'!B${ssr + 4}`;
    const landTaxConstructCell = `'销售测算'!B${ssr + 5}`;
    const landTaxTaxSurchargeCell = `'销售测算'!B${ssr + 6}`;
    const landTaxRows = [
      { no: '1', name: '转让房地产收入总额', f: landTaxSaleRevenueCell },
      { no: '2', name: '扣除项目金额合计', f: 'C5+C6+C7+C8+C9' },
      { no: '3', name: '①取得土地使用权所支付的金额', f: landTaxLandCostCell },
      { no: '4', name: '②房地产开发成本', f: landTaxConstructCell },
      { no: '5', name: '③房地产开发费用', f: '(C5+C6)*10%' },
      { no: '6', name: '④与转让房地产有关的税金', f: landTaxTaxSurchargeCell },
      { no: '7', name: '⑤财政部规定的其他扣除项目', f: '(C5+C6)*20%' },
      { no: '8', name: '增值额', f: 'C3-C4' },
      { no: '9', name: '增值额与扣除项目金额之比（%）', f: 'IF(C4=0,0,C10/C4*100)' },
      { no: '10', name: '适用税率（%）', f: 'IF(C11<=50,30,IF(C11<=100,40,IF(C11<=200,50,60)))' },
      { no: '11', name: '速算扣除系数（%）', f: 'IF(C11<=50,0,IF(C11<=100,5,IF(C11<=200,15,35)))' },
      { no: '12', name: '应缴土地增值税税额', f: 'C10*C12/100-C4*C13/100' },
      { no: '13', name: '土增税负率', f: 'IF(C3=0,0,C14/C3*100)' },
      { no: '14', name: '土增税（元/㎡）', f: `IF(${landTaxSoldAreaCell}=0,0,C14/${landTaxSoldAreaCell}*10000)` }
    ];
    landTaxRows.forEach((row, idx) => {
      const r = idx + 2;
      const isKey = row.name === '应缴土地增值税税额';
      ws4[encode(r, 0)] = textCell(row.no);
      ws4[encode(r, 1)] = textCell(row.name);
      ws4[encode(r, 2)] = isKey ? totalCell(0, row.f) : moneyCell(0, row.f);
      ws4[encode(r, 3)] = textCell('');
    });
    ws4['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: landTaxRows.length + 1, c: 3 } });
    setWsMeta(ws4, [8, 32, 18, 24]);
    XLSX.utils.book_append_sheet(wb, ws4, '土地增值税测算表');

    // Sheet5：综合汇总
    const ws5 = {};
    ws5[encode(0, 0)] = cell('综合汇总指标', { bold: true, sz: 14 });
    ws5['!merge'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 2 } }];
    ['指标', '数值', '单位'].forEach((h, c) => ws5[encode(1, c)] = headerCell(h));
    const finRatio = staticResult.inputs.financingRatio / 100;
    const summaryRows = [
      { name: '总投资', value: staticResult.summary.totalInvestment, unit: '万元', f: null },
      { name: '销售净利润', value: staticResult.summary.saleNetProfit, unit: '万元', f: `'销售测算'!B${ssr + 13}` },
      { name: '租赁年净收入', value: staticResult.summary.netRentalIncome, unit: '万元/年', f: `'租赁测算'!B${rsr + 11}` },
      { name: '资金缺口', value: staticResult.summary.fundingGap, unit: '万元', f: `B3-(1-${finRatio})*B3-'销售测算'!B${ssr + 3}` },
      { name: '销售净利润覆盖租赁总投比例', value: staticResult.summary.saleProfitCoverRatio, unit: '%', f: `IF('租赁测算'!B${rsr + 12}=0,0,B4/'租赁测算'!B${rsr + 12}*100)` },
      { name: '销售净利率', value: staticResult.summary.saleNetMargin, unit: '%', f: `'销售测算'!B${ssr + 14}` },
      { name: '租赁 NOI', value: staticResult.summary.noi, unit: '%', f: `'租赁测算'!B${rsr + 13}` },
      { name: '总投资收益率', value: staticResult.summary.totalInvestmentReturn, unit: '%', f: `IF(B3=0,0,B5/B3*100)` },
      { name: '静态投资回收期', value: staticResult.summary.paybackPeriod, unit: '年', f: `IF(B5=0,0,B3/B5)` }
    ];
    summaryRows.forEach((row, idx) => {
      const r = idx + 2;
      ws5[encode(r, 0)] = textCell(row.name);
      ws5[encode(r, 1)] = moneyCell(row.value, row.f);
      ws5[encode(r, 2)] = textCell(row.unit);
    });
    ws5['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: summaryRows.length + 1, c: 2 } });
    setWsMeta(ws5, [28, 16, 12]);
    XLSX.utils.book_append_sheet(wb, ws5, '综合汇总');

    XLSX.writeFile(wb, fileName || '静态投资分析表.xlsx');
  };

})(window);
