// 测试 runOuterLoop 的 bug - 详细版
const fs = require('fs');
const code = fs.readFileSync('./product-config-algorithm-v2.js', 'utf8');
eval(code);

const bhConfigs = [
  { id: 'split', type: '分栋厂房', base: 1000, unitCap: 3000, unitArea: 3000, floors: 3, totalHeight: 18, isLow: true },
  { id: 'split', type: '分栋厂房', base: 1200, unitCap: 3600, unitArea: 3600, floors: 3, totalHeight: 18, isLow: true }
];

const blConfigs = [
  { id: 'layer', type: '分层厂房', base: 1000, unitCap: 10000, unitArea: 10000, floors: 10, totalHeight: 50, isLow: false },
  { id: 'layer', type: '分层厂房', base: 1200, unitCap: 12000, unitArea: 12000, floors: 10, totalHeight: 50, isLow: false }
];

const fixedFactoryConfigs = [];

const landArea = 50000;
const far = 2.8;
const density = 0.4;
const targetBase = landArea * density;
const targetCap = landArea * far;

const fixedProductsBase = 1600;
const fixedProductsCap = 15200;

const remainingBase = targetBase - fixedProductsBase;
const remainingCap = targetCap - fixedProductsCap;

console.log('=== 测试 enrichConfigs ===');
const enrichedBh = enrichConfigs(bhConfigs, landArea);
const enrichedBl = enrichConfigs(blConfigs, landArea);
console.log('enrichedBh:', enrichedBh.length, enrichedBh.map(c => ({ base: c.base, unitCap: c.unitCap })));
console.log('enrichedBl:', enrichedBl.length, enrichedBl.map(c => ({ base: c.base, unitCap: c.unitCap })));

console.log('\n=== 测试 solveCoreAlgorithm ===');
const finalCounts = solveCoreAlgorithm({
  bhConfigs, blConfigs, remainingBase, remainingCap, landArea
});
console.log('finalCounts:', finalCounts);

console.log('\n=== 测试 runOuterLoop ===');
const result = runOuterLoop({
  finalCounts, bhConfigs, blConfigs, fixedFactoryConfigs,
  remainingBase, remainingCap, landArea, far, density,
  targetBase, targetCap,
  fixedProductsBase, fixedProductsCap
});

console.log('result.counts:', result.counts);
console.log('result.counts.length:', result.counts.length);
console.log('result.bhConfigs.length:', result.bhConfigs.length);
console.log('result.blConfigs.length:', result.blConfigs.length);
console.log('result.bhConfigs:', result.bhConfigs.map(c => c.base));
console.log('result.blConfigs:', result.blConfigs.map(c => c.base));
console.log('result.totals:', result.totals);
