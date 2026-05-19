'use strict';

const Q = require('q');

const { Transform } = require('json2csv');
const fs = require('fs');
const AbstractBatchTask = require('sociolla-core/lib/abstract-batch-task');
const { Readable } = require('stream');
const CommonHelper = require('../../../../helpers/commonHelper');
const { ga4_creds } = require('../../../../config/secret');
const logger = require('sociolla-core/lib/logger').getInstance({
	worker: 'export-v2-b2c-sales-operation-dashboard-summary',
});
const workerHelpers = require('../../../../helpers/workerHelper');
const { BetaAnalyticsDataClient } = require('@google-analytics/data');
const ga4Lilla = 306551251;
const ga4Sociolla = 317187703;
const listGaId = [ga4Sociolla, ga4Lilla];

const formatDate = (date) => CommonHelper.formatDate(date);
const formatNumber = (number) => CommonHelper.formatNumber(number);
const formatPercentage = (number) => CommonHelper.formatPercentage(number);

class ExportSalesOperationDashboardSummary extends AbstractBatchTask {
	constructor(options) {
		super(options, 'export-v2-b2c-sales-operation-dashboard-summary');
	}
	getTotalCount() {
		return Q.try(() => {
			return this.options.client.connectNewDwh.query(this.options.queryCount);
		})
			.then((result) => {
				logger.info(
					`[${this.options?.context?.user?.name} - ${this.options?.context?.user?.email}] Total count: ${result.rows[0].total}`,
				);
				return parseInt(result.rows[0].total);
			})
			.catch((err) => {
				logger.error(err);
				throw err;
			});
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
					const data = Object.entries(this.options.fieldName).reduce((acc, [fieldKey, fieldName]) => {
						const value = row[fieldName];
						const formatFn = this.options.fieldFormats[fieldName] || ((v) => v); // Default to no formatting
						const formattedValue = formatFn(value);

						acc[fieldKey] = formatFn.name === 'formatNumber' ? formattedValue || 0 : formattedValue || null;
						return acc;
					}, {});

					const valueOrder =
						['offline_store', 'offline_store_vn', 'offline_store_lilla'].includes(row.order_source) ||
						(this?.options?.document?.business_unit &&
							['SRI', 'SRV', 'LILLA_OFFLINE'].includes(this?.options?.document?.business_unit))
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

					data['OCR'] = CommonHelper.calculateOCR(parseInt(valueOrder), parseInt(totalTraffic)) + '%';
					data['FOOTFALL'] = totalTraffic;

					const customerData = this.options.newCustomerHash[row?.id_offlinestore_store] || {};

					// Extracting values with default fallbacks
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

					data['NEW CUST. ORDER'] = new_customer_count;
					data['NEW CUST. NMV'] = new_customer_nmv;
					data['NEW CUST. NMV (%)'] =
						CommonHelper.calculateOCR(parseInt(new_customer_nmv), parseInt(row.sales)) + '%';

					data['GUEST CUST. ORDER'] = guest_customer_count;
					data['GUEST CUST. NMV'] = guest_customer_nmv;
					data['GUEST CUST. NMV (%)'] =
						CommonHelper.calculateOCR(parseInt(guest_customer_nmv), parseInt(row.sales)) + '%';

					data['RETURNING CUST. ORDER'] = returning_customer_count;
					data['RETURNING CUST. NMV'] = returning_customer_nmv;
					data['RETURNING CUST. NMV (%)'] =
						CommonHelper.calculateOCR(parseInt(returning_customer_nmv), parseInt(row.sales)) + '%';

					data['TOTAL PROMOTOR'] = total_promotor;
					data['TOTAL DETRACTOR'] = total_detractor;
					data['TOTAL RESPONSE'] = total_response;
					data['NET PROMOTOR SCORE'] = formatNumber(
						((parseInt(total_promotor) - parseInt(total_detractor)) / parseInt(total_response)) * 100,
					);
					data['RESPONSE RATE'] =
						CommonHelper.calculateOCR(parseInt(total_response), parseInt(row.order_net)) + '%';

					self.options.csv.push(data);
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
	const clientJarvis = message.clientJarvis;
	const document = (criteria.document && JSON.parse(criteria.document)) || {};
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
		`[${context?.user?.name} - ${context?.user?.email}] Start jarvis v2-b2c-sales-operation-dashboard-summary`,
	);

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

	// Define the field formatting rules
	const fieldFormats = {
		opening_date: formatDate,
		nmv_sqm: formatNumber,
		net_rev_staff: formatNumber,
		footfall: formatNumber,
		aut: formatNumber,
		new_customer_nmv: formatNumber,
		returning_customer_nmv: formatNumber,
		guest_customer_nmv: formatNumber,
		net_revenue_growth: formatPercentage,
		net_revenue_target: formatNumber,
		net_revenue_ach: formatPercentage,
		ocr: formatPercentage,
		new_customer_nmv_percentage: formatPercentage,
		returning_customer_nmv_percentage: formatPercentage,
		guest_customer_nmv_percentage: formatPercentage,
		total_promotor: formatNumber,
		total_detractor: formatNumber,
		net_promotor_score: formatNumber,
		response_rate: formatPercentage,
	};

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
				startDate: document?.start_date,
				endDate: document?.end_date,
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

	if (!document?.business_unit || ['SBI', 'SBV', 'LILLA'].includes(document?.business_unit)) {
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
	let grandtotal_traffic =
		(document?.business_unit && ['SRI', 'SRV', 'LILLA_OFFLINE'].includes(document?.business_unit)) ||
		(!document?.business_unit && !document?.order_platform?.length)
			? parseInt(resultGrandtotalFootfall?.rows?.[0]?.total_entered || 0)
			: 0;

	const data = resultGrandTotal?.rows || [];
	const order_sources = data.map((d) => d.order_source);

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

	const fields = Object.keys(fieldName);
	const json2csv = new Transform({ fields }, { objectMode: true });
	const output = fs.createWriteStream(outputFile, { flags: 'a' });
	const input = new Readable({ objectMode: true });
	input._read = () => {};
	input.pipe(json2csv).pipe(output);
	const task = new ExportSalesOperationDashboardSummary({
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
		csv: input,
		stopOnError: true,
		rejectOnError: true,
		fieldName,
		total: grand_total.total,
		dataStoreFootfall,
		resultStoreFootfall,
		resultAllGa,
		resultGa4Lilla,
		resultGaLilla,
		newCustomerHash,
		feedbackHash,
		fieldFormats,
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
				parseInt(grand_total.order),
			)));

		const grand_total_data = Object.entries(fieldName).reduce((acc, [fieldKey, fieldName]) => {
			const value = grand_total[fieldName];
			const formatFn = fieldFormats[fieldName] || ((v) => v); // Default to no formatting
			const formattedValue = formatFn(value);

			acc[fieldKey] = formatFn.name === 'formatNumber' ? formattedValue || 0 : formattedValue || null;
			return acc;
		}, {});

		grand_total_data['STORE'] = 'Total';
		grand_total_data['PLATFORM'] = 'Total';

		input.push(grand_total_data);
		await workerHelpers.sendmail({
			input,
			output,
			logger,
			context,
			outputFile,
			fs,
			clientJarvis,
			criteria,
			subject: 'Jarvis : Export V2 B2C Sales Operation Dashboard - Sales Summary',
		});
	} catch (error) {
		fs.rmSync(outputFile, { force: true });
		logger.error(error);
		throw error;
	}
};
