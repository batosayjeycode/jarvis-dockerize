'use strict';

const Q = require('q');

const { Transform } = require('json2csv');
const fs = require('fs');
const AbstractBatchTask = require('sociolla-core/lib/abstract-batch-task');
const moment = require('moment');
const { Readable } = require('stream');
const logger = require('sociolla-core/lib/logger').getInstance({ worker: 'b2c-sales-periode' });
const workerHelpers = require('../../helpers/workerHelper');
const CommonHelper = require('../../helpers/commonHelper');

class ExportB2CSalesPeriode extends AbstractBatchTask {
	constructor(options) {
		super(options, 'export-b2c-sales-periode');
	}
	getTotalCount() {
		return Q.try(() => {
			return this.options.client.connectNewDwh.query(
				`SELECT COUNT(*) AS total FROM ${this.options.document.tmp_table}`,
			);
		})
			.then((result) => {
				const total = parseInt(result.rows[0].total);
				logger.info(`${this.options.document.userCtx} Total count: ${total}`);
				this.options.document.total_data = total;
				return total;
			})
			.catch((err) => {
				logger.error(err);
				throw err;
			});
	}
	async processBatch(limit, offset) {
		try {
			CommonHelper.logProgress(
				limit,
				Math.min(limit + offset, this.options.document.total_data),
				this.options.document.total_data,
				logger,
				this.options.document.userCtx,
			);
			if (offset % 100000 === 0) {
				CommonHelper.logMemoryUsage(`batch-${offset}`, logger);
			}
			const query = `SELECT * FROM ${this.options.document.tmp_table} WHERE temp_id > ${offset} ORDER BY temp_id ASC LIMIT ${limit}`;
			const result = await this.options.client.connectNewDwh.query(query);
			const rows = result.rows || [];
			const objEnt = Object.entries(this.options.fields);
			for (const row of rows) {
				const combination_id = row['id_product_attribute'] || row['combination_id'];
				const product_combination = row['product_attribute'] || row['product_combination'];
				const ean = row['ean13'] || row['ean_no'];
				if ('id_product' in row) {
					row['id_product'] =
						`${row['id_product']} | ${combination_id}${ean ? ` | ean : ${ean}` : ''}${row['ispack'] == 1 ? ' | bundle' : ''}`;
				}
				if ('product_name' in row) {
					row['product_name'] =
						`${row['product_name']}${product_combination ? ` | ${product_combination}` : ''}`;
				}
				const canContinue = this.options.csv.push(
					Object.fromEntries(objEnt.map(([key, label]) => [label, row[key] || ''])),
				);
				if (!canContinue) {
					await new Promise((resolve) => {
						this.options.csv._drainWaiter = resolve;
					});
				}
			}
		} catch (err) {
			logger.error(err);
			throw err;
		}
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
	let fields = {};

	const viewPointMapping = document?.isV2
		? {
				brand: {
					brand_name: 'Brand',
					brand_isactive: 'Is Active',
				},
				default_category: {
					default_category: 'Category Default',
					category_default_isactive: 'Is Active',
				},
				order_platform: {
					order_source: 'Order Platform',
				},
				default: {
					id_product: 'Id Product',
					reference: 'Reference',
					product_name: 'Product Name',
					brand_name: 'Brand',
					default_category: 'Category Default',
					tree_categories: 'Tree Categories',
					product_classification: 'Product Classification',
				},
			}
		: {
				by_brand: {
					brand: 'Brand',
					brand_isactive: 'Is Active',
				},
				by_default_category: {
					category_default: 'Category Default',
					category_default_isactive: 'Is Active',
				},
				by_order_platform: {
					order_platform: 'Order Platform',
				},
				default: {
					id_product: 'Id Product',
					reference: 'Reference',
					product_name: 'Product Name',
					brand: 'Brand',
					category_default: 'Category Default',
					tree_categories: 'Tree Categories',
					product_classification: 'Product Classification',
				},
			};

	fields = viewPointMapping[document?.view_point] || viewPointMapping.default;

	if (document.period_type && document.period_type === 'period') {
		const key = ['number_of_unique_order', 'number_of_customer_unique_id', 'net_revenue'].includes(
			document.data_display,
		)
			? `${document.data_display}`
			: `${document.data_display}_${document.value_type}`;
		fields[key] = `Total ${document.data_display}`;
	} else if (document.period_type && document.period_type != 'compare') {
		const periodeDisplay = getMonthWeekYearByRangeDate(
			document.start_date,
			document.end_date,
			document.period_type,
		);
		if (periodeDisplay.length) {
			periodeDisplay.forEach((el) => {
				const keys = ['number_of_unique_order', 'number_of_customer_unique_id', 'net_revenue'].includes(
					document.data_display,
				)
					? `${document.data_display}_${el['key']}`
					: `${document.data_display}_${document.value_type}_${el['key']}`;
				fields[keys] = `${document.data_display} ${el['label']}`;
			});
		}

		const key = ['number_of_unique_order', 'number_of_customer_unique_id', 'net_revenue'].includes(
			document.data_display,
		)
			? `${document.data_display}`
			: `${document.data_display}_${document.value_type}`;
		fields[key] = `Total ${document.data_display}`;
	} else {
		(document.period_list || []).forEach((el) => {
			const periods = el.value.split('_');
			const key = ['number_of_unique_order', 'number_of_customer_unique_id', 'net_revenue'].includes(
				document.data_display,
			)
				? `${document.data_display}_${el['key']}`
				: `${document.data_display}_${document.value_type}_${el['key']}`;
			fields[key] = `${document.data_display} ${moment(periods[0])
				.format('DD-MMM-YYYY')
				.toUpperCase()} / ${moment(periods[1]).format('DD-MMM-YYYY').toUpperCase()}`;
		});
	}

	if (document?.isV2) {
		switch (document.export_group) {
			case 'store':
				fields.store = 'Store Name';
				break;
			case 'platform':
				fields.order_source = 'Order Platform';
				break;
			case 'category':
				fields.default_category = 'Category';
				break;
		}
	} else {
		if (document.by_store) {
			fields.store_name = 'Store Name';
		}
		if (document.csv_per_platform) {
			fields.order_platform = 'Order Platform';
		}
		if (document.csv_per_category) {
			fields.category_default = 'Category';
		}
	}

	return fields;
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
	const document = (criteria.document && JSON.parse(criteria.document)) || {};
	document.userCtx = `[${context?.user?.name} - ${context?.user?.email}]`;
	const file_name = message.data.file_name || null;
	const fields = doGenerateFields(document);
	const isV2 = document?.isV2 ? 'V2' : '';
	logger.info(`${document.userCtx} Start jarvis ${isV2} b2c-sales-periode`);

	if (document) {
		logger.info(`params: ${JSON.stringify(document)}`);
	}

	// Create Temporary Table for processing data
	await client.connectNewDwh.query(`DROP TABLE IF EXISTS ${document.tmp_table}`);
	logger.info(`${document.userCtx} Creating table ${document.tmp_table}`);
	let t = Date.now();
	await client.connectNewDwh.query(`CREATE UNLOGGED TABLE ${document.tmp_table} AS (${criteria.queryRow})`);
	logger.info(`${document.userCtx} Table created in ${Date.now() - t}ms`);
	const createIndexQuery = `CREATE INDEX idx_${document.tmp_table.split('.')[1]} ON ${document.tmp_table}(temp_id)`;
	t = Date.now();
	await client.connectNewDwh.query(createIndexQuery);
	logger.info(`${document.userCtx} Index created in ${Date.now() - t}ms`);

	const outputFile = file_name;
	const fieldHeader = Object.values(fields);
	const json2csv = new Transform({ fieldHeader }, { objectMode: true });
	const output = fs.createWriteStream(outputFile, { flags: 'a' });
	const input = new Readable({ objectMode: true });
	input._read = () => {
		if (input._drainWaiter) {
			const resolve = input._drainWaiter;
			input._drainWaiter = null;
			resolve();
		}
	};
	json2csv.on('error', (err) => logger.error(`${document.userCtx} json2csv error: ${err.message}`));
	input.pipe(json2csv).pipe(output);
	const task = new ExportB2CSalesPeriode({
		limit: 500,
		offset: 0,
		context,
		client,
		email: criteria.send_to_email,
		filename: criteria.filename,
		document,
		file_name,
		csv: input,
		fields,
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
			subject: `Export ${isV2} B2C Sales Periode`,
		});
		if (document?.isV2) {
			await client.connectNewDwh.query(`DROP TABLE ${document.tmp_table}`);
			logger.info(`${document.tmp_table} table deleted, by ${context?.user?.email} to ${criteria.send_to_email}`);
		}
	} catch (error) {
		await client.connectNewDwh.query(`DROP TABLE IF EXISTS ${document.tmp_table}`);
		fs.rmSync(outputFile, { force: true });
		logger.error(error);
		throw error;
	}
};
