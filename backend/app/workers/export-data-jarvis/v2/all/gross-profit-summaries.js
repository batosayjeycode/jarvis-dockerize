'use strict';

const { Transform } = require('json2csv');
const fs = require('fs');
const AbstractBatchTask = require('sociolla-core/lib/abstract-batch-task');
const { Readable } = require('stream');
const CommonHelper = require('../../../../helpers/commonHelper');
const logger = require('sociolla-core/lib/logger').getInstance({ worker: 'export-v2-gross-profit-summary' });
const workerHelpers = require('../../../../helpers/workerHelper');
const moment = require('moment');

class ExportGrossProfitSummaries extends AbstractBatchTask {
	constructor(options) {
		super(options, 'export-v2-gross-profit-summary');
	}
	getTotalCount() {
		return Promise.resolve()
			.then(() => {
				logger.info(
					`[${this.options?.context?.user?.name} - ${this.options?.context?.user?.email}] Total count: ${this?.options?.document?.total}`,
				);
				return this?.options?.document?.total;
			})
			.catch((err) => {
				logger.error(err);
				throw err;
			});
	}
	processBatch(limit, offset) {
		const self = this;
		return Promise.resolve()
			.then(() => {
				CommonHelper.logProgress(
					limit,
					limit + offset,
					this?.options?.document?.total,
					logger,
					`[${this.options?.context?.user?.name} - ${this.options?.context?.user?.email}]`,
				);
				const query = `${this.options.queryRow} LIMIT ${limit} OFFSET ${offset}`;
				return this.options.client.connectNewDwh.query(query);
			})
			.then((result) => {
				const rows = result.rows || [];
				const { fieldName } = this.options;
				const { groups = [] } = this?.options?.document || {};

				for (const row of rows) {
					const data = Object.entries(fieldName).reduce((acc, [fieldKey, dbKey]) => {
						let value = row[dbKey] || 'Undefined';

						if (['net_revenue_cont', 'gross_margin_cont'].includes(dbKey)) {
							value += '%';
						} else if (!groups.includes(dbKey)) {
							value = CommonHelper.formatNumber(value, 2);
						}

						acc[fieldKey] = value || null;
						return acc;
					}, {});

					self.options.csv.push(data);
				}
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
	const { tmp_table, groups = [], order_by_type = 'ASC' } = document;
	let grand_total = document.grand_total;
	const file_name = message.data.file_name || null;
	logger.info(`[${context?.user?.name} - ${context?.user?.email}] Start jarvis v2-gross-profit-summary`);

	const order_by = document?.order_by || groups.join(' ASC, ');
	const orderBy = `ORDER BY ${order_by} ${order_by_type}`;

	const outputFile = file_name;
	let fieldName = {};

	if (groups?.length) {
		groups.forEach((g) => {
			const tmpKey = g === 'sales_team' ? 'Sales Team/Platform' : CommonHelper.removeUnderscoreAndCapitalize(g);
			fieldName[tmpKey] = g;
		});
	}

	fieldName = {
		...fieldName,
		'NMV Before Discount': 'nmv',
		'Disc. By Sociolla': 'total_discount_sociolla',
		'Disc. By Brand': 'total_discount_brand',
		Voucher: 'total_voucher',
		'Net Revenue': 'net_revenue',
		'Net Revenue Cont.': 'net_revenue_cont',
		'Subtotal COGS': 'cogs',
		'Support Promo': 'total_support_promo',
		'Net COGS': 'net_cogs',
		'Gross Profit': 'gross_margin',
		'Gross Profit Cont.': 'gross_margin_cont',
	};

	const fields = Object.keys(fieldName);
	const json2csv = new Transform({ fields, header: false }, { objectMode: true });
	const output = fs.createWriteStream(outputFile, { flags: 'a' });
	const input = new Readable({ objectMode: true });
	input._read = () => {};
	input.pipe(json2csv).pipe(output);

	const arrAdditionalInfo = [
		{ 'GP Report (Summary)': '' },
		{ 'Start Date': 'start_date' },
		{ 'End Date': 'end_date' },
		{ Filter: 'export_label_filter_option' },
		{ 'Group By': 'export_label_group_by_option' },
	];

	arrAdditionalInfo.forEach((item) => {
		// Extract the key and value from the object
		const [key, value] = Object.entries(item)[0];
		const newObj = {};
		newObj[fields[0]] = key;
		newObj[fields[1]] = ['start_date', 'end_date'].includes(value)
			? moment(new Date(document[value])).tz('Asia/Jakarta').format('DD/MMM/YYYY')
			: document[value];

		input.push(newObj);
	});

	// Initialize the object with the first field as an empty string
	const obj = { [fields[0]]: '' };

	// Add two empty rows
	input.push(obj, obj);

	// Create the column header object
	const columnHeader = fields.reduce((acc, field) => {
		acc[field] = field;
		return acc;
	}, {});

	// Add the column header to the input array
	input.push(columnHeader);

	// Create Temporary Table for processing data
	const queryRow = `CREATE UNLOGGED TABLE IF NOT EXISTS ${tmp_table} AS (${criteria.queryRow})`;
	logger.info(
		`[${context?.user?.name} - ${context?.user?.email}] CREATING TABLE ${tmp_table} by ${context?.user?.email}}`,
	);
	await Promise.resolve(client.connectNewDwh.query(queryRow));

	const task = new ExportGrossProfitSummaries({
		limit: 200,
		offset: 0,
		queryRow: `SELECT * FROM ${tmp_table} ${orderBy}`,
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
		grand_total,
	});

	try {
		await task.execute();

		grand_total = grand_total.reduce((_, item) => {
			const grand_total = Object.keys(item)
				.filter((key) => key.startsWith('grandtotal_'))
				.reduce((grandAcc, key) => {
					grandAcc[key.replace('grandtotal_', '')] = item[key];
					return grandAcc;
				}, {});
			return grand_total;
		}, {});

		const grand_total_data = Object.entries(fieldName).reduce((acc, el) => {
			acc[el[0]] = CommonHelper.formatNumber(grand_total[el[1]], 2);
			return acc;
		}, {});

		grand_total_data[Object.keys(fieldName)[0]] = 'Total';
		grand_total_data['Net Revenue Cont.'] = '100.00%';
		grand_total_data['Gross Profit Cont.'] = '100.00%';
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
			subject: 'Jarvis : Export GP Report (Summary)',
		});
		await client.connectNewDwh.query(`DROP TABLE ${tmp_table}`);
		logger.info(`${tmp_table} table deleted, by ${context?.user?.email} to ${criteria.send_to_email}`);
	} catch (error) {
		fs.rmSync(outputFile, { force: true });
		logger.error(error);
		throw error;
	}
};
