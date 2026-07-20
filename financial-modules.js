/**
 * financial-modules.js
 * 投资估算、静态投资分析、动态投资分析模块
 *
 * 核心原则：
 * 1. 投资估算完整版为源头，简化版由完整版汇总反推；
 * 2. 静态分析依赖投资估算结果；
 * 3. 所有输出金额保留两位小数；
 * 4. 动态投资分析依赖静态分析结果，口径见 DYNAMIC_INVESTMENT_DESIGN.md（多年现金流、NPV/IRR、自有资金 IRR、动态回收期、敏感性分析）。
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
      { code: '1-7', name: '其中增值税', unit: '万元', unitPrice: 0.06, quantity: round2(offsiteMunicipalTotal / 1.06), quantityFormula: '(F8+F9)/1.06', cost: landVAT, vatDE: true, note: '红线外市政×6%/1.06' }
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
    prelimItems.push({ code: '2-9', name: '其中增值税', unit: '万元', unitPrice: 0.06, quantity: round2(prelimSubtotal / 1.06), quantityFormula: 'ROUND(SUM(F14:F21),2)/1.06', cost: prelimVAT, vatDE: true, note: '前期小计×6%/1.06' });
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
    const interestBase = landCostTotal + prelimTotal + constructionTotal;
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

    // 租售面积分配明细（先于加权价计算，确保收入与 Excel SUMPRODUCT 一致）
    const saleDetails = SALE_PRIORITY.map(type => {
      const area = soldAreaByType[type] || 0;
      const price = priceMap[type] || 0;
      return { type, area: round2(area), price: round2(price), revenue: round2(area * price) };
    });
    const rentDetails = RENT_DISPLAY_ORDER.map(type => {
      const area = rentedAreaByType[type] || 0;
      const rent = rentMap[type] || 0;
      return { type, area: round2(area), rent: round2(rent), annualRevenue: round2(area * rent * 360 * occupancyRate / 10000) };
    });

    // 加权平均售价/租金（完整精度用于后续计算，展示值保留两位）
    const rawWeightedSalePrice = soldAreaTotal > 0 ? SALE_PRIORITY.reduce((s, type) => s + (soldAreaByType[type] || 0) * (priceMap[type] || 0), 0) / soldAreaTotal : 0;
    const rawWeightedRent = rentedAreaTotal > 0 ? RENT_DISPLAY_ORDER.reduce((s, type) => s + (rentedAreaByType[type] || 0) * (rentMap[type] || 0), 0) / rentedAreaTotal : 0;
    const weightedSalePrice = round2(rawWeightedSalePrice);
    const weightedRent = round2(rawWeightedRent);

    // 销售测算
    const saleRevenue = round2(saleDetails.reduce((s, d) => s + d.revenue, 0));
    const landCostTotal = inv.landCost ? inv.landCost.total : 0;
    const prelimTotal = inv.preliminary ? inv.preliminary.total : 0;
    const constructionTotal = inv.construction ? inv.construction.total : 0;
    // 土地成本单方（方案B口径）：土地配套费用合计（出让金+契税+市政配套+红线外市政+土地增值税）按地上总建面摊
    const landCostPerArea = aboveGroundArea > 0 ? round2(landCostTotal * 10000 / aboveGroundArea) : 0;
    const unitCost = inv.summary ? round2(inv.summary.totalInvestment * 10000 / inv.metrics.totalBuildingArea) : 0;
    // 综合建造成本（不含期间费用）：仅用于租赁总投口径（租赁侧无单独土地行，含土地不重复）
    const constructionCostTotal = landCostTotal + prelimTotal + constructionTotal;
    const costUnitCost = inv.metrics && inv.metrics.totalBuildingArea > 0 ? round2(constructionCostTotal * 10000 / inv.metrics.totalBuildingArea) : 0;
    // 销售侧建安成本单方（方案B口径）：前期费用+建安工程成本按总建面摊，与土地成本行互补不重叠、无遗漏
    const saleConstructionUnitCost = inv.metrics && inv.metrics.totalBuildingArea > 0 ? round2((prelimTotal + constructionTotal) * 10000 / inv.metrics.totalBuildingArea) : 0;
    const landCostForSale = round2(soldAreaTotal * landCostPerArea / 10000);
    const constructionCostForSale = round2(soldAreaTotal * saleConstructionUnitCost / 10000);
    const saleTaxSurcharge = round2(saleRevenue / 1.09 * 0.006);

    // 土地增值税（四级超率累进）
    const lvatDeductionBase = landCostForSale + constructionCostForSale;
    const lvatDevExpense = round2(lvatDeductionBase * 0.1);
    const lvatOtherDeduction = round2(lvatDeductionBase * 0.2);
    const lvatDeductionTotal = round2(lvatDeductionBase + lvatDevExpense + saleTaxSurcharge + lvatOtherDeduction);
    const lvatIncrement = round2(saleRevenue - lvatDeductionTotal);
    let landValueAddedTax = 0;
    if (lvatIncrement > 0 && lvatDeductionTotal > 0) {
      const lvatRatio = lvatIncrement / lvatDeductionTotal * 100;
      let lvatRate, lvatQuick;
      if (lvatRatio <= 50) { lvatRate = 30; lvatQuick = 0; }
      else if (lvatRatio <= 100) { lvatRate = 40; lvatQuick = 5; }
      else if (lvatRatio <= 200) { lvatRate = 50; lvatQuick = 15; }
      else { lvatRate = 60; lvatQuick = 35; }
      landValueAddedTax = round2(lvatIncrement * lvatRate / 100 - lvatDeductionTotal * lvatQuick / 100);
    }

    const marketingCostSale = round2(saleRevenue * marketingRate);
    const managementCostSale = round2(saleRevenue * managementRate);

    // 财务费用按销售/租赁面积比例分摊（配套楼自用面积不分摊）
    const totalFinancialCost = inv.financial ? inv.financial.total : 0;
    const saleRentTotalArea = soldAreaTotal + rentedAreaTotal;
    const saleFinancialCost = saleRentTotalArea > 0 ? round2(totalFinancialCost * soldAreaTotal / saleRentTotalArea) : 0;
    const rentFinancialCost = saleRentTotalArea > 0 ? round2(totalFinancialCost * rentedAreaTotal / saleRentTotalArea) : 0;

    const saleProfit = round2(saleRevenue - landCostForSale - constructionCostForSale - saleTaxSurcharge - landValueAddedTax - marketingCostSale - managementCostSale - saleFinancialCost);
    const saleIncomeTax = round2(Math.max(0, saleProfit) * 0.25);
    const saleNetProfit = round2(saleProfit - saleIncomeTax);
    const saleNetMargin = saleRevenue > 0 ? round2(saleNetProfit / saleRevenue * 100) : 0;

    // 租赁测算（按元/m²/年口径，使用 raw weighted rent 减少累计误差）
    const monthlyRent = round2(rawWeightedRent * 30);
    const yearlyRent = round2(rawWeightedRent * 360);
    const effectiveYearlyRent = round2(yearlyRent * occupancyRate);
    const taxSurcharge = round2(effectiveYearlyRent * 0.006);
    const propertyTax = round2(effectiveYearlyRent * 0.12);
    const landUseTax = 6;
    const rentalOpCost = round2(effectiveYearlyRent * rentalOpRate);
    const netRentPerSqm = round2(effectiveYearlyRent - taxSurcharge - propertyTax - landUseTax - rentalOpCost);
    const netRentalIncome = round2(netRentPerSqm * rentedAreaTotal / 10000);
    const rentalTotalInvestment = round2(rentedAreaTotal * costUnitCost / 10000 + rentFinancialCost);
    const noi = rentalTotalInvestment > 0 ? round2(netRentalIncome / rentalTotalInvestment * 100) : 0;

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
      constructionCost: { landCostPerArea, unitCost, costUnitCost, saleConstructionUnitCost },
      sale: {
        weightedPrice: weightedSalePrice,
        rawWeightedPrice: rawWeightedSalePrice, // 完整精度，供动态分析参与计算
        details: saleDetails,
        totalRevenue: saleRevenue,
        landCost: landCostForSale,
        constructionCost: constructionCostForSale,
        taxSurcharge: saleTaxSurcharge,
        landValueAddedTax,
        lvatDeductionTotal,
        lvatIncrement,
        lvatRatio: lvatDeductionTotal > 0 ? round2(lvatIncrement / lvatDeductionTotal * 100) : 0,
        lvatRate: landValueAddedTax > 0 ? (function() {
          const r = lvatIncrement / lvatDeductionTotal * 100;
          if (r <= 50) return 30;
          if (r <= 100) return 40;
          if (r <= 200) return 50;
          return 60;
        })() : 0,
        lvatQuick: landValueAddedTax > 0 ? (function() {
          const r = lvatIncrement / lvatDeductionTotal * 100;
          if (r <= 50) return 0;
          if (r <= 100) return 5;
          if (r <= 200) return 15;
          return 35;
        })() : 0,
        marketingCost: marketingCostSale,
        managementCost: managementCostSale,
        financialCost: saleFinancialCost,
        profit: saleProfit,
        incomeTax: saleIncomeTax,
        netProfit: saleNetProfit,
        netMargin: saleNetMargin
      },
      rent: {
        weightedRent,
        rawWeightedRent, // 完整精度，供动态分析参与计算
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
        financialCost: rentFinancialCost,
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


  // ==================== 动态投资分析 ====================
  // 口径见 DYNAMIC_INVESTMENT_DESIGN.md：金额万元、面积㎡、比率以百分比存储/返回（如 90 表示 90%）；
  // 年租金 = 日租金 × 360；三阶段现金流：建设期 → 销售+运营混合期 → 纯运营期。

  // IRR 数值求解（二分法：-99% ~ 1000%，100 次迭代，无变号返回 null）；入出现金流数组（t=0 起），返回百分比
  function solveIrr(cashflows) {
    function npvAt(r) {
      let s = 0;
      for (let t = 0; t < cashflows.length; t++) s += cashflows[t] / Math.pow(1 + r, t);
      return s;
    }
    let lo = -0.99, hi = 10;
    let flo = npvAt(lo);
    const fhi = npvAt(hi);
    if (!isFinite(flo) || !isFinite(fhi)) return null;
    if (flo === 0) return round2(lo * 100);
    if (flo * fhi > 0) return null;
    for (let i = 0; i < 100; i++) {
      const mid = (lo + hi) / 2;
      const fm = npvAt(mid);
      if (fm === 0) { lo = mid; break; }
      if (flo * fm < 0) { hi = mid; } else { lo = mid; flo = fm; }
    }
    return round2(((lo + hi) / 2) * 100);
  }

  // 动态投资回收期：累计折现现金流由负转正的年份，线性插值精确到 0.1 年；未转正返回 null
  function dynamicPayback(cumDiscounted, discounted) {
    for (let t = 0; t < cumDiscounted.length; t++) {
      if (cumDiscounted[t] >= 0) {
        if (t === 0) return 0;
        return Math.round(((t - 1) + (-cumDiscounted[t - 1]) / discounted[t]) * 10) / 10;
      }
    }
    return null;
  }

  // 土增税四级超率累进（动态口径：以动态累计销售回款为转让收入，扣除项目沿用静态土地/建安口径）
  function calcDynamicLvat(revenue, landCost, constructionCost) {
    const base = round2(landCost + constructionCost);
    const devExpense = round2(base * 0.1);
    const surcharge = round2(revenue / 1.09 * 0.006);
    const otherDeduction = round2(base * 0.2);
    const deductionTotal = round2(base + devExpense + surcharge + otherDeduction);
    const increment = round2(revenue - deductionTotal);
    let lvat = 0;
    if (increment > 0 && deductionTotal > 0) {
      const ratio = increment / deductionTotal * 100;
      let rate, quick;
      if (ratio <= 50) { rate = 30; quick = 0; }
      else if (ratio <= 100) { rate = 40; quick = 5; }
      else if (ratio <= 200) { rate = 50; quick = 15; }
      else { rate = 60; quick = 35; }
      lvat = round2(increment * rate / 100 - deductionTotal * quick / 100);
    }
    return { lvat, surcharge };
  }

  // 动态模型核心（敏感性分析复用）：p 中比率为小数、去化速度为 ㎡/年、售价为 万元/㎡、租金为 元/天/㎡
  function runDynamicModel(p) {
    const cy = Math.max(1, Math.round(p.constructionYears));
    const oy = Math.max(1, Math.round(p.operationYears));
    const N = cy + oy;
    const ownFunds = round2(p.totalInvestment * (1 - p.financingRatio));
    const loanCap = round2(p.totalInvestment * p.financingRatio);
    const rentCapArea = round2(p.rentableArea * p.occupancyRate);
    const investPerYear = round2(p.totalInvestment / cy);
    const ownPerYear = round2(ownFunds / cy);

    // ---- 去化引擎：销售上限 = 可售面积；租赁上限 = 可租面积 × 稳定出租率（满租口径） ----
    // 开预售：建设期第 1/2 年按比例 × 总量去化（租赁为预租，只锁定面积）；运营期起每年 MIN(去化速度, 上限 − 累计)
    const saleDep = [], rentDep = [], saleCumArr = [], rentCumArr = [];
    let saleCum = 0, rentCum = 0, saleFinishYear = null, rentFullYear = null;
    for (let t = 0; t < N; t++) {
      let sd = 0, rd = 0;
      if (t < cy) {
        if (p.presaleEnabled) {
          const pct = t === 0 ? p.presalePct1 : (t === 1 ? p.presalePct2 : 0);
          sd = Math.min(pct * p.saleableArea, p.saleableArea - saleCum);
          rd = Math.min(pct * p.rentableArea, rentCapArea - rentCum);
        }
      } else {
        sd = Math.min(p.saleSpeed, p.saleableArea - saleCum);
        rd = Math.min(p.rentSpeed, rentCapArea - rentCum);
      }
      sd = round2(Math.max(0, sd));
      rd = round2(Math.max(0, rd));
      saleCum = round2(saleCum + sd);
      rentCum = round2(rentCum + rd);
      saleDep.push(sd); rentDep.push(rd); saleCumArr.push(saleCum); rentCumArr.push(rentCum);
      if (saleFinishYear == null && p.saleableArea > 0 && saleCum >= p.saleableArea) saleFinishYear = t;
      if (rentFullYear == null && rentCapArea > 0 && rentCum >= rentCapArea) rentFullYear = t;
    }

    // ---- 销售回款（预售当年确认回款；租金从运营期第 1 年按当年末累计已租面积计提，含预租） ----
    const saleRev = [];
    let totalSaleRevenue = 0;
    for (let t = 0; t < N; t++) {
      const rev = round2(saleDep[t] * p.weightedSalePrice * Math.pow(1 + p.saleGrowthRate, t));
      saleRev.push(rev);
      totalSaleRevenue = round2(totalSaleRevenue + rev);
    }

    // ---- 清算：土增税 + 所得税在销售去化完成当年一次性计提 ----
    const lvatInfo = calcDynamicLvat(totalSaleRevenue, p.landCostForSale, p.constructionCostForSale);
    const marketingTotal = round2(totalSaleRevenue * p.marketingRate);
    const managementTotal = round2(totalSaleRevenue * p.managementRate);
    const profitTotal = round2(totalSaleRevenue - p.landCostForSale - p.constructionCostForSale -
      lvatInfo.surcharge - lvatInfo.lvat - marketingTotal - managementTotal - p.saleFinancialCost);
    const incomeTaxSettlement = round2(Math.max(0, profitTotal) * 0.25);
    const settlementTotal = round2(lvatInfo.lvat + incomeTaxSettlement);

    // ---- 三阶段现金流 ----
    const years = [];
    const projectCFs = [], equityCFs = [], discArr = [], cumDiscArr = [];
    let remaining = 0, actualLoan = 0, cumDisc = 0;
    for (let t = 0; t < N; t++) {
      const isConstruction = t < cy;
      const saleRevenue = saleRev[t];
      const rentIncome = isConstruction ? 0 : round2(rentCumArr[t] * p.weightedRent * 360 * Math.pow(1 + p.rentGrowthRate, t) / 10000);
      const saleTax = round2(saleRevenue / 1.09 * 0.006 + saleRevenue * p.marketingRate + saleRevenue * p.managementRate);
      const rentTax = isConstruction ? 0 : round2(rentIncome * 0.006 + rentIncome * 0.12 + rentCumArr[t] * 6 / 10000);
      const opCost = round2(rentIncome * p.rentalOpRate);
      const settlementTax = (saleFinishYear != null && t === saleFinishYear) ? settlementTotal : 0;
      const availableFunds = round2(saleRevenue + rentIncome - saleTax - rentTax - opCost - settlementTax);
      // 建设期：总投资/自有资金均匀投入（末年轧差），贷款按进度提款；利息已含在财务费用内不重复计
      const investOutflow = isConstruction ? (t === cy - 1 ? round2(p.totalInvestment - investPerYear * (cy - 1)) : investPerYear) : 0;
      const ownFundOutflow = isConstruction ? (t === cy - 1 ? round2(ownFunds - ownPerYear * (cy - 1)) : ownPerYear) : 0;
      // 预售回款（扣除当年销售税费后的净额）优先替代贷款提款，累计提款不超过贷款上限
      const loanDrawdown = isConstruction
        ? round2(Math.min(Math.max(investOutflow - ownFundOutflow - availableFunds, 0), Math.max(loanCap - actualLoan, 0)))
        : 0;
      actualLoan = round2(actualLoan + loanDrawdown);
      // 运营期：利息 = 剩余本金 × 融资利率（全部费用化）；还本 = min(可用资金 − 利息, 剩余本金)
      const interest = isConstruction ? 0 : round2(remaining * p.financingRate);
      const principalRepay = isConstruction ? 0 : round2(Math.min(Math.max(availableFunds - interest, 0), remaining));
      remaining = round2(isConstruction ? remaining + loanDrawdown : remaining - principalRepay);
      const equityDistributable = isConstruction ? 0 : round2(availableFunds - interest - principalRepay);
      const equityShortfall = !isConstruction && equityDistributable < 0;
      const projectNetCF = round2(availableFunds - investOutflow);
      const equityCF = isConstruction ? round2(-ownFundOutflow) : equityDistributable;
      // 折现系数保留 6 位小数，折现/累计折现按 ROUND(...,2) 逐年累计，与 Excel 公式链一致
      const factor = Math.round((1 / Math.pow(1 + p.discountRate, t)) * 1e6) / 1e6;
      const discountedCF = round2(projectNetCF * factor);
      cumDisc = round2(cumDisc + discountedCF);
      const phase = isConstruction ? 'construction'
        : (p.saleableArea > 0 && (saleFinishYear == null || t <= saleFinishYear)) ? 'mixed' : 'operation';
      years.push({
        t, phase,
        saleDepleteArea: saleDep[t], saleCumArea: saleCumArr[t],
        rentDepleteArea: rentDep[t], rentCumArea: rentCumArr[t],
        saleRevenue, rentIncome, saleTax, rentTax, opCost, settlementTax, availableFunds,
        investOutflow, ownFundOutflow, loanDrawdown, interest, principalRepay,
        remainingPrincipal: remaining, equityDistributable, equityShortfall,
        projectNetCF, equityCF,
        discountFactor: factor,
        discountedCF, cumDiscountedCF: cumDisc
      });
      projectCFs.push(projectNetCF);
      equityCFs.push(equityCF);
      discArr.push(discountedCF);
      cumDiscArr.push(cumDisc);
    }

    return {
      years,
      metrics: {
        npv: round2(cumDisc),
        irr: solveIrr(projectCFs),
        equityIrr: solveIrr(equityCFs),
        paybackPeriod: dynamicPayback(cumDiscArr, discArr)
      },
      ownFunds, loanCap, actualLoan, rentCapArea,
      lvatSettlement: lvatInfo.lvat, incomeTaxSettlement,
      saleFinishYear, rentFullYear
    };
  }

  NS.calculateDynamicAnalysis = function (inputs, result, projectData, staticAnalysis) {
    inputs = inputs || {};
    if (!staticAnalysis || !staticAnalysis.metrics || !staticAnalysis.sale || !staticAnalysis.rent) return null;
    // 投资估算结果单独取：优先 inputs.investmentEstimate（便于自检注入），缺省取页面全局结果
    const inv = inputs.investmentEstimate || global.investmentEstimateResult || null;
    if (!inv || !inv.summary || !inv.inputs) return null;
    const sa = staticAnalysis;
    const saInputs = sa.inputs || {};

    // ---- 用户输入（比率均为百分比；去化速度单位 万㎡/年） ----
    const discountRate = safeNum(inputs.discountRate, 8);
    const operationYears = Math.max(1, Math.round(safeNum(inputs.operationYears, 20)));
    const rentGrowthRate = safeNum(inputs.rentGrowthRate, 2);
    const saleGrowthRate = safeNum(inputs.saleGrowthRate, 0);
    const saleSpeed = safeNum(inputs.saleSpeed, 1.5);
    const rentSpeed = safeNum(inputs.rentSpeed, 1.5);
    const occupancyRate = safeNum(inputs.occupancyRate, safeNum(saInputs.occupancyRate, 90));
    const presaleEnabled = !!inputs.presaleEnabled;
    const presalePctYear1 = safeNum(inputs.presalePctYear1, 0);
    const presalePctYear2 = safeNum(inputs.presalePctYear2, 30);
    // 建设期年数 = 开发期数 × 单期开发周期（投资估算输入，默认 2 年）
    const constructionYears = Math.max(1, Math.round(safeNum(inv.inputs.devPhases, 1) * safeNum(inv.inputs.phasePeriod, 2)));

    // ---- 基础量（投资估算 + 静态分析联动） ----
    const totalInvestment = safeNum(inv.summary.totalInvestment, 0);
    const financingRatio = safeNum(inv.inputs.financingRatio, 0) / 100;
    const financingRate = safeNum(inv.inputs.financingRate, 0) / 100;
    const saleableArea = safeNum(sa.metrics.soldAreaTotal, 0);
    const rentableArea = safeNum(sa.metrics.rentedAreaTotal, 0);
    // 加权售价/租金使用 raw 完整精度参与计算
    const weightedSalePrice = sa.sale.rawWeightedPrice != null ? sa.sale.rawWeightedPrice : safeNum(sa.sale.weightedPrice, 0);
    const weightedRent = sa.rent.rawWeightedRent != null ? sa.rent.rawWeightedRent : safeNum(sa.rent.weightedRent, 0);
    const marketingRate = safeNum(saInputs.marketingRate, 3.5) / 100;
    const managementRate = safeNum(saInputs.managementRate, 3) / 100;
    const rentalOpRate = safeNum(saInputs.rentalOpRate, 6) / 100;
    const landCostForSale = safeNum(sa.sale.landCost, 0);
    const constructionCostForSale = safeNum(sa.sale.constructionCost, 0);
    const saleFinancialCost = safeNum(sa.sale.financialCost, 0);
    // 敏感性分析用成本结构（建安/土地扰动调整总投资及成本口径）
    const constructionTotal = inv.construction ? safeNum(inv.construction.total, 0) : 0;
    const totalBuildingArea = inv.metrics ? safeNum(inv.metrics.totalBuildingArea, 0) : 0;
    const aboveGroundArea = safeNum(sa.metrics.aboveGroundArea, 0);
    const landItems = (inv.landCost && inv.landCost.items) || [];
    const landTransferItem = landItems.find(it => it.code === '1-1');
    const deedTaxItem = landItems.find(it => it.code === '1-2');
    const landBase = (landTransferItem ? landTransferItem.cost : 0) + (deedTaxItem ? deedTaxItem.cost : 0);

    function buildParams() {
      return {
        discountRate: discountRate / 100,
        operationYears: operationYears,
        rentGrowthRate: rentGrowthRate / 100,
        saleGrowthRate: saleGrowthRate / 100,
        saleSpeed: saleSpeed * 10000,
        rentSpeed: rentSpeed * 10000,
        occupancyRate: occupancyRate / 100,
        presaleEnabled: presaleEnabled,
        presalePct1: presalePctYear1 / 100,
        presalePct2: presalePctYear2 / 100,
        constructionYears: constructionYears,
        totalInvestment: totalInvestment,
        financingRatio: financingRatio,
        financingRate: financingRate,
        saleableArea: saleableArea,
        rentableArea: rentableArea,
        weightedSalePrice: weightedSalePrice,
        weightedRent: weightedRent,
        marketingRate: marketingRate,
        managementRate: managementRate,
        rentalOpRate: rentalOpRate,
        landCostForSale: landCostForSale,
        constructionCostForSale: constructionCostForSale,
        saleFinancialCost: saleFinancialCost
      };
    }

    const baseRun = runDynamicModel(buildParams());

    // ---- 敏感性分析：6 变量 × ±10%/±20%，每组扰动后整体重跑模型 ----
    const SENS_VARIABLES = [
      { variable: 'salePrice', label: '销售单价' },
      { variable: 'rentPrice', label: '租金单价' },
      { variable: 'constructionCost', label: '建安成本' },
      { variable: 'landPrice', label: '土地价格' },
      { variable: 'occupancyRate', label: '出租率' },
      { variable: 'depleteSpeed', label: '去化周期' }
    ];
    const SENS_DELTAS = [-0.2, -0.1, 0.1, 0.2];
    const sensitivity = [];
    SENS_VARIABLES.forEach(function (sv) {
      SENS_DELTAS.forEach(function (delta) {
        const p = buildParams();
        if (sv.variable === 'salePrice') {
          p.weightedSalePrice *= (1 + delta);
        } else if (sv.variable === 'rentPrice') {
          p.weightedRent *= (1 + delta);
        } else if (sv.variable === 'constructionCost') {
          const deltaCost = constructionTotal * delta;
          p.totalInvestment = round2(p.totalInvestment + deltaCost);
          if (totalBuildingArea > 0) p.constructionCostForSale = round2(p.constructionCostForSale + deltaCost * saleableArea / totalBuildingArea);
        } else if (sv.variable === 'landPrice') {
          const deltaCost = landBase * delta;
          p.totalInvestment = round2(p.totalInvestment + deltaCost);
          if (aboveGroundArea > 0) p.landCostForSale = round2(p.landCostForSale + deltaCost * saleableArea / aboveGroundArea);
        } else if (sv.variable === 'occupancyRate') {
          p.occupancyRate = Math.min(1, p.occupancyRate * (1 + delta)); // 上限 100%
        } else if (sv.variable === 'depleteSpeed') {
          // 去化周期 ±delta → 去化速度反向换算
          p.saleSpeed /= (1 + delta);
          p.rentSpeed /= (1 + delta);
        }
        const run = runDynamicModel(p);
        sensitivity.push({
          variable: sv.variable,
          label: sv.label,
          delta: delta,
          npv: run.metrics.npv,
          irr: run.metrics.irr,
          equityIrr: run.metrics.equityIrr,
          paybackPeriod: run.metrics.paybackPeriod
        });
      });
    });

    return {
      inputs: {
        discountRate: discountRate,
        operationYears: operationYears,
        rentGrowthRate: rentGrowthRate,
        saleGrowthRate: saleGrowthRate,
        saleSpeed: saleSpeed,
        rentSpeed: rentSpeed,
        occupancyRate: occupancyRate,
        presaleEnabled: presaleEnabled,
        presalePctYear1: presalePctYear1,
        presalePctYear2: presalePctYear2,
        constructionYears: constructionYears
      },
      base: {
        totalInvestment: round2(totalInvestment),
        ownFunds: baseRun.ownFunds,
        loanCap: baseRun.loanCap,
        actualLoan: baseRun.actualLoan,
        financingRate: round2(financingRate * 100),
        saleableArea: saleableArea,
        rentableArea: rentableArea,
        rentCapArea: baseRun.rentCapArea,
        weightedSalePrice: weightedSalePrice,
        weightedRent: weightedRent,
        marketingRate: round2(marketingRate * 100),
        managementRate: round2(managementRate * 100),
        rentalOpRate: round2(rentalOpRate * 100),
        lvatSettlement: baseRun.lvatSettlement,
        incomeTaxSettlement: baseRun.incomeTaxSettlement,
        saleFinishYear: baseRun.saleFinishYear,
        rentFullYear: baseRun.rentFullYear
      },
      years: baseRun.years,
      metrics: baseRun.metrics,
      sensitivity: sensitivity
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
    const c = { v: typeof v === 'number' ? (opts.raw ? v : round2(v)) : v };
    if (v == null) {
      c.v = '';
      c.t = 's';
    } else if (typeof c.v === 'number') {
      c.t = 'n';
    } else if (typeof c.v === 'string') {
      c.t = 's';
    } else if (typeof c.v === 'boolean') {
      c.t = 'b';
    } else if (c.v instanceof Date) {
      c.t = 'd';
    }
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
  function totalCell(v, f, raw) { return cell(v, { bold: true, fill: STYLE.totalFill, fontColor: STYLE.totalFont, numFmt: '#,##0.00', f: f, raw: !!raw }); }
  function moneyCell(v, f, raw) { return cell(v, { numFmt: '#,##0.00', align: 'right', f: f, raw: !!raw }); }
  function numCell(v, f, raw) { return cell(v, { numFmt: '#,##0.00', align: 'right', f: f, raw: !!raw }); }
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
      // 成本指标可跨表引用（如分栋厂房引用加权平均造价表），回退到数值
      ws[encode(r, 3)] = it.unitPriceFormula ? numCell(it.unitPrice, it.unitPriceFormula) : numCell(it.unitPrice);
      // 工程量优先使用公式引用（如 '规划指标'!B3），回退到数值；带公式时写 raw 缓存保留完整精度
      if (it.quantityFormula) {
        ws[encode(r, 4)] = numCell(it.quantity, it.quantityFormula, true);
      } else {
        ws[encode(r, 4)] = numCell(it.quantity);
      }
      const unit = it.unit || '';
      const hasDivide = unit.includes('元/m²') || unit.includes('元/m') || unit.includes('元/KVA');
      // 金额类明细行包 ROUND(...,2)，与 JS 先 round2 再求和口径一致，避免 Excel 重算后小计漂移
      const formula = hasDivide ? `ROUND(${col(3)}${r + 1}*${col(4)}${r + 1}/10000,2)` : `ROUND(${col(3)}${r + 1}*${col(4)}${r + 1},2)`;
      // 若 item 自定义了成本公式（如增值税），优先使用
      let costFormula;
      if (it.vatDE) {
        // 增值税专用：成本 = 税率 × 不含税工程量（D×E 联动结构保持不包 ROUND）
        costFormula = `${col(3)}${r + 1}*${col(4)}${r + 1}`;
      } else {
        costFormula = it.costFormula ? `ROUND(${it.costFormula},2)` : formula;
      }
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
    // 计算每种类型的行范围（1-based）和加权平均单价
    const typeRange = {};
    const typeSum = {};
    costPriceRows.forEach((it, idx) => {
      const rowNum = idx + 3;
      if (!typeRange[it.type]) { typeRange[it.type] = { first: rowNum, last: rowNum }; typeSum[it.type] = { area: 0, cost: 0 }; }
      else typeRange[it.type].last = rowNum;
      typeSum[it.type].area += it.area;
      typeSum[it.type].cost += round2(it.area * it.price / 10000);
    });
    // 写入加权平均单价：有面积的子形态行显示该类型加权平均单价，面积为0的留空
    const weightedAvgCellByType = {}; // 各产品类型首个加权平均单价单元格（供完整版成本指标引用）
    costPriceRows.forEach((it, idx) => {
      const r = idx + 2;
      const range = typeRange[it.type];
      if (it.area > 0 && range) {
        const sum = typeSum[it.type];
        const avg = sum.area > 0 ? round2(sum.cost * 10000 / sum.area) : 0;
        const formula = `IF(ROUND(SUM(C${range.first}:C${range.last}),2)=0,0,ROUND(SUMPRODUCT(C${range.first}:C${range.last},D${range.first}:D${range.last})/ROUND(SUM(C${range.first}:C${range.last}),2),2))`;
        ws0_5[encode(r, 5)] = numCell(avg, formula);
        if (!weightedAvgCellByType[it.type]) weightedAvgCellByType[it.type] = 'F' + (r + 1);
      } else {
        ws0_5[encode(r, 5)] = textCell('—');
      }
    });
    const cprTotalRow = costPriceRows.length + 2; // 0-based
    const cprTotalRowNum = cprTotalRow + 1; // 1-based
    const cprDataLastRowNum = cprTotalRowNum - 1; // 1-based，最后一个数据行
    const cprTotalArea = costPriceRows.reduce((s, it) => s + it.area, 0);
    const cprTotalCost = costPriceRows.reduce((s, it) => s + round2(it.area * it.price / 10000), 0);
    const cprWeightedAvg = cprTotalArea > 0 ? round2(cprTotalCost * 10000 / cprTotalArea) : 0;
    ws0_5[encode(cprTotalRow, 0)] = totalCell('合计');
    ws0_5[encode(cprTotalRow, 2)] = totalCell(cprTotalArea, `ROUND(SUM(C3:C${cprDataLastRowNum}),2)`);
    ws0_5[encode(cprTotalRow, 4)] = totalCell(cprTotalCost, `ROUND(SUM(E3:E${cprDataLastRowNum}),2)`);
    ws0_5[encode(cprTotalRow, 5)] = totalCell(cprWeightedAvg, `IF(C${cprTotalRowNum}=0,0,E${cprTotalRowNum}/C${cprTotalRowNum}*10000)`);
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
    ws[encode(row, 5)] = subtotalCell(fullEstimate.landCost.total, `ROUND(SUM(${col(5)}${landStart + 1}:${col(5)}${row}),2)`);
    ws[encode(row, 6)] = numCell(round2(fullEstimate.landCost.total * 10000 / totalBuildingArea), `${col(5)}${row + 1}/${ws._totalBuildingAreaRef}*10000`);
    ws[encode(row, 7)] = numCell(round2(fullEstimate.landCost.total * 10000 / aboveGroundArea), `${col(5)}${row + 1}/${ws._aboveGroundAreaRef}*10000`);
    const landSubtotalRow = row + 1;
    row += 1;

    // 二、前期费用
    ws[encode(row, 0)] = textCell('二');
    ws[encode(row, 1)] = subtotalCell('前期费用');
    for (let c = 2; c <= 8; c++) ws[encode(row, c)] = cell('', { fill: STYLE.subtotalFill });
    const prelimStart = row + 1;
    row = addItems(ws, prelimStart, fullEstimate.preliminary.items, 5, 4, 3);
    ws[encode(row, 1)] = subtotalCell('  小计');
    ws[encode(row, 5)] = subtotalCell(fullEstimate.preliminary.total, `ROUND(SUM(${col(5)}${prelimStart + 1}:${col(5)}${row}),2)`);
    ws[encode(row, 6)] = numCell(round2(fullEstimate.preliminary.total * 10000 / totalBuildingArea), `${col(5)}${row + 1}/${ws._totalBuildingAreaRef}*10000`);
    ws[encode(row, 7)] = numCell(round2(fullEstimate.preliminary.total * 10000 / aboveGroundArea), `${col(5)}${row + 1}/${ws._aboveGroundAreaRef}*10000`);
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
    ws[encode(row, 5)] = subtotalCell(fullEstimate.infrastructure.total, `ROUND(SUM(${col(5)}${infraStart + 1}:${col(5)}${row}),2)`);
    ws[encode(row, 6)] = numCell(round2(fullEstimate.infrastructure.total * 10000 / totalBuildingArea), `${col(5)}${row + 1}/${ws._totalBuildingAreaRef}*10000`);
    ws[encode(row, 7)] = numCell(round2(fullEstimate.infrastructure.total * 10000 / aboveGroundArea), `${col(5)}${row + 1}/${ws._aboveGroundAreaRef}*10000`);
    const infraSubtotalRow = row + 1;
    row += 1;

    // 3.2 景观工程
    ws[encode(row, 1)] = subtotalCell('  3.2 景观工程');
    for (let c = 2; c <= 8; c++) ws[encode(row, c)] = cell('', { fill: STYLE.subtotalFill });
    const landStart2 = row + 1;
    row = addItems(ws, landStart2, fullEstimate.landscape.items, 5, 4, 3);
    ws[encode(row, 1)] = subtotalCell('    小计');
    ws[encode(row, 5)] = subtotalCell(fullEstimate.landscape.total, `ROUND(SUM(${col(5)}${landStart2 + 1}:${col(5)}${row}),2)`);
    ws[encode(row, 6)] = numCell(round2(fullEstimate.landscape.total * 10000 / totalBuildingArea), `${col(5)}${row + 1}/${ws._totalBuildingAreaRef}*10000`);
    ws[encode(row, 7)] = numCell(round2(fullEstimate.landscape.total * 10000 / aboveGroundArea), `${col(5)}${row + 1}/${ws._aboveGroundAreaRef}*10000`);
    const landscapeSubtotalRow = row + 1;
    row += 1;

    // 3.3 公建配套
    ws[encode(row, 1)] = subtotalCell('  3.3 公建配套');
    for (let c = 2; c <= 8; c++) ws[encode(row, c)] = cell('', { fill: STYLE.subtotalFill });
    const pubStart = row + 1;
    row = addItems(ws, pubStart, fullEstimate.publicFacility.items, 5, 4, 3);
    ws[encode(row, 1)] = subtotalCell('    小计');
    ws[encode(row, 5)] = subtotalCell(fullEstimate.publicFacility.total, `ROUND(SUM(${col(5)}${pubStart + 1}:${col(5)}${row}),2)`);
    ws[encode(row, 6)] = numCell(round2(fullEstimate.publicFacility.total * 10000 / totalBuildingArea), `${col(5)}${row + 1}/${ws._totalBuildingAreaRef}*10000`);
    ws[encode(row, 7)] = numCell(round2(fullEstimate.publicFacility.total * 10000 / aboveGroundArea), `${col(5)}${row + 1}/${ws._aboveGroundAreaRef}*10000`);
    const publicSubtotalRow = row + 1;
    row += 1;

    // 3.4 单体建安成本
    ws[encode(row, 1)] = subtotalCell('  3.4 单体建安成本');
    for (let c = 2; c <= 8; c++) ws[encode(row, c)] = cell('', { fill: STYLE.subtotalFill });
    const buildStart = row + 1;
    // 分栋厂房成本指标改为公式引用「加权平均造价表」对应加权平均单价单元格（缓存值不变）
    const buildingItemsXlsx = fullEstimate.building.items.map(it =>
      it.name === '分栋厂房' && weightedAvgCellByType['分栋厂房']
        ? Object.assign({}, it, { unitPriceFormula: `'加权平均造价表'!${weightedAvgCellByType['分栋厂房']}` })
        : it);
    row = addItems(ws, buildStart, buildingItemsXlsx, 5, 4, 3);
    ws[encode(row, 1)] = subtotalCell('    小计');
    ws[encode(row, 5)] = subtotalCell(fullEstimate.building.total, `ROUND(SUM(${col(5)}${buildStart + 1}:${col(5)}${row}),2)`);
    ws[encode(row, 6)] = numCell(round2(fullEstimate.building.total * 10000 / totalBuildingArea), `${col(5)}${row + 1}/${ws._totalBuildingAreaRef}*10000`);
    ws[encode(row, 7)] = numCell(round2(fullEstimate.building.total * 10000 / aboveGroundArea), `${col(5)}${row + 1}/${ws._aboveGroundAreaRef}*10000`);
    const buildingSubtotalRow = row + 1;
    row += 1;

    // 不可预见费 + 增值税
    const constructionSubtotalFormula = `F${infraSubtotalRow}+F${landscapeSubtotalRow}+F${publicSubtotalRow}+F${buildingSubtotalRow}`;
    ws[encode(row, 1)] = textCell('  不可预见费', '  ');
    ws[encode(row, 5)] = moneyCell(fullEstimate.construction.contingency, `(${col(5)}${landSubtotalRow}+${col(5)}${prelimSubtotalRow}+${constructionSubtotalFormula})*0.03`);
    ws[encode(row, 6)] = numCell(round2(fullEstimate.construction.contingency * 10000 / totalBuildingArea), `${col(5)}${row + 1}/${ws._totalBuildingAreaRef}*10000`);
    ws[encode(row, 7)] = numCell(round2(fullEstimate.construction.contingency * 10000 / aboveGroundArea), `${col(5)}${row + 1}/${ws._aboveGroundAreaRef}*10000`);
    const contingencyRow = row + 1;
    row += 1;
    const constructionSubtotalCost = round2(fullEstimate.infrastructure.total + fullEstimate.landscape.total + fullEstimate.publicFacility.total + fullEstimate.building.total);
    ws[encode(row, 1)] = textCell('  其中增值税', '  ');
    ws[encode(row, 3)] = numCell(0.09, '0.09');
    ws[encode(row, 4)] = numCell(round2(constructionSubtotalCost / 1.09), `ROUND(${constructionSubtotalFormula},2)/1.09`);
    ws[encode(row, 5)] = moneyCell(fullEstimate.construction.vat, `${col(3)}${row + 1}*${col(4)}${row + 1}`);
    ws[encode(row, 6)] = numCell(round2(fullEstimate.construction.vat * 10000 / totalBuildingArea), `${col(5)}${row + 1}/${ws._totalBuildingAreaRef}*10000`);
    ws[encode(row, 7)] = numCell(round2(fullEstimate.construction.vat * 10000 / aboveGroundArea), `${col(5)}${row + 1}/${ws._aboveGroundAreaRef}*10000`);
    const constructionVATRow = row + 1;
    row += 1;
    ws[encode(row, 1)] = subtotalCell('  建安工程成本合计');
    ws[encode(row, 5)] = subtotalCell(fullEstimate.construction.total, `ROUND(${constructionSubtotalFormula}+${col(5)}${contingencyRow}+${col(5)}${constructionVATRow},2)`);
    ws[encode(row, 6)] = numCell(round2(fullEstimate.construction.total * 10000 / totalBuildingArea), `${col(5)}${row + 1}/${ws._totalBuildingAreaRef}*10000`);
    ws[encode(row, 7)] = numCell(round2(fullEstimate.construction.total * 10000 / aboveGroundArea), `${col(5)}${row + 1}/${ws._aboveGroundAreaRef}*10000`);
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
      { code: '七', name: '财务费用', cost: fullEstimate.financial.total, f: `ROUND((${col(5)}${landSubtotalRow}+${col(5)}${prelimSubtotalRow}+${col(5)}${constructionTotalRow})*${finRatio}*${finRate}*${avgInterestYears}+${fullEstimate.financial.bankFee},2)` }
    ];
    categories.forEach(cat => {
      const catRow = row + 1; // 1-based Excel row
      categoryRows.push(catRow);
      ws[encode(row, 0)] = textCell(cat.code);
      ws[encode(row, 1)] = subtotalCell(cat.name);
      for (let c = 2; c <= 8; c++) ws[encode(row, c)] = cell('', { fill: STYLE.subtotalFill });
      ws[encode(row, 5)] = subtotalCell(cat.cost, cat.f);
      ws[encode(row, 6)] = numCell(round2(cat.cost * 10000 / totalBuildingArea), `${col(5)}${catRow}/${ws._totalBuildingAreaRef}*10000`);
      ws[encode(row, 7)] = numCell(round2(cat.cost * 10000 / aboveGroundArea), `${col(5)}${catRow}/${ws._aboveGroundAreaRef}*10000`);
      row += 1;
    });

    // 发展成本合计
    const totalRow = row + 1;
    ws[encode(row, 0)] = textCell('合计');
    ws[encode(row, 1)] = totalCell('发展成本合计');
    for (let c = 2; c <= 8; c++) ws[encode(row, c)] = cell('', { fill: STYLE.totalFill });
    ws[encode(row, 5)] = totalCell(fullEstimate.summary.totalInvestment, `ROUND(${col(5)}${landSubtotalRow}+${col(5)}${prelimSubtotalRow}+${col(5)}${constructionTotalRow}+${col(5)}${categoryRows[0]}+${col(5)}${categoryRows[1]}+${col(5)}${categoryRows[2]}+${col(5)}${categoryRows[3]},2)`);
    ws[encode(row, 6)] = numCell(round2(fullEstimate.summary.totalInvestment * 10000 / totalBuildingArea), `${col(5)}${totalRow}/${ws._totalBuildingAreaRef}*10000`);
    ws[encode(row, 7)] = numCell(round2(fullEstimate.summary.totalInvestment * 10000 / aboveGroundArea), `${col(5)}${totalRow}/${ws._aboveGroundAreaRef}*10000`);
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
    const totalSimpleAmount = simple.reduce((s, it) => it.code === '合计' ? s : s + it.amount, 0);
    simple.forEach((it, idx) => {
      const r = idx + 2;
      const rowNum = r + 1; // 1-based
      const isTotal = it.code === '合计';
      const fullRow = fullRowMap[it.code];
      const amountFormula = fullRow ? `'投资估算完整版'!F${fullRow}` : null;
      const pct = isTotal ? 100 : (totalSimpleAmount > 0 ? round2(it.amount / totalSimpleAmount * 100) : 0);
      ws2[encode(r, 0)] = isTotal ? totalCell(it.code) : textCell(it.code);
      ws2[encode(r, 1)] = isTotal ? totalCell(it.category) : textCell(it.category);
      ws2[encode(r, 2)] = isTotal ? totalCell(it.amount, amountFormula) : moneyCell(it.amount, amountFormula);
      ws2[encode(r, 3)] = isTotal ? totalCell(100, null, { numFmt: '0.00"%"' }) : numCell(pct, `IF($C$${totalSimpleRow}=0,0,ROUND(C${rowNum}/$C$${totalSimpleRow}*100,2))`);
      ws2[encode(r, 3)].s = Object.assign({}, ws2[encode(r, 3)].s, { numFmt: '0.00"%"', alignment: { horizontal: 'right', vertical: 'center' } });
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
      const totalFinancialCost = (staticResult.sale.financialCost || 0) + (staticResult.rent.financialCost || 0);
      const costRows = [
        ['土地价格', staticResult.inputs.landPrice || 0, '万元/亩'],
        ['土地成本单方（土地配套费合计）', staticResult.constructionCost.landCostPerArea, '元/㎡'],
        ['建安成本单方（前期+建安工程）', staticResult.constructionCost.saleConstructionUnitCost, '元/㎡'],
        ['综合建造成本（不含期间费用）', staticResult.constructionCost.costUnitCost, '元/㎡'],
        ['财务费用', totalFinancialCost, '万元'],
        ['综合单方成本（含期间费用）', staticResult.constructionCost.unitCost, '元/㎡']
      ];
      costRows.forEach((row, idx) => {
        const r = costStart + 2 + idx;
        ws[encode(r, 0)] = textCell(row[0]);
        ws[encode(r, 1)] = numCell(row[1]);
        ws[encode(r, 2)] = textCell(row[2]);
      });
      return {
        nextRow: costStart + costRows.length + 2,
        costStart,
        costLandTaxRow: costStart + 4,       // 1-based，土地成本单方（土地配套费合计）
        costSaleConstructionRow: costStart + 5, // 1-based，建安成本单方（前期+建安工程），销售测算扣减用
        costConstructionRow: costStart + 6,  // 1-based，综合建造成本（含土地，租赁总投用）
        financialRow: costStart + 7,         // 1-based，财务费用
        costUnitRow: costStart + 8           // 1-based，综合单方成本
      };
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
    const ssr = saleStartIdx + 1;        // 1-based，可售面积行
    // 租赁测算与销售测算的规划/成本区结构相同，因此可租面积行号相同
    const rsr = ssr;
    const costLandTaxRow = planCost1.costLandTaxRow;
    const costSaleConstructionRow = planCost1.costSaleConstructionRow;
    const financialRow = planCost1.financialRow;
    const saleRows = [
      { name: '可售面积', value: staticResult.metrics.soldAreaTotal, unit: 'm²', desc: '', f: `'租售面积分配'!B${saleAllocTotalRow}` },
      { name: '加权平均售价', value: staticResult.sale.rawWeightedPrice, unit: '万元/㎡', desc: '', f: `'租售面积分配'!E${saleAllocTotalRow}`, raw: true },
      { name: '不含税售价', value: round2(staticResult.sale.weightedPrice / 1.09), unit: '万元/㎡', desc: '售价/1.09', f: `ROUND(B${ssr + 1}/1.09,2)` },
      { name: '销售收入', value: staticResult.sale.totalRevenue, unit: '万元', desc: '可售面积×加权平均售价', f: `'租售面积分配'!D${saleAllocTotalRow}` },
      { name: '减：土地成本', value: staticResult.sale.landCost, unit: '万元', desc: '', f: `ROUND(B${ssr}*$B$${costLandTaxRow}/10000,2)` },
      { name: '减：建安成本', value: staticResult.sale.constructionCost, unit: '万元', desc: '', f: `ROUND(B${ssr}*$B$${costSaleConstructionRow}/10000,2)` },
      { name: '减：税金及附加', value: staticResult.sale.taxSurcharge, unit: '万元', desc: '', f: `ROUND(B${ssr + 3}/1.09*0.006,2)` },
      { name: '减：土地增值税', value: staticResult.sale.landValueAddedTax, unit: '万元', desc: '', f: `'土地增值税测算表'!C14` },
      { name: '减：营销费用', value: staticResult.sale.marketingCost, unit: '万元', desc: '', f: `ROUND(B${ssr + 3}*${staticResult.inputs.marketingRate / 100},2)` },
      { name: '减：管理费用', value: staticResult.sale.managementCost, unit: '万元', desc: '', f: `ROUND(B${ssr + 3}*${staticResult.inputs.managementRate / 100},2)` },
      { name: '减：财务费用', value: staticResult.sale.financialCost, unit: '万元', desc: '', f: `ROUND(B${ssr}/(B${ssr}+'租赁测算'!B${rsr})*$B$${financialRow},2)` },
      { name: '利润总额', value: staticResult.sale.profit, unit: '万元', desc: '', f: `ROUND(B${ssr + 3}-SUM(B${ssr + 4}:B${ssr + 10}),2)` },
      { name: '减：所得税', value: staticResult.sale.incomeTax, unit: '万元', desc: '', f: `ROUND(MAX(B${ssr + 11}*0.25,0),2)` },
      { name: '净利润', value: staticResult.sale.netProfit, unit: '万元', desc: '', f: `ROUND(B${ssr + 11}-B${ssr + 12},2)` },
      { name: '销售净利率', value: staticResult.sale.netMargin, unit: '%', desc: '', f: `IF(B${ssr + 3}=0,0,ROUND(B${ssr + 13}/B${ssr + 3}*100,2))` }
    ];
    saleRows.forEach((row, idx) => {
      const r = saleStartIdx + idx;
      const isTotal = row.name === '净利润';
      ws1[encode(r, 0)] = isTotal ? totalCell(row.name) : textCell(row.name);
      ws1[encode(r, 1)] = isTotal ? totalCell(row.value, row.f) : moneyCell(row.value, row.f, row.raw);
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
    // rsr 已在销售测算前计算（两表结构相同）
    const costConstructionRow2 = planCost2.costConstructionRow;
    const financialRow2 = planCost2.financialRow;
    const rentRows = [
      { name: '可租面积', value: staticResult.metrics.rentableArea, unit: 'm²', desc: '', f: `'租售面积分配'!B${rentAllocTotalRow}` },
      { name: '加权平均租金', value: staticResult.rent.rawWeightedRent, unit: '元/天/㎡', desc: '', f: `'租售面积分配'!E${rentAllocTotalRow}`, raw: true },
      { name: '月租金', value: staticResult.rent.monthlyRent, unit: '元/月/㎡', desc: '日租金×30', f: `ROUND(B${rsr + 1}*30,2)` },
      { name: '年租金收入', value: staticResult.rent.yearlyRent, unit: '元/年/㎡', desc: '年租金=加权平均租金×360', f: `ROUND(B${rsr + 1}*360,2)` },
      { name: '出租率', value: staticResult.rent.occupancyRate, unit: '%', desc: '', f: null },
      { name: '有效年租金', value: staticResult.rent.effectiveYearlyRent, unit: '元/年/㎡', desc: '年租金×出租率', f: `ROUND(B${rsr + 3}*B${rsr + 4}/100,2)` },
      { name: '减：税金及附加', value: staticResult.rent.taxSurcharge, unit: '元/年/㎡', desc: '', f: `ROUND(B${rsr + 5}*0.006,2)` },
      { name: '减：房产税', value: staticResult.rent.propertyTax, unit: '元/年/㎡', desc: '', f: `ROUND(B${rsr + 5}*0.12,2)` },
      { name: '减：土地使用税', value: staticResult.rent.landUseTax, unit: '元/㎡/年', desc: '', f: null },
      { name: '减：运营费用', value: staticResult.rent.rentalOpCost, unit: '元/年/㎡', desc: '', f: `ROUND(B${rsr + 5}*${staticResult.inputs.rentalOpRate / 100},2)` },
      { name: '净租赁收入', value: staticResult.rent.netRentPerSqm, unit: '元/年/㎡', desc: '', f: `ROUND(B${rsr + 5}-SUM(B${rsr + 6}:B${rsr + 9}),2)` },
      { name: '净租赁收入总额', value: staticResult.rent.netRentalIncome, unit: '万元/年', desc: '', f: `ROUND(B${rsr + 10}*B${rsr}/10000,2)` },
      { name: '租赁总投', value: staticResult.rent.rentalTotalInvestment, unit: '万元', desc: '', f: `ROUND(B${rsr}*$B$${costConstructionRow2}/10000+B${rsr}/('销售测算'!B${ssr}+B${rsr})*$B$${financialRow2},2)` },
      { name: 'NOI', value: staticResult.rent.noi, unit: '%', desc: '', f: `IF(B${rsr + 12}=0,0,ROUND(B${rsr + 11}/B${rsr + 12}*100,2))` }
    ];
    rentRows.forEach((row, idx) => {
      const r = rentStartIdx + idx;
      const isKey = row.name === '净租赁收入' || row.name === 'NOI';
      ws2[encode(r, 0)] = isKey ? totalCell(row.name) : textCell(row.name);
      ws2[encode(r, 1)] = isKey ? totalCell(row.value, row.f) : moneyCell(row.value, row.f, row.raw);
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
    ws3[encode(saleTotalIdx, 1)] = totalCell(staticResult.metrics.soldAreaTotal, `ROUND(SUM(B4:B${saleDataLastRowNum}),2)`);
    ws3[encode(saleTotalIdx, 2)] = totalCell('—');
    ws3[encode(saleTotalIdx, 3)] = totalCell(staticResult.sale.totalRevenue, `ROUND(SUM(D4:D${saleDataLastRowNum}),2)`);
    ws3[encode(saleTotalIdx, 4)] = totalCell(staticResult.sale.rawWeightedPrice, `IF(B${saleTotalRowNum}=0,0,ROUND(D${saleTotalRowNum}/B${saleTotalRowNum},6))`, true);

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
      ws3[encode(r, 3)] = moneyCell(it.annualRevenue, `B${rowNum}*C${rowNum}*360*${staticResult.inputs.occupancyRate / 100}/10000`);
      ws3[encode(r, 4)] = numCell(0);
    });
    const rentTotalIdx = rentHeaderIdx + 1 + staticResult.rent.details.length; // 0-based
    const rentTotalRowNum = rentTotalIdx + 1; // 1-based
    const rentDetailStartRowNum = rentHeaderIdx + 2; // 1-based
    const rentDataLastRowNum = rentTotalRowNum - 1; // 1-based，最后一个数据行
    const grossAnnualRentTotal = round2(staticResult.rent.details.reduce((s, d) => s + d.annualRevenue, 0));
    ws3[encode(rentTotalIdx, 0)] = totalCell('合计');
    ws3[encode(rentTotalIdx, 1)] = totalCell(staticResult.metrics.rentedAreaTotal, `ROUND(SUM(B${rentDetailStartRowNum}:B${rentDataLastRowNum}),2)`);
    ws3[encode(rentTotalIdx, 2)] = totalCell('—');
    ws3[encode(rentTotalIdx, 3)] = totalCell(grossAnnualRentTotal, `ROUND(SUM(D${rentDetailStartRowNum}:D${rentDataLastRowNum}),2)`);
    ws3[encode(rentTotalIdx, 4)] = totalCell(staticResult.rent.rawWeightedRent, `IF(B${rentTotalRowNum}=0,0,ROUND(SUMPRODUCT(B${rentDetailStartRowNum}:B${rentDataLastRowNum},C${rentDetailStartRowNum}:C${rentDataLastRowNum})/B${rentTotalRowNum},6))`, true);

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
    const s = staticResult.sale;
    const lvatDevExpense = round2((s.landCost + s.constructionCost) * 0.1);
    const lvatOtherDeduction = round2((s.landCost + s.constructionCost) * 0.2);
    const lvatTaxRate = s.totalRevenue > 0 ? round2(s.landValueAddedTax / s.totalRevenue * 100) : 0;
    // 可售面积在 staticResult.metrics 上（sale 对象无 soldAreaTotal 字段，误读会导致缓存恒为 0）
    const lvatSoldArea = staticResult.metrics.soldAreaTotal;
    const lvatTaxPerArea = lvatSoldArea > 0 ? round2(s.landValueAddedTax / lvatSoldArea * 10000) : 0;
    const landTaxRows = [
      { no: '1', name: '转让房地产收入总额', value: s.totalRevenue, f: landTaxSaleRevenueCell, note: '=销售测算.销售收入' },
      { no: '2', name: '扣除项目金额合计', value: s.lvatDeductionTotal, f: 'ROUND(C5+C6+C7+C8+C9,2)', note: '=①+②+③+④+⑤' },
      { no: '3', name: '①取得土地使用权所支付的金额', value: s.landCost, f: landTaxLandCostCell, note: '=销售测算.土地成本' },
      { no: '4', name: '②房地产开发成本', value: s.constructionCost, f: landTaxConstructCell, note: '=销售测算.建安成本' },
      { no: '5', name: '③房地产开发费用', value: lvatDevExpense, f: 'ROUND((C5+C6)*10%,2)', note: '=(③+④)×10%' },
      { no: '6', name: '④与转让房地产有关的税金', value: s.taxSurcharge, f: landTaxTaxSurchargeCell, note: '=销售测算.税金及附加' },
      { no: '7', name: '⑤财政部规定的其他扣除项目', value: lvatOtherDeduction, f: 'ROUND((C5+C6)*20%,2)', note: '=(③+④)×20%' },
      { no: '8', name: '增值额', value: s.lvatIncrement, f: 'ROUND(C3-C4,2)', note: '=①-②' },
      { no: '9', name: '增值额与扣除项目金额之比（%）', value: s.lvatRatio, f: 'IF(C4=0,0,ROUND(C10/C4*100,2))', note: '=⑧/②' },
      { no: '10', name: '适用税率（%）', value: s.lvatRate, f: 'IF(C11<=50,30,IF(C11<=100,40,IF(C11<=200,50,60)))', note: '四级超率累进' },
      { no: '11', name: '速算扣除系数（%）', value: s.lvatQuick, f: 'IF(C11<=50,0,IF(C11<=100,5,IF(C11<=200,15,35)))', note: '四级超率累进' },
      { no: '12', name: '应缴土地增值税税额', value: s.landValueAddedTax, f: 'ROUND(C10*C12/100-C4*C13/100,2)', note: '=⑧×⑩-②×⑪' },
      { no: '13', name: '土增税负率', value: lvatTaxRate, f: 'IF(C3=0,0,ROUND(C14/C3*100,2))', note: '=⑫/①' },
      { no: '14', name: '土增税（元/㎡）', value: lvatTaxPerArea, f: `IF(${landTaxSoldAreaCell}=0,0,ROUND(C14/${landTaxSoldAreaCell}*10000,2))`, note: '=⑫/可售面积' }
    ];
    landTaxRows.forEach((row, idx) => {
      const r = idx + 2;
      const isKey = row.name === '应缴土地增值税税额';
      ws4[encode(r, 0)] = textCell(row.no);
      ws4[encode(r, 1)] = textCell(row.name);
      ws4[encode(r, 2)] = isKey ? totalCell(row.value, row.f) : moneyCell(row.value, row.f);
      ws4[encode(r, 3)] = textCell(row.note || '');
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
      { name: '资金盈余/缺口', value: staticResult.summary.fundingGap, unit: '万元', f: `ROUND(B3-(1-${finRatio})*B3-'销售测算'!B${ssr + 3},2)` },
      { name: '销售净利润覆盖租赁总投比例', value: staticResult.summary.saleProfitCoverRatio, unit: '%', f: `IF('租赁测算'!B${rsr + 12}=0,0,ROUND(B4/'租赁测算'!B${rsr + 12}*100,2))` },
      { name: '销售净利率', value: staticResult.summary.saleNetMargin, unit: '%', f: `'销售测算'!B${ssr + 14}` },
      { name: '租赁 NOI', value: staticResult.summary.noi, unit: '%', f: `'租赁测算'!B${rsr + 13}` },
      { name: '总投资收益率', value: staticResult.summary.totalInvestmentReturn, unit: '%', f: `IF(B3=0,0,ROUND(B5/B3*100,2))` },
      { name: '静态投资回收期', value: staticResult.summary.paybackPeriod, unit: '年', f: `IF(B5=0,0,ROUND(B3/B5,2))` }
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


  // ==================== 动态投资分析 Excel 导出 ====================
  // Sheet1 多年现金流表：顶部参数区（黄色底纹 = 可编辑输入格，蓝色 = 派生公式格）+ 按年公式链 + 内置 NPV()/IRR()；
  // Sheet2 敏感性分析（6 变量 × 4 档全量）；Sheet3 关键指标汇总。所有带公式单元格写入 JS 预计算缓存值。
  NS.downloadDynamicAnalysisExcel = function (dynamicResult, fileName) {
    if (typeof XLSX === 'undefined') { alert('Excel 导出库未加载，请检查网络。'); return; }
    if (!dynamicResult || !dynamicResult.years || !dynamicResult.years.length) { alert('请先完成动态投资分析计算'); return; }
    const wb = XLSX.utils.book_new();
    const d = dynamicResult;
    const b = d.base;
    const years = d.years;
    const N = years.length;
    const INPUT_FILL = 'FFF7E6';   // 可编辑输入格底色
    const CALC_FILL = 'E0F2FE';    // 派生公式格底色

    function inputCell(v, numFmt) { return cell(v, { fill: INPUT_FILL, numFmt: numFmt || '#,##0.00', align: 'right', raw: true }); }
    function inputPctCell(v) { return inputCell(v, '0.00"%"'); }
    function inputIntCell(v) { return inputCell(v, '0'); }
    function calcParamCell(v, f, numFmt) { return cell(v, { f: f, fill: CALC_FILL, numFmt: numFmt || '#,##0.00', align: 'right' }); }
    function pctResultCell(v, f) { // v 为小数（0.1234 表示 12.34%）
      if (v == null) return textCell('—');
      return cell(Math.round(v * 10000) / 10000, { f: f || undefined, numFmt: '0.00%', align: 'right', raw: true });
    }
    function factorCell(v, f) { return cell(v, { f: f, numFmt: '0.000000', align: 'right', raw: true }); }

    // ---------- Sheet 1：多年现金流表 ----------
    const ws1 = {};
    const merges1 = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 24 } },
      { s: { r: 1, c: 0 }, e: { r: 1, c: 24 } }
    ];
    ws1['!merge'] = merges1;
    ws1[encode(0, 0)] = cell('多年现金流表（动态投资分析）', { bold: true, sz: 14 });
    ws1[encode(1, 0)] = cell('黄色底纹为可编辑输入格，蓝色为派生公式格，修改参数区后现金流及指标自动重算（敏感性分析 sheet 为生成时快照，不联动更新）；比率按百分比填（如 8 表示 8%）；金额单位万元、面积单位㎡。', { fontColor: '6B7280' });

    // 参数区：左侧 A:B 合并标签 + C 值 + D 单位；右侧 E:F 合并标签 + G 值 + H 单位
    const financingRatioPct = b.totalInvestment > 0 ? round2(b.loanCap / b.totalInvestment * 100) : 0;
    const leftParams = [
      { name: '总投资', value: b.totalInvestment, unit: '万元' },
      { name: '融资占比', value: financingRatioPct, unit: '%', pct: true },
      { name: '自有资金', value: b.ownFunds, unit: '万元', f: 'ROUND(C3*(1-C4/100),2)' },
      { name: '贷款利率', value: b.financingRate, unit: '%', pct: true },
      { name: '折现率', value: d.inputs.discountRate, unit: '%', pct: true },
      { name: '建设期年数', value: d.inputs.constructionYears, unit: '年', int: true },
      { name: '运营期年数', value: d.inputs.operationYears, unit: '年', int: true },
      { name: '预售开关（1=开，0=关）', value: d.inputs.presaleEnabled ? 1 : 0, unit: '—', int: true },
      { name: '预售第1年去化比例', value: d.inputs.presalePctYear1, unit: '%', pct: true },
      { name: '预售第2年去化比例', value: d.inputs.presalePctYear2, unit: '%', pct: true },
      { name: '清算年序号（空=未清算）', value: b.saleFinishYear != null ? b.saleFinishYear : '', unit: 't', int: true }
    ];
    const rightParams = [
      { name: '加权平均售价', value: b.weightedSalePrice, unit: '万元/㎡' },
      { name: '售价年增长率', value: d.inputs.saleGrowthRate, unit: '%', pct: true },
      { name: '加权平均租金', value: b.weightedRent, unit: '元/天/㎡' },
      { name: '租金年增长率', value: d.inputs.rentGrowthRate, unit: '%', pct: true },
      { name: '销售去化速度', value: d.inputs.saleSpeed, unit: '万㎡/年' },
      { name: '租赁去化速度', value: d.inputs.rentSpeed, unit: '万㎡/年' },
      { name: '可售面积', value: b.saleableArea, unit: '㎡' },
      { name: '可租面积', value: b.rentableArea, unit: '㎡' },
      { name: '稳定出租率', value: d.inputs.occupancyRate, unit: '%', pct: true },
      { name: '满租面积上限', value: b.rentCapArea, unit: '㎡', f: 'ROUND(G10*G11/100,2)' },
      { name: '营销费率', value: b.marketingRate, unit: '%', pct: true },
      { name: '管理费率', value: b.managementRate, unit: '%', pct: true },
      { name: '租赁运营费率', value: b.rentalOpRate, unit: '%', pct: true },
      { name: '土增税清算额', value: b.lvatSettlement, unit: '万元' },
      { name: '所得税清算额', value: b.incomeTaxSettlement, unit: '万元' }
    ];
    leftParams.forEach(function (p, i) {
      const r = 2 + i; // 0-based；1-based 行号 = r+1（3..13）
      merges1.push({ s: { r: r, c: 0 }, e: { r: r, c: 1 } });
      ws1[encode(r, 0)] = cell(p.name, { bold: true, fill: 'F3F4F6' });
      ws1[encode(r, 1)] = cell('', { fill: 'F3F4F6' });
      ws1[encode(r, 2)] = p.f ? calcParamCell(p.value, p.f) : (p.int ? inputIntCell(p.value) : (p.pct ? inputPctCell(p.value) : inputCell(p.value)));
      ws1[encode(r, 3)] = textCell(p.unit);
    });
    rightParams.forEach(function (p, i) {
      const r = 2 + i; // 0-based；1-based 行号 = r+1（3..17）
      merges1.push({ s: { r: r, c: 4 }, e: { r: r, c: 5 } });
      ws1[encode(r, 4)] = cell(p.name, { bold: true, fill: 'F3F4F6' });
      ws1[encode(r, 5)] = cell('', { fill: 'F3F4F6' });
      ws1[encode(r, 6)] = p.f ? calcParamCell(p.value, p.f) : (p.int ? inputIntCell(p.value) : (p.pct ? inputPctCell(p.value) : inputCell(p.value)));
      ws1[encode(r, 7)] = textCell(p.unit);
    });

    // 按年全量行（t=0 起，按 建设期年数+运营期年数 预生成；超出参数区所设区间时公式显示 0）
    const headerRow0 = 18;              // 0-based，1-based 第 19 行
    const firstDataRowNum = 20;         // 1-based 首行数据行
    const lastDataRowNum = 19 + N;      // 1-based 末行数据行
    const headers = ['年份t', '阶段', '销售去化(㎡)', '销售累计(㎡)', '租赁去化(㎡)', '租赁累计(㎡)',
      '销售回款', '租金收入', '销售税费', '运营税费', '运营成本', '清算税费', '可用资金',
      '投资支出', '自有出资', '贷款提款', '利息', '还本', '剩余本金', '股东可分配',
      '项目净现金流', '自有资金现金流', '折现系数', '折现现金流', '累计折现现金流'];
    headers.forEach(function (h, c) { ws1[encode(headerRow0, c)] = headerCell(h); });
    const PHASE_ZH = { construction: '建设期', mixed: '混合期', operation: '运营期' };
    years.forEach(function (y, i) {
      const r0 = headerRow0 + 1 + i;
      const R = r0 + 1; // 1-based
      const t = y.t;
      const prevD = i === 0 ? '0' : ('D' + (R - 1));
      const prevF = i === 0 ? '0' : ('F' + (R - 1));
      const prevS = i === 0 ? '0' : ('S' + (R - 1));
      const prevY = i === 0 ? '0' : ('Y' + (R - 1));
      const prevPSum = i === 0 ? '0' : ('SUM(P$' + firstDataRowNum + ':P' + (R - 1) + ')');
      const pctRef = t === 0 ? '$C$11' : (t === 1 ? '$C$12' : '0');
      ws1[encode(r0, 0)] = cell(t, { numFmt: '0', align: 'right' });
      ws1[encode(r0, 1)] = textCell(PHASE_ZH[y.phase] || y.phase);
      // 去化：MIN(去化速度, 上限 − 累计)；建设期开预售按 比例 × 总量
      ws1[encode(r0, 2)] = numCell(y.saleDepleteArea, 'IF($A' + R + '>=$C$8+$C$9,0,IF($A' + R + '<$C$8,IF($C$10=1,ROUND(MIN(' + pctRef + '*$G$9/100,MAX($G$9-' + prevD + ',0)),2),0),ROUND(MIN($G$7*10000,MAX($G$9-' + prevD + ',0)),2)))');
      ws1[encode(r0, 3)] = numCell(y.saleCumArea, 'ROUND(' + prevD + '+C' + R + ',2)');
      ws1[encode(r0, 4)] = numCell(y.rentDepleteArea, 'IF($A' + R + '>=$C$8+$C$9,0,IF($A' + R + '<$C$8,IF($C$10=1,ROUND(MIN(' + pctRef + '*$G$10/100,MAX($G$12-' + prevF + ',0)),2),0),ROUND(MIN($G$8*10000,MAX($G$12-' + prevF + ',0)),2)))');
      ws1[encode(r0, 5)] = numCell(y.rentCumArea, 'ROUND(' + prevF + '+E' + R + ',2)');
      // 收入与税费（租金按当年末累计已租面积 × 日租金 × 360 计提，建设期不计）
      ws1[encode(r0, 6)] = moneyCell(y.saleRevenue, 'ROUND(C' + R + '*$G$3*(1+$G$4/100)^' + t + ',2)');
      ws1[encode(r0, 7)] = moneyCell(y.rentIncome, 'IF($A' + R + '<$C$8,0,ROUND(F' + R + '*$G$5*360*(1+$G$6/100)^' + t + '/10000,2))');
      ws1[encode(r0, 8)] = moneyCell(y.saleTax, 'ROUND(G' + R + '/1.09*0.006+G' + R + '*$G$13/100+G' + R + '*$G$14/100,2)');
      ws1[encode(r0, 9)] = moneyCell(y.rentTax, 'IF($A' + R + '<$C$8,0,ROUND(H' + R + '*0.006+H' + R + '*0.12+F' + R + '*6/10000,2))');
      ws1[encode(r0, 10)] = moneyCell(y.opCost, 'ROUND(H' + R + '*$G$15/100,2)');
      ws1[encode(r0, 11)] = moneyCell(y.settlementTax, 'IF($C$13="",0,IF($A' + R + '=$C$13,ROUND($G$16+$G$17,2),0))');
      ws1[encode(r0, 12)] = moneyCell(y.availableFunds, 'ROUND(G' + R + '+H' + R + '-I' + R + '-J' + R + '-K' + R + '-L' + R + ',2)');
      // 建设期投入与提款（末年轧差；预售净回款优先替代贷款提款，累计不超过贷款上限）
      ws1[encode(r0, 13)] = moneyCell(y.investOutflow, 'IF($A' + R + '<$C$8,IF($A' + R + '=$C$8-1,ROUND($C$3-ROUND($C$3/$C$8,2)*($C$8-1),2),ROUND($C$3/$C$8,2)),0)');
      ws1[encode(r0, 14)] = moneyCell(y.ownFundOutflow, 'IF($A' + R + '<$C$8,IF($A' + R + '=$C$8-1,ROUND($C$5-ROUND($C$5/$C$8,2)*($C$8-1),2),ROUND($C$5/$C$8,2)),0)');
      ws1[encode(r0, 15)] = moneyCell(y.loanDrawdown, 'IF($A' + R + '<$C$8,ROUND(MIN(MAX(N' + R + '-O' + R + '-M' + R + ',0),MAX(ROUND($C$3*$C$4/100,2)-' + prevPSum + ',0)),2),0)');
      // 运营期还本付息与分配
      ws1[encode(r0, 16)] = moneyCell(y.interest, 'IF($A' + R + '<$C$8,0,ROUND(' + prevS + '*$C$6/100,2))');
      ws1[encode(r0, 17)] = moneyCell(y.principalRepay, 'IF($A' + R + '<$C$8,0,ROUND(MIN(MAX(M' + R + '-Q' + R + ',0),' + prevS + '),2))');
      ws1[encode(r0, 18)] = moneyCell(y.remainingPrincipal, 'IF($A' + R + '<$C$8,ROUND(' + prevS + '+P' + R + ',2),ROUND(' + prevS + '-R' + R + ',2))');
      ws1[encode(r0, 19)] = moneyCell(y.equityDistributable, 'IF($A' + R + '<$C$8,0,ROUND(M' + R + '-Q' + R + '-R' + R + ',2))');
      ws1[encode(r0, 20)] = moneyCell(y.projectNetCF, 'IF($A' + R + '<$C$8,ROUND(M' + R + '-N' + R + ',2),ROUND(M' + R + ',2))');
      ws1[encode(r0, 21)] = moneyCell(y.equityCF, 'IF($A' + R + '<$C$8,ROUND(-O' + R + ',2),ROUND(T' + R + ',2))');
      ws1[encode(r0, 22)] = factorCell(y.discountFactor, 'ROUND(1/(1+$C$7/100)^' + t + ',6)');
      ws1[encode(r0, 23)] = moneyCell(y.discountedCF, 'ROUND(U' + R + '*W' + R + ',2)');
      ws1[encode(r0, 24)] = moneyCell(y.cumDiscountedCF, 'ROUND(' + prevY + '+X' + R + ',2)');
    });

    // 指标行：NPV 直接对 X 列（逐年 ROUND(...,2) 折现现金流）求和并包 ROUND，公式口径与 JS ROUND 链缓存口径一致；
    // IRR 用内置 IRR()；均写入 JS 预计算缓存值
    const npvRowNum = lastDataRowNum + 2;
    const irrRowNum = npvRowNum + 1;
    const equityIrrRowNum = npvRowNum + 2;
    const paybackRowNum = npvRowNum + 3;
    ws1[encode(npvRowNum - 1, 0)] = totalCell('项目NPV（万元）');
    ws1[encode(npvRowNum - 1, 1)] = moneyCell(d.metrics.npv, 'ROUND(SUM(X' + firstDataRowNum + ':X' + lastDataRowNum + '),2)');
    ws1[encode(irrRowNum - 1, 0)] = totalCell('项目IRR');
    ws1[encode(irrRowNum - 1, 1)] = pctResultCell(d.metrics.irr != null ? d.metrics.irr / 100 : null, 'IRR(U' + firstDataRowNum + ':U' + lastDataRowNum + ')');
    ws1[encode(equityIrrRowNum - 1, 0)] = totalCell('自有资金IRR');
    ws1[encode(equityIrrRowNum - 1, 1)] = pctResultCell(d.metrics.equityIrr != null ? d.metrics.equityIrr / 100 : null, 'IRR(V' + firstDataRowNum + ':V' + lastDataRowNum + ')');
    ws1[encode(paybackRowNum - 1, 0)] = totalCell('动态投资回收期（年）');
    // 回收期公式推导：MATCH 首个累计折现现金流（Y 列）>=0 的数据行（位置 k 对应年份 t=k-1），
    // 线性插值 = (k-2) + |上年累计| / (|上年累计| + 当年累计)，与 dynamicPayback 口径一致；
    // Y 首行即 >=0 时回收期为 0；全期为负（COUNTIF=0）返回“—”。建设期累计为负、0 值行不影响 MATCH 首个 >=0 行。
    const yCumRange = 'Y' + firstDataRowNum + ':Y' + lastDataRowNum;
    const firstPosMatch = 'MATCH(TRUE,INDEX(' + yCumRange + '>=0,0),0)';
    const paybackFormula = 'IF(COUNTIF(' + yCumRange + ',">=0")=0,"—",IF(Y' + firstDataRowNum + '>=0,0,ROUND(' + firstPosMatch + '-2+ABS(INDEX(' + yCumRange + ',' + firstPosMatch + '-1))/(ABS(INDEX(' + yCumRange + ',' + firstPosMatch + '-1))+INDEX(' + yCumRange + ',' + firstPosMatch + ')),1)))';
    ws1[encode(paybackRowNum - 1, 1)] = numCell(d.metrics.paybackPeriod != null ? d.metrics.paybackPeriod : '—', paybackFormula);

    ws1['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: paybackRowNum - 1, c: 24 } });
    setWsMeta(ws1, [18, 12, 13, 13, 13, 13, 13, 13, 12, 12, 12, 12, 13, 13, 13, 13, 11, 11, 13, 13, 14, 14, 10, 13, 14]);
    XLSX.utils.book_append_sheet(wb, ws1, '多年现金流表');

    // ---------- Sheet 2：敏感性分析（6 变量 × 4 档全量，JS 重跑模型的缓存值） ----------
    const ws2 = {};
    ws2['!merge'] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 5 } },
      { s: { r: 1, c: 0 }, e: { r: 1, c: 5 } }
    ];
    ws2[encode(0, 0)] = cell('敏感性分析（单变量扰动重算）', { bold: true, sz: 14 });
    const baseNote = '基准情形：NPV ' + fmtNum(d.metrics.npv) + ' 万元，项目IRR ' + (d.metrics.irr != null ? fmtNum(d.metrics.irr) + '%' : '—') +
      '，自有资金IRR ' + (d.metrics.equityIrr != null ? fmtNum(d.metrics.equityIrr) + '%' : '—') +
      '，动态回收期 ' + (d.metrics.paybackPeriod != null ? fmtNum(d.metrics.paybackPeriod) + ' 年' : '—') +
      '。注：以下各行扰动结果基于生成时参数由 JS 重跑模型得出，修改「多年现金流表」参数区不会联动更新。';
    ws2[encode(1, 0)] = cell(baseNote, { fontColor: '6B7280' });
    ['变量', '变动幅度（%）', 'NPV（万元）', '项目IRR（%）', '自有资金IRR（%）', '动态回收期（年）']
      .forEach(function (h, c) { ws2[encode(2, c)] = headerCell(h); });
    d.sensitivity.forEach(function (row, i) {
      const r = 3 + i;
      ws2[encode(r, 0)] = textCell(row.label);
      ws2[encode(r, 1)] = numCell(round2(row.delta * 100));
      ws2[encode(r, 2)] = moneyCell(row.npv);
      ws2[encode(r, 3)] = row.irr != null ? numCell(row.irr) : textCell('—');
      ws2[encode(r, 4)] = row.equityIrr != null ? numCell(row.equityIrr) : textCell('—');
      ws2[encode(r, 5)] = row.paybackPeriod != null ? numCell(row.paybackPeriod) : textCell('—');
    });
    ws2['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: 3 + d.sensitivity.length - 1, c: 5 } });
    setWsMeta(ws2, [14, 14, 16, 14, 16, 16]);
    XLSX.utils.book_append_sheet(wb, ws2, '敏感性分析');

    // ---------- Sheet 3：关键指标汇总 ----------
    const ws3 = {};
    ws3['!merge'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 2 } }];
    ws3[encode(0, 0)] = cell('关键指标汇总', { bold: true, sz: 14 });
    ['指标', '数值', '单位'].forEach(function (h, c) { ws3[encode(1, c)] = headerCell(h); });
    const s1 = "'多年现金流表'!";
    const summaryRows = [
      { name: '项目NPV', unit: '万元', write: function () { return moneyCell(d.metrics.npv, s1 + 'B' + npvRowNum); } },
      { name: '项目IRR', unit: '%', write: function () { return pctResultCell(d.metrics.irr != null ? d.metrics.irr / 100 : null, s1 + 'B' + irrRowNum); } },
      { name: '自有资金IRR', unit: '%', write: function () { return pctResultCell(d.metrics.equityIrr != null ? d.metrics.equityIrr / 100 : null, s1 + 'B' + equityIrrRowNum); } },
      { name: '动态投资回收期', unit: '年', write: function () { return d.metrics.paybackPeriod != null ? numCell(d.metrics.paybackPeriod, s1 + 'B' + paybackRowNum) : textCell('—'); } },
      { name: '总投资', unit: '万元', write: function () { return moneyCell(b.totalInvestment, s1 + 'C3'); } },
      { name: '自有资金', unit: '万元', write: function () { return moneyCell(b.ownFunds, s1 + 'C5'); } },
      { name: '贷款上限', unit: '万元', write: function () { return moneyCell(b.loanCap, 'ROUND(' + s1 + 'C3*' + s1 + 'C4/100,2)'); } },
      { name: '实际提款', unit: '万元', write: function () { return moneyCell(b.actualLoan, 'ROUND(SUM(' + s1 + 'P' + firstDataRowNum + ':P' + lastDataRowNum + '),2)'); } },
      { name: '融资利率', unit: '%', write: function () { return numCell(b.financingRate, s1 + 'C6'); } },
      { name: '建设期年数', unit: '年', write: function () { return calcParamCell(d.inputs.constructionYears, s1 + 'C8', '0'); } },
      { name: '运营期年数', unit: '年', write: function () { return calcParamCell(d.inputs.operationYears, s1 + 'C9', '0'); } },
      { name: '销售完成年（清算年）', unit: 't', write: function () { return b.saleFinishYear != null ? calcParamCell(b.saleFinishYear, s1 + 'C13', '0') : textCell('—'); } },
      { name: '满租年', unit: 't', write: function () {
        // 公式推导：MATCH 首个租赁累计（F 列）>= 满租上限（$G$12）的数据行（位置 k 对应年份 t=k-1）；
        // 上限为 0（无可租面积）或始终未满租（COUNTIF=0）时返回“—”，与 JS rentFullYear 口径一致
        if (b.rentFullYear == null) return textCell('—');
        const fCumRange = s1 + 'F' + firstDataRowNum + ':F' + lastDataRowNum;
        const capRef = s1 + '$G$12';
        const fullMatch = 'MATCH(TRUE,INDEX(' + fCumRange + '>=' + capRef + ',0),0)';
        return numCell(b.rentFullYear, 'IF(' + capRef + '<=0,"—",IF(COUNTIF(' + fCumRange + ',">="&' + capRef + ')=0,"—",' + fullMatch + '-1))');
      } },
      { name: '土增税清算额', unit: '万元', write: function () { return moneyCell(b.lvatSettlement, s1 + 'G16'); } },
      { name: '所得税清算额', unit: '万元', write: function () { return moneyCell(b.incomeTaxSettlement, s1 + 'G17'); } }
    ];
    summaryRows.forEach(function (row, i) {
      const r = 2 + i;
      ws3[encode(r, 0)] = textCell(row.name);
      ws3[encode(r, 1)] = row.write();
      ws3[encode(r, 2)] = textCell(row.unit);
    });
    ws3['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: summaryRows.length + 1, c: 2 } });
    setWsMeta(ws3, [24, 16, 12]);
    XLSX.utils.book_append_sheet(wb, ws3, '关键指标汇总');

    XLSX.writeFile(wb, fileName || '动态投资分析表.xlsx');
  };

})(window);
