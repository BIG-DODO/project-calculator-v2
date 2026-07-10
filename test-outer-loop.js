// 测试 runOuterLoop 的 bug
const { runOuterLoop, calcTotals, solveCoreAlgorithm } = require('./product-config-algorithm-v2.js');

// 模拟场景10的参数
const bhConfigs = [
  { id: 'split', type: '分栋厂房', base: 1000, unitCap: 3000, unitArea: 3000, floors: 3, totalHeight: 18, isLow: true },
  { id: 'split', type: '分栋厂房', base: 1200, unitCap: 3600, unitArea: 3600, floors: 3, totalHeight: 18, isLow: true }
];

const blConfigs = [
  { id: 'layer', type: '分层厂房', base: 1000, unitCap: 10000, unitArea: 10000, floors: 10, totalHeight: 50, isLow: false },
  { id: 'layer', type: '分层厂房', base: 1200, unitCap: 12000, unitArea: 12000, floors: 10, totalHeight: 50, isLow: false }
];

const fixedFactoryConfigs = [];

const remainingBase = 50000;
const remainingCap = 140000;
const landArea = 50000;
const far = 2.8;
const density = 0.4;
const targetBase = landArea * density; // 20000
const targetCap = landArea * far; // 140000

const fixedProductsBase = 0;
const fixedProductsCap = 0;

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

console.log('runOuterLoop 结果:', result);
console.log('totals:', result.totals);
console.log('counts:', result.counts);
