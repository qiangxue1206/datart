/**
 * Datart
 *
 * Copyright 2021
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { ChartDatasetPageInfo } from 'app/types/ChartDataset';
import { ChartDataViewFieldType } from 'app/types/ChartDataView';
import { getStyleValue } from 'app/utils/chartHelper';
import {
  formatTime,
  getTime,
  recommendTimeRangeConverter,
} from 'app/utils/time';
import { FILTER_TIME_FORMATTER_IN_QUERY } from 'globalConstants';
import { isEmptyArray, IsKeyIn } from 'utils/object';
import {
  AggregateFieldActionType,
  ChartDataSectionConfig,
  ChartDataSectionField,
  ChartDataSectionType,
  ChartStyleSectionConfig,
  FilterConditionType,
  RelationFilterValue,
  SortActionType,
} from '../../../types/ChartConfig';
import ChartDataView from '../../../types/ChartDataView';

export type ChartRequest = {
  viewId: string;
  aggregators: Array<{ column: string; sqlOperator: string }>;
  expired?: number;
  filters: ChartRequestFilter[];
  flush?: boolean;
  groups?: Array<{ column: string }>;
  functionColumns?: Array<{ alias: string; snippet: string }>;
  limit?: any;
  nativeQuery?: boolean;
  orders: Array<{
    column: string;
    operator: SortActionType;
    aggOperator?: AggregateFieldActionType;
  }>;
  pageInfo?: ChartDatasetPageInfo;
  columns?: string[];
  script?: boolean;
  keywords?: string[];
  cache?: boolean;
  cacheExpires?: number;
  concurrencyControl?: boolean;
  concurrencyControlMode?: string;
  params?: Record<string, string[]>;
};

export type ChartRequestFilter = {
  aggOperator?: AggregateFieldActionType | null;
  column: string;
  sqlOperator: string;
  values?: Array<{
    value: string;
    valueType: string;
  }>;
};

export const transformToViewConfig = (viewConfig?: string) => {
  const viewConfigMap = viewConfig ? JSON.parse(viewConfig) : {};
  const obj = {};
  if (viewConfig) {
    const fields = [
      'cache',
      'cacheExpires',
      'concurrencyControl',
      'concurrencyControlMode',
    ];
    fields.forEach(v => {
      obj[v] = viewConfigMap?.[v];
    });
  }
  return obj;
};

export class ChartDataRequestBuilder {
  chartDataConfigs: ChartDataSectionConfig[];
  charSettingConfigs: ChartStyleSectionConfig[];
  pageInfo: ChartDatasetPageInfo;
  dataView: ChartDataView;
  script: boolean;
  aggregation?: boolean;
  private extraSorters: ChartRequest['orders'] = [];

  constructor(
    dataView: ChartDataView,
    dataConfigs?: ChartDataSectionConfig[],
    settingConfigs?: ChartStyleSectionConfig[],
    pageInfo?: ChartDatasetPageInfo,
    script?: boolean,
    aggregation?: boolean,
  ) {
    this.dataView = dataView;
    this.chartDataConfigs = dataConfigs || [];
    this.charSettingConfigs = settingConfigs || [];
    this.pageInfo = pageInfo || {};
    this.script = script || false;
    this.aggregation = aggregation;
  }
  private buildAggregators() {
    const aggColumns = this.chartDataConfigs.reduce<ChartDataSectionField[]>(
      (acc, cur) => {
        if (!cur.rows) {
          return acc;
        }

        if (this.aggregation === false) {
          return acc;
        }
        if (
          cur.type === ChartDataSectionType.AGGREGATE ||
          cur.type === ChartDataSectionType.SIZE ||
          cur.type === ChartDataSectionType.INFO
        ) {
          return acc.concat(cur.rows);
        }

        if (
          cur.type === ChartDataSectionType.MIXED &&
          !cur.rows?.every(v => v.type === ChartDataViewFieldType.NUMERIC)
        ) {
          return acc.concat(
            cur.rows.filter(v => v.type === ChartDataViewFieldType.NUMERIC),
          );
        }
        return acc;
      },
      [],
    );

    return aggColumns.map(aggCol => ({
      column: aggCol.colName,
      sqlOperator: aggCol.aggregate!,
    }));
  }

  private buildGroups() {
    const groupColumns = this.buildGroupColumns();

    return groupColumns.map(groupCol => ({ column: groupCol.colName }));
  }

  private buildFilters(): ChartRequestFilter[] {
    const fields: ChartDataSectionField[] = (this.chartDataConfigs || [])
      .reduce<ChartDataSectionField[]>((acc, cur) => {
        if (!cur.rows || cur.type !== ChartDataSectionType.FILTER) {
          return acc;
        }
        return acc.concat(cur.rows);
      }, [])
      .filter(col => Boolean(col.filter?.condition))
      .filter(col => {
        if (Array.isArray(col.filter?.condition?.value)) {
          return Boolean(col.filter?.condition?.value?.length);
        }
        return true;
      })
      .map(col => col);
    return this.normalizeFilters(fields);
  }

  private normalizeFilters = (fields: ChartDataSectionField[]) => {
    const _timeConverter = (visualType, value) => {
      if (visualType !== 'DATE') {
        return value;
      }
      if (Boolean(value) && typeof value === 'object' && 'unit' in value) {
        const time = getTime(+(value.direction + value.amount), value.unit)(
          value.unit,
          value.isStart,
        );
        return formatTime(time, FILTER_TIME_FORMATTER_IN_QUERY);
      }
      return formatTime(value, FILTER_TIME_FORMATTER_IN_QUERY);
    };

    const _transformFieldValues = (field: ChartDataSectionField) => {
      const conditionValue = field.filter?.condition?.value;
      if (!conditionValue) {
        return null;
      }
      if (Array.isArray(conditionValue)) {
        return conditionValue
          .map(v => {
            if (IsKeyIn(v as RelationFilterValue, 'key')) {
              const listItem = v as RelationFilterValue;
              if (!listItem.isSelected) {
                return undefined;
              }
              return {
                value: listItem.key,
                valueType: field.type,
              };
            } else {
              return {
                value: _timeConverter(field.filter?.condition?.visualType, v),
                valueType: field.type,
              };
            }
          })
          .filter(Boolean) as any[];
      }
      if (
        field?.filter?.condition?.type === FilterConditionType.RecommendTime
      ) {
        const timeRange = recommendTimeRangeConverter(conditionValue);
        return (timeRange || []).map(t => ({
          value: t,
          valueType: field.type,
        }));
      }
      return [
        {
          value: _timeConverter(
            field.filter?.condition?.visualType,
            conditionValue,
          ),
          valueType: field.type,
        },
      ];
    };

    return fields.map(field => ({
      aggOperator:
        field.aggregate === AggregateFieldActionType.NONE
          ? null
          : field.aggregate,
      column: field.colName,
      sqlOperator: field.filter?.condition?.operator!,
      values: _transformFieldValues(field) || [],
    }));
  };

  private buildOrders() {
    const sortColumns = this.chartDataConfigs
      .reduce<ChartDataSectionField[]>((acc, cur) => {
        if (!cur.rows) {
          return acc;
        }
        if (
          cur.type === ChartDataSectionType.GROUP ||
          cur.type === ChartDataSectionType.AGGREGATE ||
          cur.type === ChartDataSectionType.MIXED
        ) {
          return acc.concat(cur.rows);
        }
        return acc;
      }, [])
      .filter(
        col =>
          col?.sort?.type &&
          [SortActionType.ASC, SortActionType.DESC].includes(col?.sort?.type),
      );

    const originalSorters = sortColumns.map(aggCol => ({
      column: aggCol.colName,
      operator: aggCol.sort?.type!,
      aggOperator: aggCol.aggregate,
    }));

    return originalSorters
      .reduce<ChartRequest['orders']>((acc, cur) => {
        const uniqSorter = sorter =>
          `${sorter.column}-${
            sorter.aggOperator?.length > 0 ? sorter.aggOperator : ''
          }`;
        const newSorter = this.extraSorters?.find(
          extraSorter => uniqSorter(extraSorter) === uniqSorter(cur),
        );
        if (newSorter) {
          return acc;
        }
        return acc.concat([cur]);
      }, [])
      .concat(this.extraSorters as [])
      .filter(sorter => Boolean(sorter?.operator));
  }

  private buildPageInfo() {
    const settingStyles = this.charSettingConfigs;
    const pageSize = getStyleValue(settingStyles, ['paging', 'pageSize']);
    const enablePaging = getStyleValue(settingStyles, [
      'paging',
      'enablePaging',
    ]);
    return {
      countTotal: !!enablePaging,
      pageNo: this.pageInfo?.pageNo,
      pageSize: pageSize || 1000,
    };
  }

  private buildFunctionColumns() {
    const _removeSquareBrackets = expression => {
      if (!expression) {
        return '';
      }
      return expression.replaceAll('[', '').replaceAll(']', '');
    };
    return (this.dataView.computedFields || []).map(f => ({
      alias: f.id!,
      snippet: _removeSquareBrackets(f.expression),
    }));
  }

  private buildSelectColumns() {
    const selectColumns = this.chartDataConfigs.reduce<ChartDataSectionField[]>(
      (acc, cur) => {
        if (!cur.rows) {
          return acc;
        }

        if (this.aggregation === false) {
          if (
            cur.type === ChartDataSectionType.GROUP ||
            cur.type === ChartDataSectionType.COLOR ||
            cur.type === ChartDataSectionType.AGGREGATE ||
            cur.type === ChartDataSectionType.SIZE ||
            cur.type === ChartDataSectionType.INFO ||
            cur.type === ChartDataSectionType.MIXED
          ) {
            return acc.concat(cur.rows);
          }
        }

        return acc;
      },
      [],
    );
    return selectColumns.map(col => col.colName);
  }

  private buildViewConfigs() {
    return transformToViewConfig(this.dataView?.config);
  }

  public addExtraSorters(sorters: ChartRequest['orders']) {
    if (!isEmptyArray(sorters)) {
      this.extraSorters = this.extraSorters.concat(sorters!);
    }
    return this;
  }

  public build(): ChartRequest {
    return {
      viewId: this.dataView?.id,
      aggregators: this.buildAggregators(),
      groups: this.buildGroups(),
      filters: this.buildFilters(),
      orders: this.buildOrders(),
      pageInfo: this.buildPageInfo(),
      functionColumns: this.buildFunctionColumns(),
      columns: this.buildSelectColumns(),
      script: this.script,
      ...this.buildViewConfigs(),
    };
  }

  public buildGroupColumns() {
    const groupColumns = this.chartDataConfigs.reduce<ChartDataSectionField[]>(
      (acc, cur) => {
        if (!cur.rows) {
          return acc;
        }
        if (this.aggregation === false) {
          return acc;
        }
        if (
          cur.type === ChartDataSectionType.GROUP ||
          cur.type === ChartDataSectionType.COLOR
        ) {
          return acc.concat(cur.rows);
        }
        if (
          cur.type === ChartDataSectionType.MIXED &&
          !cur.rows?.every(
            v =>
              v.type !== ChartDataViewFieldType.DATE &&
              v.type !== ChartDataViewFieldType.STRING,
          )
        ) {
          return acc.concat(
            cur.rows.filter(
              v =>
                v.type === ChartDataViewFieldType.DATE ||
                v.type === ChartDataViewFieldType.STRING,
            ),
          );
        }
        return acc;
      },
      [],
    );
    return groupColumns;
  }
}

export default ChartRequest;
