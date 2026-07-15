/**
 * financial-modules.js
 * 投资估算、静态投资分析、动态投资分析模块
 *
 * 说明：
 * 1. 本模块以 window.configResult（产品配置结果）和 projectData（规划指标）为输入；
 * 2. 投资估算为源头，先生成完整版，再反推简化版；
 * 3. 表格输出单位为「万元」，建筑面积单位为「m²」。
 */

(function (global) {
  'use strict';

  const NS = {};
  global.FinancialModules = NS;

  // ==================== 工具函数 ====================
  function fmtNum(n, d = 2) {
    if (n == null || isNaN(n)) return '—';
    return Number(n).toFixed(d);
  }
  function fmtInt(n) {
    if (n == null || isNaN(n)) return '—';
    return Math.round(n).toLocaleString('zh-CN');
  }
  function safeNum(v, def) {
    const n = parseFloat(v);
    return isNaN(n) ? (def == null ? 0 : def) : n;
  }
  NS.safeNum = safeNum;
  function muFromArea(m2) {
    return m2 / 666.7;
  }

  // ==================== 参考单价（万元/m² 或 万元/单位） ====================
  // 注：以下景观、前期、基础设施、红线外市政等单价为占位默认值，后续需按参考表格校准。
  const REFERENCE_PRICES = {
    // 前期费用（元/m²）
    preliminary: {
      survey: 0.0035,            // 勘察费，按用地面积
      planning: 0.0045,          // 规划设计费
      consulting: 0.0025,        // 工程咨询费
      review: 0.0015,            // 施工图审查费
      supervision: 0.0060,       // 监理费
      testing: 0.0010,           // 检测费
      bidding: 0.0008,           // 招标代理费
      other: 0.0012              // 其他前期费
    },
    // 基础设施费（元/m²，除道路外按地上总建筑面积）
    infrastructure: {
      siteLeveling: 0.0020,
      retainingWall: 0.0015,
      outdoorDrainage: 0.0060,
      outdoorWaterSupply: 0.0040,
      outdoorElectrical: 0.0080,
      outdoorFire: 0.0030,
      outdoorGas: 0.0020,
      outdoorCommunication: 0.0015,
      road: 0.0250               // 小区车行道路，按道路面积
    },
    // 景观工程（元/m² 或 万元/单位）
    landscape: {
      demoLandscape: 0.06,       // 示范区景观，按 m²
      hardPavement: 0.045,       // 硬质铺装
      nonDemoLandscape: 0.035,   // 非示范区景观
      entrance: 15.0,            // 出入口，万元/个
      garageEntrance: 0.0040,    // 地库出入口
      stoneSteps: 0.0035,        // 室外石材台阶及散水
      signs: 0.0015,             // 标示标牌
      wall: 0.0018,              // 围墙，按 m
      spongeCity: 0.012,         // 海绵城市
      landscapeGate: 0.0020      // 景观门头
    },
    // 红线外市政工程费
    offsiteMunicipal: {
      powerCapacity: 0.030,      // 电力增容费/高可靠性用电，元/（kVA 估算）
      waterDrainageConnection: 0.0005 // 红线外给水、排水接驳费，元/m² 用地
    },
    // 大市政配套费默认（上海为 0，其他地区占位）
    municipalFeeDefault: 0.0080  // 元/m² 用地
  };

  // ==================== 获取产品配置后的汇总指标 ====================
  function getProductMetrics(result) {
    const products = result && result.products ? result.products : [];
    const metrics = {
      lightSteelArea: 0,    // 轻钢建筑面积（非计容）
      splitArea: 0,         // 分栋总建筑面积
      layerArea: 0,         // 分层总建筑面积
      towerArea: 0,         // 产业大厦总建筑面积
      towerHeight: 0,       // 产业大厦高度
      dormArea: 0,          // 配套宿舍面积
      supportArea: 0,       // 配套楼面积
      splitSingleArea: 0,   // 分栋独栋面积
      splitDuplexArea: 0,   // 分栋双拼面积
      layerSingleArea: 0,   // 分层独栋面积
      layerMultiArea: 0,    // 分层双拼/三拼面积
      aboveGroundArea: 0,   // 地上总建筑面积
      undergroundArea: 0,   // 地下建筑面积
      totalArea: 0,         // 总建筑面积
      totalCap: 0           // 总计容面积
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
    metrics.totalArea = result.totalArea || 0;
    // 地下建筑面积来自 projectData
    return metrics;
  }

  // ==================== 投资估算计算 ====================
  NS.calculateInvestmentEstimate = function (inputs, result, projectData) {
    inputs = inputs || {};
    const metrics = getProductMetrics(result);
    const pd = projectData || {};
    const calc = pd.calculated || {};

    const landArea = safeNum(pd.landArea, 0);        // m²
    const acre = muFromArea(landArea);               // 亩
    const aboveGroundArea = metrics.aboveGroundArea; // m²
    const undergroundArea = safeNum(calc.undergroundArea, 0);
    const totalBuildingArea = aboveGroundArea + undergroundArea;
    const greenRate = safeNum(pd.greenRate, 0.1);
    const buildingDensity = safeNum(calc.buildingDensity, 0);
    const roadRatio = 0.30;                          // 默认道路占比 30%
    const roadArea = landArea * roadRatio;
    const wallLength = Math.sqrt(Math.max(landArea, 0)) * 4 * 1.2;

    // 用户输入
    const landPrice = safeNum(inputs.landPrice, 0);           // 万元/亩
    const municipalFee = safeNum(inputs.municipalFee, null);  // 元/m² 用地，null 表示按城市默认
    const city = (inputs.city || pd.region || '').trim();
    const spongeCity = inputs.spongeCity != null ? !!inputs.spongeCity : (city === '上海' || city === '杭州');
    const financingRatio = safeNum(inputs.financingRatio, 0.6);
    const financingRate = safeNum(inputs.financingRate, 0.05);
    const interestYears = safeNum(inputs.interestYears, 2);

    // 1. 土地配套费用
    const landTransferFee = landPrice * acre; // 万元
    // 契税：按土地出让金的 3% + 10 万元杂税
    const deedTax = landTransferFee * 0.03 + 10;
    // 大市政配套费
    const effectiveMunicipalFee = municipalFee != null ? municipalFee : (city === '上海' ? 0 : REFERENCE_PRICES.municipalFeeDefault);
    const municipalSupportingFee = effectiveMunicipalFee * landArea / 10000; // 万元
    // 红线外市政
    const powerKva = (aboveGroundArea * 70 + undergroundArea * 50) / 1000;
    const powerCapacityCost = REFERENCE_PRICES.offsiteMunicipal.powerCapacity * powerKva / 10000;
    const waterDrainageCost = REFERENCE_PRICES.offsiteMunicipal.waterDrainageConnection * landArea / 10000;

    const landCostItems = [
      { name: '土地出让金', unit: '万元/亩', quantity: acre, unitPrice: landPrice, cost: landTransferFee },
      { name: '土地转让费（契税）', unit: '万元', quantity: 1, unitPrice: deedTax, cost: deedTax },
      { name: '大市政配套费', unit: '元/m²', quantity: landArea, unitPrice: effectiveMunicipalFee, cost: municipalSupportingFee },
      { name: '电力增容费/高可靠性用电', unit: '万元', quantity: 1, unitPrice: powerCapacityCost, cost: powerCapacityCost },
      { name: '红线外给水、排水接驳费', unit: '万元', quantity: 1, unitPrice: waterDrainageCost, cost: waterDrainageCost }
    ];
    const landCostTotal = landCostItems.reduce((s, it) => s + it.cost, 0);

    // 2. 前期费用
    const prelim = REFERENCE_PRICES.preliminary;
    const prelimItems = [
      { name: '勘察费', unit: '元/m²', quantity: landArea, unitPrice: prelim.survey, cost: prelim.survey * landArea / 10000 },
      { name: '规划设计费', unit: '元/m²', quantity: aboveGroundArea, unitPrice: prelim.planning, cost: prelim.planning * aboveGroundArea / 10000 },
      { name: '工程咨询费', unit: '元/m²', quantity: aboveGroundArea, unitPrice: prelim.consulting, cost: prelim.consulting * aboveGroundArea / 10000 },
      { name: '施工图审查费', unit: '元/m²', quantity: aboveGroundArea, unitPrice: prelim.review, cost: prelim.review * aboveGroundArea / 10000 },
      { name: '监理费', unit: '元/m²', quantity: aboveGroundArea, unitPrice: prelim.supervision, cost: prelim.supervision * aboveGroundArea / 10000 },
      { name: '检测费', unit: '元/m²', quantity: aboveGroundArea, unitPrice: prelim.testing, cost: prelim.testing * aboveGroundArea / 10000 },
      { name: '招标代理费', unit: '元/m²', quantity: aboveGroundArea, unitPrice: prelim.bidding, cost: prelim.bidding * aboveGroundArea / 10000 },
      { name: '其他前期费', unit: '元/m²', quantity: aboveGroundArea, unitPrice: prelim.other, cost: prelim.other * aboveGroundArea / 10000 }
    ];
    const prelimTotal = prelimItems.reduce((s, it) => s + it.cost, 0);

    // 3. 建安工程成本
    // 3.1 基础设施费
    const infra = REFERENCE_PRICES.infrastructure;
    const infraItems = [
      { name: '场地平整', unit: '元/m²', quantity: aboveGroundArea, unitPrice: infra.siteLeveling, cost: infra.siteLeveling * aboveGroundArea / 10000 },
      { name: '挡土墙', unit: '元/m²', quantity: aboveGroundArea, unitPrice: infra.retainingWall, cost: infra.retainingWall * aboveGroundArea / 10000 },
      { name: '室外排水工程', unit: '元/m²', quantity: aboveGroundArea, unitPrice: infra.outdoorDrainage, cost: infra.outdoorDrainage * aboveGroundArea / 10000 },
      { name: '室外给水工程', unit: '元/m²', quantity: aboveGroundArea, unitPrice: infra.outdoorWaterSupply, cost: infra.outdoorWaterSupply * aboveGroundArea / 10000 },
      { name: '室外电气工程', unit: '元/m²', quantity: aboveGroundArea, unitPrice: infra.outdoorElectrical, cost: infra.outdoorElectrical * aboveGroundArea / 10000 },
      { name: '室外消防工程', unit: '元/m²', quantity: aboveGroundArea, unitPrice: infra.outdoorFire, cost: infra.outdoorFire * aboveGroundArea / 10000 },
      { name: '室外燃气工程', unit: '元/m²', quantity: aboveGroundArea, unitPrice: infra.outdoorGas, cost: infra.outdoorGas * aboveGroundArea / 10000 },
      { name: '室外通讯工程', unit: '元/m²', quantity: aboveGroundArea, unitPrice: infra.outdoorCommunication, cost: infra.outdoorCommunication * aboveGroundArea / 10000 },
      { name: '小区车行道路', unit: '元/m²', quantity: roadArea, unitPrice: infra.road, cost: infra.road * roadArea / 10000 }
    ];
    const infraTotal = infraItems.reduce((s, it) => s + it.cost, 0);

    // 3.2 景观工程
    const land = REFERENCE_PRICES.landscape;
    const hardPavementArea = landArea * Math.max(0, 1 - greenRate - roadRatio - buildingDensity);
    const nonDemoLandscapeArea = Math.max(0, landArea * greenRate - 1000);
    const entranceCount = Math.min(4, Math.max(2, Math.ceil(landArea / 20000)));
    const spongeCityArea = spongeCity ? (landArea * greenRate + hardPavementArea) : 0;

    const landscapeItems = [
      { name: '示范区景观', unit: '元/m²', quantity: 1000, unitPrice: land.demoLandscape, cost: land.demoLandscape * 1000 / 10000 },
      { name: '硬质铺装', unit: '元/m²', quantity: hardPavementArea, unitPrice: land.hardPavement, cost: land.hardPavement * hardPavementArea / 10000 },
      { name: '非示范区景观', unit: '元/m²', quantity: nonDemoLandscapeArea, unitPrice: land.nonDemoLandscape, cost: land.nonDemoLandscape * nonDemoLandscapeArea / 10000 },
      { name: '出入口', unit: '万元/个', quantity: entranceCount, unitPrice: land.entrance, cost: land.entrance * entranceCount },
      { name: '地库出入口', unit: '元/m²', quantity: aboveGroundArea, unitPrice: land.garageEntrance, cost: land.garageEntrance * aboveGroundArea / 10000 },
      { name: '室外石材台阶及散水', unit: '元/m²', quantity: aboveGroundArea, unitPrice: land.stoneSteps, cost: land.stoneSteps * aboveGroundArea / 10000 },
      { name: '标示标牌', unit: '元/m²', quantity: aboveGroundArea, unitPrice: land.signs, cost: land.signs * aboveGroundArea / 10000 },
      { name: '围墙', unit: '元/m', quantity: wallLength, unitPrice: land.wall, cost: land.wall * wallLength / 10000 },
      { name: '海绵城市', unit: '元/m²', quantity: spongeCityArea, unitPrice: land.spongeCity, cost: land.spongeCity * spongeCityArea / 10000 }
    ];
    const landscapeTotal = landscapeItems.reduce((s, it) => s + it.cost, 0);

    // 3.3 公建配套
    const publicFacilityItems = [
      { name: '地下室', unit: '元/m²', quantity: undergroundArea, unitPrice: 3700, cost: 3700 * undergroundArea / 10000 },
      { name: '配套楼', unit: '元/m²', quantity: metrics.supportArea, unitPrice: 2200, cost: 2200 * metrics.supportArea / 10000 },
      { name: '配套宿舍', unit: '元/m²', quantity: metrics.dormArea, unitPrice: 2600, cost: 2600 * metrics.dormArea / 10000 }
    ];
    const publicFacilityTotal = publicFacilityItems.reduce((s, it) => s + it.cost, 0);

    // 3.4 单体建安成本
    // 分栋加权单价
    let splitUnitPrice = 0;
    if (metrics.splitArea > 0) {
      splitUnitPrice = (metrics.splitSingleArea * 2300 + metrics.splitDuplexArea * 2200) / metrics.splitArea;
    }
    // 分层加权单价
    let layerUnitPrice = 0;
    if (metrics.layerArea > 0) {
      layerUnitPrice = (metrics.layerSingleArea * 2400 + metrics.layerMultiArea * 2300) / metrics.layerArea;
    }
    // 产业大厦单价按高度
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
      { name: '轻钢厂房', unit: '元/m²', quantity: metrics.lightSteelArea, unitPrice: 1500, cost: 1500 * metrics.lightSteelArea / 10000 },
      { name: '分栋厂房', unit: '元/m²', quantity: metrics.splitArea, unitPrice: splitUnitPrice, cost: splitUnitPrice * metrics.splitArea / 10000 },
      { name: '分层厂房', unit: '元/m²', quantity: metrics.layerArea, unitPrice: layerUnitPrice, cost: layerUnitPrice * metrics.layerArea / 10000 },
      { name: '产业大厦', unit: '元/m²', quantity: metrics.towerArea, unitPrice: towerUnitPrice, cost: towerUnitPrice * metrics.towerArea / 10000 }
    ];
    const buildingTotal = buildingItems.reduce((s, it) => s + it.cost, 0);

    const constructionTotal = infraTotal + landscapeTotal + publicFacilityTotal + buildingTotal;

    // 4. 开发间接费、营销费、公司管理费、财务费用
    const landAndDevelopCost = landCostTotal + prelimTotal + constructionTotal;
    const financingAmount = landAndDevelopCost * financingRatio;
    const interestExpense = financingAmount > 0 ? financingAmount * financingRate * interestYears : 0;
    const bankFee = interestExpense > 0 ? 30 : 0; // 万元

    const indirectItems = [
      { name: '开发间接费', cost: 0 },
      { name: '营销费', cost: 0 },
      { name: '公司管理费', cost: 0 },
      { name: '财务费用-银行费用支出', cost: bankFee },
      { name: '财务费用-利息支出', cost: interestExpense }
    ];
    const indirectTotal = indirectItems.reduce((s, it) => s + it.cost, 0);

    // 汇总
    const totalInvestment = landCostTotal + prelimTotal + constructionTotal + indirectTotal;
    const unitGroundCost = aboveGroundArea > 0 ? totalInvestment * 10000 / aboveGroundArea : 0; // 元/m²
    const unitTotalAreaCost = totalBuildingArea > 0 ? totalInvestment * 10000 / totalBuildingArea : 0; // 元/m²

    return {
      // 基础参数
      inputs: {
        landPrice,
        municipalFee: effectiveMunicipalFee,
        city,
        spongeCity,
        financingRatio,
        financingRate,
        interestYears
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
      // 完整版明细
      landCost: { items: landCostItems, total: landCostTotal },
      preliminary: { items: prelimItems, total: prelimTotal },
      infrastructure: { items: infraItems, total: infraTotal },
      landscape: { items: landscapeItems, total: landscapeTotal },
      publicFacility: { items: publicFacilityItems, total: publicFacilityTotal },
      building: { items: buildingItems, total: buildingTotal },
      construction: { total: constructionTotal },
      indirect: { items: indirectItems, total: indirectTotal },
      summary: {
        totalInvestment,
        unitGroundCost,
        unitTotalAreaCost,
        landCostRatio: totalInvestment > 0 ? landCostTotal / totalInvestment : 0,
        constructionRatio: totalInvestment > 0 ? constructionTotal / totalInvestment : 0
      }
    };
  };

  // ==================== 生成简化版投资估算 ====================
  NS.simplifyInvestmentEstimate = function (full) {
    return [
      { category: '土地配套费用', amount: full.landCost.total },
      { category: '前期费用', amount: full.preliminary.total },
      { category: '建安工程成本', amount: full.construction.total },
      { category: '开发间接费、营销费、公司管理费、财务费用', amount: full.indirect.total },
      { category: '总投资估算', amount: full.summary.totalInvestment }
    ];
  };

  // ==================== 静态投资分析 ====================
  // 产品排序（用于销售/出租优先级）
  const SALE_PRIORITY = ['轻钢厂房', '分栋厂房', '分层厂房', '产业大厦'];
  const RENT_PRIORITY = ['产业大厦', '分层厂房', '分栋厂房', '轻钢厂房'];

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

    // 用户输入
    const saleRatio = safeNum(inputs.saleRatio, 0) / 100;
    const rentSplit = safeNum(inputs.rentSplit, 0);          // 元/天/m²
    const priceSplit = safeNum(inputs.priceSplit, 0);        // 万元/m²
    const rentLayer = inputs.rentLayer != null ? safeNum(inputs.rentLayer, rentSplit) : rentSplit;
    const priceLayer = inputs.priceLayer != null ? safeNum(inputs.priceLayer, priceSplit) : priceSplit;

    // 各类产品单价（万元/m² 与 元/天/m²）
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

    // 可售/可租面积
    const saleableCapArea = totalCap * Math.max(0, 1 - ancillaryRatio - rdRatio) * saleRatio;
    // 注：销售面积按建面口径分配，但上限不超过按计容口径计算出的 saleableCapArea
    const rentableArea = Math.max(0, aboveGroundArea - saleableCapArea - supportArea);

    // 按优先级分配销售面积（建面）
    const saleAlloc = allocateAreaByPriority(saleableCapArea, products, SALE_PRIORITY, p => p.totalArea || 0);
    const soldAreaByType = saleAlloc.allocation;
    const soldAreaTotal = Object.values(soldAreaByType).reduce((s, v) => s + v, 0);

    // 按优先级分配出租面积：从产品剩余面积中分配
    const remainingAreaByType = {};
    products.forEach(p => {
      remainingAreaByType[p.type] = Math.max(0, (p.totalArea || 0) - (soldAreaByType[p.type] || 0));
    });
    const rentAlloc = allocateAreaByPriority(rentableArea, products, RENT_PRIORITY, p => remainingAreaByType[p.type] || 0);
    const rentedAreaByType = rentAlloc.allocation;
    const rentedAreaTotal = Object.values(rentedAreaByType).reduce((s, v) => s + v, 0);

    // 销售收入
    let saleRevenue = 0;
    const saleDetails = [];
    SALE_PRIORITY.forEach(type => {
      const area = soldAreaByType[type] || 0;
      const price = priceMap[type] || 0;
      const revenue = area * price;
      saleRevenue += revenue;
      saleDetails.push({ type, area, price, revenue });
    });

    // 租赁收入（按年）
    let annualRentRevenue = 0;
    const rentDetails = [];
    RENT_PRIORITY.forEach(type => {
      const area = rentedAreaByType[type] || 0;
      const rent = rentMap[type] || 0;
      const annualRevenue = area * rent * 365 / 10000; // 万元/年
      annualRentRevenue += annualRevenue;
      rentDetails.push({ type, area, rent, annualRevenue });
    });

    // 成本与税费
    const totalInvestment = inv.summary ? inv.summary.totalInvestment : 0;
    const landCost = inv.landCost ? inv.landCost.total : 0;
    const constructionCost = inv.construction ? inv.construction.total : 0;

    // 增值税（简化：销售收入 / 1.09 * 0.09）
    const vatRate = 0.09;
    const saleVAT = saleRevenue > 0 ? saleRevenue / (1 + vatRate) * vatRate : 0;

    // 土地增值税（四级超率累进，简化模型）
    // 扣除项目 = 土地成本×1.2 + 建安成本 + (土地+建安)×10% + 增值税附加等
    const developmentExpenseRate = 0.10;
    const additionalDeductionRate = 0.20;
    const deductible = landCost * (1 + additionalDeductionRate) + constructionCost + (landCost + constructionCost) * developmentExpenseRate;
    const appreciation = Math.max(0, saleRevenue - saleVAT - deductible);
    const appreciationRate = deductible > 0 ? appreciation / deductible : 0;
    let lvatRate = 0, lvatQuick = 0;
    if (appreciationRate <= 0.5) { lvatRate = 0.30; lvatQuick = 0; }
    else if (appreciationRate <= 1.0) { lvatRate = 0.40; lvatQuick = 0.05; }
    else if (appreciationRate <= 2.0) { lvatRate = 0.50; lvatQuick = 0.15; }
    else { lvatRate = 0.60; lvatQuick = 0.35; }
    const landValueAddedTax = appreciation * lvatRate - deductible * lvatQuick;

    // 企业所得税（简化：按总利润 25%）
    const totalRevenue = saleRevenue + annualRentRevenue; // 静态首年简化
    const totalTax = saleVAT + landValueAddedTax;
    const taxableIncome = Math.max(0, totalRevenue - totalInvestment - totalTax);
    const incomeTax = taxableIncome * 0.25;

    // 静态指标
    const netProfit = totalRevenue - totalInvestment - totalTax - incomeTax;
    const grossMargin = totalRevenue > 0 ? netProfit / totalRevenue : 0;
    const investmentReturn = totalInvestment > 0 ? netProfit / totalInvestment : 0;

    return {
      inputs: { saleRatio: saleRatio * 100, rentSplit, priceSplit, rentLayer, priceLayer },
      metrics: {
        landArea: safeNum(pd.landArea, 0),
        far: safeNum(pd.far, 0),
        totalCap,
        aboveGroundArea,
        undergroundArea: safeNum((inv.metrics && inv.metrics.undergroundArea) || 0, 0),
        saleableCapArea,
        rentableArea,
        supportArea,
        soldAreaTotal,
        rentedAreaTotal
      },
      sale: { details: saleDetails, totalRevenue: saleRevenue },
      rent: { details: rentDetails, annualRevenue: annualRentRevenue },
      costs: { totalInvestment, landCost, constructionCost },
      taxes: { vat: saleVAT, landValueAddedTax, incomeTax, total: totalTax + incomeTax },
      indicators: {
        totalRevenue,
        netProfit,
        grossMargin,
        investmentReturn
      }
    };
  };

  // ==================== 动态投资分析（占位框架） ====================
  NS.calculateDynamicAnalysis = function (inputs, result, projectData, staticAnalysis) {
    // TODO: 实现动态分析完整逻辑
    return {
      status: 'placeholder',
      message: '动态投资分析逻辑开发中...'
    };
  };



  // ==================== Excel 导出工具 ====================
  NS.downloadInvestmentEstimateExcel = function (fullEstimate, fileName) {
    if (typeof XLSX === 'undefined') {
      alert('Excel 导出库未加载，请检查网络。');
      return;
    }
    const wb = XLSX.utils.book_new();

    // Sheet1：完整版投资估算
    const rows = [];
    rows.push(['投资项目', '单位', '工程量', '单价', '金额（万元）']);

    rows.push(['一、土地配套费用', '', '', '', fullEstimate.landCost.total]);
    fullEstimate.landCost.items.forEach(it => rows.push(['  ' + it.name, it.unit, fmtNum(it.quantity, 2), fmtNum(it.unitPrice, 4), fmtNum(it.cost, 2)]));

    rows.push(['二、前期费用', '', '', '', fullEstimate.preliminary.total]);
    fullEstimate.preliminary.items.forEach(it => rows.push(['  ' + it.name, it.unit, fmtNum(it.quantity, 2), fmtNum(it.unitPrice, 4), fmtNum(it.cost, 2)]));

    rows.push(['三、建安工程成本', '', '', '', fullEstimate.construction.total]);
    rows.push(['  3.1 基础设施费', '', '', '', fullEstimate.infrastructure.total]);
    fullEstimate.infrastructure.items.forEach(it => rows.push(['    ' + it.name, it.unit, fmtNum(it.quantity, 2), fmtNum(it.unitPrice, 4), fmtNum(it.cost, 2)]));
    rows.push(['  3.2 景观工程', '', '', '', fullEstimate.landscape.total]);
    fullEstimate.landscape.items.forEach(it => rows.push(['    ' + it.name, it.unit, fmtNum(it.quantity, 2), fmtNum(it.unitPrice, 4), fmtNum(it.cost, 2)]));
    rows.push(['  3.3 公建配套', '', '', '', fullEstimate.publicFacility.total]);
    fullEstimate.publicFacility.items.forEach(it => rows.push(['    ' + it.name, it.unit, fmtNum(it.quantity, 2), fmtNum(it.unitPrice, 4), fmtNum(it.cost, 2)]));
    rows.push(['  3.4 单体建安成本', '', '', '', fullEstimate.building.total]);
    fullEstimate.building.items.forEach(it => rows.push(['    ' + it.name, it.unit, fmtNum(it.quantity, 2), fmtNum(it.unitPrice, 2), fmtNum(it.cost, 2)]));

    rows.push(['四、开发间接费、营销费、公司管理费、财务费用', '', '', '', fullEstimate.indirect.total]);
    fullEstimate.indirect.items.forEach(it => rows.push(['  ' + it.name, '', '', '', fmtNum(it.cost, 2)]));

    rows.push(['总投资估算', '', '', '', fullEstimate.summary.totalInvestment]);
    rows.push(['单位地上建面成本（元/m²）', '', '', '', fmtNum(fullEstimate.summary.unitGroundCost, 2)]);
    rows.push(['单位总建面成本（元/m²）', '', '', '', fmtNum(fullEstimate.summary.unitTotalAreaCost, 2)]);

    const ws = XLSX.utils.aoa_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, '投资估算完整版');

    // Sheet2：简化版
    const simple = NS.simplifyInvestmentEstimate(fullEstimate);
    const simpleRows = [['费用大类', '金额（万元）']];
    simple.forEach(it => simpleRows.push([it.category, it.amount]));
    const wsSimple = XLSX.utils.aoa_to_sheet(simpleRows);
    XLSX.utils.book_append_sheet(wb, wsSimple, '投资估算简化版');

    XLSX.writeFile(wb, fileName || '投资估算表.xlsx');
  };

  // ==================== 静态投资分析 Excel 导出 ====================
  NS.downloadStaticAnalysisExcel = function (staticResult, fileName) {
    if (typeof XLSX === 'undefined') {
      alert('Excel 导出库未加载，请检查网络。');
      return;
    }
    const wb = XLSX.utils.book_new();

    // Sheet1：规划指标与建造成本
    const planningRows = [
      ['项目', '数值', '单位'],
      ['用地面积', fmtNum(staticResult.metrics.landArea || 0, 2), 'm²'],
      ['容积率', fmtNum(staticResult.inputs.far || 0, 2), '—'],
      ['计容总建筑面积', fmtNum(staticResult.metrics.totalCap, 2), 'm²'],
      ['地上总建筑面积', fmtNum(staticResult.metrics.aboveGroundArea, 2), 'm²'],
      ['地下总建筑面积', fmtNum(staticResult.metrics.undergroundArea || 0, 2), 'm²'],
      ['总建筑面积', fmtNum((staticResult.metrics.aboveGroundArea || 0) + (staticResult.metrics.undergroundArea || 0), 2), 'm²'],
      ['分割销售比例', fmtNum(staticResult.inputs.saleRatio, 2), '%'],
      ['', '', ''],
      ['建造成本', '金额（万元）', ''],
      ['土地价格（含契税）', fmtNum(staticResult.costs.landCost, 2), ''],
      ['建安成本', fmtNum(staticResult.costs.constructionCost, 2), ''],
      ['总投资', fmtNum(staticResult.costs.totalInvestment, 2), ''],
      ['综合单方成本', fmtNum(staticResult.costs.totalInvestment * 10000 / (staticResult.metrics.aboveGroundArea || 1), 2), '元/m²']
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(planningRows), '规划指标与建造成本');

    // Sheet2：销售测算
    const saleRows = [['产品类型', '销售面积（m²）', '单价（万元/m²）', '销售收入（万元）']];
    staticResult.sale.details.forEach(it => saleRows.push([it.type, fmtNum(it.area, 2), fmtNum(it.price, 4), fmtNum(it.revenue, 2)]));
    saleRows.push(['合计', fmtNum(staticResult.metrics.soldAreaTotal, 2), '—', fmtNum(staticResult.sale.totalRevenue, 2)]);
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(saleRows), '销售测算');

    // Sheet3：租赁测算
    const rentRows = [['产品类型', '出租面积（m²）', '租金（元/天/m²）', '年租金收入（万元）']];
    staticResult.rent.details.forEach(it => rentRows.push([it.type, fmtNum(it.area, 2), fmtNum(it.rent, 2), fmtNum(it.annualRevenue, 2)]));
    rentRows.push(['合计', fmtNum(staticResult.metrics.rentedAreaTotal, 2), '—', fmtNum(staticResult.rent.annualRevenue, 2)]);
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rentRows), '租赁测算');

    // Sheet4：面积与单价汇总
    const priceRows = [['产品类型', '销售面积（m²）', '销售单价（万元/m²）', '出租面积（m²）', '租金（元/天/m²）']];
    const allTypes = [...new Set(staticResult.sale.details.map(d => d.type).concat(staticResult.rent.details.map(d => d.type)))];
    allTypes.forEach(type => {
      const s = staticResult.sale.details.find(d => d.type === type) || {};
      const r = staticResult.rent.details.find(d => d.type === type) || {};
      priceRows.push([type, fmtNum(s.area || 0, 2), fmtNum(s.price || 0, 4), fmtNum(r.area || 0, 2), fmtNum(r.rent || 0, 2)]);
    });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(priceRows), '面积与单价汇总');

    // Sheet5：静态指标
    const indicatorRows = [
      ['指标', '数值', '单位'],
      ['总收入', fmtNum(staticResult.indicators.totalRevenue, 2), '万元'],
      ['净利润', fmtNum(staticResult.indicators.netProfit, 2), '万元'],
      ['销售净利率', fmtNum(staticResult.indicators.grossMargin * 100, 2), '%'],
      ['投资回报率', fmtNum(staticResult.indicators.investmentReturn * 100, 2), '%'],
      ['增值税', fmtNum(staticResult.taxes.vat, 2), '万元'],
      ['土地增值税', fmtNum(staticResult.taxes.landValueAddedTax, 2), '万元'],
      ['企业所得税', fmtNum(staticResult.taxes.incomeTax, 2), '万元']
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(indicatorRows), '静态指标');

    XLSX.writeFile(wb, fileName || '静态投资分析表.xlsx');
  };

})(window);
