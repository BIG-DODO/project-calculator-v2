// 投资估算、静态分析与动态投资分析自检脚本
// 模拟浏览器环境，加载 financial-modules.js，验证关键计算与公式

const fs = require('fs');
const vm = require('vm');

// 模拟 window
const sandbox = {
  window: {},
  XLSX: {
    utils: {
      encode_cell: ({ r, c }) => String.fromCharCode(65 + c) + (r + 1),
      encode_col: (c) => String.fromCharCode(65 + c),
      encode_range: (range) => range,
      book_new: () => ({}),
      book_append_sheet: () => {}
    },
    writeFile: () => {}
  }
};
sandbox.window = sandbox;

// 读取并执行 financial-modules.js
const code = fs.readFileSync('./financial-modules.js', 'utf8');
vm.createContext(sandbox);
vm.runInContext(code, sandbox);

const FM = sandbox.window.FinancialModules;

// 构造测试数据（贴近用户终版 test 场景）
const result = {
  totalArea: 136800,      // 地上总建面
  totalCap: 136800,       // 计容总建面
  calculated: { undergroundArea: 21600 },
  products: [
    { type: '轻钢厂房', totalArea: 0, totalHeight: 0 },
    { type: '分栋厂房', totalArea: 22400, totalHeight: 21.3, form: '双拼' },
    { type: '分层厂房', totalArea: 96800, totalHeight: 21.3, form: '双拼/三拼' },
    { type: '产业大厦', totalArea: 22320, totalHeight: 56, form: 'H≤60m' },
    { type: '配套楼', totalArea: 2000, totalHeight: 18 },
    { type: '配套宿舍', totalArea: 18000, totalHeight: 25 }
  ]
};

const projectData = {
  landArea: 40000,
  far: 2.0,
  ancillaryRatio: 0.15,
  rdRatio: 0,
  greenRate: 0.15,
  region: '上海',
  calculated: { buildingDensity: 0.45 }
};

const invInputs = {
  landPrice: 120,        // 万元/亩
  municipalFee: 0,       // 上海无大市政
  city: '上海',
  financingRatio: 0.5,   // 已转换为小数，对应 UI 的 50%
  financingRate: 0.05,   // 已转换为小数，对应 UI 的 5%
  devPhases: 1,
  phasePeriod: 2
};

const staticInputs = {
  saleRatio: 55,         // %
  rentSplit: 1.5,        // 元/天/㎡
  priceSplit: 0.85,      // 万元/㎡
  rentLayer: 1.3,
  priceLayer: 0.8,
  marketingRate: 3.5,
  managementRate: 3,
  rentalOpRate: 6,
  occupancyRate: 90
};

// 1. 投资估算
const inv = FM.calculateInvestmentEstimate(invInputs, result, projectData);
console.log('=== 投资估算 ===');
console.log('土地配套费用:', inv.landCost.total);
console.log('前期费用:', inv.preliminary.total);
console.log('建安工程成本:', inv.construction.total);
console.log('财务费用:', inv.financial.total);
console.log('总投资:', inv.summary.totalInvestment);
console.log('单位建面成本:', inv.summary.unitGroundCost);
console.log('单位地上建面成本:', inv.summary.unitAboveGroundCost);

// 检查增值税公式结构
const landVATItem = inv.landCost.items.find(i => i.code === '1-7');
const prelimVATItem = inv.preliminary.items.find(i => i.code === '2-9');
console.log('\n=== 增值税公式检查 ===');
console.log('1-7 quantityFormula:', landVATItem.quantityFormula, 'vatDE:', landVATItem.vatDE);
console.log('2-9 quantityFormula:', prelimVATItem.quantityFormula, 'vatDE:', prelimVATItem.vatDE);

// 2. 静态分析
const sa = FM.calculateStaticAnalysis(staticInputs, result, projectData, inv);
console.log('costUnitCost:', sa.constructionCost.costUnitCost);
console.log('landCostPerArea:', sa.constructionCost.landCostPerArea);
console.log('\n=== 静态分析 ===');
console.log('可售面积:', sa.metrics.soldAreaTotal);
console.log('可租面积:', sa.metrics.rentableArea);
console.log('加权平均售价:', sa.sale.weightedPrice);
console.log('销售收入:', sa.sale.totalRevenue);
console.log('销售净利润:', sa.sale.netProfit);
console.log('加权平均租金:', sa.rent.weightedRent);
console.log('rawWeightedRent:', (sa.metrics.rentedAreaTotal > 0 ? sa.rent.details.reduce((s, d) => s + d.area * d.rent, 0) / sa.metrics.rentedAreaTotal : 0));
console.log('年租金收入(元/年/㎡):', sa.rent.yearlyRent);
console.log('有效年租金(元/年/㎡):', sa.rent.effectiveYearlyRent);
console.log('净租赁收入(万元/年):', sa.rent.netRentalIncome);
console.log('资金盈余/缺口:', sa.summary.fundingGap);

// 验证销售收入 = 明细收入之和
const detailRevenueSum = sa.sale.details.reduce((s, d) => s + d.revenue, 0);
console.log('\n=== 一致性检查 ===');
console.log('销售收入 == 明细收入之和?', Math.abs(sa.sale.totalRevenue - detailRevenueSum) < 0.01, sa.sale.totalRevenue, detailRevenueSum);

// 验证 raw weighted price 计算
const rawWSP = sa.metrics.soldAreaTotal > 0 ? sa.sale.details.reduce((s, d) => s + d.area * d.price, 0) / sa.metrics.soldAreaTotal : 0;
console.log('raw weighted sale price:', rawWSP, 'display:', sa.sale.weightedPrice);

// 3. 投资估算 Excel 公式结构检查
let capturedInvWB = null;
sandbox.XLSX.writeFile = (wb) => { capturedInvWB = wb; };
sandbox.XLSX.utils.book_new = () => ({ Sheets: {}, SheetNames: [] });
sandbox.XLSX.utils.book_append_sheet = (wb, ws, name) => { wb.SheetNames.push(name); wb.Sheets[name] = ws; };

FM.downloadInvestmentEstimateExcel(inv, 'inv-test.xlsx');
const invFull = capturedInvWB.Sheets['投资估算完整版'];
console.log('\n=== 投资估算完整版 关键公式 ===');
Object.keys(invFull).filter(k => k !== '!ref' && k !== '!merge' && k !== '!cols' && invFull[k].f).slice(0, 30).forEach(k => {
  console.log(k, 'value:', invFull[k].v, 'formula:', invFull[k].f);
});

// 检查简化版是否引用完整版
const invSimple = capturedInvWB.Sheets['投资估算简化版'];
console.log('\n=== 投资估算简化版 公式 ===');
Object.keys(invSimple).filter(k => k !== '!ref' && k !== '!merge' && k !== '!cols' && invSimple[k].f).forEach(k => {
  console.log(k, 'value:', invSimple[k].v, 'formula:', invSimple[k].f);
});

// 4. 静态分析 Excel 公式结构检查
let capturedWB = null;
sandbox.XLSX.writeFile = (wb) => { capturedWB = wb; };

FM.downloadStaticAnalysisExcel(sa, 'test.xlsx');
const ws3 = capturedWB.Sheets['租售面积分配'];
const saleTotalKey = Object.keys(ws3).find(k => ws3[k].v === '合计' && ws3[k].s && ws3[k].s.fill && ws3[k].s.fill.fgColor && ws3[k].s.fill.fgColor.rgb === '1E4E8C');
console.log('\n=== 租售面积分配公式检查 ===');
Object.keys(ws3).filter(k => k !== '!ref' && k !== '!merge' && k !== '!cols' && ws3[k].f).forEach(k => {
  console.log(k, 'value:', ws3[k].v, 'formula:', ws3[k].f);
});

console.log('\n=== 销售测算公式检查 ===');
const ws1 = capturedWB.Sheets['销售测算'];
Object.keys(ws1).filter(k => k !== '!ref' && k !== '!merge' && k !== '!cols' && ws1[k].f).forEach(k => {
  console.log(k, 'value:', ws1[k].v, 'formula:', ws1[k].f);
});

console.log('\n=== 租赁测算公式检查 ===');
const ws2 = capturedWB.Sheets['租赁测算'];
Object.keys(ws2).filter(k => k !== '!ref' && k !== '!merge' && k !== '!cols' && ws2[k].f).forEach(k => {
  console.log(k, 'value:', ws2[k].v, 'formula:', ws2[k].f);
});

// ==================== 5. 动态投资分析自检 ====================
console.log('\n\n=== 动态投资分析自检 ===');
let dynChecks = 0, dynFailed = 0;
function check(name, cond, detail) {
  dynChecks++;
  if (cond) console.log('  [PASS]', name);
  else { dynFailed++; console.log('  [FAIL]', name, detail != null ? '→ ' + detail : ''); }
}
function approx(a, b, tol) { return typeof a === 'number' && typeof b === 'number' && isFinite(a) && isFinite(b) && Math.abs(a - b) <= (tol == null ? 0.01 : tol); }
function seqEq(actual, expected) { return actual.length === expected.length && actual.every((v, i) => v === expected[i]); }
function dv(v, d) { return v != null ? v : d; }

// ---- 桩数据构造：可售/可租各 10 万㎡（对拍设计文档 7.2 示例） ----
function makeInvStub(o) {
  o = o || {};
  return {
    inputs: { devPhases: dv(o.devPhases, 1), phasePeriod: dv(o.phasePeriod, 2), financingRatio: dv(o.financingRatio, 50), financingRate: dv(o.financingRate, 5) },
    summary: { totalInvestment: dv(o.totalInvestment, 10000) },
    construction: { total: dv(o.constructionTotal, 20000) },
    metrics: { totalBuildingArea: dv(o.totalBuildingArea, 200000) },
    landCost: { items: o.landItems || [{ code: '1-1', cost: 2000 }, { code: '1-2', cost: 60 }] }
  };
}
function makeSaStub(o) {
  o = o || {};
  const price = dv(o.price, 0.8), rent = dv(o.rent, 1.5);
  return {
    inputs: { marketingRate: dv(o.marketingRate, 3.5), managementRate: dv(o.managementRate, 3), rentalOpRate: dv(o.rentalOpRate, 6), occupancyRate: dv(o.occupancyRate, 90) },
    metrics: { soldAreaTotal: dv(o.soldAreaTotal, 100000), rentedAreaTotal: dv(o.rentedAreaTotal, 100000), aboveGroundArea: dv(o.aboveGroundArea, 200000) },
    sale: { rawWeightedPrice: price, weightedPrice: price, landCost: dv(o.landCostForSale, 5000), constructionCost: dv(o.constructionCostForSale, 20000), financialCost: dv(o.saleFinancialCost, 500) },
    rent: { rawWeightedRent: rent, weightedRent: rent }
  };
}
function dynInputs(o) {
  o = o || {};
  return {
    discountRate: dv(o.discountRate, 8),
    operationYears: dv(o.operationYears, 8),
    rentGrowthRate: dv(o.rentGrowthRate, 0),
    saleGrowthRate: dv(o.saleGrowthRate, 0),
    saleSpeed: dv(o.saleSpeed, 3),
    rentSpeed: dv(o.rentSpeed, 3),
    occupancyRate: dv(o.occupancyRate, 90),
    presaleEnabled: !!o.presaleEnabled,
    presalePctYear1: dv(o.presalePctYear1, 0),
    presalePctYear2: dv(o.presalePctYear2, 30),
    investmentEstimate: o.inv
  };
}
function depSeq(dyn, key, n) { return dyn.years.slice(0, n).map(y => y[key]); }

// a1) 去化序列：不开预售，可售 10 万㎡ @3.0 → 建设期 0/0，运营期 3/3/3/1
console.log('\n--- a) 去化序列对拍 ---');
const invA = makeInvStub();
const saA = makeSaStub();
const dynA1 = FM.calculateDynamicAnalysis(dynInputs({ inv: invA }), null, null, saA);
check('a1: 返回结构完整（inputs/base/years/metrics/sensitivity）',
  !!(dynA1 && dynA1.inputs && dynA1.base && dynA1.years && dynA1.metrics && dynA1.sensitivity));
check('a1: 销售去化 0/0/3/3/3/1（万㎡）',
  seqEq(depSeq(dynA1, 'saleDepleteArea', 6), [0, 0, 30000, 30000, 30000, 10000]),
  depSeq(dynA1, 'saleDepleteArea', 6).join('/'));
check('a1: 租赁去化 0/0/3/3/3/0（满租 9 万㎡ 停止）',
  seqEq(depSeq(dynA1, 'rentDepleteArea', 7), [0, 0, 30000, 30000, 30000, 0, 0]),
  depSeq(dynA1, 'rentDepleteArea', 7).join('/'));
check('a1: 满租面积上限 = 10万×90% = 90000㎡', dynA1.base.rentCapArea === 90000, String(dynA1.base.rentCapArea));
check('a1: 销售完成年 t=5、满租年 t=4',
  dynA1.base.saleFinishYear === 5 && dynA1.base.rentFullYear === 4,
  'saleFinishYear=' + dynA1.base.saleFinishYear + ', rentFullYear=' + dynA1.base.rentFullYear);
check('a1: 贷款全额提款（总投10000×50% → 上限/实提/自有 均 5000）',
  dynA1.base.actualLoan === 5000 && dynA1.base.loanCap === 5000 && dynA1.base.ownFunds === 5000,
  'actualLoan=' + dynA1.base.actualLoan);

// a2) 开预售（建设期 20%/30%），与设计文档 7.2 示例完全一致
const dynA2 = FM.calculateDynamicAnalysis(dynInputs({ inv: invA, presaleEnabled: true, presalePctYear1: 20, presalePctYear2: 30 }), null, null, saA);
check('a2: 销售去化 2/3/3/2/0（万㎡，含建设期预售）',
  seqEq(depSeq(dynA2, 'saleDepleteArea', 5), [20000, 30000, 30000, 20000, 0]),
  depSeq(dynA2, 'saleDepleteArea', 5).join('/'));
check('a2: 租赁去化 2/3/3/1/0（预租只锁面积，满租 9 万停止）',
  seqEq(depSeq(dynA2, 'rentDepleteArea', 5), [20000, 30000, 30000, 10000, 0]),
  depSeq(dynA2, 'rentDepleteArea', 5).join('/'));
check('a2: 销售完成年 t=3、满租年 t=3',
  dynA2.base.saleFinishYear === 3 && dynA2.base.rentFullYear === 3,
  'saleFinishYear=' + dynA2.base.saleFinishYear + ', rentFullYear=' + dynA2.base.rentFullYear);
check('a2: 预售当年确认回款（t=0 回款 20000×0.8=16000 万元）',
  dynA2.years[0].saleRevenue === 16000, String(dynA2.years[0].saleRevenue));
check('a2: 建设期不计租金，运营期第1年含预租计提（t=2 累计8万㎡×1.5×360/10000=4320）',
  dynA2.years[0].rentIncome === 0 && dynA2.years[1].rentIncome === 0 && dynA2.years[2].rentIncome === 4320,
  't0=' + dynA2.years[0].rentIncome + ', t1=' + dynA2.years[1].rentIncome + ', t2=' + dynA2.years[2].rentIncome);
check('a2: 预售回款优先替代贷款提款（actualLoan=0）', dynA2.base.actualLoan === 0, String(dynA2.base.actualLoan));

// b) NPV/IRR 与手工构造现金流对拍
// 构造：总投1000（全自有、1年建设），可售1万㎡×0.1331万/㎡ → 运营期第1年回款1331万；
// 税费仅附加税 1331/1.09×0.006=7.33，清算为0（成本口径高于收入）；
// 手工现金流 t=0: -1000，t=1: +1323.67 → NPV@8% = -1000+1323.67×0.925926 = 225.62，IRR = 1323.67/1000-1 = 32.37%
console.log('\n--- b) NPV/IRR 手工对拍 ---');
const invB = makeInvStub({ totalInvestment: 1000, financingRatio: 0, phasePeriod: 1, constructionTotal: 0, totalBuildingArea: 10000, landItems: [] });
const saB = makeSaStub({ soldAreaTotal: 10000, rentedAreaTotal: 0, aboveGroundArea: 10000, price: 0.1331, rent: 0, landCostForSale: 5000, constructionCostForSale: 5000, saleFinancialCost: 0, marketingRate: 0, managementRate: 0, rentalOpRate: 0 });
const dynB = FM.calculateDynamicAnalysis(dynInputs({ inv: invB, saleSpeed: 1, rentSpeed: 1, operationYears: 5 }), null, null, saB);
check('b: 项目净现金流序列 = [-1000, 1323.67, 0, 0, 0, 0]',
  seqEq(depSeq(dynB, 'projectNetCF', 6), [-1000, 1323.67, 0, 0, 0, 0]),
  depSeq(dynB, 'projectNetCF', 6).join('/'));
check('b: NPV = 225.62（误差<0.01）', approx(dynB.metrics.npv, 225.62, 0.01), String(dynB.metrics.npv));
check('b: IRR = 32.37%（误差<0.01）', approx(dynB.metrics.irr, 32.37, 0.01), String(dynB.metrics.irr));
check('b: 自有资金 IRR = 32.37%（全自有口径与项目一致）', approx(dynB.metrics.equityIrr, 32.37, 0.01), String(dynB.metrics.equityIrr));
check('b: 动态回收期 = 0.8 年（线性插值到 0.1 年）', approx(dynB.metrics.paybackPeriod, 0.8, 0.001), String(dynB.metrics.paybackPeriod));

// c) 股东补足场景：总投10000、融资占比90% → 贷款9000；无销售、租金收入微小，运营期利息450万/年 > 可用资金
console.log('\n--- c) 股东补足标记 ---');
const invC = makeInvStub({ totalInvestment: 10000, financingRatio: 90, financingRate: 5 });
const saC = makeSaStub({ soldAreaTotal: 0, rentedAreaTotal: 100, landCostForSale: 0, constructionCostForSale: 0, saleFinancialCost: 0 });
const dynC = FM.calculateDynamicAnalysis(dynInputs({ inv: invC, saleSpeed: 1, rentSpeed: 0.01, operationYears: 5 }), null, null, saC);
const cOpYears = dynC.years.filter(y => y.phase !== 'construction');
check('c: 实际提款 = 贷款上限 9000', dynC.base.actualLoan === 9000 && dynC.base.loanCap === 9000, 'actualLoan=' + dynC.base.actualLoan);
check('c: 运营期首年 可用资金3.9 − 利息450 = 股东可分配 -446.1',
  approx(dynC.years[2].availableFunds, 3.9, 0.01) && approx(dynC.years[2].interest, 450, 0.01) && approx(dynC.years[2].equityDistributable, -446.1, 0.01),
  'avail=' + dynC.years[2].availableFunds + ', interest=' + dynC.years[2].interest + ', distrib=' + dynC.years[2].equityDistributable);
check('c: 全部运营期年份 equityShortfall=true', cOpYears.length > 0 && cOpYears.every(y => y.equityShortfall === true),
  cOpYears.map(y => 't' + y.t + ':' + y.equityShortfall).join(','));
check('c: 建设期年份 equityShortfall=false', dynC.years.filter(y => y.phase === 'construction').every(y => y.equityShortfall === false));
check('c: 股东可分配为负、本金未偿还（剩余本金保持 9000）', cOpYears.every(y => y.equityDistributable < 0 && y.remainingPrincipal === 9000));
check('c-对照: a1 场景正常年份（t=2/3/4/6）无补足，清算年 t=5 一次性扣税触发补足',
  [2, 3, 4, 6].every(t => dynA1.years[t].equityShortfall === false) && dynA1.years[5].equityShortfall === true,
  depSeq(dynA1, 'equityShortfall', 8).join(','));

// d) 清算税只在销售完成年出现一次（对拍 a1：saleFinishYear=5）
console.log('\n--- d) 清算税一次性 ---');
const settleYears = dynA1.years.filter(y => y.settlementTax !== 0);
check('d: settlementTax>0 的年份仅 1 个', settleYears.length === 1, settleYears.map(y => 't' + y.t).join(','));
check('d: 清算年 = 销售完成年 t=5', settleYears.length === 1 && settleYears[0].t === dynA1.base.saleFinishYear);
check('d: 清算税 = 土增税18588.76 + 所得税7567.72 = 26156.48（手工对拍）',
  approx(dynA1.base.lvatSettlement, 18588.76, 0.01) && approx(dynA1.base.incomeTaxSettlement, 7567.72, 0.01) &&
  settleYears.length === 1 && approx(settleYears[0].settlementTax, 26156.48, 0.01),
  'lvat=' + dynA1.base.lvatSettlement + ', incomeTax=' + dynA1.base.incomeTaxSettlement + ', settlementTax=' + (settleYears[0] && settleYears[0].settlementTax));
check('d: 清算年以外年份 settlementTax 均为 0',
  dynA1.years.filter(y => y.t !== dynA1.base.saleFinishYear).every(y => y.settlementTax === 0));

// e) 金额单位一致性（真实管线：投资估算 + 静态分析 → 动态分析）
console.log('\n--- e) 金额单位一致性（真实管线） ---');
const dynE = FM.calculateDynamicAnalysis(dynInputs({ inv: inv, saleSpeed: 1.5, rentSpeed: 1.5, operationYears: 20 }), result, projectData, sa);
check('e: 动态分析返回成功', !!dynE);
if (dynE) {
  check('e: 可售/可租面积与静态一致',
    dynE.base.saleableArea === sa.metrics.soldAreaTotal && dynE.base.rentableArea === sa.metrics.rentedAreaTotal,
    dynE.base.saleableArea + '/' + sa.metrics.soldAreaTotal + ', ' + dynE.base.rentableArea + '/' + sa.metrics.rentedAreaTotal);
  check('e: 加权售价与静态 raw 值一致（万元/㎡口径，量级<100）',
    dynE.base.weightedSalePrice === sa.sale.rawWeightedPrice && dynE.base.weightedSalePrice > 0 && dynE.base.weightedSalePrice < 100,
    String(dynE.base.weightedSalePrice));
  check('e: 加权租金与静态 raw 值一致（元/天/㎡口径，量级<100）',
    dynE.base.weightedRent === sa.rent.rawWeightedRent && dynE.base.weightedRent > 0 && dynE.base.weightedRent < 100,
    String(dynE.base.weightedRent));
  const dynSaleTotal = dynE.years.reduce((s, y) => s + y.saleRevenue, 0);
  const relErr = sa.sale.totalRevenue > 0 ? Math.abs(dynSaleTotal - sa.sale.totalRevenue) / sa.sale.totalRevenue : 0;
  check('e: 动态累计销售回款 ≈ 静态 sale.totalRevenue（万元同口径，相对误差<0.5%）', relErr < 0.005,
    '动态=' + dynSaleTotal.toFixed(2) + ', 静态=' + sa.sale.totalRevenue + ', relErr=' + (relErr * 100).toFixed(4) + '%');
  // 年租金 = 日租金×360：运营期第1年租金收入精确对拍
  const cyE = dynE.inputs.constructionYears;
  const y0 = dynE.years[cyE];
  const expectedRent = Math.round(y0.rentCumArea * sa.rent.rawWeightedRent * 360 / 10000 * 100) / 100;
  check('e: 年租金=累计已租×日租金×360÷10000（运营期第1年精确对拍）', y0.rentIncome === expectedRent,
    'rentIncome=' + y0.rentIncome + ', expected=' + expectedRent + ', rentCumArea=' + y0.rentCumArea);
  check('e: NPV 为有限数、敏感性 24 组（6 变量×4 档）',
    typeof dynE.metrics.npv === 'number' && isFinite(dynE.metrics.npv) && dynE.sensitivity.length === 24,
    'npv=' + dynE.metrics.npv + ', sens=' + dynE.sensitivity.length);
  console.log('  [INFO] 真实管线动态指标: NPV=' + dynE.metrics.npv + ' 万元, IRR=' + dynE.metrics.irr +
    '%, 自有资金IRR=' + dynE.metrics.equityIrr + '%, 动态回收期=' + dynE.metrics.paybackPeriod + ' 年');
}

// f) Excel 导出冒烟（拦截 XLSX.writeFile，不落盘）
console.log('\n--- f) Excel 导出冒烟 ---');
let capturedDynWB = null;
sandbox.XLSX.writeFile = (wb) => { capturedDynWB = wb; };
FM.downloadDynamicAnalysisExcel(dynA1, 'dyn-test.xlsx');
check('f: 工作簿已生成', !!capturedDynWB);
if (capturedDynWB) {
  const sheetNames = capturedDynWB.SheetNames;
  check('f: 3 个 sheet（多年现金流表/敏感性分析/关键指标汇总）',
    sheetNames.length === 3 && ['多年现金流表', '敏感性分析', '关键指标汇总'].every(n => sheetNames.indexOf(n) >= 0),
    JSON.stringify(sheetNames));
  const wsDyn = capturedDynWB.Sheets['多年现金流表'];
  // 参数区数字单元格 t='n'（C3:C13、G3:G17）
  const paramCells = ['C3', 'C4', 'C5', 'C6', 'C7', 'C8', 'C9', 'C10', 'C11', 'C12', 'C13',
    'G3', 'G4', 'G5', 'G6', 'G7', 'G8', 'G9', 'G10', 'G11', 'G12', 'G13', 'G14', 'G15', 'G16', 'G17'];
  const badParam = paramCells.filter(k => { const c = wsDyn[k]; return !c || typeof c.v !== 'number' || c.t !== 'n'; });
  check('f: 参数区数字单元格均为 t=n（预填缓存值）', badParam.length === 0, badParam.join(','));
  // 去化公式含 MIN（首行数据第 20 行）
  check('f: 销售去化公式含 MIN', !!(wsDyn['C20'] && wsDyn['C20'].f && wsDyn['C20'].f.indexOf('MIN(') >= 0), wsDyn['C20'] && wsDyn['C20'].f);
  check('f: 租赁去化公式含 MIN', !!(wsDyn['E20'] && wsDyn['E20'].f && wsDyn['E20'].f.indexOf('MIN(') >= 0), wsDyn['E20'] && wsDyn['E20'].f);
  // 指标行：内置 NPV()/IRR() 公式 + JS 缓存值
  function findRowByLabel(ws, label) {
    const k = Object.keys(ws).find(key => /^A\d+$/.test(key) && ws[key] && ws[key].v === label);
    return k ? parseInt(k.slice(1), 10) : null;
  }
  const npvRow = findRowByLabel(wsDyn, '项目NPV（万元）');
  const irrRow = findRowByLabel(wsDyn, '项目IRR');
  const eqIrrRow = findRowByLabel(wsDyn, '自有资金IRR');
  const npvCell = npvRow ? wsDyn['B' + npvRow] : null;
  const irrCell = irrRow ? wsDyn['B' + irrRow] : null;
  const eqIrrCell = eqIrrRow ? wsDyn['B' + eqIrrRow] : null;
  // NPV 公式改为对折现现金流列（X 列）求和，与 JS ROUND 链缓存口径一致，避免 Excel 内置 NPV() 全精度重算漂移
  check('f: NPV 公式存在（SUM 折现现金流列）', !!(npvCell && npvCell.f && /^ROUND\(SUM\(X\d+:X\d+\),2\)$/.test(npvCell.f)), npvCell && npvCell.f);
  check('f: NPV 缓存值与 JS 一致', !!(npvCell && approx(npvCell.v, dynA1.metrics.npv, 0.001)), npvCell && (npvCell.v + ' vs ' + dynA1.metrics.npv));
  check('f: 项目 IRR 公式存在（内置 IRR()）', !!(irrCell && irrCell.f && irrCell.f.indexOf('IRR(') === 0), irrCell && irrCell.f);
  check('f: 项目 IRR 缓存值与 JS 一致', !!(irrCell && approx(irrCell.v, dynA1.metrics.irr / 100, 1e-6)), irrCell && (irrCell.v + ' vs ' + dynA1.metrics.irr / 100));
  check('f: 自有资金 IRR 公式存在（内置 IRR()）', !!(eqIrrCell && eqIrrCell.f && eqIrrCell.f.indexOf('IRR(') === 0), eqIrrCell && eqIrrCell.f);
  check('f: 自有资金 IRR 缓存值与 JS 一致', !!(eqIrrCell && approx(eqIrrCell.v, dynA1.metrics.equityIrr / 100, 1e-6)), eqIrrCell && (eqIrrCell.v + ' vs ' + dynA1.metrics.equityIrr / 100));
  // Sheet2 敏感性 24 行
  const wsSens = capturedDynWB.Sheets['敏感性分析'];
  const sensLabels = ['销售单价', '租金单价', '建安成本', '土地价格', '出租率', '去化周期'];
  const sensRows = Object.keys(wsSens).filter(k => /^A\d+$/.test(k) && sensLabels.indexOf(wsSens[k].v) >= 0).length;
  check('f: 敏感性分析 24 组（6 变量×4 档）', sensRows === 24, '实际 ' + sensRows);
  // Sheet3 汇总 NPV 缓存值
  const wsSum = capturedDynWB.Sheets['关键指标汇总'];
  const sumNpvRow = findRowByLabel(wsSum, '项目NPV');
  const sumNpvCell = sumNpvRow ? wsSum['B' + sumNpvRow] : null;
  check('f: 汇总表 NPV 缓存值与 JS 一致', !!(sumNpvCell && approx(sumNpvCell.v, dynA1.metrics.npv, 0.001)), sumNpvCell && String(sumNpvCell.v));
  // Sheet3 满租年：MATCH 公式推导（引用多年现金流表 F 列与满租上限 G12），缓存值与 JS 一致
  const rentFullRow = findRowByLabel(wsSum, '满租年');
  const rentFullCell = rentFullRow ? wsSum['B' + rentFullRow] : null;
  check('f: 满租年为 MATCH 公式', !!(rentFullCell && rentFullCell.f && rentFullCell.f.indexOf('MATCH(TRUE,INDEX(') >= 0), rentFullCell && rentFullCell.f);
  check('f: 满租年缓存值与 JS 一致', !!(rentFullCell && rentFullCell.v === dynA1.base.rentFullYear), rentFullCell && (rentFullCell.v + ' vs ' + dynA1.base.rentFullYear));
  // 多年现金流表 动态回收期：MATCH 公式推导
  const paybackRow = findRowByLabel(wsDyn, '动态投资回收期（年）');
  const paybackCell = paybackRow ? wsDyn['B' + paybackRow] : null;
  check('f: 动态回收期为 MATCH 公式', !!(paybackCell && paybackCell.f && paybackCell.f.indexOf('MATCH(TRUE,INDEX(') >= 0), paybackCell && paybackCell.f);
  check('f: 动态回收期缓存值与 JS 一致', !!(paybackCell && approx(paybackCell.v, dynA1.metrics.paybackPeriod, 1e-6)), paybackCell && (paybackCell.v + ' vs ' + dynA1.metrics.paybackPeriod));
}

// g) R1 测试自查修复项回归（静态表 + 投资估算表）
{
  // g1: 土地增值税测算表「土增税（元/㎡）」缓存不再恒为 0（bug：误读 s.soldAreaTotal）
  // 注：该 sheet 项目名在 B 列（A 列为序号），不能用 findRowByLabel
  const wsLvat = capturedWB.Sheets['土地增值税测算表'];
  const lvatLabelKey = Object.keys(wsLvat).find(k => /^B\d+$/.test(k) && wsLvat[k] && wsLvat[k].v === '土增税（元/㎡）');
  const lvatPerAreaCell = lvatLabelKey ? wsLvat['C' + lvatLabelKey.slice(1)] : null;
  const expectPerArea = sa.metrics.soldAreaTotal > 0 ? Math.round(sa.sale.landValueAddedTax / sa.metrics.soldAreaTotal * 10000 * 100) / 100 : 0;
  check('g1: 土增税（元/㎡）缓存=应缴税额÷可售面积×10000', !!(lvatPerAreaCell && approx(lvatPerAreaCell.v, expectPerArea, 1e-6)), lvatPerAreaCell && (lvatPerAreaCell.v + ' vs ' + expectPerArea));
  // g2: 投资估算完整版明细行金额公式包 ROUND(...,2)
  const invF4 = invFull['F4'];
  check('g2: 完整版明细行金额公式包 ROUND', !!(invF4 && invF4.f && /^ROUND\(/.test(invF4.f)), invF4 && invF4.f);
  // g3: 完整版分栋厂房成本指标引用加权平均造价表
  const splitRef = Object.keys(invFull).some(k => /^\w+\d+$/.test(k) && invFull[k].f && String(invFull[k].f).indexOf('加权平均造价表') >= 0);
  check('g3: 完整版分栋单价引用加权平均造价表', splitRef, '');
  // g4: 租售面积分配加权售价/租金缓存为 6 位 raw 精度
  const wsAlloc = capturedWB.Sheets['租售面积分配'];
  const rawPriceCell = Object.keys(wsAlloc).map(k => wsAlloc[k]).find(c => c && typeof c.v === 'number' && Math.abs(c.v - sa.sale.rawWeightedPrice) < 1e-9);
  check('g4: 加权售价缓存为 raw 6 位精度', !!rawPriceCell, rawPriceCell && String(rawPriceCell.v));
  // g5: 方案B——土地成本=土地配套费合计摊（地上建面口径）、建安成本=前期+建安摊（总建面口径），互补不重叠
  const expectLandUnit = Math.round(inv.landCost.total * 10000 / sa.metrics.aboveGroundArea * 100) / 100;
  const expectSaleConstrUnit = Math.round((inv.preliminary.total + inv.construction.total) * 10000 / inv.metrics.totalBuildingArea * 100) / 100;
  check('g5: 土地成本单方=土地配套费合计÷地上建面', approx(sa.constructionCost.landCostPerArea, expectLandUnit, 1e-6), sa.constructionCost.landCostPerArea + ' vs ' + expectLandUnit);
  check('g5: 建安成本单方=(前期+建安)÷总建面', approx(sa.constructionCost.saleConstructionUnitCost, expectSaleConstrUnit, 1e-6), sa.constructionCost.saleConstructionUnitCost + ' vs ' + expectSaleConstrUnit);
  check('g5: 销售土地成本=可售×土地成本单方', approx(sa.sale.landCost, Math.round(sa.metrics.soldAreaTotal * expectLandUnit / 100) / 100, 0.01), sa.sale.landCost + '');
  check('g5: 销售建安成本=可售×建安成本单方（不含土地，无重复计扣）', approx(sa.sale.constructionCost, Math.round(sa.metrics.soldAreaTotal * expectSaleConstrUnit / 100) / 100, 0.01), sa.sale.constructionCost + '');
  // g6: 销售测算 Excel「减：建安成本」引用建安成本单方行（不再引用综合建造成本行）
  const wsSale = capturedWB.Sheets['销售测算'];
  const saleConstrKey = Object.keys(wsSale).find(k => wsSale[k].v === '建安成本单方（前期+建安工程）');
  const saleDeductKey = Object.keys(wsSale).find(k => wsSale[k].v === '减：建安成本');
  const saleDeductCell = saleDeductKey ? wsSale['B' + saleDeductKey.slice(1)] : null;
  const expectRef = saleConstrKey ? '$B$' + saleConstrKey.slice(1) : '';
  check('g6: 销售测算减：建安成本引用建安成本单方行', !!(saleConstrKey && saleDeductCell && saleDeductCell.f && saleDeductCell.f.indexOf(expectRef) >= 0), saleDeductCell && saleDeductCell.f);
}

// ==================== h) 三表联动自检（_buildLinkageSheets / downloadMasterLinkageExcel） ====================
console.log('\n\n=== h) 三表联动自检 ===');
sandbox.alert = sandbox.alert || function () {};   // 防御：失败分支才调用
sandbox.console = sandbox.console || console;      // 防御：sheet 名冲突时模块内 console.error
let hChecks = 0, hFailed = 0;
function hcheck(name, cond, detail) {
  hChecks++;
  if (cond) console.log('  [PASS]', name);
  else { hFailed++; console.log('  [FAIL]', name, detail != null ? '→ ' + detail : ''); }
}
function findRowByColLabel(ws, colLetter, label) {
  const re = new RegExp('^' + colLetter + '\\d+$');
  const k = Object.keys(ws).find(key => re.test(key) && ws[key] && ws[key].v === label);
  return k ? parseInt(k.slice(colLetter.length), 10) : null;
}
// 与 index.html calculate() 同口径的独立复算（getBuildingDensity + 车位/地下面积分支）
function idxCalc(pd) {
  const landArea = pd.landArea, far = pd.far;
  const factoryIndex = pd.factoryIndex != null ? pd.factoryIndex : 0.5;
  const supportIndex = pd.supportIndex != null ? pd.supportIndex : 1.0;
  const buildingDensity = far < 1.5 ? 0.45 : (far < 2.0 ? 0.42 : 0.40);
  const aboveGroundArea = landArea * far;
  const greenArea = landArea * pd.greenRate;
  const buildingBaseArea = landArea * buildingDensity;
  const roadArea = landArea * 0.30;
  const totalVehicle = Math.ceil(aboveGroundArea * (1 - pd.ancillaryRatio) * factoryIndex / 100 + aboveGroundArea * pd.ancillaryRatio * supportIndex / 100);
  const totalNonVehicle = Math.ceil(aboveGroundArea * 1.0 / 100);
  let groundNonVehicle = totalNonVehicle, undergroundNonVehicle = 0;
  const availableParkingArea = landArea - roadArea - greenArea - buildingBaseArea - groundNonVehicle * 1.5;
  let groundVehicle = Math.floor(availableParkingArea / 35);
  if (groundVehicle < 10) groundVehicle = 0;
  let undergroundVehicle = 0, undergroundArea = 0;
  if (groundVehicle >= totalVehicle) {
    groundVehicle = totalVehicle; undergroundArea = 500;
  } else {
    if (totalNonVehicle > 500) { groundNonVehicle = Math.ceil(totalNonVehicle / 2); undergroundNonVehicle = Math.floor(totalNonVehicle / 2); }
    undergroundVehicle = totalVehicle - groundVehicle;
    undergroundArea = (pd.region === '杭州' ? undergroundVehicle * 42 : undergroundVehicle * 35) + undergroundNonVehicle * 1.5;
  }
  return { buildingDensity, aboveGroundArea, totalVehicle, totalNonVehicle, groundVehicle, undergroundVehicle, groundNonVehicle, undergroundNonVehicle, undergroundArea, totalArea: aboveGroundArea + undergroundArea };
}
const idx = idxCalc(projectData); // 用地40000×容积率2.0 → 计容80000、密度分档40%、机动车460、非机动车800、地下11905
const LINK_S1_REF = "规划指标初始值'!";

const linkage = FM._buildLinkageSheets(result, projectData);
// a) 5 个 sheet 名称与顺序
hcheck('h-a: _buildLinkageSheets 返回 5 个 sheet 且名称/顺序正确',
  linkage.length === 5 && ['规划指标初始值', '产品配置选择', '指标估算', '产品配置详表', '总体经济技术指标'].every((n, i) => linkage[i].name === n),
  JSON.stringify(linkage.map(s => s.name)));
// 组装下载路径冒烟：拦截 downloadMasterLinkageExcel，SheetNames 顺序一致
{
  let capLinkWB = null;
  sandbox.XLSX.writeFile = (wb) => { capLinkWB = wb; };
  FM.downloadMasterLinkageExcel(result, projectData, 'link-test.xlsx');
  hcheck('h-a: downloadMasterLinkageExcel 工作簿 5 sheet 顺序一致',
    !!capLinkWB && capLinkWB.SheetNames.length === 5 && ['规划指标初始值', '产品配置选择', '指标估算', '产品配置详表', '总体经济技术指标'].every((n, i) => capLinkWB.SheetNames[i] === n),
    capLinkWB && JSON.stringify(capLinkWB.SheetNames));
}
const wsL1 = linkage[0].ws, wsL3 = linkage[2].ws, wsL4 = linkage[3].ws, wsL5 = linkage[4].ws;

// b) Sheet3 指标估算：关键行公式引用 Sheet1，缓存与 index.html calculate() 同口径复算一致
hcheck('h-b: Sheet3 用地面积 B4 引用 Sheet1 且缓存=40000',
  !!(wsL3['B4'] && wsL3['B4'].f && wsL3['B4'].f.indexOf(LINK_S1_REF) >= 0 && wsL3['B4'].v === 40000),
  wsL3['B4'] && (wsL3['B4'].f + ' / ' + wsL3['B4'].v));
hcheck('h-b: Sheet3 计容（地上建面）B7 公式含「规划指标初始值\'!」',
  !!(wsL3['B7'] && wsL3['B7'].f && wsL3['B7'].f.indexOf(LINK_S1_REF) >= 0), wsL3['B7'] && wsL3['B7'].f);
hcheck('h-b: Sheet3 计容缓存=用地40000×容积率2.0=80000（同口径复算）',
  !!(wsL3['B7'] && approx(wsL3['B7'].v, idx.aboveGroundArea, 1e-9) && idx.aboveGroundArea === 80000),
  wsL3['B7'] && (wsL3['B7'].v + ' vs ' + idx.aboveGroundArea));
hcheck('h-b: Sheet3 容积率 B9 引用 Sheet1 且缓存=2.0',
  !!(wsL3['B9'] && wsL3['B9'].f === "'" + LINK_S1_REF + 'B8' && wsL3['B9'].v === 2),
  wsL3['B9'] && (wsL3['B9'].f + ' / ' + wsL3['B9'].v));
hcheck('h-b: Sheet3 建筑密度 B12 为 IF 分档公式（含 45/42/40 三档）',
  !!(wsL3['B12'] && wsL3['B12'].f && wsL3['B12'].f.indexOf('IF(') === 0 && wsL3['B12'].f.indexOf('45') >= 0 && wsL3['B12'].f.indexOf('42') >= 0 && wsL3['B12'].f.indexOf('40') >= 0 && wsL3['B12'].f.indexOf(LINK_S1_REF) >= 0),
  wsL3['B12'] && wsL3['B12'].f);
hcheck('h-b: Sheet3 建筑密度缓存=40（far=2.0 不<2.0 → 第三档，与 index.html 同口径）',
  !!(wsL3['B12'] && wsL3['B12'].v === idx.buildingDensity * 100 && idx.buildingDensity === 0.40),
  wsL3['B12'] && (wsL3['B12'].v + ' vs ' + idx.buildingDensity * 100));
// 分档边界补测：far=1.7 → 42%，far=1.2 → 45%
[1.7, 1.2].forEach(f => {
  const pdX = Object.assign({}, projectData, { far: f });
  const wsX = FM._buildLinkageSheets(result, pdX)[2].ws;
  const expectPct = idxCalc(pdX).buildingDensity * 100; // 42 / 45
  hcheck('h-b: 建筑密度分档 far=' + f + ' → ' + expectPct + '%（缓存与复算一致）',
    !!(wsX['B12'] && wsX['B12'].v === expectPct), wsX['B12'] && (wsX['B12'].v + ' vs ' + expectPct));
});
hcheck('h-b: Sheet3 机动车 B15 公式引用 Sheet1 配建指标',
  !!(wsL3['B15'] && wsL3['B15'].f && wsL3['B15'].f.indexOf(LINK_S1_REF + 'B13') >= 0 && wsL3['B15'].f.indexOf(LINK_S1_REF + 'B14') >= 0),
  wsL3['B15'] && wsL3['B15'].f);
hcheck('h-b: Sheet3 机动车/地面/地下车位缓存=460/137/323（同口径复算）',
  !!(wsL3['B15'] && wsL3['B16'] && wsL3['B17'] &&
    wsL3['B15'].v === idx.totalVehicle && wsL3['B16'].v === idx.groundVehicle && wsL3['B17'].v === idx.undergroundVehicle &&
    idx.totalVehicle === 460 && idx.groundVehicle === 137 && idx.undergroundVehicle === 323),
  [wsL3['B15'] && wsL3['B15'].v, wsL3['B16'] && wsL3['B16'].v, wsL3['B17'] && wsL3['B17'].v].join('/') + ' vs 460/137/323');
hcheck('h-b: Sheet3 非机动车/地面/地下缓存=800/400/400（>500 对半分，同口径复算）',
  !!(wsL3['B18'] && wsL3['B19'] && wsL3['B20'] &&
    wsL3['B18'].v === idx.totalNonVehicle && wsL3['B19'].v === idx.groundNonVehicle && wsL3['B20'].v === idx.undergroundNonVehicle &&
    idx.totalNonVehicle === 800 && idx.groundNonVehicle === 400 && idx.undergroundNonVehicle === 400),
  [wsL3['B18'] && wsL3['B18'].v, wsL3['B19'] && wsL3['B19'].v, wsL3['B20'] && wsL3['B20'].v].join('/') + ' vs 800/400/400');
hcheck('h-b: Sheet3 地下面积 B8 为 IF 分支公式且缓存=11905（地面不足分支：323×35+400×1.5，同口径复算）',
  !!(wsL3['B8'] && wsL3['B8'].f && wsL3['B8'].f.indexOf('IF(B25>=B15,500,') === 0 && wsL3['B8'].v === idx.undergroundArea && idx.undergroundArea === 11905),
  wsL3['B8'] && (wsL3['B8'].f + ' / ' + wsL3['B8'].v + ' vs ' + idx.undergroundArea));
hcheck('h-b: Sheet3 总建筑面积 B6 缓存=91905（地上80000+地下11905）',
  !!(wsL3['B6'] && wsL3['B6'].v === idx.totalArea && idx.totalArea === 91905),
  wsL3['B6'] && (wsL3['B6'].v + ' vs ' + idx.totalArea));

// c) Sheet4 产品配置详表：合计行（第 10 行）SUM 包 ROUND、总计容与 result.totalCap 一致
{
  const s4TRow = 3 + result.products.length + 1; // 1-based 合计行 = 4+6+... = 10
  const sumCols = ['O', 'P', 'Q', 'R', 'S', 'T'];
  const badSum = sumCols.filter(c => { const cellC = wsL4[c + s4TRow]; return !cellC || !cellC.f || !/^ROUND\(SUM\(/.test(cellC.f); });
  hcheck('h-c: Sheet4 合计行（第' + s4TRow + '行）O~T 列均为 ROUND(SUM(...)) 公式', badSum.length === 0, badSum.join(','));
  hcheck('h-c: Sheet4 户型总面积合计 Q' + s4TRow + ' 缓存=result.totalArea=136800',
    !!(wsL4['Q' + s4TRow] && wsL4['Q' + s4TRow].v === result.totalArea), wsL4['Q' + s4TRow] && String(wsL4['Q' + s4TRow].v));
  hcheck('h-c: Sheet4 户型总计容合计 S' + s4TRow + ' 缓存=result.totalCap=136800',
    !!(wsL4['S' + s4TRow] && wsL4['S' + s4TRow].v === result.totalCap), wsL4['S' + s4TRow] && String(wsL4['S' + s4TRow].v));

  // d) Sheet5 总体经济技术指标：容积率公式=总计容/用地引用；各产品面积 SUMIF 且缓存与按类型汇总一致
  hcheck('h-d: Sheet5 容积率 B9 公式=ROUND(B8/B4,2)（总计容/用地）且缓存=3.42',
    !!(wsL5['B9'] && wsL5['B9'].f === 'ROUND(B8/B4,2)' && approx(wsL5['B9'].v, result.totalCap / projectData.landArea, 1e-9) && wsL5['B9'].v === 3.42),
    wsL5['B9'] && (wsL5['B9'].f + ' / ' + wsL5['B9'].v));
  hcheck('h-d: Sheet5 计容 B8 引用产品配置详表 S' + s4TRow + ' 且缓存=result.totalCap',
    !!(wsL5['B8'] && wsL5['B8'].f === "'产品配置详表'!S" + s4TRow && wsL5['B8'].v === result.totalCap),
    wsL5['B8'] && (wsL5['B8'].f + ' / ' + wsL5['B8'].v));
  const S5_TYPES = ['轻钢厂房', '分栋厂房', '分层厂房', '产业大厦', '配套楼', '配套宿舍'];
  const sumifBadF = S5_TYPES.filter((t, i) => { const c5 = wsL5['B' + (18 + i)]; return !c5 || !c5.f || c5.f.indexOf('SUMIF(') < 0 || c5.f.indexOf("'产品配置详表'!") < 0; });
  hcheck('h-d: Sheet5 各产品面积行（B18~B23）均为 SUMIF 引用产品配置详表', sumifBadF.length === 0, sumifBadF.join(','));
  const sumifBadV = S5_TYPES.filter((t, i) => {
    const expect = result.products.filter(p => p.type === t).reduce((s, p) => s + (p.totalArea || 0), 0);
    const c5 = wsL5['B' + (18 + i)];
    return !c5 || !approx(c5.v, expect, 1e-9);
  });
  hcheck('h-d: Sheet5 各产品面积缓存与 result.products 按类型汇总一致', sumifBadV.length === 0, sumifBadV.join(','));
}

// e) Sheet1 输入格 t='n'（数字型输入：用地/容积率/绿地率/配套占比/研发占比/车位指标）
{
  const numInputCells = { B7: 40000, B8: 2, B10: 15, B11: 15, B12: 0, B13: 0.5, B14: 1 };
  const badT = Object.keys(numInputCells).filter(k => { const c = wsL1[k]; return !c || c.t !== 'n'; });
  hcheck('h-e: Sheet1 数字输入格均为 t=n（B7/B8/B10/B11/B12/B13/B14）', badT.length === 0, badT.join(','));
  const badV = Object.keys(numInputCells).filter(k => { const c = wsL1[k]; return !c || c.v !== numInputCells[k]; });
  hcheck('h-e: Sheet1 数字输入格缓存值与 projectData 一致（绿地率/占比按百分比数填）', badV.length === 0, badV.map(k => k + '=' + (wsL1[k] && wsL1[k].v)).join(','));
  hcheck('h-e: Sheet1 文本输入格为 t=s（B5 城市=上海）', !!(wsL1['B5'] && wsL1['B5'].t === 's' && wsL1['B5'].v === '上海'), wsL1['B5'] && (wsL1['B5'].t + '/' + wsL1['B5'].v));
}

// f) A4 修复防回归：SUMIF 字面量条件、车位/栋数整数格式、层数 General、占比 0.0"%"
{
  const s4FirstRow = 4, s4LastRow = 3 + result.products.length, s4TotalRow = s4LastRow + 1; // 4..9 明细，10 合计
  const fmtOf = (ws, addr) => { const c = ws[addr]; return c && c.s ? c.s.numFmt : undefined; };
  // 1) Sheet5 产品面积 SUMIF 条件为双引号字面量（修复前为 ,A18 引用形式，标签带「建筑面积」后缀会失配归 0）
  const sumifCells = ['B18', 'B19', 'B20', 'B21', 'B22', 'B23'].map(a => ({ addr: a, c: wsL5[a] }));
  const literalOf = f => { const m = f && f.match(/SUMIF\('产品配置详表'!\$A\$\d+:\$A\$\d+,([^,]+),/); return m ? m[1] : null; };
  const badSumifForm = sumifCells.filter(x => {
    const crit = literalOf(x.c && x.c.f);
    return !x.c || !x.c.f || x.c.f.indexOf('SUMIF(') < 0 || !crit || !/^".+"$/.test(crit) || /^A\d+$/.test(crit);
  });
  hcheck('h-f: Sheet5 六个产品面积格 SUMIF 条件均为双引号字面量（非 ,A 引用形式）',
    badSumifForm.length === 0, badSumifForm.map(x => x.addr + ':' + (x.c && x.c.f)).join(' | '));
  const literals = sumifCells.map(x => literalOf(x.c.f).slice(1, -1));
  const aColTypes = [];
  for (let r = s4FirstRow; r <= s4LastRow; r++) { const c = wsL4['A' + r]; if (c && c.v !== '') aColTypes.push(String(c.v)); }
  const uniq = arr => [...new Set(arr)];
  const setEq = (a, b) => a.length === b.length && a.every(v => b.indexOf(v) >= 0);
  hcheck('h-f: 六个 SUMIF 字面量与 Sheet4 A 列数据区类型名集合完全一致',
    setEq(uniq(literals), uniq(aColTypes)),
    '字面量=' + JSON.stringify(uniq(literals)) + ' vs A列=' + JSON.stringify(uniq(aColTypes)));
  const noHit = uniq(literals).filter(t => !aColTypes.some(v => v === t));
  hcheck('h-f: 模拟匹配——六个字面量在 Sheet4 A 列值集合中均能命中（编辑重算不归 0）',
    noHit.length === 0, '未命中=' + JSON.stringify(noHit));
  // 2) Sheet3/Sheet5 车位行整数格式
  const s3ParkBad = ['B15', 'B16', 'B17', 'B18', 'B19', 'B20'].filter(a => fmtOf(wsL3, a) !== '#,##0');
  hcheck('h-f: Sheet3 车位行（B15~B20 机动车/非机动车及地面/地下）numFmt=#,##0',
    s3ParkBad.length === 0, s3ParkBad.map(a => a + '=' + fmtOf(wsL3, a)).join(','));
  const s5ParkBad = ['B12', 'B13', 'B14', 'B15', 'B16', 'B17'].filter(a => fmtOf(wsL5, a) !== '#,##0');
  hcheck('h-f: Sheet5 车位行（B12~B17 机动车/非机动车及地面/地下）numFmt=#,##0',
    s5ParkBad.length === 0, s5ParkBad.map(a => a + '=' + fmtOf(wsL5, a)).join(','));
  // 3) Sheet4 层数列 General、栋数列 #,##0（明细+合计）
  const floorsBad = [];
  for (let r = s4FirstRow; r <= s4LastRow; r++) if (fmtOf(wsL4, 'E' + r) !== 'General') floorsBad.push('E' + r + '=' + fmtOf(wsL4, 'E' + r));
  hcheck('h-f: Sheet4 层数列明细格（E' + s4FirstRow + '~E' + s4LastRow + '）numFmt=General（3 显示 3、3.5 显示 3.5）',
    floorsBad.length === 0, floorsBad.join(','));
  const countBad = [];
  for (let r = s4FirstRow; r <= s4TotalRow; r++) if (fmtOf(wsL4, 'O' + r) !== '#,##0') countBad.push('O' + r + '=' + fmtOf(wsL4, 'O' + r));
  hcheck('h-f: Sheet4 栋数列明细+合计格（O' + s4FirstRow + '~O' + s4TotalRow + '）numFmt=#,##0',
    countBad.length === 0, countBad.join(','));
  // 4) Sheet4 建面/计容占比列 0.0"%"（明细+合计），合计缓存 100
  const ratioBad = [];
  for (let r = s4FirstRow; r <= s4TotalRow; r++) ['R', 'T'].forEach(col => {
    if (fmtOf(wsL4, col + r) !== '0.0"%"') ratioBad.push(col + r + '=' + fmtOf(wsL4, col + r));
  });
  hcheck('h-f: Sheet4 建面/计容占比列明细+合计格 numFmt=0.0"%"',
    ratioBad.length === 0, ratioBad.join(','));
  hcheck('h-f: Sheet4 占比合计缓存=100（显示 100.0%）',
    !!(wsL4['R' + s4TotalRow] && wsL4['R' + s4TotalRow].v === 100 && wsL4['T' + s4TotalRow] && wsL4['T' + s4TotalRow].v === 100),
    'R' + s4TotalRow + '=' + (wsL4['R' + s4TotalRow] && wsL4['R' + s4TotalRow].v) + ', T' + s4TotalRow + '=' + (wsL4['T' + s4TotalRow] && wsL4['T' + s4TotalRow].v));
}

console.log('\n=== h) 三表联动自检结果：' + (hChecks - hFailed) + '/' + hChecks + ' 通过' + (hFailed ? '（存在未通过项）' : '') + ' ===');

// ==================== i) 总表集成自检（downloadMasterIntegratedExcel，17 sheet 捕获+重接线） ====================
console.log('\n\n=== i) 总表集成自检 ===');
let iChecks = 0, iFailed = 0;
function icheck(name, cond, detail) {
  iChecks++;
  if (cond) console.log('  [PASS]', name);
  else { iFailed++; console.log('  [FAIL]', name, detail != null ? '→ ' + detail : ''); }
}
const S5_NAME = '总体经济技术指标';
const EXPECT_17 = ['规划指标初始值', '产品配置选择', '指标估算', '产品配置详表', S5_NAME,
  '规划指标', '加权平均造价表', '投资估算完整版', '投资估算简化版',
  '销售测算', '租赁测算', '租售面积分配', '土地增值税测算表', '综合汇总',
  '多年现金流表', '敏感性分析', '关键指标汇总'];
// 完整管线：inv/sa 用文件内已有计算链，动态结果用 e 段真实管线 dynE（stub dynA1 与真实 inv/sa 口径不一致，不适用重接线缓存断言）
let capIntWB = null;
sandbox.XLSX.writeFile = (wb) => { capIntWB = wb; };
FM.downloadMasterIntegratedExcel(result, projectData, inv, sa, dynE, 'integrated-test.xlsx');

// a) 17 个 sheet 齐全、名称唯一、≤31 字
icheck('i-a: 工作簿已生成且含 17 个 sheet', !!capIntWB && capIntWB.SheetNames.length === 17, capIntWB && String(capIntWB.SheetNames.length));
if (capIntWB) {
  icheck('i-a: 17 个 sheet 名称与顺序符合四部分结构',
    EXPECT_17.every((n, i) => capIntWB.SheetNames[i] === n), JSON.stringify(capIntWB.SheetNames));
  icheck('i-a: sheet 名称唯一', new Set(capIntWB.SheetNames).size === capIntWB.SheetNames.length);
  icheck('i-a: sheet 名称均 ≤31 字', capIntWB.SheetNames.every(n => n.length <= 31),
    capIntWB.SheetNames.filter(n => n.length > 31).join(','));

  const intS5 = capIntWB.Sheets[S5_NAME];
  const intPlan = capIntWB.Sheets['规划指标'];
  // b) 「规划指标」B3/B4/B6 等公式引用 Sheet5 且缓存与 Sheet5 对应单元格一致
  const INV_PLAN_MAP = [['B3', 'B4'], ['B4', 'B9'], ['B5', 'B8'], ['B6', 'B6'], ['B7', 'B7'], ['B8', 'B5'],
    ['B9', 'B11'], ['B10', 'B10'], ['B11', 'B31'], ['B12', 'B29'], ['B13', 'B30'],
    ['B14', 'B18'], ['B15', 'B19'], ['B16', 'B20'], ['B17', 'B21'], ['B18', 'B32'], ['B19', 'B22'], ['B20', 'B23']];
  [['B3', 'B4'], ['B4', 'B9'], ['B6', 'B6']].forEach(m => {
    const c = intPlan[m[0]], ref = intS5[m[1]];
    icheck('i-b: 规划指标 ' + m[0] + ' 引用「\'总体经济技术指标\'!' + m[1] + '」且缓存一致',
      !!(c && ref && c.f === "'" + S5_NAME + "'!" + m[1] && c.v === ref.v),
      c && (c.f + ' / ' + c.v + ' vs ' + (ref && ref.v)));
  });
  const planBad = INV_PLAN_MAP.filter(m => {
    const c = intPlan[m[0]], ref = intS5[m[1]];
    return !c || !ref || c.f !== "'" + S5_NAME + "'!" + m[1] || c.v !== ref.v;
  });
  icheck('i-b: 规划指标全部 18 处映射公式/缓存与 Sheet5 一致', planBad.length === 0, planBad.map(m => m[0]).join(','));

  // c) 投资估算完整版 发展成本合计（F64）缓存与独立下载版一致
  const intInvFull = capIntWB.Sheets['投资估算完整版'];
  const intTotalRow = findRowByColLabel(intInvFull, 'B', '发展成本合计');
  const indTotalRow = findRowByColLabel(invFull, 'B', '发展成本合计'); // invFull = 独立下载版（第 3 节捕获）
  icheck('i-c: 集成版/独立版 发展成本合计 均在第 64 行', intTotalRow === 64 && indTotalRow === 64, 'int=' + intTotalRow + ', ind=' + indTotalRow);
  icheck('i-c: 集成版 F64 缓存与独立下载版一致（=投资估算 summary.totalInvestment）',
    !!(intTotalRow && indTotalRow &&
      intInvFull['F' + intTotalRow].v === invFull['F' + indTotalRow].v &&
      approx(intInvFull['F' + intTotalRow].v, inv.summary.totalInvestment, 1e-9)),
    intTotalRow && (intInvFull['F' + intTotalRow].v + ' vs ' + (indTotalRow && invFull['F' + indTotalRow].v) + ' vs ' + inv.summary.totalInvestment));

  // d) 静态销售测算 B 列规划区引用 Sheet5（租赁测算同构一并校验）
  const SA_PLAN_MAP = [['B5', 'B4'], ['B6', 'B9'], ['B7', 'B8'], ['B8', 'B6'], ['B9', 'B7'], ['B10', 'B5']];
  const intSale = capIntWB.Sheets['销售测算'];
  icheck('i-d: 销售测算 B4（用地亩）=ROUND(Sheet5!B4/666.7,2) 且缓存一致',
    !!(intSale['B4'] && intSale['B4'].f === "ROUND('" + S5_NAME + "'!B4/666.7,2)" &&
      approx(intSale['B4'].v, Math.round(intS5['B4'].v / 666.7 * 100) / 100, 1e-9)),
    intSale['B4'] && (intSale['B4'].f + ' / ' + intSale['B4'].v));
  const saleBad = SA_PLAN_MAP.filter(m => {
    const c = intSale[m[0]], ref = intS5[m[1]];
    return !c || !ref || c.f !== "'" + S5_NAME + "'!" + m[1] || c.v !== ref.v;
  });
  icheck('i-d: 销售测算 B5~B10 规划区 6 处引用 Sheet5 且缓存一致', saleBad.length === 0, saleBad.map(m => m[0]).join(','));
  const intRent = capIntWB.Sheets['租赁测算'];
  const rentBad = SA_PLAN_MAP.filter(m => {
    const c = intRent[m[0]], ref = intS5[m[1]];
    return !c || !ref || c.f !== "'" + S5_NAME + "'!" + m[1] || c.v !== ref.v;
  });
  icheck('i-d: 租赁测算 B5~B10 规划区 6 处引用 Sheet5 且缓存一致', rentBad.length === 0, rentBad.map(m => m[0]).join(','));
  // 附带：财务费用 → 完整版财务费用行；综合汇总总投资 → 完整版发展成本合计
  const indFinRow = findRowByColLabel(invFull, 'B', '财务费用');
  icheck('i-d: 销售测算 B19 财务费用引用投资估算完整版 F' + indFinRow + ' 且缓存一致',
    !!(indFinRow && intSale['B19'] && intSale['B19'].f === "'投资估算完整版'!F" + indFinRow && intSale['B19'].v === invFull['F' + indFinRow].v),
    intSale['B19'] && (intSale['B19'].f + ' / ' + intSale['B19'].v));
  const intSum = capIntWB.Sheets['综合汇总'];
  icheck('i-d: 综合汇总 B3 总投资引用投资估算完整版 F64 且缓存一致',
    !!(intTotalRow && intSum['B3'] && intSum['B3'].f === "'投资估算完整版'!F" + intTotalRow && intSum['B3'].v === intInvFull['F' + intTotalRow].v),
    intSum['B3'] && (intSum['B3'].f + ' / ' + intSum['B3'].v));

  // e) 动态多年现金流表参数区：C3 引用投资估算完整版、G3 引用销售测算，缓存与 dynE.base 一致
  const intCash = capIntWB.Sheets['多年现金流表'];
  icheck('i-e: 多年现金流表 C3 公式=「\'投资估算完整版\'!F64」',
    !!(intTotalRow && intCash['C3'] && intCash['C3'].f === "'投资估算完整版'!F" + intTotalRow), intCash['C3'] && intCash['C3'].f);
  icheck('i-e: 多年现金流表 C3 缓存与 dynE.base.totalInvestment 一致',
    !!(intCash['C3'] && approx(intCash['C3'].v, dynE.base.totalInvestment, 1e-9)),
    intCash['C3'] && (intCash['C3'].v + ' vs ' + dynE.base.totalInvestment));
  icheck('i-e: 多年现金流表 G3 公式=「\'销售测算\'!B24」',
    !!(intCash['G3'] && intCash['G3'].f === "'销售测算'!B24"), intCash['G3'] && intCash['G3'].f);
  icheck('i-e: 多年现金流表 G3 缓存与 dynE.base.weightedSalePrice 一致',
    !!(intCash['G3'] && approx(intCash['G3'].v, dynE.base.weightedSalePrice, 1e-12)),
    intCash['G3'] && (intCash['G3'].v + ' vs ' + dynE.base.weightedSalePrice));
  const DYN_MAP = [['G5', "'租赁测算'!B24", dynE.base.weightedRent], ['G9', "'销售测算'!B23", dynE.base.saleableArea],
    ['G10', "'租赁测算'!B23", dynE.base.rentableArea], ['G11', "'租赁测算'!B27", dynE.inputs.occupancyRate]];
  const dynBad = DYN_MAP.filter(m => { const c = intCash[m[0]]; return !c || c.f !== m[1] || !approx(c.v, m[2], 1e-9); });
  icheck('i-e: 多年现金流表 G5/G9/G10/G11 重接线公式与缓存（租金/可售/可租/出租率）一致', dynBad.length === 0, dynBad.map(m => m[0]).join(','));

  // f) dynamicAnalysisResult 传 null：17 sheet 仍在且动态 3 sheet 为占位（含「未完成」）
  let capNullWB = null;
  sandbox.XLSX.writeFile = (wb) => { capNullWB = wb; };
  FM.downloadMasterIntegratedExcel(result, projectData, inv, sa, null, 'integrated-null-test.xlsx');
  icheck('i-f: 动态结果传 null 时仍生成 17 个 sheet（名称/顺序不变）',
    !!capNullWB && capNullWB.SheetNames.length === 17 && EXPECT_17.every((n, i) => capNullWB.SheetNames[i] === n),
    capNullWB && JSON.stringify(capNullWB.SheetNames));
  if (capNullWB) {
    const phBad = ['多年现金流表', '敏感性分析', '关键指标汇总'].filter(n => {
      const ws = capNullWB.Sheets[n];
      if (!ws) return true;
      return !Object.keys(ws).some(k => k[0] !== '!' && typeof ws[k].v === 'string' && ws[k].v.indexOf('未完成') >= 0);
    });
    icheck('i-f: 动态 3 sheet 为占位结构（含「未完成」字样）', phBad.length === 0, phBad.join(','));
    const phInvFull = capNullWB.Sheets['投资估算完整版'];
    const phTotalRow = phInvFull ? findRowByColLabel(phInvFull, 'B', '发展成本合计') : null;
    icheck('i-f: 占位版非动态部分不受影响（发展成本合计缓存仍=69852.12）',
      !!(phTotalRow && approx(phInvFull['F' + phTotalRow].v, inv.summary.totalInvestment, 1e-9)),
      phTotalRow && String(phInvFull['F' + phTotalRow].v));
  }
}

console.log('\n=== i) 总表集成自检结果：' + (iChecks - iFailed) + '/' + iChecks + ' 通过' + (iFailed ? '（存在未通过项）' : '') + ' ===');

// ==================== j) 参数单一数据源自检（A3 参数单元格化 + 集成重接线） ====================
console.log('\n\n=== j) 参数单一数据源自检 ===');
let jChecks = 0, jFailed = 0;
function jcheck(name, cond, detail) {
  jChecks++;
  if (cond) console.log('  [PASS]', name);
  else { jFailed++; console.log('  [FAIL]', name, detail != null ? '→ ' + detail : ''); }
}

// ---- j-a) 独立投资估算工作簿（capturedInvWB）：完整版表尾融资参数区 + 财务费用活公式 ----
{
  const rRatio = findRowByColLabel(invFull, 'B', '融资占比');
  const rRate = findRowByColLabel(invFull, 'B', '融资利率');
  const rPhases = findRowByColLabel(invFull, 'B', '开发期数');
  const rPeriod = findRowByColLabel(invFull, 'B', '单期开发周期');
  const rFinCost = findRowByColLabel(invFull, 'B', '财务费用');
  jcheck('j-a: 完整版存在「融资占比」参数行且 D 输入格 t=n、缓存=50',
    !!(rRatio && invFull['D' + rRatio] && invFull['D' + rRatio].t === 'n' && invFull['D' + rRatio].v === inv.inputs.financingRatio && inv.inputs.financingRatio === 50),
    rRatio && (rRatio + ' / ' + JSON.stringify(invFull['D' + rRatio])));
  const paramRowsOk = [[rRatio, 68, inv.inputs.financingRatio], [rRate, 69, inv.inputs.financingRate], [rPhases, 70, inv.inputs.devPhases], [rPeriod, 71, inv.inputs.phasePeriod]];
  const paramBad = paramRowsOk.filter(m => {
    const c = m[0] && invFull['D' + m[0]];
    return m[0] !== m[1] || !c || c.t !== 'n' || c.v !== m[2];
  });
  jcheck('j-a: 融资参数区 4 行位于 D68~D71 且均 t=n、值=50/5/1/2（与 inv.inputs 一致）',
    paramBad.length === 0, paramBad.map(m => 'row' + m[0]).join(','));
  const finF = rFinCost && invFull['F' + rFinCost];
  const refOk = finF && finF.f && [rRatio, rRate, rPhases, rPeriod].every(r => finF.f.indexOf('$D$' + r) >= 0);
  jcheck('j-a: 财务费用公式引用 4 个参数 D 格且 ROUND 包裹',
    !!(finF && finF.f && /^ROUND\(/.test(finF.f) && refOk), finF && finF.f);
  jcheck('j-a: 财务费用公式含 IF(...>0,30,0) 活公式（利息>0 计银行费用 30 万）',
    !!(finF && finF.f && finF.f.indexOf('IF(') >= 0 && finF.f.indexOf('>0,30,0)') >= 0 && inv.financial.bankFee === 30),
    finF && (finF.f + ' / bankFee=' + inv.financial.bankFee));
  jcheck('j-a: 财务费用缓存与 inv.financial.total 一致',
    !!(finF && approx(finF.v, inv.financial.total, 1e-9)), finF && (finF.v + ' vs ' + inv.financial.total));
}

// ---- j-b) 独立静态工作簿（capturedWB）：费率输入格与费用公式引用 ----
{
  const wsSaleJ = capturedWB.Sheets['销售测算'];
  const wsRentJ = capturedWB.Sheets['租赁测算'];
  const wsSumJ = capturedWB.Sheets['综合汇总'];
  const r2 = n => Math.round(n * 100) / 100; // 输入格按模块 round2 口径预填（sa.inputs 为 ×100 浮点存储，不能直接 ===）
  const rMkt = findRowByColLabel(wsSaleJ, 'A', '营销费率');
  const rMgmt = findRowByColLabel(wsSaleJ, 'A', '管理费率');
  jcheck('j-b: 销售测算营销/管理费率输入格位于 B39/B40 且 t=n、缓存=3.5/3',
    !!(rMkt === 39 && rMgmt === 40 &&
      wsSaleJ['B' + rMkt] && wsSaleJ['B' + rMkt].t === 'n' && wsSaleJ['B' + rMkt].v === r2(sa.inputs.marketingRate) && wsSaleJ['B' + rMkt].v === 3.5 &&
      wsSaleJ['B' + rMgmt] && wsSaleJ['B' + rMgmt].t === 'n' && wsSaleJ['B' + rMgmt].v === r2(sa.inputs.managementRate) && wsSaleJ['B' + rMgmt].v === 3),
    'mkt=' + rMkt + '=' + JSON.stringify(rMkt && wsSaleJ['B' + rMkt] && wsSaleJ['B' + rMkt].v) + ', mgmt=' + rMgmt + '=' + JSON.stringify(rMgmt && wsSaleJ['B' + rMgmt] && wsSaleJ['B' + rMgmt].v));
  const rSaleMkt = findRowByColLabel(wsSaleJ, 'A', '减：营销费用');
  const rSaleMgmt = findRowByColLabel(wsSaleJ, 'A', '减：管理费用');
  const saleMktC = rSaleMkt && wsSaleJ['B' + rSaleMkt];
  jcheck('j-b: 减：营销费用公式引用本表 $B$' + rMkt + ' 且缓存=sa.sale.marketingCost',
    !!(saleMktC && saleMktC.f && saleMktC.f.indexOf('$B$' + rMkt) >= 0 && approx(saleMktC.v, sa.sale.marketingCost, 1e-9)),
    saleMktC && (saleMktC.f + ' / ' + saleMktC.v + ' vs ' + sa.sale.marketingCost));
  const saleMgmtC = rSaleMgmt && wsSaleJ['B' + rSaleMgmt];
  jcheck('j-b: 减：管理费用公式引用本表 $B$' + rMgmt + ' 且缓存=sa.sale.managementCost',
    !!(saleMgmtC && saleMgmtC.f && saleMgmtC.f.indexOf('$B$' + rMgmt) >= 0 && approx(saleMgmtC.v, sa.sale.managementCost, 1e-9)),
    saleMgmtC && (saleMgmtC.f + ' / ' + saleMgmtC.v + ' vs ' + sa.sale.managementCost));
  const rOp = findRowByColLabel(wsRentJ, 'A', '租赁运营费率');
  jcheck('j-b: 租赁测算租赁运营费率输入格位于 B38 且 t=n、缓存=6',
    !!(rOp === 38 && wsRentJ['B' + rOp] && wsRentJ['B' + rOp].t === 'n' && wsRentJ['B' + rOp].v === r2(sa.inputs.rentalOpRate) && wsRentJ['B' + rOp].v === 6),
    'op=' + rOp + ' / ' + JSON.stringify(rOp && wsRentJ['B' + rOp]));
  const rRentOp = findRowByColLabel(wsRentJ, 'A', '减：运营费用');
  const rentOpC = rRentOp && wsRentJ['B' + rRentOp];
  jcheck('j-b: 减：运营费用公式引用本表 $B$' + rOp + ' 且缓存=sa.rent.rentalOpCost',
    !!(rentOpC && rentOpC.f && rentOpC.f.indexOf('$B$' + rOp) >= 0 && approx(rentOpC.v, sa.rent.rentalOpCost, 1e-9)),
    rentOpC && (rentOpC.f + ' / ' + rentOpC.v + ' vs ' + sa.rent.rentalOpCost));
  const rSumRatio = findRowByColLabel(wsSumJ, 'A', '融资占比');
  jcheck('j-b: 综合汇总融资占比输入格位于 B13 且 t=n、缓存=50（取自投资估算输入）',
    !!(rSumRatio === 13 && wsSumJ['B' + rSumRatio] && wsSumJ['B' + rSumRatio].t === 'n' && wsSumJ['B' + rSumRatio].v === sa.inputs.financingRatio && sa.inputs.financingRatio === 50),
    'row=' + rSumRatio + ' / ' + JSON.stringify(rSumRatio && wsSumJ['B' + rSumRatio]));
  const rGap = findRowByColLabel(wsSumJ, 'A', '资金盈余/缺口');
  const gapC = rGap && wsSumJ['B' + rGap];
  jcheck('j-b: 资金盈余/缺口公式引用本表 $B$' + rSumRatio + ' 且缓存=sa.summary.fundingGap',
    !!(gapC && gapC.f && gapC.f.indexOf('$B$' + rSumRatio) >= 0 && approx(gapC.v, sa.summary.fundingGap, 1e-9)),
    gapC && (gapC.f + ' / ' + gapC.v + ' vs ' + sa.summary.fundingGap));
}

// ---- j-c) 集成工作簿（capIntWB）：新增重接线公式 + 缓存与独立动态版逐位一致 ----
{
  const iFullJ = capIntWB.Sheets['投资估算完整版'];
  const iSumJ = capIntWB.Sheets['综合汇总'];
  const iCashJ = capIntWB.Sheets['多年现金流表'];
  const iSaleJ = capIntWB.Sheets['销售测算'];
  const iRentJ = capIntWB.Sheets['租赁测算'];
  const dCashJ = capturedDynWB.Sheets['多年现金流表']; // 独立动态版（f 段捕获）
  const iRatioRowF = findRowByColLabel(iFullJ, 'B', '融资占比');
  const iRateRowF = findRowByColLabel(iFullJ, 'B', '融资利率');
  const iSumRatioRow = findRowByColLabel(iSumJ, 'A', '融资占比');
  const sumRatioC = iSumRatioRow && iSumJ['B' + iSumRatioRow];
  jcheck('j-c: 集成综合汇总融资占比格公式=「\'投资估算完整版\'!D' + iRatioRowF + '」且缓存与被引格一致',
    !!(sumRatioC && sumRatioC.f === "'投资估算完整版'!D" + iRatioRowF &&
      iRatioRowF && sumRatioC.v === iFullJ['D' + iRatioRowF].v && sumRatioC.v === 50),
    sumRatioC && (sumRatioC.f + ' / ' + sumRatioC.v));
  jcheck('j-c: 集成现金流 C4 公式引用完整版融资占比 D' + iRatioRowF + ' 且缓存=50',
    !!(iRatioRowF && iCashJ['C4'] && iCashJ['C4'].f === "'投资估算完整版'!D" + iRatioRowF && iCashJ['C4'].v === iFullJ['D' + iRatioRowF].v && iCashJ['C4'].v === 50),
    iCashJ['C4'] && (iCashJ['C4'].f + ' / ' + iCashJ['C4'].v));
  jcheck('j-c: 集成现金流 C6 公式引用完整版融资利率 D' + iRateRowF + ' 且缓存=5',
    !!(iRateRowF && iCashJ['C6'] && iCashJ['C6'].f === "'投资估算完整版'!D" + iRateRowF && iCashJ['C6'].v === iFullJ['D' + iRateRowF].v && iCashJ['C6'].v === 5),
    iCashJ['C6'] && (iCashJ['C6'].f + ' / ' + iCashJ['C6'].v));
  const iMktRow = findRowByColLabel(iSaleJ, 'A', '营销费率');
  const iMgmtRow = findRowByColLabel(iSaleJ, 'A', '管理费率');
  jcheck('j-c: 集成现金流 G13/G14 公式引用销售测算 B' + iMktRow + '/B' + iMgmtRow,
    !!(iMktRow && iMgmtRow && iCashJ['G13'] && iCashJ['G13'].f === "'销售测算'!B" + iMktRow &&
      iCashJ['G14'] && iCashJ['G14'].f === "'销售测算'!B" + iMgmtRow),
    (iCashJ['G13'] && iCashJ['G13'].f) + ' / ' + (iCashJ['G14'] && iCashJ['G14'].f));
  const iOpRow = findRowByColLabel(iRentJ, 'A', '租赁运营费率');
  jcheck('j-c: 集成现金流 G15 公式引用租赁测算 B' + iOpRow,
    !!(iOpRow && iCashJ['G15'] && iCashJ['G15'].f === "'租赁测算'!B" + iOpRow),
    iCashJ['G15'] && iCashJ['G15'].f);
  const strictBad = ['C4', 'C6', 'G13', 'G14', 'G15'].filter(k => !iCashJ[k] || !dCashJ[k] || iCashJ[k].v !== dCashJ[k].v);
  jcheck('j-c: C4/C6/G13/G14/G15 缓存与独立动态版对应格逐位一致（===）',
    strictBad.length === 0, strictBad.map(k => k + ':' + (iCashJ[k] && iCashJ[k].v) + ' vs ' + (dCashJ[k] && dCashJ[k].v)).join(','));
}

console.log('\n=== j) 参数单一数据源自检结果：' + (jChecks - jFailed) + '/' + jChecks + ' 通过' + (jFailed ? '（存在未通过项）' : '') + ' ===');

console.log('\n=== 动态投资分析自检结果：' + (dynChecks - dynFailed) + '/' + dynChecks + ' 通过' + (dynFailed ? '（存在未通过项）' : '') + ' ===');
console.log('=== 全部自检结果：' + ((dynChecks - dynFailed) + (hChecks - hFailed) + (iChecks - iFailed) + (jChecks - jFailed)) + '/' + (dynChecks + hChecks + iChecks + jChecks) + ' 通过' + ((dynFailed + hFailed + iFailed + jFailed) ? '（存在未通过项）' : '') + ' ===');
if (dynFailed + hFailed + iFailed + jFailed > 0) process.exitCode = 1;

console.log('\n自检完成');
