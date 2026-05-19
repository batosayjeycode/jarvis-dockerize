'use strict';

const Q = require('q');

const { Transform } = require('json2csv');
const fs = require('fs');
const AbstractBatchTask = require('sociolla-core/lib/abstract-batch-task');
const { Readable } = require('stream');
const CommonHelper = require('../../helpers/commonHelper');
let fields = {};
const logger = require('sociolla-core/lib/logger').getInstance({ worker: 'export-regional-sales-periode' });
const moment = require('moment');
const workerHelpers = require('../../helpers/workerHelper');

class ExportRegionalSalesPeriod extends AbstractBatchTask {
	constructor(options) {
		super(options, 'export-regional-sales-periode');
	}
	getTotalCount() {
		return Q.try(() => {
			return this.options.client.connectDwh.query(this.options.queryCount);
		})
			.then((result) => {
				logger.info(
					`[${this.options?.context?.user?.name} - ${this.options?.context?.user?.email}] Total count: ${result.rows[0].total}`,
				);
				return parseInt(result.rows[0].count);
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
			const query = `${this.options.queryRow} LIMIT ${limit} OFFSET ${offset}`;
			return Q.all([
				this.options.client.connectDwh.query(query),
				this.options.client.connectDwh.query('SELECT id, currency, current_rate FROM stg.currency_config'),
			]);
		})
			.then(([result, currency]) => {
				const curr = {};
				currency.rows.forEach((c) => {
					curr[c.currency] = c.current_rate;
				});
				const objEnt = Object.entries(fields);
				const data = result.rows.map((obj) => {
					if (this.options.document.data_display === 'value') {
						for (const property in obj) {
							if (property.includes('_id')) {
								obj[property] = CommonHelper.currencyCalculation(
									parseInt(obj[property]),
									this.options.document.currency,
									curr,
									'IDR',
								);
							}
							if (property.includes('_vn')) {
								obj[property] = CommonHelper.currencyCalculation(
									parseInt(obj[property]),
									this.options.document.currency,
									curr,
									'VND',
								);
							}
						}
					}
					return obj;
				});

				for (const row of data) {
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

const doGenerateFields = (document) => {
	if (document.view_point == 'by_brand') {
		fields = {
			id_brand: 'ID Brand',
			brand: 'Brand',
			brand_type: 'Brand Type',
		};
	} else if (document.view_point == 'by_default_category') {
		fields = {
			id_category_default: 'ID Category Default',
			category_default: 'Category Default',
		};
	} else if (document.view_point == 'by_deepest_category') {
		fields = {
			parent_category: 'Parent Category',
			child_category: 'Child Category',
			category: 'Category',
		};
	} else if (document.view_point == 'by_order_platform') {
		fields = {
			id: 'ID Order Platform',
			order_platform: 'Order Platform',
		};
	} else if (document.view_point == 'by_branch') {
		fields = {
			id: 'ID Branch',
			branch_name: 'Branch Name',
		};
	} else {
		fields = {
			id_product: 'Id Product',
			reference: 'Reference',
			product_name: 'Product Name',
			product_classification: 'Product Classification',
			product_attribute: 'Product Attribute',
			brand: 'Brand',
			category_default: 'Category Default',
			tree_categories: 'Tree Categories',
		};
	}

	const mainFieldHeader = {};
	let main_fields = [];
	if (document.period_type && document.period_type === 'period') {
		const periodStartDate = moment(document.start_date).format('DD-MMM-YYYY').toUpperCase();
		const periodEndDate = moment(document.end_date).format('DD-MMM-YYYY').toUpperCase();
		if (['ALL', 'B2C'].includes(document.business_unit)) {
			const keySalesB2cPeriodId = `sales_b2c_${document.data_display}_id_period`;
			const keySalesB2cPeriodVn = `sales_b2c_${document.data_display}_vn_period`;
			main_fields.push(keySalesB2cPeriodId);
			main_fields.push(keySalesB2cPeriodVn);
			mainFieldHeader[keySalesB2cPeriodId] =
				`${document.data_display.toUpperCase()} B2C ID ${periodStartDate} - ${periodEndDate}`;
			mainFieldHeader[keySalesB2cPeriodVn] =
				`${document.data_display.toUpperCase()} B2C VN ${periodStartDate} - ${periodEndDate}`;
		}
		if (['ALL', 'B2B'].includes(document.business_unit)) {
			const keySalesB2bPeriodId = `sales_b2b_${document.data_display}_id_period`;
			const keySalesB2bPeriodVn = `sales_b2b_${document.data_display}_vn_period`;
			main_fields.push(keySalesB2bPeriodId);
			main_fields.push(keySalesB2bPeriodVn);
			mainFieldHeader[keySalesB2bPeriodId] =
				`${document.data_display.toUpperCase()} B2B ID ${periodStartDate} - ${periodEndDate}`;
			mainFieldHeader[keySalesB2bPeriodVn] =
				`${document.data_display.toUpperCase()} B2B VN ${periodStartDate} - ${periodEndDate}`;
		}
	} else {
		for (const val of document.period_list) {
			if (['ALL', 'B2C'].includes(document.business_unit)) {
				main_fields.push(`sales_b2c_${document.data_display}_id_${val.key}`);
				main_fields.push(`sales_b2c_${document.data_display}_vn_${val.key}`);
			}
			if (['ALL', 'B2B'].includes(document.business_unit)) {
				main_fields.push(`sales_b2b_${document.data_display}_id_${val.key}`);
				main_fields.push(`sales_b2b_${document.data_display}_vn_${val.key}`);
			}
		}
	}

	if (['ALL', 'B2C'].includes(document.business_unit)) {
		main_fields.push(`total_${document.data_display}_b2c_id`);
		main_fields.push(`total_${document.data_display}_b2c_vn`);
	}
	if (['ALL', 'B2B'].includes(document.business_unit)) {
		main_fields.push(`total_${document.data_display}_b2b_id`);
		main_fields.push(`total_${document.data_display}_b2b_vn`);
	}

	main_fields.push(`total_${document.data_display}_id`);
	main_fields.push(`total_${document.data_display}_vn`);

	if (document.country === 'ID') {
		main_fields = main_fields.filter((field) => !field.includes('_vn'));
	} else if (document.country === 'VN') {
		main_fields = main_fields.filter((field) => !field.includes('_id'));
	}

	main_fields.forEach((f) => {
		fields[f] = mainFieldHeader[f] ?? f;
	});
};

module.exports = async (message) => {
	logger.info('Start jarvis export-regional-sales-periode');
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
	doGenerateFields(document);

	const outputFile = file_name;
	const fieldHeader = Object.values(fields);
	const json2csv = new Transform({ fieldHeader }, { objectMode: true });
	const output = fs.createWriteStream(outputFile, { flags: 'a' });
	const input = new Readable({ objectMode: true });
	input._read = () => {};
	input.pipe(json2csv).pipe(output);
	const task = new ExportRegionalSalesPeriod({
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
		document,
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
			subject: 'Export Regional Sales Periode',
		});
	} catch (error) {
		fs.rmSync(outputFile, { force: true });
		logger.error(error);
		throw error;
	}
};
