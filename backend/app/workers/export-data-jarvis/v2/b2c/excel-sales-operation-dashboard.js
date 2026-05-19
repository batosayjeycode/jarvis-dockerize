'use strict';

const Q = require('q');

const fs = require('fs');
const AbstractBatchTask = require('sociolla-core/lib/abstract-batch-task');
const writeXlsxFile = require('write-excel-file/node');
const logger = require('sociolla-core/lib/logger').getInstance({
	worker: 'export-v2-excel-b2c-sales-operation-dashboard-summary',
});
const CommonHelper = require('../../../../helpers/commonHelper');
const { ga4_creds } = require('../../../../config/secret');
const workerHelpers = require('../../../../helpers/workerHelper');
const { BetaAnalyticsDataClient } = require('@google-analytics/data');
const ga4Lilla = 306551251;
const ga4Sociolla = 317187703;
const listGaId = [ga4Sociolla, ga4Lilla];
const formatNumber = (number) => CommonHelper.formatNumber(number);

class ExportExcelSalesOperationDashboardSummary extends AbstractBatchTask {
	constructor(options) {
		super(options, 'export-v2-excel-b2c-sales-operation-dashboard-summary');
	}
	getTotalCount() {
		logger.info(
			`[${this.options?.context?.user?.name} - ${this.options?.context?.user?.email}] Total count: ${this?.options?.document?.total}`,
		);
		return Q.resolve(this?.options?.document?.total);
	}
	processBatch(limit, offset) {
		const self = this;
		return Q.try(() => {
			logger.info(
				`[${this.options?.context?.user?.name} - ${this.options?.context?.user?.email}] Start Query picked: ${limit}, processed: ${offset}`,
			);
			const query = `${this.options.queryRow.wrapQuery} LIMIT ${limit} OFFSET ${offset}`;
			return this.options.client.connectNewDwh.query(query);
		})
			.then((result) => {
				const rows = result.rows || [];
				for (const row of rows) {
					const valueOrder =
						['offline_store', 'offline_store_vn', 'offline_store_lilla'].includes(row.order_source) ||
						(this.options.document.business_unit &&
							['SRI', 'SRV', 'LILLA_OFFLINE'].includes(this.options.document.business_unit))
							? row.order
							: row.unique_customer_purchase;
					const totalTraffic = CommonHelper.getTotalTraffic(
						row.order_source,
						row,
						this.options.dataStoreFootfall,
						this.options.resultStoreFootfall,
						this.options.resultAllGa,
						this.options.resultGaLilla,
					);

					row['ocr'] = CommonHelper.calculateOCR(parseInt(valueOrder), parseInt(totalTraffic));
					row['footfall'] = totalTraffic;

					const customerData = this.options.newCustomerHash[row?.id_offlinestore_store] || {};

					// // Extracting values with default fallbacks
					const new_customer_count = customerData?.new_customer_count || 0;
					const new_customer_nmv = customerData?.new_customer_nmv || 0;
					const guest_customer_count = customerData?.guest_customer_count || 0;
					const guest_customer_nmv = customerData?.guest_customer_nmv || 0;
					const returning_customer_count = customerData?.returning_customer_count || 0;
					const returning_customer_nmv = customerData?.returning_customer_nmv || 0;

					const {
						total_promotor = 0,
						total_detractor = 0,
						total_response = 0,
					} = this.options.feedbackHash[row?.id_offlinestore_store] || {};

					row['new_customer_count'] = new_customer_count;
					row['new_customer_nmv'] = new_customer_nmv;
					row['new_customer_nmv_percentage'] = CommonHelper.calculateOCR(
						parseInt(new_customer_nmv),
						parseInt(row.sales),
					);

					row['guest_customer_count'] = guest_customer_count;
					row['guest_customer_nmv'] = guest_customer_nmv;
					row['guest_customer_nmv_percentage'] = CommonHelper.calculateOCR(
						parseInt(guest_customer_nmv),
						parseInt(row.sales),
					);

					row['returning_customer_count'] = returning_customer_count;
					row['returning_customer_nmv'] = returning_customer_nmv;
					row['returning_customer_nmv_percentage'] = CommonHelper.calculateOCR(
						parseInt(returning_customer_nmv),
						parseInt(row.sales),
					);

					row['total_promotor'] = total_promotor;
					row['total_detractor'] = total_detractor;
					row['total_response'] = total_response;
					row['net_promotor_score'] = formatNumber(
						((parseInt(total_promotor) - parseInt(total_detractor)) / parseInt(total_response)) * 100,
					);
					row['response_rate'] = CommonHelper.calculateOCR(parseInt(total_response), parseInt(row.order_net));

					const data = Object.entries(this.options.fieldName).map(([_, val]) => {
						const isString = ['offlinestore_store_alias', 'order_source', 'city', 'province'].includes(val);
						const isPercentField = [
							'response_rate',
							'net_revenue_growth',
							'net_revenue_ach',
							'ocr',
							'new_customer_nmv_percentage',
							'returning_customer_nmv_percentage',
							'guest_customer_nmv_percentage',
						].includes(val);
						const isDecimal = ['aut', 'net_promotor_score'].includes(val);
						const decimalDigit = isDecimal ? 2 : 0;

						let value = row[val];
						if (isPercentField) {
							value /= 100;
						} else if (!isString && value && val != 'opening_date') {
							value = CommonHelper.formatNumber(value, decimalDigit);
						}

						const commonProps = {
							value,
							borderColor: '#000000',
							type: isString ? String : Number,
							format: isString ? '' : isPercentField ? '0.00%' : isDecimal ? '#,##0.00' : '#,##0',
						};

						if (val === 'opening_date') {
							return {
								...commonProps,
								value: new Date(value),
								type: Date,
								format: 'dd/mmm/yyyy',
							};
						}

						return commonProps;
					});

					self.options.data.push(data);
				}
			})
			.then(() => {
				logger.info(
					`[${this.options?.context?.user?.name} - ${this.options?.context?.user?.email}] Done ${
						limit + offset
					}`,
				);
			})
			.catch((err) => {
				logger.error(err);
				throw err;
			});
	}
}

module.exports = async (message) => {
	const criteria = message.data.criteria;
	const context = message.data.context;
	const isValidEmail = workerHelpers.checkValidEmail(criteria.send_to_email);
	if (!isValidEmail) {
		logger.error(
			`[${context?.user?.name} - ${context?.user?.email}] Email to '${criteria.send_to_email}' is not valid!`,
		);
		return;
	}
	const client = message.client;
	const document = (criteria.document && JSON.parse(criteria.document)) || {};
	const clientJarvis = message.clientJarvis;
	const file_name = message.data.file_name || null;
	const country = context.user.country === 'vn' ? 'Vietnam' : 'Indonesia';
	const {
		wrapQuery,
		queryStoreFootfall,
		queryNewCustomer,
		queryFeedback,
		queryGrandtotalFeedback,
		queryFootfallPlatform,
		queryGrandtotalFootfall,
	} = criteria.queryRow;
	logger.info(
		`[${context?.user?.name} - ${context?.user?.email}] Start jarvis v2-excel-b2c-sales-operation-dashboard-summary`,
	);

	const generateEmptyObj = (len = 1, obj = {}) => {
		const res = [];
		for (let i = 0; i < len; i++) {
			res.push(obj);
		}
		return res;
	};

	const outputFile = file_name;
	const field = ['SRI', 'SRV', 'LILLA_OFFLINE'].includes(document?.business_unit)
		? { STORE: 'offlinestore_store_alias' }
		: { PLATFORM: 'order_source' };
	const fieldName = {
		...field,
		ORDER: 'order',
		QTY: 'qty',
		NMV: 'sales',
		'TOTAL PAID': 'total_paid',
		'NET REVENUE (MP)': 'net_revenue_mp',
		'NET REVENUE (CP)': 'net_revenue_cp',
		'NET REVENUE GROWTH (%)': 'net_revenue_growth',
		'NET REVENUE TARGET': 'net_revenue_target',
		'NET REVENUE ACH. (%)': 'net_revenue_ach',
		AUT: 'aut',
		ASP: 'asp',
		AOV: 'aov',
		AUR: 'aur',
		OCR: 'ocr',
	};

	if (['SRI', 'SRV', 'LILLA_OFFLINE'].includes(document?.business_unit)) {
		fieldName['OPENING DATE'] = 'opening_date';
		fieldName['CITY'] = 'city';
		fieldName['PROVINCE'] = 'province';
		fieldName['SIZE (SQM)'] = 'size_sqm';
		fieldName['NMV PER SQM'] = 'nmv_sqm';
		fieldName['NET REV. PER STAFF'] = 'net_rev_staff';
		fieldName['FOOTFALL'] = 'footfall';

		fieldName['NEW CUST. ORDER'] = 'new_customer_count';
		fieldName['NEW CUST. NMV'] = 'new_customer_nmv';
		fieldName['NEW CUST. NMV (%)'] = 'new_customer_nmv_percentage';
		fieldName['RETURNING CUST. ORDER'] = 'returning_customer_count';
		fieldName['RETURNING CUST. NMV'] = 'returning_customer_nmv';
		fieldName['RETURNING CUST. NMV (%)'] = 'returning_customer_nmv_percentage';
		fieldName['GUEST CUST. ORDER'] = 'guest_customer_count';
		fieldName['GUEST CUST. NMV'] = 'guest_customer_nmv';
		fieldName['GUEST CUST. NMV (%)'] = 'guest_customer_nmv_percentage';

		fieldName['TOTAL PROMOTOR'] = 'total_promotor';
		fieldName['TOTAL DETRACTOR'] = 'total_detractor';
		fieldName['TOTAL RESPONSE'] = 'total_response';
		fieldName['NET PROMOTOR SCORE'] = 'net_promotor_score';
		fieldName['RESPONSE RATE'] = 'response_rate';
	}

	const TITLE = [
		[
			{
				value: 'Sales Summary',
				fontWeight: 'bold',
				align: 'left',
			},
		],
		[
			{
				value: 'Start Date',
				fontWeight: 'bold',
				align: 'left',
			},
			{
				value: new Date(document.start_date),
				fontWeight: 'bold',
				align: 'left',
				type: Date,
				format: 'dd/mmm/yyyy',
			},
		],
		[
			{
				value: 'End Date',
				fontWeight: 'bold',
				align: 'left',
			},
			{
				value: new Date(document.end_date),
				fontWeight: 'bold',
				align: 'left',
				type: Date,
				format: 'dd/mmm/yyyy',
			},
		],
		[
			{
				value: 'Filter',
				fontWeight: 'bold',
				align: 'left',
			},
			{
				value: document.export_label_filter_option,
				fontWeight: 'bold',
				align: 'left',
			},
		],
		[
			{
				value: 'Jarvis Link',
				fontWeight: 'bold',
				align: 'left',
			},
			{
				value: document.export_label_link_option,
				fontWeight: 'bold',
				align: 'left',
			},
		],
	];

	const HEADER_ROW = Object.entries(fieldName).map(([f]) => {
		return {
			value: f,
			fontWeight: 'bold',
			borderColor: '#000000',
			backgroundColor: '#c5deb5',
			align: 'left',
		};
	});

	const data = [...TITLE, [], [], HEADER_ROW];
	const columns = generateEmptyObj(Object.keys(fieldName).length, { width: 20 });

	const queries = [wrapQuery, queryStoreFootfall, queryFootfallPlatform];
	const promises = queries.map((query) => client.connectNewDwh.query(query));

	if (['SRI', 'SRV', 'LILLA_OFFLINE'].includes(document?.business_unit)) {
		promises.push(client.connectNewDwh.query(queryNewCustomer));
		promises.push(client.connectNewDwh.query(queryFeedback));
		promises.push(client.connectNewDwh.query(queryGrandtotalFeedback));
	} else {
		promises.push(Promise.resolve([]));
		promises.push(Promise.resolve([]));
		promises.push(Promise.resolve([]));
	}

	promises.push(client.connectNewDwh.query(queryGrandtotalFootfall));

	const analyticsDataClient = new BetaAnalyticsDataClient({
		credentials: ga4_creds,
	});

	const createReportParams = (property, dimensions = [], metrics = ['totalUsers']) => ({
		property: `properties/${property}`,
		dateRanges: [
			{
				startDate: document.start_date,
				endDate: document.end_date,
			},
		],
		dimensions,
		metrics: metrics.map((name) => ({ name })),
		dimensionFilter: {
			filter: {
				fieldName: 'country',
				stringFilter: {
					value: country,
				},
			},
		},
	});

	if (!document.business_unit || ['SBI', 'SBV', 'LILLA'].includes(document.business_unit)) {
		(listGaId || []).forEach((property) => {
			const dimensions = [{ name: 'country' }, { name: 'platform' }];
			promises.push(analyticsDataClient.runReport(createReportParams(property, dimensions)));
		});
	}

	const [
		resultGrandTotal,
		resultStoreFootfall,
		resultFootfallPlatform,
		resultNewCustomer,
		resultFeedback,
		resultGrandtotalFeedback,
		resultGrandtotalFootfall,
		resultGaSociollaAll,
		resultGa4Lilla,
	] = await Promise.all(promises);

	// Extract grand_total
	document.total = resultGrandTotal?.rows[0]?.total_rows || 0;
	const grand_total_feedback = resultGrandtotalFeedback?.rows?.[0] || {};
	const grand_total = resultGrandTotal?.rows.reduce((grandAcc, item) => {
		Object.keys(item).forEach((key) => {
			if (key.startsWith('grandtotal_')) {
				grandAcc[key.replace('grandtotal_', '')] = item[key];
			}
		});
		return grandAcc;
	}, {});

	const valueOrders =
		document?.business_unit && ['SRI', 'SRV', 'LILLA_OFFLINE'].includes(document?.business_unit)
			? grand_total?.order
			: grand_total?.unique_customer_purchase;

	// Initialize new customer data
	const newCustomerHash = {};
	const feedbackHash = (resultFeedback?.rows || []).reduce((acc, item) => {
		acc[item.id_offlinestore] = item;
		return acc;
	}, {});
	const total_new_customer = {
		grandtotal_count: 0,
		grandtotal_nmv: 0,
	};
	const total_guest_customer = {
		grandtotal_count: 0,
		grandtotal_nmv: 0,
	};
	const total_returning_customer = {
		grandtotal_count: 0,
		grandtotal_nmv: 0,
	};

	// Process customer data
	(resultNewCustomer?.rows || []).forEach((el) => {
		const {
			id_offlinestore_store,
			new_customer_count,
			new_customer_nmv,
			guest_customer_count,
			guest_customer_nmv,
			returning_customer_count,
			returning_customer_nmv,
		} = el;
		newCustomerHash[id_offlinestore_store] = el;
		total_new_customer.grandtotal_count += parseInt(new_customer_count) || 0;
		total_new_customer.grandtotal_nmv += parseInt(new_customer_nmv) || 0;
		total_guest_customer.grandtotal_count += parseInt(guest_customer_count) || 0;
		total_guest_customer.grandtotal_nmv += parseInt(guest_customer_nmv) || 0;
		total_returning_customer.grandtotal_count += parseInt(returning_customer_count) || 0;
		total_returning_customer.grandtotal_nmv += parseInt(returning_customer_nmv) || 0;
	});

	const resultAllGa = {};
	const resultGaLilla = {};
	document.total_traffic = 0;
	let grandtotal_traffic =
		(document?.business_unit && ['SRI', 'SRV', 'LILLA_OFFLINE'].includes(document?.business_unit)) ||
		(!document?.business_unit && !document?.order_platform?.length)
			? parseInt(resultGrandtotalFootfall?.rows?.[0]?.total_entered || 0)
			: 0;

	const dataGrandtotal = resultGrandTotal?.rows || [];
	const order_sources = dataGrandtotal.map((d) => d.order_source);

	// Process GA data
	const orderSourceMap = {
		web: ['sociolla_vn', 'sociolla'],
		ios: ['sociolla_vn_ios', 'ios'],
		android: ['sociolla_vn_android', 'android'],
	};

	(resultGaSociollaAll?.[0]?.rows || []).forEach((el) => {
		const dimensionValue = el.dimensionValues[1]?.value?.toLowerCase() || '';
		const value = parseInt(el?.metricValues[0]?.value) || 0;

		resultAllGa[dimensionValue] = value;

		if (!document?.business_unit || ['SBI', 'SBV'].includes(document?.business_unit)) {
			const orderSourceMatched = orderSourceMap[dimensionValue] || [];
			if (document?.order_platform?.length > 0) {
				if (orderSourceMatched.some((source) => order_sources.includes(source))) {
					grandtotal_traffic += value;
				}
			} else {
				grandtotal_traffic += value;
			}
		}
	});

	// Process GA Lilla data
	const orderSourceLillaMap = {
		web: 'lilla',
		ios: 'lulla_ios',
		android: 'lulla_android',
	};

	(resultGa4Lilla?.[0]?.rows || []).forEach((el) => {
		const dimensionValue = el.dimensionValues[1]?.value?.toLowerCase() || '';
		const value = parseInt(el?.metricValues[0]?.value) || 0;
		resultGaLilla[dimensionValue] = value;

		// currently Lilla in ID only
		if (country === 'Indonesia' && (!document?.business_unit || document?.business_unit === 'LILLA')) {
			const orderSourceMatched = orderSourceLillaMap[dimensionValue];

			if (document?.order_platform?.length > 0) {
				if (order_sources.includes(orderSourceMatched)) {
					grandtotal_traffic += value;
				}
			} else {
				grandtotal_traffic += value;
			}
		}
	});

	// Process store footfall data
	const dataStoreFootfall = (resultStoreFootfall?.rows || []).reduce((acc, el) => {
		const storeName = el['store_name'];
		const totalEntered = parseInt(el['total_entered']) || 0;
		if (storeName) {
			acc[storeName] = totalEntered;
		}
		return acc;
	}, {});

	(resultFootfallPlatform?.rows || []).forEach((r) => {
		dataStoreFootfall[r.store_type] = r.total_entered;
		if (document?.order_platform?.length > 0 && order_sources.includes(r.store_type)) {
			grandtotal_traffic += parseInt(r.total_entered);
		}
	});

	const task = new ExportExcelSalesOperationDashboardSummary({
		limit: 500,
		offset: 0,
		queryCount: criteria.queryCount,
		queryRow: criteria.queryRow,
		additionQuery: criteria.additionQuery,
		document,
		context,
		client,
		email: criteria.send_to_email,
		filename: criteria.filename,
		file_name,
		data,
		stopOnError: true,
		rejectOnError: true,
		fieldName,
		grand_total,
		total: grand_total.total,
		dataStoreFootfall,
		resultStoreFootfall,
		resultAllGa,
		resultGa4Lilla,
		resultGaLilla,
		newCustomerHash,
		feedbackHash,
	});

	try {
		await task.execute();

		grand_total['ocr'] = CommonHelper.calculateOCR(parseInt(valueOrders), parseInt(grandtotal_traffic));
		grand_total['footfall'] = parseInt(grandtotal_traffic);
		((grand_total['new_customer_count'] = total_new_customer.grandtotal_count),
			(grand_total['new_customer_nmv'] = total_new_customer.grandtotal_nmv),
			(grand_total['new_customer_nmv_percentage'] = CommonHelper.calculateOCR(
				parseInt(total_new_customer.grandtotal_nmv),
				parseInt(grand_total.sales),
			)));
		((grand_total['guest_customer_count'] = total_guest_customer.grandtotal_count),
			(grand_total['guest_customer_nmv'] = total_guest_customer.grandtotal_nmv),
			(grand_total['guest_customer_nmv_percentage'] = CommonHelper.calculateOCR(
				parseInt(total_guest_customer.grandtotal_nmv),
				parseInt(grand_total.sales),
			)));
		((grand_total['returning_customer_count'] = total_returning_customer.grandtotal_count),
			(grand_total['returning_customer_nmv'] = total_returning_customer.grandtotal_nmv),
			(grand_total['returning_customer_nmv_percentage'] = CommonHelper.calculateOCR(
				parseInt(total_returning_customer.grandtotal_nmv),
				parseInt(grand_total.sales),
			)));

		((grand_total['total_promotor'] = grand_total_feedback.total_promotor),
			(grand_total['total_detractor'] = grand_total_feedback.total_detractor),
			(grand_total['total_response'] = grand_total_feedback.total_response),
			(grand_total['net_promotor_score'] = formatNumber(
				((parseInt(grand_total_feedback.total_promotor) - parseInt(grand_total_feedback.total_detractor)) /
					parseInt(grand_total_feedback.total_response)) *
					100,
			)),
			(grand_total['response_rate'] = CommonHelper.calculateOCR(
				parseInt(grand_total_feedback.total_response),
				parseInt(grand_total.order_net),
			)));

		grand_total['offlinestore_store_alias'] = 'Total';
		grand_total['order_source'] = 'Total';
		const grand_total_excel = [];

		Object.entries(fieldName).forEach(([_, val]) => {
			const isString = ['offlinestore_store_alias', 'order_source', 'city', 'province', 'opening_date'].includes(
				val,
			);
			const isPercentField = [
				'response_rate',
				'net_revenue_growth',
				'net_revenue_ach',
				'ocr',
				'new_customer_nmv_percentage',
				'returning_customer_nmv_percentage',
				'guest_customer_nmv_percentage',
			].includes(val);
			const isDecimal = ['aut', 'net_promotor_score'].includes(val);
			const decimalDigit = isDecimal ? 2 : 0;
			let value = grand_total[val];

			if (isPercentField) {
				value = value / 100;
			} else if (!isString && value) {
				value = CommonHelper.formatNumber(value, decimalDigit);
			}

			const obj = {
				value,
				borderColor: '#000000',
				borderStyle: 'double',
				fontWeight: 'bold',
				type: isString ? String : Number,
				format: isString ? '' : isPercentField ? '0.00%' : isDecimal ? '#,##0.00' : '#,##0',
			};

			grand_total_excel.push(obj);
		});

		data.push(grand_total_excel);

		await writeXlsxFile(data, {
			columns,
			filePath: outputFile,
			sheet: 'Sales Summary',
		});
		await workerHelpers.sendmail({
			logger,
			context,
			outputFile,
			fs,
			clientJarvis,
			criteria,
			subject: 'Jarvis : Export Sales Summary',
			is_export_excel: true,
		});
	} catch (error) {
		fs.rmSync(outputFile, { force: true });
		logger.error(error);
		throw error;
	}
};
