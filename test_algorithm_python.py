#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
产品配置算法 - Python完整版验证
按照Excel算法规则实现
"""

import math
from typing import List, Dict, Tuple, Optional

def calculate_product_config(params: Dict) -> Dict:
    """
    主入口函数：计算产品配置
    """
    land_area = params['landArea']
    far = params['far']
    height_limit = params.get('heightLimit', 150)
    ancillary_ratio = params.get('ancillaryRatio', 0)
    rd_ratio = params.get('rdRatio', 0)
    selected_products = set(params['selectedProducts'])
    product_options = params['productOptions']
    
    density = 0.45 if far < 1.5 else (0.42 if far < 2.0 else 0.40)
    target_base = land_area * density
    target_cap = land_area * far
    
    target_above_ground = target_cap
    target_rd_area = target_above_ground * rd_ratio
    target_ancillary_area = target_above_ground * ancillary_ratio
    
    # 1. 收集分层厂房高度
    max_layer_height = 0
    min_layer_height = float('inf')
    
    if 'layer' in selected_products:
        layer_opts = product_options.get('layer', {})
        for floor in layer_opts.get('floors', []):
            h = 7.2 + 5.1 + 4.5 * (floor - 2) + 1.2
            max_layer_height = max(max_layer_height, h)
            min_layer_height = min(min_layer_height, h)
    
    if max_layer_height == 0:
        max_layer_height = 30.3 + 1.2
    if min_layer_height == float('inf'):
        min_layer_height = 30.3 + 1.2
    
    # 2. 固定产品计算
    all_configs = []
    tower_area = tower_base = tower_cap = 0
    dorm_area = dorm_base = dorm_cap = 0
    support_area = support_base = support_cap = 0
    
    # 产业大厦
    if 'tower' in selected_products:
        area_ref = product_options['tower']['areas'][0]
        target_area = target_rd_area
        
        floors = max(3, math.ceil(target_area / area_ref))
        total_h = 6.6 + 4.5 * (floors - 2) + 4.5 + 1.2
        
        if total_h > height_limit:
            floors = max(3, math.floor((height_limit - 6.6 - 4.5 - 1.2) / 4.5) + 2)
            total_h = 6.6 + 4.5 * (floors - 2) + 4.5 + 1.2
        
        exact_base = target_area / floors
        final_base = math.floor(exact_base / 50) * 50
        actual_area = final_base * floors
        
        if abs(actual_area - target_area) / target_area > 0.002:
            final_base = math.floor(exact_base / 20) * 20
            actual_area = final_base * floors
        
        total_h = 6.6 + 4.5 * (floors - 2) + 4.5 + 1.2
        if max_layer_height > 0 and total_h < max_layer_height:
            while total_h < max_layer_height:
                floors += 1
                total_h = 6.6 + 4.5 * (floors - 2) + 4.5 + 1.2
                if total_h > height_limit:
                    floors -= 1
                    total_h = 6.6 + 4.5 * (floors - 2) + 4.5 + 1.2
                    break
            actual_area = final_base * floors
        
        pax_lift = max(1, math.ceil(actual_area / 4000) - 2)
        
        all_configs.append({
            'id': 'tower', 'type': '产业大厦', 'base': final_base,
            'unitCap': actual_area, 'unitArea': actual_area,
            'floors': floors, 'totalHeight': total_h, 'count': 1
        })
        
        tower_area = actual_area
        tower_base = final_base
        tower_cap = actual_area
    
    # 配套用房
    if 'dorm' in selected_products or 'support' in selected_products:
        total_ancillary = target_ancillary_area
        tower_cfg = next((c for c in all_configs if c['id'] == 'tower'), None)
        tower_h = tower_cfg['totalHeight'] if tower_cfg else max_layer_height
        
        # 规则1: 总面积 <= 2400 且选了配套楼
        if total_ancillary <= 2400 and 'support' in selected_products:
            support_floors = 3
            exact_base = total_ancillary / support_floors
            support_base = math.floor(exact_base / 50) * 50
            final_support_cap = support_base * support_floors
            
            if abs(final_support_cap - total_ancillary) / total_ancillary > 0.002:
                support_base = math.floor(exact_base / 20) * 20
                final_support_cap = support_base * support_floors
            
            total_h = 7.2 + 5.1 + 4.5 + 1.2
            all_configs.append({
                'id': 'support', 'type': '配套楼', 'base': support_base,
                'unitCap': final_support_cap, 'unitArea': final_support_cap,
                'floors': support_floors, 'totalHeight': total_h, 'count': 1
            })
            
            support_area = final_support_cap
            support_base = support_base
            support_cap = final_support_cap
        
        # 规则2: 2:1分配
        elif 'dorm' in selected_products and 'support' in selected_products:
            support_cap_calc = total_ancillary / 3
            skip_dorm = False
            
            if support_cap_calc > 2400:
                final_support_cap = 2400
                support_base = 800
            elif support_cap_calc < 1200:
                if 1200 > total_ancillary:
                    exact_base = total_ancillary / 3
                    support_base = math.floor(exact_base / 50) * 50
                    final_support_cap = support_base * 3
                    if abs(final_support_cap - total_ancillary) / total_ancillary > 0.002:
                        support_base = math.floor(exact_base / 20) * 20
                        final_support_cap = support_base * 3
                    skip_dorm = True
                else:
                    final_support_cap = 1200
                    support_base = 400
            else:
                exact_base = support_cap_calc / 3
                support_base = math.floor(exact_base / 50) * 50
                final_support_cap = support_base * 3
                if abs(final_support_cap - support_cap_calc) / support_cap_calc > 0.002:
                    support_base = math.floor(exact_base / 20) * 20
                    final_support_cap = support_base * 3
            
            total_h = 7.2 + 5.1 + 4.5 + 1.2
            all_configs.append({
                'id': 'support', 'type': '配套楼', 'base': support_base,
                'unitCap': final_support_cap, 'unitArea': final_support_cap,
                'floors': 3, 'totalHeight': total_h, 'count': 1
            })
            
            support_area = final_support_cap
            support_cap = final_support_cap
            
            if not skip_dorm:
                dorm_cap = total_ancillary - final_support_cap
                est_floors = max(2, math.floor((tower_h - 4.8 - 1.2) / 3.6) + 1)
                single_area = dorm_cap / est_floors
                
                if single_area < 800:
                    base = 800
                elif single_area > 1200:
                    base = 1200
                else:
                    base = round(single_area / 100) * 100
                
                floors = max(2, math.ceil(dorm_cap / base))
                total_h = 4.8 + 3.6 * (floors - 2) + 1.2
                
                if total_h > min_layer_height:
                    total_h = 4.8 + 3.3 * (floors - 2) + 1.2
                    if total_h > min_layer_height:
                        while total_h > min_layer_height and floors > 2:
                            floors -= 1
                            total_h = 4.8 + 3.3 * (floors - 2) + 1.2
                
                if total_h > tower_h:
                    total_h = 4.8 + 3.3 * (floors - 2) + 1.2
                    if total_h > tower_h:
                        while total_h > tower_h and floors > 2:
                            floors -= 1
                            total_h = 4.8 + 3.3 * (floors - 2) + 1.2
                
                unit_area = base * floors
                unit_cap = unit_area
                
                all_configs.append({
                    'id': 'dorm', 'type': '配套宿舍', 'base': base,
                    'unitCap': unit_cap, 'unitArea': unit_area,
                    'floors': floors, 'totalHeight': total_h, 'count': 1
                })
                
                dorm_area = unit_area
                dorm_base = base
                dorm_cap = unit_cap
        
        # 仅有配套宿舍
        elif 'dorm' in selected_products:
            est_floors = max(2, math.floor((min_layer_height - 4.8 - 1.2) / 3.6) + 1)
            single_area = target_ancillary_area / est_floors
            
            if single_area < 800:
                base = 800
            elif single_area > 1200:
                base = 1200
            else:
                base = round(single_area / 100) * 100
            
            floors = max(2, math.ceil(target_ancillary_area / base))
            total_h = 4.8 + 3.6 * (floors - 2) + 1.2
            
            if total_h > min_layer_height:
                total_h = 4.8 + 3.3 * (floors - 2) + 1.2
                if total_h > min_layer_height:
                    while total_h > min_layer_height and floors > 2:
                        floors -= 1
                        total_h = 4.8 + 3.3 * (floors - 2) + 1.2
            
            if total_h > tower_h:
                total_h = 4.8 + 3.3 * (floors - 2) + 1.2
                if total_h > tower_h:
                    while total_h > tower_h and floors > 2:
                        floors -= 1
                        total_h = 4.8 + 3.3 * (floors - 2) + 1.2
            
            unit_area = base * floors
            unit_cap = unit_area
            
            all_configs.append({
                'id': 'dorm', 'type': '配套宿舍', 'base': base,
                'unitCap': unit_cap, 'unitArea': unit_area,
                'floors': floors, 'totalHeight': total_h, 'count': 1
            })
            
            dorm_area = unit_area
            dorm_base = base
            dorm_cap = unit_cap
        
        # 仅有配套楼
        elif 'support' in selected_products:
            support_area_input = product_options['support']['areas'][0]
            floors = 3
            support_base_input = round(support_area_input / 3)
            total_h = 7.2 + 5.1 + 4.5 + 1.2
            final_area = support_area_input
            
            actual_ratio = support_area_input / target_above_ground
            if abs(actual_ratio - ancillary_ratio) > 0.001:
                target_area = target_ancillary_area
                rounded = round(target_area / 100) * 100
                if abs(rounded - support_area_input) / target_above_ground <= 0.001:
                    final_area = rounded
            
            all_configs.append({
                'id': 'support', 'type': '配套楼', 'base': support_base_input,
                'unitCap': final_area, 'unitArea': final_area,
                'floors': floors, 'totalHeight': total_h, 'count': 1
            })
            
            support_area = final_area
            support_base = support_base_input
            support_cap = final_area
    
    # 3. 厂房预处理（FL固化）
    fixed_base = tower_base + dorm_base + support_base
    fixed_cap = tower_cap + dorm_cap + support_cap
    
    remaining_base = target_base - fixed_base
    remaining_cap = target_cap - fixed_cap
    
    # 收集厂房类型
    factory_types = []
    if 'light-steel' in selected_products:
        factory_types.append({'id': 'light-steel', 'name': '轻钢厂房', 'isLow': True})
    if 'split' in selected_products:
        factory_types.append({'id': 'split', 'name': '分栋厂房', 'isLow': True})
    if 'layer' in selected_products:
        factory_types.append({'id': 'layer', 'name': '分层厂房', 'isLow': False})
    
    # 创建Bh和Bl配置
    bh_configs = []
    bl_configs = []
    fixed_factory_configs = []
    
    if len(factory_types) == 1:
        # 单一厂房类型
        ft = factory_types[0]
        floors = [2.1] if ft['id'] == 'light-steel' else product_options[ft['id']]['floors']
        
        if len(floors) > 1:
            high_floor = max(floors)
            low_floor = min(floors)
            bh_configs, bl_configs = create_bh_bl_configs(
                ft['id'], high_floor, ft['id'], low_floor,
                product_options, height_limit
            )
        else:
            floor = floors[0]
            bh_configs, _ = create_bh_bl_configs(
                ft['id'], floor, None, None,
                product_options, height_limit
            )
    
    elif len(factory_types) == 2:
        # 两种厂房类型
        type_a = factory_types[0]
        type_b = factory_types[1]
        floors_a = [2.1] if type_a['id'] == 'light-steel' else product_options[type_a['id']]['floors']
        floors_b = [2.1] if type_b['id'] == 'light-steel' else product_options[type_b['id']]['floors']
        
        if len(floors_a) > 1 or len(floors_b) > 1:
            # FL预处理（简化版）
            pass
        else:
            floor_a = floors_a[0]
            floor_b = floors_b[0]
            bh_type = type_a['id'] if floor_a > floor_b else type_b['id']
            bl_type = type_a['id'] if floor_a > floor_b else type_b['id']
            bh_floor = max(floor_a, floor_b)
            bl_floor = min(floor_a, floor_b)
            bh_configs, bl_configs = create_bh_bl_configs(
                bh_type, bh_floor, bl_type, bl_floor,
                product_options, height_limit
            )
    
    elif len(factory_types) == 3:
        # 三种厂房类型：强制分配1栋分层，剩余分栋+轻钢
        layer_opts = product_options['layer']
        min_floor = min(layer_opts['floors'])
        min_area = min(layer_opts['areas'])
        base = min_area * 2 if min_area in [600, 800] else min_area
        
        fixed_factory_configs.append({
            'id': 'layer', 'type': '分层厂房', 'base': base,
            'unitCap': base * min_floor, 'unitArea': base * min_floor,
            'floors': min_floor, 'totalHeight': 7.2 + 5.1 + 4.5 * (min_floor - 2) + 1.2,
            'count': 1
        })
        
        fixed_base += base
        fixed_cap += base * min_floor
        remaining_base = target_base - fixed_base
        remaining_cap = target_cap - fixed_cap
        
        # 剩余：分栋+轻钢
        split_floors = product_options['split']['floors']
        if len(split_floors) > 1:
            # FL预处理分栋
            pass
        else:
            split_floor = split_floors[0]
            bh_floor = max(split_floor, 2.1)
            bl_floor = min(split_floor, 2.1)
            bh_type = 'split' if bh_floor == split_floor else 'light-steel'
            bl_type = 'light-steel' if bh_type == 'split' else 'split'
            bh_configs, bl_configs = create_bh_bl_configs(
                bh_type, bh_floor, bl_type, bl_floor,
                product_options, height_limit
            )
    
    # 4. 核心算法（Bh/Bl遍历）
    final_counts = []
    
    if bh_configs and bl_configs:
        final_counts = solve_core_algorithm(
            bh_configs, bl_configs, remaining_base, remaining_cap, land_area
        )
    elif bh_configs:
        final_counts = solve_single_type(bh_configs, remaining_cap, remaining_base)
    elif bl_configs:
        final_counts = solve_single_type(bl_configs, remaining_cap, remaining_base)
    
    # 5. 外层循环优化
    optimized_result = run_outer_loop(
        final_counts, bh_configs, bl_configs, fixed_factory_configs,
        remaining_base, remaining_cap, land_area, far, density,
        target_base, target_cap
    )
    
    # 6. Finalize
    result = finalize_config(
        optimized_result, all_configs, fixed_factory_configs,
        land_area, far, density, target_base, target_cap
    )
    
    return result


def create_bh_bl_configs(bh_type, bh_floor, bl_type, bl_floor, product_options, height_limit):
    """创建Bh和Bl的配置数组"""
    bh_configs = []
    bl_configs = []
    
    if bh_type:
        bh_opts = product_options[bh_type]
        for area in bh_opts['areas']:
            base = area
            if bh_type == 'layer' and area in [600, 800]:
                base = area * 2
            
            if bh_type == 'light-steel':
                unit_cap = area * 2 + 200
                unit_area = area + 400
                total_h = 13.2
            elif bh_type == 'split':
                if bh_floor == 3.5:
                    total_h = 22.5 + 1.2
                    unit_area = base * 4
                    unit_cap = base * 3.5
                else:
                    total_h = 7.2 + 5.1 + 4.5 * (bh_floor - 2) + 1.2
                    unit_area = base * bh_floor
                    unit_cap = base * bh_floor
            else:  # layer
                total_h = 7.2 + 5.1 + 4.5 * (bh_floor - 2) + 1.2
                unit_area = base * bh_floor
                unit_cap = base * bh_floor
            
            if total_h > height_limit:
                continue
            
            bh_configs.append({
                'id': bh_type, 'base': base, 'unitCap': unit_cap,
                'unitArea': unit_area, 'floors': bh_floor,
                'totalHeight': total_h, 'isLow': bh_type != 'layer'
            })
    
    if bl_type:
        bl_opts = product_options[bl_type]
        for area in bl_opts['areas']:
            base = area
            if bl_type == 'layer' and area in [600, 800]:
                base = area * 2
            
            if bl_type == 'light-steel':
                unit_cap = area * 2 + 200
                unit_area = area + 400
                total_h = 13.2
            elif bl_type == 'split':
                if bl_floor == 3.5:
                    total_h = 22.5 + 1.2
                    unit_area = base * 4
                    unit_cap = base * 3.5
                else:
                    total_h = 7.2 + 5.1 + 4.5 * (bl_floor - 2) + 1.2
                    unit_area = base * bl_floor
                    unit_cap = base * bl_floor
            else:  # layer
                total_h = 7.2 + 5.1 + 4.5 * (bl_floor - 2) + 1.2
                unit_area = base * bl_floor
                unit_cap = base * bl_floor
            
            if total_h > height_limit:
                continue
            
            bl_configs.append({
                'id': bl_type, 'base': base, 'unitCap': unit_cap,
                'unitArea': unit_area, 'floors': bl_floor,
                'totalHeight': total_h, 'isLow': bl_type != 'layer'
            })
    
    return bh_configs, bl_configs


def solve_core_algorithm(bh_configs, bl_configs, remaining_base, remaining_cap, land_area):
    """核心算法：Bh/Bl方程求解"""
    if not bh_configs or not bl_configs:
        return []
    
    eff_bh = sum(c['unitCap'] / c['base'] for c in bh_configs) / len(bh_configs)
    eff_bl = sum(c['unitCap'] / c['base'] for c in bl_configs) / len(bl_configs)
    
    x = (remaining_cap - eff_bl * remaining_base) / (eff_bh - eff_bl)
    y = remaining_base - x
    
    if x > 0 and y > 0:
        target_cap_bh = eff_bh * x
        target_cap_bl = eff_bl * y
        target_base_bh = x
        target_base_bl = y
    else:
        total_eff = eff_bh + eff_bl
        target_cap_bh = remaining_cap * (eff_bh / total_eff)
        target_cap_bl = remaining_cap * (eff_bl / total_eff)
        target_base_bh = remaining_base * (eff_bh / total_eff)
        target_base_bl = remaining_base * (eff_bl / total_eff)
    
    bh_result = solve_integer_equation(target_cap_bh, bh_configs, target_base_bh * 1.05)
    bl_result = solve_integer_equation(target_cap_bl, bl_configs, target_base_bl * 1.05)
    
    return bh_result['counts'] + bl_result['counts']


def solve_single_type(configs, target_cap, target_base):
    """单一类型求解"""
    result = solve_integer_equation(target_cap, configs, target_base * 1.05)
    return result['counts']


def solve_integer_equation(target_cap, configs, target_base_limit):
    """整数方程求解：遍历栋数组合"""
    k = len(configs)
    if k == 0:
        return {'counts': [], 'totalCap': 0, 'totalBase': 0}
    
    if k == 1:
        c = configs[0]
        n = max(1, round(target_cap / c['unitCap']))
        return {
            'counts': [n],
            'totalCap': c['unitCap'] * n,
            'totalBase': c['base'] * n
        }
    
    best = None
    best_score = float('inf')
    
    def dfs(idx, current, current_cap, current_base):
        nonlocal best, best_score
        
        if idx == k - 1:
            c = configs[idx]
            n = max(0, round((target_cap - current_cap) / c['unitCap']))
            for dn in range(-15, 16):
                nn = max(0, n + dn)
                tc = current_cap + c['unitCap'] * nn
                tb = current_base + c['base'] * nn
                diff = abs(tc - target_cap)
                
                if target_base_limit and tb > target_base_limit:
                    continue
                
                all_counts = current + [nn]
                non_zero = sum(1 for x in all_counts if x > 0)
                penalty = 50000 if (k >= 2 and non_zero < 2) else 0
                
                score = diff + penalty
                
                if score < best_score:
                    best_score = score
                    best = all_counts.copy()
            return
        
        c = configs[idx]
        n = max(0, round((target_cap - current_cap) / c['unitCap']))
        for dn in range(-15, 16):
            nn = max(0, n + dn)
            dfs(idx + 1, current + [nn], current_cap + c['unitCap'] * nn, current_base + c['base'] * nn)
    
    dfs(0, [], 0, 0)
    
    if not best:
        sorted_configs = sorted(enumerate(configs), key=lambda x: x[1]['unitCap'] / x[1]['base'], reverse=True)
        primary = sorted_configs[0][1]
        n = max(2, round(target_cap / primary['unitCap']))
        result = [0] * k
        result[sorted_configs[0][0]] = max(1, n - 1)
        if k >= 2:
            result[sorted_configs[1][0]] = 1
        
        total_cap = sum(c['unitCap'] * result[i] for i, c in enumerate(configs))
        total_base = sum(c['base'] * result[i] for i, c in enumerate(configs))
        return {'counts': result, 'totalCap': total_cap, 'totalBase': total_base}
    
    total_cap = sum(c['unitCap'] * best[i] for i, c in enumerate(configs))
    total_base = sum(c['base'] * best[i] for i, c in enumerate(configs))
    return {'counts': best, 'totalCap': total_cap, 'totalBase': total_base}


def run_outer_loop(final_counts, bh_configs, bl_configs, fixed_factory_configs,
                     remaining_base, remaining_cap, land_area, far, density,
                     target_base, target_cap):
    """外层循环优化"""
    cap_lo = target_cap * 0.995
    cap_hi = target_cap * 1.005
    
    counts = final_counts.copy() if final_counts else []
    all_configs = bh_configs + bl_configs
    
    if not counts:
        counts = [0] * len(all_configs)
    
    # 粗调
    totals = calc_totals(counts, all_configs, fixed_factory_configs)
    
    while totals['cap'] < cap_lo:
        best_idx = -1
        best_eff = 0
        for i, c in enumerate(all_configs):
            eff = c['unitCap'] / c['base']
            if eff > best_eff:
                best_eff = eff
                best_idx = i
        if best_idx == -1:
            break
        counts[best_idx] += 1
        totals = calc_totals(counts, all_configs, fixed_factory_configs)
    
    while totals['cap'] > cap_hi:
        best_idx = -1
        best_score = float('inf')
        for i, c in enumerate(all_configs):
            if counts[i] <= 0:
                continue
            score = c['unitCap'] / c['base'] - 100 if c['isLow'] else c['unitCap'] / c['base']
            if score < best_score:
                best_score = score
                best_idx = i
        if best_idx == -1:
            break
        counts[best_idx] -= 1
        totals = calc_totals(counts, all_configs, fixed_factory_configs)
    
    return {'counts': counts, 'totals': totals}


def calc_totals(counts, all_configs, fixed_configs):
    """计算总计"""
    base = 0
    cap = 0
    for i, c in enumerate(all_configs):
        base += c['base'] * counts[i]
        cap += c['unitCap'] * counts[i]
    for c in fixed_configs:
        base += c['base'] * c['count']
        cap += c['unitCap'] * c['count']
    return {'base': base, 'cap': cap}


def finalize_config(optimized_result, all_configs, fixed_factory_configs,
                    land_area, far, density, target_base, target_cap):
    """Finalize：生成最终配置"""
    products = []
    total_base = 0
    total_area = 0
    total_cap = 0
    total_count = 0
    
    # 添加固定产品
    for c in all_configs:
        products.append({
            'type': c['type'],
            'base': c['base'],
            'unitCap': c['unitCap'],
            'unitArea': c['unitArea'],
            'count': c.get('count', 1),
            'totalBase': c['base'] * c.get('count', 1),
            'totalArea': c['unitArea'] * c.get('count', 1),
            'totalCap': c['unitCap'] * c.get('count', 1)
        })
        total_base += c['base'] * c.get('count', 1)
        total_area += c['unitArea'] * c.get('count', 1)
        total_cap += c['unitCap'] * c.get('count', 1)
        total_count += c.get('count', 1)
    
    # 添加FL固定的厂房
    for c in fixed_factory_configs:
        products.append({
            'type': c['type'],
            'base': c['base'],
            'unitCap': c['unitCap'],
            'unitArea': c['unitArea'],
            'count': c['count'],
            'totalBase': c['base'] * c['count'],
            'totalArea': c['unitArea'] * c['count'],
            'totalCap': c['unitCap'] * c['count']
        })
        total_base += c['base'] * c['count']
        total_area += c['unitArea'] * c['count']
        total_cap += c['unitCap'] * c['count']
        total_count += c['count']
    
    actual_density = total_base / land_area
    actual_far = total_cap / land_area
    
    return {
        'products': products,
        'totalBase': total_base,
        'totalArea': total_area,
        'totalCap': total_cap,
        'totalCount': total_count,
        '_check': {
            'targetDensity': density,
            'actualDensity': actual_density,
            'targetFar': far,
            'actualFar': actual_far,
            'targetBase': target_base,
            'targetCap': target_cap
        }
    }


# 测试函数
def run_tests():
    """运行10组测试"""
    test_scenarios = [
        {
            'name': '1-SingleSplit-SingleFloor',
            'params': {
                'landArea': 20000, 'far': 1.2, 'heightLimit': 50,
                'ancillaryRatio': 0, 'rdRatio': 0,
                'selectedProducts': ['split'],
                'productOptions': {'split': {'floors': [4], 'areas': [800, 1000]}}
            }
        },
        {
            'name': '2-SingleSplit-TwoFloors',
            'params': {
                'landArea': 30000, 'far': 1.5, 'heightLimit': 50,
                'ancillaryRatio': 0, 'rdRatio': 0,
                'selectedProducts': ['split'],
                'productOptions': {'split': {'floors': [3, 4], 'areas': [800, 1000]}}
            }
        },
        {
            'name': '3-Split+LightSteel',
            'params': {
                'landArea': 25000, 'far': 1.3, 'heightLimit': 50,
                'ancillaryRatio': 0, 'rdRatio': 0,
                'selectedProducts': ['split', 'light-steel'],
                'productOptions': {
                    'split': {'floors': [4], 'areas': [800, 1000]},
                    'light-steel': {'areas': [2000, 3000]}
                }
            }
        },
        {
            'name': '4-Split+Layer',
            'params': {
                'landArea': 40000, 'far': 2.0, 'heightLimit': 50,
                'ancillaryRatio': 0, 'rdRatio': 0,
                'selectedProducts': ['split', 'layer'],
                'productOptions': {
                    'split': {'floors': [4], 'areas': [800, 1000]},
                    'layer': {'floors': [6, 8], 'areas': [800, 1000]}
                }
            }
        },
        {
            'name': '5-ThreeTypes',
            'params': {
                'landArea': 50000, 'far': 2.2, 'heightLimit': 60,
                'ancillaryRatio': 0, 'rdRatio': 0,
                'selectedProducts': ['split', 'layer', 'light-steel'],
                'productOptions': {
                    'split': {'floors': [4], 'areas': [800, 1000]},
                    'layer': {'floors': [6, 8], 'areas': [800, 1000]},
                    'light-steel': {'areas': [2000, 3000]}
                }
            }
        },
        {
            'name': '6-WithTower',
            'params': {
                'landArea': 50000, 'far': 2.5, 'heightLimit': 80,
                'ancillaryRatio': 0, 'rdRatio': 0.15,
                'selectedProducts': ['tower', 'split', 'layer'],
                'productOptions': {
                    'tower': {'areas': [2000]},
                    'split': {'floors': [4], 'areas': [800, 1000]},
                    'layer': {'floors': [6, 8], 'areas': [800, 1000]}
                }
            }
        },
        {
            'name': '7-WithDorm+Support',
            'params': {
                'landArea': 30000, 'far': 1.8, 'heightLimit': 50,
                'ancillaryRatio': 0.12, 'rdRatio': 0,
                'selectedProducts': ['split', 'dorm', 'support'],
                'productOptions': {
                    'split': {'floors': [4], 'areas': [800, 1000]},
                    'support': {'areas': [1800]}
                }
            }
        },
        {
            'name': '8-ShanghaiC65',
            'params': {
                'landArea': 40000, 'far': 2.5, 'heightLimit': 80,
                'ancillaryRatio': 0.10, 'rdRatio': 0.10,
                'selectedProducts': ['tower', 'split', 'layer', 'dorm', 'support'],
                'productOptions': {
                    'tower': {'areas': [2000]},
                    'split': {'floors': [4], 'areas': [800, 1000]},
                    'layer': {'floors': [6, 8], 'areas': [800, 1000]},
                    'support': {'areas': [1800]}
                }
            }
        },
        {
            'name': '9-LowFAR',
            'params': {
                'landArea': 20000, 'far': 1.0, 'heightLimit': 50,
                'ancillaryRatio': 0, 'rdRatio': 0,
                'selectedProducts': ['light-steel', 'split'],
                'productOptions': {
                    'light-steel': {'areas': [2000, 3000]},
                    'split': {'floors': [2, 3], 'areas': [800, 1000]}
                }
            }
        },
        {
            'name': '10-HighFAR',
            'params': {
                'landArea': 30000, 'far': 3.0, 'heightLimit': 100,
                'ancillaryRatio': 0, 'rdRatio': 0.15,
                'selectedProducts': ['layer', 'tower'],
                'productOptions': {
                    'layer': {'floors': [8, 10], 'areas': [1000, 1200]},
                    'tower': {'areas': [2400]}
                }
            }
        }
    ]
    
    print('=' * 70)
    print('Python完整版算法测试')
    print('=' * 70)
    print()
    
    results = []
    
    for scenario in test_scenarios:
        print(f'TEST: {scenario["name"]}')
        params = scenario['params']
        land_area = params['landArea']
        far = params['far']
        density = 0.45 if far < 1.5 else (0.42 if far < 2.0 else 0.40)
        target_base = land_area * density
        target_cap = land_area * far
        
        print(f'  Params: S={land_area}, F={far}, Density={density*100:.0f}%')
        print(f'  Target: Base={target_base:.0f}, Cap={target_cap:.0f}')
        print(f'  Products: {", ".join(params["selectedProducts"])}')
        
        try:
            result = calculate_product_config(params)
            
            actual_density = result['totalBase'] / land_area
            actual_far = result['totalCap'] / land_area
            density_diff = abs(actual_density - density) / density * 100
            far_diff = abs(actual_far - far) / far * 100
            
            print(f'  Result: Base={result["totalBase"]:.0f}, Cap={result["totalCap"]:.0f}')
            print(f'  Density: {actual_density*100:.2f}% (diff={density_diff:.2f}%)')
            print(f'  FAR: {actual_far:.4f} (diff={far_diff:.4f}%)')
            
            if result['products']:
                print(f'  Products:')
                for p in result['products']:
                    print(f'    {p["type"]}: {p["count"]}栋 x {p["base"]}m² = 计容{p["totalCap"]}m²')
            
            results.append({
                'name': scenario['name'],
                'success': True,
                'densityDiff': density_diff,
                'farDiff': far_diff
            })
            
        except Exception as e:
            print(f'  ERROR: {e}')
            results.append({
                'name': scenario['name'],
                'success': False,
                'error': str(e)
            })
        
        print()
    
    # Summary
    print('=' * 70)
    print('SUMMARY')
    print('=' * 70)
    print()
    
    pass_count = 0
    fail_count = 0
    
    for r in results:
        if not r['success']:
            print(f'FAIL: {r["name"]} - {r["error"]}')
            fail_count += 1
        elif r['densityDiff'] > 5 or r['farDiff'] > 0.01:
            print(f'WARN: {r["name"]} - Density={r["densityDiff"]:.2f}%, FAR={r["farDiff"]:.4f}%')
            fail_count += 1
        else:
            print(f'PASS: {r["name"]} - Density={r["densityDiff"]:.2f}%, FAR={r["farDiff"]:.4f}%')
            pass_count += 1
    
    print()
    print(f'Total: {pass_count} passed, {fail_count} failed/warned')
    print()
    print('=' * 70)


if __name__ == '__main__':
    run_tests()
