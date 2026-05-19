'use strict';

const Q = require('q');

const { Transform } = require('json2csv');
const fs = require('fs');
const AbstractBatchTask = require('sociolla-core/lib/abstract-batch-task');
const moment = require('moment');
const { Readable } = require('stream');
let fields = {};
const logger = require('sociolla-core/lib/logger').getInstance({ worker: 'export-all-sociolla-sales-periode' });
const workerHelpers = require('../../helpers/workerHelper');

class ExportB2CSalesPeriode extends AbstractBatchTask {
	constructor(options) {
		super(options, 'export-all-sociolla-sales-periode');
	}
	getTotalCount() {
		return Q.try(() => {
			return this.options.client.connectDwh.query(this.options.queryCount);
		}).then((result) => {
			logger.info(
				`[${this.options?.context?.user?.name} - ${this.options?.context?.user?.email}] Total count: ${result.rows[0].total}`,
			);
			return parseInt(result.rows[0].total);
		});
	}
	processBatch(limit, offset) {
		const self = this;
		return Q.try(() => {
			logger.info(
				`[${this.options?.context?.user?.name} - ${this.options?.context?.user?.email}] Start Query picked: ${limit}, processed: ${offset}`,
			);
			const query = `${this.options.queryRow} LIMIT ${limit} OFFSET ${offset}`;
			return this.options.client.connectDwh.query(query);
		})
			.then((result) => {
				const rows = result.rows || [];
				const objEnt = Object.entries(fields);
				for (const row of rows) {
					const obj = objEnt.reduce((accu, el, idx) => {
						accu[el[1]] = row[el[0]] || 0;
						return accu;
					}, {});
					self.options.csv.push(obj);
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

const getMonthWeekYearByRangeDate = (start, end, by = 'monthly') => {
	if (start && end) {
		const isByMonth = by === 'monthly';
		const isByWeek = by === 'weekly';
		const isByDay = by === 'daily';
		const isByQuarter = by === 'quarterly_period';
		const isYear = !isByMonth && !isByWeek && !isByDay && !isByQuarter;
		let startDate = new Date(start);
		const endDate = new Date(end);

		const startMomentDate = moment(startDate);
		const endMomentDate = moment(endDate);
		let diff;

		if (isByMonth) {
			startMomentDate.startOf('month');
			endMomentDate.endOf('month');
			diff = 'month';
		} else if (isByWeek) {
			startMomentDate.startOf('week');
			endMomentDate.endOf('week');

			startDate = startMomentDate._d;
			diff = 'week';
		} else if (isByDay) {
			startMomentDate.startOf('day');
			endMomentDate.startOf('day');
			diff = 'day';
		} else if (isByQuarter) {
			diff = 'quarter';
		} else {
			startMomentDate.startOf('year');
			endMomentDate.endOf('year');
			diff = 'year';
		}

		return new Array(endMomentDate.diff(startMomentDate, diff) + 1).fill(0).map((_, idx) => {
			const date = moment(startDate).add(idx, diff);
			let key = moment(date).format('YYYYMMDD');
			if (isYear || isByQuarter) {
				key = moment(date).format('y');
			} else if (isByMonth) {
				key = moment(date).format('yMM');
			}

			let label = moment(date).format('MMM-YYYY-DD').toUpperCase();
			if (isYear) {
				label = moment(date).format('y').toUpperCase();
			} else if (isByMonth) {
				label = moment(date).format('MMM-YYYY').toUpperCase();
			}

			if (isByQuarter) {
				key += `_q${moment(date).quarter()}`;
			}

			return { key, date, label };
		});
	}

	return [];
};

const doGenerateFields = (document) => {
	if (document.view_point == 'by_brand') {
		fields = {
			brand: 'Brand',
		};
	} else if (document.view_point == 'by_default_category') {
		fields = {
			category_default: 'Category Default',
		};
	} else if (document.view_point == 'by_deepest_category') {
		fields = {
			parent: 'parent',
			child: 'child',
			category: 'category',
		};
	} else if (document.view_point == 'by_order_platform') {
		fields = {
			order_platform: 'Order Platform',
		};
	} else {
		fields = {
			id_product: 'Id Product',
			reference: 'Reference',
			product_name: 'Product Name',
			brand: 'Brand',
			category_default: 'Category Default',
			id_product_attribute: 'ID Product Attribute',
		};
	}

	if (document.period_type && document.period_type === 'period') {
		const periodStartDate = moment(document.start_date).format('DD-MMM-YYYY').toUpperCase();
		const periodEndDate = moment(document.end_date).format('DD-MMM-YYYY').toUpperCase();
		fields[`b2c_${document.data_display}_${document.value_type}_period`] =
			`${document.data_display.toUpperCase()} B2C ${periodStartDate} - ${periodEndDate}`;
		fields[`b2b_13_${document.data_display}_${document.value_type}_period`] =
			`${document.data_display.toUpperCase()} B2B_13 ${periodStartDate} - ${periodEndDate}`;
		fields[`b2b_9_${document.data_display}_${document.value_type}_period`] =
			`${document.data_display.toUpperCase()} B2B_9 ${periodStartDate} - ${periodEndDate}`;
		fields[`total_b2c_${document.data_display}_${document.value_type}`] =
			`Total B2C ${document.data_display.toUpperCase()}`;
		fields[`total_b2b_13_${document.data_display}_${document.value_type}`] =
			`Total B2B_13 ${document.data_display.toUpperCase()}`;
		fields[`total_b2b_9_${document.data_display}_${document.value_type}`] =
			`Total B2B_9 ${document.data_display.toUpperCase()}`;
	} else if (document.period_type && document.period_type != 'compare') {
		const periodeDisplay = getMonthWeekYearByRangeDate(
			document.start_date,
			document.end_date,
			document.period_type,
		);
		if (periodeDisplay.length) {
			periodeDisplay.forEach((el) => {
				fields[`b2c_${document.data_display}_${document.value_type}_${el['key']}`] =
					`b2c_${document.data_display}_${document.value_type}_${el['key']}`;
				fields[`b2b_13_${document.data_display}_${document.value_type}_${el['key']}`] =
					`b2b_13_${document.data_display}_${document.value_type}_${el['key']}`;
				fields[`b2b_9_${document.data_display}_${document.value_type}_${el['key']}`] =
					`b2b_9_${document.data_display}_${document.value_type}_${el['key']}`;
			});
		}

		fields[`total_b2c_${document.data_display}_${document.value_type}`] =
			`total_b2c_${document.data_display}_${document.value_type}`;
		fields[`total_b2b_13_${document.data_display}_${document.value_type}`] =
			`total_b2b_13_${document.data_display}_${document.value_type}`;
		fields[`total_b2b_9_${document.data_display}_${document.value_type}`] =
			`total_b2b_9_${document.data_display}_${document.value_type}`;
	} else {
		(document.period_list || []).forEach((el) => {
			fields[`b2c_${document.data_display}_${document.value_type}_${el['key']}`] =
				`b2c_${document.data_display}_${document.value_type}_${el['key']}`;
			fields[`b2b_13_${document.data_display}_${document.value_type}_${el['key']}`] =
				`b2b_13_${document.data_display}_${document.value_type}_${el['key']}`;
			fields[`b2b_9_${document.data_display}_${document.value_type}_${el['key']}`] =
				`b2b_9_${document.data_display}_${document.value_type}_${el['key']}`;
		});
	}
};

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
	const file_name = message.data.file_name || null;
	const document = (criteria.document && JSON.parse(criteria.document)) || {};
	logger.info(`[${context?.user?.name} - ${context?.user?.email}] Start jarvis all-sociolla-sales-periode`);
	doGenerateFields(document);

	const outputFile = file_name;
	const fieldHeader = Object.values(fields);
	const json2csv = new Transform({ fieldHeader }, { objectMode: true });
	const output = fs.createWriteStream(outputFile, { flags: 'a' });
	const input = new Readable({ objectMode: true });
	input._read = () => {};
	input.pipe(json2csv).pipe(output);
	const task = new ExportB2CSalesPeriode({
		limit: 500,
		offset: 0,
		queryCount: criteria.queryCount,
		queryRow: criteria.queryRow,
		context,
		client,
		email: criteria.send_to_email,
		filename: criteria.filename,
		file_name,
		csv: input,
		stopOnError: true,
		rejectOnError: true,
	});

	try {
		await task.execute();
		await workerHelpers.sendmail({
			input,
			output,
			logger,
			context,
			outputFile,
			fs,
			clientJarvis,
			criteria,
			subject: 'Export All Sales Periode',
		});
	} catch (error) {
		fs.rmSync(outputFile, { force: true });
		logger.error(error);
		throw error;
	}
};
