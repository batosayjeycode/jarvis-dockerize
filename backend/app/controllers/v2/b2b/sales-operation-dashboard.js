/**
 * @author Nur Sancoyo K
 **/
'use strict';
const Errors = require('sociolla-core/lib/custom-errors');
const postgre = require('sociolla-core/lib/postgre');
const Queries = require('../../../queries/v2/b2b/sales-operation-dashboard');
const CommonHelper = require('../../../helpers/commonHelper');
const ValueTypes = ['gross', 'valid', 'net'];

module.exports = class SalesOperationDashboardController {
	static getNmv(context, document) {
		document.data_filters = context.data_filters;
		const { data_filters } = document;

		if (!data_filters?.business_units.includes('B2B')) {
			throw new Errors.BadRequestError('', 'Sorry, the account does not have access to B2B Business Unit !');
		}

		const queryTasks = [];
		const groupBys = [
			'channel',
			'sales_team',
			'brand',
			'period',
			'channel_period',
			'sales_team_period',
			'brand_period',
		];
		const objQuery = {};

		for (const groupby of groupBys) {
			const isPeriodGroup = groupby.endsWith('_period');
			const baseGroup = isPeriodGroup ? groupby.slice(0, -'_period'.length) : groupby;

			for (const value_type of ValueTypes) {
				const sql = isPeriodGroup
					? Queries.getNmvWithPeriods(context, { ...document, value_type, groupby: baseGroup })
					: Queries.getNmv(context, { ...document, value_type, groupby });
				objQuery[`${groupby}-${value_type}`] = sql;
				queryTasks.push({
					groupby,
					value_type,
					promise: postgre.connectNewDwh.query(sql),
				});
			}
		}

		if (CommonHelper.isEligibleToShowQuery(context, document)) {
			const getShowQuery = CommonHelper.doShowQuery({
				queryTitle: `${context?.user?.country?.toUpperCase()} > V2 > B2B > Sales Operation Dashboard > NMV & Net Revenue Report`,
				objQuery,
			});
			return Promise.resolve(getShowQuery.txtQuery);
		}

		return Promise.all(queryTasks.map((q) => q.promise))
			.then((results) => {
				// Map results back into structured object
				const structured = {};
				queryTasks.forEach((task, index) => {
					const { groupby, value_type } = task;
					if (!structured[groupby]) {
						structured[groupby] = {};
					}
					structured[groupby][value_type] = results[index]?.rows ?? [];
				});

				const mergePeriodIntoBase = (baseArr, periodArr, idKey) => {
					const baseMap = new Map();
					// Aggregate identical base rows, especially vital when MP and CP dates overlap, causing UNION ALL duplicates
					for (const b of baseArr) {
						if (!baseMap.has(b[idKey])) {
							baseMap.set(b[idKey], { ...b });
						} else {
							const existing = baseMap.get(b[idKey]);
							existing.nmv_mp = Number(existing.nmv_mp || 0) + Number(b.nmv_mp || 0);
							existing.nmv_cp = Number(existing.nmv_cp || 0) + Number(b.nmv_cp || 0);
							existing.net_revenue_mp =
								Number(existing.net_revenue_mp || 0) + Number(b.net_revenue_mp || 0);
							existing.net_revenue_cp =
								Number(existing.net_revenue_cp || 0) + Number(b.net_revenue_cp || 0);
							existing.nmv_growth = Number(existing.nmv_growth || 0) + Number(b.nmv_growth || 0);
							existing.net_revenue_growth =
								Number(existing.net_revenue_growth || 0) + Number(b.net_revenue_growth || 0);

							existing.target_nmv = Math.max(Number(existing.target_nmv || 0), Number(b.target_nmv || 0));
							existing.target_nmv_ach = Math.max(
								Number(existing.target_nmv_ach || 0),
								Number(b.target_nmv_ach || 0),
							);
							existing.target_net_revenue = Math.max(
								Number(existing.target_net_revenue || 0),
								Number(b.target_net_revenue || 0),
							);
							existing.target_net_revenue_ach = Math.max(
								Number(existing.target_net_revenue_ach || 0),
								Number(b.target_net_revenue_ach || 0),
							);
						}
					}

					for (const p of periodArr) {
						const base = baseMap.get(p[idKey]);
						if (!base) {
							continue;
						}

						const period = p.period; // e.g. 20251001

						// Convert and incrementally aggregate dynamic properties, resolving overlapping MP and CP period loss
						base[`nmv_mp_${period}`] = (base[`nmv_mp_${period}`] || 0) + Number(p.nmv_mp || 0);
						base[`nmv_cp_${period}`] = (base[`nmv_cp_${period}`] || 0) + Number(p.nmv_cp || 0);
						base[`net_revenue_mp_${period}`] =
							(base[`net_revenue_mp_${period}`] || 0) + Number(p.net_revenue_mp || 0);
						base[`net_revenue_cp_${period}`] =
							(base[`net_revenue_cp_${period}`] || 0) + Number(p.net_revenue_cp || 0);

						base[`target_nmv_${period}`] = Math.max(
							base[`target_nmv_${period}`] || 0,
							Number(p.target_nmv || 0),
						);
						base[`target_nmv_ach_${period}`] = Math.max(
							base[`target_nmv_ach_${period}`] || 0,
							Number(p.target_nmv_ach || 0),
						);
						base[`target_net_revenue_${period}`] = Math.max(
							base[`target_net_revenue_${period}`] || 0,
							Number(p.target_net_revenue || 0),
						);
						base[`target_net_revenue_ach_${period}`] = Math.max(
							base[`target_net_revenue_ach_${period}`] || 0,
							Number(p.target_net_revenue_ach || 0),
						);

						base[`nmv_growth_${period}`] = (base[`nmv_growth_${period}`] || 0) + Number(p.nmv_growth || 0);
						base[`net_revenue_growth_${period}`] =
							(base[`net_revenue_growth_${period}`] || 0) + Number(p.net_revenue_growth || 0);
					}

					return [...baseMap.values()];
				};

				const mergeTargets = [
					{ base: 'channel', idKey: 'channel_id' },
					{ base: 'sales_team', idKey: 'sales_team_id' },
					{ base: 'brand', idKey: 'brand_id' },
					{ base: 'period', idKey: 'period' },
				];

				// Iterate over all merge targets and merge period data into the base data
				for (const { base, idKey } of mergeTargets) {
					for (const type of ValueTypes) {
						const baseData = structured[base][type];

						// If the base itself is "period", merge it with itself.
						// Otherwise, merge the corresponding `${base}_period` data into the base.
						const periodData = base === 'period' ? baseData : structured[`${base}_period`][type];
						structured[base][type] = mergePeriodIntoBase(baseData, periodData, idKey);
					}
				}

				const period_type = document.period_type === 'quarterly' ? 'quarterly_period' : document.period_type;
				const period_list = CommonHelper.generateRangePeriod({ ...document, period_type, is_max_period: true });
				const period_list_compare = CommonHelper.generateRangePeriod({
					...document,
					start_date: document.start_date_compare,
					end_date: document.end_date_compare,
					period_type,
					is_max_period: true,
				});

				const periodSets = {};
				ValueTypes.forEach((v) => {
					periodSets[v] = new Set(structured.period[v].map((el) => el.period));
				});
				period_list.forEach((p, idx) => {
					ValueTypes.forEach((v) => {
						const period_key = document.period_type === 'quarterly' ? p?.sod_format : p?.key;
						const period_compare_key =
							document.period_type === 'quarterly'
								? period_list_compare[idx]?.sod_format
								: period_list_compare[idx]?.key;

						// PUSH MP IF NOT EXIST
						if (!periodSets[v].has(period_key)) {
							structured.period[v].push({
								period: period_key,
								is_mp: true,
								is_cp: false,
								nmv_mp: '0',
								nmv_cp: '0',
								nmv_growth: '0',
								net_revenue_mp: '0',
								net_revenue_cp: '0',
								net_revenue_growth: '0',
								target_nmv: 0,
								target_nmv_ach: 0,
								target_net_revenue: 0,
								target_net_revenue_ach: 0,
							});
							periodSets[v].add(period_key);
						}

						// PUSH CP IF NOT EXIST
						if (!periodSets[v].has(period_compare_key)) {
							structured.period[v].push({
								period: period_compare_key,
								is_mp: false,
								is_cp: true,
								nmv_mp: '0',
								nmv_cp: '0',
								nmv_growth: '0',
								net_revenue_mp: '0',
								net_revenue_cp: '0',
								net_revenue_growth: '0',
								target_nmv: 0,
								target_nmv_ach: 0,
								target_net_revenue: 0,
								target_net_revenue_ach: 0,
							});
							periodSets[v].add(period_compare_key);
						}
					});
				});

				return Object.fromEntries(Object.entries(structured).filter(([key]) => !key.endsWith('_period')));
			})
			.catch((err) => {
				throw err;
			});
	}

	static getSalesContributions(context, document) {
		document.data_filters = context.data_filters;
		const { data_filters } = document;

		if (!data_filters?.business_units.includes('B2B')) {
			throw new Errors.BadRequestError('', 'Sorry, the account does not have access to B2B Business Unit !');
		}

		const queryTasks = [];
		const groupBys = ['channel', 'sales_team', 'brand', 'period'];
		const objQuery = {};

		for (const groupby of groupBys) {
			const value_type = 'net';
			const sql = Queries.getSalesContributions(context, { ...document, value_type, groupby });
			objQuery[`${groupby}-${value_type}`] = sql;
			queryTasks.push({
				groupby,
				value_type,
				promise: postgre.connectNewDwh.query(sql),
			});
		}

		if (CommonHelper.isEligibleToShowQuery(context, document)) {
			const getShowQuery = CommonHelper.doShowQuery({
				queryTitle: `${context?.user?.country?.toUpperCase()} > V2 > B2B > Sales Operation Dashboard > Sales Contributions`,
				objQuery,
			});
			return Promise.resolve(getShowQuery.txtQuery);
		}

		return Promise.all(queryTasks.map((q) => q.promise))
			.then((results) => {
				// Map results back into structured object
				const structured = {};
				queryTasks.forEach((task, index) => {
					const { groupby, value_type } = task;
					if (!structured[groupby]) {
						structured[groupby] = {};
					}
					structured[groupby][value_type] = results[index]?.rows ?? [];
				});

				return structured;
			})
			.catch((err) => {
				throw err;
			});
	}
};
