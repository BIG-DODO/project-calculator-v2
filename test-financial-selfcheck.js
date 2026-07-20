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
}

console.log('\n=== 动态投资分析自检结果：' + (dynChecks - dynFailed) + '/' + dynChecks + ' 通过' + (dynFailed ? '（存在未通过项）' : '') + ' ===');
if (dynFailed > 0) process.exitCode = 1;

console.log('\n自检完成');
