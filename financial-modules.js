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
    const municipalFee = safeNum(inputs.municipalFee, 0);     // 元/m² 总建面
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
    const municipalSupportingFee = round2(effectiveMunicipalFee * totalBuildingArea / 10000);
    const powerKva = (aboveGroundArea * 70 + undergroundArea * 50) / 1000;
    const powerCapacityCost = round2(REFERENCE_PRICES.offsiteMunicipal.powerCapacity * powerKva / 10000);
    const waterDrainageCost = round2(REFERENCE_PRICES.offsiteMunicipal.waterDrainageConnection * totalBuildingArea / 10000);
    const offsiteMunicipalTotal = round2(powerCapacityCost + waterDrainageCost);
    const landVAT = round2(offsiteMunicipalTotal * 0.06 / 1.06);

    const landCostItems = [
      { code: '1-1', name: '土地出让金', unit: '万元/亩', unitPrice: landPrice, quantity: acre, quantityFormula: "'规划指标'!B3/666.7", cost: landTransferFee, note: '单价×亩数' },
      { code: '1-2', name: '土地转让费（契税）', unit: '万元', unitPrice: round2(landPrice * 0.03 + 10 / acre), quantity: acre, quantityFormula: "'规划指标'!B3/666.7", cost: deedTax, costFormula: 'F4*0.03+10', note: '出让金×3%+10' },
      { code: '1-3', name: '拆迁补偿费', unit: '万元', unitPrice: 0, quantity: 0, cost: 0, note: '删除，不输出' },
      { code: '1-4', name: '大市政配套费', unit: '元/m²', unitPrice: effectiveMunicipalFee, quantity: totalBuildingArea, quantityFormula: "'规划指标'!B8", cost: municipalSupportingFee, note: city === '上海' ? '上海默认0' : '按总建筑面积' },
      { code: '1-5-2', name: '电力增容费/高可靠性用电', unit: '元/KVA', unitPrice: REFERENCE_PRICES.offsiteMunicipal.powerCapacity, quantity: powerKva, quantityFormula: "('规划指标'!B6*70+'规划指标'!B7*50)/1000", cost: powerCapacityCost, note: '(地上建面×70+地下建面×50)/1000' },
      { code: '1-5-3', name: '红线外给水、排水接驳费', unit: '元/m²', unitPrice: REFERENCE_PRICES.offsiteMunicipal.waterDrainageConnection, quantity: totalBuildingArea, quantityFormula: "'规划指标'!B8", cost: waterDrainageCost, note: '按总建筑面积' },
      { code: '1-6', name: '其他费用', unit: '万元', unitPrice: 0, quantity: 0, cost: 0, note: '' },
      { code: '1-7', name: '其中增值税', unit: '万元', unitPrice: 0.06, quantity: round2(offsiteMunicipalTotal / 1.06), quantityFormula: '(F8+F9)/1.06', cost: landVAT, vatDE: true, note: '红线外市政×6%/1.06' }
    ];
    const landCostTotal = round2(landCostItems.reduce((s, it) => s + it.cost, 0));

    // 二、前期费用
    const pre = REFERENCE_PRICES.preliminary;
    const prelimItems = [
      { code: '2-1', name: '勘察费用', unit: '元/m²', unitPrice: pre.survey, quantity: landArea, quantityFormula: "'规划指标'!B3", cost: round2(pre.survey * landArea / 10000), note: '按用地面积' },
      { code: '2-2', name: '规划设计费', unit: '元/m²', unitPrice: pre.planning, quantity: totalBuildingArea, quantityFormula: "'规划指标'!B8", cost: round2(pre.planning * totalBuildingArea / 10000), note: '按总建筑面积' },
      { code: '2-3', name: '报批报建费', unit: '元/m²', unitPrice: pre.approval, quantity: totalBuildingArea, quantityFormula: "'规划指标'!B8", cost: round2(pre.approval * totalBuildingArea / 10000), note: '按总建筑面积' },
      { code: '2-4', name: '造价咨询服务费', unit: '元/m²', unitPrice: pre.consulting, quantity: totalBuildingArea, quantityFormula: "'规划指标'!B8", cost: round2(pre.consulting * totalBuildingArea / 10000), note: '按总建筑面积' },
      { code: '2-5', name: '工程监理费', unit: '元/m²', unitPrice: pre.supervision, quantity: totalBuildingArea, quantityFormula: "'规划指标'!B8", cost: round2(pre.supervision * totalBuildingArea / 10000), note: '按总建筑面积' },
      { code: '2-6', name: '临时工程费', unit: '元/m²', unitPrice: pre.temporary, quantity: totalBuildingArea, quantityFormula: "'规划指标'!B8", cost: round2(pre.temporary * totalBuildingArea / 10000), note: '按总建筑面积' },
      { code: '2-7', name: '拆除工程', unit: '元/m²', unitPrice: pre.demolition, quantity: totalBuildingArea, quantityFormula: "'规划指标'!B8", cost: round2(pre.demolition * totalBuildingArea / 10000), note: '无拆除时为0' },
      { code: '2-8', name: '其他', unit: '元/m²', unitPrice: pre.other, quantity: totalBuildingArea, quantityFormula: "'规划指标'!B8", cost: round2(pre.other * totalBuildingArea / 10000), note: '按总建筑面积' }
    ];
    const prelimSubtotal = round2(prelimItems.reduce((s, it) => s + it.cost, 0));
    const prelimVAT = round2(prelimSubtotal * 0.06 / 1.06);
    prelimItems.push({ code: '2-9', name: '其中增值税', unit: '万元', unitPrice: 0.06, quantity: round2(prelimSubtotal / 1.06), quantityFormula: 'ROUND(SUM(F14:F21),2)/1.06', cost: prelimVAT, vatDE: true, note: '前期小计×6%/1.06' });
    const prelimTotal = round2(prelimSubtotal + prelimVAT);

    // 三、建安工程成本
    // 3.1 基础设施费
    const infra = REFERENCE_PRICES.infrastructure;
    const infraItems = [
      { code: '3-1-1', name: '室外给水管网', unit: '元/m²', unitPrice: infra.waterSupply, quantity: totalBuildingArea, quantityFormula: "'规划指标'!B8", cost: round2(infra.waterSupply * totalBuildingArea / 10000), note: '按总建筑面积' },
      { code: '3-1-2', name: '室外排水管网', unit: '元/m²', unitPrice: infra.drainage, quantity: totalBuildingArea, quantityFormula: "'规划指标'!B8", cost: round2(infra.drainage * totalBuildingArea / 10000), note: '按总建筑面积' },
      { code: '3-1-3', name: '室外电缆工程', unit: '元/m²', unitPrice: infra.cable, quantity: totalBuildingArea, quantityFormula: "'规划指标'!B8", cost: round2(infra.cable * totalBuildingArea / 10000), note: '按总建筑面积' },
      { code: '3-1-4', name: '室外弱电工程', unit: '元/m²', unitPrice: infra.weakCurrent, quantity: totalBuildingArea, quantityFormula: "'规划指标'!B8", cost: round2(infra.weakCurrent * totalBuildingArea / 10000), note: '按总建筑面积' },
      { code: '3-1-5', name: '室外燃气管网', unit: '元/m²', unitPrice: infra.gas, quantity: totalBuildingArea, quantityFormula: "'规划指标'!B8", cost: round2(infra.gas * totalBuildingArea / 10000), note: '按总建筑面积' },
      { code: '3-1-6', name: '供配电设备及安装', unit: '元/m²', unitPrice: infra.powerDistribution, quantity: totalBuildingArea, quantityFormula: "'规划指标'!B8", cost: round2(infra.powerDistribution * totalBuildingArea / 10000), note: '按总建筑面积' },
      { code: '3-1-7', name: '水泵房设备及安装', unit: '元/m²', unitPrice: infra.pumpRoom, quantity: totalBuildingArea, quantityFormula: "'规划指标'!B8", cost: round2(infra.pumpRoom * totalBuildingArea / 10000), note: '按总建筑面积' },
      { code: '3-1-8', name: '消防设备及安装', unit: '元/m²', unitPrice: infra.fire, quantity: totalBuildingArea, quantityFormula: "'规划指标'!B8", cost: round2(infra.fire * totalBuildingArea / 10000), note: '按总建筑面积' },
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
      { code: '3-2-5', name: '室外石材台阶及散水', unit: '元/m²', unitPrice: land.stoneSteps, quantity: totalBuildingArea, quantityFormula: "'规划指标'!B8", cost: round2(land.stoneSteps * totalBuildingArea / 10000), note: '按总建筑面积' },
      { code: '3-2-6', name: '标示标牌', unit: '元/m²', unitPrice: land.signs, quantity: totalBuildingArea, quantityFormula: "'规划指标'!B8", cost: round2(land.signs * totalBuildingArea / 10000), note: '按总建筑面积' },
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
    // 单位租售建面成本 = 发展成本合计 ÷ 租售建面（地上总建面 − 配套楼自用面积）
    const supportAreaForRentSale = metrics.supportArea || 0;
    const rentSaleArea = Math.max(0, aboveGroundArea - supportAreaForRentSale);
    const unitRentSaleCost = rentSaleArea > 0 ? round2(totalInvestment * 10000 / rentSaleArea) : 0;

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
        unitRentSaleCost,
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
    // 去化速度（万㎡/年，首现于静态，动态模块从此处继承）
    const saleSpeed = safeNum(inputs.saleSpeed, 1.5) || 1.5;
    const rentSpeed = safeNum(inputs.rentSpeed, 1.5) || 1.5;

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
    const indirectTotal = inv.indirect ? safeNum(inv.indirect.cost, 0) : 0;
    // 租售建面 = 地上总建筑面积 − 配套楼面积（配套宿舍强制出租，留在租售建面内）
    const rentSaleArea = Math.max(0, aboveGroundArea - supportArea);
    // 土地成本单方：土地配套费用合计（出让金+契税+市政配套+红线外市政+土地增值税）按租售建面摊
    const landCostPerArea = rentSaleArea > 0 ? round2(landCostTotal * 10000 / rentSaleArea) : 0;
    const unitCost = inv.summary ? round2(inv.summary.totalInvestment * 10000 / inv.metrics.totalBuildingArea) : 0;
    // 综合建造成本（不含期间费用）：仅展示用（租赁总投已改用单位租售建面成本）
    const constructionCostTotal = landCostTotal + prelimTotal + constructionTotal;
    const costUnitCost = inv.metrics && inv.metrics.totalBuildingArea > 0 ? round2(constructionCostTotal * 10000 / inv.metrics.totalBuildingArea) : 0;
    // 建安成本单方：前期费用+建安工程成本+开发间接费按租售建面摊，与土地成本行互补不重叠、无遗漏
    const saleConstructionUnitCost = rentSaleArea > 0 ? round2((prelimTotal + constructionTotal + indirectTotal) * 10000 / rentSaleArea) : 0;
    // 单位租售建面成本 = 土地成本单方 + 建安成本单方（租赁总投口径）
    const rentSaleUnitCost = round2(landCostPerArea + saleConstructionUnitCost);
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
    const rentalTotalInvestment = round2(rentedAreaTotal * rentSaleUnitCost / 10000 + rentFinancialCost);
    const noi = rentalTotalInvestment > 0 ? round2(netRentalIncome / rentalTotalInvestment * 100) : 0;

    // 综合汇总
    const totalInvestment = inv.summary ? inv.summary.totalInvestment : 0;
    const financingRatioInput = (inv && inv.inputs && inv.inputs.financingRatio) || 0;
    const fundingGap = round2(totalInvestment - (1 - financingRatioInput / 100) * totalInvestment - saleRevenue);
    const saleProfitCoverRatio = rentalTotalInvestment > 0 ? round2(saleNetProfit / rentalTotalInvestment * 100) : 0;
    const totalInvestmentReturn = totalInvestment > 0 ? round2(netRentalIncome / totalInvestment * 100) : 0;
    // 去化爬坡期（年）：销售爬坡期 = 可售 ÷ 销售去化速度；租赁爬坡期（满租年） = 可租 × 出租率 ÷ 租赁去化速度
    const salesRampYears = saleSpeed > 0 ? round2(soldAreaTotal / (saleSpeed * 10000)) : 0;
    const rentRampYears = rentSpeed > 0 ? round2(rentedAreaTotal * occupancyRate / (rentSpeed * 10000)) : 0;
    // 销售部分总投（建造成本按单位租售建面成本 + 销售分摊财务费用）
    const salesTotalInvestment = round2(soldAreaTotal * rentSaleUnitCost / 10000 + saleFinancialCost);
    // 静态投资回收期（三情况）：
    // 情况3：销售净利 > 租赁总投 → 销售期内回收，回收期 = 销售爬坡期 × 总投资/(销售总投+销售净利)
    // 情况1/2：销售净利 ≤ 租赁总投 → max(销售爬坡期, (租赁总投-销售净利)/租赁年净收入)
    let paybackPeriod = null;
    let paybackMode = 'none';
    if (saleNetProfit > rentalTotalInvestment) {
      const salesRecoverBase = salesTotalInvestment + saleNetProfit;
      if (salesRecoverBase > 0 && salesRampYears > 0) {
        paybackPeriod = round2(salesRampYears * totalInvestment / salesRecoverBase);
        paybackMode = 'sales';
      }
    } else if (netRentalIncome > 0) {
      paybackPeriod = round2(Math.max(salesRampYears, (rentalTotalInvestment - saleNetProfit) / netRentalIncome));
      paybackMode = 'rent';
    }

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
        saleSpeed,
        rentSpeed,
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
      constructionCost: { landCostPerArea, unitCost, costUnitCost, saleConstructionUnitCost, rentSaleUnitCost },
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
        paybackPeriod,
        paybackMode,
        salesRampYears,
        rentRampYears,
        salesTotalInvestment
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
    // 去化速度首现于静态分析：页面端从静态结果联动传入；独立调用时回退静态输入值，再无则 1.5
    const saleSpeed = safeNum(inputs.saleSpeed, safeNum(saInputs.saleSpeed, 1.5));
    const rentSpeed = safeNum(inputs.rentSpeed, safeNum(saInputs.rentSpeed, 1.5));
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
    // 敏感性分摊口径：租售建面 = 地上总建筑面积 − 配套楼面积
    const rentSaleArea = aboveGroundArea - safeNum(sa.metrics.supportArea, 0);
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
          if (rentSaleArea > 0) p.constructionCostForSale = round2(p.constructionCostForSale + deltaCost * saleableArea / rentSaleArea);
        } else if (sv.variable === 'landPrice') {
          const deltaCost = landBase * delta;
          p.totalInvestment = round2(p.totalInvestment + deltaCost);
          if (rentSaleArea > 0) p.landCostForSale = round2(p.landCostForSale + deltaCost * saleableArea / rentSaleArea);
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
    // 租售建面（B25）= 地上总建筑面积(B6) − 配套楼面积(B19)（配套宿舍强制出租，留在租售建面内）
    const rentSaleAreaMetrics = round2(fullEstimate.metrics.aboveGroundArea - (fullEstimate.metrics.supportArea || 0));
    const rentSaleRow0 = planningMetricRows.length + 2; // 0-based，紧接最后指标行（1-based 第 25 行）
    ws0[encode(rentSaleRow0, 0)] = textCell('租售建面');
    ws0[encode(rentSaleRow0, 1)] = numCell(rentSaleAreaMetrics, 'B6-B19');
    ws0[encode(rentSaleRow0, 2)] = textCell('m²');
    ws0['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: rentSaleRow0, c: 2 } });
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
    // 单位租售建面成本口径：H 列分母 = 租售建面（地上总建筑面积 − 配套楼面积，配套宿舍强制出租留在租售建面内）
    const rentSaleArea = round2(fullEstimate.metrics.aboveGroundArea - (fullEstimate.metrics.supportArea || 0)) || 1;
    const aboveGroundArea = rentSaleArea; // 下方 H 列单位成本缓存统一按租售建面口径
    ws._totalBuildingArea = totalBuildingArea;
    ws._aboveGroundArea = rentSaleArea;
    ws._totalBuildingAreaRef = "'规划指标'!B8";
    ws._aboveGroundAreaRef = "'规划指标'!B25"; // 规划指标「租售建面」行

    ws[encode(0, 0)] = cell('投资估算表（完整版）', { bold: true, sz: 14, align: 'left' });
    ws['!merge'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 8 } }];

    ['科目编码', '成本科目', '指标单位', '成本指标', '工程量', '成本（万元）', '单位建面成本（元/㎡）', '单位租售建面成本（元/㎡）', '科目说明']
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
    // 融资参数小区（追加于表尾，行号预计算；不插入中间以避免行号移位）：
    // 4 个 category 行 + 发展成本合计/单位建面/单位地上建面 3 行之后为标题行
    const finParamRatioRow = row + 9;   // 1-based，融资占比
    const finParamRateRow = row + 10;   // 1-based，融资利率
    const finParamPhasesRow = row + 11; // 1-based，开发期数
    const finParamPeriodRow = row + 12; // 1-based，单期开发周期
    // 财务费用 = (土地+前期+建安)×融资占比/100×融资利率/100×(开发期数×单期周期/2) + 银行费用（利息>0 时 30 万），引用表尾参数格
    const interestExpr = `(${col(5)}${landSubtotalRow}+${col(5)}${prelimSubtotalRow}+${col(5)}${constructionTotalRow})*$D$${finParamRatioRow}/100*$D$${finParamRateRow}/100*($D$${finParamPhasesRow}*$D$${finParamPeriodRow}/2)`;
    const categories = [
      { code: '四', name: '开发间接费', cost: fullEstimate.indirect.cost, f: '0' },
      { code: '五', name: '营销费用', cost: fullEstimate.marketing.cost, f: '0' },
      { code: '六', name: '公司管理费', cost: fullEstimate.management.cost, f: '0' },
      { code: '七', name: '财务费用', cost: fullEstimate.financial.total, f: `ROUND(${interestExpr}+IF(${interestExpr}>0,30,0),2)` }
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
    ws[encode(row, 1)] = textCell('单位租售建面成本（元/㎡）');
    ws[encode(row, 5)] = moneyCell(round2(fullEstimate.summary.totalInvestment * 10000 / rentSaleArea), `${col(5)}${totalRow}/${ws._aboveGroundAreaRef}*10000`);

    // 融资参数小区（表尾追加）：黄色可编辑输入格，预填投资估算输入；财务费用公式引用此处，总表集成时供静态/动态 sheet 引用
    row += 1;
    ws['!merge'].push({ s: { r: row, c: 0 }, e: { r: row, c: 8 } });
    ws[encode(row, 0)] = cell('融资参数（黄色为可编辑输入格，其他表引用此处）', { bold: true, sz: 12 });
    const finParamRows = [
      { name: '融资占比', value: round2(fullEstimate.inputs.financingRatio || 0), unit: '%' },
      { name: '融资利率', value: round2(fullEstimate.inputs.financingRate || 0), unit: '%' },
      { name: '开发期数', value: fullEstimate.inputs.devPhases || 1, unit: '期' },
      { name: '单期开发周期', value: round2(fullEstimate.inputs.phasePeriod || 0), unit: '年' }
    ];
    finParamRows.forEach(p => {
      row += 1;
      ws[encode(row, 1)] = textCell(p.name);
      ws[encode(row, 2)] = textCell(p.unit);
      ws[encode(row, 3)] = cell(p.value, { fill: 'FFF2CC', numFmt: '#,##0.00', align: 'right', raw: true });
    });

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
    // 底部：单位租售建面成本 = 发展成本合计 × 10000 ÷ 规划指标「租售建面」（B25）
    const ursR0 = simple.length + 2; // 0-based 追加行
    ws2[encode(ursR0, 1)] = textCell('单位租售建面成本（元/㎡）');
    ws2[encode(ursR0, 2)] = moneyCell(round2(fullEstimate.summary.totalInvestment * 10000 / rentSaleArea), `ROUND(C${totalSimpleRow}*10000/'规划指标'!B25,2)`);
    ws2['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: ursR0, c: 3 } });
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
      const rentSaleUnitCostVal = staticResult.constructionCost.rentSaleUnitCost != null
        ? staticResult.constructionCost.rentSaleUnitCost
        : staticResult.constructionCost.costUnitCost; // 兼容旧结构（缺失时退化为综合建造成本）
      const costRows = [
        ['土地价格', staticResult.inputs.landPrice || 0, '万元/亩'],
        ['土地成本单方（土地配套费合计）', staticResult.constructionCost.landCostPerArea, '元/㎡'],
        ['建安成本单方（前期+建安工程）', staticResult.constructionCost.saleConstructionUnitCost, '元/㎡'],
        ['单位租售建面成本', rentSaleUnitCostVal, '元/㎡'],
        ['财务费用', totalFinancialCost, '万元'],
        ['综合单方成本（含期间费用）', staticResult.constructionCost.unitCost, '元/㎡']
      ];
      costRows.forEach((row, idx) => {
        const r = costStart + 2 + idx;
        ws[encode(r, 0)] = textCell(row[0]);
        ws[encode(r, 1)] = numCell(row[1]);
        ws[encode(r, 2)] = textCell(row[2]);
        // 独立下载版为快照值（总表集成时这 5 行会被重接线为公式引用）；财务费用行另有引用，不标注
        if (row[0] !== '财务费用') ws[encode(r, 3)] = textCell('快照值，引自投资估算结果');
      });
      return {
        nextRow: costStart + costRows.length + 2,
        costStart,
        costLandTaxRow: costStart + 4,       // 1-based，土地成本单方（土地配套费合计）
        costSaleConstructionRow: costStart + 5, // 1-based，建安成本单方（前期+建安工程），销售测算扣减用
        costConstructionRow: costStart + 6,  // 1-based，单位租售建面成本（租赁总投用）
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
    // 费率参数小区（追加于表尾，行号预计算）：saleRows 共 15 行，其后为标题行 + 营销费率 + 管理费率
    const mktRateRow = saleStartIdx + 15 + 2;  // 1-based，营销费率输入格行
    const mgmtRateRow = saleStartIdx + 15 + 3; // 1-based，管理费率输入格行
    const saleRows = [
      { name: '可售面积', value: staticResult.metrics.soldAreaTotal, unit: 'm²', desc: '', f: `'租售面积分配'!B${saleAllocTotalRow}` },
      { name: '加权平均售价', value: staticResult.sale.rawWeightedPrice, unit: '万元/㎡', desc: '', f: `'租售面积分配'!E${saleAllocTotalRow}`, raw: true },
      { name: '不含税售价', value: round2(staticResult.sale.weightedPrice / 1.09), unit: '万元/㎡', desc: '售价/1.09', f: `ROUND(B${ssr + 1}/1.09,2)` },
      { name: '销售收入', value: staticResult.sale.totalRevenue, unit: '万元', desc: '可售面积×加权平均售价', f: `'租售面积分配'!D${saleAllocTotalRow}` },
      { name: '减：土地成本', value: staticResult.sale.landCost, unit: '万元', desc: '', f: `ROUND(B${ssr}*$B$${costLandTaxRow}/10000,2)` },
      { name: '减：建安成本', value: staticResult.sale.constructionCost, unit: '万元', desc: '', f: `ROUND(B${ssr}*$B$${costSaleConstructionRow}/10000,2)` },
      { name: '减：税金及附加', value: staticResult.sale.taxSurcharge, unit: '万元', desc: '', f: `ROUND(B${ssr + 3}/1.09*0.006,2)` },
      { name: '减：土地增值税', value: staticResult.sale.landValueAddedTax, unit: '万元', desc: '', f: `'土地增值税测算表'!C14` },
      { name: '减：营销费用', value: staticResult.sale.marketingCost, unit: '万元', desc: '', f: `ROUND(B${ssr + 3}*$B$${mktRateRow}/100,2)` },
      { name: '减：管理费用', value: staticResult.sale.managementCost, unit: '万元', desc: '', f: `ROUND(B${ssr + 3}*$B$${mgmtRateRow}/100,2)` },
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
    // 费率参数小区（表尾追加）：黄色可编辑输入格，营销/管理费用公式引用此处，总表集成时供动态 sheet 引用
    let saleTail = saleStartIdx + saleRows.length; // 0-based，最后数据行的下一空行（saleStartIdx 为 0-based 首行）
    ws1['!merge'].push({ s: { r: saleTail, c: 0 }, e: { r: saleTail, c: 3 } });
    ws1[encode(saleTail, 0)] = cell('费率参数（黄色为可编辑输入格，其他表引用此处）', { bold: true, sz: 12 });
    [['营销费率', round2(staticResult.inputs.marketingRate || 0)], ['管理费率', round2(staticResult.inputs.managementRate || 0)]].forEach(p => {
      saleTail += 1;
      ws1[encode(saleTail, 0)] = textCell(p[0]);
      ws1[encode(saleTail, 1)] = cell(p[1], { fill: 'FFF2CC', numFmt: '#,##0.00', align: 'right', raw: true });
      ws1[encode(saleTail, 2)] = textCell('%');
    });
    ws1['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: saleTail, c: 3 } });
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
    // 费率参数小区（追加于表尾，行号预计算）：rentRows 共 14 行，其后为标题行 + 租赁运营费率
    const opRateRow = rentStartIdx + 14 + 2; // 1-based，租赁运营费率输入格行
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
      { name: '减：运营费用', value: staticResult.rent.rentalOpCost, unit: '元/年/㎡', desc: '', f: `ROUND(B${rsr + 5}*$B$${opRateRow}/100,2)` },
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
    // 费率参数小区（表尾追加）：黄色可编辑输入格，运营费用公式引用此处，总表集成时供动态 sheet 引用
    let rentTail = rentStartIdx + rentRows.length; // 0-based，最后数据行的下一空行（rentStartIdx 为 0-based 首行）
    ws2['!merge'].push({ s: { r: rentTail, c: 0 }, e: { r: rentTail, c: 3 } });
    ws2[encode(rentTail, 0)] = cell('费率参数（黄色为可编辑输入格，其他表引用此处）', { bold: true, sz: 12 });
    rentTail += 1;
    ws2[encode(rentTail, 0)] = textCell('租赁运营费率');
    ws2[encode(rentTail, 1)] = cell(round2(staticResult.inputs.rentalOpRate || 0), { fill: 'FFF2CC', numFmt: '#,##0.00', align: 'right', raw: true });
    ws2[encode(rentTail, 2)] = textCell('%');
    ws2['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: rentTail, c: 3 } });
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
    const sumFinRatioRow = 2 + 9 + 2; // 融资参数小区（表尾追加，summaryRows 共 9 行）：标题行 + 融资占比输入格行（1-based）
    const summaryRows = [
      { name: '总投资', value: staticResult.summary.totalInvestment, unit: '万元', f: null },
      { name: '销售净利润', value: staticResult.summary.saleNetProfit, unit: '万元', f: `'销售测算'!B${ssr + 13}` },
      { name: '租赁年净收入', value: staticResult.summary.netRentalIncome, unit: '万元/年', f: `'租赁测算'!B${rsr + 11}` },
      { name: '资金盈余/缺口', value: staticResult.summary.fundingGap, unit: '万元', f: `ROUND(B3-(1-$B$${sumFinRatioRow}/100)*B3-'销售测算'!B${ssr + 3},2)` },
      { name: '销售净利润覆盖租赁总投比例', value: staticResult.summary.saleProfitCoverRatio, unit: '%', f: `IF('租赁测算'!B${rsr + 12}=0,0,ROUND(B4/'租赁测算'!B${rsr + 12}*100,2))` },
      { name: '销售净利率', value: staticResult.summary.saleNetMargin, unit: '%', f: `'销售测算'!B${ssr + 14}` },
      { name: '租赁 NOI', value: staticResult.summary.noi, unit: '%', f: `'租赁测算'!B${rsr + 13}` },
      { name: '总投资收益率', value: staticResult.summary.totalInvestmentReturn, unit: '%', f: `IF(B3=0,0,ROUND(B5/B3*100,2))` },
      // 静态投资回收期（三情况）：净利>租赁总投 → 销售期内回收=销售爬坡期×总投资/(销售总投+净利)；
      // 否则 → max(销售爬坡期, (租赁总投-净利)/租赁年净收入)（净利为负涵盖）；年净收入≤0 显示“—”
      { name: '静态投资回收期', value: staticResult.summary.paybackPeriod != null ? staticResult.summary.paybackPeriod : '—', unit: '年', f: `IF(B4>'租赁测算'!B${rsr + 12},IF(OR($B$17<=0,$B$19+B4<=0),"—",ROUND($B$17*B3/($B$19+B4),2)),IF(B5<=0,"—",ROUND(MAX($B$17,('租赁测算'!B${rsr + 12}-B4)/B5),2)))` }
    ];
    summaryRows.forEach((row, idx) => {
      const r = idx + 2;
      ws5[encode(r, 0)] = textCell(row.name);
      ws5[encode(r, 1)] = moneyCell(row.value, row.f);
      ws5[encode(r, 2)] = textCell(row.unit);
    });
    // 融资参数小区（表尾追加）：黄色可编辑输入格，资金盈余/缺口公式引用此处；总表集成时重接线到「投资估算完整版」融资参数区
    let sumTail = summaryRows.length + 1; // 0-based 最后数据行
    sumTail += 1;
    ws5['!merge'].push({ s: { r: sumTail, c: 0 }, e: { r: sumTail, c: 2 } });
    ws5[encode(sumTail, 0)] = cell('融资参数（黄色为可编辑输入格，其他表引用此处）', { bold: true, sz: 12 });
    sumTail += 1;
    ws5[encode(sumTail, 0)] = textCell('融资占比');
    ws5[encode(sumTail, 1)] = cell(round2(staticResult.inputs.financingRatio || 0), { fill: 'FFF2CC', numFmt: '#,##0.00', align: 'right', raw: true });
    ws5[encode(sumTail, 2)] = textCell('%');
    // 去化设置小区（表尾追加）：去化速度首现于静态（黄色输入格），爬坡期/销售总投为公式格；总表集成时动态参数区 G7/G8 重接线到此处
    sumTail += 1;
    ws5['!merge'].push({ s: { r: sumTail, c: 0 }, e: { r: sumTail, c: 2 } });
    ws5[encode(sumTail, 0)] = cell('去化设置（黄色为可编辑输入格，其他表引用此处）', { bold: true, sz: 12 });
    const sumSaleSpeedRow = sumTail + 2; // 1-based，销售去化速度行
    const sumRentSpeedRow = sumTail + 3; // 1-based，租赁去化速度行
    sumTail += 1;
    ws5[encode(sumTail, 0)] = textCell('销售去化速度');
    ws5[encode(sumTail, 1)] = cell(round2(staticResult.inputs.saleSpeed || 1.5), { fill: 'FFF2CC', numFmt: '#,##0.00', align: 'right', raw: true });
    ws5[encode(sumTail, 2)] = textCell('万㎡/年');
    sumTail += 1;
    ws5[encode(sumTail, 0)] = textCell('租赁去化速度');
    ws5[encode(sumTail, 1)] = cell(round2(staticResult.inputs.rentSpeed || 1.5), { fill: 'FFF2CC', numFmt: '#,##0.00', align: 'right', raw: true });
    ws5[encode(sumTail, 2)] = textCell('万㎡/年');
    sumTail += 1;
    ws5[encode(sumTail, 0)] = textCell('销售爬坡期');
    ws5[encode(sumTail, 1)] = moneyCell(staticResult.summary.salesRampYears, `ROUND('销售测算'!B${ssr}/$B$${sumSaleSpeedRow}/10000,2)`);
    ws5[encode(sumTail, 2)] = textCell('年');
    sumTail += 1;
    ws5[encode(sumTail, 0)] = textCell('租赁爬坡期');
    ws5[encode(sumTail, 1)] = moneyCell(staticResult.summary.rentRampYears, `ROUND('租赁测算'!B${rsr}*'租赁测算'!B${rsr + 4}/100/$B$${sumRentSpeedRow}/10000,2)`);
    ws5[encode(sumTail, 2)] = textCell('年');
    sumTail += 1;
    ws5[encode(sumTail, 0)] = textCell('销售总投');
    ws5[encode(sumTail, 1)] = moneyCell(staticResult.summary.salesTotalInvestment, `ROUND('销售测算'!B${ssr}*'销售测算'!B${costStart1 + 6}/10000+'销售测算'!B${ssr + 10},2)`);
    ws5[encode(sumTail, 2)] = textCell('万元');
    ws5['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: sumTail, c: 2 } });
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

  // ==================== 三表联动（总表第一部分，5 个 sheet） ====================
  // 需求见 MASTER_TABLE_LINKAGE.md：Sheet1 规划指标初始值（黄色可编辑输入）→ Sheet3 指标估算联动；
  // Sheet4 产品配置详表（行内公式）→ Sheet5 总体经济技术指标联动；Sheet2 产品配置选择为只读存档。
  // buildLinkageSheets 独立可复用，后续「指标/测算总表」集成（MASTER_TABLE_INTEGRATION.md）直接拼入前 5 个 sheet。

  function buildLinkageSheets(configResult, projectData) {
    const pd = projectData || {};
    const result = configResult || {};
    const products = result.products || [];
    const LINK_INPUT_FILL = 'FFF2CC'; // 黄色可编辑输入格
    const LINK_MID_FILL = 'F3F4F6';   // 中间计算行底色

    function linkInputCell(v, numFmt) {
      if (v == null || v === '' || (typeof v === 'number' && isNaN(v))) return cell('', { fill: LINK_INPUT_FILL, align: 'right' });
      if (typeof v === 'number') return cell(v, { fill: LINK_INPUT_FILL, numFmt: numFmt || '#,##0.00', align: 'right', raw: true });
      return cell(v, { fill: LINK_INPUT_FILL, align: 'left' });
    }
    function midTextCell(v) { return cell(v, { fill: LINK_MID_FILL, fontColor: '6B7280' }); }
    function midNumCell(v, f, numFmt) { return cell(v, { fill: LINK_MID_FILL, fontColor: '6B7280', numFmt: numFmt || '#,##0.00', align: 'right', f: f }); }
    // 栋数等整数语义单元格（千分位整数格式）
    function intLikeCell(v, f) { return cell(v, { numFmt: '#,##0', align: 'right', f: f }); }
    // 层数明细格：General 格式（整数显示 3、3.5 显示 3.5；#,##0 会把 3.5 层四舍五入成 4，0.## 会把 3 显示成「3.」）
    function floorsCell(v, f) { return cell(v, { numFmt: 'General', align: 'right', f: f }); }

    const S1 = "'规划指标初始值'!";
    const S4 = "'产品配置详表'!";

    // ---------- 公共输入值（Sheet1 预填 + Sheet3 缓存预计算，口径同 index.html calculate()） ----------
    const landArea = safeNum(pd.landArea);
    const far = safeNum(pd.far);
    const greenPct = safeNum(pd.greenRate) * 100;       // 页面存储小数，Sheet1 按百分比数填（15 表示 15%）
    const ancPct = safeNum(pd.ancillaryRatio) * 100;
    const rdPct = safeNum(pd.rdRatio) * 100;
    const factoryIndex = safeNum(pd.factoryIndex != null ? pd.factoryIndex : pd.factoryRate, 0.5);
    const supportIndex = safeNum(pd.supportIndex != null ? pd.supportIndex : pd.ancillaryRate, 1.0);
    const regionStr = pd.region || '';
    const isHz = regionStr === '杭州';

    // Sheet3 指标估算 JS 预计算（完全复刻 index.html calculate() 口径）
    const eAbove = landArea * far;
    const eGreen = landArea * greenPct / 100;
    const eRoad = landArea * 0.30;
    const eDensity = far < 1.5 ? 0.45 : (far < 2.0 ? 0.42 : 0.40);
    const eBase = landArea * eDensity;
    const eTotalVeh = Math.ceil(eAbove * (1 - ancPct / 100) * factoryIndex / 100 + eAbove * (ancPct / 100) * supportIndex / 100);
    const eTotalNV = Math.ceil(eAbove * 1.0 / 100);
    const eAvail = landArea - eRoad - eGreen - eBase - eTotalNV * 1.5;
    let eJudge = Math.floor(eAvail / 35);
    if (eJudge < 10) eJudge = 0;
    let eGroundVeh, eUnderVeh, eGroundNV, eUnderNV, eUnderArea;
    if (eJudge >= eTotalVeh) {
      eGroundVeh = eTotalVeh; eUnderVeh = 0; eGroundNV = eTotalNV; eUnderNV = 0; eUnderArea = 500;
    } else {
      eGroundVeh = eJudge; eUnderVeh = eTotalVeh - eJudge;
      if (eTotalNV > 500) { eGroundNV = Math.ceil(eTotalNV / 2); eUnderNV = Math.floor(eTotalNV / 2); }
      else { eGroundNV = eTotalNV; eUnderNV = 0; }
      eUnderArea = eUnderVeh * (isHz ? 42 : 35) + eUnderNV * 1.5;
    }
    const eTotalArea = eAbove + eUnderArea;

    // Sheet4 产品配置详表行号布局（1-based）
    const s4First = 4;
    const s4Last = s4First + products.length - 1;
    const s4TR = s4Last + 1; // 合计行

    // Sheet5 总体经济技术指标 JS 预计算（复刻 renderIndicatorOverview 口径，地下面积系数按杭州 42/其他 35）
    let oAbove = 0, oCap = 0, oBase = 0, oFactory = 0, oAnc = 0, oUnder = 0, oTotal = 0;
    let oFar = 0, oDensity = 0, oTotalVeh = 0, oTotalNV = 0, oAvail = 0, oJudge = 0;
    let oGroundVeh = 0, oUnderVeh = 0, oGroundNV = 0, oUnderNV = 0;
    const typeAreaSum = { '轻钢厂房': 0, '分栋厂房': 0, '分层厂房': 0, '产业大厦': 0, '配套楼': 0, '配套宿舍': 0 };
    const isShC65 = regionStr === '上海' && (pd.landUseType || '') === 'C65';
    if (products.length) {
      oAbove = safeNum(result.totalArea) || products.reduce((s, p) => s + safeNum(p.totalArea), 0);
      oCap = safeNum(result.totalCap) || products.reduce((s, p) => s + safeNum(p.totalCap), 0);
      oBase = safeNum(result.totalBase) || products.reduce((s, p) => s + safeNum(p.totalBase), 0);
      products.forEach(p => { if (typeAreaSum[p.type] != null) typeAreaSum[p.type] += safeNum(p.totalArea); });
      products.forEach(p => {
        if (p.type === '配套宿舍' || p.type === '配套楼') oAnc += safeNum(p.totalArea);
        else if (p.type === '产业大厦' && isShC65) { /* C65 研发办公，不计车位 */ }
        else oFactory += safeNum(p.totalArea);
      });
      oFar = landArea > 0 ? oCap / landArea : 0;
      oDensity = landArea > 0 ? oBase / landArea : 0;
      oTotalVeh = Math.ceil(oFactory * factoryIndex / 100) + Math.ceil(oAnc * supportIndex / 100);
      oTotalNV = Math.ceil(oAbove * 1.0 / 100);
      oAvail = landArea - landArea * 0.30 - landArea * greenPct / 100 - oBase - oTotalNV * 1.5;
      oJudge = Math.floor(oAvail / 35);
      if (oJudge < 10) oJudge = 0;
      if (oJudge >= oTotalVeh) {
        oGroundVeh = oTotalVeh; oUnderVeh = 0; oGroundNV = oTotalNV; oUnderNV = 0; oUnder = 500;
      } else {
        oGroundVeh = oJudge; oUnderVeh = oTotalVeh - oJudge;
        if (oTotalNV > 500) { oGroundNV = Math.ceil(oTotalNV / 2); oUnderNV = Math.floor(oTotalNV / 2); }
        else { oGroundNV = oTotalNV; oUnderNV = 0; }
        oUnder = oUnderVeh * (isHz ? 42 : 35) + oUnderNV * 1.5;
      }
      oTotal = oAbove + oUnder;
    }

    // ==================== Sheet1：规划指标初始值 ====================
    const ws1 = {};
    ws1['!merge'] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 3 } },
      { s: { r: 1, c: 0 }, e: { r: 1, c: 3 } }
    ];
    ws1[encode(0, 0)] = cell('规划指标初始值', { bold: true, sz: 14 });
    ws1[encode(1, 0)] = cell('黄色底纹为可编辑输入格；「指标估算」表全部公式引用本表，修改后自动重算。', { fontColor: '6B7280' });
    ['指标', '数值', '单位', '备注'].forEach((h, c) => ws1[encode(2, c)] = headerCell(h));
    const s1Rows = [
      { name: '项目名称', value: pd.projectName || '', unit: '—', note: '' },
      { name: '城市/区域', value: regionStr, unit: '—', note: '固定枚举：上海/杭州/长三角区域/湾区/其他区域' },
      { name: '用地性质', value: pd.landUseType || '', unit: '—', note: '固定枚举：M（工业用地）/C65（科研设计用地），仅上海需填' },
      { name: '用地面积', value: pd.landArea != null ? landArea : null, unit: '㎡', note: '' },
      { name: '容积率', value: pd.far != null ? far : null, unit: '—', note: '' },
      { name: '限高', value: pd.heightLimit != null ? safeNum(pd.heightLimit) : null, unit: 'm', note: '' },
      { name: '绿地率', value: pd.greenRate != null ? greenPct : null, unit: '%', note: '按百分比数填（如 15 表示 15%）', fmt: '0.00' },
      { name: '配套用房占比', value: pd.ancillaryRatio != null ? ancPct : null, unit: '%', note: '按百分比数填', fmt: '0.00' },
      { name: '研发办公占比', value: pd.rdRatio != null ? rdPct : null, unit: '%', note: '按百分比数填；仅上海 C65 用地填写', fmt: '0.00' },
      { name: '厂房车位配建指标', value: factoryIndex, unit: '辆/100㎡', note: '' },
      { name: '配套车位配建指标', value: supportIndex, unit: '辆/100㎡', note: '' }
    ];
    s1Rows.forEach((row, i) => {
      const r = 3 + i; // 0-based；1-based 行号 4..14
      ws1[encode(r, 0)] = textCell(row.name);
      ws1[encode(r, 1)] = linkInputCell(row.value, row.fmt);
      ws1[encode(r, 2)] = textCell(row.unit);
      ws1[encode(r, 3)] = textCell(row.note || '');
    });
    ws1['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: s1Rows.length + 2, c: 3 } });
    setWsMeta(ws1, [22, 18, 12, 44]);

    // ==================== Sheet2：产品配置选择（只读存档，不参与计算） ====================
    const ws2 = {};
    const LINK_PRODUCT_ORDER = [
      { type: '轻钢厂房', hint: '1层+火车头' },
      { type: '分栋厂房', hint: '2~4层' },
      { type: '分层厂房', hint: '5~12层' },
      { type: '产业大厦', hint: '高层研发' },
      { type: '配套宿舍', hint: '配套用房' },
      { type: '配套楼', hint: '配套服务' }
    ];
    ws2['!merge'] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 6 } },
      { s: { r: 1, c: 0 }, e: { r: 1, c: 6 } },
      { s: { r: 2, c: 0 }, e: { r: 2, c: 6 } }
    ];
    ws2[encode(0, 0)] = cell('产品配置选择（存档）', { bold: true, sz: 14 });
    ws2[encode(1, 0)] = cell('本表为生成产品配置时的用户选择存档，由配置结果反推，仅供追溯，不参与任何公式计算。', { fontColor: '6B7280' });
    ws2[encode(2, 0)] = cell('生成时间：' + new Date().toLocaleString('zh-CN') + '　项目：' + (pd.projectName || '—'), { fontColor: '6B7280' });
    ['产品类型', '是否选择', '说明'].forEach((h, c) => ws2[encode(3, c)] = headerCell(h));
    const selTypeSet = {};
    products.forEach(p => { selTypeSet[p.type] = true; });
    LINK_PRODUCT_ORDER.forEach((pt, i) => {
      const r = 4 + i;
      ws2[encode(r, 0)] = textCell(pt.type);
      ws2[encode(r, 1)] = cell(selTypeSet[pt.type] ? '✓ 已选择' : '—', { align: 'center' });
      ws2[encode(r, 2)] = textCell(pt.hint);
    });
    ws2[encode(11, 0)] = cell('选择明细（按配置结果汇总）', { bold: true, fill: STYLE.subtotalFill });
    for (let c = 1; c <= 6; c++) ws2[encode(11, c)] = cell('', { fill: STYLE.subtotalFill });
    ['产品类型', '层数', '面积段（㎡）', '形式', '荷载', '电梯配置', '产品型号'].forEach((h, c) => ws2[encode(12, c)] = headerCell(h));
    let s2r = 13;
    LINK_PRODUCT_ORDER.forEach(pt => {
      const ps = products.filter(p => p.type === pt.type);
      if (!ps.length) return;
      const uniq = arr => [...new Set(arr)].join('/');
      ws2[encode(s2r, 0)] = textCell(pt.type);
      ws2[encode(s2r, 1)] = textCell(uniq(ps.map(p => String(p.floors))));
      ws2[encode(s2r, 2)] = textCell(uniq(ps.map(p => String(p.base))));
      ws2[encode(s2r, 3)] = textCell(uniq(ps.map(p => p.form != null ? String(p.form) : '—')));
      ws2[encode(s2r, 4)] = textCell(uniq(ps.map(p => p.load != null ? String(p.load) : '—')));
      ws2[encode(s2r, 5)] = textCell(uniq(ps.map(p => p.elevator != null ? String(p.elevator) : '—')));
      ws2[encode(s2r, 6)] = textCell(uniq(ps.map(p => p.productType != null ? String(p.productType) : '—')));
      s2r++;
    });
    ws2['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: Math.max(s2r - 1, 12), c: 6 } });
    setWsMeta(ws2, [14, 12, 18, 12, 30, 18, 22]);

    // ==================== Sheet3：指标估算（全部公式引用 Sheet1） ====================
    const ws3 = {};
    ws3['!merge'] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 3 } },
      { s: { r: 1, c: 0 }, e: { r: 1, c: 3 } }
    ];
    ws3[encode(0, 0)] = cell('综合指标估算（联动「规划指标初始值」）', { bold: true, sz: 14 });
    ws3[encode(1, 0)] = cell('全部数值由公式引用「规划指标初始值」计算，修改 Sheet1 后本表自动重算；底部灰底行为中间计算。', { fontColor: '6B7280' });
    ['指标名称', '数值', '单位', '备注'].forEach((h, c) => ws3[encode(2, c)] = headerCell(h));
    // 行号（1-based）：4 规划用地面积 / 5 用地性质 / 6 总建筑面积 / 7 地上 / 8 地下 / 9 容积率 / 10 限高 / 11 绿地率 / 12 建筑密度
    // 13 研发占比 / 14 配套占比 / 15 机动车 / 16 地面机动车 / 17 地下机动车 / 18 非机动车 / 19 地面非 / 20 地下非
    // 21 绿地面积 / 22 道路面积 / 23 中间-基底 / 24 中间-可布置面积 / 25 中间-地面车位初判
    function s3row(r0, name, value, formula, unit, remark, kind) {
      ws3[encode(r0, 0)] = kind === 'group' ? subtotalCell(name) : textCell(name);
      if (kind === 'group') ws3[encode(r0, 1)] = subtotalCell(value, formula);
      else if (typeof formula === 'string' && typeof value === 'string') ws3[encode(r0, 1)] = cell(value, { f: formula, align: 'right' });
      else if (formula) ws3[encode(r0, 1)] = numCell(value, formula);
      else ws3[encode(r0, 1)] = intLikeCell(value);
      ws3[encode(r0, 2)] = textCell(unit);
      ws3[encode(r0, 3)] = textCell(remark || '');
      if (kind === 'group') { /* subtotalCell 已带样式 */ }
    }
    s3row(3, '规划用地面积', landArea, S1 + 'B7', '㎡', '约 ' + fmtNum(landArea / 666.7, 1) + ' 亩');
    s3row(4, '用地性质',
      pd.landUseType === 'M' ? 'M（工业用地）' : (pd.landUseType === 'C65' ? 'C65（科研设计用地）' : '—'),
      'IF(' + S1 + 'B6="M","M（工业用地）",IF(' + S1 + 'B6="C65","C65（科研设计用地）","—"))', '—', '');
    s3row(5, '总建筑面积', round2(eTotalArea), 'ROUND(B7+B8,2)', '㎡', '地上 + 地下', 'group');
    s3row(6, '地上建筑面积', round2(eAbove), 'ROUND(' + S1 + 'B7*' + S1 + 'B8,2)', '㎡', '＝计容建筑面积＝用地面积×容积率');
    s3row(7, '地下建筑面积', round2(eUnderArea), 'IF(B25>=B15,500,ROUND(B17*IF(' + S1 + 'B5="杭州",42,35)+B20*1.5,2))', '㎡', eJudge >= eTotalVeh ? '设备用房' : '含地下车库与设备用房');
    s3row(8, '容积率', far, S1 + 'B8', '—', '');
    s3row(9, '限高', safeNum(pd.heightLimit), S1 + 'B9', 'm', '');
    s3row(10, '绿地率', greenPct, S1 + 'B10', '%', '');
    s3row(11, '建筑密度', eDensity * 100, 'IF(' + S1 + 'B8<1.5,45,IF(' + S1 + 'B8<2,42,40))', '%', '按容积率分档：<1.5→45%，<2.0→42%，≥2.0→40%');
    s3row(12, '研发办公用房占比', rdPct, S1 + 'B12', '%', '仅上海 C65 用地');
    s3row(13, '配套用房占比', ancPct, S1 + 'B11', '%', '');
    s3row(14, '机动车停车位数量', eTotalVeh,
      'CEILING(B7*(1-' + S1 + 'B11/100)*' + S1 + 'B13/100+B7*' + S1 + 'B11/100*' + S1 + 'B14/100,1)',
      '辆', '厂房 ' + factoryIndex.toFixed(2) + ' 辆/100㎡，配套 ' + supportIndex.toFixed(2) + ' 辆/100㎡', 'group');
    s3row(15, '地面机动车停车位', eGroundVeh, 'IF(B25>=B15,B15,B25)', '辆', '可布置面积÷35，不足 10 辆归 0');
    s3row(16, '地下机动车停车位', eUnderVeh, 'IF(B25>=B15,0,B15-B25)', '辆', '');
    s3row(17, '非机动车停车位数量', eTotalNV, 'CEILING(B7*1/100,1)', '辆', '1.0 辆/100㎡', 'group');
    s3row(18, '地面非机动车停车位', eGroundNV, 'IF(B25>=B15,B18,IF(B18>500,CEILING(B18/2,1),B18))', '辆', '地面车位充足时全放地面；不足且总量>500 时对半分');
    s3row(19, '地下非机动车停车位', eUnderNV, 'IF(B25>=B15,0,IF(B18>500,FLOOR(B18/2,1),0))', '辆', '');
    s3row(20, '绿地面积', round2(eGreen), 'ROUND(' + S1 + 'B7*' + S1 + 'B10/100,2)', '㎡', '＝用地面积×绿地率');
    s3row(21, '道路面积', round2(eRoad), 'ROUND(' + S1 + 'B7*0.3,2)', '㎡', '按用地面积 30% 估算');
    // 中间计算行（灰底）
    ws3[encode(22, 0)] = midTextCell('中间计算：建筑基底面积');
    ws3[encode(22, 1)] = midNumCell(round2(eBase), 'ROUND(' + S1 + 'B7*IF(' + S1 + 'B8<1.5,0.45,IF(' + S1 + 'B8<2,0.42,0.4)),2)');
    ws3[encode(22, 2)] = midTextCell('㎡');
    ws3[encode(22, 3)] = midTextCell('＝用地面积×建筑密度分档');
    ws3[encode(23, 0)] = midTextCell('中间计算：可布置地面车位面积');
    ws3[encode(23, 1)] = midNumCell(round2(eAvail), 'ROUND(' + S1 + 'B7-B21-B22-B23-B18*1.5,2)');
    ws3[encode(23, 2)] = midTextCell('㎡');
    ws3[encode(23, 3)] = midTextCell('＝用地−绿地−道路−基底−非机动车（先按全地面）×1.5');
    ws3[encode(24, 0)] = midTextCell('中间计算：地面车位初判（<10 归 0）');
    ws3[encode(24, 1)] = midNumCell(eJudge, 'IF(FLOOR(B24/35,1)<10,0,FLOOR(B24/35,1))', '#,##0');
    ws3[encode(24, 2)] = midTextCell('辆');
    ws3[encode(24, 3)] = midTextCell('＝可布置面积÷35 取整，不足 10 辆归 0');
    // 整数语义单元格（机动车/非机动车车位各行）数字格式统一 #,##0，缓存值不变
    ['B15', 'B16', 'B17', 'B18', 'B19', 'B20'].forEach(a => { if (ws3[a] && ws3[a].s) ws3[a].s.numFmt = '#,##0'; });
    ws3['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: 24, c: 3 } });
    setWsMeta(ws3, [26, 16, 8, 44]);

    // ==================== Sheet4：产品配置详表（行内公式联动） ====================
    const ws4 = {};
    ws4['!merge'] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 20 } },
      { s: { r: 1, c: 0 }, e: { r: 1, c: 20 } }
    ];
    ws4[encode(0, 0)] = cell('产品配置详表', { bold: true, sz: 14 });
    ws4[encode(1, 0)] = cell('算法输出写为静态初始值；总层高、单栋面积、户型总量及占比为行内联动公式，修改层数/基底/栋数/层高后自动重算。', { fontColor: '6B7280' });
    ['厂房类型', '产品类型', '形式', '荷载', '层数', '电梯配置', '首层层高', '二层层高', '标准层层高', '顶层层高', '总层高(不含女儿墙)',
      '单栋基底面积', '单栋面积', '单单元面积', '栋数', '户型总占地面积', '户型总面积', '建筑面积占比', '户型总计容面积', '计容面积占比', '租金与售价']
      .forEach((h, c) => ws4[encode(2, c)] = headerCell(h));
    products.forEach((p, i) => {
      const r0 = s4First - 1 + i; // 0-based
      const R = r0 + 1;           // 1-based
      const fl = p.fl || {};
      // 层高单元格：null（页面显示 '-'）留空白单元格，保证算术公式按 0 处理
      function flCell(v) { return (v === null || v === undefined) ? cell('', { align: 'right' }) : numCell(v); }
      // 总层高＝各层高求和（标准层按层数-3 重复；轻钢仅首层；3.5 层标准层计 1 次）
      const kF = 'IF($A' + R + '="轻钢厂房",G' + R + ',G' + R + '+IF(E' + R + '>=2,H' + R + ',0)+IF(E' + R + '=3.5,I' + R + ',IF(E' + R + '>3,I' + R + '*(E' + R + '-3),0))+IF(E' + R + '>=2,J' + R + ',0))';
      // 单栋面积：轻钢＝基底+400，其余＝基底×层数
      const mF = 'IF($A' + R + '="轻钢厂房",ROUND(L' + R + '+400,2),ROUND(L' + R + '*E' + R + ',2))';
      // 单栋计容（内联）：轻钢＝基底×2+200、分栋3.5层＝基底×3.5、其余＝基底×层数
      const unitCapF = 'IF($A' + R + '="轻钢厂房",ROUND(L' + R + '*2+200,2),IF(AND($A' + R + '="分栋厂房",E' + R + '=3.5),ROUND(L' + R + '*3.5,2),ROUND(L' + R + '*E' + R + ',2)))';
      const rentPrice = [];
      if (safeNum(p.rent) > 0) rentPrice.push('租:' + p.rent + '元/天/m²');
      if (safeNum(p.price) > 0) rentPrice.push(p.price < 1000 ? '售价不可用' : '售:' + Math.round(p.price) + '元/m²');
      ws4[encode(r0, 0)] = textCell(p.type || '');
      ws4[encode(r0, 1)] = textCell(p.productType || '');
      ws4[encode(r0, 2)] = textCell(p.form != null ? String(p.form) : '');
      ws4[encode(r0, 3)] = textCell(p.load != null ? String(p.load) : '');
      ws4[encode(r0, 4)] = floorsCell(safeNum(p.floors));
      ws4[encode(r0, 5)] = textCell(p.elevator != null ? String(p.elevator) : '');
      ws4[encode(r0, 6)] = flCell(fl.first);
      ws4[encode(r0, 7)] = flCell(fl.second);
      ws4[encode(r0, 8)] = flCell(fl.standard);
      ws4[encode(r0, 9)] = flCell(fl.top);
      ws4[encode(r0, 10)] = numCell(round2(safeNum(p.totalHeight) - 1.2), kF);
      ws4[encode(r0, 11)] = numCell(safeNum(p.base));
      ws4[encode(r0, 12)] = numCell(safeNum(p.unitArea), mF);
      ws4[encode(r0, 13)] = (typeof p.unitAreaSingle === 'number') ? numCell(p.unitAreaSingle) : textCell(p.unitAreaSingle != null ? String(p.unitAreaSingle) : '-');
      ws4[encode(r0, 14)] = intLikeCell(safeNum(p.count));
      ws4[encode(r0, 15)] = numCell(safeNum(p.totalBase), 'ROUND(L' + R + '*O' + R + ',2)');
      ws4[encode(r0, 16)] = numCell(safeNum(p.totalArea), 'ROUND(M' + R + '*O' + R + ',2)');
      ws4[encode(r0, 17)] = cell(round2(safeNum(p.areaRatio) * 100), { f: 'IF($Q$' + s4TR + '=0,0,ROUND(Q' + R + '/$Q$' + s4TR + '*100,2))', numFmt: '0.0"%"', align: 'right', raw: true });
      ws4[encode(r0, 18)] = numCell(safeNum(p.totalCap), 'ROUND(O' + R + '*' + unitCapF + ',2)');
      ws4[encode(r0, 19)] = cell(round2(safeNum(p.capRatio) * 100), { f: 'IF($S$' + s4TR + '=0,0,ROUND(S' + R + '/$S$' + s4TR + '*100,2))', numFmt: '0.0"%"', align: 'right', raw: true });
      ws4[encode(r0, 20)] = textCell(rentPrice.join(' / ') || '—');
    });
    // 合计行
    const tr0 = s4TR - 1; // 0-based
    ws4[encode(tr0, 0)] = totalCell('合计');
    for (let c = 1; c <= 10; c++) ws4[encode(tr0, c)] = cell('', { fill: STYLE.totalFill });
    [11, 12, 13].forEach(c => ws4[encode(tr0, c)] = totalCell('—'));
    ws4[encode(tr0, 14)] = totalCell(products.reduce((s, p) => s + safeNum(p.count), 0), 'ROUND(SUM(O' + s4First + ':O' + s4Last + '),2)');
    ws4[encode(tr0, 14)].s.numFmt = '#,##0'; // 栋数合计整数显示
    ws4[encode(tr0, 15)] = totalCell(oBase, 'ROUND(SUM(P' + s4First + ':P' + s4Last + '),2)');
    ws4[encode(tr0, 16)] = totalCell(oAbove, 'ROUND(SUM(Q' + s4First + ':Q' + s4Last + '),2)');
    ws4[encode(tr0, 17)] = totalCell(products.length ? 100 : 0, 'ROUND(SUM(R' + s4First + ':R' + s4Last + '),2)');
    ws4[encode(tr0, 17)].s.numFmt = '0.0"%"'; // 建面占比合计 100.0%
    ws4[encode(tr0, 18)] = totalCell(oCap, 'ROUND(SUM(S' + s4First + ':S' + s4Last + '),2)');
    ws4[encode(tr0, 19)] = totalCell(products.length ? 100 : 0, 'ROUND(SUM(T' + s4First + ':T' + s4Last + '),2)');
    ws4[encode(tr0, 19)].s.numFmt = '0.0"%"'; // 计容占比合计 100.0%
    ws4[encode(tr0, 20)] = totalCell('—');
    // 表下加注
    const noteR0 = s4TR; // 0-based，合计行下一行
    ws4[encode(noteR0, 0)] = cell('注：本表为算法生成初始值，请勿新增产品行；修改既有行的层数/基底/栋数/层高后，关联列自动重算。', { fontColor: '6B7280' });
    ws4['!merge'].push({ s: { r: noteR0, c: 0 }, e: { r: noteR0, c: 20 } });
    ws4['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: noteR0, c: 20 } });
    setWsMeta(ws4, [11, 18, 10, 26, 7, 14, 9, 9, 10, 9, 14, 12, 11, 11, 7, 13, 12, 11, 13, 11, 26]);

    // ==================== Sheet5：总体经济技术指标（双源引用 Sheet1/Sheet4） ====================
    const ws5 = {};
    ws5['!merge'] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 3 } },
      { s: { r: 1, c: 0 }, e: { r: 1, c: 3 } }
    ];
    ws5[encode(0, 0)] = cell('总体经济技术指标（联动「产品配置详表」）', { bold: true, sz: 14 });
    ws5[encode(1, 0)] = cell('产品面积/基底/计容引用「产品配置详表」，用地/绿地率/配建指标引用「规划指标初始值」，修改 Sheet4 后本表自动重算；底部灰底行为中间计算。', { fontColor: '6B7280' });
    ['指标名称', '数值', '单位', '备注'].forEach((h, c) => ws5[encode(2, c)] = headerCell(h));
    // 行号（1-based）：4 用地 / 5 总建面 / 6 地上 / 7 地下 / 8 计容 / 9 容积率 / 10 绿地率 / 11 建筑密度
    // 12 机动车 / 13 地面机 / 14 地下机 / 15 非机动车 / 16 地面非 / 17 地下非 / 18~23 各产品面积
    // 24 中间-总基底 / 25 中间-厂房面积 / 26 中间-配套面积 / 27 中间-可布置面积 / 28 中间-地面车位初判
    function s5row(r0, name, value, formula, unit, remark, kind) {
      ws5[encode(r0, 0)] = kind === 'group' ? subtotalCell(name) : textCell(name);
      if (kind === 'group') ws5[encode(r0, 1)] = subtotalCell(value, formula);
      else if (formula) ws5[encode(r0, 1)] = numCell(value, formula);
      else ws5[encode(r0, 1)] = intLikeCell(value);
      ws5[encode(r0, 2)] = textCell(unit);
      ws5[encode(r0, 3)] = textCell(remark || '');
    }
    s5row(3, '规划用地面积', landArea, S1 + 'B7', '㎡', '约 ' + fmtNum(landArea / 666.7, 1) + ' 亩');
    s5row(4, '总建筑面积', round2(oTotal), 'ROUND(B6+B7,2)', '㎡', '地上 + 地下', 'group');
    s5row(5, '地上建筑面积', round2(oAbove), S4 + 'Q' + s4TR, '㎡', '＝产品配置详表户型总面积合计');
    s5row(6, '地下建筑面积', round2(oUnder), 'IF(B28>=B12,500,ROUND(B14*IF(' + S1 + 'B5="杭州",42,35)+B17*1.5,2))', '㎡', oJudge >= oTotalVeh ? '设备用房' : '含地下车库与设备用房');
    s5row(7, '计容总建筑面积', round2(oCap), S4 + 'S' + s4TR, '㎡', '＝产品配置详表户型总计容合计');
    s5row(8, '容积率', round2(oFar), 'ROUND(B8/B4,2)', '—', '目标 ' + fmtNum(far, 2));
    s5row(9, '绿地率', greenPct, S1 + 'B10', '%', '');
    s5row(10, '建筑密度', round2(oDensity * 100), 'ROUND(B24/B4*100,2)', '%', '＝总基底÷用地面积；目标 ' + fmtNum(eDensity * 100, 0) + '%');
    s5row(11, '机动车停车位数量', oTotalVeh, 'CEILING(B25*' + S1 + 'B13/100,1)+CEILING(B26*' + S1 + 'B14/100,1)', '辆', '按厂房/配套面积分别向上取整', 'group');
    s5row(12, '地面机动车停车位', oGroundVeh, 'IF(B28>=B12,B12,B28)', '辆', '可布置面积÷35，不足 10 辆归 0');
    s5row(13, '地下机动车停车位', oUnderVeh, 'IF(B28>=B12,0,B12-B28)', '辆', '');
    s5row(14, '非机动车停车位数量', oTotalNV, 'CEILING(B6*1/100,1)', '辆', '1.0 辆/100㎡', 'group');
    s5row(15, '地面非机动车停车位', oGroundNV, 'IF(B28>=B12,B15,IF(B15>500,CEILING(B15/2,1),B15))', '辆', '地面车位充足时全放地面；不足且总量>500 时对半分');
    s5row(16, '地下非机动车停车位', oUnderNV, 'IF(B28>=B12,0,IF(B15>500,FLOOR(B15/2,1),0))', '辆', '');
    // 各产品面积（SUMIF 按类型汇总 Sheet4 户型总面积；条件用字面量类型名，与 Sheet4 A 列逐字一致，引用本表标签格会因带「建筑面积」后缀而失配归 0）
    const s5TypeRows = ['轻钢厂房', '分栋厂房', '分层厂房', '产业大厦', '配套楼', '配套宿舍'];
    s5TypeRows.forEach((t, i) => {
      const r0 = 17 + i;
      s5row(r0, t + '建筑面积', round2(typeAreaSum[t]),
        'ROUND(SUMIF(' + S4 + '$A$' + s4First + ':$A$' + s4Last + ',"' + t + '",' + S4 + '$Q$' + s4First + ':$Q$' + s4Last + '),2)',
        '㎡', 'SUMIF 汇总自产品配置详表');
    });
    // 中间计算行（灰底）
    ws5[encode(23, 0)] = midTextCell('中间计算：总基底面积');
    ws5[encode(23, 1)] = midNumCell(round2(oBase), S4 + 'P' + s4TR);
    ws5[encode(23, 2)] = midTextCell('㎡');
    ws5[encode(23, 3)] = midTextCell('＝产品配置详表户型总占地合计');
    ws5[encode(24, 0)] = midTextCell('中间计算：厂房面积（车位口径）');
    ws5[encode(24, 1)] = midNumCell(round2(oFactory), 'ROUND(B6-B22-B23-IF(AND(' + S1 + 'B5="上海",' + S1 + 'B6="C65"),B21,0),2)');
    ws5[encode(24, 2)] = midTextCell('㎡');
    ws5[encode(24, 3)] = midTextCell('＝地上建面−配套楼−配套宿舍−（上海C65 时）产业大厦');
    ws5[encode(25, 0)] = midTextCell('中间计算：配套面积（车位口径）');
    ws5[encode(25, 1)] = midNumCell(round2(oAnc), 'ROUND(B22+B23,2)');
    ws5[encode(25, 2)] = midTextCell('㎡');
    ws5[encode(25, 3)] = midTextCell('＝配套楼＋配套宿舍');
    ws5[encode(26, 0)] = midTextCell('中间计算：可布置地面车位面积');
    ws5[encode(26, 1)] = midNumCell(round2(oAvail), 'ROUND(B4-ROUND(B4*0.3,2)-ROUND(B4*' + S1 + 'B10/100,2)-B24-B15*1.5,2)');
    ws5[encode(26, 2)] = midTextCell('㎡');
    ws5[encode(26, 3)] = midTextCell('＝用地−道路(30%)−绿地−总基底−非机动车（先按全地面）×1.5');
    ws5[encode(27, 0)] = midTextCell('中间计算：地面车位初判（<10 归 0）');
    ws5[encode(27, 1)] = midNumCell(oJudge, 'IF(FLOOR(B27/35,1)<10,0,FLOOR(B27/35,1))', '#,##0');
    ws5[encode(27, 2)] = midTextCell('辆');
    ws5[encode(27, 3)] = midTextCell('＝可布置面积÷35 取整，不足 10 辆归 0');
    // 整数语义单元格（机动车/非机动车车位各行）数字格式统一 #,##0，缓存值不变
    ['B12', 'B13', 'B14', 'B15', 'B16', 'B17'].forEach(a => { if (ws5[a] && ws5[a].s) ws5[a].s.numFmt = '#,##0'; });
    // 补充引用行（供总表第二部分「规划指标」sheet 映射引用；行号 29~32）
    let oTowerHeight = 0;
    products.forEach(p => { if (p.type === '产业大厦') oTowerHeight = Math.max(oTowerHeight, safeNum(p.totalHeight)); });
    s5row(28, '配套用房占比', ancPct, S1 + 'B11', '%', '引自规划指标初始值');
    s5row(29, '研发办公占比', rdPct, S1 + 'B12', '%', '引自规划指标初始值；仅上海 C65 用地');
    s5row(30, '道路面积', round2(landArea * 0.3), 'ROUND(B4*0.3,2)', '㎡', '按用地面积 30% 估算');
    s5row(31, '产业大厦建筑高度', oTowerHeight,
      'IF(COUNTIF(' + S4 + '$A$' + s4First + ':$A$' + s4Last + ',"产业大厦")=0,0,SUMPRODUCT(MAX((' + S4 + '$A$' + s4First + ':$A$' + s4Last + '="产业大厦")*' + S4 + '$K$' + s4First + ':$K$' + s4Last + '))+1.2)',
      'm', '＝产业大厦最高总层高＋女儿墙 1.2m');
    ws5['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: 31, c: 3 } });
    setWsMeta(ws5, [28, 16, 8, 46]);

    return [
      { name: '规划指标初始值', ws: ws1 },
      { name: '产品配置选择', ws: ws2 },
      { name: '指标估算', ws: ws3 },
      { name: '产品配置详表', ws: ws4 },
      { name: '总体经济技术指标', ws: ws5 }
    ];
  }

  // 预留给任务A2「指标/测算总表」集成复用（总表第一部分 = 本函数返回的 5 个 sheet）
  NS._buildLinkageSheets = buildLinkageSheets;

  // 「规划/产品总表下载」：组装三表联动 5 个 sheet 并下载
  NS.downloadMasterLinkageExcel = function (configResult, projectData, fileName) {
    if (typeof XLSX === 'undefined') { alert('Excel 导出库未加载，请检查网络。'); return; }
    if (!configResult || !configResult.products || !configResult.products.length) { alert('请先生成产品配置'); return; }
    const wb = XLSX.utils.book_new();
    buildLinkageSheets(configResult, projectData).forEach(function (s) {
      XLSX.utils.book_append_sheet(wb, s.ws, s.name);
    });
    XLSX.writeFile(wb, fileName || '规划产品总表.xlsx');
  };

  // ==================== 指标/测算总表（总表集成，四部分 17 个 sheet） ====================
  // 需求见 MASTER_TABLE_INTEGRATION.md：第一部分复用 buildLinkageSheets；
  // 第二~四部分用「捕获 + 重接线」复用现有下载函数生成的工作簿，仅把驱动单元格改为跨部分公式引用（缓存值与被引单元格一致），结构不动。

  // 临时替换 XLSX.writeFile 捕获工作簿，调用前后恢复
  function captureWorkbook(fn, args) {
    const origWriteFile = XLSX.writeFile;
    let captured = null;
    XLSX.writeFile = function (wb) { captured = wb; };
    try {
      fn.apply(null, args);
    } finally {
      XLSX.writeFile = origWriteFile;
    }
    return captured;
  }

  // 在 sheet 中按列与标签精确查找 1-based 行号
  function findRowByLabel(ws, colLetter, label) {
    const re = new RegExp('^' + colLetter + '\\d+$');
    const keys = Object.keys(ws);
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];
      if (re.test(k) && ws[k] && ws[k].v === label) return parseInt(k.slice(colLetter.length), 10);
    }
    return null;
  }

  // 同上，返回全部匹配行号（升序），用于「  小计」等重复标签按出现顺序取行
  function findRowsByLabel(ws, colLetter, label) {
    const re = new RegExp('^' + colLetter + '\\d+$');
    return Object.keys(ws)
      .filter(k => re.test(k) && ws[k] && ws[k].v === label)
      .map(k => parseInt(k.slice(colLetter.length), 10))
      .sort((a, b) => a - b);
  }

  // 把 ws 中 addr 单元格改为公式引用 refWs 的 refAddr；缓存值取被引单元格缓存，保证缓存 == 公式求值
  function rewireCellToRef(ws, addr, refSheetName, refWs, refAddr) {
    const c = ws[addr];
    const ref = refWs[refAddr];
    if (!c || !ref) return false;
    c.f = "'" + refSheetName + "'!" + refAddr;
    c.v = ref.v;
    return true;
  }

  // 动态分析占位 sheet（结构 = 标题 + 说明行）
  function buildDynamicPlaceholderSheet(title) {
    const ws = {};
    ws['!merge'] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 3 } },
      { s: { r: 1, c: 0 }, e: { r: 1, c: 3 } }
    ];
    ws[encode(0, 0)] = cell(title, { bold: true, sz: 14 });
    ws[encode(1, 0)] = cell('动态分析未完成，请先完成动态投资分析', { fontColor: '6B7280' });
    ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: 1, c: 3 } });
    setWsMeta(ws, [30, 16, 12, 12]);
    return ws;
  }

  // 「指标/测算总表下载」：四部分 17 个 sheet
  NS.downloadMasterIntegratedExcel = function (configResult, projectData, investmentEstimateResult, staticAnalysisResult, dynamicAnalysisResult, fileName) {
    if (typeof XLSX === 'undefined') { alert('Excel 导出库未加载，请检查网络。'); return; }
    if (!configResult || !configResult.products || !configResult.products.length) { alert('请先生成产品配置'); return; }
    if (!investmentEstimateResult) { alert('请先完成投资估算'); return; }
    if (!staticAnalysisResult) { alert('请先进行静态投资分析'); return; }

    const S5_NAME = '总体经济技术指标';
    const wb = XLSX.utils.book_new();
    const usedNames = {};
    function appendSheet(ws, name) {
      if (!ws) { console.error('总表集成：缺少 sheet', name); return; }
      if (usedNames[name]) console.error('总表集成：sheet 名冲突', name);
      if (name.length > 31) console.error('总表集成：sheet 名超过 31 字', name);
      usedNames[name] = true;
      XLSX.utils.book_append_sheet(wb, ws, name);
    }

    // ---------- 第一部分：三表联动（5 sheet，直接复用） ----------
    const linkage = buildLinkageSheets(configResult, projectData);
    linkage.forEach(function (s) { appendSheet(s.ws, s.name); });
    const sheet5 = linkage[4].ws; // 总体经济技术指标（下游映射源）

    // ---------- 第二部分：投资估算（4 sheet；「规划指标」重接线到 Sheet5） ----------
    const invWb = captureWorkbook(NS.downloadInvestmentEstimateExcel, [investmentEstimateResult, '_tmp.xlsx']);
    if (!invWb || !invWb.Sheets) { alert('投资估算工作簿生成失败'); return; }
    const invPlan = invWb.Sheets['规划指标'];
    // [规划指标单元格, Sheet5 单元格]：用地/容积率/计容/地上/地下/总建面/密度/绿地率/道路/配套/研发/各产品面积/大厦高度/配套楼/配套宿舍
    const invPlanMap = [
      ['B3', 'B4'], ['B4', 'B9'], ['B5', 'B8'], ['B6', 'B6'], ['B7', 'B7'], ['B8', 'B5'],
      ['B9', 'B11'], ['B10', 'B10'], ['B11', 'B31'], ['B12', 'B29'], ['B13', 'B30'],
      ['B14', 'B18'], ['B15', 'B19'], ['B16', 'B20'], ['B17', 'B21'], ['B18', 'B32'],
      ['B19', 'B22'], ['B20', 'B23']
    ];
    invPlanMap.forEach(function (m) { rewireCellToRef(invPlan, m[0], S5_NAME, sheet5, m[1]); });
    // B21~B24（分栋/分层 独栋与双拼三拼面积）Sheet5 无对应行，保持静态
    ['规划指标', '加权平均造价表', '投资估算完整版', '投资估算简化版'].forEach(function (n) { appendSheet(invWb.Sheets[n], n); });
    // 完整版关键行（供第三、四部分引用）：发展成本合计、财务费用、融资参数区（融资占比/融资利率）
    const invFull = invWb.Sheets['投资估算完整版'];
    const invTotalRow = findRowByLabel(invFull, 'B', '发展成本合计');
    const invFinRow = findRowByLabel(invFull, 'B', '财务费用');
    const invFinRatioParamRow = findRowByLabel(invFull, 'B', '融资占比');
    const invFinRateParamRow = findRowByLabel(invFull, 'B', '融资利率');

    // ---------- 第三部分：静态投资分析（5 sheet；规划指标区 → Sheet5，成本区 → 完整版/规划指标） ----------
    const saWb = captureWorkbook(NS.downloadStaticAnalysisExcel, [staticAnalysisResult, '_tmp.xlsx']);
    if (!saWb || !saWb.Sheets) { alert('静态投资分析工作簿生成失败'); return; }
    // 完整版成本区引用行（findRowByLabel 动态定位，禁止写死）：小计行按 2 空格缩进匹配（建安子项小计为 4 空格，不会混入）
    const invPlanSheet = invWb.Sheets['规划指标'];
    const xiaojiRows = findRowsByLabel(invFull, 'B', '  小计'); // [土地配套小计, 前期小计]
    const landSubtotalRowX = xiaojiRows[0] || null;
    const prelimSubtotalRowX = xiaojiRows[1] || null;
    const constructionTotalRowX = findRowByLabel(invFull, 'B', '  建安工程成本合计');
    const indirectRowX = findRowByLabel(invFull, 'B', '开发间接费');
    const landTransferRowX = findRowByLabel(invFull, 'B', '  土地出让金');
    const rentSalePlanRow = findRowByLabel(invPlanSheet, 'A', '租售建面');
    const totalBldPlanRow = findRowByLabel(invPlanSheet, 'A', '总建筑面积');
    // 销售测算/租赁测算的「一、规划指标」区行号固定（B4 亩/B5 用地/B6 容积率/B7 计容/B8 地上/B9 地下/B10 总建面）
    const saPlanMap = [['B5', 'B4'], ['B6', 'B9'], ['B7', 'B8'], ['B8', 'B6'], ['B9', 'B7'], ['B10', 'B5']];
    ['销售测算', '租赁测算'].forEach(function (n) {
      const ws = saWb.Sheets[n];
      // 用地面积（亩）按 Sheet5 用地面积折算
      const acreCell = ws['B4'];
      if (acreCell && sheet5['B4']) {
        acreCell.f = "ROUND('" + S5_NAME + "'!B4/666.7,2)";
        acreCell.v = round2(sheet5['B4'].v / 666.7);
      }
      saPlanMap.forEach(function (m) { rewireCellToRef(ws, m[0], S5_NAME, sheet5, m[1]); });
      // 财务费用 → 投资估算完整版「财务费用」行金额
      if (invFinRow) rewireCellToRef(ws, 'B19', '投资估算完整版', invFull, 'F' + invFinRow);
      // 成本区 5 行重接线（缓存与新口径一致；行号全部动态定位）
      const rLandPrice = findRowByLabel(ws, 'A', '土地价格');
      const rLandUnit = findRowByLabel(ws, 'A', '土地成本单方（土地配套费合计）');
      const rConstrUnit = findRowByLabel(ws, 'A', '建安成本单方（前期+建安工程）');
      const rRentSale = findRowByLabel(ws, 'A', '单位租售建面成本');
      const rUnitAll = findRowByLabel(ws, 'A', '综合单方成本（含期间费用）');
      // 土地价格 → 完整版「土地出让金」单价单元格
      if (rLandPrice && landTransferRowX) rewireCellToRef(ws, 'B' + rLandPrice, '投资估算完整版', invFull, 'D' + landTransferRowX);
      // 土地成本单方 → 完整版土地配套小计 ÷ 规划指标租售建面
      if (rLandUnit && landSubtotalRowX && rentSalePlanRow) {
        ws['B' + rLandUnit].f = "ROUND('投资估算完整版'!F" + landSubtotalRowX + "/'规划指标'!B" + rentSalePlanRow + "*10000,2)";
      }
      // 建安成本单方 → (完整版前期小计+建安工程成本合计+开发间接费) ÷ 规划指标租售建面
      if (rConstrUnit && prelimSubtotalRowX && constructionTotalRowX && indirectRowX && rentSalePlanRow) {
        ws['B' + rConstrUnit].f = "ROUND(('投资估算完整版'!F" + prelimSubtotalRowX + "+'投资估算完整版'!F" + constructionTotalRowX + "+'投资估算完整版'!F" + indirectRowX + ")/'规划指标'!B" + rentSalePlanRow + "*10000,2)";
      }
      // 单位租售建面成本 → 本表上两行之和
      if (rRentSale && rLandUnit && rConstrUnit) {
        ws['B' + rRentSale].f = 'ROUND(B' + rLandUnit + '+B' + rConstrUnit + ',2)';
      }
      // 综合单方成本（含期间费用）→ 完整版发展成本合计 ÷ 规划指标总建筑面积
      if (rUnitAll && invTotalRow && totalBldPlanRow) {
        ws['B' + rUnitAll].f = "ROUND('投资估算完整版'!F" + invTotalRow + "/'规划指标'!B" + totalBldPlanRow + "*10000,2)";
      }
    });
    // 综合汇总「总投资」→ 完整版「发展成本合计」；「融资占比」输入格 → 完整版融资参数区
    const sumWs = saWb.Sheets['综合汇总'];
    if (invTotalRow) rewireCellToRef(sumWs, 'B3', '投资估算完整版', invFull, 'F' + invTotalRow);
    const sumFinRatioRow = findRowByLabel(sumWs, 'A', '融资占比');
    if (invFinRatioParamRow && sumFinRatioRow) rewireCellToRef(sumWs, 'B' + sumFinRatioRow, '投资估算完整版', invFull, 'D' + invFinRatioParamRow);
    ['销售测算', '租赁测算', '租售面积分配', '土地增值税测算表', '综合汇总'].forEach(function (n) { appendSheet(saWb.Sheets[n], n); });

    // ---------- 第四部分：动态投资分析（3 sheet；参数区驱动单元格重接线；无结果时占位） ----------
    if (dynamicAnalysisResult && dynamicAnalysisResult.years && dynamicAnalysisResult.years.length) {
      const dynWb = captureWorkbook(NS.downloadDynamicAnalysisExcel, [dynamicAnalysisResult, '_tmp.xlsx']);
      if (!dynWb || !dynWb.Sheets) { alert('动态投资分析工作簿生成失败'); return; }
      const cashWs = dynWb.Sheets['多年现金流表'];
      const saSaleWs = saWb.Sheets['销售测算'];
      const saRentWs = saWb.Sheets['租赁测算'];
      // 总投资 → 完整版发展成本合计；融资占比/贷款利率 → 完整版融资参数区
      if (invTotalRow) rewireCellToRef(cashWs, 'C3', '投资估算完整版', invFull, 'F' + invTotalRow);
      if (invFinRatioParamRow) rewireCellToRef(cashWs, 'C4', '投资估算完整版', invFull, 'D' + invFinRatioParamRow);
      if (invFinRateParamRow) rewireCellToRef(cashWs, 'C6', '投资估算完整版', invFull, 'D' + invFinRateParamRow);
      // 加权售价/租金、可售/可租面积、出租率 → 静态 sheet；营销/管理/运营费率 → 静态 sheet 表尾费率参数区
      rewireCellToRef(cashWs, 'G3', '销售测算', saSaleWs, 'B24');
      rewireCellToRef(cashWs, 'G5', '租赁测算', saRentWs, 'B24');
      rewireCellToRef(cashWs, 'G9', '销售测算', saSaleWs, 'B23');
      rewireCellToRef(cashWs, 'G10', '租赁测算', saRentWs, 'B23');
      rewireCellToRef(cashWs, 'G11', '租赁测算', saRentWs, 'B27');
      const mktRateRowS = findRowByLabel(saSaleWs, 'A', '营销费率');
      const mgmtRateRowS = findRowByLabel(saSaleWs, 'A', '管理费率');
      const opRateRowS = findRowByLabel(saRentWs, 'A', '租赁运营费率');
      if (mktRateRowS) rewireCellToRef(cashWs, 'G13', '销售测算', saSaleWs, 'B' + mktRateRowS);
      if (mgmtRateRowS) rewireCellToRef(cashWs, 'G14', '销售测算', saSaleWs, 'B' + mgmtRateRowS);
      if (opRateRowS) rewireCellToRef(cashWs, 'G15', '租赁测算', saRentWs, 'B' + opRateRowS);
      // 销售/租赁去化速度 → 静态「综合汇总」去化设置参数区（首现于静态）
      const sumWs2 = saWb.Sheets['综合汇总'];
      const sumSaleSpeedRow = findRowByLabel(sumWs2, 'A', '销售去化速度');
      const sumRentSpeedRow = findRowByLabel(sumWs2, 'A', '租赁去化速度');
      if (sumSaleSpeedRow) rewireCellToRef(cashWs, 'G7', '综合汇总', sumWs2, 'B' + sumSaleSpeedRow);
      if (sumRentSpeedRow) rewireCellToRef(cashWs, 'G8', '综合汇总', sumWs2, 'B' + sumRentSpeedRow);
      ['多年现金流表', '敏感性分析', '关键指标汇总'].forEach(function (n) { appendSheet(dynWb.Sheets[n], n); });
    } else {
      appendSheet(buildDynamicPlaceholderSheet('多年现金流表'), '多年现金流表');
      appendSheet(buildDynamicPlaceholderSheet('敏感性分析'), '敏感性分析');
      appendSheet(buildDynamicPlaceholderSheet('关键指标汇总'), '关键指标汇总');
    }

    XLSX.writeFile(wb, fileName || '指标测算总表.xlsx');
  };

})(window);
