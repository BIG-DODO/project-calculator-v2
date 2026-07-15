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
    metrics.totalBuildingArea = result.totalArea || 0;
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
    const aboveGroundArea = metrics.aboveGroundArea;
    const undergroundArea = safeNum(calc.undergroundArea, 0);
    const totalBuildingArea = aboveGroundArea + undergroundArea;
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
    const financingRatio = safeNum(inputs.financingRatio, 0) / 100;
    const financingRate = safeNum(inputs.financingRate, 5) / 100;
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
      { code: '1-1', name: '土地出让金', unit: '万元/亩', unitPrice: landPrice, quantity: acre, cost: landTransferFee, note: '单价×亩数' },
      { code: '1-2', name: '土地转让费（契税）', unit: '万元', unitPrice: round2(landPrice * 0.03 + 10 / acre), quantity: acre, cost: deedTax, note: '出让金×3%+10' },
      { code: '1-3', name: '拆迁补偿费', unit: '万元', unitPrice: 0, quantity: 0, cost: 0, note: '删除，不输出' },
      { code: '1-4', name: '大市政配套费', unit: '元/m²', unitPrice: effectiveMunicipalFee, quantity: landArea, cost: municipalSupportingFee, note: city === '上海' ? '上海默认0' : '' },
      { code: '1-5-2', name: '电力增容费/高可靠性用电', unit: '元/KVA', unitPrice: REFERENCE_PRICES.offsiteMunicipal.powerCapacity, quantity: powerKva, cost: powerCapacityCost, note: '(地上建面×70+地下建面×50)/1000' },
      { code: '1-5-3', name: '红线外给水、排水接驳费', unit: '元/m²', unitPrice: REFERENCE_PRICES.offsiteMunicipal.waterDrainageConnection, quantity: landArea, cost: waterDrainageCost, note: '按用地面积' },
      { code: '1-6', name: '其他费用', unit: '万元', unitPrice: 0, quantity: 0, cost: 0, note: '' },
      { code: '1-7', name: '其中增值税', unit: '万元', unitPrice: 0.06, quantity: offsiteMunicipalTotal, cost: landVAT, note: '红线外市政×6%/1.06' }
    ];
    const landCostTotal = round2(landCostItems.reduce((s, it) => s + it.cost, 0));

    // 二、前期费用
    const pre = REFERENCE_PRICES.preliminary;
    const prelimItems = [
      { code: '2-1', name: '勘察费用', unit: '元/m²', unitPrice: pre.survey, quantity: landArea, cost: round2(pre.survey * landArea / 10000), note: '按用地面积' },
      { code: '2-2', name: '规划设计费', unit: '元/m²', unitPrice: pre.planning, quantity: aboveGroundArea, cost: round2(pre.planning * aboveGroundArea / 10000), note: '按地上总建面' },
      { code: '2-3', name: '报批报建费', unit: '元/m²', unitPrice: pre.approval, quantity: aboveGroundArea, cost: round2(pre.approval * aboveGroundArea / 10000), note: '按地上总建面' },
      { code: '2-4', name: '造价咨询服务费', unit: '元/m²', unitPrice: pre.consulting, quantity: aboveGroundArea, cost: round2(pre.consulting * aboveGroundArea / 10000), note: '按地上总建面' },
      { code: '2-5', name: '工程监理费', unit: '元/m²', unitPrice: pre.supervision, quantity: aboveGroundArea, cost: round2(pre.supervision * aboveGroundArea / 10000), note: '按地上总建面' },
      { code: '2-6', name: '临时工程费', unit: '元/m²', unitPrice: pre.temporary, quantity: aboveGroundArea, cost: round2(pre.temporary * aboveGroundArea / 10000), note: '按地上总建面' },
      { code: '2-7', name: '拆除工程', unit: '元/m²', unitPrice: pre.demolition, quantity: aboveGroundArea, cost: round2(pre.demolition * aboveGroundArea / 10000), note: '无拆除时为0' },
      { code: '2-8', name: '其他', unit: '元/m²', unitPrice: pre.other, quantity: aboveGroundArea, cost: round2(pre.other * aboveGroundArea / 10000), note: '' }
    ];
    const prelimSubtotal = round2(prelimItems.reduce((s, it) => s + it.cost, 0));
    const prelimVAT = round2(prelimSubtotal * 0.06 / 1.06);
    prelimItems.push({ code: '2-9', name: '其中增值税', unit: '万元', unitPrice: 0.06, quantity: prelimSubtotal, cost: prelimVAT, note: '前期合计×6%/1.06' });
    const prelimTotal = round2(prelimSubtotal + prelimVAT);

    // 三、建安工程成本
    // 3.1 基础设施费
    const infra = REFERENCE_PRICES.infrastructure;
    const infraItems = [
      { code: '3-1-1', name: '室外给水管网', unit: '元/m²', unitPrice: infra.waterSupply, quantity: aboveGroundArea, cost: round2(infra.waterSupply * aboveGroundArea / 10000), note: '' },
      { code: '3-1-2', name: '室外排水管网', unit: '元/m²', unitPrice: infra.drainage, quantity: aboveGroundArea, cost: round2(infra.drainage * aboveGroundArea / 10000), note: '' },
      { code: '3-1-3', name: '室外电缆工程', unit: '元/m²', unitPrice: infra.cable, quantity: aboveGroundArea, cost: round2(infra.cable * aboveGroundArea / 10000), note: '' },
      { code: '3-1-4', name: '室外弱电工程', unit: '元/m²', unitPrice: infra.weakCurrent, quantity: aboveGroundArea, cost: round2(infra.weakCurrent * aboveGroundArea / 10000), note: '' },
      { code: '3-1-5', name: '室外燃气管网', unit: '元/m²', unitPrice: infra.gas, quantity: aboveGroundArea, cost: round2(infra.gas * aboveGroundArea / 10000), note: '' },
      { code: '3-1-6', name: '供配电设备及安装', unit: '元/m²', unitPrice: infra.powerDistribution, quantity: aboveGroundArea, cost: round2(infra.powerDistribution * aboveGroundArea / 10000), note: '' },
      { code: '3-1-7', name: '水泵房设备及安装', unit: '元/m²', unitPrice: infra.pumpRoom, quantity: aboveGroundArea, cost: round2(infra.pumpRoom * aboveGroundArea / 10000), note: '' },
      { code: '3-1-8', name: '消防设备及安装', unit: '元/m²', unitPrice: infra.fire, quantity: aboveGroundArea, cost: round2(infra.fire * aboveGroundArea / 10000), note: '' },
      { code: '3-1-9', name: '小区车行道路工程', unit: '元/m²', unitPrice: infra.road, quantity: roadArea, cost: round2(infra.road * roadArea / 10000), note: '总用地×30%' }
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
      { code: '3-2-2', name: '硬质铺装', unit: '元/m²', unitPrice: land.hardPavement, quantity: hardPavementArea, cost: round2(land.hardPavement * hardPavementArea / 10000), note: '总用地×(1-绿地率-30%-建筑密度)' },
      { code: '3-2-3', name: '非示范区绿化', unit: '元/m²', unitPrice: land.greening, quantity: nonDemoGreenArea, cost: round2(land.greening * nonDemoGreenArea / 10000), note: '总用地×绿地率-1000' },
      { code: '3-2-4', name: '出入口开口费', unit: '万元/个', unitPrice: land.entrance, quantity: entranceCount, cost: round2(land.entrance * entranceCount), note: 'ceil(总用地/20000),2~4个' },
      { code: '3-2-5', name: '室外石材台阶及散水', unit: '元/m²', unitPrice: land.stoneSteps, quantity: aboveGroundArea, cost: round2(land.stoneSteps * aboveGroundArea / 10000), note: '按地上总建面' },
      { code: '3-2-6', name: '标示标牌', unit: '元/m²', unitPrice: land.signs, quantity: aboveGroundArea, cost: round2(land.signs * aboveGroundArea / 10000), note: '按地上总建面' },
      { code: '3-2-7', name: '围墙', unit: '元/m', unitPrice: land.wall, quantity: wallLength, cost: round2(land.wall * wallLength / 10000), note: '√总用地×4×1.2' },
      { code: '3-2-8', name: '海绵城市', unit: '元/m²', unitPrice: land.spongeCity, quantity: spongeCityArea, cost: round2(land.spongeCity * spongeCityArea / 10000), note: spongeCity ? '总用地×绿地率+硬质铺装' : '未启用' }
    ];
    const landscapeTotal = round2(landscapeItems.reduce((s, it) => s + it.cost, 0));

    // 3.3 公建配套
    const publicFacilityItems = [
      { code: '3-3-1', name: '地下室', unit: '元/m²', unitPrice: 3700, quantity: undergroundArea, cost: round2(3700 * undergroundArea / 10000), note: '' },
      { code: '3-3-2', name: '配套楼', unit: '元/m²', unitPrice: 2200, quantity: metrics.supportArea, cost: round2(2200 * metrics.supportArea / 10000), note: '' },
      { code: '3-3-3', name: '配套宿舍', unit: '元/m²', unitPrice: 2600, quantity: metrics.dormArea, cost: round2(2600 * metrics.dormArea / 10000), note: '' }
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
      { code: '3-4-1', name: '轻钢厂房', unit: '元/m²', unitPrice: 1500, quantity: metrics.lightSteelArea, cost: round2(1500 * metrics.lightSteelArea / 10000), note: '非计容建面' },
      { code: '3-4-2', name: '分栋厂房', unit: '元/m²', unitPrice: round2(splitUnitPrice), quantity: metrics.splitArea, cost: round2(splitUnitPrice * metrics.splitArea / 10000), note: '独栋2300/双拼2200加权' },
      { code: '3-4-3', name: '分层厂房', unit: '元/m²', unitPrice: round2(layerUnitPrice), quantity: metrics.layerArea, cost: round2(layerUnitPrice * metrics.layerArea / 10000), note: '独栋2400/双拼三拼2300加权' },
      { code: '3-4-4', name: '产业大厦', unit: '元/m²', unitPrice: round2(towerUnitPrice), quantity: metrics.towerArea, cost: round2(towerUnitPrice * metrics.towerArea / 10000), note: '按高度分档' }
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
  const RENT_PRIORITY = ['产业大厦', '分层厂房', '分栋厂房', '轻钢厂房', '配套宿舍'];

  function allocateAreaByPriority(targetArea, products, priority, getArea) {
    const allocation = {};
    let remaining = targetArea;
    priority.forEach(type => {
      const p = products.find(x => x.type === type);
      if (!p || remaining <= 0) return;
      const available = getArea(p);
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

    // 面积分配
    const saleableCapArea = round2(totalCap * Math.max(0, 1 - ancillaryRatio - rdRatio) * saleRatio);
    const rentableArea = round2(Math.max(0, aboveGroundArea - saleableCapArea - supportArea));

    // 销售分配
    const saleAlloc = allocateAreaByPriority(saleableCapArea, products, SALE_PRIORITY, p => p.totalArea || 0);
    const soldAreaByType = saleAlloc.allocation;
    const soldAreaTotal = round2(Object.values(soldAreaByType).reduce((s, v) => s + v, 0));

    // 出租分配（从产品剩余面积中分配）
    const remainingAreaByType = {};
    products.forEach(p => {
      remainingAreaByType[p.type] = Math.max(0, (p.totalArea || 0) - (soldAreaByType[p.type] || 0));
    });
    const rentAlloc = allocateAreaByPriority(rentableArea, products, RENT_PRIORITY, p => remainingAreaByType[p.type] || 0);
    const rentedAreaByType = rentAlloc.allocation;
    const rentedAreaTotal = round2(Object.values(rentedAreaByType).reduce((s, v) => s + v, 0));

    // 加权平均售价/租金
    let weightedSalePrice = 0;
    let weightedRent = 0;
    if (soldAreaTotal > 0) {
      weightedSalePrice = SALE_PRIORITY.reduce((s, type) => s + (soldAreaByType[type] || 0) * (priceMap[type] || 0), 0) / soldAreaTotal;
    }
    if (rentedAreaTotal > 0) {
      weightedRent = RENT_PRIORITY.reduce((s, type) => s + (rentedAreaByType[type] || 0) * (rentMap[type] || 0), 0) / rentedAreaTotal;
    }
    weightedSalePrice = round2(weightedSalePrice);
    weightedRent = round2(weightedRent);

    // 销售测算
    const saleRevenue = round2(soldAreaTotal * weightedSalePrice);
    const landCostPerArea = inv.landCost ? round2(inv.landCost.total * 10000 / aboveGroundArea) : 0;
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
    const rentDetails = RENT_PRIORITY.map(type => {
      const area = rentedAreaByType[type] || 0;
      const rent = rentMap[type] || 0;
      return { type, area: round2(area), rent: round2(rent), annualRevenue: round2(area * rent * 365 * occupancyRate / 10000) };
    });

    // 综合汇总
    const totalInvestment = inv.summary ? inv.summary.totalInvestment : 0;
    const fundingGap = round2(totalInvestment - saleNetProfit);
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
        rentGrowthRate: rentGrowthRate * 100
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

  function addItems(ws, startRow, items, costCol, quantityCol, unitCol) {
    items.forEach((it, idx) => {
      const r = startRow + idx;
      ws[encode(r, 0)] = textCell(it.code || '', '  ');
      ws[encode(r, 1)] = textCell(it.name, '  ');
      ws[encode(r, 2)] = textCell(it.unit || '');
      ws[encode(r, 3)] = numCell(it.unitPrice);
      ws[encode(r, 4)] = numCell(it.quantity);
      const unit = it.unit || '';
      const hasDivide = unit.includes('元/m²') || unit.includes('元/m') || unit.includes('元/KVA');
      const formula = hasDivide ? `=${col(3)}${r + 1}*${col(4)}${r + 1}/10000` : `=${col(3)}${r + 1}*${col(4)}${r + 1}`;
      ws[encode(r, costCol)] = moneyCell(it.cost, formula);
      ws[encode(r, costCol + 1)] = numCell(round2(it.cost * 10000 / (ws._totalBuildingArea || 1)), `=${col(costCol)}${r + 1}/${ws._totalBuildingAreaRef}*10000`);
      ws[encode(r, costCol + 2)] = numCell(round2(it.cost * 10000 / (ws._aboveGroundArea || 1)), `=${col(costCol)}${r + 1}/${ws._aboveGroundAreaRef}*10000`);
      ws[encode(r, costCol + 3)] = textCell(it.note || '');
    });
    return startRow + items.length;
  }

  NS.downloadInvestmentEstimateExcel = function (fullEstimate, fileName) {
    if (typeof XLSX === 'undefined') { alert('Excel 导出库未加载，请检查网络。'); return; }
    const wb = XLSX.utils.book_new();

    // Sheet1：完整版
    const ws = {};
    const cols = [10, 24, 14, 14, 16, 16, 16, 18, 28];
    const totalBuildingArea = fullEstimate.metrics.totalBuildingArea || 1;
    const aboveGroundArea = fullEstimate.metrics.aboveGroundArea || 1;
    ws._totalBuildingArea = totalBuildingArea;
    ws._aboveGroundArea = aboveGroundArea;
    ws._totalBuildingAreaRef = totalBuildingArea;
    ws._aboveGroundAreaRef = aboveGroundArea;

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
    ws[encode(row, 5)] = subtotalCell(fullEstimate.landCost.total, `=SUM(${col(5)}${landStart + 1}:${col(5)}${row})`);
    row += 1;

    // 二、前期费用
    ws[encode(row, 0)] = textCell('二');
    ws[encode(row, 1)] = subtotalCell('前期费用');
    for (let c = 2; c <= 8; c++) ws[encode(row, c)] = cell('', { fill: STYLE.subtotalFill });
    const prelimStart = row + 1;
    row = addItems(ws, prelimStart, fullEstimate.preliminary.items, 5, 4, 3);
    ws[encode(row, 1)] = subtotalCell('  小计');
    ws[encode(row, 5)] = subtotalCell(fullEstimate.preliminary.total, `=SUM(${col(5)}${prelimStart + 1}:${col(5)}${row})`);
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
    ws[encode(row, 5)] = subtotalCell(fullEstimate.infrastructure.total, `=SUM(${col(5)}${infraStart + 1}:${col(5)}${row})`);
    row += 1;

    // 3.2 景观工程
    ws[encode(row, 1)] = subtotalCell('  3.2 景观工程');
    for (let c = 2; c <= 8; c++) ws[encode(row, c)] = cell('', { fill: STYLE.subtotalFill });
    const landStart2 = row + 1;
    row = addItems(ws, landStart2, fullEstimate.landscape.items, 5, 4, 3);
    ws[encode(row, 1)] = subtotalCell('    小计');
    ws[encode(row, 5)] = subtotalCell(fullEstimate.landscape.total, `=SUM(${col(5)}${landStart2 + 1}:${col(5)}${row})`);
    row += 1;

    // 3.3 公建配套
    ws[encode(row, 1)] = subtotalCell('  3.3 公建配套');
    for (let c = 2; c <= 8; c++) ws[encode(row, c)] = cell('', { fill: STYLE.subtotalFill });
    const pubStart = row + 1;
    row = addItems(ws, pubStart, fullEstimate.publicFacility.items, 5, 4, 3);
    ws[encode(row, 1)] = subtotalCell('    小计');
    ws[encode(row, 5)] = subtotalCell(fullEstimate.publicFacility.total, `=SUM(${col(5)}${pubStart + 1}:${col(5)}${row})`);
    row += 1;

    // 3.4 单体建安成本
    ws[encode(row, 1)] = subtotalCell('  3.4 单体建安成本');
    for (let c = 2; c <= 8; c++) ws[encode(row, c)] = cell('', { fill: STYLE.subtotalFill });
    const buildStart = row + 1;
    row = addItems(ws, buildStart, fullEstimate.building.items, 5, 4, 3);
    ws[encode(row, 1)] = subtotalCell('    小计');
    ws[encode(row, 5)] = subtotalCell(fullEstimate.building.total, `=SUM(${col(5)}${buildStart + 1}:${col(5)}${row})`);
    row += 1;

    // 不可预见费 + 增值税
    ws[encode(row, 1)] = textCell('  不可预见费', '  ');
    ws[encode(row, 5)] = moneyCell(fullEstimate.construction.contingency);
    row += 1;
    ws[encode(row, 1)] = textCell('  其中增值税', '  ');
    ws[encode(row, 5)] = moneyCell(fullEstimate.construction.vat);
    row += 1;
    ws[encode(row, 1)] = subtotalCell('  建安工程成本合计');
    ws[encode(row, 5)] = subtotalCell(fullEstimate.construction.total);
    row += 1;

    // 四~七
    const categories = [
      { code: '四', name: '开发间接费', cost: fullEstimate.indirect.cost },
      { code: '五', name: '营销费用', cost: fullEstimate.marketing.cost },
      { code: '六', name: '公司管理费', cost: fullEstimate.management.cost },
      { code: '七', name: '财务费用', cost: fullEstimate.financial.total }
    ];
    categories.forEach(cat => {
      ws[encode(row, 0)] = textCell(cat.code);
      ws[encode(row, 1)] = subtotalCell(cat.name);
      for (let c = 2; c <= 8; c++) ws[encode(row, c)] = cell('', { fill: STYLE.subtotalFill });
      ws[encode(row, 5)] = subtotalCell(cat.cost);
      row += 1;
    });

    // 发展成本合计
    ws[encode(row, 0)] = textCell('合计');
    ws[encode(row, 1)] = totalCell('发展成本合计');
    for (let c = 2; c <= 8; c++) ws[encode(row, c)] = cell('', { fill: STYLE.totalFill });
    ws[encode(row, 5)] = totalCell(fullEstimate.summary.totalInvestment);
    row += 1;

    ws[encode(row, 1)] = textCell('单位建面成本（元/㎡）');
    ws[encode(row, 5)] = moneyCell(fullEstimate.summary.unitGroundCost, `=${col(5)}${row}/${totalBuildingArea}*10000`);
    row += 1;
    ws[encode(row, 1)] = textCell('单位地上建面成本（元/㎡）');
    ws[encode(row, 5)] = moneyCell(fullEstimate.summary.unitAboveGroundCost, `=${col(5)}${row - 1}/${aboveGroundArea}*10000`);

    ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: row, c: 8 } });
    setWsMeta(ws, cols);
    XLSX.utils.book_append_sheet(wb, ws, '投资估算完整版');

    // Sheet2：简化版
    const ws2 = {};
    ws2[encode(0, 0)] = cell('投资估算表（简化版）', { bold: true, sz: 14 });
    ws2['!merge'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 3 } }];
    ['科目编码', '成本科目', '金额（万元）', '占比'].forEach((h, c) => ws2[encode(1, c)] = headerCell(h));
    const simple = NS.simplifyInvestmentEstimate(fullEstimate);
    simple.forEach((it, idx) => {
      const r = idx + 2;
      const isTotal = it.code === '合计';
      ws2[encode(r, 0)] = isTotal ? totalCell(it.code) : textCell(it.code);
      ws2[encode(r, 1)] = isTotal ? totalCell(it.category) : textCell(it.category);
      ws2[encode(r, 2)] = isTotal ? totalCell(it.amount) : moneyCell(it.amount);
      ws2[encode(r, 3)] = isTotal ? totalCell('100%') : cell(round2(it.amount / fullEstimate.summary.totalInvestment * 100) + '%', { align: 'right' });
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
      return costStart + costRows.length + 1;
    }

    // Sheet1：销售测算
    const ws1 = {};
    ws1['!merge'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 3 } }];
    ws1[encode(0, 0)] = cell('销售测算', { bold: true, sz: 14 });
    let row1 = addPlanningAndCost(ws1, 1);
    ws1[encode(row1, 0)] = cell('三、销售测算', { bold: true, sz: 12 });
    ws1['!merge'].push({ s: { r: row1, c: 0 }, e: { r: row1, c: 3 } });
    ['项目', '数值', '单位', '说明'].forEach((h, c) => ws1[encode(row1 + 1, c)] = headerCell(h));
    const saleRows = [
      ['可售面积', staticResult.metrics.soldAreaTotal, 'm²', ''],
      ['加权平均售价', staticResult.sale.weightedPrice, '万元/㎡', ''],
      ['不含税售价', round2(staticResult.sale.weightedPrice / 1.09), '万元/㎡', '售价/1.09'],
      ['销售收入', staticResult.sale.totalRevenue, '万元', '可售面积×加权平均售价'],
      ['减：土地成本', staticResult.sale.landCost, '万元', ''],
      ['减：建安成本', staticResult.sale.constructionCost, '万元', ''],
      ['减：税金及附加', staticResult.sale.taxSurcharge, '万元', ''],
      ['减：营销费用', staticResult.sale.marketingCost, '万元', ''],
      ['减：管理费用', staticResult.sale.managementCost, '万元', ''],
      ['减：财务费用', staticResult.sale.financialCost, '万元', ''],
      ['利润总额', staticResult.sale.profit, '万元', ''],
      ['减：所得税', staticResult.sale.incomeTax, '万元', ''],
      ['净利润', staticResult.sale.netProfit, '万元', ''],
      ['销售净利率', staticResult.sale.netMargin, '%', '']
    ];
    saleRows.forEach((row, idx) => {
      const r = row1 + 2 + idx;
      const isTotal = row[0] === '净利润';
      ws1[encode(r, 0)] = isTotal ? totalCell(row[0]) : textCell(row[0]);
      ws1[encode(r, 1)] = isTotal ? totalCell(row[1]) : moneyCell(row[1]);
      ws1[encode(r, 2)] = textCell(row[2]);
      ws1[encode(r, 3)] = textCell(row[3]);
    });
    ws1['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: row1 + saleRows.length + 1, c: 3 } });
    setWsMeta(ws1, [22, 16, 12, 24]);
    XLSX.utils.book_append_sheet(wb, ws1, '销售测算');

    // Sheet2：租赁测算
    const ws2 = {};
    ws2['!merge'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 3 } }];
    ws2[encode(0, 0)] = cell('租赁测算', { bold: true, sz: 14 });
    let row2 = addPlanningAndCost(ws2, 1);
    ws2[encode(row2, 0)] = cell('三、租赁测算', { bold: true, sz: 12 });
    ws2['!merge'].push({ s: { r: row2, c: 0 }, e: { r: row2, c: 3 } });
    ['项目', '数值', '单位', '说明'].forEach((h, c) => ws2[encode(row2 + 1, c)] = headerCell(h));
    const rentRows = [
      ['可租面积', staticResult.metrics.rentedAreaTotal, 'm²', ''],
      ['加权平均租金', staticResult.rent.weightedRent, '元/天/㎡', ''],
      ['月租金', staticResult.rent.monthlyRent, '元/月/㎡', '日租金×30'],
      ['年租金收入', staticResult.rent.yearlyRent, '元/年/㎡', '月租金×12'],
      ['出租率', staticResult.rent.occupancyRate, '%', ''],
      ['有效年租金', staticResult.rent.effectiveYearlyRent, '元/年/㎡', '年租金×出租率'],
      ['减：税金及附加', staticResult.rent.taxSurcharge, '元/年/㎡', '有效年租金×0.6%'],
      ['减：房产税', staticResult.rent.propertyTax, '元/年/㎡', '有效年租金×12%'],
      ['减：土地使用税', staticResult.rent.landUseTax, '元/㎡/年', '固定6'],
      ['减：运营费用', staticResult.rent.rentalOpCost, '元/年/㎡', '有效年租金×运营费用率'],
      ['净租赁收入', staticResult.rent.netRentPerSqm, '元/年/㎡', ''],
      ['净租赁收入总额', staticResult.rent.netRentalIncome, '万元/年', '净租赁收入×可租面积/10000'],
      ['租赁总投', staticResult.rent.rentalTotalInvestment, '万元', '可租面积×综合单方成本/10000'],
      ['NOI', staticResult.rent.noi, '%', '净租赁收入总额÷租赁总投']
    ];
    rentRows.forEach((row, idx) => {
      const r = row2 + 2 + idx;
      const isKey = row[0] === '净租赁收入' || row[0] === 'NOI';
      ws2[encode(r, 0)] = isKey ? totalCell(row[0]) : textCell(row[0]);
      ws2[encode(r, 1)] = isKey ? totalCell(row[1]) : moneyCell(row[1]);
      ws2[encode(r, 2)] = textCell(row[2]);
      ws2[encode(r, 3)] = textCell(row[3]);
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
      const r = idx + 3;
      ws3[encode(r, 0)] = textCell(it.type);
      ws3[encode(r, 1)] = numCell(it.area);
      ws3[encode(r, 2)] = numCell(it.price);
      ws3[encode(r, 3)] = moneyCell(it.revenue, `=B${r + 1}*C${r + 1}`);
      ws3[encode(r, 4)] = numCell(staticResult.sale.weightedPrice);
    });
    const saleTotalRow = staticResult.sale.details.length + 3;
    ws3[encode(saleTotalRow, 0)] = totalCell('合计');
    ws3[encode(saleTotalRow, 1)] = totalCell(staticResult.metrics.soldAreaTotal, `=SUM(B4:B${saleTotalRow})`);
    ws3[encode(saleTotalRow, 2)] = totalCell('—');
    ws3[encode(saleTotalRow, 3)] = totalCell(staticResult.sale.totalRevenue, `=SUM(D4:D${saleTotalRow})`);
    ws3[encode(saleTotalRow, 4)] = totalCell(staticResult.sale.weightedPrice);

    const rentStart = saleTotalRow + 2;
    ws3[encode(rentStart, 0)] = cell('二、租赁面积分配', { bold: true, sz: 12 });
    ws3['!merge'].push({ s: { r: rentStart, c: 0 }, e: { r: rentStart, c: 5 } });
    ['产品类型', '可租面积（㎡）', '租金（元/天/㎡）', '年租金收入（万元）', '加权平均租金', '']
      .forEach((h, c) => ws3[encode(rentStart + 1, c)] = headerCell(h));
    staticResult.rent.details.forEach((it, idx) => {
      const r = rentStart + 2 + idx;
      ws3[encode(r, 0)] = textCell(it.type);
      ws3[encode(r, 1)] = numCell(it.area);
      ws3[encode(r, 2)] = numCell(it.rent);
      ws3[encode(r, 3)] = moneyCell(it.annualRevenue, `=B${r + 1}*C${r + 1}*365*${staticResult.inputs.occupancyRate / 100}/10000`);
      ws3[encode(r, 4)] = numCell(staticResult.rent.weightedRent);
    });
    const rentTotalRow = rentStart + 2 + staticResult.rent.details.length;
    ws3[encode(rentTotalRow, 0)] = totalCell('合计');
    ws3[encode(rentTotalRow, 1)] = totalCell(staticResult.metrics.rentedAreaTotal, `=SUM(B${rentStart + 3}:B${rentTotalRow})`);
    ws3[encode(rentTotalRow, 2)] = totalCell('—');
    ws3[encode(rentTotalRow, 3)] = totalCell(staticResult.rent.netRentalIncome); // 近似
    ws3[encode(rentTotalRow, 4)] = totalCell(staticResult.rent.weightedRent);

    ws3['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: rentTotalRow, c: 5 } });
    setWsMeta(ws3, [16, 16, 16, 18, 16, 4]);
    XLSX.utils.book_append_sheet(wb, ws3, '租售面积分配');

    // Sheet4：综合汇总
    const ws4 = {};
    ws4[encode(0, 0)] = cell('综合汇总指标', { bold: true, sz: 14 });
    ws4['!merge'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 2 } }];
    ['指标', '数值', '单位'].forEach((h, c) => ws4[encode(1, c)] = headerCell(h));
    const summaryRows = [
      ['总投资', staticResult.summary.totalInvestment, '万元'],
      ['销售净利润', staticResult.summary.saleNetProfit, '万元'],
      ['租赁年净收入', staticResult.summary.netRentalIncome, '万元/年'],
      ['资金缺口', staticResult.summary.fundingGap, '万元'],
      ['销售净利润覆盖租赁总投比例', staticResult.summary.saleProfitCoverRatio, '%'],
      ['销售净利率', staticResult.summary.saleNetMargin, '%'],
      ['租赁 NOI', staticResult.summary.noi, '%'],
      ['总投资收益率', staticResult.summary.totalInvestmentReturn, '%'],
      ['静态投资回收期', staticResult.summary.paybackPeriod, '年']
    ];
    summaryRows.forEach((row, idx) => {
      const r = idx + 2;
      ws4[encode(r, 0)] = textCell(row[0]);
      ws4[encode(r, 1)] = moneyCell(row[1]);
      ws4[encode(r, 2)] = textCell(row[2]);
    });
    ws4['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: summaryRows.length + 1, c: 2 } });
    setWsMeta(ws4, [28, 16, 12]);
    XLSX.utils.book_append_sheet(wb, ws4, '综合汇总');

    XLSX.writeFile(wb, fileName || '静态投资分析表.xlsx');
  };

})(window);
