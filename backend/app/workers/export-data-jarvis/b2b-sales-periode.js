'use strict';

const Q = require('q');

const { Transform } = require('json2csv');
const fs = require('fs');
const AbstractBatchTask = require('sociolla-core/lib/abstract-batch-task');
const { Readable } = require('stream');
const logger = require('sociolla-core/lib/logger').getInstance({ worker: 'b2b-sales-periode' });
const moment = require('moment');
const workerHelpers = require('../../helpers/workerHelper');

class ExportB2BSalesPeriode extends AbstractBatchTask {
	constructor(options) {
		super(options, 'export-b2b-sales-periode');
	}
	getTotalCount() {
		return Q.try(() => {
			return this.options.client.connectDwh.query(this.options.queryCount);
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
			const query = `${this.options.queryRow} LIMIT ${limit} OFFSET ${offset}`;
			return this.options.client.connectDwh.query(query);
		})
			.then((result) => {
				const document = this.options.document;
				const reportType = document.report_type;
				const fieldReportTypeHeader = {
					per_channel: 'Channel',
					per_type: 'Type',
					per_sales_team: 'Sales Team',
					summarize: '',
				};
				const fieldReportType = {
					per_channel: 'group1',
					per_type: 'group2',
					per_sales_team: 'sales_team',
					summarize: '',
				};
				const rows = result.rows || [];
				for (const row of rows) {
					const obj = {};
					if (document.view_point === 'by_brand') {
						obj['Brand'] = row.brand || '';
						obj[fieldReportTypeHeader[reportType]] = row[fieldReportType[reportType]] || '';
					} else if (document.view_point === 'by_team') {
						obj['Team ID'] = row.team_id || '';
						obj['Team'] = row.team_name || '';
						obj[fieldReportTypeHeader[reportType]] = row[fieldReportType[reportType]] || '';
					} else if (document.view_point === 'by_user') {
						obj['User ID'] = row.user_id || '';
						obj['User'] = row.user_name || '';
						obj[fieldReportTypeHeader[reportType]] = row[fieldReportType[reportType]] || '';
					} else if (document.view_point === 'by_group1') {
						obj['Channel'] = row.group1;
					} else if (document.view_point === 'by_group2') {
						obj['Type'] = row.group2;
					} else if (document.view_point === 'by_group3') {
						obj['Sales Team'] = row.group3;
					} else {
						obj['Product ID'] = row.id_product || row.id || '';
						obj['Product Name'] = row.product_name || '';
						obj['Reference'] = row.product_ref || row.reference || '';
						obj['Brand'] = row.brand || '';
						obj[fieldReportTypeHeader[reportType]] = row[fieldReportType[reportType]] || '';
					}

					if (document.period_type && document.period_type === 'period') {
						obj[`QTY ${this.options.period_format}`] = row[`qty_${document.value_type}`] || 0;
						obj[`VALUE ${this.options.period_format}`] = Math.round(
							row[`value_${document.value_type}`] || 0,
						);
						obj[`TRX ${this.options.period_format}`] = row[`trx_${document.value_type}`] || 0;
					} else {
						for (const val of document.period_list) {
							const key =
								document.period_type === 'quarterly_period' ? val.format.toLowerCase() : val.key;
							obj[`qty_${document.value_type}_${key}`] = row[`qty_${document.value_type}_${key}`] || 0;
							obj[`value_${document.value_type}_${key}`] = Math.round(
								row[`value_${document.value_type}_${key}`] || 0,
							);
							obj[`trx_${document.value_type}_${key}`] = row[`trx_${document.value_type}_${key}`] || 0;
						}
					}
					if (document.period_type != 'compare') {
						obj[`total_qty_${document.value_type}`] = row[`qty_${document.value_type}`] || 0;
						obj[`total_value_${document.value_type}`] = Math.round(
							row[`value_${document.value_type}`] || 0,
						);
						obj[`total_trx_${document.value_type}`] = row[`trx_${document.value_type}`] || 0;
					}

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
	logger.info(`[${context?.user?.name} - ${context?.user?.email}] Start jarvis b2b-sales-periode`);

	const outputFile = file_name;
	const reportType = document.report_type;
	const fieldReportTypeHeader = {
		per_channel: 'Channel',
		per_type: 'Type',
		per_sales_team: 'Sales Team',
		summarize: '',
	};
	let fields = [];
	const periodStartDate = moment(document.start_date).format('DD-MMM-YYYY').toUpperCase();
	const periodEndDate = moment(document.end_date).format('DD-MMM-YYYY').toUpperCase();
	const period_format = `${periodStartDate} - ${periodEndDate}`;

	if (document.view_point == 'by_brand') {
		fields = ['Brand', fieldReportTypeHeader[reportType]];
	} else if (document.view_point === 'by_team') {
		fields = ['Team ID', 'Team', fieldReportTypeHeader[reportType]];
	} else if (document.view_point === 'by_user') {
		fields = ['User ID', 'User', fieldReportTypeHeader[reportType]];
	} else if (document.view_point === 'by_group1') {
		fields = ['Channel'];
	} else if (document.view_point === 'by_group2') {
		fields = ['Type'];
	} else if (document.view_point === 'by_group3') {
		fields = ['Sales Team'];
	} else {
		fields = ['Product ID', 'Product Name', 'Reference', 'Brand', fieldReportTypeHeader[reportType]];
	}

	if (reportType === 'summarize' && !['by_group1', 'by_group2', 'by_group3'].includes(document.view_point)) {
		fields.pop();
	}

	if (document.period_type && document.period_type === 'period') {
		fields.push(`QTY ${period_format}`, `VALUE ${period_format}`);
		if (
			document.view_point == 'by_group1' ||
			document.view_point == 'by_group2' ||
			document.view_point == 'by_group3'
		) {
			fields.push(`TRX ${period_format}`);
		}
	} else {
		for (const val of document.period_list) {
			const keys = document.period_type === 'quarterly_period' ? val.format.toLowerCase() : val.key;
			fields.push(`qty_${document.value_type}_${keys}`);
			fields.push(`value_${document.value_type}_${keys}`);
			if (
				document.view_point == 'by_group1' ||
				document.view_point == 'by_group2' ||
				document.view_point == 'by_group3'
			) {
				fields.push(`trx_${document.value_type}_${keys}`);
			}
		}
	}
	if (document.period_type != 'compare') {
		fields.push(`total_qty_${document.value_type}`);
		fields.push(`total_value_${document.value_type}`);
		if (
			document.view_point == 'by_group1' ||
			document.view_point == 'by_group2' ||
			document.view_point == 'by_group3'
		) {
			fields.push(`total_trx_${document.value_type}`);
		}
	}

	const json2csv = new Transform({ fields }, { objectMode: true });
	const output = fs.createWriteStream(outputFile, { flags: 'a' });
	const input = new Readable({ objectMode: true });
	input._read = () => {};
	input.pipe(json2csv).pipe(output);
	const task = new ExportB2BSalesPeriode({
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
		period_format,
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
			subject: 'Export B2B Sales Periode',
		});
	} catch (error) {
		fs.rmSync(outputFile, { force: true });
		logger.error(error);
		throw error;
	}
};
