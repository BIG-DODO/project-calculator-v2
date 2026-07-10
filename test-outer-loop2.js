// 测试 runOuterLoop 的 bug - 更接近场景10
const { runOuterLoop, calcTotals, solveCoreAlgorithm } = require('./product-config-algorithm-v2.js');

// 模拟场景10的实际参数
const bhConfigs = [
  { id: 'split', type: '分栋厂房', base: 1000, unitCap: 3000, unitArea: 3000, floors: 3, totalHeight: 18, isLow: true },
  { id: 'split', type: '分栋厂房', base: 1200, unitCap: 3600, unitArea: 3600, floors: 3, totalHeight: 18, isLow: true }
];

const blConfigs = [
  { id: 'layer', type: '分层厂房', base: 1000, unitCap: 10000, unitArea: 10000, floors: 10, totalHeight: 50, isLow: false },
  { id: 'layer', type: '分层厂房', base: 1200, unitCap: 12000, unitArea: 12000, floors: 10, totalHeight: 50, isLow: false }
];

const fixedFactoryConfigs = [];

// 场景10：S=50000, F=2.8, D=0.4
// 产业大厦：基底800，计容12800
// 配套楼：基底800，计容2400
const landArea = 50000;
const far = 2.8;
const density = 0.4;
const targetBase = landArea * density; // 20000
const targetCap = landArea * far; // 140000

const fixedProductsBase = 800 + 800; // 1600
const fixedProductsCap = 12800 + 2400; // 15200

const remainingBase = targetBase - fixedProductsBase; // 18400
const remainingCap = targetCap - fixedProductsCap; // 124800

console.log('targetBase:', targetBase, 'targetCap:', targetCap);
console.log('fixedProductsBase:', fixedProductsBase, 'fixedProductsCap:', fixedProductsCap);
console.log('remainingBase:', remainingBase, 'remainingCap:', remainingCap);

// 先用 solveCoreAlgorithm
const finalCounts = solveCoreAlgorithm({
  bhConfigs, blConfigs, remainingBase, remainingCap, landArea
});

console.log('solveCoreAlgorithm 返回:', finalCounts);

// 然后 runOuterLoop
const result = runOuterLoop({
  finalCounts, bhConfigs, blConfigs, fixedFactoryConfigs,
  remainingBase, remainingCap, landArea, far, density,
  targetBase, targetCap,
  fixedProductsBase, fixedProductsCap
});

console.log('runOuterLoop 结果 counts:', result.counts);
console.log('runOuterLoop 结果 totals:', result.totals);

// 验证最终 totals
const totals = calcTotals(result.counts, result.bhConfigs, result.blConfigs, fixedFactoryConfigs);
totals.base += fixedProductsBase;
totals.cap += fixedProductsCap;
console.log('最终验证 totals:', totals);
console.log('密度:', totals.base / landArea, '目标:', density);
console.log('容积率:', totals.cap / landArea, '目标:', far);
