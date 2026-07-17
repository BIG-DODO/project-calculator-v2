// 投资估算与静态分析自检脚本
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
console.log('年租金收入(元/年/㎡):', sa.rent.yearlyRent);
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

console.log('\n自检完成');
