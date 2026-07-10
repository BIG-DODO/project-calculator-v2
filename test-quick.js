// 快速测试脚本 - 验证重写后的算法
const fs = require('fs');

// 读取算法文件
const algorithmCode = fs.readFileSync('./product-config-algorithm-v2.js', 'utf8');

// 由于算法文件依赖全局变量，我们需要模拟环境
global.projectData = {};
global.selectedProducts = new Set();
global.productOptions = {};

// 使用eval加载算法（仅用于测试）
eval(algorithmCode);

console.log('=== 算法函数加载检查 ===');
console.log('calculateProductConfig:', typeof calculateProductConfig);
console.log('validateInput:', typeof validateInput);
console.log('calcDensity:', typeof calcDensity);
console.log('preprocessLayerAreas:', typeof preprocessLayerAreas);
console.log('solveIntegerEquation:', typeof solveIntegerEquation);
console.log('checkDistribution:', typeof checkDistribution);
console.log('manualDistribute:', typeof manualDistribute);
console.log('enrichConfigs:', typeof enrichConfigs);
console.log('fineTune:', typeof fineTune);
console.log('convertToDuplex:', typeof convertToDuplex);

console.log('\n=== 测试1: calcDensity ===');
console.log('FAR=1.0:', calcDensity(1.0), '(期望: 0.45)');
console.log('FAR=1.5:', calcDensity(1.5), '(期望: 0.42)');
console.log('FAR=2.5:', calcDensity(2.5), '(期望: 0.40)');

console.log('\n=== 测试2: preprocessLayerAreas ===');
const result = preprocessLayerAreas([600, 800, 1000, 1200]);
console.log('输入: [600, 800, 1000, 1200]');
console.log('输出areas:', result.areas);
console.log('输出duplexSourceMap:', result.duplexSourceMap);

console.log('\n=== 测试3: validateInput ===');
const testData = {
  landArea: 50000,
  far: 1.2,
  heightLimit: 30,
  ancillaryRatio: 0.15,
  rdRatio: 0
};
const testProducts = new Set(['support', 'dorm']);
const testOptions = {
  'split': { floors: [2, 3.5], areas: [400, 670] },
  'support': { areas: [1800] }
};
const errors = validateInput(testData, testProducts, testOptions);
console.log('验证结果:', errors.length === 0 ? '通过' : errors);

console.log('\n=== 测试4: solveIntegerEquation（单配置）===');
const singleConfig = [{ base: 1000, unitCap: 3500, floors: 3.5 }];
const singleResult = solveIntegerEquation(10000, singleConfig, 5000);
console.log('目标计容: 10000, 配置: base=1000, unitCap=3500');
console.log('结果:', singleResult);

console.log('\n=== 测试5: solveIntegerEquation（多配置）===');
const multiConfigs = [
  { base: 540, unitCap: 1890, floors: 3.5 },
  { base: 800, unitCap: 2800, floors: 3.5 }
];
const multiResult = solveIntegerEquation(10000, multiConfigs, 5000);
console.log('目标计容: 10000, 配置: [540/1890, 800/2800]');
console.log('结果:', multiResult);

console.log('\n=== 测试6: manualDistribute ===');
const manualResult = manualDistribute(10000, 540, 800, 3.5);
console.log('S=10000, a=540, b=800, eff=3.5');
console.log('结果:', manualResult);

console.log('\n=== 测试7: checkDistribution ===');
const distConfigs = [
  { id: 'split', base: 540, unitCap: 1890 },
  { id: 'split', base: 800, unitCap: 2800 }
];
const distCounts = [8, 2]; // 8栋540, 2栋800
const distResult = checkDistribution(distCounts, distConfigs);
console.log('配置: 8栋540 + 2栋800');
console.log('分布检查结果:', distResult);

console.log('\n=== 测试8: convertToDuplex ===');
const duplexConfigs = [
  { id: 'layer', base: 1200, floors: 8, totalHeight: 40.5, duplexSource: 600 },
  { id: 'layer', base: 1000, floors: 8, totalHeight: 40.5, duplexSource: null },
  { id: 'split', base: 800, floors: 4, totalHeight: 30.3, duplexSource: null }
];
const duplexCounts = [4, 3, 5]; // 4栋1200(来自600), 3栋1000, 5栋800
const duplexResult = convertToDuplex(duplexCounts, duplexConfigs, {1200: 600});
console.log('输入: 4栋1200(来自600) + 3栋1000 + 5栋800');
console.log('输出:');
duplexResult.forEach((item, i) => {
  console.log(`  ${i+1}. ${item.type} ${item.note}: ${item.count}栋, 显示基底=${item.displayBase}, 实际基底=${item.actualBase}`);
});

console.log('\n=== 所有基础测试完成 ===');
