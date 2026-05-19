'use strict';

const fs = require('fs');
const AbstractBatchTask = require('sociolla-core/lib/abstract-batch-task');
const writeXlsxFile = require('write-excel-file/node');
const logger = require('sociolla-core/lib/logger').getInstance({ worker: 'export-excel-gross-profit-summaries' });
const CommonHelper = require('../../../../helpers/commonHelper');
const workerHelpers = require('../../../../helpers/workerHelper');
const percentFields = ['net_revenue_margin', 'net_revenue_cont', 'gross_profit_margin', 'gross_margin_cont'];

class ExportExcelGrossProfitSummaries extends AbstractBatchTask {
	constructor(options) {
		super(options, 'export-excel-gross-profit-summaries');
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
				for (const row of rows) {
					const data = [];
					for (const val of Object.entries(this.options.fieldName)) {
						let value = row[val[1]];
						const groupOptions = this?.options?.document?.groups || [];
						const isGroupIncluded = groupOptions.includes(val[1]);
						value = isGroupIncluded ? value || 'Undefined' : CommonHelper.formatNumber(value, 0);

						if (percentFields.includes(val[1])) {
							value = value / 100;
						}
						const obj = {
							value,
							borderColor: '#000000',
							type: isGroupIncluded ? String : Number,
							format: isGroupIncluded ? '' : percentFields.includes(val[1]) ? '0.00%' : '#,##0.00',
						};
						data.push(obj);
					}
					self.options.data.push(data);
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
	const document = (criteria.document && JSON.parse(criteria.document)) || {};
	const {
		start_date,
		end_date,
		period_type,
		export_label_filter_option,
		export_label_group_by_option,
		tmp_table,
		groups = [],
		target_types = [],
		order_by_type = 'ASC',
	} = document;
	const clientJarvis = message.clientJarvis;
	const file_name = message.data.file_name || null;
	logger.info(`[${context?.user?.name} - ${context?.user?.email}] Start jarvis excel-gross-profit-summaries`);

	const order_by = document?.order_by || groups.join(' ASC, ');
	const orderBy = `ORDER BY ${order_by} ${order_by_type}`;

	const generateEmptyObj = (len = 1, obj = {}) => {
		const res = [];
		for (let i = 0; i < len; i++) {
			res.push(obj);
		}
		return res;
	};

	const outputFile = file_name;
	let fieldName = {};
	const targetFields = {};

	if (groups?.length) {
		groups.forEach((g) => {
			const tmpKey = g === 'sales_team' ? 'Sales Team/Platform' : CommonHelper.removeUnderscoreAndCapitalize(g);
			fieldName[tmpKey] = g;
		});
	}

	(target_types || []).forEach((t) => {
		const shortcode = CommonHelper.getShortcodeTarget(t);
		const shortLower = shortcode.toLowerCase();

		Object.assign(targetFields, {
			[`Net Revenue Target ${shortcode}. Amount`]: `${shortLower}_amount`,
			[`Net Revenue Target ${shortcode}. Ach.`]: `${shortLower}_ach`,
		});

		percentFields.push(`${shortLower}_ach`);
	});

	fieldName = {
		...fieldName,
		'NMV Before Discount': 'nmv',
		'Disc. By Sociolla': 'total_discount_sociolla',
		'Disc. By Brand': 'total_discount_brand',
		Voucher: 'total_voucher',
		'Net Revenue': 'net_revenue',
		'Net Revenue Margin (NRM)': 'net_revenue_margin',
		'Net Revenue Cont.': 'net_revenue_cont',
		...targetFields,
		'Subtotal COGS': 'cogs',
		'Support Promo': 'total_support_promo',
		'Net COGS': 'net_cogs',
		'Gross Profit': 'gross_margin',
		'Gross Profit Margin (GPM)': 'gross_profit_margin',
		'Gross Profit Cont.': 'gross_margin_cont',
	};

	const TITLE = [
		[
			{
				value: 'GP Report (Summary)',
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
				value: new Date(start_date),
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
				value: new Date(end_date),
				fontWeight: 'bold',
				align: 'left',
				type: Date,
				format: 'dd/mmm/yyyy',
			},
		],
		[
			{
				value: 'Period Type',
				fontWeight: 'bold',
				align: 'left',
			},
			{
				value: CommonHelper.removeUnderscoreAndCapitalize(period_type),
				fontWeight: 'bold',
				align: 'left',
			},
		],
		[
			{
				value: 'Target Type',
				fontWeight: 'bold',
				align: 'left',
			},
			{
				value: (target_types || [])?.map((t) => CommonHelper.removeUnderscoreAndCapitalize(t)).join(' AND '),
				fontWeight: 'bold',
				align: 'left',
			},
		],
		[
			{
				value: 'Filter',
				fontWeight: 'bold',
				align: 'left',
			},
			{
				value: export_label_filter_option,
				fontWeight: 'bold',
				align: 'left',
			},
		],
		[
			{
				value: 'Group By',
				fontWeight: 'bold',
				align: 'left',
			},
			{
				value: export_label_group_by_option,
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

	// Create Temporary Table for processing data
	const queryRow = `CREATE UNLOGGED TABLE IF NOT EXISTS ${tmp_table} AS (${criteria.queryRow})`;
	logger.info(
		`[${context?.user?.name} - ${context?.user?.email}] CREATING TABLE ${tmp_table} by ${context?.user?.email}}`,
	);
	await Promise.resolve(client.connectNewDwh.query(queryRow));

	const task = new ExportExcelGrossProfitSummaries({
		limit: 200,
		offset: 0,
		queryRow: `SELECT * FROM ${tmp_table} ${orderBy}`,
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
	});

	try {
		await task.execute();

		const grand_total = (document?.grand_total || []).reduce((_, item) => {
			const res = Object.keys(item)
				.filter((key) => key.startsWith('grandtotal_'))
				.reduce((grandAcc, key) => {
					grandAcc[key.replace('grandtotal_', '')] = item[key];
					return grandAcc;
				}, {});
			return res;
		}, {});

		grand_total[Object.values(fieldName)[0]] = 'Total';
		const grand_total_data = [];

		Object.entries(fieldName).forEach(([, val], index) => {
			let value = grand_total[val];
			const isGrouped = groups.includes(val);
			const isPercentField = percentFields.includes(val);

			// Apply formatting only if not part of groups
			if (!isGrouped) {
				value = CommonHelper.formatNumber(value, 0);
			}

			// Set specific value for percentage fields
			if (isPercentField) {
				value = value / 100;
			}

			let obj = {
				value,
				borderColor: '#000000',
				borderStyle: 'double',
				fontWeight: 'bold',
				type: isGrouped ? String : Number,
				format: isGrouped ? '' : isPercentField ? '0.00%' : '#,##0.00',
			};

			// Handle rowspan for the first field
			if (index === 0) {
				obj.span = groups?.length;
			} else if (index < groups?.length) {
				obj = null;
			}

			grand_total_data.push(obj);
		});

		data.push(grand_total_data);

		await writeXlsxFile(data, {
			columns,
			filePath: outputFile,
			sheet: 'GP Report (Summary)',
		});
		await workerHelpers.sendmail({
			logger,
			context,
			outputFile,
			fs,
			clientJarvis,
			criteria,
			subject: 'Jarvis : Export GP Report (Summary)',
			is_export_excel: true,
		});
		await client.connectNewDwh.query(`DROP TABLE ${tmp_table}`);
		logger.info(`${tmp_table} table deleted, by ${context?.user?.email} to ${criteria.send_to_email}`);
	} catch (error) {
		fs.rmSync(outputFile, { force: true });
		logger.error(error);
		throw error;
	}
};
