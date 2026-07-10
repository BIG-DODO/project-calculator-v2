// 测试 enrichConfigs
const { enrichConfigs } = require('./product-config-algorithm-v2.js');

const bhConfigs = [
  { id: 'split', type: '分栋厂房', base: 1000, unitCap: 3000, unitArea: 3000, floors: 3, totalHeight: 18, isLow: true },
  { id: 'split', type: '分栋厂房', base: 1200, unitCap: 3600, unitArea: 3600, floors: 3, totalHeight: 18, isLow: true }
];

const blConfigs = [
  { id: 'layer', type: '分层厂房', base: 1000, unitCap: 10000, unitArea: 10000, floors: 10, totalHeight: 50, isLow: false },
  { id: 'layer', type: '分层厂房', base: 1200, unitCap: 12000, unitArea: 12000, floors: 10, totalHeight: 50, isLow: false }
];

const landArea = 50000;

const enrichedBh = enrichConfigs(bhConfigs, landArea);
const enrichedBl = enrichConfigs(blConfigs, landArea);

console.log('原始 bhConfigs:', bhConfigs.length, '丰富后:', enrichedBh.length);
console.log('原始 blConfigs:', blConfigs.length, '丰富后:', enrichedBl.length);
console.log('丰富后 bh:', enrichedBh.map(c => c.base));
console.log('丰富后 bl:', enrichedBl.map(c => c.base));
